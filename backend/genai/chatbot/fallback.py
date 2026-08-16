"""
fallback.py — Phase 3: Grounded Chatbot

Deterministic fallback intent system.

When Gemini is unavailable (no API key, timeout, quota, network error),
this module tries to match the user's question to one of 7 known intents
and returns a response built entirely from the verified context dict.

CRITICAL RULE:
    Fallback responses must use dynamic context values.
    No hardcoded product names, scores, rates, or EMI amounts.

Intent list:
    1. ranking         — "why ranked first", "top recommendation"
    2. comparison      — "higher than", "better than", "compare"
    3. emi             — "emi", "monthly payment", "instalment"
    4. credit_score    — "credit score", "cibil"
    5. eligibility     — "eligible", "rejected", "not approved"
    6. suitability     — "score", "suitability", "composite"
    7. affordability   — "afford", "dti", "debt", "income ratio"
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Response type
# ---------------------------------------------------------------------------

FALLBACK_SOURCE = "fallback"

SAFE_UNAVAILABLE = (
    "That information isn't available in your current LoanLens "
    "recommendation data."
)

APPROVAL_SAFETY = (
    "LoanLens can explain your recommendation and eligibility factors, "
    "but it cannot guarantee loan approval. "
    "Final approval decisions are made by the lender."
)


# ---------------------------------------------------------------------------
# Intent keyword patterns (order matters — more specific first)
# ---------------------------------------------------------------------------

_INTENT_PATTERNS: List[Tuple[str, List[str]]] = [
    # Approval safety — highest priority
    ("approval_safety", [
        r"guarant",
        r"approv.*certain",
        r"certain.*approv",
        r"confirm.*loan.*approv",
        r"will.*definitely.*approv",
        r"will.*be.*approv",
        r"get.*approv",
    ]),
    # Comparison between products — requires explicit comparison signal
    # NOTE: "why not" alone is intentionally excluded because it is ambiguous
    # (it could mean eligibility). Use 'rank' / 'higher' / 'better' signals.
    ("comparison", [
        r"higher than",
        r"better than",
        r"why not.*rank",
        r"why.*rank.*higher",
        r"\bcompare\b",
        r"\bvs\b",
        r"\bversus\b",
        r"\bbeat\b",
        r"ranked (higher|better|above)",
    ]),
    # EMI / payment
    ("emi", [
        r"\bemi\b",
        r"monthly pay",
        r"instalment",
        r"installment",
        r"monthly emi",
    ]),
    # Credit score
    ("credit_score", [
        r"credit score",
        r"\bcibil\b",
        r"credit factor",
        r"how.*credit",
        r"credit.*affect",
    ]),
    # Eligibility / rejection — tightened to require a clear eligibility signal
    ("eligibility", [
        r"\beligib",
        r"\brejected\b",
        r"not eligible",
        r"not approved",
        r"why (wasn.t|am) i (not )?(eligible|approved|rejected)",
        r"why was i (rejected|not approved|not eligible)",
    ]),
    # Suitability score
    ("suitability", [
        r"suitability",
        r"\bcomposite\b",
        r"what does.*score",
        r"what.*score mean",
        r"my score",
    ]),
    # Affordability / DTI
    ("affordability", [
        r"afford",
        r"\bdti\b",
        r"debt.to.income",
        r"income ratio",
        r"financial burden",
    ]),
    # Ranking — last so comparisons are caught first
    ("ranking", [
        r"rank(ed)? (first|1|one|top|#1)",
        r"top recommendation",
        r"why.*rank",
        r"why.*first",
        r"why.*top",
    ]),
]


def _normalise(text: str) -> str:
    """Lowercase and collapse whitespace for matching."""
    return re.sub(r"\s+", " ", text.lower().strip())


def match_intent(question: str) -> Optional[str]:
    """
    Return the matched intent name, or None if no intent is confident.

    Args:
        question: Raw user question string.

    Returns:
        Intent name string or None.
    """
    normalised = _normalise(question)
    for intent_name, patterns in _INTENT_PATTERNS:
        for pattern in patterns:
            if re.search(pattern, normalised):
                return intent_name
    return None


# ---------------------------------------------------------------------------
# Fallback response builders (each uses only the passed context)
# ---------------------------------------------------------------------------

def _top_offer(context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Return the rank-1 offer dict, or None."""
    recs = context.get("recommendations", [])
    if not recs:
        return None
    # recs are already sorted by rank in context_builder
    return recs[0]


