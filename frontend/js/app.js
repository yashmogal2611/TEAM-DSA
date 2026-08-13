/**
 * Main Application Orchestrator & Client-Side Controller
 */
class ApplicationController {
  constructor() {
    this.currentReviewLoanId = null;
    this.init();
  }

  async init() {
    // Register global session expiry listener
    window.addEventListener('auth:expired', () => {
      Components.showToast('Session Expired', 'Your token expired or is invalid. Please log in again.', 'warning');
      this.navigate('/login');
    });

    // Check health endpoint & update status indicator
    this.updateStatusPill();

    // Listen to hash route changes
    window.addEventListener('hashchange', () => this.handleRoute());

    // Listen to state changes
    store.subscribe(() => this.renderHeader());

    // Initial page load route
    this.handleRoute();

    // Setup input listeners for EMI Calculator
    this.setupEmiCalculator();
  }

  updateStatusPill() {
    const isMock = CONFIG.getMockMode();
    const statusPill = document.getElementById('apiStatusPill');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    if (!statusPill) return;

    if (isMock) {
      statusDot.className = 'status-dot mock';
      statusText.textContent = 'Mock Mode (Offline Test)';
    } else {
      api.checkHealth()
        .then(res => {
          statusDot.className = 'status-dot online';
          statusText.textContent = `Live Backend v${res.version || '2.0.0'}`;
        })
        .catch(() => {
          statusDot.className = 'status-dot mock';
          statusText.textContent = 'Mock Mode (Auto-Fallback)';
          CONFIG.setMockMode(true);
        });
    }
  }

  toggleMockMode() {
    const current = CONFIG.getMockMode();
    CONFIG.setMockMode(!current);
    this.updateStatusPill();
    Components.showToast('API Mode Switched', `Now operating in ${!current ? 'Mock Mode' : 'Live API Mode (http://127.0.0.1:8000)'}`, 'info');
    this.handleRoute(); // Refresh current view
  }

  navigate(path) {
    window.location.hash = path;
  }

