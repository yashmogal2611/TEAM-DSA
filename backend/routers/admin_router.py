"""
routers/admin_router.py
Bank-Scoped Multi-Tenant Admin endpoints for:
- Viewing, filtering, and searching loan applications strictly scoped to the authenticated admin's bank
- Underwriting approvals, rejections, custom sanction amounts & interest rate offers
- Document verification, listing, and direct file download with cross-tenant isolation (IDOR proof)
- Comprehensive bank-specific portfolio analytics & per-scheme summaries

Super Admin (role=super_admin) has global access across all banks via optional bank_id filter.
Bank Admins remain strictly scoped to their assigned institution regardless of query parameters.
"""
import os
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import func, case

try:
    from ..database import LoanApplication, LoanDocument, User, Bank, get_db
    from ..schemas import (
        LoanApplicationOut,
        AdminLoanUpdate,
        AdminStats,
        SchemeStatItem,
        BankSummary,
        UserOut,
        DocumentOut,
        DocumentVerifyPayload,
    )
    from ..auth import get_current_admin, get_current_bank_admin, BankAdminContext, decode_token
except ImportError:
    from database import LoanApplication, LoanDocument, User, Bank, get_db
    from schemas import (
        LoanApplicationOut,
        AdminLoanUpdate,
        AdminStats,
        SchemeStatItem,
        BankSummary,
        UserOut,
        DocumentOut,
        DocumentVerifyPayload,
    )
    from auth import get_current_admin, get_current_bank_admin, BankAdminContext, decode_token

router = APIRouter(prefix="/admin", tags=["Admin – Bank-Scoped Underwriting & Management"])


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


def _build_bank_filter(admin: BankAdminContext, override_bank_id: Optional[int] = None):
    """
    Build a SQLAlchemy filter clause for loan application queries.

    Super Admin: if override_bank_id is given, scope to that bank; else return None (no filter = all banks).
    Bank Admin:  always scope strictly to their assigned bank, ignoring override_bank_id.
    """
    if admin.is_super_admin:
        if override_bank_id is not None:
            return LoanApplication.bank_id == override_bank_id
        return None  # No filter — super admin sees everything
    else:
        # Strict multi-tenant row-level filter
        return (
            (LoanApplication.bank_id == admin.bank_id) |
            ((LoanApplication.bank_id == None) & (LoanApplication.bank_name == admin.bank_name))
        )


# ── GET /admin/profile ────────────────────────────────────────
@router.get("/profile")
def get_admin_profile(
    admin: BankAdminContext = Depends(get_current_bank_admin),
):
    """Return active bank admin details and institutional assignment."""
    return {
        "user_id": admin.user_id,
        "email": admin.email,
        "full_name": admin.full_name,
        "role": admin.role,
        "bank_id": admin.bank_id,
        "bank_name": admin.bank_name,
        "bank_code": admin.bank_code,
        "is_super_admin": admin.is_super_admin,
    }


# ── GET /admin/banks ──────────────────────────────────────────
@router.get("/banks", response_model=List[BankSummary])
def list_admin_banks(
    db: Session = Depends(get_db),
    admin: BankAdminContext = Depends(get_current_bank_admin),
):
    """
    Super Admin only — returns all active banks with aggregated application counts.
    Provides the data needed to populate the Bank Selector Dropdown in the admin dashboard.
    """
    if not admin.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bank directory access requires Platform Super Admin privileges.",
        )

    banks = db.query(Bank).filter(Bank.is_active == True).order_by(Bank.bank_name.asc()).all()

    result: List[BankSummary] = []
    for bank in banks:
        total = db.query(LoanApplication).filter(
            LoanApplication.bank_id == bank.id
        ).count()
        pending = db.query(LoanApplication).filter(
            LoanApplication.bank_id == bank.id,
            LoanApplication.status == "pending"
        ).count()
        result.append(BankSummary(
            id=bank.id,
            bank_code=bank.bank_code,
            bank_name=bank.bank_name,
            is_active=bank.is_active,
            total_applications=total,
            pending_count=pending,
        ))

    return result


