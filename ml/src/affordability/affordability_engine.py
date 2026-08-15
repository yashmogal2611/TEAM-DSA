"""
Module 10 — Affordability Engine
==================================
Computes the maximum affordable EMI using FOIR policy and checks
whether each priced offer is within the customer's budget.

FOIR (Fixed Obligation to Income Ratio):
    max_total_emi = monthly_income × max_foir
    affordable_new_emi = max_total_emi - existing_monthly_emi
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import yaml

from src.pricing.pricing_engine import PricedOffer

logger = logging.getLogger(__name__)

with open("config.yaml", "r") as _f:
    _CFG = yaml.safe_load(_f)

_AFF = _CFG["affordability"]
MAX_FOIR: float = _AFF["max_foir"]


@dataclass
class AffordabilityResult:
    monthly_income: float
    existing_monthly_emi: float
    max_total_emi: float
    max_affordable_new_emi: float
    affordable_offers: list[PricedOffer]
    rejected_offers: list[dict]   # {offer, reason}

    def to_dict(self) -> dict:
        return {
            "monthly_income": self.monthly_income,
            "existing_monthly_emi": self.existing_monthly_emi,
            "max_total_emi": round(self.max_total_emi, 2),
            "max_affordable_new_emi": round(self.max_affordable_new_emi, 2),
            "affordable_offers_count": len(self.affordable_offers),
            "rejected_offers_count": len(self.rejected_offers),
        }


class AffordabilityEngine:
    """
    Filters priced offers to only those the customer can afford.

    Usage:
        result = AffordabilityEngine().evaluate(customer_data, priced_offers)
    """

    def evaluate(
        self, customer_data: dict, priced_offers: list[PricedOffer]
    ) -> AffordabilityResult:
        monthly_income: float = customer_data.get("monthly_income", 0.0)
        existing_emi: float = customer_data.get("existing_monthly_emi", 0.0)

        max_total_emi = monthly_income * MAX_FOIR
        max_affordable_new_emi = max(0.0, max_total_emi - existing_emi)

        affordable: list[PricedOffer] = []
        rejected: list[dict] = []

        for offer in priced_offers:
            if offer.monthly_emi <= max_affordable_new_emi:
                affordable.append(offer)
            else:
                reason = (
                    f"EMI ₹{offer.monthly_emi:,.0f} exceeds max affordable "
                    f"₹{max_affordable_new_emi:,.0f} (FOIR {MAX_FOIR:.0%})."
                )
                rejected.append({"offer": offer.to_dict(), "reason": reason})
                logger.debug(
                    "Offer %s rejected by affordability: %s", offer.product_id, reason
                )

        logger.info(
            "Affordability check: %d affordable, %d rejected out of %d offers.",
            len(affordable), len(rejected), len(priced_offers),
        )

        return AffordabilityResult(
            monthly_income=monthly_income,
            existing_monthly_emi=existing_emi,
            max_total_emi=max_total_emi,
            max_affordable_new_emi=max_affordable_new_emi,
            affordable_offers=affordable,
            rejected_offers=rejected,
        )
