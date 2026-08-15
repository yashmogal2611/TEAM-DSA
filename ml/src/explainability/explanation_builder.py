"""
Module 14 — Explainability
============================
Generates human-readable explanations for:
  1. Why a customer was approved / rejected
  2. Why each recommendation was ranked where it was
  3. Key drivers of the risk score (SHAP or rule-based fallback)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import yaml

logger = logging.getLogger(__name__)

with open("config.yaml", "r") as _f:
    _CFG = yaml.safe_load(_f)

_EXP = _CFG["explainability"]
USE_SHAP: bool = _EXP.get("use_shap", True)
MAX_SHAP_FEATURES: int = _EXP.get("shap_max_display_features", 5)


@dataclass
class Explanation:
    eligibility_reasons: list[str] = field(default_factory=list)
    risk_drivers: list[dict] = field(default_factory=list)    # [{feature, impact, direction}]
    offer_reasons: list[str] = field(default_factory=list)
    comparative_reasons: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "eligibility_reasons": self.eligibility_reasons,
            "risk_drivers": self.risk_drivers,
            "offer_reasons": self.offer_reasons,
            "comparative_reasons": self.comparative_reasons,
        }


class ExplanationBuilder:
    """
    Builds explanations for a recommendation response.

    Usage:
        builder = ExplanationBuilder(model, preprocessor)
        explanation = builder.build(enriched_data, risk_result, top_offer, all_offers)
    """

    def __init__(self, model=None, preprocessor=None):
        self._model = model
        self._preprocessor = preprocessor
        self._shap_explainer = None

        if USE_SHAP and model is not None:
            self._init_shap()

    def _init_shap(self) -> None:
        try:
            import shap
            self._shap_explainer = shap.Explainer(self._model)
            logger.info("SHAP explainer initialised.")
        except Exception as exc:
            logger.warning("SHAP init failed (%s) — falling back to rule-based.", exc)

    # ── Main entry ────────────────────────────────────────────────────────────

    def build(
        self,
        enriched_data: dict,
        risk_result,
        eligibility_result,
        top_scored_offer,
        all_scored_offers: list,
        feature_pipeline=None,
    ) -> Explanation:
        exp = Explanation()

        exp.eligibility_reasons = self._eligibility_reasons(eligibility_result)
        exp.risk_drivers = self._risk_drivers(enriched_data, risk_result, feature_pipeline)
        if top_scored_offer:
            exp.offer_reasons = self._offer_reasons(top_scored_offer, enriched_data, risk_result)
            exp.comparative_reasons = self._comparative_reasons(top_scored_offer, all_scored_offers)

        return exp

    # ── Eligibility reasons ───────────────────────────────────────────────────

    def _eligibility_reasons(self, eligibility_result) -> list[str]:
        if eligibility_result.is_eligible:
            return ["You meet all eligibility criteria for a personal loan."]
        return [
            f"❌ {r}" for r in (eligibility_result.failed_rules or [])
        ] + [eligibility_result.reason]

    # ── Risk drivers ──────────────────────────────────────────────────────────

    def _risk_drivers(self, enriched_data: dict, risk_result, feature_pipeline) -> list[dict]:
        if self._shap_explainer and feature_pipeline:
            return self._shap_drivers(enriched_data, feature_pipeline)
        return self._rule_based_drivers(enriched_data, risk_result)

    def _shap_drivers(self, enriched_data: dict, feature_pipeline) -> list[dict]:
        try:
            import shap
            X = feature_pipeline.to_model_input(enriched_data, self._preprocessor)
            shap_values = self._shap_explainer(X)
            vals = shap_values.values[0]
            feature_names = self._preprocessor.get_feature_names_out()

            indexed = sorted(
                zip(feature_names, vals), key=lambda x: abs(x[1]), reverse=True
            )[:MAX_SHAP_FEATURES]

            drivers = []
            for fname, impact in indexed:
                drivers.append({
                    "feature": fname,
                    "impact": round(float(impact), 4),
                    "direction": "increases_risk" if impact > 0 else "reduces_risk",
                })
            return drivers
        except Exception as exc:
            logger.warning("SHAP explanation failed: %s", exc)
            return self._rule_based_drivers(enriched_data, None)

    def _rule_based_drivers(self, enriched_data: dict, risk_result) -> list[dict]:
        drivers = []
        cs = enriched_data.get("credit_score", 650)
        emi_ratio = enriched_data.get("existing_emi_ratio", 0)
        active_loans = enriched_data.get("number_of_active_loans", 0)

        if cs >= 750:
            drivers.append({"feature": "credit_score", "impact": -0.3, "direction": "reduces_risk",
                            "note": f"Excellent credit score of {cs}"})
        elif cs < 650:
            drivers.append({"feature": "credit_score", "impact": 0.4, "direction": "increases_risk",
                            "note": f"Low credit score of {cs}"})

        if emi_ratio > 0.3:
            drivers.append({"feature": "existing_emi_ratio", "impact": 0.25, "direction": "increases_risk",
                            "note": f"Existing EMIs at {emi_ratio:.0%} of income"})

        if active_loans > 3:
            drivers.append({"feature": "number_of_active_loans", "impact": 0.15, "direction": "increases_risk",
                            "note": f"{active_loans} active loans"})

        income = enriched_data.get("monthly_income", 0)
        if income > 80_000:
            drivers.append({"feature": "monthly_income", "impact": -0.2, "direction": "reduces_risk",
                            "note": f"Strong monthly income of ₹{income:,.0f}"})

        return drivers[:MAX_SHAP_FEATURES]

    # ── Offer reasons ─────────────────────────────────────────────────────────

    def _offer_reasons(self, scored_offer, customer_data: dict, risk_result) -> list[str]:
        reasons = []
        offer = scored_offer.offer

        if scored_offer.need_match_score >= 0.95:
            reasons.append(f"✅ Covers your full requested amount of ₹{offer.offer_amount:,.0f}.")
        elif scored_offer.need_match_score >= 0.80:
            reasons.append(f"✅ Covers {scored_offer.need_match_score:.0%} of your requested amount.")

        if scored_offer.cost_score >= 0.80:
            reasons.append(f"✅ Low total interest cost of ₹{offer.total_interest:,.0f}.")

        if scored_offer.affordability_score >= 0.60:
            reasons.append(
                f"✅ EMI of ₹{offer.monthly_emi:,.0f}/month is comfortably within your budget."
            )

        if risk_result.risk_band == "LOW":
            reasons.append("✅ Your strong credit profile qualifies you for competitive rates.")

        if scored_offer.tenure_preference_score >= 0.90:
            reasons.append(f"✅ Tenure of {offer.tenure_months} months matches your preference.")

        return reasons[:_EXP.get("positive_reasons_limit", 5)]

    # ── Comparative reasons ───────────────────────────────────────────────────

    def _comparative_reasons(self, top_offer, all_offers: list) -> list[str]:
        if len(all_offers) <= 1:
            return []

        reasons = []
        others = [o for o in all_offers if o.offer.product_id != top_offer.offer.product_id]

        # Compare EMI
        avg_emi = sum(o.offer.monthly_emi for o in others) / len(others)
        if top_offer.offer.monthly_emi < avg_emi * 0.95:
            savings = avg_emi - top_offer.offer.monthly_emi
            reasons.append(
                f"Lower monthly EMI — saves ₹{savings:,.0f}/month vs alternatives."
            )

        # Compare total cost
        avg_interest = sum(o.offer.total_interest for o in others) / len(others)
        if top_offer.offer.total_interest < avg_interest * 0.95:
            savings = avg_interest - top_offer.offer.total_interest
            reasons.append(
                f"Lower total interest — saves ₹{savings:,.0f} over the loan tenure."
            )

        return reasons[:_EXP.get("comparative_reasons_limit", 3)]
