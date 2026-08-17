"""
routers/auth_router.py  (rewritten cleanly)
Endpoints: /auth/register, /auth/login, /auth/me
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

try:
    from ..database import User, get_db
    from ..schemas import UserRegister, UserLogin, Token, UserOut
    from ..auth import hash_password, verify_password, create_access_token, get_current_user
except ImportError:
    from database import User, get_db
    from schemas import UserRegister, UserLogin, Token, UserOut
    from auth import hash_password, verify_password, create_access_token, get_current_user

from sqlalchemy import func

router = APIRouter(prefix="/auth", tags=["Authentication"])


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
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ── POST /auth/login ──────────────────────────────────────────
@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    """
    Authenticate with email + password.
    Returns a JWT bearer token.  is_admin tells the client which UI to show.
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
    token = create_access_token({"sub": str(user.id)})
    return Token(
        access_token=token,
        token_type="bearer",
        is_admin=user.is_admin,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
    )


# ── GET /auth/me ──────────────────────────────────────────────
@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    """Return the profile of the currently authenticated user."""
    return current_user
