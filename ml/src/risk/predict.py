"""
src/risk/predict.py  — RiskPredictor + FallbackRiskPredictor
"""
from __future__ import annotations
import logging
from pathlib import Path
from typing import Any
import numpy as np
import pandas as pd

log = logging.getLogger(__name__)

PROJECT_ROOT      = Path(__file__).resolve().parents[2]
MODEL_PATH        = PROJECT_ROOT / "models" / "risk_model" / "risk_model.joblib"
PREPROCESSOR_PATH = PROJECT_ROOT / "models" / "risk_model" / "preprocessor.joblib"

NUMERICAL_FEATURES = [
    "age","monthly_income","existing_monthly_emi","existing_emi_ratio",
    "loan_to_annual_income","credit_score","number_of_active_loans",
    "credit_card_outstanding","total_work_experience","current_employment_duration",
]
CATEGORICAL_FEATURES = ["employment_type","income_type","loan_purpose"]
ALL_FEATURES = NUMERICAL_FEATURES + CATEGORICAL_FEATURES

RISK_BAND_LOW    = 0.05
RISK_BAND_MEDIUM = 0.15


def _pd_to_risk_band(pd_value: float) -> str:
    if pd_value < RISK_BAND_LOW:    return "LOW"
    if pd_value < RISK_BAND_MEDIUM: return "MEDIUM"
    return "HIGH"


class RiskResult:
    """Wraps prediction output; provides .to_dict() for routes.py."""
    def __init__(self, pd_value, risk_band, risk_score, model_used="ml"):
        self.probability_of_default = pd_value
        self.risk_band  = risk_band
        self.risk_score = risk_score
        self.model_used = model_used

    def to_dict(self):
        return {
            "probability_of_default": self.probability_of_default,
            "risk_band":  self.risk_band,
            "risk_score": self.risk_score,
        }


class RiskPredictor:
    """
    Accepts model + preprocessor objects directly (injected by routes.py)
    OR loads them from disk if called without arguments.
    """
    def __init__(self, model=None, preprocessor=None):
        self._model        = model
        self._preprocessor = preprocessor

    def _ensure_loaded(self):
        if self._model is None:
            import joblib
            self._model        = joblib.load(MODEL_PATH)
            self._preprocessor = joblib.load(PREPROCESSOR_PATH)

    def predict(self, customer: dict[str, Any], pipeline=None) -> RiskResult:
        """
        pipeline arg is accepted but ignored — kept for routes.py compatibility.
        The preprocessor stored in self._preprocessor handles transformation.
        """
        self._ensure_loaded()
        row = {feat: customer.get(feat) for feat in ALL_FEATURES}
        df  = pd.DataFrame([row])
        X   = self._preprocessor.transform(df)
        pd_value = float(np.clip(self._model.predict_proba(X)[0][1], 0, 1))
        pd_value = round(pd_value, 4)
        return RiskResult(pd_value, _pd_to_risk_band(pd_value), round(1-pd_value,4), "ml")


class FallbackRiskPredictor:
    def predict(self, customer: dict[str, Any], pipeline=None) -> RiskResult:
        cs    = float(customer.get("credit_score", 650))
        ratio = float(customer.get("existing_emi_ratio", 0.3))
        loans = int(customer.get("number_of_active_loans", 1))
        logit = -3.0 + (750-cs)/150 + 1.5*ratio + 0.2*loans
        pd_value = round(float(np.clip(1/(1+np.exp(-logit)), 0.01, 0.95)), 4)
        log.warning("FallbackRiskPredictor used — NOT for production. PD=%.4f", pd_value)
        return RiskResult(pd_value, _pd_to_risk_band(pd_value), round(1-pd_value,4), "fallback")
