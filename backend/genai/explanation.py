from typing import List

from .config import MIN_SHAP_IMPORTANCE, TOP_SHAP_FEATURES
from .rules import (
    build_counterfactual_message,
    explain_affordability,
    explain_eligibility,
)
from .schemas import (
    ExplanationOutput,
    LoanRecommendationResponse,
    RiskDriver,
)


FEATURE_LABELS = {
    "credit_score": "credit score",
    "annual_income": "annual income",
    "debt_to_income_ratio": "debt-to-income ratio",
    "years_employed": "employment history",
    "existing_monthly_emi": "existing monthly EMI",
    "requested_loan_amount": "requested loan amount",
    "requested_amount_to_income_ratio": "loan amount relative to income",
    "loan_amount": "loan amount",
    "employment_length": "employment history",
}


def get_feature_label(feature_name: str) -> str:
    """
    Convert an internal ML feature name into a human-readable label.
    """

    return FEATURE_LABELS.get(
        feature_name,
        feature_name.replace("_", " ")
    )


def rank_risk_drivers(
    risk_drivers: List[RiskDriver],
) -> List[RiskDriver]:
    """
    Rank risk drivers by absolute impact.

    The ML team already returns these sorted and capped, but we sort
    defensively so the GenAI module remains reliable if that behavior
    changes later.
    """

    meaningful_drivers = [
        driver
        for driver in risk_drivers
        if abs(driver.impact) >= MIN_SHAP_IMPORTANCE
    ]

    return sorted(
        meaningful_drivers,
        key=lambda driver: abs(driver.impact),
        reverse=True,
    )[:TOP_SHAP_FEATURES]


def generate_risk_driver_explanation(
    driver: RiskDriver,
) -> str:
    """
    Convert a signed SHAP/rule-based impact into human language.

    Important:
    We do not expose the numerical SHAP value to the user.
    """

    label = get_feature_label(driver.feature)

    if driver.direction == "reduces_risk":
        return (
            f"Your {label} is a positive factor and reduces the "
            f"predicted risk for this recommendation."
        )

    return (
        f"Your {label} is a risk factor and increases the "
        f"predicted risk for this recommendation."
    )


def generate_shap_explanation(
    data: LoanRecommendationResponse,
) -> ExplanationOutput:
    """
    Main Phase 1 explanation generator.

    Input:
        ML team's LoanRecommendationResponse JSON

    Output:
        GenAI-friendly ExplanationOutput
    """

    ranked_drivers = rank_risk_drivers(
        data.explanation.risk_drivers
    )

    positive_reasons = []
    caution_reasons = []

    # ---------------------------------------------------------
    # Risk-driver explanations
    # ---------------------------------------------------------

    for driver in ranked_drivers:

        explanation = generate_risk_driver_explanation(driver)

        if driver.direction == "reduces_risk":
            positive_reasons.append(explanation)
        else:
            caution_reasons.append(explanation)

    # ---------------------------------------------------------
    # Offer reasons
    # ---------------------------------------------------------

    positive_reasons.extend(
        data.explanation.offer_reasons
    )

    # ---------------------------------------------------------
    # Comparative reasons
    # ---------------------------------------------------------

    positive_reasons.extend(
        data.explanation.comparative_reasons
    )

    # ---------------------------------------------------------
    # Financial explanation
    # ---------------------------------------------------------

    financial_explanation = explain_affordability(data)

    # ---------------------------------------------------------
    # Eligibility / rejection explanation
    # ---------------------------------------------------------

    if data.status == "REJECTED":
        eligibility_explanation = build_counterfactual_message(data)
    else:
        eligibility_explanation = explain_eligibility(data)

    return ExplanationOutput(
        positive=positive_reasons,
        caution=caution_reasons,
        top_factors=ranked_drivers,
        financial_explanation=financial_explanation,
        eligibility_explanation=eligibility_explanation,
    )