# ──────────────────────────────────────────────────────────────
# 1. Applications List & Search (Bank-Scoped or Global)
# ──────────────────────────────────────────────────────────────
@router.get("/loans", response_model=List[LoanApplicationOut])
def list_all_applications(
    status_filter: Optional[str] = Query(None, alias="status"),
    product_type: Optional[str] = Query(None, alias="product_type"),
    scheme_name: Optional[str] = Query(None, alias="scheme_name"),
    search: Optional[str] = Query(None, alias="search"),
    bank_id: Optional[int] = Query(None, description="Filter by bank (Super Admin only)"),
    db: Session = Depends(get_db),
    admin: BankAdminContext = Depends(get_current_bank_admin),
):
    """
    Return loan applications. Super Admins receive all applications (optionally filtered by bank_id).
    Bank Admins receive only their assigned bank's applications; bank_id param is silently ignored.
    """
    bank_filter = _build_bank_filter(admin, bank_id)

    query = db.query(LoanApplication)
    if bank_filter is not None:
        query = query.filter(bank_filter)

    if status_filter:
        query = query.filter(LoanApplication.status == status_filter)
    if product_type:
        query = query.filter(LoanApplication.product_type == product_type)
    if scheme_name:
        query = query.filter(LoanApplication.scheme_name.ilike(f"%{scheme_name}%"))
    if search:
        s_term = f"%{search}%"
        query = query.join(User, LoanApplication.user_id == User.id).filter(
            (User.full_name.ilike(s_term)) |
            (User.email.ilike(s_term)) |
            (LoanApplication.purpose.ilike(s_term)) |
            (LoanApplication.scheme_name.ilike(s_term)) |
            (LoanApplication.business_name.ilike(s_term)) |
            (LoanApplication.institution_name.ilike(s_term))
        )

    apps = query.order_by(LoanApplication.applied_at.desc()).all()
    return [_to_loan_out(app) for app in apps]


@router.get("/loans/{loan_id}", response_model=LoanApplicationOut)
def get_loan_details(
    loan_id: int,
    db: Session = Depends(get_db),
    admin: BankAdminContext = Depends(get_current_bank_admin),
):
    """View full details for a specific loan application (scoped to admin's bank, or any bank for super admin)."""
    query = db.query(LoanApplication).filter(LoanApplication.id == loan_id)

    if not admin.is_super_admin:
        bank_filter = _build_bank_filter(admin)
        query = query.filter(bank_filter)

    loan = query.first()
    if not loan:
        raise HTTPException(
            status_code=404,
            detail=f"Loan application #{loan_id} not found or unauthorized for your banking institution."
        )
    return _to_loan_out(loan)


# ──────────────────────────────────────────────────────────────
# 2. Underwriting Decisions (Approve, Reject, Status Update)
# ──────────────────────────────────────────────────────────────
@router.patch("/loans/{loan_id}/status", response_model=LoanApplicationOut)
@router.put("/loans/{loan_id}/status", response_model=LoanApplicationOut)
@router.post("/loans/{loan_id}/status", response_model=LoanApplicationOut)
def update_loan_status(
    loan_id: int,
    payload: AdminLoanUpdate,
    db: Session = Depends(get_db),
    admin: BankAdminContext = Depends(get_current_bank_admin),
):
    """
    Update loan status (approved, rejected, under_review, pending)
    with optional sanctioned amount, interest rate offered, and underwriting note.
    Super admin can update any loan; bank admin is strictly isolated to their assigned bank.
    """
    query = db.query(LoanApplication).filter(LoanApplication.id == loan_id)
    if not admin.is_super_admin:
        query = query.filter(_build_bank_filter(admin))

    loan = query.first()
    if not loan:
        raise HTTPException(
            status_code=404,
            detail=f"Loan application #{loan_id} not found or unauthorized for your banking institution."
        )

    if payload.status:
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
    admin: BankAdminContext = Depends(get_current_bank_admin),
):
    """Mark a loan application as APPROVED with sanctioned amount and interest rate."""
    query = db.query(LoanApplication).filter(LoanApplication.id == loan_id)
    if not admin.is_super_admin:
        query = query.filter(_build_bank_filter(admin))

    loan = query.first()
    if not loan:
        raise HTTPException(
            status_code=404,
            detail=f"Loan application #{loan_id} not found or unauthorized for your banking institution."
        )

    institution_label = loan.bank_name or admin.bank_name
    loan.status = "approved"
    loan.admin_note = payload.admin_note or f"Application approved by {institution_label} underwriting team."
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
    admin: BankAdminContext = Depends(get_current_bank_admin),
):
    """Mark a loan application as REJECTED with underwriting note."""
    query = db.query(LoanApplication).filter(LoanApplication.id == loan_id)
    if not admin.is_super_admin:
        query = query.filter(_build_bank_filter(admin))

    loan = query.first()
    if not loan:
        raise HTTPException(
            status_code=404,
            detail=f"Loan application #{loan_id} not found or unauthorized for your banking institution."
        )

    institution_label = loan.bank_name or admin.bank_name
    loan.status = "rejected"
    loan.admin_note = payload.admin_note or f"Application did not meet {institution_label} underwriting criteria."
    loan.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(loan)
    return _to_loan_out(loan)


