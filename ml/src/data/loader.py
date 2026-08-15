"""
src/data/loader.py  — artifact loader with aliases routes.py expects
"""
from __future__ import annotations
import json, logging
from functools import lru_cache
from pathlib import Path
from typing import Any
import joblib

log = logging.getLogger(__name__)

PROJECT_ROOT      = Path(__file__).resolve().parents[2]
MODEL_PATH        = PROJECT_ROOT / "models" / "risk_model"  / "risk_model.joblib"
PREPROCESSOR_PATH = PROJECT_ROOT / "models" / "risk_model"  / "preprocessor.joblib"
RANKING_PATH      = PROJECT_ROOT / "models" / "ranking_model" / "ranking_model.joblib"
PRODUCTS_PATH     = PROJECT_ROOT / "data"   / "raw"          / "loan_products.json"


@lru_cache(maxsize=1)
def load_risk_model() -> Any:
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Risk model not found: {MODEL_PATH}")
    log.info("Loading risk model from %s", MODEL_PATH)
    return joblib.load(MODEL_PATH)


# Alias used by routes.py
def load_risk_preprocessor() -> Any:
    return load_preprocessor()


@lru_cache(maxsize=1)
def load_preprocessor() -> Any:
    if not PREPROCESSOR_PATH.exists():
        raise FileNotFoundError(f"Preprocessor not found: {PREPROCESSOR_PATH}")
    log.info("Loading preprocessor from %s", PREPROCESSOR_PATH)
    return joblib.load(PREPROCESSOR_PATH)


@lru_cache(maxsize=1)
def load_ranking_model() -> Any | None:
    if not RANKING_PATH.exists():
        log.info("Ranking model not found — skipping (optional).")
        return None
    log.info("Loading ranking model from %s", RANKING_PATH)
    return joblib.load(RANKING_PATH)


@lru_cache(maxsize=1)
def load_loan_products() -> list[dict]:
    if not PRODUCTS_PATH.exists():
        raise FileNotFoundError(f"Loan products not found: {PRODUCTS_PATH}")
    log.info("Loading loan products from %s", PRODUCTS_PATH)
    with open(PRODUCTS_PATH, "r", encoding="utf-8") as f:
        products = json.load(f)
    if isinstance(products, dict) and "products" in products:
        products = products["products"]
    log.info("Loaded %d loan products.", len(products))
    return products


def artifacts_status() -> dict[str, bool]:
    return {
        "risk_model":    MODEL_PATH.exists(),
        "preprocessor":  PREPROCESSOR_PATH.exists(),
        "loan_products": PRODUCTS_PATH.exists(),
    }


def reload_all() -> dict[str, str]:
    load_risk_model.cache_clear()
    load_preprocessor.cache_clear()
    load_ranking_model.cache_clear()
    load_loan_products.cache_clear()
    log.info("All artifact caches cleared.")
    return {k: "cache cleared" for k in ["risk_model","preprocessor","ranking_model","loan_products"]}
