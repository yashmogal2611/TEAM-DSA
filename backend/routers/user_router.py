"""
routers/user_router.py
User and consumer-facing endpoints for:
- Loan scheme rule retrieval & document checklist lookup
- Real-time multi-loan eligibility evaluation & ranking
- Loan application submission (all 6 loan categories)
- Multi-document upload & management
"""
import os
import shutil
import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Query
from sqlalchemy.orm import Session

try:
    from ..database import LoanApplication, LoanDocument, LoanSchemeRule, User, get_db
    from ..schemas import (
        LoanApplicationCreate,
        LoanApplicationOut,
        DocumentOut,
        LoanSchemeRuleOut,
        EligibilityCheckRequest,
        EligibilityCheckResponse,
    )
    from ..auth import get_current_user
    from ..eligibility_engine import rank_and_evaluate_all_loans, evaluate_loan_eligibility
except ImportError:
    from database import LoanApplication, LoanDocument, LoanSchemeRule, User, get_db
    from schemas import (
        LoanApplicationCreate,
        LoanApplicationOut,
        DocumentOut,
        LoanSchemeRuleOut,
        EligibilityCheckRequest,
        EligibilityCheckResponse,
    )
    from auth import get_current_user
    from eligibility_engine import rank_and_evaluate_all_loans, evaluate_loan_eligibility

router = APIRouter(prefix="/loans", tags=["Loans & Applications"])

UPLOAD_BASE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
os.makedirs(UPLOAD_BASE_DIR, exist_ok=True)


def _to_doc_out(doc: LoanDocument) -> DocumentOut:
    d = DocumentOut.model_validate(doc)
    d.download_url = f"/admin/loans/{doc.loan_application_id}/documents/{doc.id}/download"
    return d


def _to_loan_out(app: LoanApplication, user: Optional[User] = None) -> LoanApplicationOut:
    out = LoanApplicationOut.model_validate(app)
    if user:
        out.applicant_name = user.full_name
        out.applicant_email = user.email
        out.applicant_phone = user.phone
    elif app.applicant:
        out.applicant_name = app.applicant.full_name
        out.applicant_email = app.applicant.email
        out.applicant_phone = app.applicant.phone
    
    out.documents = [_to_doc_out(d) for d in (app.documents or [])]
    return out


# ──────────────────────────────────────────────────────────────
# 1. Loan Schemes & Requirement Checklists
# ──────────────────────────────────────────────────────────────
@router.get("/schemes", response_model=List[LoanSchemeRuleOut])
def get_all_loan_schemes(db: Session = Depends(get_db)):
    """
    Get all loan schemes along with their eligibility requirements, 
    source URLs, last verification date, and document requirements.
    """
    schemes = db.query(LoanSchemeRule).all()
    return schemes


@router.get("/schemes/{loan_type}", response_model=LoanSchemeRuleOut)
def get_loan_scheme_by_type(loan_type: str, db: Session = Depends(get_db)):
    """
    Get specific loan scheme rules and document checklist by loan_type
    (e.g., personal_loan, gold_loan, education_loan, vehicle_loan, business_loan, home_loan).
    """
    scheme = db.query(LoanSchemeRule).filter(LoanSchemeRule.loan_type == loan_type).first()
    if not scheme:
        # Support alias
        if loan_type == "auto_loan":
            scheme = db.query(LoanSchemeRule).filter(LoanSchemeRule.loan_type == "vehicle_loan").first()
    if not scheme:
        raise HTTPException(
            status_code=404,
            detail=f"Loan scheme '{loan_type}' not found. Available schemes: personal_loan, home_loan, vehicle_loan, education_loan, business_loan, gold_loan."
        )
    return scheme


# ──────────────────────────────────────────────────────────────
# 2. Hard Eligibility Filtering & Personalized Ranking Pipeline
# ──────────────────────────────────────────────────────────────
@router.post("/check-eligibility", response_model=EligibilityCheckResponse)
def check_loan_eligibility(payload: EligibilityCheckRequest, db: Session = Depends(get_db)):
    """
    Multi-step Eligibility Assessment Engine:
    Consumer inputs → hard eligibility filtering → document mapping → eligible loans → personalized ranking.
    """
    schemes = db.query(LoanSchemeRule).all()
    if not schemes:
        raise HTTPException(status_code=500, detail="Loan scheme configuration not initialized in database.")
    
    consumer_dict = payload.model_dump()
    result = rank_and_evaluate_all_loans(schemes, consumer_dict)
    return result


