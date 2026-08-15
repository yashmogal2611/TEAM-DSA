"""
Module 9 — Pricing Engine
===========================
Computes the personalised interest rate and EMI for each loan product
based on the customer's risk band.

Formula:
    personalised_rate = product.base_rate + risk_band_adjustment
    monthly_emi       = PMT(rate/12, tenure, -principal)
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass

from src.data.loader import load_config

logger = logging.getLogger(__name__)

_CFG = load_config()
_RATE_ADJ: dict[str, float] = _CFG["pricing"]["risk_premium"]


@dataclass
class PricedOffer:
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
    processing_fee: float
    processing_fee_amount: float

    def to_dict(self) -> dict:
        return {
            "product_id": self.product_id,
            "product_name": self.product_name,
            "lender_name": self.lender_name,
            "offer_amount": round(self.offer_amount, 2),
            "tenure_months": self.tenure_months,
            "base_interest_rate": self.base_interest_rate,
            "personalised_rate": round(self.personalised_rate, 2),
            "monthly_emi": round(self.monthly_emi, 2),
            "total_repayment": round(self.total_repayment, 2),
            "total_interest": round(self.total_interest, 2),
            "processing_fee_pct": self.processing_fee,
            "processing_fee_amount": round(self.processing_fee_amount, 2),
        }


def _calculate_emi(principal: float, annual_rate: float, tenure_months: int) -> float:
    """Standard reducing-balance EMI (PMT formula)."""
    if annual_rate == 0:
        return principal / tenure_months
    r = annual_rate / 100 / 12
    emi = principal * r * (1 + r) ** tenure_months / ((1 + r) ** tenure_months - 1)
    return round(emi, 2)


class PricingEngine:
    """
    Generates priced offers for each eligible loan product.

    Usage:
        offers = PricingEngine().price(products, risk_band, customer_data)
    """

    def price(
        self,
        products: list[dict],
        risk_band: str,
        customer_data: dict,
    ) -> list[PricedOffer]:
        offers: list[PricedOffer] = []
        rate_adj = _RATE_ADJ.get(risk_band, 0.0)

        for product in products:
            offer = self._price_product(product, rate_adj, customer_data)
            if offer:
                offers.append(offer)

        logger.info(
            "Pricing complete: %d offers generated for risk_band=%s", len(offers), risk_band
        )
        return offers

    def _price_product(
        self, product: dict, rate_adj: float, customer_data: dict
    ) -> PricedOffer | None:
        try:
            # ── Determine offer amount ────────────────────────────────────────
            requested = customer_data.get("requested_loan_amount", 0)
            max_amount = product.get("max_loan_amount", requested)
            min_amount = product.get("min_loan_amount", 0)
            offer_amount = min(requested, max_amount)

            if offer_amount < min_amount:
                logger.debug(
                    "Product %s skipped: offer amount %.0f < min %.0f",
                    product["product_id"], offer_amount, min_amount,
                )
                return None

            # ── Determine tenure ──────────────────────────────────────────────
            preferred_tenure = customer_data.get("preferred_tenure_months", 36)
            max_tenure = product.get("max_tenure_months", 84)
            min_tenure = product.get("min_tenure_months", 6)
            tenure = int(min(max(preferred_tenure, min_tenure), max_tenure))

            # ── Rate ──────────────────────────────────────────────────────────
            base_rate = float(product.get("base_interest_rate", 12.0))
            personalised_rate = base_rate + rate_adj

            # ── EMI & totals ──────────────────────────────────────────────────
            emi = _calculate_emi(offer_amount, personalised_rate, tenure)
            total_repayment = round(emi * tenure, 2)
            total_interest = round(total_repayment - offer_amount, 2)

            # ── Processing fee ────────────────────────────────────────────────
            fee_pct = float(product.get("processing_fee_pct", 1.0))
            fee_amount = round(offer_amount * fee_pct / 100, 2)

            return PricedOffer(
                product_id=product["product_id"],
                product_name=product.get("product_name", ""),
                lender_name=product.get("lender_name", ""),
                offer_amount=offer_amount,
                tenure_months=tenure,
                base_interest_rate=base_rate,
                personalised_rate=personalised_rate,
                monthly_emi=emi,
                total_repayment=total_repayment,
                total_interest=total_interest,
                processing_fee=fee_pct,
                processing_fee_amount=fee_amount,
            )
        except Exception as exc:
            logger.warning("Failed to price product %s: %s", product.get("product_id"), exc)
            return None