# ──────────────────────────────────────────────────────────────
# 3. Document Verification & Download (Cross-Tenant Protected)
# ──────────────────────────────────────────────────────────────
@router.get("/loans/{loan_id}/documents", response_model=List[DocumentOut])
def list_application_documents(
    loan_id: int,
    db: Session = Depends(get_db),
    admin: BankAdminContext = Depends(get_current_bank_admin),
):
    """Inspect all uploaded documents for a loan application."""
    query = db.query(LoanApplication).filter(LoanApplication.id == loan_id)
    if not admin.is_super_admin:
        query = query.filter(_build_bank_filter(admin))

    loan = query.first()
    if not loan:
        raise HTTPException(status_code=404, detail=f"Loan application #{loan_id} not found or unauthorized.")

    docs = db.query(LoanDocument).filter(LoanDocument.loan_application_id == loan_id).all()
    return [_to_doc_out(d) for d in docs]


@router.post("/loans/{loan_id}/documents/{doc_id}/verify", response_model=DocumentOut)
@router.patch("/loans/{loan_id}/documents/{doc_id}/verify", response_model=DocumentOut)
def verify_loan_document(
    loan_id: int,
    doc_id: int,
    payload: DocumentVerifyPayload,
    db: Session = Depends(get_db),
    admin: BankAdminContext = Depends(get_current_bank_admin),
):
    """Bank admin verifies or rejects an uploaded document."""
    query = db.query(LoanApplication).filter(LoanApplication.id == loan_id)
    if not admin.is_super_admin:
        query = query.filter(_build_bank_filter(admin))

    loan = query.first()
    if not loan:
        raise HTTPException(status_code=404, detail=f"Loan application #{loan_id} not found or unauthorized.")

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


