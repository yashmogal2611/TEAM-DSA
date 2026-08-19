from sqlalchemy import (
    create_engine, Column, Integer, Float,
    String, DateTime, Boolean, ForeignKey, Text,
    event
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "loan_recs.db")
DATABASE_URL = f"sqlite:///{DB_FILE}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False, "timeout": 15})

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=5000")
    finally:
        cursor.close()

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
# Bank Entities (Multi-Tenant Institutions)
# ──────────────────────────────────────────────────────────────
class Bank(Base):
    __tablename__ = "banks"

    id = Column(Integer, primary_key=True, index=True)
    bank_code = Column(String(32), unique=True, nullable=False, index=True) # e.g. "SBI", "HDFC", "ICICI"
    bank_name = Column(String(128), nullable=False)                         # e.g. "State Bank of India"
    passkey_hash = Column(String(255), nullable=False)                      # Hashed tenant passkey (cross-checked on login)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    admins = relationship("User", back_populates="assigned_bank")
    applications = relationship("LoanApplication", back_populates="bank")


# ──────────────────────────────────────────────────────────────
# User Accounts
# ──────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    phone = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False)
    role = Column(String(32), default="borrower") # "borrower" | "bank_admin" | "super_admin"
    
    # Multi-tenant scoping: Bank Admin binding
    assigned_bank_id = Column(Integer, ForeignKey("banks.id"), nullable=True, index=True)
    assigned_bank = relationship("Bank", back_populates="admins")

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    loan_applications = relationship("LoanApplication", back_populates="applicant", cascade="all, delete-orphan")
    documents = relationship("LoanDocument", back_populates="user", cascade="all, delete-orphan")


# ──────────────────────────────────────────────────────────────
# Loan Scheme Rules (Policy, Criteria & Document Checklists)
# ──────────────────────────────────────────────────────────────
class LoanSchemeRule(Base):
    __tablename__ = "loan_scheme_rules"

    id = Column(Integer, primary_key=True, index=True)
    loan_type = Column(String, unique=True, nullable=False, index=True) # e.g. personal_loan, gold_loan, etc.
    display_name = Column(String, nullable=False)

    # Eligibility specifications
    age_requirement = Column(String, nullable=False)
    min_age = Column(Integer, default=21)
    max_age = Column(Integer, default=65)
    employment_requirement = Column(String, nullable=False)
    income_requirement = Column(String, nullable=False)
    min_annual_income = Column(Float, default=0.0)
    credit_requirement = Column(String, nullable=False)
    min_credit_score = Column(Integer, default=650)
    repayment_requirement = Column(String, nullable=False) # e.g. FOIR <= 50%
    max_foir_percentage = Column(Float, default=50.0)
    purpose_requirement = Column(String, nullable=False)
    collateral_requirement = Column(String, nullable=False) # None / optional / mandatory
    co_applicant_requirement = Column(String, nullable=False) # None / optional / mandatory
    down_payment_requirement = Column(String, nullable=False)
    min_down_payment_percentage = Column(Float, default=0.0)

    # Document checklists (stored as JSON string or comma-separated list)
    kyc_documents = Column(Text, nullable=False)
    income_documents = Column(Text, nullable=False)
    bank_documents = Column(Text, nullable=False)
    loan_specific_documents = Column(Text, nullable=False)
    collateral_documents = Column(Text, nullable=False)

    # Financial defaults
    base_interest_rate = Column(Float, default=10.5)
    min_amount = Column(Float, default=10000)
    max_amount = Column(Float, default=10000000)
    min_tenure_months = Column(Integer, default=6)
    max_tenure_months = Column(Integer, default=360)

    # Compliance & Metadata
    source_url = Column(String, nullable=False)
    last_verified = Column(String, nullable=False)


