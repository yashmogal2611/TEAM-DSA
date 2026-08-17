from pydantic import BaseModel, Field, EmailStr, field_validator
from enum import Enum
from typing import List, Optional, Dict, Any
from datetime import datetime


# ──────────────────────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────────────────────
class ProductType(str, Enum):
    personal_loan = "personal_loan"
    home_loan = "home_loan"
    vehicle_loan = "vehicle_loan"
    education_loan = "education_loan"
    business_loan = "business_loan"
    gold_loan = "gold_loan"
    auto_loan = "auto_loan" # alias support


class EmploymentType(str, Enum):
    salaried = "salaried"
    self_employed = "self_employed"
    business_owner = "business_owner"
    student = "student"
    homemaker = "homemaker"
    retired = "retired"
    unemployed = "unemployed"
    other = "other"


class BusinessType(str, Enum):
    proprietorship = "proprietorship"
    partnership = "partnership"
    pvt_ltd = "pvt_ltd"
    llp = "llp"
    other = "other"


class VehicleCondition(str, Enum):
    new = "new"
    used = "used"


class PropertyType(str, Enum):
    ready_to_move = "ready_to_move"
    under_construction = "under_construction"
    resale = "resale"
    plot_construction = "plot_construction"


class DocumentCategory(str, Enum):
    kyc = "kyc"
    income = "income"
    bank = "bank"
    loan_specific = "loan_specific"
    collateral = "collateral"
    co_applicant = "co_applicant"
    other = "other"


# ──────────────────────────────────────────────────────────────
# Legacy Schemas (kept for backward compatibility)
# ──────────────────────────────────────────────────────────────
class LoanRequest(BaseModel):
    full_name: str = Field(..., min_length=1)
    email: str
    phone: str
    credit_score: int = Field(..., ge=300, le=900)
    annual_income: float = Field(..., gt=0)
    employment_type: str
    years_employed: float = Field(..., ge=0)
    existing_emi: float = Field(0, ge=0)
    product_type_interest: str
    requested_amount: float = Field(..., gt=0)
    requested_tenure_months: int = Field(..., gt=0)


class RecommendationItem(BaseModel):
    product_type: str
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
# User & Auth Schemas
# ──────────────────────────────────────────────────────────────
class UserRegister(BaseModel):
    full_name: str = Field(..., min_length=1)
    email: str = Field(..., min_length=3, description="Unique user email")
    phone: Optional[str] = None
    password: str = Field(..., min_length=6)

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        s = (v or "").strip().lower()
        if not s or "@" not in s or "." not in s.split("@")[-1]:
            raise ValueError("Invalid email format")
        return s

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("Full name cannot be empty")
        return s


class UserLogin(BaseModel):
    email: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)

    @field_validator("email")
    @classmethod
    def validate_email_login(cls, v: str) -> str:
        s = (v or "").strip().lower()
        if not s:
            raise ValueError("Email cannot be empty")
        return s


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    is_admin: bool
    user_id: int
    email: str
    full_name: str


class UserOut(BaseModel):
    id: int
    full_name: str
    email: str
    phone: Optional[str] = None
    is_admin: bool
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────────────────────
# Document Schemas
# ──────────────────────────────────────────────────────────────
class DocumentOut(BaseModel):
    id: int
    loan_application_id: int
    user_id: int
    doc_category: str
    doc_type: str
    original_filename: str
    file_size_bytes: int
    mime_type: Optional[str] = None
    verification_status: str # pending, verified, rejected
    verification_note: Optional[str] = None
    uploaded_at: datetime
    verified_at: Optional[datetime] = None
    download_url: Optional[str] = None
    view_url: Optional[str] = None

    class Config:
        from_attributes = True


class DocumentVerifyPayload(BaseModel):
    verification_status: str = Field(..., pattern="^(verified|rejected|pending)$")
    verification_note: Optional[str] = None


