import json

from google import genai

from .config import GEMINI_API_KEY, GEMINI_MODEL


SYSTEM_PROMPT = """
You are a loan recommendation summarizer.

Your job is to convert verified loan recommendation data into a short,
clear explanation for the user.

Rules:
- Use ONLY information present in the provided data.
- Never invent numbers, rates, scores, EMIs, lenders, features, or benefits.
- Never calculate or derive new financial values.
- Never guarantee loan approval.
- Do not make claims that are not directly supported by the input.
- Keep the response under 80 words.
- Return only the summary text.
"""


def summarize_recommendations(top_recommendations: list[dict]) -> str:
    if not top_recommendations:
        return "No suitable loan recommendations are available at this time."

    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured.")

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

    if not summary:
        raise RuntimeError("Gemini returned an empty summary.")

    return summary