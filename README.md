# Loan Management System — Cognizant Hackathon 2026
### Team DSA

A full-stack loan management platform with ML-powered recommendations, built for the Cognizant Hackathon 2026.

---

## Features

- **User Auth** — Register, login, JWT-based sessions
- **Loan Applications** — Apply for personal, home, auto, and education loans
- **Admin Dashboard** — View all applications, approve or reject with notes
- **ML Recommendations** — Credit score-based loan product recommendation engine
- **Real-time Status** — Users see live status: Pending / Approved / Rejected

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python) |
| Database | SQLite (dev) / PostgreSQL (prod) |
| Auth | JWT + bcrypt |
| ML | Python (scikit-learn / custom logic) |
| Frontend | React / HTML+CSS+JS |

---

## Project Structure

```
cognizant-hackathon-2026/
├── README.md
├── requirements.txt          ← Python dependencies
├── .gitignore
│
├── backend/                  ← FastAPI backend
│   ├── main.py               ← App entry point
│   ├── database.py           ← SQLAlchemy models
│   ├── schemas.py            ← Pydantic schemas
│   ├── auth.py               ← JWT + bcrypt utilities
│   └── routers/
│       ├── auth_router.py    ← /auth/* endpoints
│       ├── user_router.py    ← /loans/* endpoints
│       └── admin_router.py   ← /admin/* endpoints
│
├── frontend/                 ← Frontend (React / HTML)
│
├── ml/                       ← ML models and notebooks
│
├── data/                     ← Datasets
│
├── docs/                     ← API docs, diagrams
│
├── tests/                    ← Unit and integration tests
│
└── config/                   ← Environment configs
```

---

## Getting Started

### 1. Clone the repo
```bash
git clone https://github.com/yashmogal2611/TEAM-DSA.git
cd TEAM-DSA
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Run the backend
```bash
cd backend
uvicorn main:app --reload --port 8000
```

### 4. Open API docs
```
http://127.0.0.1:8000/docs
```

---

## API Overview

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login → get JWT |
| GET | `/auth/me` | Get own profile |
| POST | `/loans/apply` | Submit loan application |
| GET | `/loans/my` | View my applications + status |
| GET | `/admin/loans` | Admin: view all applications |
| PATCH | `/admin/loans/{id}/approve` | Admin: approve loan |
| PATCH | `/admin/loans/{id}/reject` | Admin: reject loan |
| GET | `/admin/stats` | Admin: dashboard stats |

### Default Admin Credentials
```
Email:    admin@loanapp.com
Password: Admin@123
```

---

## Team DSA
Built with ❤️ for Cognizant Hackathon 2026
