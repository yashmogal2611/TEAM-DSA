"""
tests/test_context_builder.py — Phase 3 chatbot unit tests: context builder.
"""

import pytest
from genai.chatbot.context_builder import build_context
from genai.schemas import (
    AffordabilitySummary,
    ExplanationResponse,
    LoanOffer,
    LoanRecommendationResponse,
    OfferScores,
    RiskDriver,
    RiskSummary,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def make_offer(rank: int = 1, product_name: str = "Test Loan") -> LoanOffer:
    return LoanOffer(
        product_id="P001",
        product_name=product_name,
        lender_name="Demo Bank",
        offer_amount=500000.0,
        tenure_months=36,
        base_interest_rate=12.0,
        personalised_rate=11.5,
        monthly_emi=16607.0,
        total_repayment=597852.0,
        total_interest=97852.0,
        processing_fee_pct=1.0,
        processing_fee_amount=5000.0,
        scores=OfferScores(
            need_match=0.9,
            affordability=0.85,
            risk_fit=0.94,
            cost=0.7,
            tenure_preference=1.0,
            composite=0.88,
        ),
        rank=rank,
    )


def make_response(
    status="APPROVED",
    recommendations=None,
    risk_summary=True,
    affordability=True,
    risk_drivers=None,
    eligibility_reasons=None,
    _no_recommendations: bool = False,
    _no_risk_drivers: bool = False,
) -> LoanRecommendationResponse:
    actual_recs = [] if _no_recommendations else (recommendations or [make_offer()])
    actual_drivers = [] if _no_risk_drivers else (risk_drivers or [
        RiskDriver(feature="credit_score", impact=0.04, direction="reduces_risk"),
    ])
    return LoanRecommendationResponse(
        status=status,
        message="Test response",
        risk_summary=RiskSummary(
            probability_of_default=0.025,
            risk_band="LOW",
            risk_score=0.12,
        ) if risk_summary else None,
        affordability_summary=AffordabilitySummary(
            monthly_income=65000.0,
            existing_monthly_emi=5000.0,
            max_total_emi=32500.0,
            max_affordable_new_emi=27500.0,
        ) if affordability else None,
        recommendations=actual_recs,
        explanation=ExplanationResponse(
            eligibility_reasons=eligibility_reasons or ["You meet all criteria."],
            risk_drivers=actual_drivers,
            offer_reasons=["Amount matches range."],
            comparative_reasons=["Best alignment."],
        ),
    )


# ---------------------------------------------------------------------------
# Tests: basic structure
# ---------------------------------------------------------------------------

class TestBuildContextBasicStructure:
    def test_returns_dict(self):
        ctx = build_context(make_response())
        assert isinstance(ctx, dict)

    def test_status_present(self):
        ctx = build_context(make_response(status="APPROVED"))
        assert ctx["status"] == "APPROVED"

    def test_rejected_status(self):
        ctx = build_context(make_response(status="REJECTED"))
        assert ctx["status"] == "REJECTED"


# ---------------------------------------------------------------------------
# Tests: recommendations
# ---------------------------------------------------------------------------

class TestBuildContextRecommendations:
    def test_single_recommendation(self):
        ctx = build_context(make_response())
        assert len(ctx["recommendations"]) == 1

    def test_multiple_recommendations_sorted_by_rank(self):
        offers = [make_offer(rank=2, product_name="Loan B"),
                  make_offer(rank=1, product_name="Loan A")]
        ctx = build_context(make_response(recommendations=offers))
        assert ctx["recommendations"][0]["rank"] == 1
        assert ctx["recommendations"][0]["product_name"] == "Loan A"
        assert ctx["recommendations"][1]["rank"] == 2

    def test_product_name_preserved_exactly(self):
        offers = [make_offer(product_name="XYZ Premium Gold Personal Loan")]
        ctx = build_context(make_response(recommendations=offers))
        assert ctx["recommendations"][0]["product_name"] == "XYZ Premium Gold Personal Loan"

    def test_emi_value_preserved_exactly(self):
        ctx = build_context(make_response())
        assert ctx["recommendations"][0]["monthly_emi"] == 16607.0

    def test_composite_score_preserved(self):
        ctx = build_context(make_response())
        assert ctx["recommendations"][0]["suitability_scores"]["composite"] == 0.88

    def test_no_product_id_in_context(self):
        """Internal IDs should not be exposed."""
        ctx = build_context(make_response())
        assert "product_id" not in ctx["recommendations"][0]


# ---------------------------------------------------------------------------
# Tests: optional sections
# ---------------------------------------------------------------------------

class TestBuildContextOptionalSections:
    def test_risk_summary_present(self):
        ctx = build_context(make_response(risk_summary=True))
        assert "risk" in ctx
        assert ctx["risk"]["risk_band"] == "LOW"
        assert ctx["risk"]["probability_of_default"] == 0.025

    def test_risk_summary_absent(self):
        ctx = build_context(make_response(risk_summary=False))
        assert "risk" not in ctx

    def test_affordability_present(self):
        ctx = build_context(make_response(affordability=True))
        assert "affordability" in ctx
        assert ctx["affordability"]["monthly_income"] == 65000.0

    def test_affordability_absent(self):
        ctx = build_context(make_response(affordability=False))
        assert "affordability" not in ctx

    def test_no_recommendations_omitted(self):
        ctx = build_context(make_response(_no_recommendations=True))
        assert "recommendations" not in ctx

    def test_empty_risk_drivers_omitted(self):
        ctx = build_context(make_response(_no_risk_drivers=True))
        expl = ctx.get("explanation", {})
        assert "risk_drivers" not in expl


# ---------------------------------------------------------------------------
# Tests: explanation section
# ---------------------------------------------------------------------------

class TestBuildContextExplanation:
    def test_risk_driver_feature_present(self):
        ctx = build_context(make_response())
        drivers = ctx["explanation"]["risk_drivers"]
        assert drivers[0]["feature"] == "credit_score"
        assert drivers[0]["direction"] == "reduces_risk"

    def test_risk_driver_raw_impact_not_exposed(self):
        """Raw SHAP impact numbers should NOT appear in context."""
        ctx = build_context(make_response())
        for driver in ctx["explanation"]["risk_drivers"]:
            assert "impact" not in driver

    def test_eligibility_reasons_present(self):
        ctx = build_context(make_response(eligibility_reasons=["Good credit."]))
        assert "Good credit." in ctx["explanation"]["eligibility_reasons"]

    def test_offer_reasons_present(self):
        ctx = build_context(make_response())
        assert "Amount matches range." in ctx["explanation"]["offer_reasons"]
