"""
Module 6 — Eligibility Rules Engine
=====================================
Hard rule-based eligibility checks applied before any ML scoring.
If a customer fails even one rule, they are rejected with a reason.

Rules (from config.yaml → eligibility):
  1. Age band
  2. Minimum monthly income
  3. Minimum credit score
  4. Minimum employment duration
  5. Existing EMI ratio (FOIR pre-check)
  6. Maximum active loans
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import yaml

logger = logging.getLogger(__name__)

with open("config.yaml", "r") as _f:
    _CFG = yaml.safe_load(_f)

_E = _CFG["eligibility"]


@dataclass
class EligibilityResult:
    is_eligible: bool
    failed_rules: list[str] = field(default_factory=list)
    passed_rules: list[str] = field(default_factory=list)
    reason: str = ""

    def to_dict(self) -> dict:
        return {
            "is_eligible": self.is_eligible,
            "reason": self.reason,
            "failed_rules": self.failed_rules,
            "passed_rules": self.passed_rules,
        }


class EligibilityEngine:
    """
    Evaluates hard eligibility rules against enriched customer features.

    Usage:
        result = EligibilityEngine().evaluate(enriched_data)
    """

    _RULES = [
        "_check_age",
        "_check_income",
        "_check_credit_score",
        "_check_employment_duration",
        "_check_existing_emi_ratio",
        "_check_active_loans",
    ]

    def evaluate(self, data: dict) -> EligibilityResult:
        result = EligibilityResult(is_eligible=True)

        for rule_method in self._RULES:
            rule_name, passed, message = getattr(self, rule_method)(data)
            if passed:
                result.passed_rules.append(rule_name)
            else:
                result.failed_rules.append(rule_name)
                result.is_eligible = False
                logger.info("Eligibility rule FAILED: %s — %s", rule_name, message)

        if not result.is_eligible:
            result.reason = "; ".join(
                [self._rule_message(r, data) for r in result.failed_rules]
            )
        else:
            result.reason = "Customer meets all eligibility criteria."

        return result

    # ── Individual Rules ──────────────────────────────────────────────────────

    def _check_age(self, data: dict) -> tuple[str, bool, str]:
        age = data.get("age", 0)
        passed = _E["min_age"] <= age <= _E["max_age"]
        msg = f"Age {age} not in [{_E['min_age']}, {_E['max_age']}]"
        return "AGE_BAND", passed, msg

    def _check_income(self, data: dict) -> tuple[str, bool, str]:
        income = data.get("monthly_income", 0)
        passed = income >= _E["min_monthly_income"]
        msg = f"Income ₹{income:,} < minimum ₹{_E['min_monthly_income']:,}"
        return "MIN_INCOME", passed, msg

    def _check_credit_score(self, data: dict) -> tuple[str, bool, str]:
        cs = data.get("credit_score", 0)
        passed = cs >= _E["min_credit_score"]
        msg = f"Credit score {cs} < minimum {_E['min_credit_score']}"
        return "MIN_CREDIT_SCORE", passed, msg

    def _check_employment_duration(self, data: dict) -> tuple[str, bool, str]:
        dur_years = data.get("current_employment_duration", 0)
        dur_months = dur_years * 12
        min_months = _E["min_employment_duration_months"]
        passed = dur_months >= min_months
        msg = f"Employment duration {dur_months:.1f} months < {min_months} months"
        return "MIN_EMPLOYMENT_DURATION", passed, msg

    def _check_existing_emi_ratio(self, data: dict) -> tuple[str, bool, str]:
        ratio = data.get("existing_emi_ratio", 0)
        max_ratio = _E["max_existing_emi_ratio"]
        passed = ratio <= max_ratio
        msg = f"Existing EMI ratio {ratio:.1%} > max allowed {max_ratio:.0%}"
        return "MAX_EXISTING_EMI_RATIO", passed, msg

    def _check_active_loans(self, data: dict) -> tuple[str, bool, str]:
        loans = data.get("number_of_active_loans", 0)
        max_loans = _E["max_active_loans"]
        passed = loans <= max_loans
        msg = f"Active loans {loans} > max allowed {max_loans}"
        return "MAX_ACTIVE_LOANS", passed, msg

    # ── Human-readable messages for failed rules ──────────────────────────────

    def _rule_message(self, rule: str, data: dict) -> str:
        messages = {
            "AGE_BAND": f"Age must be between {_E['min_age']} and {_E['max_age']} years.",
            "MIN_INCOME": f"Monthly income must be at least ₹{_E['min_monthly_income']:,}.",
            "MIN_CREDIT_SCORE": f"Credit score must be at least {_E['min_credit_score']}.",
            "MIN_EMPLOYMENT_DURATION": (
                f"Must be employed at current job for at least "
                f"{_E['min_employment_duration_months']} months."
            ),
            "MAX_EXISTING_EMI_RATIO": (
                f"Existing EMIs exceed {_E['max_existing_emi_ratio']:.0%} of monthly income."
            ),
            "MAX_ACTIVE_LOANS": (
                f"Cannot have more than {_E['max_active_loans']} active loans."
            ),
        }
        return messages.get(rule, rule)
