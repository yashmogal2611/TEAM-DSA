# Environment Configuration

Copy `.env.example` to `.env` and fill in your values.
Never commit `.env` to git — it's in `.gitignore`.

## .env.example
```
# Backend
SECRET_KEY=your-secret-key-here-change-in-production
DATABASE_URL=sqlite:///./loan_recs.db
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Admin seed
ADMIN_EMAIL=admin@loanapp.com
ADMIN_PASSWORD=Admin@123

# (Optional) PostgreSQL for production
# DATABASE_URL=postgresql://user:password@localhost:5432/loandb
```
