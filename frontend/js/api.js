/**
 * API Client Engine for ApexLoans Portal
 * Full support for Schemes, Eligibility Calculation, Documents, and Admin Underwriting
 */
class ApiClient {
  constructor() {
    if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.startsWith('http') && window.location.port !== '5500' && window.location.port !== '3000' && window.location.port !== '5173') {
      this.baseUrl = window.location.origin;
    } else {
      this.baseUrl = CONFIG.API_BASE_URL;
    }
  }

  getHeaders(authRequired = true) {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (authRequired) {
      const token = localStorage.getItem(CONFIG.TOKEN_KEY);
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    return headers;
  }

  async request(endpoint, options = {}) {
    const isMock = CONFIG.getMockMode();

    if (!isMock) {
      try {
        const headers = options.isFormData
          ? { ...(options.auth !== false ? { 'Authorization': `Bearer ${localStorage.getItem(CONFIG.TOKEN_KEY)}` } : {}) }
          : { ...this.getHeaders(options.auth !== false), ...options.headers };

        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          ...options,
          headers
        });

        if (response.status === 401) {
          this.handleUnauthorized();
          const errData = await response.json().catch(() => ({ detail: 'Unauthorized' }));
          throw new Error(errData.detail || 'Unauthorized (401)');
        }

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || data.message || `HTTP error ${response.status}`);
        }
        return data;
      } catch (err) {
        console.warn('Backend connection failed. Operating in Mock Mode fallback.', err);
        CONFIG.setMockMode(true);
        if (typeof window !== 'undefined' && window.app && window.app.updateApiStatusPill) {
          window.app.updateApiStatusPill();
        }
        return this.mockRequest(endpoint, options);
      }
    } else {
      return this.mockRequest(endpoint, options);
    }
  }

  handleUnauthorized() {
    localStorage.removeItem(CONFIG.TOKEN_KEY);
    localStorage.removeItem(CONFIG.USER_KEY);
    window.dispatchEvent(new CustomEvent('auth:expired'));
  }

  /**
   * Simulated Server logic mirroring FastAPI backend specification
   */
  async mockRequest(endpoint, options = {}) {
    await new Promise(r => setTimeout(r, 200)); // 200ms latency simulation
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body && typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);

    const currentUser = MOCK_DB.users.find(u => token && token.includes(`user_${u.id}`));

    // 1. Health Check GET /health & ML Health GET /api/v1/health
    if (endpoint === '/health' || endpoint === '/api/v1/health') {
      return {
        status: 'ok',
        version: '2.5.0',
        models_loaded: {
          risk_model: true,
          risk_preprocessor: true,
          ranking_model: true,
          loan_products: true
        }
      };
    }

    // 1b. ML Hot-Reload POST /api/v1/reload-models
    if (endpoint === '/api/v1/reload-models' && method === 'POST') {
      return { status: 'ok', message: 'Model artifacts reloaded successfully.' };
    }

    // 1c. Legacy Contacts GET /contacts
    if (endpoint === '/contacts' && method === 'GET') {
      return MOCK_DB.loans.map(l => ({
        id: l.id,
        full_name: l.applicant_name || 'Applicant',
        email: l.applicant_email || 'user@example.com',
        phone: l.phone || '+91 9876543210',
        product_interest: l.product_type,
        recommended_product: l.product_type,
        submitted_at: l.applied_at
      }));
    }

    // 2. Auth: Register POST /auth/register
    if (endpoint === '/auth/register' && method === 'POST') {
      const existing = MOCK_DB.users.find(u => u.email.toLowerCase() === body.email.toLowerCase());
      if (existing) {
        throw new Error('Email already registered (400)');
      }
      const newUser = {
        id: MOCK_DB.users.length + 1,
        full_name: body.full_name,
        email: body.email,
        phone: body.phone,
        password: body.password,
        is_admin: false,
        created_at: new Date().toISOString().split('.')[0]
      };
      MOCK_DB.users.push(newUser);
      MOCK_DB.save();
      const { password, ...userResponse } = newUser;
      return userResponse;
    }

    // 3. Auth: Login POST /auth/login
    if (endpoint === '/auth/login' && method === 'POST') {
      const user = MOCK_DB.users.find(
        u => u.email.toLowerCase() === body.email.toLowerCase() && u.password === body.password
      );
      if (!user) {
        throw new Error('Invalid email or password (401)');
      }
      const mockToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.user_${user.id}_mock_token`;
      return {
        access_token: mockToken,
        token_type: 'bearer',
        is_admin: user.is_admin,
        user_id: user.id,
        email: user.email,
        full_name: user.full_name
      };
    }

    // 4. Schemes GET /loans/schemes
    if (endpoint === '/loans/schemes' && method === 'GET') {
      return MOCK_DB.schemes;
    }

    // 5. Scheme Details GET /loans/schemes/{loan_type}
    if (endpoint.startsWith('/loans/schemes/') && method === 'GET') {
      const loanType = endpoint.split('/')[3];
      const scheme = MOCK_DB.schemes.find(s => s.loan_type === loanType);
      if (!scheme) throw new Error('Scheme not found (404)');
      return scheme;
    }

    // 6. ML Model Loan Recommendation API POST /api/v1/recommend
    if (endpoint === '/api/v1/recommend' && method === 'POST') {
      const allowedEnums = {
        primary_preference: ['LOWEST_EMI', 'LOWEST_TOTAL_COST', 'SHORTEST_TENURE', 'REQUIRED_AMOUNT'],
        employment_type: ['SALARIED', 'SELF_EMPLOYED', 'BUSINESS_OWNER'],
        income_type: ['FIXED', 'VARIABLE', 'MIXED'],
        loan_purpose: ['HOME_RENOVATION', 'HOME_PURCHASE', 'HOME_CONSTRUCTION', 'MEDICAL', 'EDUCATION', 'TRAVEL', 'WEDDING', 'VEHICLE_PURCHASE', 'BUSINESS', 'DEBT_CONSOLIDATION', 'OTHER']
      };

      // Check enum values match strictly (422 HTTP validation)
      if (
        (body.primary_preference && !allowedEnums.primary_preference.includes(body.primary_preference)) ||
        (body.employment_type && !allowedEnums.employment_type.includes(body.employment_type)) ||
        (body.income_type && !allowedEnums.income_type.includes(body.income_type)) ||
        (body.loan_purpose && !allowedEnums.loan_purpose.includes(body.loan_purpose))
      ) {
        const errorMsg = 'Invalid option selected in request parameters.';
        throw new Error(errorMsg);
      }

      const age = Number(body.age || 35);
      const monthlyIncome = Number(body.monthly_income || 90000);
      const existingEmi = Number(body.existing_monthly_emi || 0);
      const activeLoans = Number(body.number_of_active_loans || 0);
      const creditScore = Number(body.credit_score || 750);
      const empDuration = Number(body.current_employment_duration || 1.0);
      const requestedAmt = Number(body.requested_loan_amount || 500000);
      const tenure = Number(body.preferred_tenure_months || 36);
      const purpose = body.loan_purpose || 'HOME_RENOVATION';
      const empType = body.employment_type || 'SALARIED';

      const requestId = Math.random().toString(36).substring(2, 10);

      // Evaluate Eligibility Rules
      const rejectionReasons = [];
      let rejectionCode = '';

      if (age < 21) {
        rejectionCode = 'MIN_AGE';
        rejectionReasons.push(`Applicant age (${age}) is below minimum requirement of 21 years.`);
      } else if (age > 65) {
        rejectionCode = 'MAX_AGE';
        rejectionReasons.push(`Applicant age (${age}) exceeds maximum allowed limit of 65 years.`);
      } else if (creditScore < 600) {
        rejectionCode = 'MIN_CREDIT_SCORE';
        rejectionReasons.push(`Credit score must be at least 600.`);
      } else if (monthlyIncome < 20000) {
        rejectionCode = 'MIN_MONTHLY_INCOME';
        rejectionReasons.push(`Monthly income (₹${monthlyIncome.toLocaleString('en-IN')}) is below minimum limit of ₹20,000.`);
      } else if (activeLoans > 5) {
        rejectionCode = 'MAX_ACTIVE_LOANS';
        rejectionReasons.push(`Number of active loans (${activeLoans}) exceeds maximum limit of 5.`);
      } else if (empDuration < 0.5) {
        rejectionCode = 'MIN_EMPLOYMENT_DURATION';
        rejectionReasons.push(`Current employment duration (${empDuration} yrs) is below minimum required 6 months (0.5 yrs).`);
      } else if (purpose === 'BUSINESS' && empType === 'SALARIED') {
        rejectionCode = 'BUSINESS_LOAN_EMPLOYMENT';
        rejectionReasons.push(`Business loan is only available for SELF_EMPLOYED or BUSINESS_OWNER applicants.`);
      }

      // Check max EMI ratio (65% of monthly income)
      const estMonthlyRate = 10.5 / 12 / 100;
      const estNewEmi = (requestedAmt * estMonthlyRate * Math.pow(1 + estMonthlyRate, tenure)) / (Math.pow(1 + estMonthlyRate, tenure) - 1);
      const totalObligation = existingEmi + estNewEmi;
      const foir = monthlyIncome > 0 ? (totalObligation / monthlyIncome) : 0.9;

      if (foir > 0.65 && rejectionReasons.length === 0) {
        rejectionCode = 'MAX_EMI_RATIO';
        rejectionReasons.push(`Total EMI commitments (${(foir * 100).toFixed(1)}%) exceed maximum allowed 65% of monthly income.`);
      }

      // 1. REJECTED RESPONSE
      if (rejectionReasons.length > 0) {
        return {
          status: "REJECTED",
          message: rejectionReasons[0],
          risk_summary: null,
          affordability_summary: null,
          recommendations: [],
          explanation: {
            eligibility_reasons: [
              `❌ ${rejectionCode}`,
              rejectionReasons[0]
            ],
            risk_drivers: [],
            offer_reasons: [],
            comparative_reasons: []
          },
          request_id: requestId
        };
      }

      // 2. APPROVED RESPONSE
      const maxTotalEmi = Math.round(monthlyIncome * 0.65);
      const maxAffordableNewEmi = Math.max(0, maxTotalEmi - existingEmi);

      const defaultProb = Number((Math.max(0.01, (900 - creditScore) / 4000)).toFixed(4));
      const riskBand = creditScore >= 750 ? "LOW" : creditScore >= 670 ? "MEDIUM" : "HIGH";
      const riskScore = Number((1 - defaultProb).toFixed(4));

      // Generate Lender Product recommendations
      const lenders = [
        { name: "HDFC Bank", code: "HDFC", rateOffset: 0.0 },
        { name: "ICICI Bank", code: "ICICI", rateOffset: 0.25 },
        { name: "Axis Bank", code: "AXIS", rateOffset: 0.50 }
      ];

      const recommendations = lenders.map((lender, index) => {
        const baseRate = 10.5 + lender.rateOffset;
        const personalizedRate = Number((baseRate - (creditScore >= 780 ? 0.6 : creditScore >= 720 ? 0.2 : 0)).toFixed(2));
        const r = personalizedRate / 12 / 100;
        const monthlyEmi = Number(((requestedAmt * r * Math.pow(1 + r, tenure)) / (Math.pow(1 + r, tenure) - 1)).toFixed(2));
        const feePct = 1.5;
        const feeAmount = Math.round(requestedAmt * (feePct / 100));
        const totalRepayment = Number((monthlyEmi * tenure + feeAmount).toFixed(2));
        const totalInterest = Number((totalRepayment - requestedAmt - feeAmount).toFixed(2));

        return {
          product_id: `${lender.code}_${purpose.substring(0, 4)}_${String(index + 1).padStart(2, '0')}`,
          product_name: `${lender.name} ${purpose.replace('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())} Loan`,
          lender_name: lender.name,
          offer_amount: requestedAmt,
          tenure_months: tenure,
          base_interest_rate: baseRate,
          personalised_rate: personalizedRate,
          monthly_emi: monthlyEmi,
          total_repayment: totalRepayment,
          total_interest: totalInterest,
          processing_fee_pct: feePct,
          processing_fee_amount: feeAmount,
          scores: {
            need_match: 1.0,
            affordability: Number((Math.min(1.0, maxAffordableNewEmi / monthlyEmi)).toFixed(4)),
            risk_fit: riskScore,
            cost: Number((1.0 - (index * 0.05)).toFixed(4)),
            tenure_preference: 1.0,
            composite: Number((0.92 - (index * 0.04)).toFixed(4))
          },
          rank: index + 1
        };
      });

      return {
        status: "APPROVED",
        message: `Found ${recommendations.length} personalised loan offer(s) for you.`,
        risk_summary: {
          probability_of_default: defaultProb,
          risk_band: riskBand,
          risk_score: riskScore
        },
        affordability_summary: {
          monthly_income: monthlyIncome,
          existing_monthly_emi: existingEmi,
          max_total_emi: maxTotalEmi,
          max_affordable_new_emi: maxAffordableNewEmi
        },
        recommendations: recommendations,
        explanation: {
          eligibility_reasons: ["You meet all eligibility criteria."],
          risk_drivers: [
            {
              feature: "credit_score",
              impact: -0.3,
              direction: "reduces_risk",
              note: `Excellent credit score of ${creditScore}`
            },
            {
              feature: "employment_duration",
              impact: -0.15,
              direction: "reduces_risk",
              note: `Stable employment tenure of ${empDuration} years`
            }
          ],
          offer_reasons: [
            `✅ Covers your full requested amount of ₹${requestedAmt.toLocaleString('en-IN')}.`,
            `✅ Low total interest cost of ₹${recommendations[0].total_interest.toLocaleString('en-IN')}.`,
            `✅ Competitive personalized interest rate starting at ${recommendations[0].personalised_rate}% p.a.`
          ],
          comparative_reasons: [
            `${recommendations[0].lender_name} offers the lowest EMI among all matched lenders.`
          ]
        },
        request_id: requestId
      };
    }

    // Protected Auth check
    if (!token && options.auth !== false) {
      this.handleUnauthorized();
      throw new Error('Token missing / expired / invalid (401)');
    }

    // 7. Auth: Me GET /auth/me
    if (endpoint === '/auth/me' && method === 'GET') {
      if (!currentUser) throw new Error('Unauthorized (401)');
      const { password, ...userProfile } = currentUser;
      return userProfile;
    }

    // 8. User: Apply Loan POST /loans/apply
    if (endpoint === '/loans/apply' && method === 'POST') {
      if (!currentUser) throw new Error('Not logged in (401)');

      const newLoan = {
        id: MOCK_DB.loans.length + 1,
        user_id: currentUser.id,
        applicant_name: currentUser.full_name,
        applicant_email: currentUser.email,
        product_type: body.product_type,
        requested_amount: Number(body.requested_amount),
        sanctioned_amount: null,
        interest_rate_offered: null,
        tenure_months: Number(body.tenure_months),
        annual_income: Number(body.annual_income || 600000),
        credit_score: Number(body.credit_score || 720),
        employment_type: body.employment_type || 'salaried',
        purpose: body.purpose || '',
        ...body,
        status: 'pending',
        admin_note: null,
        applied_at: new Date().toISOString().split('.')[0],
        reviewed_at: null
      };

      MOCK_DB.loans.unshift(newLoan);
      MOCK_DB.save();
      return newLoan;
    }

    // 9. User: My Loans GET /loans/my
    if (endpoint === '/loans/my' && method === 'GET') {
      if (!currentUser) throw new Error('Not logged in (401)');
      return MOCK_DB.loans.filter(l => l.user_id === currentUser.id);
    }

    // 10. Single Loan Details GET /loans/{id}
    if (endpoint.match(/\/loans\/\d+$/) && method === 'GET') {
      const loanId = parseInt(endpoint.split('/')[2]);
      const loan = MOCK_DB.loans.find(l => l.id === loanId);
      if (!loan) throw new Error('Loan not found (404)');
      return loan;
    }

    // 11. Documents: Upload POST /loans/{id}/documents
    if (endpoint.match(/\/loans\/\d+\/documents$/) && method === 'POST') {
      const loanId = parseInt(endpoint.split('/')[2]);
      const doc = {
        doc_id: (MOCK_DB.documents.length + 1) * 101,
        loan_id: loanId,
        doc_category: options.formData?.get('doc_category') || 'kyc',
        doc_type: options.formData?.get('doc_type') || 'document',
        file_name: options.formData?.get('file')?.name || 'uploaded_document.pdf',
        file_size: '2.1 MB',
        status: 'pending',
        verification_note: options.formData?.get('verification_note') || 'Awaiting review',
        uploaded_at: new Date().toISOString().split('.')[0]
      };
      MOCK_DB.documents.push(doc);
      MOCK_DB.save();
      return doc;
    }

    // 12. Documents: List GET /loans/{id}/documents
    if (endpoint.match(/\/loans\/\d+\/documents$/) && method === 'GET') {
      const loanId = parseInt(endpoint.split('/')[2]);
      return MOCK_DB.documents.filter(d => d.loan_id === loanId);
    }

    // 13. Documents: Delete DELETE /loans/{id}/documents/{doc_id}
    if (endpoint.match(/\/loans\/\d+\/documents\/\d+$/) && method === 'DELETE') {
      const parts = endpoint.split('/');
      const docId = parseInt(parts[4]);
      MOCK_DB.documents = MOCK_DB.documents.filter(d => d.doc_id !== docId);
      MOCK_DB.save();
      return { success: true, message: 'Document deleted' };
    }

    // 14. Admin: List Loans GET /admin/loans
    if (endpoint.startsWith('/admin/loans') && method === 'GET') {
      if (!currentUser || !currentUser.is_admin) throw new Error('Not authorized as admin (403)');
      const statusFilter = new URL(`http://dummy${endpoint}`).searchParams.get('status');
      return statusFilter ? MOCK_DB.loans.filter(l => l.status === statusFilter) : MOCK_DB.loans;
    }

    // 15. Admin: Approve Loan PATCH /admin/loans/{id}/approve
    if (endpoint.match(/\/admin\/loans\/\d+\/approve/) && method === 'PATCH') {
      if (!currentUser || !currentUser.is_admin) throw new Error('Not an admin (403)');
      const loanId = parseInt(endpoint.split('/')[3]);
      const loan = MOCK_DB.loans.find(l => l.id === loanId);
      if (!loan) throw new Error('Application not found (404)');

      loan.status = 'approved';
      loan.sanctioned_amount = body?.sanctioned_amount ? Number(body.sanctioned_amount) : loan.requested_amount;
      loan.interest_rate_offered = body?.interest_rate_offered ? Number(body.interest_rate_offered) : 10.5;
      loan.admin_note = body?.admin_note || 'Approved by underwriter.';
      loan.reviewed_at = new Date().toISOString().split('.')[0];
      MOCK_DB.save();
      return loan;
    }

    // 16. Admin: Reject Loan PATCH /admin/loans/{id}/reject
    if (endpoint.match(/\/admin\/loans\/\d+\/reject/) && method === 'PATCH') {
      if (!currentUser || !currentUser.is_admin) throw new Error('Not an admin (403)');
      const loanId = parseInt(endpoint.split('/')[3]);
      const loan = MOCK_DB.loans.find(l => l.id === loanId);
      if (!loan) throw new Error('Application not found (404)');

      loan.status = 'rejected';
      loan.admin_note = body?.admin_note || 'Application rejected.';
      loan.reviewed_at = new Date().toISOString().split('.')[0];
      MOCK_DB.save();
      return loan;
    }

    // 17. Admin: Document Verify PATCH /admin/loans/{id}/documents/{doc_id}/verify
    if (endpoint.match(/\/admin\/loans\/\d+\/documents\/\d+\/verify/) && method === 'PATCH') {
      if (!currentUser || !currentUser.is_admin) throw new Error('Not an admin (403)');
      const parts = endpoint.split('/');
      const docId = parseInt(parts[5]);
      const doc = MOCK_DB.documents.find(d => d.doc_id === docId);
      if (!doc) throw new Error('Document not found (404)');

      doc.status = body?.status || 'verified';
      doc.verification_note = body?.verification_note || 'Verified by admin';
      MOCK_DB.save();
      return doc;
    }

    // 18. Admin: Stats GET /admin/stats
    if (endpoint === '/admin/stats' && method === 'GET') {
      if (!currentUser || !currentUser.is_admin) throw new Error('Not an admin (403)');
      return {
        total_applications: MOCK_DB.loans.length,
        pending: MOCK_DB.loans.filter(l => l.status === 'pending').length,
        approved: MOCK_DB.loans.filter(l => l.status === 'approved').length,
        rejected: MOCK_DB.loans.filter(l => l.status === 'rejected').length,
        total_users: MOCK_DB.users.filter(u => !u.is_admin).length
      };
    }

    // 19. Admin: Users GET /admin/users
    if (endpoint === '/admin/users' && method === 'GET') {
      if (!currentUser || !currentUser.is_admin) throw new Error('Not an admin (403)');
      return MOCK_DB.users.filter(u => !u.is_admin).map(({ password, ...u }) => u);
    }

    throw new Error(`Endpoint ${endpoint} not found (404)`);
  }

  // Convenience API Methods
  register(userData) {
    return this.request('/auth/register', { method: 'POST', body: JSON.stringify(userData), auth: false });
  }

  login(credentials) {
    return this.request('/auth/login', { method: 'POST', body: JSON.stringify(credentials), auth: false });
  }

  getMe() {
    return this.request('/auth/me');
  }

  getLoanSchemes() {
    return this.request('/loans/schemes', { auth: false });
  }

  getLoanScheme(loanType) {
    return this.request(`/loans/schemes/${loanType}`, { auth: false });
  }

  recommendLoans(inputs) {
    return this.request('/api/v1/recommend', { method: 'POST', body: JSON.stringify(inputs), auth: false });
  }

  checkEligibility(inputs) {
    return this.recommendLoans(inputs);
  }

  applyLoan(loanData) {
    return this.request('/loans/apply', { method: 'POST', body: JSON.stringify(loanData) });
  }

  getMyLoans() {
    return this.request('/loans/my');
  }

  getLoanDetails(id) {
    return this.request(`/loans/${id}`);
  }

  uploadDocument(loanId, formData) {
    return this.request(`/loans/${loanId}/documents`, { method: 'POST', body: formData, isFormData: true });
  }

  getDocuments(loanId) {
    return this.request(`/loans/${loanId}/documents`);
  }

  deleteDocument(loanId, docId) {
    return this.request(`/loans/${loanId}/documents/${docId}`, { method: 'DELETE' });
  }

  getAdminLoans(status = '') {
    const query = status ? `?status=${status}` : '';
    return this.request(`/admin/loans${query}`);
  }

  approveLoan(id, data = {}) {
    return this.request(`/admin/loans/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'approved',
        sanctioned_amount: data.sanctioned_amount,
        interest_rate_offered: data.interest_rate_offered,
        admin_note: data.admin_note
      })
    });
  }

  rejectLoan(id, admin_note = '') {
    return this.request(`/admin/loans/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected', admin_note })
    });
  }

  verifyDocument(loanId, docId, status = 'verified', note = '') {
    return this.request(`/admin/loans/${loanId}/documents/${docId}/verify`, {
      method: 'PATCH',
      body: JSON.stringify({ status, verification_note: note })
    });
  }

  getAdminStats() {
    return this.request('/admin/stats');
  }

  getAdminUsers() {
    return this.request('/admin/users');
  }

  checkHealth() {
    return this.request('/health', { auth: false });
  }

  getMlHealth() {
    return this.request('/api/v1/health', { auth: false });
  }

  reloadMlModels() {
    return this.request('/api/v1/reload-models', { method: 'POST' });
  }

  getContacts() {
    return this.request('/contacts');
  }

  legacyRecommend(payload) {
    return this.request('/recommend', { method: 'POST', body: JSON.stringify(payload), auth: false });
  }

  getDocumentViewUrl(loanId, docId) {
    const token = localStorage.getItem(CONFIG.TOKEN_KEY) || '';
    return `${this.baseUrl}/admin/loans/${loanId}/documents/${docId}/view?token=${encodeURIComponent(token)}`;
  }

  getDocumentDownloadUrl(loanId, docId) {
    const token = localStorage.getItem(CONFIG.TOKEN_KEY) || '';
    return `${this.baseUrl}/admin/loans/${loanId}/documents/${docId}/download?token=${encodeURIComponent(token)}`;
  }
}

const api = new ApiClient();
