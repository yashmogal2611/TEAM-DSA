"""
auth.py – JWT token creation / verification + password hashing.
Uses bcrypt directly (avoids passlib/bcrypt version mismatch on Python 3.14).
"""
import warnings
import bcrypt as _bcrypt
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

try:
    from .database import User, Bank, get_db
except ImportError:
    from database import User, Bank, get_db

# Silence passlib's cosmetic bcrypt-version warning if passlib is loaded elsewhere
warnings.filterwarnings("ignore", ".*error reading bcrypt version.*")

# ── Secret & algorithm ────────────────────────────────────────
# ⚠️  Change SECRET_KEY to a long random string before deploying to production!
SECRET_KEY = "CHANGE_THIS_SECRET_KEY_BEFORE_PRODUCTION_32chars+"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# ── OAuth2 token bearer ───────────────────────────────────────
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# ──────────────────────────────────────────────────────────────
# Password & Passkey helpers (using bcrypt directly)
# ──────────────────────────────────────────────────────────────
def hash_password(plain: str) -> str:
    """Hash a plain-text password or passkey with bcrypt (salt auto-generated)."""
    return _bcrypt.hashpw(plain.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if `plain` matches the stored `hashed` password."""
    try:
        return _bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def verify_bank_passkey(plain_passkey: str, hashed_passkey: str) -> bool:
    """Return True if `plain_passkey` matches the bank's stored hashed passkey."""
    try:
        return _bcrypt.checkpw(plain_passkey.encode("utf-8"), hashed_passkey.encode("utf-8"))
    except Exception:
        return False


# ──────────────────────────────────────────────────────────────
# JWT helpers
# ──────────────────────────────────────────────────────────────
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ──────────────────────────────────────────────────────────────
# Bank Admin Context & Scoping
# ──────────────────────────────────────────────────────────────
class BankAdminContext:
    """
    Encapsulates the authenticated bank administrator and their strictly bound bank institution.
    """
    def __init__(self, user: User, bank: Bank):
        self.user = user
        self.id = user.id
        self.user_id = user.id
        self.email = user.email
        self.full_name = user.full_name
        self.is_admin = user.is_admin
        self.role = user.role or "bank_admin"
        self.bank_id = bank.id
        self.bank_name = bank.bank_name
        self.bank_code = bank.bank_code
        self.bank = bank

    def __getattr__(self, name):
        return getattr(self.user, name)


# ──────────────────────────────────────────────────────────────
# FastAPI dependencies
# ──────────────────────────────────────────────────────────────
def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_token(token)
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")
    return user


def get_current_bank_admin(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> BankAdminContext:
    """
    Validates that the authenticated user is an active administrator,
    cross-references the token claims against the admin's database-assigned bank,
    and returns a BankAdminContext enforcing multi-tenant isolation.
    """
    payload = decode_token(token)
    user_id = payload.get("sub")
    token_bank_id = payload.get("bank_id")

    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token claims")

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    # Resolve assigned bank
    bank = None
    if user.assigned_bank_id:
        bank = db.query(Bank).filter(Bank.id == user.assigned_bank_id, Bank.is_active == True).first()

    if not bank:
        # Fallback to first active bank if legacy admin
        bank = db.query(Bank).filter(Bank.is_active == True).first()
        if not bank:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No active bank institution registered.")

    # Cross-check token bank_id if present
    if token_bank_id and int(token_bank_id) != bank.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Violation: Token bank identifier does not match assigned bank organization."
        )

    return BankAdminContext(user=user, bank=bank)


def get_current_admin(admin_ctx: BankAdminContext = Depends(get_current_bank_admin)) -> BankAdminContext:
    """Alias for get_current_bank_admin to preserve existing router dependencies while enforcing bank isolation."""
    return admin_ctx
