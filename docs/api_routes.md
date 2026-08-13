# API Routes — Frontend Integration Guide
**Base URL:** `http://127.0.0.1:8000`
**Swagger (interactive docs):** `http://127.0.0.1:8000/docs`

---

## Complete Route Summary

| # | Method | Route | Auth | Who |
|---|--------|-------|------|-----|
| 1 | `POST` | `/auth/register` | None | Anyone |
| 2 | `POST` | `/auth/login` | None | Anyone |
| 3 | `GET` | `/auth/me` | User/Admin JWT | Logged-in user |
| 4 | `POST` | `/loans/apply` | User JWT | User |
| 5 | `GET` | `/loans/my` | User JWT | User |
| 6 | `GET` | `/admin/loans` | Admin JWT | Admin |
| 7 | `PATCH` | `/admin/loans/{id}/approve` | Admin JWT | Admin |
| 8 | `PATCH` | `/admin/loans/{id}/reject` | Admin JWT | Admin |
| 9 | `GET` | `/admin/stats` | Admin JWT | Admin |
| 10 | `GET` | `/admin/users` | Admin JWT | Admin |
| 11 | `GET` | `/health` | None | Anyone |

---

## Auth Header
All protected routes require:
```
Authorization: Bearer <access_token>
```

## Default Admin
```
Email:    admin@loanapp.com
Password: Admin@123
```

## Loan Status Values
| Value | Meaning |
|-------|---------|
| `pending` | Waiting for admin review |
| `approved` | Loan approved |
| `rejected` | Loan rejected |
