"""
routers/admin_router.py
Endpoints (require admin JWT):
  GET   /admin/loans              – list ALL loan applications
  PATCH /admin/loans/{id}/approve – approve a specific application
  PATCH /admin/loans/{id}/reject  – reject a specific application
  GET   /admin/stats              – summary counts
  GET   /admin/users              – list all registered users
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from database import LoanApplication, User, get_db
from schemas import LoanApplicationOut, AdminLoanUpdate, AdminStats, UserOut
from auth import get_current_admin

router = APIRouter(prefix="/admin", tags=["Admin"])


# ── GET /admin/loans ──────────────────────────────────────────
@router.get("/loans", response_model=List[LoanApplicationOut])
def list_all_applications(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """
    Return every loan application in the system, optionally filtered by status.
    Query param: ?status=pending | approved | rejected
    """
    query = db.query(LoanApplication)
    if status_filter:
        query = query.filter(LoanApplication.status == status_filter)
    apps = query.order_by(LoanApplication.applied_at.desc()).all()

    results = []
    for app in apps:
        out = LoanApplicationOut.model_validate(app)
        # attach applicant info
        if app.applicant:
            out.applicant_name = app.applicant.full_name
            out.applicant_email = app.applicant.email
        results.append(out)
    return results


# ── PATCH /admin/loans/{id}/approve ──────────────────────────
@router.patch("/loans/{loan_id}/approve", response_model=LoanApplicationOut)
def approve_loan(
    loan_id: int,
    payload: AdminLoanUpdate = AdminLoanUpdate(status="approved"),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Mark a loan application as APPROVED. ✅"""
    loan = db.query(LoanApplication).filter(LoanApplication.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail=f"Loan application #{loan_id} not found")
    if loan.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve: application is already '{loan.status}'",
        )
    loan.status = "approved"
    loan.admin_note = payload.admin_note
    loan.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(loan)

    out = LoanApplicationOut.model_validate(loan)
    if loan.applicant:
        out.applicant_name = loan.applicant.full_name
        out.applicant_email = loan.applicant.email
    return out


# ── PATCH /admin/loans/{id}/reject ───────────────────────────
@router.patch("/loans/{loan_id}/reject", response_model=LoanApplicationOut)
def reject_loan(
    loan_id: int,
    payload: AdminLoanUpdate = AdminLoanUpdate(status="rejected"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Mark a loan application as REJECTED. ❌"""
    loan = db.query(LoanApplication).filter(LoanApplication.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail=f"Loan application #{loan_id} not found")
    if loan.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reject: application is already '{loan.status}'",
        )
    loan.status = "rejected"
    loan.admin_note = payload.admin_note
    loan.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(loan)

    out = LoanApplicationOut.model_validate(loan)
    if loan.applicant:
        out.applicant_name = loan.applicant.full_name
        out.applicant_email = loan.applicant.email
    return out


# ── GET /admin/stats ──────────────────────────────────────────
@router.get("/stats", response_model=AdminStats)
def get_stats(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Quick summary: total applications, pending, approved, rejected, total users."""
    total = db.query(LoanApplication).count()
    pending = db.query(LoanApplication).filter(LoanApplication.status == "pending").count()
    approved = db.query(LoanApplication).filter(LoanApplication.status == "approved").count()
    rejected = db.query(LoanApplication).filter(LoanApplication.status == "rejected").count()
    users = db.query(User).filter(User.is_admin == False).count()

    return AdminStats(
        total_applications=total,
        pending=pending,
        approved=approved,
        rejected=rejected,
        total_users=users,
    )


# ── GET /admin/users ──────────────────────────────────────────
@router.get("/users", response_model=List[UserOut])
def list_all_users(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Return all registered (non-admin) users."""
    users = (
        db.query(User)
        .filter(User.is_admin == False)
        .order_by(User.created_at.desc())
        .all()
    )
    return users
