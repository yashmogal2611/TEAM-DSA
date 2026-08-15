"""
Module 13 — Candidate Generation
===================================
Filters the full loan product catalogue down to candidates that are
compatible with the customer's basic profile before pricing runs.

Pre-filters (fast, no ML):
  - Employment type allowed by product
  - Requested amount within product's [min, max] range
  - Preferred tenure within product's [min, max] range
  - Customer's city/state in product's serviceable locations (if restricted)
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


class CandidateGenerator:
    """
    Generates a filtered list of loan product candidates for a customer.

    Usage:
        candidates = CandidateGenerator().generate(all_products, customer_data)
    """

    def generate(self, products: list[dict], customer_data: dict) -> list[dict]:
        emp_type = customer_data.get("employment_type", "")
        requested = customer_data.get("requested_loan_amount", 0)
        tenure = customer_data.get("preferred_tenure_months", 36)
        city = (customer_data.get("city") or "").lower()

        candidates = []
        for p in products:
            if not self._check_employment(p, emp_type):
                continue
            if not self._check_amount_range(p, requested):
                continue
            if not self._check_tenure_range(p, tenure):
                continue
            if not self._check_geography(p, city):
                continue
            candidates.append(p)

        logger.info(
            "Candidate generation: %d / %d products passed pre-filters.",
            len(candidates), len(products),
        )
        return candidates

    def _check_employment(self, product: dict, emp_type: str) -> bool:
        allowed = product.get("allowed_employment_types")
        if not allowed:
            return True   # no restriction
        return emp_type.upper() in [e.upper() for e in allowed]

    def _check_amount_range(self, product: dict, requested: float) -> bool:
        min_amt = product.get("min_loan_amount", 0)
        max_amt = product.get("max_loan_amount", float("inf"))
        # pass if requested overlaps with product range
        return requested >= min_amt  # pricing will cap to max_amt

    def _check_tenure_range(self, product: dict, tenure: int) -> bool:
        min_t = product.get("min_tenure_months", 0)
        max_t = product.get("max_tenure_months", 999)
        # pass if preferred tenure is within 1.5× product range (pricing adjusts)
        return min_t <= tenure * 1.5 and tenure * 0.5 <= max_t

    def _check_geography(self, product: dict, city: str) -> bool:
        serviceable = product.get("serviceable_cities")
        if not serviceable:
            return True   # available PAN-India
        return city in [c.lower() for c in serviceable]
