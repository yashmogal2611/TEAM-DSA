"""
routers/auth_router.py
Endpoints:
- /auth/register     – User registration
- /auth/login        – Standard login (Borrowers & Dual-mode)
- /auth/admin-login  – 3-Factor Bank Admin Login (email + password + bank passkey)
- /auth/banks        – Public directory of registered partner banks
- /auth/me           – Current authenticated profile
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

try:
    from ..database import User, Bank, get_db
    from ..schemas import UserRegister, UserLogin, BankAdminLogin, BankOut, Token, UserOut
    from ..auth import (
        hash_password,
        verify_password,
        verify_bank_passkey,
        create_access_token,
        get_current_user,
    )
except ImportError:
    from database import User, Bank, get_db
    from schemas import UserRegister, UserLogin, BankAdminLogin, BankOut, Token, UserOut
    from auth import (
        hash_password,
        verify_password,
        verify_bank_passkey,
        create_access_token,
        get_current_user,
    )

router = APIRouter(prefix="/auth", tags=["Authentication & Multi-Tenant Access"])


# ── GET /auth/banks ───────────────────────────────────────────
@router.get("/banks", response_model=List[BankOut])
def list_partner_banks(db: Session = Depends(get_db)):
    """
    Public directory of registered partner banks (SBI, HDFC, ICICI, etc.).
    Returns public identifiers without sensitive passkey hashes.
    """
    banks = db.query(Bank).filter(Bank.is_active == True).order_by(Bank.bank_name.asc()).all()
    return banks


# ── POST /auth/register ───────────────────────────────────────
@router.post("/register", response_model=UserOut, status_code=201)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    """Create a new regular user account."""
    clean_email = payload.email.strip().lower()
    existing = db.query(User).filter(func.lower(func.trim(User.email)) == clean_email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already registered. Please login instead.",
        )
    user = User(
        full_name=payload.full_name.strip(),
        email=clean_email,
        phone=payload.phone.strip() if payload.phone else None,
        hashed_password=hash_password(payload.password),
        is_admin=False,
        role="borrower",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ── POST /auth/login ──────────────────────────────────────────
@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    """
    Authenticate with email + password (and optional bank passkey).
    Returns a scoped JWT bearer token.
    """
    clean_email = payload.email.strip().lower() if payload.email else ""
    user = db.query(User).filter(func.lower(func.trim(User.email)) == clean_email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been disabled. Contact support.",
        )

    bank_id = None
    bank_name = None
    bank_code = None
    is_system_admin = False

    # If the user is an admin, resolve their bank scope
    if user.is_admin:
        is_system_admin = (
            user.role in ["super_admin", "system_admin", "admin"]
            or user.email == "admin@loanapp.com"
            or not user.assigned_bank_id
        )

        assigned_bank = None
        if user.assigned_bank_id:
            assigned_bank = db.query(Bank).filter(Bank.id == user.assigned_bank_id, Bank.is_active == True).first()

        # If a bank passkey was supplied, cross-check it
        if payload.bank_passkey and assigned_bank:
            if not verify_bank_passkey(payload.bank_passkey, assigned_bank.passkey_hash):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Invalid bank passkey for {assigned_bank.bank_name}.",
                )

        if assigned_bank and not is_system_admin:
            bank_id = assigned_bank.id
            bank_name = assigned_bank.bank_name
            bank_code = assigned_bank.bank_code
        else:
            bank_id = None
            bank_name = "All Partner Banks (System Portal)"
            bank_code = "SYSTEM"

    token_claims = {
        "sub": str(user.id),
        "is_admin": user.is_admin,
        "is_system_admin": is_system_admin,
        "role": user.role or ("super_admin" if is_system_admin else ("bank_admin" if user.is_admin else "borrower")),
    }
    if bank_id:
        token_claims["bank_id"] = bank_id
        token_claims["bank_name"] = bank_name
        token_claims["bank_code"] = bank_code

    token = create_access_token(token_claims)
    return Token(
        access_token=token,
        token_type="bearer",
        is_admin=user.is_admin,
        is_system_admin=is_system_admin,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        bank_id=bank_id,
        bank_name=bank_name,
        bank_code=bank_code,
        role=user.role or ("super_admin" if is_system_admin else ("bank_admin" if user.is_admin else "borrower")),
    )


# ── POST /auth/admin-login ────────────────────────────────────
@router.post("/admin-login", response_model=Token)
def admin_login(payload: BankAdminLogin, db: Session = Depends(get_db)):
    """
    3-Factor Bank Admin Authentication:
    1. Cross-checks email & password against admin user account.
    2. Validates administrator authorization (is_admin == True).
    3. Cross-checks the supplied bank_passkey strictly against the admin's database-assigned bank.
       (Rejects if the passkey belongs to a different bank or is invalid).
    """
    clean_email = payload.email.strip().lower() if payload.email else ""
    user = db.query(User).filter(func.lower(func.trim(User.email)) == clean_email).first()

    # Step 1 & 2: User identity & password verification
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials (email or password)",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin account has been deactivated.",
        )
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Standard borrower accounts cannot access bank administration.",
        )

    # Step 3: Resolve Assigned Bank & Cross-Check Passkey
    assigned_bank = None
    if user.assigned_bank_id:
        assigned_bank = db.query(Bank).filter(Bank.id == user.assigned_bank_id, Bank.is_active == True).first()
    
    if not assigned_bank:
        # Fallback to default bank if legacy admin
        assigned_bank = db.query(Bank).filter(Bank.is_active == True).first()
        if not assigned_bank:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No active partner banks configured on server.",
            )

    # Cryptographic Passkey Cross-Check against Assigned Bank
    if not verify_bank_passkey(payload.bank_passkey, assigned_bank.passkey_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Bank Passkey for assigned institution '{assigned_bank.bank_name}'. Access rejected.",
        )

    # Step 4: Issue Bank-Scoped JWT Token
    token_claims = {
        "sub": str(user.id),
        "is_admin": True,
        "role": "bank_admin",
        "bank_id": assigned_bank.id,
        "bank_name": assigned_bank.bank_name,
        "bank_code": assigned_bank.bank_code,
    }
    token = create_access_token(token_claims)

    return Token(
        access_token=token,
        token_type="bearer",
        is_admin=True,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        bank_id=assigned_bank.id,
        bank_name=assigned_bank.bank_name,
        bank_code=assigned_bank.bank_code,
        role="bank_admin",
    )


# ── GET /auth/me ──────────────────────────────────────────────
@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return the profile of the currently authenticated user with bank tenant metadata."""
    out = UserOut.model_validate(current_user)
    if current_user.assigned_bank_id:
        b = db.query(Bank).filter(Bank.id == current_user.assigned_bank_id).first()
        if b:
            out.bank_name = b.bank_name
    return out
