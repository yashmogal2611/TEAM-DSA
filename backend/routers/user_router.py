"""
routers/user_router.py
Endpoints (require user JWT):
  POST /loans/apply   – submit a new loan application
  GET  /loans/my      – list all of the current user's applications
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import LoanApplication, User, get_db
from schemas import LoanApplicationCreate, LoanApplicationOut
from auth import get_current_user

router = APIRouter(prefix="/loans", tags=["User – Loan Applications"])


# ── POST /loans/apply ─────────────────────────────────────────
@router.post("/apply", response_model=LoanApplicationOut, status_code=201)
def apply_for_loan(
    payload: LoanApplicationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submit a new loan application.
    The application starts with status = 'pending' and waits for admin review.
    """
    application = LoanApplication(
        user_id=current_user.id,
        product_type=payload.product_type,
        requested_amount=payload.requested_amount,
        tenure_months=payload.tenure_months,
        annual_income=payload.annual_income,
        credit_score=payload.credit_score,
        employment_type=payload.employment_type,
        purpose=payload.purpose,
        status="pending",
    )
    db.add(application)
    db.commit()
    db.refresh(application)

    # Attach applicant details for the response
    result = LoanApplicationOut.model_validate(application)
    result.applicant_name = current_user.full_name
    result.applicant_email = current_user.email
    return result


# ── GET /loans/my ─────────────────────────────────────────────
@router.get("/my", response_model=List[LoanApplicationOut])
def my_applications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return all loan applications submitted by the currently logged-in user,
    newest first.  Each entry shows current status (pending / approved / rejected).
    """
    apps = (
        db.query(LoanApplication)
        .filter(LoanApplication.user_id == current_user.id)
        .order_by(LoanApplication.applied_at.desc())
        .all()
    )

    results = []
    for app in apps:
        out = LoanApplicationOut.model_validate(app)
        out.applicant_name = current_user.full_name
        out.applicant_email = current_user.email
        results.append(out)
    return results
