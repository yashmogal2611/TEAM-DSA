"""
context_builder.py — Phase 3: Grounded Chatbot

Responsibility: Build the chatbot context dict from a LoanRecommendationResponse.

TRUST BOUNDARY — READ CAREFULLY
--------------------------------
This module operates in a "backend-grounded" model, NOT a fully-verified model.
Here is the precise classification of every field in the output context dict:

BACKEND-REGENERATED (one field):
  explanation.risk_drivers
    The chat router calls generate_shap_explanation() (Phase 1 engine) before
    calling build_context(). That engine filters and re-sorts the incoming
    risk_drivers by absolute impact threshold (MIN_SHAP_IMPORTANCE) and count
    cap (TOP_SHAP_FEATURES). The feature/impact/direction values on each
    RiskDriver still originate from the incoming payload, but the selection,
    ordering, and filtering are performed by backend code.
    The raw SHAP impact number is intentionally omitted from the context dict
    (direction only is exposed).

SCHEMA-VALIDATED, ML-PIPELINE-SOURCED (all other fields):
  These fields are read directly from the LoanRecommendationResponse that the
  frontend supplied. They are validated by Pydantic (type, range, enum), but
  their VALUES originate from the ML pipeline response the client sent.

  status                          — LoanRecommendationResponse.status
  risk_band / probability / score — LoanRecommendationResponse.risk_summary.*
  monthly_income                  — affordability_summary.monthly_income
  existing_monthly_emi            — affordability_summary.existing_monthly_emi
  max_total_emi                   — affordability_summary.max_total_emi
  max_affordable_new_emi          — affordability_summary.max_affordable_new_emi
  rank                            — LoanOffer.rank
  product_name                    — LoanOffer.product_name
  lender_name                     — LoanOffer.lender_name
  offer_amount                    — LoanOffer.offer_amount
  tenure_months                   — LoanOffer.tenure_months
  personalised_rate_pct           — LoanOffer.personalised_rate
  monthly_emi                     — LoanOffer.monthly_emi
  total_repayment                 — LoanOffer.total_repayment
  total_interest                  — LoanOffer.total_interest
  processing_fee_amount           — LoanOffer.processing_fee_amount
  suitability_scores.*            — LoanOffer.scores.* (all six sub-scores)
  eligibility_reasons             — ExplanationResponse.eligibility_reasons
  offer_reasons                   — ExplanationResponse.offer_reasons
  comparative_reasons             — ExplanationResponse.comparative_reasons

NOT AVAILABLE IN CONTEXT:
  DTI (debt-to-income ratio as a standalone field)
    Not present in LoanRecommendationResponse as a direct field. An EMI ratio
    is computed inside explain_affordability() for the affordability TEXT only;
    it is not exposed as a numeric field in the context dict.

WHY THIS IS ACCEPTABLE FOR THIS HACKATHON:
  The existing LoanLens backend does not persist ML recommendation results.
  The /explanation (Phase 1) and /summarize (Phase 2) endpoints already follow
  the same pattern: they accept the LoanRecommendationResponse from the caller
  and treat its values as authoritative. The chatbot is consistent with that
  established architecture.

  The Pydantic schema enforces structural correctness (types, valid enums,
  field presence). The system prompt instructs Gemini to treat all context
  values as data, not instructions. The fallback reads the same context dict
  deterministically.

  This is a "backend-grounded" context, not a "fully-verified" context.

Rules enforced in this module:
- Do NOT calculate or derive new values.
- Do NOT expose internal IDs (product_id is excluded).
- Do NOT expose raw SHAP impact numbers (direction only is included).
- Omit optional sections when absent (None / empty lists).
- Preserve all numerical values exactly as received.
"""

from __future__ import annotations

from typing import Any, Dict

