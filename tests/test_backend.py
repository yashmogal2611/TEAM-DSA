"""
test_backend.py
Integration & feature tests for redesigned Loan Management & Underwriting Backend.
Tests 6 loan categories, document uploads, eligibility pipeline, and admin controls.
"""
import os
import sys
import io

# Add backend directory to sys.path
backend_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, backend_path)

from fastapi.testclient import TestClient
from main import app
from database import init_db, get_db, Base, engine, seed_default_schemes

# Ensure DB and default seeds are initialized
init_db()

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    print("[PASS] /health passed")


def test_schemes_and_rules():
    # Test all schemes
    response = client.get("/loans/schemes")
    assert response.status_code == 200
    schemes = response.json()
    assert len(schemes) >= 6
    types = [s["loan_type"] for s in schemes]
    for expected in ["gold_loan", "education_loan", "business_loan", "vehicle_loan", "home_loan", "personal_loan"]:
        assert expected in types
    print(f"[PASS] /loans/schemes passed (Found {len(schemes)} loan schemes)")

    # Test single scheme (Gold Loan)
    gold_resp = client.get("/loans/schemes/gold_loan")
    assert gold_resp.status_code == 200
    gold_data = gold_resp.json()
    assert "PAN Card" in gold_data["kyc_documents"]
    assert "gold" in gold_data["collateral_requirement"].lower()
    print("[PASS] /loans/schemes/gold_loan passed")


def test_eligibility_engine():
    payload = {
        "age": 29,
        "employment_type": "salaried",
        "annual_income": 800000.0,
        "credit_score": 750,
        "existing_emi": 5000.0,
        "requested_amount": 400000.0,
        "preferred_tenure_months": 36,
        "gold_weight_grams": 50.0,
        "gold_purity_karats": 22.0
    }
    response = client.post("/loans/check-eligibility", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "ranked_eligible_loans" in data
    assert len(data["ranked_eligible_loans"]) > 0
    top_loan = data["ranked_eligible_loans"][0]
    assert "estimated_monthly_emi" in top_loan
    assert "required_documents_checklist" in top_loan
    print(f"[PASS] /loans/check-eligibility passed (Top recommended: {top_loan['display_name']} with score {top_loan['match_score']})")


def test_auth_and_application_flow():
    # 1. Register User
    user_email = "applicant_tester@loanapp.com"
    reg_payload = {
        "full_name": "Rohan Sharma",
        "email": user_email,
        "phone": "+919876543210",
        "password": "Password@123"
    }
    reg_resp = client.post("/auth/register", json=reg_payload)
    if reg_resp.status_code == 400:
        # Already exists from previous run, login instead
        pass
    else:
        assert reg_resp.status_code == 201

    # 2. Login User
    login_resp = client.post("/auth/login", json={"email": user_email, "password": "Password@123"})
    assert login_resp.status_code == 200
    user_token = login_resp.json()["access_token"]
    user_headers = {"Authorization": f"Bearer {user_token}"}
    print("[PASS] User registration & login passed")

    # 3. Apply for Gold Loan
    gold_app_payload = {
        "product_type": "gold_loan",
        "requested_amount": 250000.0,
        "tenure_months": 12,
        "purpose": "Emergency business inventory procurement",
        "age": 30,
        "credit_score": 710,
        "gold_weight_grams": 45.0,
        "gold_purity_karats": 22.0,
        "gold_item_description": "2 Gold Bangles and 1 Gold Chain",
        "estimated_gold_market_value": 320000.0
    }
    apply_resp = client.post("/loans/apply", json=gold_app_payload, headers=user_headers)
    assert apply_resp.status_code == 201
    gold_app = apply_resp.json()
    loan_id = gold_app["id"]
    assert gold_app["product_type"] == "gold_loan"
    assert gold_app["status"] == "pending"
    print(f"[PASS] Applied for Gold Loan (Application ID #{loan_id})")

    # 4. Upload Document for Application
    fake_file_content = b"%PDF-1.4 Fake PAN Card document for testing..."
    files = {
        "file": ("pan_card_sample.pdf", io.BytesIO(fake_file_content), "application/pdf")
    }
    form_data = {
        "doc_category": "kyc",
        "doc_type": "pan_card",
        "verification_note": "Clear government issued PAN copy"
    }
    upload_resp = client.post(
        f"/loans/{loan_id}/documents",
        data=form_data,
        files=files,
        headers=user_headers
    )
    assert upload_resp.status_code == 201
    doc_data = upload_resp.json()
    doc_id = doc_data["id"]
    assert doc_data["doc_type"] == "pan_card"
    assert doc_data["verification_status"] == "pending"
    print(f"[PASS] Uploaded document #{doc_id} for loan #{loan_id}")

    # 5. List user's documents
    docs_resp = client.get(f"/loans/{loan_id}/documents", headers=user_headers)
    assert docs_resp.status_code == 200
    assert len(docs_resp.json()) >= 1

    # 6. Admin Login & Review
    admin_login_resp = client.post("/auth/login", json={"email": "admin@loanapp.com", "password": "Admin@123"})
    assert admin_login_resp.status_code == 200
    admin_token = admin_login_resp.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    print("[PASS] Admin login passed")

    # 7. Admin verifies document
    verify_resp = client.patch(
        f"/admin/loans/{loan_id}/documents/{doc_id}/verify",
        json={"verification_status": "verified", "verification_note": "PAN details match NSDL records"},
        headers=admin_headers
    )
    assert verify_resp.status_code == 200
    assert verify_resp.json()["verification_status"] == "verified"
    print(f"[PASS] Admin verified document #{doc_id}")

    # 8. Admin downloads document
    download_resp = client.get(f"/admin/loans/{loan_id}/documents/{doc_id}/download", headers=admin_headers)
    assert download_resp.status_code == 200
    assert len(download_resp.content) > 0
    print("[PASS] Admin document download passed")

    # 9. Admin approves loan with sanction details
    approve_resp = client.patch(
        f"/admin/loans/{loan_id}/approve",
        json={
            "status": "approved",
            "sanctioned_amount": 240000.0,
            "interest_rate_offered": 8.75,
            "admin_note": "Approved based on physical gold appraisal verification."
        },
        headers=admin_headers
    )
    assert approve_resp.status_code == 200
    approved_app = approve_resp.json()
    assert approved_app["status"] == "approved"
    assert approved_app["sanctioned_amount"] == 240000.0
    print(f"[PASS] Admin approved loan #{loan_id}")

    # 10. Admin Stats
    stats_resp = client.get("/admin/stats", headers=admin_headers)
    assert stats_resp.status_code == 200
    stats = stats_resp.json()
    assert stats["total_applications"] >= 1
    assert stats["approved"] >= 1
    assert "gold_loan" in stats["applications_by_type"]
    print(f"[PASS] Admin stats passed: Total loans: {stats['total_applications']}, Total Volume: Rs.{stats['total_requested_volume']:,.0f}")


if __name__ == "__main__":
    print("\n--- Running Backend Tests ---")
    test_health_check()
    test_schemes_and_rules()
    test_eligibility_engine()
    test_auth_and_application_flow()
    print("\n*** ALL TESTS PASSED SUCCESSFULLY! ***\n")