  async handleRoute() {
    const hash = window.location.hash || '#/';
    const token = store.token;
    const user = store.user;

    // Hide all view sections
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));

    // Route Guards
    if (!token && hash !== '#/register' && hash !== '#/login') {
      this.navigate('#/login');
      return;
    }

    if (token && (hash === '#/login' || hash === '#/register' || hash === '#/')) {
      if (user?.is_admin) {
        this.navigate('#/admin-dashboard');
      } else {
        this.navigate('#/user-dashboard');
      }
      return;
    }

    // Render active view
    switch (hash) {
      case '#/login':
        document.getElementById('viewLogin').classList.add('active');
        break;

      case '#/register':
        document.getElementById('viewRegister').classList.add('active');
        break;

      case '#/user-dashboard':
        if (user?.is_admin) { this.navigate('#/admin-dashboard'); return; }
        document.getElementById('viewUserDashboard').classList.add('active');
        await this.loadUserDashboard();
        break;

      case '#/admin-dashboard':
        if (!user?.is_admin) { this.navigate('#/user-dashboard'); return; }
        document.getElementById('viewAdminDashboard').classList.add('active');
        await this.loadAdminDashboard();
        break;

      case '#/admin-users':
        if (!user?.is_admin) { this.navigate('#/user-dashboard'); return; }
        document.getElementById('viewAdminUsers').classList.add('active');
        await this.loadAdminUsers();
        break;

      default:
        if (token) {
          user?.is_admin ? this.navigate('#/admin-dashboard') : this.navigate('#/user-dashboard');
        } else {
          this.navigate('#/login');
        }
        break;
    }

    this.renderHeader();
  }

  renderHeader() {
    const user = store.user;
    const navUser = document.getElementById('navUserControls');
    const roleBadge = document.getElementById('roleBadge');

    if (user && store.token) {
      navUser.style.display = 'flex';
      document.getElementById('headerAvatar').textContent = user.full_name.charAt(0).toUpperCase();
      document.getElementById('headerUserName').textContent = user.full_name;
      document.getElementById('headerUserEmail').textContent = user.email;

      if (user.is_admin) {
        roleBadge.className = 'brand-badge admin-badge';
        roleBadge.textContent = 'ADMIN PORTAL';
        document.getElementById('adminUsersNavLink').style.display = 'inline-flex';
        document.getElementById('adminDashNavLink').style.display = 'inline-flex';
        document.getElementById('userDashNavLink').style.display = 'none';
        document.getElementById('applyLoanNavBtn').style.display = 'none';
      } else {
        roleBadge.className = 'brand-badge user-badge';
        roleBadge.textContent = 'USER PORTAL';
        document.getElementById('adminUsersNavLink').style.display = 'none';
        document.getElementById('adminDashNavLink').style.display = 'none';
        document.getElementById('userDashNavLink').style.display = 'inline-flex';
        document.getElementById('applyLoanNavBtn').style.display = 'inline-flex';
      }
    } else {
      navUser.style.display = 'none';
      roleBadge.className = 'brand-badge user-badge';
      roleBadge.textContent = 'PORTAL';
    }
  }

  /* ---------------- API CALLS & LOADERS ---------------- */

  async loadUserDashboard() {
    const container = document.getElementById('userLoansContainer');
    container.innerHTML = `<div style="text-align:center; padding:3rem;"><div class="status-badge pending">Loading applications...</div></div>`;

    try {
      // Execute GET /loans/my
      const loans = await api.getMyLoans();
      store.userLoans = loans;

      // Update Summary Cards
      const totalApplied = loans.reduce((sum, l) => sum + l.requested_amount, 0);
      const pendingCount = loans.filter(l => l.status === 'pending').length;
      const approvedCount = loans.filter(l => l.status === 'approved').length;

      document.getElementById('userTotalApplied').textContent = Components.formatCurrency(totalApplied);
      document.getElementById('userActiveCount').textContent = loans.length;
      document.getElementById('userPendingCount').textContent = pendingCount;
      document.getElementById('userApprovedCount').textContent = approvedCount;

      container.innerHTML = Components.renderUserLoansTable(loans);
    } catch (err) {
      container.innerHTML = `<div class="empty-state" style="color:var(--rose);">Failed to load loans: ${err.message}</div>`;
    }
  }

  async loadAdminDashboard(statusFilter = '') {
    const container = document.getElementById('adminLoansContainer');
    const statsContainer = document.getElementById('adminStatsContainer');
    container.innerHTML = `<div style="text-align:center; padding:3rem;"><div class="status-badge pending">Loading loan applications...</div></div>`;

    try {
      // Execute GET /admin/stats and GET /admin/loans
      const [stats, loans] = await Promise.all([
        api.getAdminStats(),
        api.getAdminLoans(statusFilter)
      ]);

      store.adminStats = stats;
      store.adminLoans = loans;

      statsContainer.innerHTML = Components.renderAdminStats(stats);
      container.innerHTML = Components.renderAdminLoansTable(loans);
    } catch (err) {
      container.innerHTML = `<div class="empty-state" style="color:var(--rose);">Failed to load admin data: ${err.message}</div>`;
    }
  }

  async loadAdminUsers() {
    const container = document.getElementById('adminUsersContainer');
    container.innerHTML = `<div style="text-align:center; padding:3rem;"><div class="status-badge pending">Loading registered users...</div></div>`;

    try {
      // Execute GET /admin/users
      const users = await api.getAdminUsers();
      store.adminUsers = users;
      container.innerHTML = Components.renderAdminUsersTable(users);
    } catch (err) {
      container.innerHTML = `<div class="empty-state" style="color:var(--rose);">Failed to load users: ${err.message}</div>`;
    }
  }

  /* ---------------- FORM SUBMISSION HANDLERS ---------------- */

  async handleLogin(event) {
    event.preventDefault();
    const btn = event.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Authenticating...';

    const credentials = {
      email: document.getElementById('loginEmail').value.trim(),
      password: document.getElementById('loginPassword').value
    };

    try {
      // POST /auth/login
      const res = await api.login(credentials);
      
      // Store token
      localStorage.setItem(CONFIG.TOKEN_KEY, res.access_token);

      // Fetch user profile GET /auth/me
      const profile = await api.getMe();
      store.setSession(res.access_token, profile);

      Components.showToast('Login Successful', `Welcome back, ${profile.full_name}!`, 'success');

      // Spec Requirement: Redirect user based on is_admin flag
      if (res.is_admin) {
        this.navigate('#/admin-dashboard');
      } else {
        this.navigate('#/user-dashboard');
      }
    } catch (err) {
      Components.showToast('Login Failed', err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  async handleRegister(event) {
    event.preventDefault();
    const btn = event.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Registering...';

    const userData = {
      full_name: document.getElementById('regFullName').value.trim(),
      email: document.getElementById('regEmail').value.trim(),
      phone: document.getElementById('regPhone').value.trim(),
      password: document.getElementById('regPassword').value
    };

    try {
      // POST /auth/register
      const user = await api.register(userData);
      Components.showToast('Account Created!', 'Registration successful. Logging you in...', 'success');

      // Auto-login after registration
      const loginRes = await api.login({ email: userData.email, password: userData.password });
      localStorage.setItem(CONFIG.TOKEN_KEY, loginRes.access_token);
      store.setSession(loginRes.access_token, user);
      
      this.navigate('#/user-dashboard');
    } catch (err) {
      Components.showToast('Registration Error', err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  }

  async handleApplyLoan(event) {
    event.preventDefault();
    const btn = event.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Submitting Application...';

    const loanData = {
      product_type: document.getElementById('applyProductType').value,
      requested_amount: Number(document.getElementById('applyAmount').value),
      tenure_months: Number(document.getElementById('applyTenure').value),
      annual_income: Number(document.getElementById('applyIncome').value),
      credit_score: Number(document.getElementById('applyCreditScore').value),
      employment_type: document.getElementById('applyEmployment').value,
      purpose: document.getElementById('applyPurpose').value.trim()
    };

    try {
      // POST /loans/apply
      await api.applyLoan(loanData);
      Components.showToast('Application Submitted', 'Your loan application is now Under Review (⏳ pending).', 'success');
      this.hideModal('applyLoanModal');
      event.target.reset();
      this.loadUserDashboard();
    } catch (err) {
      Components.showToast('Submission Error', err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit Application';
    }
  }

  fillDemoUser() {
    document.getElementById('loginEmail').value = 'ravi@example.com';
    document.getElementById('loginPassword').value = 'MyPass@123';
  }

  fillDemoAdmin() {
    document.getElementById('loginEmail').value = 'admin@loanapp.com';
    document.getElementById('loginPassword').value = 'Admin@123';
  }

  /* ---------------- ADMIN ACTIONS ---------------- */

  openReviewModal(loanId, applicantName, amount, viewOnly = false) {
    this.currentReviewLoanId = loanId;
    document.getElementById('modalLoanIdTitle').textContent = `Loan Application #${loanId}`;
    document.getElementById('modalApplicantDesc').textContent = `${applicantName} — ${amount}`;
    document.getElementById('adminNoteInput').value = '';

    const actionFooter = document.getElementById('reviewModalFooter');
    if (viewOnly) {
      actionFooter.style.display = 'none';
      document.getElementById('adminNoteInput').disabled = true;
    } else {
      actionFooter.style.display = 'flex';
      document.getElementById('adminNoteInput').disabled = false;
    }

    this.showModal('reviewLoanModal');
  }

  async handleApproveLoan() {
    if (!this.currentReviewLoanId) return;
    const note = document.getElementById('adminNoteInput').value.trim() || 'Good credit history. Approved!';

    try {
      // PATCH /admin/loans/{id}/approve
      await api.approveLoan(this.currentReviewLoanId, note);
      Components.showToast('Application Approved', `Loan #${this.currentReviewLoanId} status updated to ✅ Approved.`, 'success');
      this.hideModal('reviewLoanModal');
      this.loadAdminDashboard();
    } catch (err) {
      Components.showToast('Action Failed', err.message, 'error');
    }
  }

  async handleRejectLoan() {
    if (!this.currentReviewLoanId) return;
    const note = document.getElementById('adminNoteInput').value.trim() || 'Insufficient documentation or income criteria.';

    try {
      // PATCH /admin/loans/{id}/reject
      await api.rejectLoan(this.currentReviewLoanId, note);
      Components.showToast('Application Rejected', `Loan #${this.currentReviewLoanId} status updated to ❌ Rejected.`, 'warning');
      this.hideModal('reviewLoanModal');
      this.loadAdminDashboard();
    } catch (err) {
      Components.showToast('Action Failed', err.message, 'error');
    }
  }

  filterAdminLoans(status, btnElement) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    this.loadAdminDashboard(status);
  }

  /* ---------------- MODALS & HELPERS ---------------- */

  showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
  }

  hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  }

  logout() {
    store.clearSession();
    Components.showToast('Logged Out', 'You have been logged out safely.', 'info');
    this.navigate('#/login');
  }

  setupEmiCalculator() {
    const amountInput = document.getElementById('applyAmount');
    const tenureInput = document.getElementById('applyTenure');
    const emiDisplay = document.getElementById('emiDisplayVal');

    const updateEmi = () => {
      const p = parseFloat(amountInput?.value) || 0;
      const n = parseInt(tenureInput?.value) || 12;
      const annualRate = 10.5; // Average baseline interest rate 10.5%
      const r = annualRate / 12 / 100;

      if (p > 0 && n > 0) {
        const emi = (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
        if (emiDisplay) emiDisplay.textContent = Components.formatCurrency(Math.round(emi));
      } else if (emiDisplay) {
        emiDisplay.textContent = '₹0';
      }
    };

    if (amountInput) amountInput.addEventListener('input', updateEmi);
    if (tenureInput) tenureInput.addEventListener('change', updateEmi);
  }
}

// Global Application Instance
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new ApplicationController();
});
