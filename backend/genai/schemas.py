from typing import List, Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# ML → GenAI contract
# ---------------------------------------------------------------------------

Status = Literal["APPROVED", "REJECTED"]
RiskBand = Literal["LOW", "MEDIUM", "HIGH"]
RiskDirection = Literal["increases_risk", "reduces_risk"]


class RiskSummary(BaseModel):
    probability_of_default: float
    risk_band: RiskBand
    risk_score: float


class AffordabilitySummary(BaseModel):
    monthly_income: float
    existing_monthly_emi: float
    max_total_emi: float
    max_affordable_new_emi: float


class OfferScores(BaseModel):
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

    scores: OfferScores
    rank: int


class RiskDriver(BaseModel):
    feature: str
    impact: float
    direction: RiskDirection


class ExplanationResponse(BaseModel):
    eligibility_reasons: List[str] = Field(default_factory=list)
    risk_drivers: List[RiskDriver] = Field(default_factory=list)
    offer_reasons: List[str] = Field(default_factory=list)
    comparative_reasons: List[str] = Field(default_factory=list)


class LoanRecommendationResponse(BaseModel):
    status: Status
    message: str

    risk_summary: Optional[RiskSummary] = None
    affordability_summary: Optional[AffordabilitySummary] = None

    recommendations: List[LoanOffer] = Field(default_factory=list)

    explanation: ExplanationResponse

    request_id: Optional[str] = None


# ---------------------------------------------------------------------------
# GenAI output contract
# ---------------------------------------------------------------------------

class ExplanationOutput(BaseModel):
    positive: List[str] = Field(default_factory=list)
    caution: List[str] = Field(default_factory=list)

    top_factors: List[RiskDriver] = Field(default_factory=list)

    financial_explanation: Optional[str] = None
    eligibility_explanation: Optional[str] = None