def _respond_ranking(context: Dict[str, Any]) -> str:
    offer = _top_offer(context)
    if offer is None:
        return SAFE_UNAVAILABLE

    name = offer["product_name"]
    lender = offer["lender_name"]
    composite = offer["suitability_scores"].get("composite")
    offer_reasons = context.get("explanation", {}).get("offer_reasons", [])
    comparative = context.get("explanation", {}).get("comparative_reasons", [])

    parts = [
        f"{name} from {lender} is your top-ranked recommendation "
        f"because it received the highest overall suitability score "
        f"among all options evaluated for you."
    ]

    if composite is not None:
        parts.append(
            f"Its composite suitability score is {composite:.2f} out of 1.0."
        )

    reasons = offer_reasons + comparative
    if reasons:
        parts.append("Key reasons include: " + "; ".join(reasons[:3]) + ".")

    return " ".join(parts)


def _respond_comparison(context: Dict[str, Any]) -> str:
    recs = context.get("recommendations", [])
    if len(recs) < 2:
        return SAFE_UNAVAILABLE

    top = recs[0]
    second = recs[1]
    top_name = top["product_name"]
    second_name = second["product_name"]
    top_composite = top["suitability_scores"].get("composite")
    second_composite = second["suitability_scores"].get("composite")

    parts = [
        f"{top_name} (rank 1) scored higher than {second_name} (rank 2) "
        f"based on the LoanLens suitability assessment."
    ]

    if top_composite is not None and second_composite is not None:
        parts.append(
            f"{top_name} had a composite score of {top_composite:.2f} "
            f"versus {second_name}'s {second_composite:.2f}."
        )

    comp_reasons = context.get("explanation", {}).get("comparative_reasons", [])
    if comp_reasons:
        parts.append(
            "Additional factors: " + "; ".join(comp_reasons[:2]) + "."
        )

    return " ".join(parts)


def _respond_emi(context: Dict[str, Any]) -> str:
    offer = _top_offer(context)
    if offer is None:
        return SAFE_UNAVAILABLE

    emi = offer.get("monthly_emi")
    if emi is None:
        return SAFE_UNAVAILABLE

    name = offer["product_name"]
    tenure = offer.get("tenure_months")
    total = offer.get("total_repayment")

    parts = [
        f"Based on your LoanLens recommendation, the monthly EMI for "
        f"{name} is \u20b9{emi:,.0f}."
    ]

    if tenure:
        parts.append(f"This is spread over {tenure} months.")

    if total:
        parts.append(f"Total repayment amount would be \u20b9{total:,.0f}.")

    parts.append(
        "Final EMI amounts are confirmed by the lender at the time of loan disbursement."
    )
    return " ".join(parts)


def _respond_credit_score(context: Dict[str, Any]) -> str:
    drivers = context.get("explanation", {}).get("risk_drivers", [])
    credit_drivers = [
        d for d in drivers if "credit" in d.get("feature", "").lower()
    ]

    if not credit_drivers:
        return (
            "Your credit score is one of the key factors evaluated in the "
            "LoanLens recommendation. Check the risk driver section of your "
            "full explanation for its specific impact."
        )

    driver = credit_drivers[0]
    direction = driver.get("direction", "")

    if direction == "reduces_risk":
        return (
            "Your credit score is a positive factor in this recommendation. "
            "It reduces the predicted risk, which contributes to a more "
            "favourable recommendation and potentially better interest rates."
        )
    else:
        return (
            "Your credit score is currently flagged as a risk factor in this "
            "recommendation. It increases the predicted risk, which may "
            "result in a higher interest rate or a lower recommended amount. "
            "Improving your credit score over time could lead to better offers."
        )


