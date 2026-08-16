# Phase 3 External Changes

## Summary

Phase 3 required exactly **two external modifications** outside `backend/genai/chatbot/`.
Both are **additive only** — no existing lines were modified, deleted, or refactored.

Verified with: `git diff HEAD backend/main.py backend/routers/chat.py`

---

## Files Modified Outside `chatbot/`

### `backend/routers/chat.py`

**Reason:**
This file existed as a committed empty placeholder (0 bytes). It was
specifically reserved for Phase 3 in the repository layout.

**Exact change:**
Added 130 lines implementing:
- A `ChatRequest` Pydantic model (`question` + `recommendation_context`).
- The `POST /chat` FastAPI endpoint.
- Backend-grounding step: the endpoint calls `generate_shap_explanation()`
  (Phase 1 engine) on the incoming recommendation data, then replaces only
  the `risk_drivers` list with the backend-regenerated output. All other
  fields continue to originate from the validated ML pipeline response.
- A `TRUST BOUNDARY` docstring listing exactly which fields are backend-
  controlled and which are ML-pipeline-sourced.
- Error handling (HTTPException passthrough + generic 500).

**Impact:**
Registers the `POST /chat` endpoint. All existing endpoints are unaffected.

**Rollback:**
```bash
git restore backend/main.py backend/routers/chat.py
```

---

### `backend/main.py`

**Reason:**
FastAPI requires routers to be registered via `app.include_router()`.

**Exact change:**
Two lines added, zero existing lines modified:

```python
# Import (line ~26):
from routers.chat import router as chat_router  #genai phase3

# Registration (line ~51):
app.include_router(chat_router)  #genai phase3
```

**Impact:**
Registers the `POST /chat` endpoint. All existing routes unaffected.

**Rollback:**
```bash
git restore backend/main.py
```

---

## Files Added Outside `chatbot/`

None. `backend/routers/chat.py` was a pre-existing committed empty file.

---

## Dependencies Added

None.

---

## Environment Variables Added

None. `GEMINI_API_KEY` is already established by Phase 2.

---

## Trust Boundary Classification (Post-Audit)

After a field-by-field audit of `generate_shap_explanation()`,
`rank_risk_drivers()`, and `build_context()`, the accurate classification is:

### Backend-regenerated (1 field)

| Field | How |
|-------|-----|
| `explanation.risk_drivers` (selection + ordering) | `rank_risk_drivers()` filters by `MIN_SHAP_IMPORTANCE`, caps at `TOP_SHAP_FEATURES`, sorts by `abs(impact)`. The `feature`/`direction` values still originate from the ML payload, but the set and sequence is backend-controlled. |

### Schema-validated, ML-pipeline-sourced (all other fields)

| Field | Source |
|-------|--------|
| `status` | `LoanRecommendationResponse.status` |
| `risk_band`, `probability_of_default`, `risk_score` | `risk_summary.*` |
| `monthly_income`, `existing_monthly_emi`, `max_total_emi`, `max_affordable_new_emi` | `affordability_summary.*` |
| `rank` | `LoanOffer.rank` |
| `product_name` | `LoanOffer.product_name` |
| `lender_name` | `LoanOffer.lender_name` |
| `offer_amount` | `LoanOffer.offer_amount` |
| `tenure_months` | `LoanOffer.tenure_months` |
| `personalised_rate_pct` | `LoanOffer.personalised_rate` |
| `monthly_emi` | `LoanOffer.monthly_emi` |
| `total_repayment` | `LoanOffer.total_repayment` |
| `total_interest` | `LoanOffer.total_interest` |
| `processing_fee_amount` | `LoanOffer.processing_fee_amount` |
| `suitability_scores.*` (all 6) | `LoanOffer.scores.*` |
| `eligibility_reasons` | `ExplanationResponse.eligibility_reasons` |
| `offer_reasons` | `ExplanationResponse.offer_reasons` |
| `comparative_reasons` | `ExplanationResponse.comparative_reasons` |

### Not available in context

| Field | Note |
|-------|------|
| `dti` (standalone) | Not a direct field in `LoanRecommendationResponse`. An EMI ratio is computed inside `explain_affordability()` for text only, not exposed as a context number. |
| `emi_ratio` (standalone) | Same as above. |
| Raw SHAP impact values | Intentionally excluded from context dict even if present in `risk_drivers`. |
| `product_id` | Intentionally excluded (internal field). |

### Terminology used

Throughout the Phase 3 codebase, the context is referred to as
**"backend-grounded"**, not "fully-verified". This accurately reflects that:
- Pydantic validates structure and types.
- The Phase 1 engine controls which risk_drivers appear.
- All financial values (EMI, scores, rates, ranks) originate from the ML
  pipeline response and are not independently recalculated by the backend.

This is consistent with the established pattern of `/explanation` and `/summarize`.


## 2026-08-16 — Environment Configuration

### Modified: `backend/genai/config.py`

Added `python-dotenv` loading so the existing `GEMINI_API_KEY` configuration can be read from the local `backend/.env` file.

Change:
- Added `from dotenv import load_dotenv`
- Added `load_dotenv()`
- Existing `GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")` remains unchanged.

Reason:
- Previously, the Gemini API key had to be manually supplied as a PowerShell environment variable for every terminal session.
- The change provides persistent local development configuration through `.env`.

Security:
- The API key is stored locally in `backend/.env`.
- The API key is not hardcoded into Python source code.
- The `.env` file must not be committed to Git.

Impact:
- No chatbot logic changed.
- No recommendation logic changed.
- No Phase 1/Phase 2 logic changed.
- No new dependency was added because `python-dotenv` was already installed.

Rollback:
- Remove the `load_dotenv` import and `load_dotenv()` call from `backend/genai/config.py`.
- The application will return to reading `GEMINI_API_KEY` exclusively from the process environment.