# ──────────────────────────────────────────────────────────────
# Scheme Rules Schema (Implementation Schema as requested)
# ──────────────────────────────────────────────────────────────
class LoanSchemeRuleOut(BaseModel):
    id: int
    loan_type: str
    display_name: str
    age_requirement: str
    min_age: int
    max_age: int
    employment_requirement: str
    income_requirement: str
    min_annual_income: float
    credit_requirement: str
    min_credit_score: int
    repayment_requirement: str
    max_foir_percentage: float
    purpose_requirement: str
    collateral_requirement: str
    co_applicant_requirement: str
    down_payment_requirement: str
    min_down_payment_percentage: float
    kyc_documents: str
    income_documents: str
    bank_documents: str
    loan_specific_documents: str
    collateral_documents: str
    base_interest_rate: float
    min_amount: float
    max_amount: float
    min_tenure_months: int
    max_tenure_months: int
    source_url: str
    last_verified: str

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────────────────────
# Eligibility Engine Schemas
# ──────────────────────────────────────────────────────────────
class EligibilityCheckRequest(BaseModel):
    age: Optional[int] = Field(25, ge=16, le=100)
    employment_type: Optional[str] = "salaried"
    annual_income: Optional[float] = Field(600000.0, ge=0)
    monthly_income: Optional[float] = None
    experience_years: Optional[float] = Field(2.0, ge=0)
    credit_score: Optional[int] = Field(720, ge=300, le=900)
    existing_emi: Optional[float] = Field(0.0, ge=0)
    loan_purpose: Optional[str] = None
    requested_amount: Optional[float] = Field(500000.0, gt=0)
    preferred_tenure_months: Optional[int] = Field(36, gt=0)
    
    # Specifics
    target_loan_type: Optional[str] = None # if checking a specific scheme or None for all
    has_co_applicant: Optional[bool] = False
    co_applicant_income: Optional[float] = 0.0
    collateral_available: Optional[bool] = False
    collateral_estimated_value: Optional[float] = 0.0
    down_payment_amount: Optional[float] = 0.0
    
    # Specific sub-attributes
    vehicle_is_new: Optional[bool] = True
    vehicle_on_road_price: Optional[float] = None
    gold_weight_grams: Optional[float] = None
    gold_purity_karats: Optional[float] = None
    business_vintage_years: Optional[float] = None
    annual_turnover: Optional[float] = None
    property_value: Optional[float] = None


class EligibleLoanItem(BaseModel):
    loan_type: str
    display_name: str
    is_eligible: bool
    eligibility_status: str # eligible, conditionally_eligible, ineligible
    match_score: float # 0 to 100
    estimated_interest_rate: float
    estimated_monthly_emi: float
    max_eligible_amount: float
    recommended_tenure_months: int
    foir_percentage: float
    reasons: List[str]
    missing_criteria: List[str]
    required_documents_checklist: Dict[str, List[str]]
    source_url: str
    last_verified: str


class EligibilityCheckResponse(BaseModel):
    consumer_summary: Dict[str, Any]
    ranked_eligible_loans: List[EligibleLoanItem]
    ineligible_loans: List[EligibleLoanItem]
    personalized_advice: List[str]


# ──────────────────────────────────────────────────────────────
# Loan Application Creation & Output
# ──────────────────────────────────────────────────────────────
class LoanApplicationCreate(BaseModel):
    product_type: str = Field(..., description="personal_loan | home_loan | vehicle_loan | education_loan | business_loan | gold_loan")
    requested_amount: float = Field(..., gt=0)
    tenure_months: int = Field(..., gt=0)
    purpose: Optional[str] = None

    # Consumer Details
    age: Optional[int] = Field(None, ge=16, le=100)
    annual_income: Optional[float] = Field(None, ge=0)
    monthly_income: Optional[float] = Field(None, ge=0)
    employment_type: Optional[str] = "salaried"
    experience_years: Optional[float] = Field(None, ge=0)
    credit_score: Optional[int] = Field(None, ge=300, le=900)
    existing_emi: Optional[float] = Field(0.0, ge=0)

    # Co-applicant
    has_co_applicant: Optional[bool] = False
    co_applicant_name: Optional[str] = None
    co_applicant_relation: Optional[str] = None
    co_applicant_income: Optional[float] = None
    co_applicant_pan: Optional[str] = None

    # Collateral
    collateral_available: Optional[bool] = False
    collateral_type: Optional[str] = None
    collateral_estimated_value: Optional[float] = None
    down_payment_amount: Optional[float] = 0.0

    # 1. Vehicle / Car Loan specifics
    vehicle_type: Optional[str] = None # "new" | "used"
    vehicle_make_model: Optional[str] = None
    vehicle_on_road_price: Optional[float] = None
    vehicle_quotation_amount: Optional[float] = None
    dealer_name: Optional[str] = None

    # 2. Education Loan specifics
    institution_name: Optional[str] = None
    course_name: Optional[str] = None
    course_country: Optional[str] = None
    course_duration_months: Optional[int] = None
    admission_confirmed: Optional[bool] = None
    total_fee_estimate: Optional[float] = None

    # 3. Business / MSME Loan specifics
    business_name: Optional[str] = None
    business_type: Optional[str] = None
    business_vintage_years: Optional[float] = None
    annual_turnover: Optional[float] = None
    gst_number: Optional[str] = None
    is_gst_registered: Optional[bool] = None

    # 4. Gold Loan specifics
    gold_weight_grams: Optional[float] = None
    gold_purity_karats: Optional[float] = None
    gold_item_description: Optional[str] = None
    estimated_gold_market_value: Optional[float] = None

    # 5. Home Loan specifics
    property_type: Optional[str] = None
    property_value: Optional[float] = None
    property_city: Optional[str] = None
    property_address: Optional[str] = None


