/**
 * API Client Engine for ApexLoans Portal
 * Full support for Schemes, Eligibility Calculation, Documents, and Admin Underwriting
 */
class ApiClient {
  constructor() {
    this.baseUrl = CONFIG.API_BASE_URL;
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

    // 1. Health Check GET /health
    if (endpoint === '/health') {
      return { status: 'ok', version: '2.0.0' };
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

    // 6. Eligibility Calculator Engine POST /loans/check-eligibility
    if (endpoint === '/loans/check-eligibility' && method === 'POST') {
      const monthlyIncome = (body.annual_income || 0) / 12;
      const existingEmi = body.existing_emi || 0;
      const requestedAmt = body.requested_amount || 100000;
      const preferredTenure = body.preferred_tenure_months || 36;
      const age = body.age || 25;
      const score = body.credit_score || 700;

      const ranked_eligible_loans = [];
      const ineligible_loans = [];

      MOCK_DB.schemes.forEach(scheme => {
        const missing_criteria = [];
        let is_eligible = true;

        if (age < scheme.min_age || age > scheme.max_age) {
          is_eligible = false;
          missing_criteria.push(`Age must be between ${scheme.min_age} and ${scheme.max_age}`);
        }

        if (score < scheme.min_credit_score) {
          is_eligible = false;
          missing_criteria.push(`Credit score must be at least ${scheme.min_credit_score}`);
        }

        if (body.annual_income < scheme.min_income_annual) {
          is_eligible = false;
          missing_criteria.push(`Minimum annual income required is ₹${scheme.min_income_annual.toLocaleString('en-IN')}`);
        }

        // Est interest rate & EMI
        const rate = scheme.interest_rate_min + (score >= 750 ? 0 : score >= 700 ? 0.8 : 1.8);
        const monthlyRate = rate / 12 / 100;
        const n = Math.min(preferredTenure, scheme.max_tenure_months);
        const emi = (requestedAmt * monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);

        const totalObligation = existingEmi + emi;
        const foir = monthlyIncome > 0 ? (totalObligation / monthlyIncome) * 100 : 99;

        if (foir > scheme.max_foir) {
          is_eligible = false;
          missing_criteria.push(`FOIR (${foir.toFixed(1)}%) exceeds maximum limit of ${scheme.max_foir}%`);
        }

        const match_score = Math.max(40, Math.min(98, 100 - (missing_criteria.length * 20) + (score >= 750 ? 10 : 0)));

        const item = {
          loan_type: scheme.loan_type,
          display_name: scheme.display_name,
          is_eligible,
          eligibility_status: is_eligible ? 'eligible' : 'ineligible',
          match_score: Number(match_score.toFixed(1)),
          estimated_interest_rate: Number(rate.toFixed(2)),
          estimated_monthly_emi: Math.round(emi),
          max_eligible_amount: Math.min(scheme.max_amount, Math.round(monthlyIncome * (scheme.max_foir / 100) * 40)),
          recommended_tenure_months: n,
          foir_percentage: Number(foir.toFixed(1)),
          reasons: is_eligible ? ["Credit score qualifies", "FOIR is healthy within policy limits"] : [],
          missing_criteria,
          required_documents_checklist: scheme.document_checklist,
          source_url: scheme.source_url,
          last_verified: scheme.last_verified
        };

        if (is_eligible) {
          ranked_eligible_loans.push(item);
        } else {
          ineligible_loans.push(item);
        }
      });

      ranked_eligible_loans.sort((a, b) => b.match_score - a.match_score);

      return {
        consumer_summary: {
          monthly_income: Math.round(monthlyIncome),
          existing_emi: existingEmi,
          credit_score: score
        },
        ranked_eligible_loans,
        ineligible_loans,
        personalized_advice: [
          "Maintaining a credit score above 750 unlocks lower interest rates.",
          "Clearing existing credit card dues reduces FOIR and increases sanction eligibility."
        ]
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
      const userLoans = MOCK_DB.loans.filter(l => l.user_id === currentUser.id);
      return userLoans.map(l => ({
        ...l,
        documents: MOCK_DB.documents.filter(d => d.loan_id === l.id)
      }));
    }

    // 10. Single Loan Details GET /loans/{id}
    if (endpoint.match(/\/loans\/\d+$/) && method === 'GET') {
      const loanId = parseInt(endpoint.split('/')[2]);
      const loan = MOCK_DB.loans.find(l => l.id === loanId);
      if (!loan) throw new Error('Loan not found (404)');
      return {
        ...loan,
        documents: MOCK_DB.documents.filter(d => d.loan_id === loanId)
      };
    }

    // 11. Documents: Upload POST /loans/{id}/documents
    if (endpoint.match(/\/loans\/\d+\/documents$/) && method === 'POST') {
      const loanId = parseInt(endpoint.split('/')[2]);
      const fd = options.body instanceof FormData ? options.body : (options.formData || new FormData());
      const fileObj = fd.get('file');
      const fileName = fileObj?.name || 'uploaded_document.pdf';
      const fileSize = fileObj?.size ? `${(fileObj.size / (1024 * 1024)).toFixed(1)} MB` : '1.8 MB';

      const doc = {
        doc_id: (MOCK_DB.documents.length + 1) * 101,
        loan_id: loanId,
        doc_category: fd.get('doc_category') || 'kyc',
        doc_type: fd.get('doc_type') || 'document',
        file_name: fileName,
        file_size: fileSize,
        status: 'pending',
        verification_note: fd.get('verification_note') || 'Awaiting underwriting review',
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
      const filtered = statusFilter ? MOCK_DB.loans.filter(l => l.status === statusFilter) : MOCK_DB.loans;
      return filtered.map(l => ({
        ...l,
        documents: MOCK_DB.documents.filter(d => d.loan_id === l.id)
      }));
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

  checkEligibility(inputs) {
    return this.request('/loans/check-eligibility', { method: 'POST', body: JSON.stringify(inputs), auth: false });
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
}

const api = new ApiClient();
