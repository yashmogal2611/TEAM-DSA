# ApexLoans — Loan Portal Frontend Application

A financial loan application & administration web app matching the **API Routes — Frontend Integration Guide**.

## Base URL & Target Backend
- **Live Backend URL**: `http://127.0.0.1:8000`
- **Interactive Swagger Docs**: `http://127.0.0.1:8000/docs`
- **Built-in Mock Server Fallback**: Integrated into `js/api.js` for offline previewing & testing without requiring the FastAPI backend server to be running.

---

## Default Credentials for Testing

### 🛡️ System Admin
- **Email**: `admin@loanapp.com`
- **Password**: `Admin@123`
- **Redirects to**: Admin Dashboard (`is_admin: true`)

### 👤 Regular User
- **Email**: `ravi@example.com`
- **Password**: `MyPass@123`
- **Redirects to**: User Dashboard (`is_admin: false`)

---

## API Routes & Frontend Implementation Mapping

| # | Method | Endpoint | Auth | Purpose | Frontend View / Component |
|---|--------|----------|------|---------|---------------------------|
| 1 | `POST` | `/auth/register` | None | User Registration | Registration Form (`#/register`) |
| 2 | `POST` | `/auth/login` | None | User/Admin Login | Login Form (`#/login`) with quick fill |
| 3 | `GET` | `/auth/me` | Bearer Token | User Profile | Header User Bar & Profile Store |
| 4 | `POST` | `/loans/apply` | User Bearer | Apply for Loan | New Loan Application Modal & EMI Preview |
| 5 | `GET` | `/loans/my` | User Bearer | User's Applications | User Dashboard Table (`#/user-dashboard`) |
| 6 | `GET` | `/admin/loans` | Admin Bearer | List All Applications | Admin Dashboard Table (`#/admin-dashboard`) with `?status=` tabs |
| 7 | `PATCH` | `/admin/loans/{id}/approve` | Admin Bearer | Approve Application | Admin Review Modal Decision Action |
| 8 | `PATCH` | `/admin/loans/{id}/reject` | Admin Bearer | Reject Application | Admin Review Modal Decision Action |
| 9 | `GET` | `/admin/stats` | Admin Bearer | Admin Summary | Admin System KPI Cards |
| 10 | `GET` | `/admin/users` | Admin Bearer | Registered User List | User Directory (`#/admin-users`) |
| 11 | `GET` | `/health` | None | Health Check | Header Server Status Pill |

---

## UI Status Badges & Color Scheme
- ⏳ **Under Review** (`pending`): Amber/Yellow pill tag
- ✅ **Approved** (`approved`): Emerald Green pill tag
- ❌ **Rejected** (`rejected`): Rose Red pill tag

---

## Running locally

Serve the project directory with any web server (e.g., Python):

```bash
python -m http.server 3000 --directory "C:\Users\rishabh\.gemini\antigravity-ide\scratch\loan_app_frontend"
```

Open `http://127.0.0.1:3000` in your web browser.
