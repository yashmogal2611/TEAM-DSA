"""
routers/admin_router.py
Admin endpoints for:
- Viewing, filtering, and searching loan applications across all 6 loan types
- Underwriting approvals, rejections, custom sanction amounts & interest rate offers
- Document verification, listing, and direct file download
- Comprehensive analytics & loan portfolio stats
"""
import os
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

try:
    from ..database import LoanApplication, LoanDocument, User, get_db
    from ..schemas import (
        LoanApplicationOut,
        AdminLoanUpdate,
        AdminStats,
        UserOut,
        DocumentOut,
        DocumentVerifyPayload,
    )
    from ..auth import get_current_admin, decode_token
except ImportError:
    from database import LoanApplication, LoanDocument, User, get_db
    from schemas import (
        LoanApplicationOut,
        AdminLoanUpdate,
        AdminStats,
        UserOut,
        DocumentOut,
        DocumentVerifyPayload,
    )
    from auth import get_current_admin, decode_token

router = APIRouter(prefix="/admin", tags=["Admin – Underwriting & Management"])


def _to_doc_out(doc: LoanDocument) -> DocumentOut:
    d = DocumentOut.model_validate(doc)
    d.download_url = f"/admin/loans/{doc.loan_application_id}/documents/{doc.id}/download"
    d.view_url = f"/admin/loans/{doc.loan_application_id}/documents/{doc.id}/view"
    return d


def _to_loan_out(app: LoanApplication) -> LoanApplicationOut:
    out = LoanApplicationOut.model_validate(app)
    if app.applicant:
        out.applicant_name = app.applicant.full_name
        out.applicant_email = app.applicant.email
        out.applicant_phone = app.applicant.phone
    out.documents = [_to_doc_out(d) for d in (app.documents or [])]
    return out


