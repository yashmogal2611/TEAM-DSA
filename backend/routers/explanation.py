from fastapi import APIRouter, HTTPException

from genai.explanation import generate_shap_explanation
from genai.schemas import (
    ExplanationOutput,
    LoanRecommendationResponse,
)


router = APIRouter(
    prefix="/explanation",
    tags=["GenAI"],
)


@router.post(
    "",
    response_model=ExplanationOutput,
)
def generate_explanation(
    request: LoanRecommendationResponse,
):
    """
    Generate deterministic Phase 1 explanations from the
    ML team's LoanRecommendationResponse.
    """

    try:
        return generate_shap_explanation(request)

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate explanation: {str(exc)}",
        )