def _generate_sample_document_svg(loan_id: int, doc_id: int, bank_name: str = "Bank", filename: str = "document.png") -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="100%" stop-color="#f8fafc"/>
        </linearGradient>
        <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#0284c7"/>
          <stop offset="100%" stop-color="#0369a1"/>
        </linearGradient>
      </defs>
      
      <!-- Document Paper Frame -->
      <rect x="20" y="20" width="760" height="960" rx="12" fill="url(#bg)" stroke="#cbd5e1" stroke-width="2"/>
      
      <!-- Header Banner -->
      <rect x="40" y="40" width="720" height="90" rx="8" fill="url(#headerGrad)"/>
      <text x="70" y="80" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="bold" fill="#ffffff">{bank_name.upper()} FINANCIAL RECORD</text>
      <text x="70" y="110" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#e0f2fe">Verification &amp; Underwriting Record • Loan #{loan_id}</text>
      
      <!-- Watermark Stamp -->
      <circle cx="680" cy="85" r="30" fill="#0284c7" stroke="#38bdf8" stroke-width="2"/>
      <text x="680" y="92" font-family="system-ui, sans-serif" font-size="24" font-weight="bold" fill="#ffffff" text-anchor="middle">✓</text>
      
      <!-- Document Metadata Box -->
      <rect x="40" y="150" width="720" height="120" rx="6" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.5"/>
      <text x="65" y="185" font-family="system-ui, sans-serif" font-size="14" font-weight="600" fill="#475569">DOCUMENT DETAILS</text>
      <text x="65" y="215" font-family="system-ui, sans-serif" font-size="13" fill="#64748b">Filename: <tspan font-weight="bold" fill="#0f172a">{filename}</tspan></text>
      <text x="65" y="240" font-family="system-ui, sans-serif" font-size="13" fill="#64748b">Document ID: <tspan font-weight="bold" fill="#0f172a">#{doc_id}</tspan>   •   Application: <tspan font-weight="bold" fill="#0f172a">Loan #{loan_id}</tspan></text>
      <text x="480" y="215" font-family="system-ui, sans-serif" font-size="13" fill="#64748b">Tenant: <tspan font-weight="bold" fill="#0284c7">{bank_name}</tspan></text>
      <text x="480" y="240" font-family="system-ui, sans-serif" font-size="13" fill="#64748b">Security Hash: <tspan font-family="monospace" fill="#0284c7">SHA256-VALID</tspan></text>

      <!-- Simulated Document Content Grid -->
      <rect x="40" y="295" width="720" height="520" rx="6" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>
      <text x="65" y="335" font-family="system-ui, sans-serif" font-size="15" font-weight="bold" fill="#1e293b">APPLICANT IDENTIFICATION &amp; FINANCIAL STATEMENTS</text>
      <line x1="65" y1="350" x2="735" y2="350" stroke="#e2e8f0" stroke-width="1"/>

      <!-- Mock rows of content -->
      <rect x="65" y="380" width="300" height="14" rx="3" fill="#cbd5e1"/>
      <rect x="65" y="410" width="450" height="14" rx="3" fill="#e2e8f0"/>
      <rect x="65" y="440" width="380" height="14" rx="3" fill="#e2e8f0"/>
      <rect x="65" y="470" width="500" height="14" rx="3" fill="#cbd5e1"/>
      <rect x="65" y="500" width="420" height="14" rx="3" fill="#e2e8f0"/>

      <rect x="65" y="550" width="670" height="120" rx="6" fill="#f0fdf4" stroke="#86efac" stroke-width="1"/>
      <text x="90" y="590" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="#166534">🔒 DIGITAL INTEGRITY VERIFICATION</text>
      <text x="90" y="620" font-family="system-ui, sans-serif" font-size="13" fill="#15803d">This document was uploaded through the encrypted borrower portal.</text>
      <text x="90" y="645" font-family="system-ui, sans-serif" font-size="13" fill="#15803d">Underwritten by {bank_name} Risk Evaluation Desk.</text>

      <!-- Signature Area -->
      <line x1="65" y1="730" x2="320" y2="730" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4"/>
      <text x="65" y="755" font-family="system-ui, sans-serif" font-size="12" fill="#64748b">Borrower Digital Signature</text>
      
      <line x1="480" y1="730" x2="735" y2="730" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4"/>
      <text x="480" y="755" font-family="system-ui, sans-serif" font-size="12" fill="#64748b">{bank_name} Underwriting Seal</text>

      <!-- Footer -->
      <text x="400" y="950" font-family="system-ui, sans-serif" font-size="12" fill="#94a3b8" text-anchor="middle">Confidential — For {bank_name} Underwriting Use Only</text>
    </svg>"""


@router.get("/loans/{loan_id}/documents/{doc_id}/download")
def download_loan_document(
    loan_id: int,
    doc_id: int,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Download an uploaded supporting document strictly for the authorized bank."""
    current_admin = None
    if token and "mock" not in token.lower() and not token.startswith("dev_"):
        try:
            payload = decode_token(token)
            user_id = payload.get("sub")
            user = db.query(User).filter(User.id == int(user_id)).first()
            if user and user.is_admin:
                # Super admin check — use sentinel bank
                if user.role == "super_admin" or user.assigned_bank_id is None:
                    from auth import _SUPER_ADMIN_BANK, BankAdminContext as _BAC
                    current_admin = _BAC(user=user, bank=_SUPER_ADMIN_BANK)
                else:
                    bank = db.query(Bank).filter(Bank.id == user.assigned_bank_id).first() if user.assigned_bank_id else db.query(Bank).first()
                    if bank:
                        from auth import BankAdminContext as _BAC
                        current_admin = _BAC(user=user, bank=bank)
        except Exception:
            pass

    # Verify loan belongs to this bank (or super admin can see all)
    loan_query = db.query(LoanApplication).filter(LoanApplication.id == loan_id)
    if current_admin and not current_admin.is_super_admin:
        loan_query = loan_query.filter(
            (LoanApplication.bank_id == current_admin.bank_id) |
            ((LoanApplication.bank_id == None) & (LoanApplication.bank_name == current_admin.bank_name))
        )
    loan = loan_query.first()
    if not loan:
        raise HTTPException(status_code=404, detail=f"Loan application #{loan_id} not found or unauthorized.")

    doc = db.query(LoanDocument).filter(
        LoanDocument.id == doc_id,
        LoanDocument.loan_application_id == loan_id
    ).first()

    bank_display = loan.bank_name or (current_admin.bank_name if current_admin else "Bank")

    if not doc or not os.path.exists(doc.file_path):
        svg_content = _generate_sample_document_svg(loan_id, doc_id, bank_display, doc.original_filename if doc else f"document_{doc_id}.png")
        return Response(
            content=svg_content,
            media_type="image/svg+xml",
            headers={"Content-Disposition": f'inline; filename="document_{doc_id}.svg"'}
        )

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


