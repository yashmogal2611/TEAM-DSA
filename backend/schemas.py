from pydantic import BaseModel, Field, EmailStr
from enum import Enum
from typing import List, Optional
from datetime import datetime


# ──────────────────────────────────────────────────────────────
# Existing enums & schemas (unchanged)
# ──────────────────────────────────────────────────────────────
class ProductType(str, Enum):
    personal_loan = "personal_loan"
    home_loan = "home_loan"
    auto_loan = "auto_loan"
    education_loan = "education_loan"


class EmploymentType(str, Enum):
    salaried = "salaried"
    self_employed = "self_employed"
    unemployed = "unemployed"


class LoanRequest(BaseModel):
    full_name: str = Field(..., min_length=1)
    email: str
    phone: str
    credit_score: int = Field(..., ge=300, le=900)
    annual_income: float = Field(..., gt=0)
    employment_type: EmploymentType
    years_employed: float = Field(..., ge=0)
    existing_emi: float = Field(0, ge=0)
    product_type_interest: ProductType
    requested_amount: float = Field(..., gt=0)
    requested_tenure_months: int = Field(..., gt=0)


class RecommendationItem(BaseModel):
    product_type: ProductType
    recommended_amount: float
    recommended_tenure_months: int
    estimated_interest_rate: float
    approval_likelihood: float = Field(..., ge=0, le=1)
    rank: int


class ExplanationFactor(BaseModel):
    factor: str
    impact: str
    detail: str


class LoanResponse(BaseModel):
    recommendations: List[RecommendationItem]
    explanation: List[ExplanationFactor]
    estimated_emi: float


# ──────────────────────────────────────────────────────────────
# NEW: Auth schemas
# ──────────────────────────────────────────────────────────────
class UserRegister(BaseModel):
    full_name: str = Field(..., min_length=2)
    email: str = Field(..., description="Unique user email")
    phone: Optional[str] = None
    password: str = Field(..., min_length=6)


class UserLogin(BaseModel):
    email: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    is_admin: bool


class UserOut(BaseModel):
    id: int
    full_name: str
    email: str
    phone: Optional[str]
    is_admin: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────────────────────
# NEW: Loan application schemas
# ──────────────────────────────────────────────────────────────
class LoanApplicationCreate(BaseModel):
    product_type: ProductType
    requested_amount: float = Field(..., gt=0)
    tenure_months: int = Field(..., gt=0)
    annual_income: Optional[float] = None
    credit_score: Optional[int] = Field(None, ge=300, le=900)
    employment_type: Optional[EmploymentType] = None
    purpose: Optional[str] = None


class LoanApplicationOut(BaseModel):
    id: int
    user_id: int
    applicant_name: Optional[str] = None
    applicant_email: Optional[str] = None
    product_type: str
    requested_amount: float
    tenure_months: int
    annual_income: Optional[float]
    credit_score: Optional[int]
    employment_type: Optional[str]
    purpose: Optional[str]
    status: str          # "pending" | "approved" | "rejected"
    admin_note: Optional[str]
    applied_at: datetime
    reviewed_at: Optional[datetime]

    class Config:
        from_attributes = True


class AdminLoanUpdate(BaseModel):
    status: str = Field(..., pattern="^(approved|rejected)$")
    admin_note: Optional[str] = None


# ──────────────────────────────────────────────────────────────
# NEW: Admin stats schema
# ──────────────────────────────────────────────────────────────
class AdminStats(BaseModel):
    total_applications: int
    pending: int
    approved: int
    rejected: int
    total_users: int