def _respond_eligibility(context: Dict[str, Any]) -> str:
    status = context.get("status", "")
    reasons = context.get("explanation", {}).get("eligibility_reasons", [])

    if status == "REJECTED":
        if reasons:
            return (
                "Based on the current LoanLens assessment, you did not meet "
                "one or more eligibility criteria. "
                + " ".join(reasons)
            )
        return (
            "Based on the current LoanLens assessment, you did not meet "
            "one or more eligibility criteria for the available products. "
            "Please review your profile for improvement opportunities."
        )

    if reasons:
        return (
            "You have met the eligibility criteria for the recommended "
            "loan products. " + " ".join(reasons)
        )

    return (
        "Based on the LoanLens assessment, you appear to meet the "
        "eligibility criteria for the recommended products."
    )


def _respond_suitability(context: Dict[str, Any]) -> str:
    offer = _top_offer(context)
    if offer is None:
        return SAFE_UNAVAILABLE

    scores = offer.get("suitability_scores", {})
    name = offer["product_name"]
    composite = scores.get("composite")

    if composite is None:
        return SAFE_UNAVAILABLE

    parts = [
        f"The suitability score for {name} is a composite metric calculated "
        f"by the LoanLens system. Your top recommendation received a "
        f"composite score of {composite:.2f} out of 1.0."
    ]

    score_notes = []
    if scores.get("affordability") is not None:
        score_notes.append(
            f"Affordability: {scores['affordability']:.2f}"
        )
    if scores.get("risk_fit") is not None:
        score_notes.append(f"Risk fit: {scores['risk_fit']:.2f}")
    if scores.get("need_match") is not None:
        score_notes.append(f"Need match: {scores['need_match']:.2f}")

    if score_notes:
        parts.append("Score breakdown — " + ", ".join(score_notes) + ".")

    parts.append(
        "A higher composite score indicates a stronger overall match for "
        "your profile and needs."
    )
    return " ".join(parts)


def _respond_affordability(context: Dict[str, Any]) -> str:
    aff = context.get("affordability")
    offer = _top_offer(context)

    if aff is None or offer is None:
        return SAFE_UNAVAILABLE

    income = aff.get("monthly_income")
    max_new_emi = aff.get("max_affordable_new_emi")
    emi = offer.get("monthly_emi")
    name = offer["product_name"]

    if income is None or max_new_emi is None or emi is None:
        return SAFE_UNAVAILABLE

    affordable = emi <= max_new_emi

    if affordable:
        return (
            f"The monthly EMI for {name} (\u20b9{emi:,.0f}) is within your "
            f"maximum affordable new EMI of \u20b9{max_new_emi:,.0f}, based on "
            f"your monthly income of \u20b9{income:,.0f}. "
            f"The LoanLens system considers this loan affordable for your profile."
        )
    else:
        return (
            f"The monthly EMI for {name} (\u20b9{emi:,.0f}) exceeds your "
            f"maximum affordable new EMI of \u20b9{max_new_emi:,.0f}, based on "
            f"your monthly income of \u20b9{income:,.0f}. "
            f"This may create a higher financial burden."
        )


def _respond_approval_safety(_context: Dict[str, Any]) -> str:
    return APPROVAL_SAFETY


# ---------------------------------------------------------------------------
# Intent → handler dispatch table
# ---------------------------------------------------------------------------

_HANDLERS = {
    "ranking": _respond_ranking,
    "comparison": _respond_comparison,
    "emi": _respond_emi,
    "credit_score": _respond_credit_score,
    "eligibility": _respond_eligibility,
    "suitability": _respond_suitability,
    "affordability": _respond_affordability,
    "approval_safety": _respond_approval_safety,
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_fallback_response(question: str, context: Dict[str, Any]) -> str:
    """
    Attempt to match the question to a known intent and return a
    deterministic, context-grounded response.

    If no intent matches, return the safe generic unavailable message.

    Args:
        question: Raw user question.
        context:  Verified context dict from context_builder.build_context().

    Returns:
        A human-readable answer string.
    """
    intent = match_intent(question)
    if intent is None:
        return SAFE_UNAVAILABLE

    handler = _HANDLERS.get(intent)
    if handler is None:
        return SAFE_UNAVAILABLE

    return handler(context)
