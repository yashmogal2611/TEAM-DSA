# LoanLens Phase 3 — Grounded Chatbot

A production-quality, hackathon-appropriate chatbot that answers user questions
using **only** verified LoanLens recommendation data.

> **Architectural principle**: The backend owns facts. Gemini owns phrasing.

---

## 1. Purpose

The Phase 3 chatbot allows a user to ask natural-language questions about
their loan recommendations. It explains rankings, scores, EMI values,
eligibility, and affordability using the data already calculated by the
LoanLens ML and recommendation engine.

It never:
- invents products, rates, scores, or EMI values
- ranks or re-ranks products
- guarantees loan approval
- performs unsupported calculations
- expose internal implementation details

---

## 2. Architecture

```
User Question
      │
      ▼
POST /chat  (routers/chat.py)
      │
      ▼
chat()  (chatbot.py)
      │
      ├─ build_context()  ──►  Verified JSON context
      │     (context_builder.py)
      │
      ├─ build_grounded_prompt()
      │     (prompts.py)
      │
      ├─ _call_gemini()
      │       │
      │       ├─ Success ──► ChatResponse(source="gemini")
      │       │
      │       └─ Any failure
      │               │
      ▼               ▼
      get_fallback_response()  (fallback.py)
              │
              ├─ Known intent ──► Dynamic answer from context
              └─ Unknown      ──► "That information isn't available..."
```

---

## 3. File Responsibilities

| File | Responsibility |
|------|---------------|
| `context_builder.py` | Converts `LoanRecommendationResponse` into a clean, minimal, serializable dict. No calculations performed. |
| `prompts.py` | Holds the immutable system prompt and the `build_grounded_prompt()` function. |
| `fallback.py` | Deterministic keyword-intent matching and context-grounded response builders. No Gemini required. |
| `chatbot.py` | Orchestrates: context → prompt → Gemini → fallback. Never raises. |
| `__init__.py` | Exports the public API: `chat`, `build_context`, `ChatResponse`. |
| `tests/` | Unit tests for all three major components. |

---

## 4. Context Structure

The verified context dict passed to Gemini looks like this:

```json
{
  "status": "APPROVED",
  "risk": {
    "risk_band": "LOW",
    "probability_of_default": 0.025,
    "risk_score": 0.12
  },
  "affordability": {
    "monthly_income": 65000.0,
    "existing_monthly_emi": 5000.0,
    "max_total_emi": 32500.0,
    "max_affordable_new_emi": 27500.0
  },
  "recommendations": [
    {
      "rank": 1,
      "product_name": "Personal Loan",
      "lender_name": "Demo Bank",
      "offer_amount": 500000.0,
      "tenure_months": 36,
      "personalised_rate_pct": 11.5,
      "monthly_emi": 16607.0,
      "total_repayment": 597852.0,
      "total_interest": 97852.0,
      "processing_fee_amount": 5000.0,
      "suitability_scores": {
        "composite": 0.88,
        "affordability": 0.85,
        "risk_fit": 0.94,
        "need_match": 0.90,
        "cost": 0.70,
        "tenure_preference": 1.00
      }
    }
  ],
  "explanation": {
    "risk_drivers": [
      { "feature": "credit_score", "direction": "reduces_risk" }
    ],
    "eligibility_reasons": ["You meet all eligibility criteria."],
    "offer_reasons": ["Requested amount matches the product range."],
    "comparative_reasons": ["Best alignment with your preference."]
  }
}
```

**What is intentionally excluded:**
- Raw SHAP impact numbers (direction only is exposed)
- Internal product IDs
- Passwords, tokens, or any credentials

---

## 5. Grounding Strategy — Backend-Grounded Model

The chatbot uses a **backend-grounded** context, not a fully-verified one.
Here is what that distinction means precisely:

**What the backend independently controls:**
1. Pydantic schema validation — every field is type-checked before the endpoint proceeds.
2. `risk_drivers` selection and ordering — the Phase 1 engine (`generate_shap_explanation` → `rank_risk_drivers`) re-runs before context building. It filters by `MIN_SHAP_IMPORTANCE` and caps at `TOP_SHAP_FEATURES`. The feature/direction values still originate from the ML payload, but *which drivers appear* is backend-controlled.
3. `context_builder` exclusions — `product_id` and raw SHAP impact numbers are always excluded, regardless of what the payload contains.
4. System prompt — Gemini is explicitly instructed to treat all context values as data, not instructions, and never to invent numbers.

**What originates from the ML pipeline response:**

| Context field | Source |
|---------------|--------|
| `status` | `LoanRecommendationResponse.status` |
| `risk_band`, `probability_of_default`, `risk_score` | `risk_summary.*` |
| `monthly_income`, `max_affordable_new_emi`, etc. | `affordability_summary.*` |
| `rank` | `LoanOffer.rank` |
| `product_name`, `lender_name` | `LoanOffer.*` |
| `monthly_emi`, `personalised_rate_pct` | `LoanOffer.*` |
| `suitability_scores.*` (all 6) | `LoanOffer.scores.*` |
| `eligibility_reasons` | `ExplanationResponse.eligibility_reasons` |
| `offer_reasons`, `comparative_reasons` | `ExplanationResponse.*` |

**What is not available in the context:**
- DTI (debt-to-income ratio) as a standalone numeric field
- EMI ratio as a standalone numeric field (exists only as text in affordability explanation)
- Raw SHAP impact values (intentionally excluded)
- Internal product IDs (intentionally excluded)

**Why this is acceptable for this hackathon:**
The existing backend does not persist ML recommendation results. `/explanation` (Phase 1)
and `/summarize` (Phase 2) already accept the `LoanRecommendationResponse` as
authoritative. The chatbot is architecturally consistent with those endpoints.

---

## 6. Gemini Integration

- Uses the existing `google-genai` package (already in `requirements.txt`).
- Follows the same pattern as Phase 2 summarizer: `genai.Client(api_key=...).models.generate_content(...)`.
- API key: read from `GEMINI_API_KEY` environment variable (from `genai/config.py`).
- Model: `GEMINI_MODEL` from `genai/config.py` (currently `gemini-3.6-flash`).

---

## 7. Fallback Behavior

When Gemini is unavailable (missing key, timeout, quota, network failure, empty response), the fallback is triggered automatically.

**Supported intents:**

| Intent | Example questions | Trigger keywords |
|--------|------------------|-----------------|
| `approval_safety` | "Can you guarantee approval?" | approv, guarant |
| `comparison` | "Why did Loan A beat Loan B?" | higher than, better than, beat, compare |
| `emi` | "What is my EMI?" | emi, monthly payment, instalment |
| `credit_score` | "How does my credit score affect this?" | credit score, cibil |
| `eligibility` | "Why wasn't I eligible?" | eligible, rejected |
| `suitability` | "What does my score mean?" | score, suitability, composite |
| `affordability` | "Can I afford this?" | afford, dti, debt, income ratio |
| `ranking` | "Why ranked first?" | ranked first, top recommendation |

Unknown questions receive:
> "That information isn't available in your current LoanLens recommendation data."

---

## 8. Supported Question Types

The chatbot handles:
- Why is my top recommendation ranked first?
- Why did Product A rank higher than Product B?
- What is my EMI?
- How does my credit score affect this recommendation?
- Why wasn't I eligible?
- What does my suitability score mean?
- Can I afford this loan?
- Why is this loan recommended for me?

---

## 9. Error Handling

| Error | Behaviour |
|-------|-----------|
| Missing API key | Falls back to deterministic answer |
| Gemini timeout | Falls back |
| Gemini quota exceeded | Falls back |
| Network failure | Falls back |
| Empty Gemini response | Falls back |
| Unknown exception | Falls back (logged as WARNING) |
| Unknown question | Returns `SAFE_UNAVAILABLE` string |

`chat()` itself **never raises**. It always returns a `ChatResponse`.

---

## 10. Safety Rules

