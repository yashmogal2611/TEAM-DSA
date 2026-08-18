"""
routers/chat.py — Phase 3: Grounded Chatbot

FastAPI router for POST /chat.

TRUST BOUNDARY — backend-grounded model
-----------------------------------------
This endpoint uses a "backend-grounded" context, not a "fully-verified" one.
Here is what that means precisely:

What the backend independently controls:
  • Pydantic schema validation (LoanRecommendationResponse field types/ranges).
  • risk_drivers selection and ordering: the Phase 1 engine
    (generate_shap_explanation → rank_risk_drivers) filters by
    MIN_SHAP_IMPORTANCE and caps at TOP_SHAP_FEATURES, then replaces the
    incoming risk_drivers list. Feature/direction values still originate from
    the ML payload, but WHICH drivers appear and in what order is backend-
    controlled.
  • context_builder filtering: product_id and raw SHAP impact numbers are
    excluded from the context dict regardless of what the payload contains.
  • System prompt: Gemini is instructed to treat all context values as data.

What comes from the ML pipeline response (client-supplied):
  • product names, lender names
  • rank values
  • suitability/composite scores and sub-scores
  • EMI, interest rate, offer amount, tenure
  • affordability values (monthly_income, max_affordable_new_emi, etc.)
  • eligibility status (APPROVED / REJECTED)
  • eligibility_reasons, offer_reasons, comparative_reasons strings
  • risk_summary (risk_band, probability_of_default, risk_score)

Why this is acceptable for this hackathon:
  The existing LoanLens backend does not persist ML recommendation results.
  /explanation (Phase 1) and /summarize (Phase 2) already follow this same
  pattern: they accept the LoanRecommendationResponse as authoritative.
  This chatbot is architecturally consistent with those endpoints.

External change note (see CHANGELOG.md):
  This file was previously an empty placeholder (0 bytes).
  It was filled as the minimum required integration point for Phase 3.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

try:
    from ..genai.chatbot.chatbot import ChatResponse, chat
    from ..genai.explanation import generate_shap_explanation
    from ..genai.schemas import LoanRecommendationResponse
except (ImportError, ValueError):
    try:
        from genai.chatbot.chatbot import ChatResponse, chat
        from genai.explanation import generate_shap_explanation
        from genai.schemas import LoanRecommendationResponse
    except Exception:
        from backend.genai.chatbot.chatbot import ChatResponse, chat
        from backend.genai.explanation import generate_shap_explanation
        from backend.genai.schemas import LoanRecommendationResponse


router = APIRouter(prefix="/chat", tags=["GenAI"])


# ---------------------------------------------------------------------------
# Request schema
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    """
    Chatbot request body.

    Fields:
        question:               The user's natural-language question.
        recommendation_context: The full ML LoanRecommendationResponse,
                                as returned by the ML recommendation pipeline.
                                This is the same object already used by
                                POST /explanation and POST /summarize.
    """

    question: str
    recommendation_context: LoanRecommendationResponse


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("", response_model=ChatResponse)
def ask_chatbot(request: ChatRequest) -> ChatResponse:
    """
    Answer a user question using a backend-grounded chatbot context.

    The recommendation_context is passed through the Phase 1 explanation
    engine before context building. This causes the risk_drivers list in
    the chatbot context to be backend-regenerated (filtered/re-sorted by
    absolute SHAP impact). All other recommendation values — product names,
    ranks, scores, EMI, interest rates, affordability — originate from the
    ML pipeline response supplied in the request body and are Pydantic-
    validated for structural correctness.

    See context_builder.py module docstring for the per-field trust
    classification.

    - Attempts to use Gemini for natural-language explanation.
    - Falls back to deterministic response on any Gemini failure.
    - Never fabricates facts, scores, rates, or product names.
    - Never guarantees loan approval.
    """

    try:
        # ── Backend-grounding step: run the Phase 1 explanation engine.
        #    generate_shap_explanation() reads data.explanation.risk_drivers,
        #    filters by MIN_SHAP_IMPORTANCE, caps at TOP_SHAP_FEATURES, and
        #    re-sorts by absolute impact.
        #    The result (phase1_output.top_factors) replaces the incoming
        #    risk_drivers so the chatbot context reflects backend-controlled
        #    driver selection — not arbitrary client-supplied ordering.
        #    All other fields (product names, ranks, scores, EMI, etc.)
        #    continue to originate from the incoming ML pipeline response.
        phase1_output = generate_shap_explanation(request.recommendation_context)

        # Replace only risk_drivers with the backend-regenerated list.
        # All other explanation fields and all recommendation fields are
        # carried through from the validated ML pipeline response.
        grounded_data = request.recommendation_context.model_copy(
            update={
                "explanation": request.recommendation_context.explanation.model_copy(
                    update={
                        "risk_drivers": phase1_output.top_factors,
                    }
                )
            }
        )

        return chat(
            question=request.question,
            recommendation_data=grounded_data,
        )

    except HTTPException:
        raise

    except Exception as exc:
        # chat() itself never raises, so this only catches unexpected errors
        # in the phase1 step or model_copy.
        raise HTTPException(
            status_code=500,
            detail=f"Chatbot error: {type(exc).__name__}",
        )