# ──────────────────────────────────────────────────────────────
# Loan Applications (Complete with all loan-type specific fields)
# ──────────────────────────────────────────────────────────────
class LoanApplication(Base):
    __tablename__ = "loan_applications"

    id = Column(Integer, primary_key=True, index=True)

    # Applicant relationship
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    applicant = relationship("User", back_populates="loan_applications")

    # ── Explicit Bank & Scheme Binding (Multi-Tenant Segregation) ─
    bank_id = Column(Integer, ForeignKey("banks.id"), nullable=True, index=True)
    bank_name = Column(String(128), nullable=True, index=True)   # Snapshot name e.g. "State Bank of India"
    scheme_id = Column(Integer, nullable=True)                   # Linked scheme id
    scheme_name = Column(String(128), nullable=True, index=True) # Snapshot scheme e.g. "SBI Regular Home Loan"
    bank = relationship("Bank", back_populates="applications")

    # Core Consumer Input Fields
    product_type = Column(String, nullable=False, index=True) # personal_loan, home_loan, vehicle_loan, education_loan, business_loan, gold_loan
    requested_amount = Column(Float, nullable=False)
    tenure_months = Column(Integer, nullable=False)
    purpose = Column(Text, nullable=True)

    # General Financial & Demographics
    age = Column(Integer, nullable=True)
    annual_income = Column(Float, nullable=True)
    monthly_income = Column(Float, nullable=True)
    employment_type = Column(String, nullable=True) # salaried, self_employed, business_owner, student, retired
    experience_years = Column(Float, nullable=True)
    credit_score = Column(Integer, nullable=True)
    existing_emi = Column(Float, default=0.0)

    # Co-applicant / Guarantor Fields
    has_co_applicant = Column(Boolean, default=False)
    co_applicant_name = Column(String, nullable=True)
    co_applicant_relation = Column(String, nullable=True)
    co_applicant_income = Column(Float, nullable=True)
    co_applicant_pan = Column(String, nullable=True)

    # Collateral Fields
    collateral_available = Column(Boolean, default=False)
    collateral_type = Column(String, nullable=True) # property, fixed_deposit, gold, securities, none
    collateral_estimated_value = Column(Float, nullable=True)

    # Down payment
    down_payment_amount = Column(Float, default=0.0)

    # ── Loan Specific Fields ──────────────────────────────────
    # 1. Vehicle / Car Loan
    vehicle_type = Column(String, nullable=True) # "new" | "used"
    vehicle_make_model = Column(String, nullable=True)
    vehicle_on_road_price = Column(Float, nullable=True)
    vehicle_quotation_amount = Column(Float, nullable=True)
    dealer_name = Column(String, nullable=True)

    # 2. Education Loan
    institution_name = Column(String, nullable=True)
    course_name = Column(String, nullable=True)
    course_country = Column(String, nullable=True)
    course_duration_months = Column(Integer, nullable=True)
    admission_confirmed = Column(Boolean, nullable=True)
    total_fee_estimate = Column(Float, nullable=True)

    # 3. Business / MSME Loan
    business_name = Column(String, nullable=True)
    business_type = Column(String, nullable=True) # proprietorship, partnership, pvt_ltd, llp, other
    business_vintage_years = Column(Float, nullable=True)
    annual_turnover = Column(Float, nullable=True)
    gst_number = Column(String, nullable=True)
    is_gst_registered = Column(Boolean, nullable=True)

    # 4. Gold Loan
    gold_weight_grams = Column(Float, nullable=True)
    gold_purity_karats = Column(Float, nullable=True) # e.g. 18, 20, 22, 24
    gold_item_description = Column(String, nullable=True)
    estimated_gold_market_value = Column(Float, nullable=True)

    # 5. Home Loan
    property_type = Column(String, nullable=True) # ready_to_move, under_construction, resale, plot_construction
    property_value = Column(Float, nullable=True)
    property_city = Column(String, nullable=True)
    property_address = Column(Text, nullable=True)

    # ── Workflow & Review Fields ──────────────────────────────
    status = Column(String, default="pending", nullable=False) # pending, under_review, approved, rejected
    admin_note = Column(Text, nullable=True)
    interest_rate_offered = Column(Float, nullable=True)
    sanctioned_amount = Column(Float, nullable=True)
    estimated_emi = Column(Float, nullable=True)
    
    # Automated eligibility calculation snapshot
    eligibility_status = Column(String, default="eligible") # eligible, conditionally_eligible, ineligible
    eligibility_score = Column(Float, default=80.0)
    eligibility_remarks = Column(Text, nullable=True)

    applied_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)

    # Uploaded documents relationship
    documents = relationship("LoanDocument", back_populates="loan_application", cascade="all, delete-orphan")


