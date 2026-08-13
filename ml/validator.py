"""
Module 2 — Data Validation
===========================
Validates raw customer input before it enters the ML pipeline.
Raises structured errors with field-level detail so the API
can return meaningful messages to the caller.

Validation layers:
  1. Type / presence  (handled by Pydantic schemas in api/schemas.py)
  2. Range / business rules  (this module)
  3. Consistency checks  (cross-field logic)
  4. Outlier flags  (warning-level, does not reject the request)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import yaml

logger = logging.getLogger(__name__)

# ── Load config ──────────────────────────────────────────────────────────────
with open("config.yaml", "r") as _f:
    _CFG = yaml.safe_load(_f)

_VAL = _CFG["validation"]
_ELIG = _CFG["eligibility"]


# ── Result containers ────────────────────────────────────────────────────────

@dataclass
class ValidationError:
    field: str
    message: str
    value: Any = None


@dataclass
class ValidationWarning:
    field: str
    message: str
    value: Any = None


@dataclass
class ValidationResult:
    is_valid: bool
    errors: list[ValidationError] = field(default_factory=list)
    warnings: list[ValidationWarning] = field(default_factory=list)

    def add_error(self, field_name: str, message: str, value: Any = None) -> None:
        self.errors.append(ValidationError(field=field_name, message=message, value=value))
        self.is_valid = False

    def add_warning(self, field_name: str, message: str, value: Any = None) -> None:
        self.warnings.append(ValidationWarning(field=field_name, message=message, value=value))

    def to_dict(self) -> dict:
        return {
            "is_valid": self.is_valid,
            "errors": [
                {"field": e.field, "message": e.message, "value": e.value}
                for e in self.errors
            ],
            "warnings": [
                {"field": w.field, "message": w.message, "value": w.value}
                for w in self.warnings
            ],
        }


# ── Allowed enum values ──────────────────────────────────────────────────────

VALID_EMPLOYMENT_TYPES = {
    "SALARIED",
    "SELF_EMPLOYED",
    "BUSINESS_OWNER",
    "PROFESSIONAL",
    "OTHER",
}

VALID_INCOME_TYPES = {
    "FIXED",
    "VARIABLE",
    "MIXED",
}

VALID_LOAN_PURPOSES = {
    "HOME_RENOVATION",
    "MEDICAL",
    "EDUCATION",
    "TRAVEL",
    "WEDDING",
    "DEBT_CONSOLIDATION",
    "BUSINESS",
    "CONSUMER_DURABLES",
    "OTHER",
}

VALID_PRIMARY_PREFERENCES = {
    "LOWEST_EMI",
    "LOWEST_TOTAL_COST",
    "SHORTEST_TENURE",
    "REQUIRED_AMOUNT",
}


# ── Main Validator ───────────────────────────────────────────────────────────

class CustomerInputValidator:
    """
    Validates a customer input dictionary against business rules.

    Usage:
        result = CustomerInputValidator().validate(customer_data)
        if not result.is_valid:
            raise ...
    """

    def validate(self, data: dict) -> ValidationResult:
        result = ValidationResult(is_valid=True)

        self._validate_personal(data, result)
        self._validate_employment(data, result)
        self._validate_financial(data, result)
        self._validate_credit(data, result)
        self._validate_loan_request(data, result)

        # Cross-field consistency checks only if base fields are valid
        if result.is_valid:
            self._validate_consistency(data, result)

        # Outlier warnings (non-blocking)
        self._check_outliers(data, result)

        if result.errors:
            logger.warning(
                "Validation failed with %d error(s): %s",
                len(result.errors),
                [e.field for e in result.errors],
            )
        else:
            logger.info("Customer input passed all validation checks.")

        return result

    # ── Personal ─────────────────────────────────────────────────────────────

    def _validate_personal(self, data: dict, result: ValidationResult) -> None:
        age = data.get("age")
        if age is None:
            result.add_error("age", "age is required.")
        elif not isinstance(age, (int, float)):
            result.add_error("age", "age must be a number.", age)
        else:
            cfg = _VAL["age"]
            if not (cfg["min"] <= age <= cfg["max"]):
                result.add_error(
                    "age",
                    f"age must be between {cfg['min']} and {cfg['max']}.",
                    age,
                )

        city = data.get("city")
        if not city or not isinstance(city, str) or not city.strip():
            result.add_error("city", "city is required and must be a non-empty string.", city)

    # ── Employment ───────────────────────────────────────────────────────────

    def _validate_employment(self, data: dict, result: ValidationResult) -> None:
        emp_type = data.get("employment_type")
        if emp_type is None:
            result.add_error("employment_type", "employment_type is required.")
        elif str(emp_type).upper() not in VALID_EMPLOYMENT_TYPES:
            result.add_error(
                "employment_type",
                f"employment_type must be one of {sorted(VALID_EMPLOYMENT_TYPES)}.",
                emp_type,
            )

        income_type = data.get("income_type")
        if income_type is None:
            result.add_error("income_type", "income_type is required.")
        elif str(income_type).upper() not in VALID_INCOME_TYPES:
            result.add_error(
                "income_type",
                f"income_type must be one of {sorted(VALID_INCOME_TYPES)}.",
                income_type,
            )

        for field_name in ("total_work_experience", "current_employment_duration"):
            val = data.get(field_name)
            if val is None:
                result.add_error(field_name, f"{field_name} is required.")
            elif not isinstance(val, (int, float)) or val < 0:
                result.add_error(
                    field_name,
                    f"{field_name} must be a non-negative number.",
                    val,
                )

        monthly_income = data.get("monthly_income")
        if monthly_income is None:
            result.add_error("monthly_income", "monthly_income is required.")
        elif not isinstance(monthly_income, (int, float)):
            result.add_error("monthly_income", "monthly_income must be a number.", monthly_income)
        else:
            cfg = _VAL["monthly_income"]
            if monthly_income < cfg["min"]:
                result.add_error(
                    "monthly_income",
                    f"monthly_income must be at least ₹{cfg['min']:,}.",
                    monthly_income,
                )

    # ── Financial ────────────────────────────────────────────────────────────

    def _validate_financial(self, data: dict, result: ValidationResult) -> None:
        existing_emi = data.get("existing_monthly_emi", 0)
        if existing_emi is None:
            result.add_error("existing_monthly_emi", "existing_monthly_emi is required.")
        elif not isinstance(existing_emi, (int, float)) or existing_emi < 0:
            result.add_error(
                "existing_monthly_emi",
                "existing_monthly_emi must be zero or a positive number.",
                existing_emi,
            )

        active_loans = data.get("number_of_active_loans", 0)
        if not isinstance(active_loans, int) or active_loans < 0:
            result.add_error(
                "number_of_active_loans",
                "number_of_active_loans must be a non-negative integer.",
                active_loans,
            )

        cc_outstanding = data.get("credit_card_outstanding", 0)
        if cc_outstanding is not None and (
            not isinstance(cc_outstanding, (int, float)) or cc_outstanding < 0
        ):
            result.add_error(
                "credit_card_outstanding",
                "credit_card_outstanding must be zero or a positive number.",
                cc_outstanding,
            )

    # ── Credit ───────────────────────────────────────────────────────────────

    def _validate_credit(self, data: dict, result: ValidationResult) -> None:
        credit_score = data.get("credit_score")
        if credit_score is None:
            result.add_error("credit_score", "credit_score is required.")
        elif not isinstance(credit_score, (int, float)):
            result.add_error("credit_score", "credit_score must be a number.", credit_score)
        else:
            cfg = _VAL["credit_score"]
            if not (cfg["min"] <= credit_score <= cfg["max"]):
                result.add_error(
                    "credit_score",
                    f"credit_score must be between {cfg['min']} and {cfg['max']}.",
                    credit_score,
                )

    # ── Loan Request ─────────────────────────────────────────────────────────

    def _validate_loan_request(self, data: dict, result: ValidationResult) -> None:
        amount = data.get("requested_loan_amount")
        if amount is None:
            result.add_error("requested_loan_amount", "requested_loan_amount is required.")
        elif not isinstance(amount, (int, float)):
            result.add_error("requested_loan_amount", "requested_loan_amount must be a number.", amount)
        else:
            cfg = _VAL["requested_loan_amount"]
            if not (cfg["min"] <= amount <= cfg["max"]):
                result.add_error(
                    "requested_loan_amount",
                    f"requested_loan_amount must be between ₹{cfg['min']:,} and ₹{cfg['max']:,}.",
                    amount,
                )

        tenure = data.get("preferred_tenure_months")
        if tenure is None:
            result.add_error("preferred_tenure_months", "preferred_tenure_months is required.")
        elif not isinstance(tenure, int) or tenure < 1:
            result.add_error(
                "preferred_tenure_months",
                "preferred_tenure_months must be a positive integer.",
                tenure,
            )
        else:
            cfg = _VAL["preferred_tenure_months"]
            if not (cfg["min"] <= tenure <= cfg["max"]):
                result.add_error(
                    "preferred_tenure_months",
                    f"preferred_tenure_months must be between {cfg['min']} and {cfg['max']} months.",
                    tenure,
                )

        purpose = data.get("loan_purpose")
        if purpose is None:
            result.add_error("loan_purpose", "loan_purpose is required.")
        elif str(purpose).upper() not in VALID_LOAN_PURPOSES:
            result.add_error(
                "loan_purpose",
                f"loan_purpose must be one of {sorted(VALID_LOAN_PURPOSES)}.",
                purpose,
            )

        preference = data.get("primary_preference")
        if preference is None:
            result.add_error("primary_preference", "primary_preference is required.")
        elif str(preference).upper() not in VALID_PRIMARY_PREFERENCES:
            result.add_error(
                "primary_preference",
                f"primary_preference must be one of {sorted(VALID_PRIMARY_PREFERENCES)}.",
                preference,
            )

    # ── Cross-field consistency ───────────────────────────────────────────────

    def _validate_consistency(self, data: dict, result: ValidationResult) -> None:
        monthly_income = data.get("monthly_income", 0)
        existing_emi = data.get("existing_monthly_emi", 0)
        total_work_exp = data.get("total_work_experience", 0)
        current_emp_dur = data.get("current_employment_duration", 0)

        # Existing EMI cannot exceed total income (would be insolvent already)
        if existing_emi >= monthly_income:
            result.add_error(
                "existing_monthly_emi",
                "existing_monthly_emi cannot be greater than or equal to monthly_income. "
                "Customer would already be insolvent.",
                existing_emi,
            )

        # Current job duration cannot exceed total work experience
        if current_emp_dur > total_work_exp:
            result.add_error(
                "current_employment_duration",
                "current_employment_duration cannot exceed total_work_experience.",
                current_emp_dur,
            )

    # ── Outlier warnings (non-blocking) ──────────────────────────────────────

    def _check_outliers(self, data: dict, result: ValidationResult) -> None:
        monthly_income = data.get("monthly_income")
        if monthly_income and monthly_income > _VAL["monthly_income"]["max"]:
            result.add_warning(
                "monthly_income",
                f"monthly_income ₹{monthly_income:,} is extremely high — flagged for manual review.",
                monthly_income,
            )

        existing_emi = data.get("existing_monthly_emi", 0)
        monthly_income = data.get("monthly_income", 1)
        if existing_emi and monthly_income:
            emi_ratio = existing_emi / monthly_income
            if emi_ratio > _ELIG["max_existing_emi_ratio"]:
                result.add_warning(
                    "existing_monthly_emi",
                    f"Existing EMI-to-income ratio is {emi_ratio:.1%}, which exceeds the "
                    f"policy limit of {_ELIG['max_existing_emi_ratio']:.0%}. "
                    "Likely to fail eligibility.",
                    existing_emi,
                )

        credit_score = data.get("credit_score")
        if credit_score and credit_score < _ELIG["min_credit_score"]:
            result.add_warning(
                "credit_score",
                f"credit_score {credit_score} is below the minimum eligibility threshold "
                f"of {_ELIG['min_credit_score']}. Likely to fail eligibility.",
                credit_score,
            )
