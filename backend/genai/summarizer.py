import json
from .config import GEMINI_API_KEY, GEMINI_MODEL


SYSTEM_PROMPT = """
You are a loan recommendation summarizer.

Your job is to convert verified loan recommendation data into a short,
clear explanation for the user.

Rules:
- Use ONLY information present in the provided data.
- Never invent numbers, rates, scores, EMIs, lenders, features, or benefits.
- Use numbers exactly as provided.
- Do not calculate or derive new financial values.
- When a field represents a percentage, preserve it as a percentage.
- Never guarantee loan approval.
- Do not make claims that are not directly supported by the input.
- Keep the response under 80 words.
- Return only the summary text.
- Prefer explaining why the recommendation is strong rather than listing every number.
"""


def generate_fallback_summary(top_recommendations: list[dict]) -> str:
    """Generate a structured, deterministic financial summary from verified recommendation data."""
    if not top_recommendations:
        return "No suitable loan recommendations are available at this time."
    
    top = top_recommendations[0]
    name = top.get("name", "Personalised Loan Offer")
    rate = top.get("interest_rate", 8.75)
    emi_val = top.get("emi_ratio", 0.25)
    emi_pct = round(emi_val * 100, 1) if emi_val <= 1.0 else round(emi_val, 1)
    reasons = top.get("reasons", [])
    
    reason_note = ""
    if reasons and len(reasons) > 0:
        clean_reason = reasons[0].rstrip(".")
        reason_note = f" Key advantage: {clean_reason}."
        
    return f"Based on your credit assessment, **{name}** emerges as your top recommendation with a competitive interest rate of **{rate}%** per annum. Your projected monthly obligations constitute **{emi_pct}%** of monthly income, remaining well within prudent debt-service limits.{reason_note}"


def summarize_recommendations(top_recommendations: list[dict]) -> str:
    if not top_recommendations:
        return "No suitable loan recommendations are available at this time."

    if not GEMINI_API_KEY:
        return generate_fallback_summary(top_recommendations)

    try:
        from google import genai
        client = genai.Client(api_key=GEMINI_API_KEY)

        prompt = f"""
{SYSTEM_PROMPT}

Verified recommendation data:
{json.dumps(top_recommendations, indent=2)}

Write the summary now.
"""
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )

        summary = (response.text or "").strip()
        if summary:
            return summary
        return generate_fallback_summary(top_recommendations)
    except Exception:
        return generate_fallback_summary(top_recommendations)