# ──────────────────────────────────────────────────────────────
# 3. Loan Application Submission & Management
# ──────────────────────────────────────────────────────────────
@router.post("/apply", response_model=LoanApplicationOut, status_code=201)
def apply_for_loan(
    payload: LoanApplicationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submit a comprehensive loan application for any of the 6 loan categories.
    Evaluates instant eligibility score and sets status to 'pending' for underwriting review.
    """
    # Normalize product type
    p_type = payload.product_type
    if p_type == "auto_loan":
        p_type = "vehicle_loan"

    # Evaluate eligibility score
    scheme = db.query(LoanSchemeRule).filter(LoanSchemeRule.loan_type == p_type).first()
    eval_res = None
    if scheme:
        eval_res = evaluate_loan_eligibility(scheme, payload.model_dump())

    data_dict = payload.model_dump()
    data_dict["product_type"] = p_type
    data_dict["user_id"] = current_user.id
    data_dict["status"] = "pending"

    if eval_res:
        data_dict["eligibility_status"] = eval_res["eligibility_status"]
        data_dict["eligibility_score"] = eval_res["match_score"]
        data_dict["estimated_emi"] = eval_res["estimated_monthly_emi"]
        data_dict["eligibility_remarks"] = "; ".join(eval_res["reasons"] + eval_res["missing_criteria"])

    application = LoanApplication(**data_dict)
    db.add(application)
    db.commit()
    db.refresh(application)

    return _to_loan_out(application, current_user)


@router.get("/my", response_model=List[LoanApplicationOut])
def my_applications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return all loan applications submitted by the logged-in user, 
    including document status and approval progress.
    """
    apps = (
        db.query(LoanApplication)
        .filter(LoanApplication.user_id == current_user.id)
        .order_by(LoanApplication.applied_at.desc())
        .all()
    )
    return [_to_loan_out(app, current_user) for app in apps]


@router.get("/{loan_id}", response_model=LoanApplicationOut)
def get_loan_application_detail(
    loan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get single loan application details for the authenticated user."""
    app = db.query(LoanApplication).filter(LoanApplication.id == loan_id).first()
    if not app:
        raise HTTPException(status_code=404, detail=f"Loan application #{loan_id} not found.")
    if app.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to access this loan application.")
    
    return _to_loan_out(app, current_user)


# ──────────────────────────────────────────────────────────────
# 4. Multi-Document Upload & Document Management
# ──────────────────────────────────────────────────────────────
@router.post("/{loan_id}/documents", response_model=DocumentOut, status_code=201)
async def upload_loan_document(
    loan_id: int,
    doc_category: str = Form(..., description="kyc | income | bank | loan_specific | collateral | co_applicant | other"),
    doc_type: str = Form(..., description="pan_card | aadhaar | salary_slip | bank_statement | etc."),
    verification_note: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a supporting document for a specific loan application.
    Saves file securely to local storage and binds metadata in database.
    """
    app = db.query(LoanApplication).filter(LoanApplication.id == loan_id).first()
    if not app:
        raise HTTPException(status_code=404, detail=f"Loan application #{loan_id} not found.")
    if app.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to upload documents for this loan application.")

    # Target directory structure: uploads/{user_id}/{loan_id}/
    user_loan_dir = os.path.join(UPLOAD_BASE_DIR, str(current_user.id), str(loan_id))
    os.makedirs(user_loan_dir, exist_ok=True)

    original_filename = file.filename or "document.pdf"
    file_ext = os.path.splitext(original_filename)[1]
    unique_name = f"{uuid.uuid4().hex[:12]}_{doc_category}_{doc_type}{file_ext}"
    saved_path = os.path.join(user_loan_dir, unique_name)

    # Save to disk
    file_size = 0
    with open(saved_path, "wb") as buffer:
        content = await file.read()
        file_size = len(content)
        buffer.write(content)

    doc_record = LoanDocument(
        loan_application_id=loan_id,
        user_id=current_user.id,
        doc_category=doc_category,
        doc_type=doc_type,
        original_filename=original_filename,
        stored_filename=unique_name,
        file_path=saved_path,
        file_size_bytes=file_size,
        mime_type=file.content_type,
        verification_status="pending",
        verification_note=verification_note,
        uploaded_at=datetime.utcnow()
    )
    db.add(doc_record)
    db.commit()
    db.refresh(doc_record)

    return _to_doc_out(doc_record)


@router.get("/{loan_id}/documents", response_model=List[DocumentOut])
def list_loan_documents(
    loan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all documents uploaded for a specific loan application."""
    app = db.query(LoanApplication).filter(LoanApplication.id == loan_id).first()
    if not app:
        raise HTTPException(status_code=404, detail=f"Loan application #{loan_id} not found.")
    if app.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to access documents for this application.")

    docs = db.query(LoanDocument).filter(LoanDocument.loan_application_id == loan_id).all()
    return [_to_doc_out(d) for d in docs]


@router.delete("/{loan_id}/documents/{doc_id}", status_code=204)
def delete_loan_document(
    loan_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an uploaded document if application is still pending review."""
    doc = db.query(LoanDocument).filter(
        LoanDocument.id == doc_id,
        LoanDocument.loan_application_id == loan_id
    ).first()
    
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document #{doc_id} not found.")
    if doc.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to delete this document.")

    # Remove file from disk
    if os.path.exists(doc.file_path):
        try:
            os.remove(doc.file_path)
        except OSError:
            pass

    db.delete(doc)
    db.commit()
    return None
