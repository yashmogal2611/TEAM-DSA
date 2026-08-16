"""
Module 15 — API Schemas
=========================
Pydantic v2 models for request validation and response serialisation.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator


# ── Enums ─────────────────────────────────────────────────────────────────────

class EmploymentType(str, Enum):
    SALARIED = "SALARIED"
    SELF_EMPLOYED = "SELF_EMPLOYED"
    BUSINESS_OWNER = "BUSINESS_OWNER"
    PROFESSIONAL = "PROFESSIONAL"
    OTHER = "OTHER"


class IncomeType(str, Enum):
    FIXED = "FIXED"
    VARIABLE = "VARIABLE"
    MIXED = "MIXED"


class LoanPurpose(str, Enum):
    HOME_RENOVATION = "HOME_RENOVATION"
    MEDICAL = "MEDICAL"
    EDUCATION = "EDUCATION"
    TRAVEL = "TRAVEL"
    WEDDING = "WEDDING"
    DEBT_CONSOLIDATION = "DEBT_CONSOLIDATION"
    BUSINESS = "BUSINESS"
    CONSUMER_DURABLES = "CONSUMER_DURABLES"
    OTHER = "OTHER"


class PrimaryPreference(str, Enum):
    LOWEST_EMI = "LOWEST_EMI"
    LOWEST_TOTAL_COST = "LOWEST_TOTAL_COST"
    SHORTEST_TENURE = "SHORTEST_TENURE"
    REQUIRED_AMOUNT = "REQUIRED_AMOUNT"


# ── Request ───────────────────────────────────────────────────────────────────

class LoanRecommendationRequest(BaseModel):
    # Personal
    age: int = Field(..., ge=18, le=70, description="Customer age in years")
    city: str = Field(..., min_length=2, max_length=100)

    # Employment
    employment_type: EmploymentType
    income_type: IncomeType
    monthly_income: float = Field(..., gt=0, description="Gross monthly income in ₹")
    total_work_experience: float = Field(..., ge=0, description="Total experience in years")
    current_employment_duration: float = Field(..., ge=0, description="Current job tenure in years")

    # Financial obligations
    existing_monthly_emi: float = Field(0.0, ge=0, description="Sum of all existing EMIs in ₹")
    number_of_active_loans: int = Field(0, ge=0)
    credit_card_outstanding: float = Field(0.0, ge=0)

    # Credit
    credit_score: float = Field(..., ge=300, le=900)

    # Loan request
    requested_loan_amount: float = Field(..., gt=0, description="Desired loan amount in ₹")
    preferred_tenure_months: int = Field(..., ge=6, le=360)
    loan_purpose: LoanPurpose
    primary_preference: PrimaryPreference

    @field_validator("loan_purpose", mode="before")
    @classmethod
    def normalize_purpose(cls, v: Any) -> str:
        if isinstance(v, str):
            clean = v.strip().lower()
            mapping = {
                "home_loan": "HOME_RENOVATION",
                "personal_loan": "OTHER",
                "vehicle_loan": "CONSUMER_DURABLES",
                "gold_loan": "OTHER",
                "education_loan": "EDUCATION",
                "business_loan": "BUSINESS",
            }
            if clean in mapping:
                return mapping[clean]
            upper = v.strip().upper()
            valid_keys = {e.value for e in LoanPurpose}
            if upper in valid_keys:
                return upper
        return "OTHER"

    @field_validator("city")
    @classmethod
    def strip_city(cls, v: str) -> str:
        return v.strip().title()

    @model_validator(mode="after")
    def cross_field_checks(self) -> "LoanRecommendationRequest":
        if self.existing_monthly_emi >= self.monthly_income:
            raise ValueError(
                "existing_monthly_emi must be less than monthly_income."
            )
        if self.current_employment_duration > self.total_work_experience:
            raise ValueError(
                "current_employment_duration cannot exceed total_work_experience."
            )
        return self

    model_config = {"use_enum_values": True}


# ── Nested response models ────────────────────────────────────────────────────

class ScoreBreakdown(BaseModel):
    need_match: float
    affordability: float
    risk_fit: float
    cost: float
    tenure_preference: float
    composite: float


class LoanOffer(BaseModel):
    product_id: str
    product_name: str
    lender_name: str
    offer_amount: float
    tenure_months: int
    base_interest_rate: float
    personalised_rate: float
    monthly_emi: float
    total_repayment: float
    total_interest: float
    processing_fee_pct: float
    processing_fee_amount: float
    scores: ScoreBreakdown
    rank: int


class RiskSummary(BaseModel):
    probability_of_default: float
    risk_band: str
    risk_score: float


class AffordabilitySummary(BaseModel):
    monthly_income: float
    existing_monthly_emi: float
    max_total_emi: float
    max_affordable_new_emi: float


class ExplanationResponse(BaseModel):
    eligibility_reasons: list[str]
    risk_drivers: list[dict]
    offer_reasons: list[str]
    comparative_reasons: list[str]


class LoanRecommendationResponse(BaseModel):
    status: str                         # APPROVED | REJECTED
    message: str
    risk_summary: Optional[RiskSummary] = None
    affordability_summary: Optional[AffordabilitySummary] = None
    recommendations: list[LoanOffer] = []
    explanation: Optional[ExplanationResponse] = None
    request_id: Optional[str] = None


# ── Health check ──────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    version: str
    models_loaded: dict[str, bool]
