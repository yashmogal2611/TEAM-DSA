import sys
import os
import io
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_full_system_audit():
    print("=" * 65)
    print("FULL SYSTEM END-TO-END VERIFICATION & AUDIT")
    print("=" * 65)

    # 1. Health Checks
    r = client.get("/health")
    assert r.status_code == 200, f"Health failed: {r.text}"
    print("[PASS] GET /health ->", r.json())

    r = client.get("/api/v1/health")
    assert r.status_code == 200, f"ML Health failed: {r.text}"
    print("[PASS] GET /api/v1/health ->", r.json().get("status"))

    # 2. Auth: Login User
    r_login_user = client.post("/auth/login", json={"email": "ravi@example.com", "password": "MyPass@123"})
    assert r_login_user.status_code == 200, f"User login failed: {r_login_user.text}"
    user_token = r_login_user.json()["access_token"]
    user_headers = {"Authorization": f"Bearer {user_token}"}
    print("[PASS] POST /auth/login (User) ->", r_login_user.json()["full_name"])

    # 3. Auth: Login Admin
    r_login_admin = client.post("/auth/login", json={"email": "admin@loanapp.com", "password": "Admin@123"})
    assert r_login_admin.status_code == 200, f"Admin login failed: {r_login_admin.text}"
    admin_token = r_login_admin.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    print("[PASS] POST /auth/login (Admin) ->", r_login_admin.json()["full_name"], f"(is_admin: {r_login_admin.json()['is_admin']})")

    # 4. Auth: Profile
    r_me = client.get("/auth/me", headers=user_headers)
    assert r_me.status_code == 200
    print("[PASS] GET /auth/me ->", r_me.json()["email"])

    # 5. Schemes
    r_schemes = client.get("/loans/schemes")
    assert r_schemes.status_code == 200 and len(r_schemes.json()) >= 6
    print(f"[PASS] GET /loans/schemes -> {len(r_schemes.json())} schemes active")

    # 6. Smart Eligibility Calculator
    r_el = client.post("/loans/check-eligibility", json={
        "age": 30, "employment_type": "salaried", "annual_income": 960000,
        "credit_score": 760, "existing_emi": 8000, "requested_amount": 400000,
        "preferred_tenure_months": 36, "gold_weight_grams": 0, "gold_purity_karats": 0
    })
    assert r_el.status_code == 200 and len(r_el.json()["ranked_eligible_loans"]) > 0
    monthly_inc = r_el.json()["consumer_summary"]["monthly_income"]
    eligible_count = len(r_el.json()["ranked_eligible_loans"])
    print(f"[PASS] POST /loans/check-eligibility -> Monthly Income: Rs. {monthly_inc}, Eligible schemes: {eligible_count}")

    # 7. Apply Loan
    r_apply = client.post("/loans/apply", json={
        "product_type": "personal_loan",
        "requested_amount": 300000,
        "tenure_months": 24,
        "purpose": "Medical expenditure test",
        "annual_income": 960000,
        "credit_score": 760
    }, headers=user_headers)
    assert r_apply.status_code in (200, 201), f"Apply failed: {r_apply.text}"
    loan_id = r_apply.json()["id"]
    print(f"[PASS] POST /loans/apply -> Created Loan #{loan_id} (Status: {r_apply.json()['status']})")

    # 8. User Loans
    r_my = client.get("/loans/my", headers=user_headers)
    assert r_my.status_code == 200 and len(r_my.json()) > 0
    print(f"[PASS] GET /loans/my -> {len(r_my.json())} application(s) retrieved")

    # 9. Document Upload
    dummy_file = io.BytesIO(b"%PDF-1.4 Mock verification document content for testing")
    r_doc = client.post(f"/loans/{loan_id}/documents",
        files={"file": ("salary_slip_august.pdf", dummy_file, "application/pdf")},
        data={"doc_category": "income", "doc_type": "salary_slip"},
        headers=user_headers
    )
    assert r_doc.status_code in (200, 201), f"Doc upload failed: {r_doc.text}"
    doc_id = r_doc.json()["id"]
    print(f"[PASS] POST /loans/{loan_id}/documents -> Uploaded Doc #{doc_id} ({r_doc.json()['original_filename']})")

    # 10. Document Preview / Inspection
    r_view = client.get(f"/admin/loans/{loan_id}/documents/{doc_id}/view?token={admin_token}")
    assert r_view.status_code == 200 and len(r_view.content) > 0
    print(f"[PASS] GET /admin/loans/{loan_id}/documents/{doc_id}/view -> Verified inline stream ({len(r_view.content)} bytes, {r_view.headers.get('content-type')})")

    # 11. Admin Underwriting Decisions
    r_verify_doc = client.post(f"/admin/loans/{loan_id}/documents/{doc_id}/verify", 
        json={"verification_status": "verified", "verification_note": "Salary slips verified with bank records"}, 
        headers=admin_headers
    )
    assert r_verify_doc.status_code == 200, f"Verify doc failed: {r_verify_doc.text}"
    print(f"[PASS] POST /admin/loans/{loan_id}/documents/{doc_id}/verify -> Document status: {r_verify_doc.json()['verification_status']}")

    r_approve = client.post(f"/admin/loans/{loan_id}/approve", 
        json={"sanctioned_amount": 300000, "interest_rate_offered": 10.25, "admin_note": "Approved under prime borrower terms"}, 
        headers=admin_headers
    )
    assert r_approve.status_code == 200
    print(f"[PASS] POST /admin/loans/{loan_id}/approve -> Loan #{loan_id} Approved! Sanction: Rs. {r_approve.json()['sanctioned_amount']}")

    # 12. Admin Stats & Directory
    r_stats = client.get("/admin/stats", headers=admin_headers)
    assert r_stats.status_code == 200
    print(f"[PASS] GET /admin/stats -> Portfolio: Total: {r_stats.json()['total_applications']}, Approved: {r_stats.json()['approved']}")

    r_users = client.get("/admin/users", headers=admin_headers)
    assert r_users.status_code == 200
    print(f"[PASS] GET /admin/users -> {len(r_users.json())} registered borrowers listed")

    # 13. ML Recommendation Engine
    r_ml = client.post("/api/v1/recommend", json={
        "age": 34,
        "city": "Mumbai",
        "employment_type": "SALARIED",
        "income_type": "FIXED",
        "monthly_income": 90000,
        "existing_monthly_emi": 8000,
        "number_of_active_loans": 1,
        "credit_card_outstanding": 15000,
        "credit_score": 780,
        "total_work_experience": 8,
        "current_employment_duration": 3.5,
        "requested_loan_amount": 500000,
        "preferred_tenure_months": 36,
        "loan_purpose": "HOME_RENOVATION",
        "primary_preference": "LOWEST_EMI"
    })
    assert r_ml.status_code == 200 and r_ml.json()["status"] == "APPROVED"
    pd_val = r_ml.json()["risk_summary"]["probability_of_default"]
    top_lender = r_ml.json()["recommendations"][0]["lender_name"]
    print(f"[PASS] POST /api/v1/recommend -> Status: {r_ml.json()['status']}, PD: {pd_val}, Top lender: {top_lender}")

    print("=" * 65)
    print(">>> ALL 13 END-TO-END BACKEND & API SUITES PASSED FLAWLESSLY! <<<")
    print("=" * 65)

if __name__ == "__main__":
    test_full_system_audit()