from genai.schemas import LoanOffer, LoanRecommendationResponse, RiskDriver


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def build_context(data: LoanRecommendationResponse) -> Dict[str, Any]:
    """
    Build a minimal, backend-grounded context dict from a
    LoanRecommendationResponse.

    This dict is the sole source of facts injected into the Gemini prompt
    and the deterministic fallback. Values originate from the ML pipeline
    response supplied to the endpoint and are validated by Pydantic.
    The risk_drivers section reflects the Phase 1 backend engine's output
    (filtered/re-sorted by the chat router before this function is called).

    See the module-level docstring for the complete per-field trust classification.

    Args:
        data: A Pydantic-validated LoanRecommendationResponse. In the /chat
              endpoint this object has its risk_drivers replaced by the
              Phase 1 engine's output before being passed here.

    Returns:
        A JSON-serializable dict suitable for injection into a Gemini prompt.
    """

    ctx: Dict[str, Any] = {
        # ML-pipeline-sourced, enum-validated by Pydantic ("APPROVED"/"REJECTED")
        "status": data.status,
    }

    # --- Risk summary (optional, ML-pipeline-sourced) --------------------
    if data.risk_summary is not None:
        ctx["risk"] = {
            "risk_band": data.risk_summary.risk_band,
            "probability_of_default": data.risk_summary.probability_of_default,
            "risk_score": data.risk_summary.risk_score,
        }

    # --- Affordability (optional, ML-pipeline-sourced) -------------------
    if data.affordability_summary is not None:
        aff = data.affordability_summary
        ctx["affordability"] = {
            "monthly_income": aff.monthly_income,
            "existing_monthly_emi": aff.existing_monthly_emi,
            "max_total_emi": aff.max_total_emi,
            "max_affordable_new_emi": aff.max_affordable_new_emi,
        }
        # Note: DTI is not available as a standalone field in this response.

    # --- Recommendations (ML-pipeline-sourced, ranked list) --------------
    if data.recommendations:
        ctx["recommendations"] = [
            _build_offer_context(offer)
            for offer in sorted(data.recommendations, key=lambda o: o.rank)
        ]

    # --- Explanation section ---------------------------------------------
    exp = data.explanation
    explanation_ctx: Dict[str, Any] = {}

    # risk_drivers: backend-regenerated by the Phase 1 engine in the chat
    # router before this function is called. Values (feature/direction) still
    # originate from the incoming payload, but selection/ordering is backend.
    if exp.risk_drivers:
        explanation_ctx["risk_drivers"] = [
            _build_driver_context(d) for d in exp.risk_drivers
        ]

    # eligibility_reasons: ML-pipeline-sourced, passed through unchanged.
    if exp.eligibility_reasons:
        explanation_ctx["eligibility_reasons"] = exp.eligibility_reasons

    # offer_reasons: ML-pipeline-sourced, passed through unchanged.
    if exp.offer_reasons:
        explanation_ctx["offer_reasons"] = exp.offer_reasons

    # comparative_reasons: ML-pipeline-sourced, passed through unchanged.
    if exp.comparative_reasons:
        explanation_ctx["comparative_reasons"] = exp.comparative_reasons

    if explanation_ctx:
        ctx["explanation"] = explanation_ctx

    return ctx


# ---------------------------------------------------------------------------
# Internal helpers — each produces a plain dict
# ---------------------------------------------------------------------------

def _build_offer_context(offer: LoanOffer) -> Dict[str, Any]:
    """
    Serialize a single ranked loan offer into a context-safe dict.

    All values are ML-pipeline-sourced and Pydantic-validated.
    product_id is intentionally excluded (internal field not needed by Gemini).
    EMI ratio is not computed here; it exists only in the affordability
    text generated by explain_affordability() in Phase 1.
    """
    return {
        "rank": offer.rank,                          # ML-pipeline-sourced
        "product_name": offer.product_name,          # ML-pipeline-sourced
        "lender_name": offer.lender_name,            # ML-pipeline-sourced
        "offer_amount": offer.offer_amount,          # ML-pipeline-sourced
        "tenure_months": offer.tenure_months,        # ML-pipeline-sourced
        "personalised_rate_pct": offer.personalised_rate,   # ML-pipeline-sourced
        "monthly_emi": offer.monthly_emi,            # ML-pipeline-sourced
        "total_repayment": offer.total_repayment,    # ML-pipeline-sourced
        "total_interest": offer.total_interest,      # ML-pipeline-sourced
        "processing_fee_amount": offer.processing_fee_amount,  # ML-pipeline-sourced
        "suitability_scores": {                      # all ML-pipeline-sourced
            "composite": offer.scores.composite,
            "affordability": offer.scores.affordability,
            "risk_fit": offer.scores.risk_fit,
            "need_match": offer.scores.need_match,
            "cost": offer.scores.cost,
            "tenure_preference": offer.scores.tenure_preference,
        },
    }


def _build_driver_context(driver: RiskDriver) -> Dict[str, Any]:
    """
    Serialize a risk driver into a context-safe dict.

    feature and direction values are ML-pipeline-sourced (they originate
    from the incoming payload). The selection and ordering of which drivers
    appear here was performed by the Phase 1 backend engine in the chat
    router (generate_shap_explanation → rank_risk_drivers).

    The raw SHAP impact number is intentionally excluded — direction only.
    """
    return {
        "feature": driver.feature,      # ML-pipeline-sourced value
        "direction": driver.direction,  # ML-pipeline-sourced value
        # "impact" is deliberately omitted — raw SHAP numbers not exposed to Gemini
    }
