"""
Module 11 — Recommendation Scoring
=====================================
Scores each affordable offer across 5 dimensions and produces
a weighted composite score used for final ranking.

Dimensions (weights from config.yaml):
  1. need_match        — offer amount vs requested amount
  2. affordability     — EMI headroom relative to max affordable EMI
  3. risk_fit          — inverse of PD (better credit = better score)
  4. cost_score        — lower total interest cost = higher score
  5. tenure_preference — closeness to preferred tenure
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import yaml

from src.pricing.pricing_engine import PricedOffer

logger = logging.getLogger(__name__)

with open("config.yaml", "r") as _f:
    _CFG = yaml.safe_load(_f)

_W = _CFG["recommendation"]["weights"]


@dataclass
class ScoredOffer:
    offer: PricedOffer
    need_match_score: float
    affordability_score: float
    risk_fit_score: float
    cost_score: float
    tenure_preference_score: float
    composite_score: float

    def to_dict(self) -> dict:
        return {
            **self.offer.to_dict(),
            "scores": {
                "need_match": round(self.need_match_score, 4),
                "affordability": round(self.affordability_score, 4),
                "risk_fit": round(self.risk_fit_score, 4),
                "cost": round(self.cost_score, 4),
                "tenure_preference": round(self.tenure_preference_score, 4),
                "composite": round(self.composite_score, 4),
            },
        }


class RecommendationScorer:
    """
    Scores a list of affordable offers for a given customer context.

    Usage:
        scored = RecommendationScorer().score(offers, customer_data, risk_result)
    """

    def score(
        self,
        offers: list[PricedOffer],
        customer_data: dict,
        risk_result,
        max_affordable_emi: float,
    ) -> list[ScoredOffer]:
        if not offers:
            return []

        requested_amount = customer_data.get("requested_loan_amount", 1.0)
        preferred_tenure = customer_data.get("preferred_tenure_months", 36)
        pd = risk_result.probability_of_default

        # Normalisation anchors
        max_interest = max(o.total_interest for o in offers) or 1.0
        min_interest = min(o.total_interest for o in offers)

        scored = []
        for offer in offers:
            s = self._score_offer(
                offer,
                requested_amount=requested_amount,
                preferred_tenure=preferred_tenure,
                pd=pd,
                max_affordable_emi=max_affordable_emi,
                max_interest=max_interest,
                min_interest=min_interest,
            )
            scored.append(s)

        logger.info("Scored %d offers.", len(scored))
        return scored

    def _score_offer(
        self,
        offer: PricedOffer,
        requested_amount: float,
        preferred_tenure: int,
        pd: float,
        max_affordable_emi: float,
        max_interest: float,
        min_interest: float,
    ) -> ScoredOffer:

        # 1. Need match: how close is offer amount to requested amount?
        need_match = min(offer.offer_amount / max(requested_amount, 1), 1.0)

        # 2. Affordability: EMI headroom as fraction of max affordable
        emi_headroom = max(0.0, max_affordable_emi - offer.monthly_emi)
        affordability = min(emi_headroom / max(max_affordable_emi, 1), 1.0)

        # 3. Risk fit: inverse of PD normalised to [0,1]
        risk_fit = 1.0 - pd

        # 4. Cost score: lower interest = score closer to 1
        interest_range = max_interest - min_interest
        if interest_range > 0:
            cost_score = 1.0 - (offer.total_interest - min_interest) / interest_range
        else:
            cost_score = 1.0

        # 5. Tenure preference: 1 − |offer_tenure − preferred| / preferred
        tenure_diff = abs(offer.tenure_months - preferred_tenure)
        tenure_score = max(0.0, 1.0 - tenure_diff / max(preferred_tenure, 1))

        composite = (
            _W["need_match"] * need_match
            + _W["affordability"] * affordability
            + _W["risk_fit"] * risk_fit
            + _W["cost"] * cost_score
            + _W["tenure_preference"] * tenure_score
        )

        return ScoredOffer(
            offer=offer,
            need_match_score=round(need_match, 4),
            affordability_score=round(affordability, 4),
            risk_fit_score=round(risk_fit, 4),
            cost_score=round(cost_score, 4),
            tenure_preference_score=round(tenure_score, 4),
            composite_score=round(composite, 4),
        )
