/**
 * Initial Mock Database Seed
 * Matches the payload schemas in the Frontend Integration Guide exactly.
 */
const MOCK_DB = {
  users: [
    {
      id: 1,
      full_name: "Ravi Kumar",
      email: "ravi@example.com",
      phone: "9876543210",
      password: "MyPass@123",
      is_admin: false,
      created_at: "2026-08-13T10:00:00"
    },
    {
      id: 2,
      full_name: "Priya Sharma",
      email: "priya@example.com",
      phone: "9123456789",
      password: "User@123",
      is_admin: false,
      created_at: "2026-08-12T14:20:00"
    },
    {
      id: 99,
      full_name: "System Admin",
      email: "admin@loanapp.com",
      phone: "9999999999",
      password: "Admin@123",
      is_admin: true,
      created_at: "2026-08-01T00:00:00"
    }
  ],

  loans: [
    {
      id: 5,
      user_id: 1,
      applicant_name: "Ravi Kumar",
      applicant_email: "ravi@example.com",
      product_type: "home_loan",
      requested_amount: 500000,
      tenure_months: 120,
      annual_income: 800000,
      credit_score: 720,
      employment_type: "salaried",
      purpose: "Buy a house in Pune",
      status: "pending",
      admin_note: null,
      applied_at: "2026-08-13T12:30:00",
      reviewed_at: null
    },
    {
      id: 4,
      user_id: 2,
      applicant_name: "Priya Sharma",
      applicant_email: "priya@example.com",
      product_type: "auto_loan",
      requested_amount: 350000,
      tenure_months: 60,
      annual_income: 650000,
      credit_score: 780,
      employment_type: "salaried",
      purpose: "Purchase electric car",
      status: "approved",
      admin_note: "Excellent credit score & verifiable salary proofs.",
      applied_at: "2026-08-12T15:00:00",
      reviewed_at: "2026-08-13T09:15:00"
    },
    {
      id: 3,
      user_id: 1,
      applicant_name: "Ravi Kumar",
      applicant_email: "ravi@example.com",
      product_type: "personal_loan",
      requested_amount: 100000,
      tenure_months: 24,
      annual_income: 800000,
      credit_score: 610,
      employment_type: "salaried",
      purpose: "Medical emergency",
      status: "rejected",
      admin_note: "Insufficient income proof and low credit history.",
      applied_at: "2026-08-10T09:00:00",
      reviewed_at: "2026-08-11T11:00:00"
    }
  ],

  // Load state from localStorage or initialize
  init() {
    if (!localStorage.getItem('loan_app_mock_db')) {
      this.save();
    } else {
      try {
        const data = JSON.parse(localStorage.getItem('loan_app_mock_db'));
        this.users = data.users || this.users;
        this.loans = data.loans || this.loans;
      } catch (e) {
        this.save();
      }
    }
  },

  save() {
    localStorage.setItem('loan_app_mock_db', JSON.stringify({
      users: this.users,
      loans: this.loans
    }));
  }
};

MOCK_DB.init();
