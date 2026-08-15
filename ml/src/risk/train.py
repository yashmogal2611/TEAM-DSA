"""
src/risk/train.py
-----------------
Trains the Probability of Default (PD) risk model.

Pipeline
--------
1. Load training CSV
2. Select numerical + categorical features
3. Train/test split (stratified)
4. ColumnTransformer  →  StandardScaler  +  OneHotEncoder
5. XGBoostClassifier  (with class_weight balancing)
6. CalibratedClassifierCV  (isotonic)
7. Evaluate  →  ROC-AUC, classification report, calibration check
8. Save  →  models/risk_model/risk_model.joblib
            models/risk_model/preprocessor.joblib

Usage
-----
    python -m src.risk.train                        # default CSV path
    python -m src.risk.train --data path/to/data.csv
    python -m src.risk.train --data path/to/data.csv --no-calibration
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.compose import ColumnTransformer
from sklearn.metrics import (
    classification_report,
    roc_auc_score,
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBClassifier

warnings.filterwarnings("ignore", category=UserWarning)

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────────────────────
PROJECT_ROOT   = Path(__file__).resolve().parents[2]
DEFAULT_DATA   = PROJECT_ROOT / "data" / "processed" / "loan_training_data.csv"
MODEL_DIR      = PROJECT_ROOT / "models" / "risk_model"
MODEL_PATH     = MODEL_DIR / "risk_model.joblib"
PREPROCESSOR_PATH = MODEL_DIR / "preprocessor.joblib"

# ── Feature lists (must match FeatureEngineer output + DataPreprocessor) ──────
NUMERICAL_FEATURES = [
    "age",
    "monthly_income",
    "existing_monthly_emi",
    "existing_emi_ratio",
    "loan_to_annual_income",
    "credit_score",
    "number_of_active_loans",
    "credit_card_outstanding",
    "total_work_experience",
    "current_employment_duration",
]

CATEGORICAL_FEATURES = [
    "employment_type",
    "income_type",
    "loan_purpose",
]

TARGET = "default_flag"


# ─────────────────────────────────────────────────────────────────────────────
# Data loading
# ─────────────────────────────────────────────────────────────────────────────

def load_data(csv_path: str | Path) -> pd.DataFrame:
    """Load and do basic sanity checks on the training CSV."""
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"Training data not found: {path}")

    df = pd.read_csv(path)
    log.info("Loaded %d rows × %d columns from %s", *df.shape, path)

    # Validate required columns
    required = set(NUMERICAL_FEATURES + CATEGORICAL_FEATURES + [TARGET])
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Training CSV is missing columns: {missing}")

    # Drop rows where target is null
    before = len(df)
    df = df.dropna(subset=[TARGET])
    dropped = before - len(df)
    if dropped:
        log.warning("Dropped %d rows with null target.", dropped)

    log.info(
        "Class distribution — default=1: %.2f%%  default=0: %.2f%%",
        df[TARGET].mean() * 100,
        (1 - df[TARGET].mean()) * 100,
    )
    return df


# ─────────────────────────────────────────────────────────────────────────────
# Preprocessor
# ─────────────────────────────────────────────────────────────────────────────

def build_preprocessor() -> ColumnTransformer:
    """
    ColumnTransformer that matches what feature_pipeline.py expects:
      - StandardScaler on numerical features
      - OneHotEncoder (handle_unknown='ignore') on categorical features
    """
    return ColumnTransformer(
        transformers=[
            (
                "num",
                StandardScaler(),
                NUMERICAL_FEATURES,
            ),
            (
                "cat",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                CATEGORICAL_FEATURES,
            ),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Model
# ─────────────────────────────────────────────────────────────────────────────

def build_xgb_model(scale_pos_weight: float = 1.0) -> XGBClassifier:
    """
    XGBoost binary classifier.

    Key hyperparameters:
      - n_estimators=400  : enough trees without over-fitting on typical loan data
      - max_depth=4       : shallow trees → less over-fit, better calibration
      - learning_rate=0.05: slow learning → more robust
      - subsample / colsample_bytree: row/col sampling for regularisation
      - scale_pos_weight  : handles class imbalance (n_neg / n_pos)
      - eval_metric='auc' : optimises for ranking as well as classification
    """
    return XGBClassifier(
        n_estimators=400,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=5,
        gamma=1.0,
        reg_alpha=0.1,
        reg_lambda=1.0,
        scale_pos_weight=scale_pos_weight,
        use_label_encoder=False,
        eval_metric="auc",
        random_state=42,
        n_jobs=-1,
        verbosity=0,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Training
# ─────────────────────────────────────────────────────────────────────────────

def train(
    csv_path: str | Path = DEFAULT_DATA,
    calibrate: bool = True,
    test_size: float = 0.2,
    random_state: int = 42,
) -> dict:
    """
    Full training pipeline.

    Returns a dict with evaluation metrics and saved artifact paths.
    """
    t0 = time.time()

    # 1. Load data
    df = load_data(csv_path)
    X = df[NUMERICAL_FEATURES + CATEGORICAL_FEATURES].copy()
    y = df[TARGET].astype(int)

    # 2. Train / test split (stratified to preserve class ratio)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=test_size,
        stratify=y,
        random_state=random_state,
    )
    log.info(
        "Split → train=%d  test=%d  (%.0f%% / %.0f%%)",
        len(X_train), len(X_test),
        (1 - test_size) * 100, test_size * 100,
    )

    # 3. Build + fit preprocessor on training data only
    log.info("Fitting ColumnTransformer (StandardScaler + OneHotEncoder) …")
    preprocessor = build_preprocessor()
    X_train_t = preprocessor.fit_transform(X_train)
    X_test_t  = preprocessor.transform(X_test)

    feature_names = preprocessor.get_feature_names_out()
    log.info("Feature matrix shape after transform: %s", X_train_t.shape)
    log.info("Features (%d): %s", len(feature_names), list(feature_names))

    # 4. Compute class imbalance weight
    n_neg = int((y_train == 0).sum())
    n_pos = int((y_train == 1).sum())
    spw   = round(n_neg / max(n_pos, 1), 2)
    log.info("scale_pos_weight = %.2f  (neg=%d / pos=%d)", spw, n_neg, n_pos)

    # 5. Build XGBoost model
    xgb_model = build_xgb_model(scale_pos_weight=spw)

    # 6. Cross-validation (5-fold) for honest AUC estimate
    log.info("Running 5-fold cross-validation …")
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=random_state)
    cv_aucs = cross_val_score(
        xgb_model, X_train_t, y_train,
        cv=cv, scoring="roc_auc", n_jobs=-1,
    )
    log.info(
        "CV ROC-AUC: %.4f ± %.4f  (folds: %s)",
        cv_aucs.mean(), cv_aucs.std(),
        [f"{v:.4f}" for v in cv_aucs],
    )

    # 7. Fit final model on full training set
    log.info("Fitting final XGBoost model on full training set …")
    xgb_model.fit(X_train_t, y_train)

    # 8. Optional isotonic calibration
    if calibrate:
        log.info("Calibrating model with isotonic regression …")
        final_model = CalibratedClassifierCV(
            estimator=xgb_model,
            method="isotonic",
            cv=3,
        )
        final_model.fit(X_train_t, y_train)
    else:
        log.info("Skipping calibration (--no-calibration flag set).")
        final_model = xgb_model

    # 9. Evaluate on held-out test set
    log.info("Evaluating on test set …")
    y_prob = final_model.predict_proba(X_test_t)[:, 1]
    y_pred = (y_prob >= 0.5).astype(int)

    roc_auc  = roc_auc_score(y_test, y_prob)
    avg_prec = average_precision_score(y_test, y_prob)
    brier    = brier_score_loss(y_test, y_prob)
    cm       = confusion_matrix(y_test, y_pred)
    cr       = classification_report(y_test, y_pred, target_names=["No Default", "Default"])

    log.info("=" * 60)
    log.info("TEST SET EVALUATION")
    log.info("=" * 60)
    log.info("ROC-AUC             : %.4f", roc_auc)
    log.info("Average Precision   : %.4f", avg_prec)
    log.info("Brier Score         : %.4f  (lower=better, 0=perfect)", brier)
    log.info("Confusion Matrix    :\n%s", cm)
    log.info("Classification Report:\n%s", cr)

    # 10. Calibration check — compare mean predicted PD to actual default rate
    fraction_of_pos, mean_pred_value = calibration_curve(y_test, y_prob, n_bins=10)
    log.info("Calibration check (predicted vs actual default rate per bin):")
    for pred_val, actual in zip(mean_pred_value, fraction_of_pos):
        log.info("  predicted=%.3f  actual=%.3f  diff=%.3f", pred_val, actual, pred_val - actual)

    # 11. Save artifacts
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(final_model,   MODEL_PATH,        compress=3)
    joblib.dump(preprocessor,  PREPROCESSOR_PATH, compress=3)

    elapsed = time.time() - t0
    log.info("=" * 60)
    log.info("Artifacts saved:")
    log.info("  Risk model    → %s", MODEL_PATH)
    log.info("  Preprocessor  → %s", PREPROCESSOR_PATH)
    log.info("Training completed in %.1f seconds.", elapsed)
    log.info("=" * 60)

    return {
        "roc_auc"          : round(roc_auc, 4),
        "avg_precision"    : round(avg_prec, 4),
        "brier_score"      : round(brier, 4),
        "cv_auc_mean"      : round(cv_aucs.mean(), 4),
        "cv_auc_std"       : round(cv_aucs.std(),  4),
        "model_path"       : str(MODEL_PATH),
        "preprocessor_path": str(PREPROCESSOR_PATH),
        "calibrated"       : calibrate,
        "train_samples"    : len(X_train),
        "test_samples"     : len(X_test),
        "default_rate_train": round(y_train.mean(), 4),
    }


# ─────────────────────────────────────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train the Probability of Default risk model."
    )
    parser.add_argument(
        "--data",
        type=str,
        default=str(DEFAULT_DATA),
        help=f"Path to training CSV. Default: {DEFAULT_DATA}",
    )
    parser.add_argument(
        "--no-calibration",
        action="store_true",
        default=False,
        help="Disable isotonic calibration (useful for fast iteration).",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    results = train(
        csv_path=args.data,
        calibrate=not args.no_calibration,
    )
    log.info("Final metrics: %s", results)