# ──────────────────────────────────────────────────────────────
# 1. Applications List & Search
# ──────────────────────────────────────────────────────────────
@router.get("/loans", response_model=List[LoanApplicationOut])
def list_all_applications(
    status_filter: Optional[str] = Query(None, alias="status"),
    product_type: Optional[str] = Query(None, alias="product_type"),
    search: Optional[str] = Query(None, alias="search"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """
    Return all loan applications in the system with optional filtering by:
    - `status`: pending | under_review | approved | rejected
    - `product_type`: personal_loan | home_loan | vehicle_loan | education_loan | business_loan | gold_loan
    - `search`: search by applicant name, email, or purpose
    """
    query = db.query(LoanApplication)
    
    if status_filter:
        query = query.filter(LoanApplication.status == status_filter)
    if product_type:
        query = query.filter(LoanApplication.product_type == product_type)
    if search:
        s_term = f"%{search}%"
        query = query.join(User).filter(
            (User.full_name.ilike(s_term)) | 
            (User.email.ilike(s_term)) | 
            (LoanApplication.purpose.ilike(s_term)) |
            (LoanApplication.business_name.ilike(s_term)) |
            (LoanApplication.institution_name.ilike(s_term))
        )

    apps = query.order_by(LoanApplication.applied_at.desc()).all()
    return [_to_loan_out(app) for app in apps]


@router.get("/loans/{loan_id}", response_model=LoanApplicationOut)
def get_loan_details(
    loan_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """View full details and uploaded documents for a specific loan application."""
    loan = db.query(LoanApplication).filter(LoanApplication.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail=f"Loan application #{loan_id} not found.")
    return _to_loan_out(loan)


# ──────────────────────────────────────────────────────────────
# 2. Underwriting Decisions (Approve, Reject, Status Update)
# ──────────────────────────────────────────────────────────────
@router.patch("/loans/{loan_id}/status", response_model=LoanApplicationOut)
def update_loan_status(
    loan_id: int,
    payload: AdminLoanUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """
    Update loan status (approved, rejected, under_review, pending)
    with optional sanctioned amount, interest rate offered, and underwriting note.
    """
    loan = db.query(LoanApplication).filter(LoanApplication.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail=f"Loan application #{loan_id} not found.")

    loan.status = payload.status
    if payload.admin_note is not None:
        loan.admin_note = payload.admin_note
    if payload.sanctioned_amount is not None:
        loan.sanctioned_amount = payload.sanctioned_amount
    if payload.interest_rate_offered is not None:
        loan.interest_rate_offered = payload.interest_rate_offered
    
    loan.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(loan)
    return _to_loan_out(loan)


@router.post("/loans/{loan_id}/approve", response_model=LoanApplicationOut)
@router.patch("/loans/{loan_id}/approve", response_model=LoanApplicationOut)
def approve_loan(
    loan_id: int,
    payload: AdminLoanUpdate = AdminLoanUpdate(status="approved"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Mark a loan application as APPROVED with sanctioned amount and interest rate."""
    loan = db.query(LoanApplication).filter(LoanApplication.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail=f"Loan application #{loan_id} not found.")

    loan.status = "approved"
    loan.admin_note = payload.admin_note or "Application approved by underwriting team."
    loan.sanctioned_amount = payload.sanctioned_amount or loan.requested_amount
    loan.interest_rate_offered = payload.interest_rate_offered
    loan.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(loan)
    return _to_loan_out(loan)


@router.post("/loans/{loan_id}/reject", response_model=LoanApplicationOut)
@router.patch("/loans/{loan_id}/reject", response_model=LoanApplicationOut)
def reject_loan(
    loan_id: int,
    payload: AdminLoanUpdate = AdminLoanUpdate(status="rejected"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Mark a loan application as REJECTED with mandatory or optional reason note."""
    loan = db.query(LoanApplication).filter(LoanApplication.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail=f"Loan application #{loan_id} not found.")

    loan.status = "rejected"
    loan.admin_note = payload.admin_note or "Application did not meet minimum underwriting criteria."
    loan.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(loan)
    return _to_loan_out(loan)


# ──────────────────────────────────────────────────────────────
# 3. Document Verification & Download
# ──────────────────────────────────────────────────────────────
@router.get("/loans/{loan_id}/documents", response_model=List[DocumentOut])
def list_application_documents(
    loan_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Admin endpoint to inspect all uploaded documents for an application."""
    docs = db.query(LoanDocument).filter(LoanDocument.loan_application_id == loan_id).all()
    return [_to_doc_out(d) for d in docs]


@router.post("/loans/{loan_id}/documents/{doc_id}/verify", response_model=DocumentOut)
@router.patch("/loans/{loan_id}/documents/{doc_id}/verify", response_model=DocumentOut)
def verify_loan_document(
    loan_id: int,
    doc_id: int,
    payload: DocumentVerifyPayload,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Admin verifies or rejects a specific uploaded document."""
    doc = db.query(LoanDocument).filter(
        LoanDocument.id == doc_id,
        LoanDocument.loan_application_id == loan_id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document #{doc_id} not found for loan #{loan_id}.")

    doc.verification_status = payload.verification_status
    doc.verification_note = payload.verification_note
    doc.verified_at = datetime.utcnow()
    db.commit()
    db.refresh(doc)
    return _to_doc_out(doc)


@router.get("/loans/{loan_id}/documents/{doc_id}/download")
def download_loan_document(
    loan_id: int,
    doc_id: int,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Download an uploaded supporting document (supports query token for browser downloads)."""
    if token:
        try:
            payload = decode_token(token)
            user_id = payload.get("sub")
            user = db.query(User).filter(User.id == int(user_id)).first()
            if not user or not user.is_active or not user.is_admin:
                raise HTTPException(status_code=403, detail="Admin authorization required.")
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid authorization token.")

    doc = db.query(LoanDocument).filter(
        LoanDocument.id == doc_id,
        LoanDocument.loan_application_id == loan_id
    ).first()
    if not doc or not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="Document file not found on disk.")

    return FileResponse(
        path=doc.file_path,
        filename=doc.original_filename,
        media_type=doc.mime_type or "application/octet-stream"
    )


@router.get("/loans/{loan_id}/documents/{doc_id}/view")
def view_loan_document(
    loan_id: int,
    doc_id: int,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Inline preview endpoint for uploaded supporting documents.
    Allows viewing in iframe / new tab using token query param or authorization header.
    """
    if token:
        try:
            payload = decode_token(token)
            user_id = payload.get("sub")
            user = db.query(User).filter(User.id == int(user_id)).first()
            if not user or not user.is_active or not user.is_admin:
                raise HTTPException(status_code=403, detail="Admin authorization required.")
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid authorization token.")

    doc = db.query(LoanDocument).filter(
        LoanDocument.id == doc_id,
        LoanDocument.loan_application_id == loan_id
    ).first()
    if not doc or not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="Document file not found on disk.")

    media_type = doc.mime_type
    if not media_type or media_type == "application/octet-stream":
        ext = os.path.splitext(doc.file_path)[1].lower()
        if ext == ".pdf":
            media_type = "application/pdf"
        elif ext in [".png", ".jpg", ".jpeg", ".webp"]:
            media_type = f"image/{ext.replace('.', '')}"
        else:
            media_type = "application/octet-stream"

    return FileResponse(
        path=doc.file_path,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{doc.original_filename}"'}
    )


# ──────────────────────────────────────────────────────────────
# 4. Analytics & Portfolio Stats
# ──────────────────────────────────────────────────────────────
@router.get("/stats", response_model=AdminStats)
def get_admin_stats(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """
    Overview statistics: application counts, status breakdowns, 
    distribution across 6 loan types, and total sanctioned volume.
    """
    total = db.query(LoanApplication).count()
    pending = db.query(LoanApplication).filter(LoanApplication.status == "pending").count()
    under_review = db.query(LoanApplication).filter(LoanApplication.status == "under_review").count()
    approved = db.query(LoanApplication).filter(LoanApplication.status == "approved").count()
    rejected = db.query(LoanApplication).filter(LoanApplication.status == "rejected").count()
    users = db.query(User).filter(User.is_admin == False).count()
    docs = db.query(LoanDocument).count()

    # Loan type distribution
    all_loans = db.query(LoanApplication).all()
    type_counts = {
        "personal_loan": 0,
        "home_loan": 0,
        "vehicle_loan": 0,
        "education_loan": 0,
        "business_loan": 0,
        "gold_loan": 0,
    }
    total_requested = 0.0
    total_approved = 0.0

    for loan in all_loans:
        p_type = loan.product_type or "personal_loan"
        if p_type in type_counts:
            type_counts[p_type] += 1
        else:
            type_counts[p_type] = 1
        
        total_requested += (loan.requested_amount or 0.0)
        if loan.status == "approved":
            total_approved += (loan.sanctioned_amount or loan.requested_amount or 0.0)

    return AdminStats(
        total_applications=total,
        pending=pending,
        under_review=under_review,
        approved=approved,
        rejected=rejected,
        total_users=users,
        total_documents=docs,
        applications_by_type=type_counts,
        total_requested_volume=round(total_requested, 2),
        total_approved_volume=round(total_approved, 2),
    )


# ──────────────────────────────────────────────────────────────
# 5. User Management
# ──────────────────────────────────────────────────────────────
@router.get("/users", response_model=List[UserOut])
def list_all_users(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Return all registered borrower users."""
    return db.query(User).filter(User.is_admin == False).order_by(User.created_at.desc()).all()
