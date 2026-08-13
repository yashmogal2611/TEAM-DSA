# Tests

Unit and integration tests for the Loan Management API.

## Run tests
```bash
pip install pytest httpx
pytest tests/ -v
```

## Test files (to be created)
- `test_auth.py`     ← register, login, token validation
- `test_loans.py`    ← apply, view my loans
- `test_admin.py`    ← approve, reject, stats
