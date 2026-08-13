from sqlalchemy import (
    create_engine, Column, Integer, Float,
    String, DateTime, Boolean, ForeignKey, Text
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime

DATABASE_URL = "sqlite:///./loan_recs.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ──────────────────────────────────────────────────────────────
# Existing table – kept unchanged for backward compatibility
# ──────────────────────────────────────────────────────────────
class LoanSubmission(Base):
    __tablename__ = "loan_submissions"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String)
    email = Column(String)
    phone = Column(String)
    credit_score = Column(Integer)
    annual_income = Column(Float)
    employment_type = Column(String)
    years_employed = Column(Float)
    existing_emi = Column(Float)
    product_type_interest = Column(String)
    requested_amount = Column(Float)
    requested_tenure_months = Column(Integer)
    top_recommendation_product = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ──────────────────────────────────────────────────────────────
# NEW: User accounts
# ──────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    phone = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # one user → many loan applications
    loan_applications = relationship("LoanApplication", back_populates="applicant")


# ──────────────────────────────────────────────────────────────
# NEW: Loan applications with approval status
# ──────────────────────────────────────────────────────────────
class LoanApplication(Base):
    __tablename__ = "loan_applications"

    id = Column(Integer, primary_key=True, index=True)

    # who applied
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    applicant = relationship("User", back_populates="loan_applications")

    # loan details
    product_type = Column(String, nullable=False)          # personal_loan, home_loan …
    requested_amount = Column(Float, nullable=False)
    tenure_months = Column(Integer, nullable=False)
    annual_income = Column(Float, nullable=True)
    credit_score = Column(Integer, nullable=True)
    employment_type = Column(String, nullable=True)
    purpose = Column(Text, nullable=True)

    # status: "pending" | "approved" | "rejected"
    status = Column(String, default="pending", nullable=False)
    admin_note = Column(Text, nullable=True)               # optional message from admin

    applied_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)          # set when admin acts


# ──────────────────────────────────────────────────────────────
# DB helpers
# ──────────────────────────────────────────────────────────────
def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
