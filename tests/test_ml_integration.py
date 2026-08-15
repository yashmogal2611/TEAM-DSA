"""
Automated test to verify FastAPI app and /api/v1/recommend endpoint
"""
import sys
import os

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Add root and backend to sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)
sys.path.insert(0, os.path.join(BASE_DIR, "backend"))
sys.path.insert(0, os.path.join(BASE_DIR, "ml"))

from backend.main import app
from fastapi.testclient import TestClient

client = TestClient(app)

def test_health():
    resp = client.get("/health")
    print("Health check:", resp.status_code, resp.json())
    assert resp.status_code == 200

def test_ml_health():
    resp = client.get("/api/v1/health")
    print("ML Health check:", resp.status_code, resp.json())
    assert resp.status_code == 200

def test_approved_recommendation():
    sample_approved_payload = {
        "age": 35,
        "city": "Mumbai",
        "employment_type": "SALARIED",
        "income_type": "FIXED",
        "monthly_income": 90000,
        "existing_monthly_emi": 8000,
        "number_of_active_loans": 1,
        "credit_card_outstanding": 15000,
        "credit_score": 780,
        "total_work_experience": 10.0,
        "current_employment_duration": 4.0,
        "requested_loan_amount": 500000,
        "preferred_tenure_months": 36,
        "loan_purpose": "HOME_RENOVATION",
        "primary_preference": "LOWEST_EMI"
    }

    resp = client.post("/api/v1/recommend", json=sample_approved_payload)
    print("\n--- APPROVED RESPONSE ---")
    print("Status code:", resp.status_code)
    data = resp.json()
    print("Response status:", data.get("status"))
    print("Message:", data.get("message"))
    print("Risk Summary:", data.get("risk_summary"))
    print("Affordability Summary:", data.get("affordability_summary"))
    print("Recommendations count:", len(data.get("recommendations", [])))
    if data.get("recommendations"):
        print("Top recommendation:", data["recommendations"][0])
    print("Explanation:", data.get("explanation"))
    assert resp.status_code == 200
    assert data.get("status") == "APPROVED"

def test_rejected_recommendation():
    sample_rejected_payload = {
        "age": 35,
        "city": "Mumbai",
        "employment_type": "SALARIED",
        "income_type": "FIXED",
        "monthly_income": 90000,
        "existing_monthly_emi": 8000,
        "number_of_active_loans": 1,
        "credit_card_outstanding": 15000,
        "credit_score": 550,  # Below 600
        "total_work_experience": 10.0,
        "current_employment_duration": 4.0,
        "requested_loan_amount": 500000,
        "preferred_tenure_months": 36,
        "loan_purpose": "HOME_RENOVATION",
        "primary_preference": "LOWEST_EMI"
    }

    resp = client.post("/api/v1/recommend", json=sample_rejected_payload)
    print("\n--- REJECTED RESPONSE ---")
    print("Status code:", resp.status_code)
    data = resp.json()
    print("Response status:", data.get("status"))
    print("Message:", data.get("message"))
    print("Explanation:", data.get("explanation"))
    assert resp.status_code == 200
    assert data.get("status") == "REJECTED"

if __name__ == "__main__":
    test_health()
    test_ml_health()
    test_approved_recommendation()
    test_rejected_recommendation()
    print("\n>>> ALL TESTS PASSED SUCCESSFULLY! <<<")
