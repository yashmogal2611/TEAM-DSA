# Loan Management & Underwriting System — Cognizant Hackathon 2026
### Team DSA

A full-stack loan management platform with multi-category underwriting rules, intelligent eligibility evaluation, document management, and admin workflows, built for the Cognizant Hackathon 2026.

---

## Key Features

- **6 Loan Categories with Tailored Schemas**
  - 🏅 **Gold Loan** — Gold weight, purity (18k-24k), item details, 75% RBI LTV valuation
  - 🎓 **Education Loan** — Institution, course duration, admission status, co-applicant income, moratorium support
  - 🏢 **Business / MSME Loan** — Business vintage, turnover, GST registration, constitution type
  - 🚗 **Vehicle / Car Loan** — New/used vehicle, on-road quotation, down payment verification
  - 🏠 **Home Loan / Housing Finance** — Property type, property valuation, address, chain-of-title
  - 💳 **Personal Loan** — Flexible multi-purpose financing, income-to-EMI FOIR evaluation
- **Intelligent Multi-Step Eligibility Pipeline**
  - Consumer inputs → Hard eligibility filtering → Document mapping → Eligible loans → Personalized ranking
  - Real-time FOIR calculation, reducing-balance EMI estimation, and tailored financial advice
- **Document Management & Verification**
  - Multi-category document upload (KYC, Income, Bank, Loan-Specific, Collateral)
  - Admin document inspection, verification status marking, and direct secure download
- **Underwriting & Portfolio Analytics**
  - Review dashboard with filters across 6 loan types, search, and status tracking
  - Sanction amounts, custom interest rate offerings, and approval/rejection notes

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python) |
| Database | SQLite (dev) / PostgreSQL (prod) via SQLAlchemy 2.0 |
| Document Storage | Local Multipart File Engine + Static Mounting |
| Auth | JWT + bcrypt |
| Eligibility Engine | Rule-based Financial Evaluation + Reducing Balance EMI Models |
| Frontend | React / HTML+CSS+JS |

---

## Project Structure

```
TEAM-DSA/
├── README.md
├── requirements.txt          ← Python dependencies
├── .gitignore
│
├── backend/                  ← FastAPI backend
│   ├── main.py               ← App entry point & static mount
│   ├── database.py           ← SQLAlchemy models & scheme seeds
│   ├── schemas.py            ← Pydantic schemas & Implementation specs
│   ├── eligibility_engine.py ← Filtering, document mapping & ranking engine
│   ├── auth.py               ← JWT + bcrypt utilities
│   ├── uploads/              ← Secure file storage for applicant documents
│   └── routers/
│       ├── auth_router.py    ← /auth/* endpoints
│       ├── user_router.py    ← /loans/* (Schemes, Eligibility, Applications, Docs)
│       └── admin_router.py   ← /admin/* (Underwriting, Doc Verification, Stats)
│
├── frontend/                 ← Frontend (React / HTML)
├── ml/                       ← ML models and notebooks
├── data/                     ← Datasets
├── docs/                     ← API docs, diagrams
├── tests/
│   └── test_backend.py       ← Comprehensive integration test suite
└── config/                   ← Environment configs
```

---

## Getting Started

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Run the backend
```bash
cd backend
uvicorn main:app --reload --port 8000
```

### 3. Open API docs
```
http://127.0.0.1:8000/docs
```

### 4. Run automated test suite
```bash
python tests/test_backend.py
```

---

## API Overview

### 1. Loan Schemes & Eligibility
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/loans/schemes` | List all 6 loan schemes with full policy rules & doc checklists |
| GET | `/loans/schemes/{loan_type}` | Get specific loan scheme requirements & checklist |
| POST | `/loans/check-eligibility` | Run multi-step hard eligibility filtering & personalized ranking |

### 2. User & Loan Applications
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/auth/register` | Register new applicant account |
| POST | `/auth/login` | Login → receive JWT token + profile |
| GET | `/auth/me` | Current user profile |
| POST | `/loans/apply` | Apply for loan with category-specific fields |
| GET | `/loans/my` | View all applications submitted by logged-in user |
| GET | `/loans/{loan_id}` | Get application detail with documents |
| POST | `/loans/{loan_id}/documents` | Upload supporting document (multipart/form-data) |
| GET | `/loans/{loan_id}/documents` | List uploaded documents for an application |
| DELETE | `/loans/{loan_id}/documents/{doc_id}` | Delete uploaded document |

### 3. Admin & Underwriting
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/admin/loans` | View & search applications (filter by status/type) |
| GET | `/admin/loans/{id}` | View complete loan application with documents |
| PATCH | `/admin/loans/{id}/approve` | Approve loan with custom sanctioned amount & rate |
| PATCH | `/admin/loans/{id}/reject` | Reject loan with underwriting notes |
| PATCH | `/admin/loans/{id}/status` | Update loan status (under_review, approved, etc.) |
| GET | `/admin/loans/{id}/documents` | List applicant documents |
| PATCH | `/admin/loans/{id}/documents/{doc_id}/verify` | Verify or reject uploaded document |
| GET | `/admin/loans/{id}/documents/{doc_id}/download` | Download applicant document file |
| GET | `/admin/stats` | Portfolio analytics and loan breakdown |
| GET | `/admin/users` | List registered borrowers |

### Default Admin Credentials
```
Email:    admin@loanapp.com
Password: Admin@123
```

---

## Team DSA
Built with ❤️ for Cognizant Hackathon 2026