# ──────────────────────────────────────────────────────────────
# Loan Documents Table
# ──────────────────────────────────────────────────────────────
class LoanDocument(Base):
    __tablename__ = "loan_documents"

    id = Column(Integer, primary_key=True, index=True)
    loan_application_id = Column(Integer, ForeignKey("loan_applications.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Document details
    doc_category = Column(String, nullable=False) # kyc, income, bank, loan_specific, collateral, co_applicant, other
    doc_type = Column(String, nullable=False) # pan_card, aadhaar, salary_slip, bank_statement, etc.
    original_filename = Column(String, nullable=False)
    stored_filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_size_bytes = Column(Integer, default=0)
    mime_type = Column(String, nullable=True)

    # Verification workflow
    verification_status = Column(String, default="pending") # pending, verified, rejected
    verification_note = Column(Text, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    verified_at = Column(DateTime, nullable=True)

    # Relationships
    loan_application = relationship("LoanApplication", back_populates="documents")
    user = relationship("User", back_populates="documents")


# ──────────────────────────────────────────────────────────────
# DB Helpers & Seeds
# ──────────────────────────────────────────────────────────────
def _migrate_sqlite_columns():
    """Ensure all model columns exist in existing SQLite database tables."""
    from sqlalchemy import text, inspect
    try:
        inspector = inspect(engine)
        with engine.connect() as conn:
            for table_name, table in Base.metadata.tables.items():
                if inspector.has_table(table_name):
                    existing_cols = {col["name"] for col in inspector.get_columns(table_name)}
                    for col in table.columns:
                        if col.name not in existing_cols:
                            col_type = col.type.compile(engine.dialect)
                            default_clause = ""
                            if col.default is not None and getattr(col.default, "is_scalar", False):
                                val = col.default.arg
                                if isinstance(val, (int, float)):
                                    default_clause = f" DEFAULT {val}"
                                elif isinstance(val, str):
                                    default_clause = f" DEFAULT '{val}'"
                            try:
                                conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col.name} {col_type}{default_clause}"))
                                print(f"[DB MIGRATE] Added missing column '{col.name}' to table '{table_name}'")
                            except Exception as e:
                                print(f"[WARN] Could not add column '{col.name}' to '{table_name}': {e}")
            conn.commit()
    except Exception as e:
        print(f"[WARN] Database schema migration error: {e}")


def init_db():
    Base.metadata.create_all(bind=engine)
    _migrate_sqlite_columns()
    seed_default_schemes()
    seed_default_banks_and_admins()


def seed_default_banks_and_admins():
    """Create default partner banks with passkeys, bank-scoped admin accounts, and demo borrowers."""
    import bcrypt as _bcrypt
    from sqlalchemy import func
    db = SessionLocal()
    try:
        # 1. Seed Partner Banks
        banks_data = [
            {
                "bank_code": "SBI",
                "bank_name": "State Bank of India",
                "passkey": "SBI@Pass#2026",
                "admin_email": "sbi.admin@loanapp.com",
                "admin_name": "SBI Underwriting Admin",
                "admin_phone": "9811100001",
            },
            {
                "bank_code": "HDFC",
                "bank_name": "HDFC Bank",
                "passkey": "HDFC@Pass#2026",
                "admin_email": "hdfc.admin@loanapp.com",
                "admin_name": "HDFC Underwriting Admin",
                "admin_phone": "9811100002",
            },
            {
                "bank_code": "ICICI",
                "bank_name": "ICICI Bank",
                "passkey": "ICICI@Pass#2026",
                "admin_email": "icici.admin@loanapp.com",
                "admin_name": "ICICI Underwriting Admin",
                "admin_phone": "9811100003",
            },
            {
                "bank_code": "AXIS",
                "bank_name": "Axis Bank",
                "passkey": "AXIS@Pass#2026",
                "admin_email": "axis.admin@loanapp.com",
                "admin_name": "Axis Bank Underwriting Admin",
                "admin_phone": "9811100004",
            },
            {
                "bank_code": "KOTAK",
                "bank_name": "Kotak Mahindra Bank",
                "passkey": "KOTAK@Pass#2026",
                "admin_email": "kotak.admin@loanapp.com",
                "admin_name": "Kotak Underwriting Admin",
                "admin_phone": "9811100005",
            },
            {
                "bank_code": "BOB",
                "bank_name": "Bank of Baroda",
                "passkey": "BOB@Pass#2026",
                "admin_email": "bob.admin@loanapp.com",
                "admin_name": "BOB Underwriting Admin",
                "admin_phone": "9811100006",
            },
            {
                "bank_code": "UNION",
                "bank_name": "Union Bank of India",
                "passkey": "UNION@Pass#2026",
                "admin_email": "union.admin@loanapp.com",
                "admin_name": "Union Bank Underwriting Admin",
                "admin_phone": "9811100007",
            },
            {
                "bank_code": "TATA",
                "bank_name": "Tata Capital",
                "passkey": "TATA@Pass#2026",
                "admin_email": "tata.admin@loanapp.com",
                "admin_name": "Tata Capital Admin",
                "admin_phone": "9811100008",
            },
            {
                "bank_code": "BAJAJ",
                "bank_name": "Bajaj Finance",
                "passkey": "BAJAJ@Pass#2026",
                "admin_email": "bajaj.admin@loanapp.com",
                "admin_name": "Bajaj Finance Admin",
                "admin_phone": "9811100009",
            },
            {
                "bank_code": "MUTHOOT",
                "bank_name": "Muthoot Finance",
                "passkey": "MUTHOOT@Pass#2026",
                "admin_email": "muthoot.admin@loanapp.com",
                "admin_name": "Muthoot Gold Finance Admin",
                "admin_phone": "9811100010",
            },
            {
                "bank_code": "LIC",
                "bank_name": "LIC Housing Finance",
                "passkey": "LIC@Pass#2026",
                "admin_email": "lic.admin@loanapp.com",
                "admin_name": "LIC Housing Finance Underwriting Admin",
                "admin_phone": "9811100011",
            },
        ]

        bank_entities = {}
        for b_info in banks_data:
            existing_bank = db.query(Bank).filter(func.upper(Bank.bank_code) == b_info["bank_code"].upper()).first()
            if not existing_bank:
                p_hash = _bcrypt.hashpw(b_info["passkey"].encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")
                bank_obj = Bank(
                    bank_code=b_info["bank_code"],
                    bank_name=b_info["bank_name"],
                    passkey_hash=p_hash,
                    is_active=True
                )
                db.add(bank_obj)
                db.flush()
                bank_entities[b_info["bank_code"]] = bank_obj
            else:
                bank_entities[b_info["bank_code"]] = existing_bank

            # Seed specific bank admin user
            existing_b_admin = db.query(User).filter(func.lower(User.email) == b_info["admin_email"].lower()).first()
            if not existing_b_admin:
                pw_hash = _bcrypt.hashpw("Admin@123".encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")
                b_admin = User(
                    full_name=b_info["admin_name"],
                    email=b_info["admin_email"].lower(),
                    phone=b_info["admin_phone"],
                    hashed_password=pw_hash,
                    is_admin=True,
                    role="bank_admin",
                    assigned_bank_id=bank_entities[b_info["bank_code"]].id,
                    is_active=True
                )
                db.add(b_admin)

        # 2. Legacy / Global Default Admin (Assigned to SBI by default)
        sbi_bank = bank_entities.get("SBI")
        existing_admin = db.query(User).filter(func.lower(User.email) == "admin@loanapp.com").first()
        if not existing_admin:
            hashed = _bcrypt.hashpw("Admin@123".encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")
            admin = User(
                full_name="System Admin (SBI)",
                email="admin@loanapp.com",
                phone="9999999999",
                hashed_password=hashed,
                is_admin=True,
                role="bank_admin",
                assigned_bank_id=sbi_bank.id if sbi_bank else None,
                is_active=True
            )
            db.add(admin)
        elif existing_admin and not existing_admin.assigned_bank_id and sbi_bank:
            existing_admin.assigned_bank_id = sbi_bank.id
            existing_admin.role = "bank_admin"

        # 3. Demo Borrower (Ravi Kumar)
        existing_ravi = db.query(User).filter(func.lower(User.email) == "ravi@example.com").first()
        if not existing_ravi:
            hashed_ravi = _bcrypt.hashpw("MyPass@123".encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")
            ravi = User(
                full_name="Ravi Kumar",
                email="ravi@example.com",
                phone="9812345678",
                hashed_password=hashed_ravi,
                is_admin=False,
                role="borrower",
                is_active=True
            )
            db.add(ravi)

        # 4. Backfill existing loan applications without bank_id to matching banks
        existing_apps = db.query(LoanApplication).filter(LoanApplication.bank_id == None).all()
        for app in existing_apps:
            if app.bank_name:
                for b_code, b_obj in bank_entities.items():
                    if b_obj.bank_name.lower() in app.bank_name.lower() or b_code.lower() in app.bank_name.lower():
                        app.bank_id = b_obj.id
                        break
            if not app.bank_id and sbi_bank:
                app.bank_id = sbi_bank.id
                app.bank_name = sbi_bank.bank_name
                if not app.scheme_name:
                    app.scheme_name = f"{sbi_bank.bank_code} Regular Loan"

        db.commit()
    finally:
        db.close()


def seed_default_admin():
    seed_default_banks_and_admins()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def seed_default_schemes():
    """Seed loan scheme requirements based on real Indian banking standards and requirements schema."""
    db: SessionLocal = SessionLocal()
    try:
        schemes = [
            {
                "loan_type": "gold_loan",
                "display_name": "Gold Loan",
                "age_requirement": "Applicant meets lender's minimum age requirement (18-70 years)",
                "min_age": 18,
                "max_age": 70,
                "employment_requirement": "Salaried, Self-employed, Business Owner, Farmer, Homemaker, Student",
                "income_requirement": "No strict minimum income requirement; loan amount is governed by physical valuation of pledged gold",
                "min_annual_income": 0.0,
                "credit_requirement": "Credit score optional or lenient (minimum 550+ preferred for best rates)",
                "min_credit_score": 550,
                "repayment_requirement": "Bullet repayment / Regular monthly EMI / Overdraft arrangement supported",
                "max_foir_percentage": 70.0,
                "purpose_requirement": "Personal expenses, medical, agriculture, business working capital",
                "collateral_requirement": "Mandatory: Eligible gold jewellery / ornaments (18k - 24k purity)",
                "co_applicant_requirement": "Optional / Allowed for higher cumulative eligibility",
                "down_payment_requirement": "LTV up to 75% of appraised gold value as per RBI guidelines (25% margin)",
                "min_down_payment_percentage": 25.0,
                "kyc_documents": "PAN Card, Aadhaar Card / Passport / Voter ID, Passport-size Photographs",
                "income_documents": "Optional / Bank statement or self-declaration for high-ticket values",
                "bank_documents": "Bank account details / Cancelled cheque for loan disbursement",
                "loan_specific_documents": "Gold jewellery / eligible ornaments for physical assaying & pledge, Gold purchase invoice / ownership declaration if requested",
                "collateral_documents": "Gold deposit receipt & purity assay appraisal certificate",
                "base_interest_rate": 8.75,
                "min_amount": 10000.0,
                "max_amount": 5000000.0,
                "min_tenure_months": 3,
                "max_tenure_months": 36,
                "source_url": "https://rbi.org.in/Scripts/BS_ViewMasCirculardetails.aspx?id=12140",
                "last_verified": "2026-08-01",
            },
            {
                "loan_type": "education_loan",
                "display_name": "Education Loan",
                "age_requirement": "Student age typically 16-35 years; co-applicant age 21-65 years",
                "min_age": 16,
                "max_age": 35,
                "employment_requirement": "Student (enrolled / confirmed admission) with earning Parent/Guardian co-borrower",
                "income_requirement": "Co-applicant stable income to support debt service and collateral criteria",
                "min_annual_income": 250000.0,
                "credit_requirement": "Co-borrower credit score >= 650; clean credit history",
                "min_credit_score": 650,
                "repayment_requirement": "Moratorium period (Course duration + 6-12 months); Post-moratorium FOIR <= 50%",
                "max_foir_percentage": 50.0,
                "purpose_requirement": "Tuition fees, hostel, books, equipment, travel for recognized domestic/overseas courses",
                "collateral_requirement": "None up to ₹7.5 Lakhs (CGFSEL covered); Tangible collateral (property/FD) mandatory above ₹7.5 Lakhs",
                "co_applicant_requirement": "Mandatory: Parent, Guardian, Spouse, or Earning Co-borrower",
                "down_payment_requirement": "0% for studies in India up to 4L; 5% to 15% margin for studies abroad",
                "min_down_payment_percentage": 5.0,
                "kyc_documents": "Student PAN & Aadhaar/Passport, Parent/Co-applicant PAN & KYC, Passport Photographs",
                "income_documents": "Co-applicant Salary Slips (last 3 months) / Form 16 / ITR (last 2 years)",
                "bank_documents": "Co-applicant Bank Account Statement (last 6 months)",
                "loan_specific_documents": "Confirmed Admission / Offer Letter, Course details & duration, Fee structure schedule from institution, Academic mark sheets (10th, 12th, Degree), Entrance exam scorecard (GRE/GMAT/IELTS/CAT/NEET)",
                "collateral_documents": "Property title deeds / FD receipts / Security documents where loan exceeds ₹7.5 Lakhs",
                "base_interest_rate": 9.25,
                "min_amount": 50000.0,
                "max_amount": 15000000.0,
                "min_tenure_months": 12,
                "max_tenure_months": 180,
                "source_url": "https://www.vidyalakshmi.co.in/Students/",
                "last_verified": "2026-08-01",
            },
            {
                "loan_type": "business_loan",
                "display_name": "Business / MSME Loan",
                "age_requirement": "Business promoter age 21 to 65 years at loan maturity",
                "min_age": 21,
                "max_age": 65,
                "employment_requirement": "Business Owner, MSME Promoter, Proprietor, Partner, Managing Director",
                "income_requirement": "Minimum annual business turnover of ₹20 Lakhs with positive net profit & operating cash flow",
                "min_annual_income": 400000.0,
                "credit_requirement": "Individual CIBIL >= 680 and Commercial CMR score <= 5",
                "min_credit_score": 680,
                "repayment_requirement": "Debt Service Coverage Ratio (DSCR) >= 1.25, FOIR <= 60%",
                "max_foir_percentage": 60.0,
                "purpose_requirement": "Working capital, business expansion, machinery purchase, inventory financing",
                "collateral_requirement": "Optional / Unsecured up to ₹50 Lakhs (CGTMSE scheme); Tangible collateral for higher ticket sizes",
                "co_applicant_requirement": "Mandatory for Partnership/Private Ltd (All principal partners / Directors must co-sign)",
                "down_payment_requirement": "15% - 25% promoter contribution for equipment/asset purchases",
                "min_down_payment_percentage": 15.0,
                "kyc_documents": "Promoter / Director PAN, Aadhaar, Passport photographs, Business PAN card",
                "income_documents": "Audited Balance Sheet & P&L Statements (last 2-3 years), Business and Personal ITR with computation",
                "bank_documents": "Current account bank statements of business (last 12 months)",
                "loan_specific_documents": "Business registration / GST Certificate, Udyam MSME Registration, Partnership Deed / MOA & AOA, Existing loan repayment track records",
                "collateral_documents": "Title deeds of commercial/residential property, hypothecation agreement for machinery if secured",
                "base_interest_rate": 11.50,
                "min_amount": 100000.0,
                "max_amount": 20000000.0,
                "min_tenure_months": 12,
                "max_tenure_months": 84,
                "source_url": "https://msme.gov.in/schemes-and-programmes",
                "last_verified": "2026-08-01",
            },
            {
                "loan_type": "vehicle_loan",
                "display_name": "Vehicle / Car Loan",
                "age_requirement": "Age between 21 and 65 years at loan completion",
                "min_age": 21,
                "max_age": 65,
                "employment_requirement": "Salaried individuals with minimum 1 year stability or Self-Employed with 2 years vintage",
                "income_requirement": "Minimum net monthly income of ₹25,000 (Salaried) or ₹3,00,000 annual ITR (Self-Employed)",
                "min_annual_income": 300000.0,
                "credit_requirement": "Credit score 650+ (750+ qualifies for zero processing fees and lowest APR)",
                "min_credit_score": 650,
                "repayment_requirement": "Total monthly EMI obligations <= 50% of verified monthly take-home income",
                "max_foir_percentage": 50.0,
                "purpose_requirement": "Purchase of new or certified pre-owned commercial/personal passenger vehicle",
                "collateral_requirement": "Hypothecation of the financed vehicle with Regional Transport Office (RTO) endorsement",
                "co_applicant_requirement": "Optional / Allowed (mandatory if applicant income alone is insufficient)",
                "down_payment_requirement": "10% to 20% of on-road vehicle quotation (80% - 90% on-road funding)",
                "min_down_payment_percentage": 10.0,
                "kyc_documents": "PAN Card, Aadhaar Card / Driving License / Voter ID, Passport size photos",
                "income_documents": "Latest 3 months salary slips with Form 16 (Salaried) or 2 years ITR with financial computations (Self-Employed)",
                "bank_documents": "Bank statement for last 6 months showing regular salary credit or operational turnover",
                "loan_specific_documents": "Official dealer proforma invoice / quotation, Down payment / booking receipt, Vehicle RC & fitness certificate (for used vehicles)",
                "collateral_documents": "Vehicle hypothecation agreement and RTO Form 20/34 execution",
                "base_interest_rate": 8.95,
                "min_amount": 50000.0,
                "max_amount": 10000000.0,
                "min_tenure_months": 12,
                "max_tenure_months": 84,
                "source_url": "https://morth.nic.in/vehicle-financing-regulations",
                "last_verified": "2026-08-01",
            },
            {
                "loan_type": "home_loan",
                "display_name": "Home Loan / Housing Finance",
                "age_requirement": "21 to 65 years (Salaried) or up to 70 years (Self-employed) at loan maturity",
                "min_age": 21,
                "max_age": 65,
                "employment_requirement": "Salaried with permanent employment or Self-employed professionals / non-professionals",
                "income_requirement": "Minimum household annual income of ₹3,60,000",
                "min_annual_income": 360000.0,
                "credit_requirement": "Credit score >= 700 for prime interest rates (650+ considered with higher margin)",
                "min_credit_score": 650,
                "repayment_requirement": "FOIR <= 55% - 60% of net disposable income",
                "max_foir_percentage": 55.0,
                "purpose_requirement": "Purchase of ready flat, under-construction flat, plot + construction, or home renovation",
                "collateral_requirement": "Equitable / Registered mortgage on the financed residential property",
                "co_applicant_requirement": "Mandatory if co-owners exist; Earning spouse / parent adds income eligibility",
                "down_payment_requirement": "10% to 20% of property cost based on ticket size (LTV 80% - 90%)",
                "min_down_payment_percentage": 10.0,
                "kyc_documents": "PAN Card, Aadhaar Card, Passport photos of all applicants/co-owners",
                "income_documents": "Last 3 months salary slips, Form 16 (2 years) / 3 years ITR with computation of income",
                "bank_documents": "Last 6 months salary / operative bank statements",
                "loan_specific_documents": "Allotment letter / Sale Agreement, Builder NOC / Approved building plan, Payment receipts to builder / seller",
                "collateral_documents": "Original title deeds, chain of previous sale deeds, encumbrance certificate (13-30 years)",
                "base_interest_rate": 8.40,
                "min_amount": 500000.0,
                "max_amount": 50000000.0,
                "min_tenure_months": 60,
                "max_tenure_months": 360,
                "source_url": "https://nhb.org.in/housing-finance-norms",
                "last_verified": "2026-08-01",
            },
            {
                "loan_type": "personal_loan",
                "display_name": "Personal Loan",
                "age_requirement": "21 to 60 years at loan maturity",
                "min_age": 21,
                "max_age": 60,
                "employment_requirement": "Salaried employee at recognized company or self-employed with steady income",
                "income_requirement": "Minimum monthly take-home income of ₹20,000",
                "min_annual_income": 240000.0,
                "credit_requirement": "Credit score >= 680 (clean repayment track on existing credit cards/loans)",
                "min_credit_score": 680,
                "repayment_requirement": "Total monthly EMI obligations <= 45% - 50% of monthly income",
                "max_foir_percentage": 45.0,
                "purpose_requirement": "Unrestricted / multi-purpose (medical, wedding, travel, home improvement, debt consolidation)",
                "collateral_requirement": "None (100% Unsecured)",
                "co_applicant_requirement": "Optional (can be added to improve overall eligibility)",
                "down_payment_requirement": "Nil (0% down payment)",
                "min_down_payment_percentage": 0.0,
                "kyc_documents": "PAN Card, Aadhaar Card, Proof of current residence, Passport photographs",
                "income_documents": "Last 3 months salary slips, Form 16 / Latest ITR statement",
                "bank_documents": "Salary account bank statement for the last 6 months",
                "loan_specific_documents": "Declaration of purpose, Current employment ID card",
                "collateral_documents": "None required (unsecured loan)",
                "base_interest_rate": 10.99,
                "min_amount": 25000.0,
                "max_amount": 4000000.0,
                "min_tenure_months": 6,
                "max_tenure_months": 60,
                "source_url": "https://rbi.org.in/scripts/NotificationUser.aspx?Id=12032",
                "last_verified": "2026-08-01",
            }
        ]

        for s in schemes:
            existing = db.query(LoanSchemeRule).filter(LoanSchemeRule.loan_type == s["loan_type"]).first()
            if not existing:
                scheme_obj = LoanSchemeRule(**s)
                db.add(scheme_obj)
            else:
                for k, v in s.items():
                    setattr(existing, k, v)
        db.commit()
    finally:
        db.close()