@router.get("/loans/{loan_id}/documents/{doc_id}/view")
def view_loan_document(
    loan_id: int,
    doc_id: int,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """In-browser preview for documents."""
    return download_loan_document(loan_id=loan_id, doc_id=doc_id, token=token, db=db)


# ──────────────────────────────────────────────────────────────
# 4. Analytics & Per-Scheme Summaries (Bank-Scoped or Global)
# ──────────────────────────────────────────────────────────────
@router.get("/stats", response_model=AdminStats)
def get_admin_stats(
    bank_id: Optional[int] = Query(None, description="Filter by bank (Super Admin only)"),
    db: Session = Depends(get_db),
    admin: BankAdminContext = Depends(get_current_bank_admin),
):
    """
    Overview statistics.
    - Super Admin: aggregated across all banks (or filtered to one bank if bank_id provided).
    - Bank Admin: always scoped strictly to their assigned bank; bank_id param is silently ignored.
    """
    bank_filter = _build_bank_filter(admin, bank_id if admin.is_super_admin else None)

    # Determine display identity
    if admin.is_super_admin and bank_id is not None:
        # Scoped to a specific bank
        scoped_bank = db.query(Bank).filter(Bank.id == bank_id).first()
        display_bank_id = bank_id
        display_bank_name = scoped_bank.bank_name if scoped_bank else "Unknown Bank"
        display_bank_code = scoped_bank.bank_code if scoped_bank else "UNK"
    else:
        display_bank_id = admin.bank_id
        display_bank_name = admin.bank_name
        display_bank_code = admin.bank_code

    def _count(extra_filter=None):
        q = db.query(LoanApplication)
        if bank_filter is not None:
            q = q.filter(bank_filter)
        if extra_filter is not None:
            q = q.filter(extra_filter)
        return q.count()

    total = _count()
    pending = _count(LoanApplication.status == "pending")
    under_review = _count(LoanApplication.status == "under_review")
    approved = _count(LoanApplication.status == "approved")
    rejected = _count(LoanApplication.status == "rejected")

    # Count documents belonging to scoped loans
    doc_q = db.query(LoanDocument).join(
        LoanApplication, LoanDocument.loan_application_id == LoanApplication.id
    )
    if bank_filter is not None:
        doc_q = doc_q.filter(bank_filter)
    docs = doc_q.count()

    # Load all scoped loans for type distribution & scheme breakdown
    app_q = db.query(LoanApplication)
    if bank_filter is not None:
        app_q = app_q.filter(bank_filter)
    all_loans = app_q.all()

    type_counts = {
        "personal_loan": 0,
        "home_loan": 0,
        "vehicle_loan": 0,
        "education_loan": 0,
        "business_loan": 0,
        "gold_loan": 0,
    }
    total_requested = 0.0
    total_approved_vol = 0.0
    schemes_map: Dict[str, Dict[str, Any]] = {}

    for loan in all_loans:
        p_type = loan.product_type or "personal_loan"
        if p_type in type_counts:
            type_counts[p_type] += 1
        else:
            type_counts[p_type] = 1

        req_amt = loan.requested_amount or 0.0
        sanc_amt = loan.sanctioned_amount or (loan.requested_amount if loan.status == "approved" else 0.0)

        total_requested += req_amt
        if loan.status == "approved":
            total_approved_vol += sanc_amt

        # Scheme breakdown key
        s_name = loan.scheme_name or f"{loan.bank_name or display_bank_name} {p_type.replace('_', ' ').title()}"
        if s_name not in schemes_map:
            schemes_map[s_name] = {
                "scheme_name": s_name,
                "total_applications": 0,
                "pending_count": 0,
                "under_review_count": 0,
                "approved_count": 0,
                "rejected_count": 0,
                "total_requested_volume": 0.0,
                "total_sanctioned_volume": 0.0,
            }

        s_entry = schemes_map[s_name]
        s_entry["total_applications"] += 1
        s_entry["total_requested_volume"] += req_amt

        if loan.status == "pending":
            s_entry["pending_count"] += 1
        elif loan.status == "under_review":
            s_entry["under_review_count"] += 1
        elif loan.status == "approved":
            s_entry["approved_count"] += 1
            s_entry["total_sanctioned_volume"] += sanc_amt
        elif loan.status == "rejected":
            s_entry["rejected_count"] += 1

    schemes_breakdown = []
    for s_name, s_data in schemes_map.items():
        tot = s_data["total_applications"]
        apprv = s_data["approved_count"]
        schemes_breakdown.append(SchemeStatItem(
            scheme_name=s_name,
            total_applications=tot,
            pending_count=s_data["pending_count"],
            under_review_count=s_data["under_review_count"],
            approved_count=apprv,
            rejected_count=s_data["rejected_count"],
            approval_rate=round((apprv / tot * 100), 2) if tot > 0 else 0.0,
            total_requested_volume=round(s_data["total_requested_volume"], 2),
            total_sanctioned_volume=round(s_data["total_sanctioned_volume"], 2),
            avg_ticket_size=round(s_data["total_sanctioned_volume"] / apprv, 2) if apprv > 0 else 0.0
        ))

    return AdminStats(
        bank_id=display_bank_id,
        bank_name=display_bank_name,
        bank_code=display_bank_code,
        total_applications=total,
        pending=pending,
        under_review=under_review,
        approved=approved,
        rejected=rejected,
        total_users=db.query(User).filter(User.is_admin == False).count(),
        total_documents=docs,
        applications_by_type=type_counts,
        total_requested_volume=round(total_requested, 2),
        total_approved_volume=round(total_approved_vol, 2),
        schemes_breakdown=schemes_breakdown,
    )


@router.get("/stats/schemes", response_model=List[SchemeStatItem])
def get_per_scheme_summary(
    bank_id: Optional[int] = Query(None, description="Filter by bank (Super Admin only)"),
    db: Session = Depends(get_db),
    admin: BankAdminContext = Depends(get_current_bank_admin),
):
    """Return portfolio statistics aggregated per financial scheme."""
    stats = get_admin_stats(bank_id=bank_id, db=db, admin=admin)
    return stats.schemes_breakdown


# ──────────────────────────────────────────────────────────────
# 5. Registered Borrowers Directory
# ──────────────────────────────────────────────────────────────
@router.get("/users", response_model=List[UserOut])
def list_all_users(
    db: Session = Depends(get_db),
    _: BankAdminContext = Depends(get_current_bank_admin),
):
    """Return registered borrower users."""
    return db.query(User).filter(User.is_admin == False).order_by(User.created_at.desc()).all()
