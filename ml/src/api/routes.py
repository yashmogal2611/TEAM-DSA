"""
Module 16 — FastAPI Routes
============================
Defines all HTTP endpoints and orchestrates the full
recommendation pipeline end-to-end.

Endpoints:
  POST /api/v1/recommend     → loan recommendation
  GET  /api/v1/health        → health + model status
  POST /api/v1/reload-models → hot-reload model artifacts
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path

import yaml
from fastapi import APIRouter, HTTPException, status

from src.affordability.affordability_engine import AffordabilityEngine
from src.api.schemas import (
    AffordabilitySummary,
    ExplanationResponse,
    HealthResponse,
    LoanOffer,
    LoanRecommendationRequest,
    LoanRecommendationResponse,
    RiskSummary,
    ScoreBreakdown,
)
from src.data.loader import (
    load_config,
    load_loan_products,
    load_ranking_model,
    load_risk_model,
    load_risk_preprocessor,
    reload_all,
)
from src.data.validator import CustomerInputValidator
from src.eligibility.eligibility_engine import EligibilityEngine
from src.explainability.explanation_builder import ExplanationBuilder
from src.features.feature_pipeline import FeaturePipeline
from src.pricing.pricing_engine import PricingEngine
from src.recommendation.candidate_generation import CandidateGenerator
from src.recommendation.ranking import RecommendationRanker
from src.recommendation.scoring import RecommendationScorer
from src.risk.predict import FallbackRiskPredictor, RiskPredictor

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["Loan Recommendation"])

_CFG = load_config()
_APP_VERSION = _CFG["app"]["version"]


# ── Singleton pipeline objects (initialised once on first request) ────────────

_pipeline: FeaturePipeline | None = None
_risk_predictor = None
_explainer: ExplanationBuilder | None = None


def _get_pipeline() -> FeaturePipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = FeaturePipeline()
    return _pipeline


def _get_risk_predictor():
    global _risk_predictor
    if _risk_predictor is None:
        try:
            model = load_risk_model()
            preprocessor = load_risk_preprocessor()
            _risk_predictor = RiskPredictor(model, preprocessor)
            logger.info("RiskPredictor initialised with trained model.")
        except FileNotFoundError:
            logger.warning("Trained risk model not found — using FallbackRiskPredictor.")
            _risk_predictor = FallbackRiskPredictor()
    return _risk_predictor


def _get_explainer() -> ExplanationBuilder:
    global _explainer
    if _explainer is None:
        try:
            model = load_risk_model()
            preprocessor = load_risk_preprocessor()
            _explainer = ExplanationBuilder(model=model, preprocessor=preprocessor)
        except FileNotFoundError:
            _explainer = ExplanationBuilder()
    return _explainer


# ── POST /recommend ───────────────────────────────────────────────────────────

@router.post(
    "/recommend",
    response_model=LoanRecommendationResponse,
    summary="Get personalised loan recommendations",
)
async def recommend_loans(request: LoanRecommendationRequest) -> LoanRecommendationResponse:
    request_id = str(uuid.uuid4())[:8]
    logger.info("[%s] New recommendation request received.", request_id)

    customer_data = request.model_dump()

    # ── Step 1: Business rule validation ──────────────────────────────────────
    validator = CustomerInputValidator()
    validation = validator.validate(customer_data)
    if not validation.is_valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"errors": [e.__dict__ for e in validation.errors]},
        )

    # ── Step 2: Feature pipeline ──────────────────────────────────────────────
    pipeline = _get_pipeline()
    enriched = pipeline.run(customer_data)

    # ── Step 3: Eligibility check ─────────────────────────────────────────────
    eligibility_engine = EligibilityEngine()
    eligibility = eligibility_engine.evaluate(enriched)

    if not eligibility.is_eligible:
        logger.info("[%s] Customer ineligible: %s", request_id, eligibility.failed_rules)
        explanation = _get_explainer().build(
            enriched_data=enriched,
            risk_result=None,
            eligibility_result=eligibility,
            top_scored_offer=None,
            all_scored_offers=[],
            feature_pipeline=pipeline,
        )
        return LoanRecommendationResponse(
            status="REJECTED",
            message=eligibility.reason,
            explanation=ExplanationResponse(**explanation.to_dict()),
            request_id=request_id,
        )

    # ── Step 4: Risk scoring ───────────────────────────────────────────────────
    risk_predictor = _get_risk_predictor()
    if isinstance(risk_predictor, FallbackRiskPredictor):
        risk_result = risk_predictor.predict(enriched)
    else:
        risk_result = risk_predictor.predict(enriched, pipeline)

    # ── Step 5: Candidate generation ──────────────────────────────────────────
    products = load_loan_products()
    candidates = CandidateGenerator().generate(products, enriched)

    if not candidates:
        return LoanRecommendationResponse(
            status="REJECTED",
            message="No loan products are currently available for your profile.",
            risk_summary=RiskSummary(**risk_result.to_dict()),
            request_id=request_id,
        )

    # ── Step 6: Pricing ───────────────────────────────────────────────────────
    pricing_engine = PricingEngine()
    priced_offers = pricing_engine.price(candidates, risk_result.risk_band, enriched)

    # ── Step 7: Affordability filter ──────────────────────────────────────────
    affordability_engine = AffordabilityEngine()
    affordability_result = affordability_engine.evaluate(enriched, priced_offers)

    if not affordability_result.affordable_offers:
        return LoanRecommendationResponse(
            status="REJECTED",
            message=(
                f"No loan offers are affordable within your budget. "
                f"Max affordable EMI: ₹{affordability_result.max_affordable_new_emi:,.0f}/month."
            ),
            risk_summary=RiskSummary(**risk_result.to_dict()),
            affordability_summary=AffordabilitySummary(**affordability_result.to_dict()),
            request_id=request_id,
        )

    # ── Step 8: Scoring ───────────────────────────────────────────────────────
    scorer = RecommendationScorer()
    scored_offers = scorer.score(
        offers=affordability_result.affordable_offers,
        customer_data=enriched,
        risk_result=risk_result,
        max_affordable_emi=affordability_result.max_affordable_new_emi,
    )

    # ── Step 9: Ranking ───────────────────────────────────────────────────────
    ranker = RecommendationRanker()
    top_offers = ranker.rank(
        scored_offers=scored_offers,
        primary_preference=enriched.get("primary_preference", "LOWEST_EMI"),
    )

    # ── Step 10: Explanations ─────────────────────────────────────────────────
    explainer = _get_explainer()
    explanation = explainer.build(
        enriched_data=enriched,
        risk_result=risk_result,
        eligibility_result=eligibility,
        top_scored_offer=top_offers[0] if top_offers else None,
        all_scored_offers=top_offers,
        feature_pipeline=pipeline,
    )

    # ── Build response ────────────────────────────────────────────────────────
    recommendation_list = [
        LoanOffer(
            **s.offer.to_dict(),
            scores=ScoreBreakdown(**s.to_dict()["scores"]),
            rank=i + 1,
        )
        for i, s in enumerate(top_offers)
    ]

    logger.info(
        "[%s] Recommendation complete: %d offers returned, top composite=%.3f",
        request_id,
        len(recommendation_list),
        top_offers[0].composite_score if top_offers else 0,
    )

    return LoanRecommendationResponse(
        status="APPROVED",
        message=f"Found {len(recommendation_list)} personalised loan offer(s) for you.",
        risk_summary=RiskSummary(**risk_result.to_dict()),
        affordability_summary=AffordabilitySummary(**affordability_result.to_dict()),
        recommendations=recommendation_list,
        explanation=ExplanationResponse(**explanation.to_dict()),
        request_id=request_id,
    )


# ── GET /health ───────────────────────────────────────────────────────────────

@router.get("/health", response_model=HealthResponse, summary="Health check")
async def health_check() -> HealthResponse:
    models_loaded = {
        "risk_model": Path(_CFG["paths"]["risk_model"]).exists(),
        "risk_preprocessor": Path(_CFG["paths"]["risk_preprocessor"]).exists(),
        "ranking_model": Path(_CFG["paths"]["ranking_model"]).exists(),
        "loan_products": Path(_CFG["paths"]["loan_products"]).exists(),
    }
    return HealthResponse(
        status="ok",
        version=_APP_VERSION,
        models_loaded=models_loaded,
    )


# ── POST /reload-models ───────────────────────────────────────────────────────

@router.post("/reload-models", summary="Hot-reload model artifacts from disk")
async def reload_models() -> dict:
    global _pipeline, _risk_predictor, _explainer
    reload_all()
    _pipeline = None
    _risk_predictor = None
    _explainer = None
    logger.info("All model artifacts reloaded.")
    return {"status": "ok", "message": "Model artifacts reloaded successfully."}