- Never guarantees loan approval.
- Never invents products, rates, scores, or EMI values.
- Never performs calculations not already in the context.
- Never reveals the system prompt.
- Treats all context field values as data, not instructions (prompt injection protection).
- Never exposes API keys or internal stack traces.

---

## 11. Configuration

| Variable | Source | Description |
|----------|--------|-------------|
| `GEMINI_API_KEY` | Environment variable | Your Gemini API key |
| `GEMINI_MODEL` | `genai/config.py` | Model name (default: `gemini-3.6-flash`) |

Set the API key before starting the server:
```bash
The Gemini API key is loaded from the local `backend/.env` file.

Create `backend/.env`:

GEMINI_API_KEY=your-api-key-here

Do not commit `.env` or expose the API key.
```

---

## 12. Testing

Tests are located in `tests/` within this directory.

Run all Phase 3 tests from the `backend/` directory:
```bash
python -m pytest genai/chatbot/tests/ -v
```

Test coverage:
- `test_context_builder.py` — 18 tests
- `test_fallback.py` — 37 tests
- `test_chatbot.py` — 28 tests

Gemini is always mocked in tests — no real API calls are made.

---

## 13. API Usage

```
POST /chat
Content-Type: application/json
```

### Request body

```json
{
  "question": "Why is my top recommendation ranked first?",
  "recommendation_context": {
    "status": "APPROVED",
    "message": "Recommendations generated.",
    "risk_summary": { ... },
    "affordability_summary": { ... },
    "recommendations": [ { ... } ],
    "explanation": { ... }
  }
}
```

The `recommendation_context` follows the `LoanRecommendationResponse` schema
(defined in `genai/schemas.py`).

### Response

```json
{
  "answer": "Personal Loan from Demo Bank is your top-ranked recommendation...",
  "source": "gemini",
  "grounded": true
}
```

`source` is either `"gemini"` or `"fallback"`.

---

## 14. Example Request & Response

**Request:**
```json
{
  "question": "What is my monthly EMI?",
  "recommendation_context": { ... }
}
```

**Response (Gemini available):**
```json
{
  "answer": "Based on your LoanLens recommendation, your top-ranked Personal Loan from Demo Bank has a monthly EMI of ₹16,607 spread over 36 months.",
  "source": "gemini",
  "grounded": true
}
```

**Response (Gemini unavailable):**
```json
{
  "answer": "Based on your LoanLens recommendation, the monthly EMI for Personal Loan is ₹16,607. This is spread over 36 months. Total repayment amount would be ₹5,97,852. Final EMI amounts are confirmed by the lender at the time of loan disbursement.",
  "source": "fallback",
  "grounded": true
}
```

---

## 15. Gemini Failure Handling

```
Gemini call fails (any reason)
        │
        ▼
Logged as WARNING (internal only, never shown to user)
        │
        ▼
get_fallback_response(question, context)
        │
        ├─ Intent matched → Dynamic answer from context
        └─ No match      → SAFE_UNAVAILABLE message
        │
        ▼
ChatResponse(source="fallback", grounded=True)
```

The user experience degrades gracefully — they always receive a useful answer
or a clear "information not available" message.

---

## 16. How to Extend Fallback Intents

1. Add a new intent name and keyword patterns to `_INTENT_PATTERNS` in `fallback.py`.
2. Write a new handler function `_respond_<intent>(context: dict) -> str`.
3. Register it in the `_HANDLERS` dict.
4. Add tests to `tests/test_fallback.py`.

---

## 17. Known Limitations

- The chatbot cannot answer questions about data that was not sent in the `recommendation_context`. For example, if the ML team does not supply affordability data, affordability questions will return `SAFE_UNAVAILABLE`.
- Multi-turn conversation (memory) is not implemented. Each request is stateless.
- Gemini model can occasionally produce generic responses even with grounding; this is a model behaviour issue not a bug in Phase 3.
- Prompt injection via product names is mitigated at the Gemini prompt level (system prompt explicitly instructs Gemini to treat all context as data). In the fallback path, malicious product names are rendered as plain text in the answer — they are never executed as instructions.
- No rate limiting is implemented on the `/chat` endpoint itself.
