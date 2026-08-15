"""
Module 5 — Feature Pipeline
============================
Thin orchestration layer that chains:
  DataPreprocessor → FeatureEngineer

Also builds the final numpy feature vector used by the risk model.
"""

from __future__ import annotations

import logging

import numpy as np
import yaml

from src.data.preprocessing import DataPreprocessor
from src.features.feature_engineering import FeatureEngineer

logger = logging.getLogger(__name__)

with open("config.yaml", "r") as _f:
    _CFG = yaml.safe_load(_f)

_RISK = _CFG["risk_model"]
NUMERICAL_FEATURES: list[str] = _RISK["numerical_features"]
CATEGORICAL_FEATURES: list[str] = _RISK["categorical_features"]


class FeaturePipeline:
    """
    Full feature pipeline: raw validated dict → enriched feature dict.

    Usage:
        pipeline = FeaturePipeline()
        enriched = pipeline.run(validated_data)
        X = pipeline.to_model_input(enriched, preprocessor)
    """

    def __init__(self):
        self._preprocessor = DataPreprocessor()
        self._engineer = FeatureEngineer()

    def run(self, validated_data: dict) -> dict:
        clean = self._preprocessor.process(validated_data)
        enriched = self._engineer.engineer(clean)
        return enriched

    def to_model_input(self, enriched: dict, sklearn_preprocessor) -> np.ndarray:
        """
        Converts enriched dict → 2D numpy array shaped (1, n_features)
        suitable for the sklearn/XGBoost risk model.

        sklearn_preprocessor: fitted ColumnTransformer that handles
        one-hot encoding of categoricals and scaling of numericals.
        """
        import pandas as pd

        row = {}
        for f in NUMERICAL_FEATURES:
            row[f] = enriched.get(f, 0.0)
        for f in CATEGORICAL_FEATURES:
            row[f] = enriched.get(f, "OTHER")

        df = pd.DataFrame([row])
        X = sklearn_preprocessor.transform(df)
        logger.debug("Model input shape: %s", X.shape)
        return X
