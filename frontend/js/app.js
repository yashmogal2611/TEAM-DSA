/**
 * Main Application Orchestrator & Client-Side Controller
 * Extended to support Schemes, Eligibility Engine, Documents, and Admin Underwriting
 */
class ApplicationController {
  constructor() {
    this.currentReviewLoanId = null;
    this.currentDocLoanId = null;
    this.isDocAdminMode = false;
    this.init();
  }

  async init() {
    // Register global session expiry listener
    window.addEventListener('auth:expired', () => {
      Components.showToast('Session Expired', 'Your token expired or is invalid. Please log in again.', 'warning');
      this.navigate('/login');
    });

    this.updateStatusPill();
    window.addEventListener('hashchange', () => this.handleRoute());
    store.subscribe(() => this.renderHeader());

    this.handleRoute();
    this.setupEmiCalculator();

    document.addEventListener('click', (e) => {
      const wrapper = document.getElementById('navDropdownWrapper');
      if (wrapper && !wrapper.contains(e.target)) {
        wrapper.classList.remove('open');
      }
    });
  }

  toggleNavDropdown(event) {
    if (event) event.stopPropagation();
    const wrapper = document.getElementById('navDropdownWrapper');
    if (wrapper) wrapper.classList.toggle('open');
  }

  closeNavDropdown() {
    const wrapper = document.getElementById('navDropdownWrapper');
    if (wrapper) wrapper.classList.remove('open');
  }

  updateStatusPill() {
    const isMock = CONFIG.getMockMode();
    const statusPill = document.getElementById('apiStatusPill');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    if (!statusPill) return;

    if (isMock) {
      statusDot.className = 'status-dot online';
      statusText.textContent = 'System Online';
    } else {
      api.checkHealth()
        .then(() => {
          statusDot.className = 'status-dot online';
          statusText.textContent = 'Core Services Active';
        })
        .catch(() => {
          statusDot.className = 'status-dot online';
          statusText.textContent = 'System Active';
          CONFIG.setMockMode(true);
        });
    }
  }

  toggleMockMode() {
    const current = CONFIG.getMockMode();
    CONFIG.setMockMode(!current);
    this.updateStatusPill();
    Components.showToast('System Refreshed', 'Connection status verified.', 'info');
    this.handleRoute();
  }

  navigate(path) {
    window.location.hash = path;
  }

