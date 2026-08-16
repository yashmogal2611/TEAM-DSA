"""
chatbot.py — Phase 3: Grounded Chatbot

Orchestrates the full chatbot request:

    1. Build verified context from the ML recommendation response.
    2. Build a grounded Gemini prompt.
    3. Call Gemini.
    4. On any Gemini failure → try deterministic fallback.
    5. Return a structured ChatResponse.

Gemini is used only for natural-language phrasing.
It cannot change facts, rankings, or numbers.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Literal

from pydantic import BaseModel

from genai.config import GEMINI_API_KEY, GEMINI_MODEL
from genai.schemas import LoanRecommendationResponse

from .context_builder import build_context
from .fallback import FALLBACK_SOURCE, SAFE_UNAVAILABLE, get_fallback_response
from .prompts import build_grounded_prompt

logger = logging.getLogger(__name__)

# Source label for a successful Gemini response
GEMINI_SOURCE: Literal["gemini"] = "gemini"


# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------

class ChatResponse(BaseModel):
    """Structured response returned by the chatbot endpoint."""

    answer: str
    source: Literal["gemini", "fallback"]
    grounded: bool = True


# ---------------------------------------------------------------------------
# Gemini call
# ---------------------------------------------------------------------------

def _call_gemini(prompt: str) -> str:
    """
    Call the Gemini API and return the response text.

    Uses the same client pattern as the existing Phase 2 summarizer
    (genai.Client from google-genai).

    Raises:
        RuntimeError: if the API key is missing, the response is empty,
                      or any API/network error occurs.
    """
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured.")

    # Import lazily so that the rest of the module can be used/tested
    # even without the google-genai package installed.
    try:
        from google import genai  # type: ignore[import]
    except ImportError as exc:
        raise RuntimeError(
            "google-genai package is not installed. "
            "Run: pip install google-genai"
        ) from exc

    client = genai.Client(api_key=GEMINI_API_KEY)

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
    )

    text = (response.text or "").strip()
    if not text:
        raise RuntimeError("Gemini returned an empty response.")

    return text


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def chat(
    question: str,
    recommendation_data: LoanRecommendationResponse,
) -> ChatResponse:
    """
    Main chatbot entry point.

    Args:
        question:             The user's question (treated as untrusted text).
        recommendation_data:  Validated LoanRecommendationResponse from the
                              ML / recommendation backend.

    Returns:
        ChatResponse with the answer, source label, and grounded=True.

    This function never raises. On any failure it falls back deterministically.
    """

    # ── Step 1: Build verified context ────────────────────────────────────
    context: Dict[str, Any] = build_context(recommendation_data)
    context_json = json.dumps(context, indent=2, ensure_ascii=True)

    # ── Step 2: Try Gemini ────────────────────────────────────────────────
    try:
        prompt = build_grounded_prompt(question, context_json)
        answer = _call_gemini(prompt)
        return ChatResponse(answer=answer, source=GEMINI_SOURCE, grounded=True)

    except Exception as exc:  # noqa: BLE001
        # Log the failure for ops visibility but never expose it to the user.
        logger.warning(
            "Gemini call failed — activating fallback. Reason: %s",
            type(exc).__name__,
        )

    # ── Step 3: Deterministic fallback ────────────────────────────────────
    fallback_answer = get_fallback_response(question, context)
    return ChatResponse(
        answer=fallback_answer,
        source=FALLBACK_SOURCE,
        grounded=True,
    )
