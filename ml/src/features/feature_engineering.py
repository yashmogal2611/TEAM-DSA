"""
Module 4 — Feature Engineering
================================
Derives all model features from preprocessed customer data.

Features produced:
  - Ratio features  (EMI ratio, loan-to-income, etc.)
  - Segment flags   (income segment, credit band)
  - Interaction     (credit × income, EMI burden index)
  - Boolean flags   (high burden, thin file, etc.)
"""

from __future__ import annotations

import logging

import yaml

logger = logging.getLogger(__name__)

with open("config.yaml", "r") as _f:
    _CFG = yaml.safe_load(_f)

_FEAT = _CFG["features"]
_SEGS = _FEAT["income_segments"]


class FeatureEngineer:
    """
    Takes a preprocessed customer dict and returns an enriched dict
    with all derived features appended.

    Usage:
        enriched = FeatureEngineer().engineer(clean_data)
    """

    def engineer(self, data: dict) -> dict:
        data = dict(data)

        self._ratio_features(data)
        self._income_segment(data)
        self._credit_band(data)
        self._interaction_features(data)
        self._flag_features(data)

        logger.info("Feature engineering complete — %d features in output.", len(data))
        return data

    # ── Ratio Features ────────────────────────────────────────────────────────

    def _ratio_features(self, data: dict) -> None:
        monthly_income: float = data.get("monthly_income", 1.0) or 1.0
        annual_income = monthly_income * _FEAT["annual_income_multiplier"]
        data["annual_income"] = annual_income

        existing_emi: float = data.get("existing_monthly_emi", 0.0)
        data["existing_emi_ratio"] = round(existing_emi / monthly_income, 4)

        requested: float = data.get("requested_loan_amount", 0.0)
        data["loan_to_annual_income"] = round(requested / annual_income, 4) if annual_income else 0.0

        cc_outstanding: float = data.get("credit_card_outstanding", 0.0)
        data["cc_to_income_ratio"] = round(cc_outstanding / monthly_income, 4)

    # ── Income Segment ────────────────────────────────────────────────────────

    def _income_segment(self, data: dict) -> None:
        mi = data.get("monthly_income", 0)
        if mi <= _SEGS["low"][1]:
            segment = "LOW"
        elif mi <= _SEGS["medium"][1]:
            segment = "MEDIUM"
        elif mi <= _SEGS["high"][1]:
            segment = "HIGH"
        else:
            segment = "PREMIUM"
        data["income_segment"] = segment

    # ── Credit Band ───────────────────────────────────────────────────────────

    def _credit_band(self, data: dict) -> None:
        cs = data.get("credit_score", 0)
        if cs >= 800:
            band = "EXCELLENT"
        elif cs >= 750:
            band = "VERY_GOOD"
        elif cs >= 700:
            band = "GOOD"
        elif cs >= 650:
            band = "FAIR"
        elif cs >= 600:
            band = "POOR"
        else:
            band = "VERY_POOR"
        data["credit_band"] = band

    # ── Interaction Features ──────────────────────────────────────────────────

    def _interaction_features(self, data: dict) -> None:
        cs = data.get("credit_score", 300)
        mi = data.get("monthly_income", 1)
        # Normalised credit-income composite (higher = lower risk)
        data["credit_income_composite"] = round((cs / 900) * (mi / 100_000), 6)

        existing_emi = data.get("existing_monthly_emi", 0)
        active_loans = data.get("number_of_active_loans", 0)
        # Debt burden index: combines EMI load and number of open accounts
        data["debt_burden_index"] = round(
            (existing_emi / (mi or 1)) * (1 + 0.1 * active_loans), 4
        )

    # ── Boolean Flag Features ─────────────────────────────────────────────────

    def _flag_features(self, data: dict) -> None:
        data["is_high_emi_burden"] = int(data.get("existing_emi_ratio", 0) > 0.40)
        data["is_thin_file"] = int(
            data.get("number_of_active_loans", 0) == 0
            and data.get("credit_card_outstanding", 0) == 0
        )
        data["is_long_tenured"] = int(data.get("total_work_experience", 0) >= 5)
        data["is_stable_employment"] = int(
            data.get("current_employment_duration", 0) >= 1.0  # >= 1 year in current job
        )