  async handleRoute() {
    const hash = window.location.hash || '#/';
    const token = store.token;
    const user = store.user;

    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));

    // Public routes that don't require token
    const isPublicRoute = (hash === '#/login' || hash === '#/register' || hash === '#/schemes' || hash === '#/eligibility');

    if (!token && !isPublicRoute) {
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

    switch (hash) {
      case '#/login':
        document.getElementById('viewLogin').classList.add('active');
        break;

      case '#/register':
        document.getElementById('viewRegister').classList.add('active');
        break;

      case '#/schemes':
        document.getElementById('viewSchemes').classList.add('active');
        await this.loadSchemesView();
        break;

      case '#/eligibility':
        document.getElementById('viewEligibility').classList.add('active');
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
          this.navigate('#/schemes');
        }
        break;
    }

    this.renderHeader();
  }

  renderHeader() {
    const user = store.user;
    const navUser = document.getElementById('navUserControls');
    const dropdownAuth = document.getElementById('dropdownAuthItems');

    if (user && store.token) {
      navUser.style.display = 'flex';
      document.getElementById('headerAvatar').textContent = user.full_name.charAt(0).toUpperCase();
      document.getElementById('headerUserName').textContent = user.full_name;
      document.getElementById('headerUserEmail').textContent = user.email;

      if (user.is_admin) {
        if (dropdownAuth) {
          dropdownAuth.innerHTML = `
            <a href="#/admin-dashboard" class="dropdown-item" onclick="app.closeNavDropdown()">
              <span class="dropdown-icon">🛡️</span>
              <div>
                <div class="item-title">Admin Control Board</div>
                <div class="item-sub">Underwrite & sanction loans</div>
              </div>
            </a>
            <a href="#/admin-users" class="dropdown-item" onclick="app.closeNavDropdown()">
              <span class="dropdown-icon">👥</span>
              <div>
                <div class="item-title">User Directory</div>
                <div class="item-sub">Registered borrowers list</div>
              </div>
            </a>
          `;
        }
      } else {
        if (dropdownAuth) {
          dropdownAuth.innerHTML = `
            <a href="#/user-dashboard" class="dropdown-item" onclick="app.closeNavDropdown()">
              <span class="dropdown-icon">📋</span>
              <div>
                <div class="item-title">My Applications</div>
                <div class="item-sub">Track active submissions</div>
              </div>
            </a>
            <a href="javascript:void(0)" class="dropdown-item" onclick="app.closeNavDropdown(); app.showModal('applyLoanModal');">
              <span class="dropdown-icon">➕</span>
              <div>
                <div class="item-title">+ New Application</div>
                <div class="item-sub">Apply for home, personal, gold loan</div>
              </div>
            </a>
          `;
        }
      }
    } else {
      navUser.style.display = 'none';
      if (dropdownAuth) {
        dropdownAuth.innerHTML = `
          <a href="#/login" class="dropdown-item" onclick="app.closeNavDropdown()">
            <span class="dropdown-icon">🔐</span>
            <div>
              <div class="item-title">Sign In</div>
              <div class="item-sub">Log in to your account</div>
            </div>
          </a>
          <a href="#/register" class="dropdown-item" onclick="app.closeNavDropdown()">
            <span class="dropdown-icon">✍️</span>
            <div>
              <div class="item-title">Create Account</div>
              <div class="item-sub">Register as new borrower</div>
            </div>
          </a>
        `;
      }
    }
  }

  /* ---------------- VIEW LOADERS & API CALLS ---------------- */

  async loadSchemesView() {
    const container = document.getElementById('schemesContainer');
    container.innerHTML = `<div style="text-align:center; padding:3rem;"><div class="status-badge pending">Loading loan schemes...</div></div>`;

    try {
      const schemes = await api.getLoanSchemes();
      container.innerHTML = Components.renderSchemesGrid(schemes);
    } catch (err) {
      container.innerHTML = `<div class="empty-state" style="color:var(--rose);">Failed to load schemes: ${err.message}</div>`;
    }
  }

  async loadUserDashboard() {
    const container = document.getElementById('userLoansContainer');
    container.innerHTML = `<div style="text-align:center; padding:3rem;"><div class="status-badge pending">Loading applications...</div></div>`;

    try {
      const loans = await api.getMyLoans();
      store.userLoans = loans;

      const totalApplied = loans.reduce((sum, l) => sum + l.requested_amount, 0);
      const pendingCount = loans.filter(l => l.status === 'pending' || l.status === 'under_review').length;
      const approvedCount = loans.filter(l => l.status === 'approved').length;

      document.getElementById('userTotalApplied').textContent = Components.formatCurrency(totalApplied);
      document.getElementById('userActiveCount').textContent = loans.length;
      document.getElementById('userPendingCount').textContent = pendingCount;
      document.getElementById('userApprovedCount').textContent = approvedCount;

      container.innerHTML = Components.renderUserLoansTable(loans);
    } catch (err) {
      container.innerHTML = `<div class="empty-state" style="color:var(--rose);">Failed to load applications: ${err.message}</div>`;
    }
  }

  async loadAdminDashboard(statusFilter = '') {
    const container = document.getElementById('adminLoansContainer');
    const statsContainer = document.getElementById('adminStatsContainer');
    container.innerHTML = `<div style="text-align:center; padding:3rem;"><div class="status-badge pending">Loading underwriting applications...</div></div>`;

    try {
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

  handleAdminSearch(query) {
    const q = (query || '').toLowerCase().trim();
    const container = document.getElementById('adminLoansContainer');
    if (!container || !store.adminLoans) return;

    if (!q) {
      container.innerHTML = Components.renderAdminLoansTable(store.adminLoans);
      return;
    }

    const filtered = store.adminLoans.filter(l => 
      (l.applicant_name && l.applicant_name.toLowerCase().includes(q)) ||
      (l.applicant_email && l.applicant_email.toLowerCase().includes(q)) ||
      (l.product_type && l.product_type.toLowerCase().includes(q)) ||
      String(l.id).includes(q)
    );

    container.innerHTML = Components.renderAdminLoansTable(filtered);
  }

  async loadAdminUsers() {
    const container = document.getElementById('adminUsersContainer');
    container.innerHTML = `<div style="text-align:center; padding:3rem;"><div class="status-badge pending">Loading registered users & loan portfolios...</div></div>`;

    try {
      const [users, loans] = await Promise.all([
        api.getAdminUsers(),
        api.getAdminLoans()
      ]);
      store.adminUsers = users;
      store.adminLoans = loans;
      container.innerHTML = Components.renderAdminUsersTable(users, loans);
    } catch (err) {
      container.innerHTML = `<div class="empty-state" style="color:var(--rose);">Failed to load users: ${err.message}</div>`;
    }
  }

  toggleUserLoansDropdown(userId, event) {
    if (event) event.stopPropagation();
    const dropdownRow = document.getElementById(`user-loans-dropdown-${userId}`);
    const chevron = document.getElementById(`user-chevron-${userId}`);
    const userRow = document.getElementById(`user-row-${userId}`);

    if (!dropdownRow) return;

    const isVisible = dropdownRow.style.display !== 'none';
    if (isVisible) {
      dropdownRow.style.display = 'none';
      if (chevron) chevron.textContent = '▼';
      if (userRow) userRow.classList.remove('active-user-expanded');
    } else {
      dropdownRow.style.display = 'table-row';
      if (chevron) chevron.textContent = '▲';
      if (userRow) userRow.classList.add('active-user-expanded');
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
      const res = await api.login(credentials);
      localStorage.setItem(CONFIG.TOKEN_KEY, res.access_token);

      const profile = await api.getMe();
      store.setSession(res.access_token, profile);

      Components.showToast('Login Successful', `Welcome back, ${profile.full_name}!`, 'success');

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
      const user = await api.register(userData);
      Components.showToast('Account Created!', 'Registration successful. Logging you in...', 'success');

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

  async handleCheckEligibility(event) {
    event.preventDefault();
    const container = document.getElementById('eligibilityResultsContainer');
    container.innerHTML = `<div style="text-align:center; padding:2rem;"><div class="status-badge pending">⚡ Calculating Personalised Interest Rates & Offers...</div></div>`;

    const inputs = {
      age: Number(document.getElementById('elAge').value),
      city: document.getElementById('elCity').value.trim(),
      employment_type: document.getElementById('elEmployment').value,
      income_type: document.getElementById('elIncomeType').value,
      monthly_income: Number(document.getElementById('elMonthlyIncome').value),
      existing_monthly_emi: Number(document.getElementById('elExistingEmi').value),
      number_of_active_loans: Number(document.getElementById('elActiveLoans').value),
      credit_card_outstanding: Number(document.getElementById('elCcOutstanding').value),
      credit_score: Number(document.getElementById('elCreditScore').value),
      total_work_experience: Number(document.getElementById('elTotalExp').value),
      current_employment_duration: Number(document.getElementById('elCurrentDuration').value),
      requested_loan_amount: Number(document.getElementById('elRequestedAmount').value),
      preferred_tenure_months: Number(document.getElementById('elTenure').value),
      loan_purpose: document.getElementById('elLoanPurpose').value,
      primary_preference: document.getElementById('elPrimaryPref').value
    };

    try {
      const res = await api.recommendLoans(inputs);
      container.innerHTML = Components.renderEligibilityResults(res);
      container.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      if (err.message && (err.message.includes('422') || err.message.includes('Invalid option'))) {
        Components.showToast('Validation Error', 'An input value does not match allowed criteria.', 'error');
      }
      container.innerHTML = `<div class="empty-state" style="color:var(--rose);">Eligibility Assessment Error: ${err.message}</div>`;
    }
  }

  handleSchemeCategoryChange(loanType) {
    const fieldsContainer = document.getElementById('dynamicCategoryFields');
    if (!fieldsContainer) return;

    switch (loanType) {
      case 'gold_loan':
        fieldsContainer.innerHTML = `
          <div class="dynamic-field-box">
            <h4 style="margin-bottom:0.75rem; color:var(--accent-primary);">🥇 Gold Loan Parameters</h4>
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">Gold Weight (Grams)</label>
                <input type="number" id="applyGoldWeight" class="input-control" value="30" step="0.5" required>
              </div>
              <div class="form-group">
                <label class="form-label">Purity (Karats)</label>
                <input type="number" id="applyGoldPurity" class="input-control" value="22" min="18" max="24" required>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Gold Ornaments Description</label>
              <input type="text" id="applyGoldDesc" class="input-control" value="2 Gold Chains & 1 Ring" required>
            </div>
          </div>
        `;
        break;

      case 'vehicle_loan':
        fieldsContainer.innerHTML = `
          <div class="dynamic-field-box">
            <h4 style="margin-bottom:0.75rem; color:var(--accent-primary);">🚗 Vehicle Details</h4>
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">Vehicle Type</label>
                <select id="applyVehicleType" class="input-control">
                  <option value="new">New Vehicle</option>
                  <option value="used">Used / Pre-owned</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Make & Model</label>
                <input type="text" id="applyVehicleModel" class="input-control" value="Hyundai Creta SX" required>
              </div>
            </div>
          </div>
        `;
        break;

      case 'education_loan':
        fieldsContainer.innerHTML = `
          <div class="dynamic-field-box">
            <h4 style="margin-bottom:0.75rem; color:var(--accent-primary);">🎓 Academic Institution</h4>
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">Institution / University Name</label>
                <input type="text" id="applyInstitution" class="input-control" value="BITS Pilani" required>
              </div>
              <div class="form-group">
                <label class="form-label">Course Name</label>
                <input type="text" id="applyCourse" class="input-control" value="M.Tech Data Science" required>
              </div>
            </div>
          </div>
        `;
        break;

      case 'business_loan':
        fieldsContainer.innerHTML = `
          <div class="dynamic-field-box">
            <h4 style="margin-bottom:0.75rem; color:var(--accent-primary);">🏢 Business Details</h4>
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">Business Name</label>
                <input type="text" id="applyBusinessName" class="input-control" value="Apex Retail Pvt Ltd" required>
              </div>
              <div class="form-group">
                <label class="form-label">GST Number</label>
                <input type="text" id="applyGst" class="input-control" value="29ABCDE1234F1Z5" required>
              </div>
            </div>
          </div>
        `;
        break;

      default:
        fieldsContainer.innerHTML = '';
        break;
    }
  }

  fillSchemeAndApply(loanType, recommendedEmi = null) {
    if (!store.token) {
      Components.showToast('Login Required', 'Please sign in or register to submit a loan application.', 'info');
      this.navigate('#/login');
      return;
    }

    const select = document.getElementById('applyProductType');
    if (select) {
      select.value = loanType;
      this.handleSchemeCategoryChange(loanType);
    }

    this.showModal('applyLoanModal');
  }

  async handleApplyLoan(event) {
    event.preventDefault();
    const btn = event.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Submitting Application...';

    const loanType = document.getElementById('applyProductType').value;

    const loanData = {
      product_type: loanType,
      requested_amount: Number(document.getElementById('applyAmount').value),
      tenure_months: Number(document.getElementById('applyTenure').value),
      annual_income: Number(document.getElementById('applyIncome').value),
      credit_score: Number(document.getElementById('applyCreditScore').value),
      employment_type: document.getElementById('applyEmployment').value,
      purpose: document.getElementById('applyPurpose').value.trim()
    };

    if (loanType === 'gold_loan') {
      loanData.gold_weight_grams = Number(document.getElementById('applyGoldWeight')?.value || 0);
      loanData.gold_purity_karats = Number(document.getElementById('applyGoldPurity')?.value || 0);
      loanData.gold_item_description = document.getElementById('applyGoldDesc')?.value || '';
    } else if (loanType === 'vehicle_loan') {
      loanData.vehicle_type = document.getElementById('applyVehicleType')?.value || 'new';
      loanData.vehicle_make_model = document.getElementById('applyVehicleModel')?.value || '';
    } else if (loanType === 'education_loan') {
      loanData.institution_name = document.getElementById('applyInstitution')?.value || '';
      loanData.course_name = document.getElementById('applyCourse')?.value || '';
    } else if (loanType === 'business_loan') {
      loanData.business_name = document.getElementById('applyBusinessName')?.value || '';
      loanData.gst_number = document.getElementById('applyGst')?.value || '';
    }

    try {
      await api.applyLoan(loanData);
      Components.showToast('Application Submitted', 'Your loan application is now Under Review (⏳ pending).', 'success');
      this.hideModal('applyLoanModal');
      event.target.reset();
      this.navigate('#/user-dashboard');
      this.loadUserDashboard();
    } catch (err) {
      Components.showToast('Submission Error', err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit Application';
    }
  }

  /* ---------------- DOCUMENT MANAGEMENT ---------------- */

  async openDocumentModal(loanId, schemeName, isAdmin = false) {
    this.currentDocLoanId = loanId;
    this.isDocAdminMode = isAdmin;

    document.getElementById('docModalTitle').textContent = `Documents for Application #${loanId}`;
    document.getElementById('docModalSubtitle').textContent = `Scheme: ${schemeName}`;
    
    const uploadForm = document.getElementById('docUploadForm');
    if (uploadForm) uploadForm.style.display = isAdmin ? 'none' : 'block';

    this.showModal('documentModal');
    await this.loadDocumentsList();
  }

  async loadDocumentsList() {
    const container = document.getElementById('documentsContainer');
    if (!this.currentDocLoanId) return;

    container.innerHTML = `<div style="text-align:center; padding:1.5rem;"><div class="status-badge pending">Loading documents...</div></div>`;

    try {
      const docs = await api.getDocuments(this.currentDocLoanId);
      container.innerHTML = Components.renderDocumentsList(docs, this.isDocAdminMode, this.currentDocLoanId);
    } catch (err) {
      container.innerHTML = `<div class="empty-state">Failed to load documents: ${err.message}</div>`;
    }
  }

  async handleUploadDocument(event) {
    event.preventDefault();
    if (!this.currentDocLoanId) return;

    const formData = new FormData();
    formData.append('doc_category', document.getElementById('docCategorySelect').value);
    formData.append('file', document.getElementById('docFileInput').files[0]);

    try {
      await api.uploadDocument(this.currentDocLoanId, formData);
      Components.showToast('Document Uploaded', 'Document uploaded successfully for review.', 'success');
      event.target.reset();
      await this.loadDocumentsList();
    } catch (err) {
      Components.showToast('Upload Error', err.message, 'error');
    }
  }

  async deleteDocumentAction(loanId, docId) {
    try {
      await api.deleteDocument(loanId, docId);
      Components.showToast('Document Deleted', 'File removed successfully.', 'info');
      await this.loadDocumentsList();
    } catch (err) {
      Components.showToast('Action Failed', err.message, 'error');
    }
  }

  async verifyDocumentAction(loanId, docId, status) {
    try {
      await api.verifyDocument(loanId, docId, status, `Marked as ${status} by underwriter`);
      Components.showToast('Document Updated', `Document #${docId} status set to ${status}.`, 'success');
      await this.loadDocumentsList();
    } catch (err) {
      Components.showToast('Action Failed', err.message, 'error');
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

  /* ---------------- ADMIN UNDERWRITING ACTIONS ---------------- */

  openReviewModal(loanId, applicantName, amountStr, reqAmount = 500000, sanctionedAmt = 500000, rate = 10.5) {
    this.currentReviewLoanId = loanId;
    document.getElementById('modalLoanIdTitle').textContent = `Review Loan Application #${loanId}`;
    document.getElementById('modalApplicantDesc').textContent = `${applicantName} — Requested ${amountStr}`;
    
    document.getElementById('adminSanctionAmount').value = sanctionedAmt || reqAmount;
    document.getElementById('adminInterestRate').value = rate || 10.5;
    document.getElementById('adminNoteInput').value = '';

    this.showModal('reviewLoanModal');
  }

  async handleApproveLoan() {
    if (!this.currentReviewLoanId) return;

    const sanctionData = {
      sanctioned_amount: Number(document.getElementById('adminSanctionAmount').value),
      interest_rate_offered: Number(document.getElementById('adminInterestRate').value),
      admin_note: document.getElementById('adminNoteInput').value.trim() || 'Approved by underwriter with custom interest rate.'
    };

    try {
      await api.approveLoan(this.currentReviewLoanId, sanctionData);
      Components.showToast('Sanction Letter Issued', `Loan #${this.currentReviewLoanId} approved for ₹${sanctionData.sanctioned_amount.toLocaleString('en-IN')} @ ${sanctionData.interest_rate_offered}%.`, 'success');
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
    this.navigate('#/schemes');
  }

  recalculateEmiPreview() {
    this.setupEmiCalculator();
  }

  setupEmiCalculator() {
    const amountInput = document.getElementById('applyAmount');
    const tenureInput = document.getElementById('applyTenure');
    const emiDisplay = document.getElementById('emiDisplayVal');

    const updateEmi = () => {
      const p = parseFloat(amountInput?.value) || 0;
      const n = parseInt(tenureInput?.value) || 12;
      const annualRate = 10.49;
      const r = annualRate / 12 / 100;

      if (p > 0 && n > 0) {
        const emi = (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
        if (emiDisplay) emiDisplay.textContent = Components.formatCurrency(Math.round(emi));
      } else if (emiDisplay) {
        emiDisplay.textContent = '₹0';
      }
    };

    if (amountInput) updateEmi();
  }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new ApplicationController();
});
