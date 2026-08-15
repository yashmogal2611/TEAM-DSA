"""
Module 12 — Recommendation Ranking
=====================================
Sorts scored offers and selects the top-N recommendations,
applying preference-based tie-breaking when composite scores are close.
"""

from __future__ import annotations

import logging

from src.data.loader import load_config
from src.recommendation.scoring import ScoredOffer

logger = logging.getLogger(__name__)

_CFG = load_config()
TOP_N: int = _CFG["recommendation"]["top_n"]

# Maps primary_preference → sort key for tie-breaking
PREFERENCE_SORT_KEY = {
    "LOWEST_EMI": lambda s: s.offer.monthly_emi,
    "LOWEST_TOTAL_COST": lambda s: s.offer.total_interest,
    "SHORTEST_TENURE": lambda s: s.offer.tenure_months,
    "REQUIRED_AMOUNT": lambda s: -s.offer.offer_amount,   # descending
}


class RecommendationRanker:
    """
    Ranks scored offers and returns the top-N.

    Usage:
        ranked = RecommendationRanker().rank(scored_offers, primary_preference)
    """

    def rank(
        self,
        scored_offers: list[ScoredOffer],
        primary_preference: str = "LOWEST_EMI",
        top_n: int = TOP_N,
    ) -> list[ScoredOffer]:
        if not scored_offers:
            logger.warning("No scored offers to rank.")
            return []

        preference = primary_preference.upper()
        tiebreak_fn = PREFERENCE_SORT_KEY.get(preference, PREFERENCE_SORT_KEY["LOWEST_EMI"])

        # Primary sort: composite score (desc), secondary: preference-based tiebreak
        sorted_offers = sorted(
            scored_offers,
            key=lambda s: (-s.composite_score, tiebreak_fn(s)),
        )

        top = sorted_offers[:top_n]
        logger.info(
            "Ranked %d offers → returning top %d. Scores: %s",
            len(sorted_offers),
            len(top),
            [round(s.composite_score, 3) for s in top],
        )
        return top
