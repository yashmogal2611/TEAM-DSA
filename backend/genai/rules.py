from typing import Optional

from .schemas import (
    AffordabilitySummary,
    LoanRecommendationResponse,
)


def calculate_total_emi(
    existing_monthly_emi: float,
    new_monthly_emi: float,
) -> float:
    """
    Calculate total monthly EMI after taking the recommended loan.
    """

    return existing_monthly_emi + new_monthly_emi


def calculate_emi_ratio(
    monthly_income: float,
    total_emi: float,
) -> float:
    """
    Calculate total EMI as a fraction of monthly income.
    """

    if monthly_income <= 0:
        raise ValueError("Monthly income must be greater than zero.")

    return total_emi / monthly_income


def explain_affordability(
    data: LoanRecommendationResponse,
) -> Optional[str]:
    """
    Generate a deterministic affordability explanation.

    Uses the affordability information supplied by the ML/recommendation
    engine instead of inventing financial thresholds.
    """

    affordability = data.affordability_summary

    if affordability is None:
        return None

    if not data.recommendations:
        return None

    # Recommendations are ranked, with rank 1 being the top match.
    top_offer = min(
        data.recommendations,
        key=lambda offer: offer.rank
    )

    total_emi = calculate_total_emi(
        affordability.existing_monthly_emi,
        top_offer.monthly_emi,
    )

    emi_ratio = calculate_emi_ratio(
        affordability.monthly_income,
        total_emi,
    )

    ratio_percentage = emi_ratio * 100

    max_new_emi = affordability.max_affordable_new_emi

    if top_offer.monthly_emi <= max_new_emi:
        return (
            f"The recommended {top_offer.product_name} has a monthly EMI "
            f"of ₹{top_offer.monthly_emi:,.0f}, which is within your "
            f"maximum affordable new EMI of ₹{max_new_emi:,.0f}. "
            f"Your total EMI commitments would be approximately "
            f"{ratio_percentage:.1f}% of your monthly income."
        )

    return (
        f"The recommended {top_offer.product_name} has a monthly EMI "
        f"of ₹{top_offer.monthly_emi:,.0f}, which exceeds your "
        f"maximum affordable new EMI of ₹{max_new_emi:,.0f}. "
        f"This may create a higher financial burden."
    )


def explain_eligibility(
    data: LoanRecommendationResponse,
) -> Optional[str]:
    """
    Explain eligibility using the ML team's deterministic eligibility
    reasons.

    We deliberately do not calculate numerical gaps here because the
    current ML contract provides the failed-rule messages but does not
    provide the user's current value and required value separately.
    """

    reasons = data.explanation.eligibility_reasons

    if not reasons:
        return None

    if data.status == "APPROVED":
        return " ".join(reasons)

    return " ".join(reasons)


def build_counterfactual_message(
    data: LoanRecommendationResponse,
) -> Optional[str]:
    """
    Build the 'why not eligible?' explanation.

    The current ML contract gives us specific failed eligibility reasons.
    We pass those through rather than inventing numerical improvement
    requirements.
    """

    if data.status != "REJECTED":
        return None

    reasons = data.explanation.eligibility_reasons

    if not reasons:
        return (
            "You currently do not meet one or more of the eligibility "
            "requirements for this product."
        )

    return " ".join(reasons)