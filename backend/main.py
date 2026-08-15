"""
main.py – Loan Management API
FastAPI application entry point.
Includes:
  • Existing /recommend + /contacts endpoints (unchanged)
  • NEW /auth/*   – user registration & login
  • NEW /loans/*  – user: apply for loan, view own applications
  • NEW /admin/*  – admin: view all applications, approve / reject, stats
"""

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from schemas import LoanRequest, LoanResponse, RecommendationItem, ExplanationFactor
from database import init_db, get_db, LoanSubmission, User
from auth import hash_password

# Routers
from routers.auth_router import router as auth_router
from routers.user_router import router as user_router
from routers.admin_router import router as admin_router

from routers.summarize import router as summarize_router #genai
from routers.explanation import router as explanation_router #genai
from routers.chat import router as chat_router #genai phase3

# ── App setup ─────────────────────────────────────────────────
app = FastAPI(
    title="Loan Management API",
    description=(
        "Backend for a loan management system with user auth, "
        "loan applications, and admin approval workflow."
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten before production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register routers ──────────────────────────────────────────
app.include_router(auth_router)
app.include_router(user_router)
app.include_router(admin_router)
app.include_router(summarize_router) #genai
app.include_router(explanation_router) #genai
app.include_router(chat_router) #genai phase3



# ── Startup: init DB + seed default admin ─────────────────────
ADMIN_EMAIL = "admin@loanapp.com"
ADMIN_PASSWORD = "Admin@123"


@app.on_event("startup")
def startup():
    init_db()
    _seed_admin()


def _seed_admin():
    """Create the default admin account on first startup (idempotent)."""
    db: Session = next(get_db())
    try:
        existing = db.query(User).filter(User.email == ADMIN_EMAIL).first()
        if not existing:
            admin = User(
                full_name="System Admin",
                email=ADMIN_EMAIL,
                hashed_password=hash_password(ADMIN_PASSWORD),
                is_admin=True,
            )
            db.add(admin)
            db.commit()
            print(f"[OK] Default admin created -> {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        else:
            print(f"[INFO] Admin already exists -> {ADMIN_EMAIL}")
    finally:
        db.close()


# ── Health check ──────────────────────────────────────────────
@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok", "version": "2.0.0"}


# ─────────────────────────────────────────────────────────────
# EXISTING endpoints — kept unchanged for backward compatibility
# ─────────────────────────────────────────────────────────────
def get_recommendation(data: LoanRequest) -> LoanResponse:
    base_rate = 10.5
    if data.credit_score > 750:
        base_rate -= 1.5
    elif data.credit_score < 600:
        base_rate += 2.0

    emi_ratio = data.existing_emi / (data.annual_income / 12) if data.annual_income else 0
    approval_likelihood = max(0.1, min(0.95, 0.9 - emi_ratio - (0 if data.credit_score > 650 else 0.2)))

    recommendation = RecommendationItem(
        product_type=data.product_type_interest,
        recommended_amount=data.requested_amount,
        recommended_tenure_months=data.requested_tenure_months,
        estimated_interest_rate=round(base_rate, 2),
        approval_likelihood=round(approval_likelihood, 2),
        rank=1,
    )

    explanation = [
        ExplanationFactor(
            factor="credit_score",
            impact="positive" if data.credit_score > 700 else "negative",
            detail=f"Credit score of {data.credit_score} {'strengthens' if data.credit_score > 700 else 'weakens'} the recommendation.",
        ),
        ExplanationFactor(
            factor="existing_emi_ratio",
            impact="negative" if emi_ratio > 0.3 else "positive",
            detail=f"Existing EMI is {round(emi_ratio * 100, 1)}% of monthly income.",
        ),
    ]

    monthly_rate = (base_rate / 100) / 12
    n = data.requested_tenure_months
    emi = (data.requested_amount * monthly_rate * (1 + monthly_rate) ** n) / (((1 + monthly_rate) ** n) - 1)

    return LoanResponse(
        recommendations=[recommendation],
        explanation=explanation,
        estimated_emi=round(emi, 2),
    )


@app.get("/contacts", tags=["Legacy"])
def get_all_contacts(db: Session = Depends(get_db)):
    """Returns everyone who has submitted a loan inquiry, most recent first."""
    submissions = db.query(LoanSubmission).order_by(LoanSubmission.created_at.desc()).all()
    return [
        {
            "id": s.id,
            "full_name": s.full_name,
            "email": s.email,
            "phone": s.phone,
            "product_interest": s.product_type_interest,
            "recommended_product": s.top_recommendation_product,
            "submitted_at": s.created_at,
        }
        for s in submissions
    ]


@app.post("/recommend", response_model=LoanResponse, tags=["Legacy"])
def recommend(data: LoanRequest, db: Session = Depends(get_db)):
    result = get_recommendation(data)

    submission = LoanSubmission(
        full_name=data.full_name,
        email=data.email,
        phone=data.phone,
        credit_score=data.credit_score,
        annual_income=data.annual_income,
        employment_type=data.employment_type,
        years_employed=data.years_employed,
        existing_emi=data.existing_emi,
        product_type_interest=data.product_type_interest,
        requested_amount=data.requested_amount,
        requested_tenure_months=data.requested_tenure_months,
        top_recommendation_product=result.recommendations[0].product_type,
    )
    db.add(submission)
    db.commit()

    return result
