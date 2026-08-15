"""
Module 2 (cont.) — Data Preprocessing
=======================================
Cleans and normalises validated customer input before feature engineering.

Responsibilities:
  - Normalise enum strings to uppercase
  - Fill optional missing fields with safe defaults
  - Cap extreme outliers using config-defined bounds
  - Return a clean, standardised customer dict ready for feature engineering
"""

from __future__ import annotations

import logging
from typing import Any

from src.data.loader import load_config

logger = logging.getLogger(__name__)

_CFG = load_config()
_VAL = _CFG["validation"]


CATEGORICAL_UPPER = [
    "employment_type",
    "income_type",
    "loan_purpose",
    "primary_preference",
]

NUMERIC_DEFAULTS: dict[str, float] = {
    "existing_monthly_emi": 0.0,
    "number_of_active_loans": 0,
    "credit_card_outstanding": 0.0,
    "total_work_experience": 0.0,
    "current_employment_duration": 0.0,
}


class DataPreprocessor:
    """
    Cleans and standardises a validated customer input dict.

    Usage:
        clean = DataPreprocessor().process(raw_data)
    """

    def process(self, data: dict) -> dict:
        data = dict(data)  # don't mutate caller's dict

        self._normalise_categoricals(data)
        self._fill_defaults(data)
        self._cap_outliers(data)
        self._cast_types(data)
        self._normalise_city(data)

        logger.info("Preprocessing complete for customer input.")
        return data

    # ── Normalise categoricals to UPPER ──────────────────────────────────────

    def _normalise_categoricals(self, data: dict) -> None:
        for key in CATEGORICAL_UPPER:
            if key in data and data[key] is not None:
                data[key] = str(data[key]).upper().strip()

    # ── Fill optional fields with safe defaults ───────────────────────────────

    def _fill_defaults(self, data: dict) -> None:
        for field, default in NUMERIC_DEFAULTS.items():
            if data.get(field) is None:
                data[field] = default
                logger.debug("Field '%s' missing — defaulted to %s.", field, default)

    # ── Cap extreme numeric outliers ─────────────────────────────────────────

    def _cap_outliers(self, data: dict) -> None:
        income_max = _VAL["monthly_income"]["max"]
        if data.get("monthly_income", 0) > income_max:
            logger.warning(
                "monthly_income capped from %s to %s for pipeline safety.",
                data["monthly_income"], income_max,
            )
            data["monthly_income"] = income_max

        cs_min = _VAL["credit_score"]["min"]
        cs_max = _VAL["credit_score"]["max"]
        cs = data.get("credit_score")
        if cs is not None:
            data["credit_score"] = max(cs_min, min(cs_max, cs))

        amount_max = _VAL["requested_loan_amount"]["max"]
        if data.get("requested_loan_amount", 0) > amount_max:
            data["requested_loan_amount"] = amount_max

    # ── Cast to consistent Python types ──────────────────────────────────────

    def _cast_types(self, data: dict) -> None:
        int_fields = ["age", "number_of_active_loans", "preferred_tenure_months"]
        for f in int_fields:
            if f in data and data[f] is not None:
                data[f] = int(data[f])

        float_fields = [
            "monthly_income", "existing_monthly_emi", "credit_score",
            "requested_loan_amount", "credit_card_outstanding",
            "total_work_experience", "current_employment_duration",
        ]
        for f in float_fields:
            if f in data and data[f] is not None:
                data[f] = float(data[f])

    # ── Normalise city string ─────────────────────────────────────────────────

    def _normalise_city(self, data: dict) -> None:
        if data.get("city"):
            data["city"] = str(data["city"]).strip().title()
