from typing import List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

try:
    from ..genai.summarizer import summarize_recommendations
except (ImportError, ValueError):
    try:
        from genai.summarizer import summarize_recommendations
    except Exception:
        from backend.genai.summarizer import summarize_recommendations


router = APIRouter(prefix="/summarize", tags=["GenAI"])


class Recommendation(BaseModel):
    name: str
    score: float
    interest_rate: float
    emi_ratio: float
    reasons: List[str] = Field(default_factory=list)


class SummarizeRequest(BaseModel):
    top_recommendations: List[Recommendation] = Field(default_factory=list)


class SummarizeResponse(BaseModel):
    ai_summary: str


@router.post("", response_model=SummarizeResponse)
def summarize(request: SummarizeRequest):
    try:
        recommendations = [
            recommendation.model_dump()
            for recommendation in request.top_recommendations
        ]

        summary = summarize_recommendations(recommendations)

        return SummarizeResponse(ai_summary=summary)

    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate summary: {str(exc)}",
        )