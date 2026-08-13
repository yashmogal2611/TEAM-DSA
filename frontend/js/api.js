/**
 * API Client Engine for Loan Application Portal
 * Intercepts Bearer tokens, 401 redirects, and mock fallback execution.
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
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          ...options,
          headers: {
            ...this.getHeaders(options.auth !== false),
            ...options.headers
          }
        });

        if (response.status === 401) {
          // Token expired or invalid -> mandatory redirect to login as per spec
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
        // If live backend fails due to network error (e.g. server not started), notify and fallback to mock if enabled
        if (err instanceof TypeError && err.message.includes('Fetch')) {
          console.warn('Backend offline on port 8000. Operating in Mock Mode fallback.');
          CONFIG.setMockMode(true);
          return this.mockRequest(endpoint, options);
        }
        throw err;
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
    await new Promise(r => setTimeout(r, 200)); // Simulate 200ms network latency
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body ? JSON.parse(options.body) : null;
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);

    // Current user lookup
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
        is_admin: user.is_admin
      };
    }

    // Auth verification check for protected endpoints
    if (!token && options.auth !== false) {
      this.handleUnauthorized();
      throw new Error('Token missing / expired / invalid (401)');
    }

    // 4. Auth: Me GET /auth/me
    if (endpoint === '/auth/me' && method === 'GET') {
      if (!currentUser) {
        this.handleUnauthorized();
        throw new Error('Token missing / expired / invalid (401)');
      }
      const { password, ...userProfile } = currentUser;
      return userProfile;
    }

    // 5. User: Apply Loan POST /loans/apply
    if (endpoint === '/loans/apply' && method === 'POST') {
      if (!currentUser) throw new Error('Not logged in (401)');

      const newLoan = {
        id: MOCK_DB.loans.length + 1,
        user_id: currentUser.id,
        applicant_name: currentUser.full_name,
        applicant_email: currentUser.email,
        product_type: body.product_type,
        requested_amount: Number(body.requested_amount),
        tenure_months: Number(body.tenure_months),
        annual_income: Number(body.annual_income),
        credit_score: Number(body.credit_score),
        employment_type: body.employment_type,
        purpose: body.purpose,
        status: 'pending',
        admin_note: null,
        applied_at: new Date().toISOString().split('.')[0],
        reviewed_at: null
      };

      MOCK_DB.loans.unshift(newLoan); // Newest first
      MOCK_DB.save();
      return newLoan;
    }

    // 6. User: My Loans GET /loans/my
    if (endpoint === '/loans/my' && method === 'GET') {
      if (!currentUser) throw new Error('Not logged in (401)');
      return MOCK_DB.loans.filter(l => l.user_id === currentUser.id);
    }

    // 7. Admin: List Loans GET /admin/loans
    if (endpoint.startsWith('/admin/loans') && method === 'GET') {
      if (!currentUser || !currentUser.is_admin) throw new Error('Not authorized as admin (403)');
      
      const url = new URL(`http://dummy${endpoint}`);
      const statusFilter = url.searchParams.get('status');

      if (statusFilter) {
        return MOCK_DB.loans.filter(l => l.status === statusFilter);
      }
      return MOCK_DB.loans;
    }

    // 8. Admin: Approve PATCH /admin/loans/{id}/approve
    if (endpoint.match(/\/admin\/loans\/\d+\/approve/) && method === 'PATCH') {
      if (!currentUser || !currentUser.is_admin) throw new Error('Not an admin (403)');
      const loanId = parseInt(endpoint.split('/')[3]);
      const loan = MOCK_DB.loans.find(l => l.id === loanId);
      if (!loan) throw new Error('Application not found (404)');

      loan.status = 'approved';
      loan.admin_note = body?.admin_note || 'Approved by admin.';
      loan.reviewed_at = new Date().toISOString().split('.')[0];
      MOCK_DB.save();
      return loan;
    }

    // 9. Admin: Reject PATCH /admin/loans/{id}/reject
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

    // 10. Admin: Stats GET /admin/stats
    if (endpoint === '/admin/stats' && method === 'GET') {
      if (!currentUser || !currentUser.is_admin) throw new Error('Not an admin (403)');
      const total_applications = MOCK_DB.loans.length;
      const pending = MOCK_DB.loans.filter(l => l.status === 'pending').length;
      const approved = MOCK_DB.loans.filter(l => l.status === 'approved').length;
      const rejected = MOCK_DB.loans.filter(l => l.status === 'rejected').length;
      const total_users = MOCK_DB.users.filter(u => !u.is_admin).length;

      return {
        total_applications,
        pending,
        approved,
        rejected,
        total_users
      };
    }

    // 11. Admin: Users GET /admin/users
    if (endpoint === '/admin/users' && method === 'GET') {
      if (!currentUser || !currentUser.is_admin) throw new Error('Not an admin (403)');
      return MOCK_DB.users
        .filter(u => !u.is_admin)
        .map(({ password, ...u }) => u);
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

  applyLoan(loanData) {
    return this.request('/loans/apply', { method: 'POST', body: JSON.stringify(loanData) });
  }

  getMyLoans() {
    return this.request('/loans/my');
  }

  getAdminLoans(status = '') {
    const query = status ? `?status=${status}` : '';
    return this.request(`/admin/loans${query}`);
  }

  approveLoan(id, admin_note = '') {
    return this.request(`/admin/loans/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved', admin_note })
    });
  }

  rejectLoan(id, admin_note = '') {
    return this.request(`/admin/loans/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected', admin_note })
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