class LoanApplicationOut(BaseModel):
    id: int
    user_id: int
    applicant_name: Optional[str] = None
    applicant_email: Optional[str] = None
    applicant_phone: Optional[str] = None

    product_type: str
    requested_amount: float
    tenure_months: int
    purpose: Optional[str] = None

    age: Optional[int] = None
    annual_income: Optional[float] = None
    monthly_income: Optional[float] = None
    employment_type: Optional[str] = None
    experience_years: Optional[float] = None
    credit_score: Optional[int] = None
    existing_emi: Optional[float] = 0.0

    has_co_applicant: Optional[bool] = False
    co_applicant_name: Optional[str] = None
    co_applicant_relation: Optional[str] = None
    co_applicant_income: Optional[float] = None
    co_applicant_pan: Optional[str] = None

    collateral_available: Optional[bool] = False
    collateral_type: Optional[str] = None
    collateral_estimated_value: Optional[float] = None
    down_payment_amount: Optional[float] = 0.0

    # Specifics
    vehicle_type: Optional[str] = None
    vehicle_make_model: Optional[str] = None
    vehicle_on_road_price: Optional[float] = None
    vehicle_quotation_amount: Optional[float] = None
    dealer_name: Optional[str] = None

    institution_name: Optional[str] = None
    course_name: Optional[str] = None
    course_country: Optional[str] = None
    course_duration_months: Optional[int] = None
    admission_confirmed: Optional[bool] = None
    total_fee_estimate: Optional[float] = None

    business_name: Optional[str] = None
    business_type: Optional[str] = None
    business_vintage_years: Optional[float] = None
    annual_turnover: Optional[float] = None
    gst_number: Optional[str] = None
    is_gst_registered: Optional[bool] = None

    gold_weight_grams: Optional[float] = None
    gold_purity_karats: Optional[float] = None
    gold_item_description: Optional[str] = None
    estimated_gold_market_value: Optional[float] = None

    property_type: Optional[str] = None
    property_value: Optional[float] = None
    property_city: Optional[str] = None
    property_address: Optional[str] = None

    status: str # pending, under_review, approved, rejected
    admin_note: Optional[str] = None
    interest_rate_offered: Optional[float] = None
    sanctioned_amount: Optional[float] = None
    estimated_emi: Optional[float] = None
    
    eligibility_status: Optional[str] = "eligible"
    eligibility_score: Optional[float] = 80.0
    eligibility_remarks: Optional[str] = None

    applied_at: datetime
    reviewed_at: Optional[datetime] = None
    
    # Nested documents list
    documents: List[DocumentOut] = []

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────────────────────
# Admin Actions & Stats
# ──────────────────────────────────────────────────────────────
class AdminLoanUpdate(BaseModel):
    status: Optional[str] = Field("approved", pattern="^(approved|rejected|under_review|pending)$")
    admin_note: Optional[str] = None
    sanctioned_amount: Optional[float] = None
    interest_rate_offered: Optional[float] = None


class AdminStats(BaseModel):
    total_applications: int
    pending: int
    under_review: int
    approved: int
    rejected: int
    total_users: int
    total_documents: int
    applications_by_type: Dict[str, int]
    total_requested_volume: float
    total_approved_volume: float
