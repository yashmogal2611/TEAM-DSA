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

    this.initTheme();
    window.addEventListener('hashchange', () => this.handleRoute());
    store.subscribe(() => this.renderHeader());

    this.handleRoute();
    this.setupEmiCalculator();

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.nav-item-dropdown') && !e.target.closest('.user-profile-menu')) {
        this.closeAllNavMenus();
      }
    });
  }

  /* ---------------- THEME TOGGLER (LIGHT & DARK MODE) ---------------- */

  initTheme() {
    const savedTheme = localStorage.getItem('apex_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    this.updateThemeButton(savedTheme);
  }

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('apex_theme', newTheme);
    this.updateThemeButton(newTheme);
    Components.showToast('Theme Updated', `Switched to ${newTheme === 'dark' ? 'Dark Mode 🌙' : 'Light Mode ☀️'}`, 'info');
  }

  updateThemeButton(theme) {
    const iconElem = document.querySelector('#themeToggleBtn .theme-icon');
    const labelElem = document.getElementById('themeLabel');
    if (iconElem && labelElem) {
      if (theme === 'dark') {
        iconElem.textContent = '☀️';
        labelElem.textContent = 'Light';
      } else {
        iconElem.textContent = '🌙';
        labelElem.textContent = 'Dark';
      }
    }
  }

  /* ---------------- NAVBAR DROPDOWNS ---------------- */

  toggleNavMenu(menuId, event) {
    if (event) event.stopPropagation();
    const target = document.getElementById(menuId);
    if (!target) return;
    
    const wasOpen = target.classList.contains('open');
    this.closeAllNavMenus();
    if (!wasOpen) {
      target.classList.add('open');
    }
  }

  closeAllNavMenus() {
    document.querySelectorAll('.nav-item-dropdown.open, .user-profile-menu.open').forEach(el => {
      el.classList.remove('open');
    });
  }

  toggleMockMode() {
    const current = CONFIG.getMockMode();
    CONFIG.setMockMode(!current);
    this.updateStatusPill();
    Components.showToast('API Mode Switched', `Now operating in ${!current ? 'Mock Mode' : 'Live API Mode (http://127.0.0.1:8000)'}`, 'info');
    this.handleRoute();
  }

  navigate(path) {
    if (window.location.hash === path) {
      this.handleRoute();
    } else {
      window.location.hash = path;
    }
  }

  async handleRoute() {
    let hash = window.location.hash || '#/schemes';
    if (hash === '#/' || hash === '' || hash === '#') {
      hash = store.token ? (store.user?.is_admin ? '#/admin-dashboard' : '#/user-dashboard') : '#/schemes';
    }

    const token = store.token;
    const user = store.user;

    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));

    // Public routes that don't require token
    const isPublicRoute = (hash === '#/login' || hash === '#/register' || hash === '#/schemes' || hash === '#/eligibility');

    if (!token && !isPublicRoute) {
      this.navigate('#/login');
      return;
    }

    if (token && (hash === '#/login' || hash === '#/register')) {
      if (user?.is_admin) {
        this.navigate('#/admin-dashboard');
      } else {
        this.navigate('#/user-dashboard');
      }
      return;
    }

    switch (hash) {
      case '#/login':
        document.getElementById('viewLogin')?.classList.add('active');
        break;

      case '#/register':
        document.getElementById('viewRegister')?.classList.add('active');
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
    const navLoggedOut = document.getElementById('navLoggedOutActions');
    const dropdownAuth = document.getElementById('dropdownAuthItems');

    if (user && store.token) {
      if (navUser) navUser.style.display = 'flex';
      if (navLoggedOut) navLoggedOut.style.display = 'none';

      const avatarElem = document.getElementById('headerAvatar');
      const nameElem = document.getElementById('headerUserName');
      const emailElem = document.getElementById('headerUserEmail');

      if (avatarElem) avatarElem.textContent = user.full_name.charAt(0).toUpperCase();
      if (nameElem) nameElem.textContent = user.full_name;
      if (emailElem) emailElem.textContent = user.email;

      if (user.is_admin) {
        if (dropdownAuth) {
          dropdownAuth.innerHTML = `
            <a href="#/admin-dashboard" class="dropdown-item" onclick="app.closeAllNavMenus()">
              <span class="dropdown-icon">🛡️</span>
              <div>
                <div class="item-title">Admin Control Board</div>
                <div class="item-sub">Underwrite & sanction loans</div>
              </div>
            </a>
            <a href="#/admin-users" class="dropdown-item" onclick="app.closeAllNavMenus()">
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
            <a href="#/user-dashboard" class="dropdown-item" onclick="app.closeAllNavMenus()">
              <span class="dropdown-icon">📋</span>
              <div>
                <div class="item-title">My Loan Applications</div>
                <div class="item-sub">Track active submissions</div>
              </div>
            </a>
            <a href="javascript:void(0)" class="dropdown-item" onclick="app.closeAllNavMenus(); app.showModal('applyLoanModal');">
              <span class="dropdown-icon">➕</span>
              <div>
                <div class="item-title">+ New Application</div>
                <div class="item-sub">Personal, Home, Auto, Education, Gold</div>
              </div>
            </a>
          `;
        }
      }
    } else {
      if (navUser) navUser.style.display = 'none';
      if (navLoggedOut) navLoggedOut.style.display = 'flex';

      if (dropdownAuth) {
        dropdownAuth.innerHTML = `
          <a href="#/login" class="dropdown-item" onclick="app.closeAllNavMenus()">
            <span class="dropdown-icon">🔐</span>
            <div>
              <div class="item-title">Sign In</div>
              <div class="item-sub">Log in to your account</div>
            </div>
          </a>
          <a href="#/register" class="dropdown-item" onclick="app.closeAllNavMenus()">
            <span class="dropdown-icon">✍️</span>
            <div>
              <div class="item-title">Open Account</div>
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
    container.innerHTML = `<div style="text-align:center; padding:3rem;"><div class="status-badge pending">Loading registered users...</div></div>`;

    try {
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
    container.innerHTML = `<div style="text-align:center; padding:2rem;"><div class="status-badge pending">Calculating FOIR & Ranking Schemes...</div></div>`;

    const inputs = {
      age: Number(document.getElementById('elAge').value),
      employment_type: document.getElementById('elEmployment').value,
      annual_income: Number(document.getElementById('elIncome').value),
      credit_score: Number(document.getElementById('elCreditScore').value),
      existing_emi: Number(document.getElementById('elExistingEmi').value),
      requested_amount: Number(document.getElementById('elRequestedAmount').value),
      preferred_tenure_months: Number(document.getElementById('elTenure').value),
      gold_weight_grams: Number(document.getElementById('elGoldWeight').value || 0),
      gold_purity_karats: Number(document.getElementById('elGoldPurity').value || 0)
    };

    try {
      const res = await api.checkEligibility(inputs);
      container.innerHTML = Components.renderEligibilityResults(res);
      container.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      container.innerHTML = `<div class="empty-state" style="color:var(--rose);">Eligibility calculation error: ${err.message}</div>`;
    }
  }

  handleDocFileSelected(input, slotType) {
    const statusElem = document.getElementById(`statusDoc${slotType.charAt(0).toUpperCase() + slotType.slice(1)}`);
    if (!statusElem) return;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      statusElem.innerHTML = `<span style="color:var(--emerald); font-weight:700;">✅ ${file.name}</span> (${sizeMb} MB ready)`;
    } else {
      statusElem.innerHTML = `No file chosen (PDF, JPG, PNG up to 10MB)`;
    }
  }

  handleDocCategoryChange(category) {
    const select = document.getElementById('docTypeSelect');
    if (!select) return;

    const optionsMap = {
      kyc: [
        { val: 'pan_card', label: 'PAN Card' },
        { val: 'aadhaar', label: 'Aadhaar Card' },
        { val: 'passport', label: 'Passport / Voter ID' }
      ],
      income: [
        { val: 'salary_slip', label: 'Salary Slip (Last 3 Months)' },
        { val: 'form_16', label: 'Form 16 / Tax Certificate' },
        { val: 'income_tax_return', label: 'ITR with Financial Computation' }
      ],
      bank: [
        { val: 'bank_statement', label: 'Bank Statement (6-12 Months)' },
        { val: 'cancelled_cheque', label: 'Cancelled Cheque' }
      ],
      loan_specific: [
        { val: 'admission_letter', label: 'Admission Offer Letter' },
        { val: 'fee_schedule', label: 'Fee Schedule / Structure' },
        { val: 'vehicle_invoice', label: 'Vehicle Proforma Invoice' },
        { val: 'gst_certificate', label: 'GST & MSME Registration' },
        { val: 'gold_declaration', label: 'Gold Ornaments List & Declaration' },
        { val: 'sale_deed', label: 'Sale Deed / Agreement' }
      ],
      collateral: [
        { val: 'property_title_deed', label: 'Property Title Deed' },
        { val: 'valuation_report', label: 'Valuation & Search Report' },
        { val: 'gold_deposit_receipt', label: 'Gold Purity Assay & Deposit Receipt' },
        { val: 'hypothecation_deed', label: 'Vehicle Hypothecation Deed' }
      ]
    };

    const list = optionsMap[category] || [{ val: 'other', label: 'Other Document' }];
    select.innerHTML = list.map(opt => `<option value="${opt.val}">${opt.label}</option>`).join('');
  }

  handleSchemeCategoryChange(loanType) {
    const fieldsContainer = document.getElementById('dynamicCategoryFields');
    const checklistItems = document.getElementById('applyDocChecklistItems');
    const checklistTitle = document.getElementById('applyDocChecklistTitle');
    const lblSpecific = document.getElementById('lblDocSpecific');
    const docBadge = document.getElementById('applyDocBadge');

    // Document checklists by scheme
    const schemeChecklists = {
      personal_loan: {
        title: '📋 Personal Loan Document Checklist:',
        badge: 'Instant KYC + Income',
        items: [
          '✓ <strong>KYC:</strong> PAN Card, Aadhaar Card / Voter ID / Passport',
          '✓ <strong>Income Proof:</strong> Last 3 months Salary Slips / Form 16 / ITR',
          '✓ <strong>Bank Statement:</strong> 6 Months Bank Statement with salary/income credits',
          '✓ <strong>Purpose Document:</strong> Personal finance / Debt consolidation self-declaration'
        ],
        specificLabel: '📑 4. Purpose Declaration / Employment ID'
      },
      home_loan: {
        title: '📋 Home Loan Document Checklist:',
        badge: 'Property + KYC + 12M Bank',
        items: [
          '✓ <strong>KYC:</strong> PAN Card, Aadhaar Card, Passport-size photographs',
          '✓ <strong>Income Proof:</strong> Salary Slips (3 mos), Form 16, ITR for 2 years',
          '✓ <strong>Bank Statement:</strong> 12 Months Bank Account Statement',
          '✓ <strong>Property Documents:</strong> Sale Deed, Approved Building Plan, Builder NOC',
          '✓ <strong>Collateral:</strong> Property Valuation & Title Search Report'
        ],
        specificLabel: '🏠 4. Property Sale Deed / Approved Building Plan'
      },
      vehicle_loan: {
        title: '📋 Vehicle / Auto Loan Document Checklist:',
        badge: 'Dealer Invoice + KYC + 6M Bank',
        items: [
          '✓ <strong>KYC:</strong> PAN Card, Aadhaar Card, Valid Driving License',
          '✓ <strong>Income Proof:</strong> Latest 3 months Salary Slips / ITR Returns',
          '✓ <strong>Bank Statement:</strong> 6 Months Bank Statement',
          '✓ <strong>Vehicle Quotation:</strong> Proforma Invoice / Booking receipt from authorized dealer'
        ],
        specificLabel: '🚗 4. Vehicle Proforma Invoice / Booking Receipt'
      },
      education_loan: {
        title: '📋 Education Loan Document Checklist:',
        badge: 'Admission Letter + Academic Records',
        items: [
          '✓ <strong>KYC:</strong> Student & Co-Applicant PAN & Aadhaar Cards',
          '✓ <strong>Income Proof:</strong> Co-Applicant Salary Slips / Form 16 / 2 Years ITR',
          '✓ <strong>Bank Statement:</strong> 6 Months Co-Applicant Bank Statement',
          '✓ <strong>Academic & Admission:</strong> Confirmed Admission Letter, Fee Schedule & Marksheets'
        ],
        specificLabel: '🎓 4. Admission Offer Letter & Fee Schedule'
      },
      business_loan: {
        title: '📋 Business / MSME Loan Document Checklist:',
        badge: 'GST + 12M Current A/c + Audited P&L',
        items: [
          '✓ <strong>KYC:</strong> Business PAN, Promoter/Director PAN & Aadhaar Cards',
          '✓ <strong>Income Proof:</strong> Audited Balance Sheet & P&L (2 yrs), Business ITR',
          '✓ <strong>Bank Statement:</strong> 12 Months Current Account Statement',
          '✓ <strong>Business Proof:</strong> GST Registration, Udyam MSME Certificate, Partnership/MOA'
        ],
        specificLabel: '🏢 4. GST Registration / MSME Certificate'
      },
      gold_loan: {
        title: '📋 Gold Loan Document Checklist:',
        badge: 'Minimal KYC + Assay Receipt',
        items: [
          '✓ <strong>KYC:</strong> PAN Card, Aadhaar Card / Passport / Voter ID',
          '✓ <strong>Income Proof:</strong> Optional / Bank Statement for high ticket loans',
          '✓ <strong>Bank Statement:</strong> Bank Passbook / Cancelled Cheque for disbursement',
          '✓ <strong>Collateral:</strong> Gold Jewellery Ornaments List & Appraisal Certificate'
        ],
        specificLabel: '🥇 4. Gold Ornaments List & Purchase Invoice/Assay'
      }
    };

    const docConfig = schemeChecklists[loanType] || schemeChecklists.personal_loan;
    if (checklistTitle) checklistTitle.textContent = docConfig.title;
    if (checklistItems) checklistItems.innerHTML = docConfig.items.map(it => `<li>${it}</li>`).join('');
    if (lblSpecific) lblSpecific.innerHTML = `${docConfig.specificLabel}`;
    if (docBadge) docBadge.textContent = docConfig.badge;

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
    btn.textContent = 'Submitting Application & Uploading Documents...';

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
      // 1. Submit Loan Application
      const newLoan = await api.applyLoan(loanData);
      const loanId = newLoan.id;

      // 2. Upload any attached supporting documents
      const attachedDocs = [];
      const kycFile = document.getElementById('applyDocKyc')?.files[0];
      const incomeFile = document.getElementById('applyDocIncome')?.files[0];
      const bankFile = document.getElementById('applyDocBank')?.files[0];
      const specificFile = document.getElementById('applyDocSpecific')?.files[0];

      if (kycFile) {
        attachedDocs.push({
          file: kycFile,
          category: 'kyc',
          type: 'pan_aadhaar',
          note: 'Primary applicant KYC document'
        });
      }
      if (incomeFile) {
        attachedDocs.push({
          file: incomeFile,
          category: 'income',
          type: 'salary_or_itr',
          note: 'Proof of income / salary / ITR'
        });
      }
      if (bankFile) {
        attachedDocs.push({
          file: bankFile,
          category: 'bank',
          type: 'bank_statement',
          note: 'Operational bank account statement'
        });
      }
      if (specificFile) {
        attachedDocs.push({
          file: specificFile,
          category: 'loan_specific',
          type: `${loanType}_document`,
          note: `${loanType.replace('_', ' ')} scheme-specific requirement`
        });
      }

      let uploadedCount = 0;
      for (const item of attachedDocs) {
        try {
          const fd = new FormData();
          fd.append('doc_category', item.category);
          fd.append('doc_type', item.type);
          fd.append('verification_note', item.note);
          fd.append('file', item.file);
          await api.uploadDocument(loanId, fd);
          uploadedCount++;
        } catch (uploadErr) {
          console.warn(`Failed to upload ${item.category} document:`, uploadErr);
        }
      }

      // Reset file status labels
      ['Kyc', 'Income', 'Bank', 'Specific'].forEach(slot => {
        const statusElem = document.getElementById(`statusDoc${slot}`);
        if (statusElem) statusElem.textContent = 'No file chosen (PDF, JPG, PNG up to 10MB)';
      });

      if (uploadedCount > 0) {
        Components.showToast(
          'Application & Documents Submitted',
          `Application #${loanId} submitted with ${uploadedCount} supporting document(s). Status: Under Review ⏳.`,
          'success'
        );
      } else {
        Components.showToast(
          'Application Submitted',
          `Application #${loanId} submitted! Please upload required documents from your dashboard for underwriting.`,
          'info'
        );
      }

      this.hideModal('applyLoanModal');
      event.target.reset();
      this.navigate('#/user-dashboard');
      this.loadUserDashboard();
    } catch (err) {
      Components.showToast('Submission Error', err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit Application & Documents';
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

    const fileInput = document.getElementById('docFileInput');
    if (!fileInput.files || !fileInput.files[0]) {
      Components.showToast('File Required', 'Please select a document file to upload.', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('doc_category', document.getElementById('docCategorySelect').value);
    formData.append('doc_type', document.getElementById('docTypeSelect')?.value || 'document');
    formData.append('verification_note', 'Uploaded via portal');
    formData.append('file', fileInput.files[0]);

    try {
      await api.uploadDocument(this.currentDocLoanId, formData);
      Components.showToast('Document Uploaded', 'Document uploaded successfully for review.', 'success');
      event.target.reset();
      await this.loadDocumentsList();
      if (this.loadUserDashboard) this.loadUserDashboard();
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

  /* ---------------- DOCUMENT PREVIEW & INSPECTION ---------------- */

  openDocumentPreviewModal(loanId, docId, encodedFileName, category, type, status) {
    const fileName = decodeURIComponent(encodedFileName || 'Document');
    this.currentPreviewDoc = { loanId, docId, fileName, category, type, status };

    document.getElementById('previewDocTitle').textContent = fileName;
    document.getElementById('previewDocMeta').textContent = `Category: ${category} • Type: ${type} • Loan #${loanId}`;
    
    const statusBadge = document.getElementById('docPreviewStatusBadge');
    if (statusBadge) {
      statusBadge.innerHTML = Components.renderStatusBadge(status);
    }

    const noteInput = document.getElementById('docVerifyNoteInput');
    if (noteInput) noteInput.value = '';

    const baseApi = (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.startsWith('http') && window.location.port !== '5500' && window.location.port !== '3000' && window.location.port !== '5173') ? window.location.origin : CONFIG.API_BASE_URL;
    const token = localStorage.getItem(CONFIG.TOKEN_KEY) || '';
    const container = document.getElementById('docViewerFrameContainer');
    const downloadBtn = document.getElementById('btnDownloadDocFromPreview');

    const viewUrl = `${baseApi}/admin/loans/${loanId}/documents/${docId}/view?token=${encodeURIComponent(token)}`;
    const downloadUrl = `${baseApi}/admin/loans/${loanId}/documents/${docId}/download?token=${encodeURIComponent(token)}`;

    if (downloadBtn) {
      downloadBtn.onclick = () => {
        window.open(downloadUrl, '_blank');
      };
    }

    const isImage = /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(fileName);
    const isPdf = /\.pdf$/i.test(fileName);

    if (isPdf) {
      container.innerHTML = `
        <iframe src="${viewUrl}" style="width: 100%; height: 100%; min-height: 480px; border: none; border-radius: 8px; background: #ffffff;" title="${fileName}"></iframe>
      `;
    } else if (isImage) {
      container.innerHTML = `
        <div style="width: 100%; height: 100%; min-height: 380px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.35); border-radius: 8px; padding: 1rem; overflow: auto;">
          <img src="${viewUrl}" alt="${fileName}" style="max-width: 100%; max-height: 480px; object-fit: contain; border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,0.3);" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'text-align:center; color:#f8fafc; padding:2rem;\\'><div style=\\'font-size:3rem;\\'>🖼️</div><p style=\\'margin-top:0.5rem;\\'>Image preview unavailable.</p><a href=\\'${downloadUrl}\\' target=\\'_blank\\' class=\\'btn btn-primary btn-sm\\' style=\\'margin-top:0.75rem;\\'>Download File</a></div>';">
        </div>
      `;
    } else {
      container.innerHTML = `
        <div style="text-align: center; color: #f8fafc; padding: 3rem 1rem;">
          <div style="font-size: 3.5rem; margin-bottom: 0.75rem;">📑</div>
          <div style="font-size: 1.15rem; font-weight: 600;">${fileName}</div>
          <div style="font-size: 0.85rem; color: #94a3b8; margin-top: 0.5rem;">
            Category: ${category} • Type: ${type}
          </div>
          <button class="btn btn-primary btn-sm" style="margin-top: 1.25rem;" onclick="window.open('${downloadUrl}', '_blank')">
            ⬇️ Download ${fileName}
          </button>
        </div>
      `;
    }

    // Role-based visibility for underwriter toolbar
    const toolbar = document.getElementById('docUnderwriterToolbar');
    const user = JSON.parse(localStorage.getItem(CONFIG.USER_KEY) || '{}');
    if (toolbar) {
      toolbar.style.display = user.is_admin ? 'block' : 'none';
    }

    this.showModal('docPreviewModal');
  }

  async decideDocFromPreview(decisionStatus) {
    if (!this.currentPreviewDoc) return;
    const { loanId, docId, fileName } = this.currentPreviewDoc;
    const note = document.getElementById('docVerifyNoteInput')?.value.trim() || `Marked as ${decisionStatus} by underwriter`;

    try {
      await api.verifyDocument(loanId, docId, decisionStatus, note);
      Components.showToast('Document Verification Updated', `${fileName} marked as ${decisionStatus.toUpperCase()}.`, 'success');
      
      const badge = document.getElementById('docPreviewStatusBadge');
      if (badge) badge.innerHTML = Components.renderStatusBadge(decisionStatus);

      this.currentPreviewDoc.status = decisionStatus;
      await this.loadDocumentsList();
    } catch (err) {
      Components.showToast('Verification Failed', err.message, 'error');
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

  async openReviewModal(loanId, applicantName, amountStr, reqAmount = 500000, sanctionedAmt = 500000, rate = 10.5) {
    this.currentReviewLoanId = loanId;
    document.getElementById('modalLoanIdTitle').textContent = `Review Loan Application #${loanId}`;
    document.getElementById('modalApplicantDesc').textContent = `${applicantName} — Requested ${amountStr}`;
    
    document.getElementById('adminSanctionAmount').value = sanctionedAmt || reqAmount;
    document.getElementById('adminInterestRate').value = rate || 10.5;
    document.getElementById('adminNoteInput').value = '';

    // Load applicant's uploaded documents checklist
    const docsContainer = document.getElementById('reviewLoanDocsList');
    const countBadge = document.getElementById('reviewDocsCountBadge');
    
    if (docsContainer) {
      docsContainer.innerHTML = '<div style="font-size:0.85rem; color:var(--text-muted); text-align:center; padding:0.5rem;">Loading documents...</div>';
      try {
        const docs = await api.getDocuments(loanId);
        if (countBadge) countBadge.textContent = `${docs.length} Uploaded`;

        if (!docs || docs.length === 0) {
          docsContainer.innerHTML = `
            <div style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 0.5rem;">
              ⚠️ No supporting documents uploaded for this application yet.
            </div>
          `;
        } else {
          docsContainer.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 0.4rem;">
              ${docs.map(d => {
                const docId = d.id || d.doc_id;
                const fileName = d.original_filename || d.file_name || 'Document';
                const status = d.verification_status || d.status || 'pending';
                const category = (d.doc_category || 'other').toUpperCase();
                const type = d.doc_type || '';

                return `
                  <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-card-hover); padding: 0.4rem 0.6rem; border-radius: var(--radius-sm); font-size: 0.82rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      <span class="product-tag" style="font-size: 0.7rem; padding: 0.1rem 0.4rem;">${category}</span>
                      <strong style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${fileName}</strong>
                      <span style="color: var(--text-muted); font-size: 0.75rem;">(${type})</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                      ${Components.renderStatusBadge(status)}
                      <button type="button" class="btn btn-sm btn-outline-primary" style="padding: 0.15rem 0.5rem; font-size: 0.75rem;" onclick="app.openDocumentPreviewModal(${loanId}, ${docId}, '${encodeURIComponent(fileName)}', '${category}', '${type}', '${status}')">
                        👁️ Inspect
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `;
        }
      } catch (err) {
        if (docsContainer) {
          docsContainer.innerHTML = `<div style="font-size:0.85rem; color:var(--danger-color); padding:0.5rem;">Failed to load documents: ${err.message}</div>`;
        }
      }
    }

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
