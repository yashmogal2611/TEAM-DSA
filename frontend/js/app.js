/**
 * Main Application Orchestrator & Client-Side Controller
 * Extended to support Schemes, Eligibility Engine, Documents, and Admin Underwriting
 */
class ApplicationController {
  constructor() {
    this.currentReviewLoanId = null;
    this.currentDocLoanId = null;
    this.isDocAdminMode = false;
    this.currentRecommendationContext = null;
    this.chatHistory = [];
    this.isChatOpen = false;
    this.init();
  }

  async init() {
    // Clear any previous session on startup to ensure fresh state
    store.clearSession();
    localStorage.removeItem('loan_app_mock_mode');
    localStorage.removeItem('crediwise_use_mock');

    this.updateStatusPill();
    window.addEventListener('hashchange', () => this.handleRoute());
    store.subscribe(() => this.renderHeader());

    // Register global session expiry listener for subsequent operations
    window.addEventListener('auth:expired', () => {
      Components.showToast('Session Expired', 'Your token expired or is invalid. Please log in again.', 'warning');
      this.navigate('#/login');
    });

    this.handleRoute();
    this.setupEmiCalculator();
    this.showChatFab();

    document.addEventListener('click', (e) => {
      const navWrapper = document.getElementById('navDropdownWrapper');
      if (navWrapper && !navWrapper.contains(e.target)) {
        navWrapper.classList.remove('open');
      }

      const schemesWrapper = document.getElementById('schemesDropdownWrapper');
      if (schemesWrapper && !schemesWrapper.contains(e.target)) {
        schemesWrapper.classList.remove('open');
      }

      const profileWrapper = document.getElementById('userProfileDropdown');
      const avatarBtn = document.getElementById('headerAvatarBtn');
      if (profileWrapper && !profileWrapper.contains(e.target) && avatarBtn && !avatarBtn.contains(e.target)) {
        profileWrapper.classList.remove('open');
      }

      if (e.target && e.target.classList.contains('modal-backdrop')) {
        this.hideModal(e.target.id);
      }
    });
  }

  showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      if (window.lucide) window.lucide.createIcons();
    }
  }

  hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  toggleNavDropdown(event) {
    if (event) event.stopPropagation();
    this.closeSchemesDropdown();
    this.closeProfileDropdown();
    const wrapper = document.getElementById('navDropdownWrapper');
    if (wrapper) wrapper.classList.toggle('open');
  }

  closeNavDropdown() {
    const wrapper = document.getElementById('navDropdownWrapper');
    if (wrapper) wrapper.classList.remove('open');
  }

  toggleSchemesDropdown(event) {
    if (event) event.stopPropagation();
    this.closeNavDropdown();
    this.closeProfileDropdown();
    const wrapper = document.getElementById('schemesDropdownWrapper');
    if (wrapper) wrapper.classList.toggle('open');
  }

  closeSchemesDropdown() {
    const wrapper = document.getElementById('schemesDropdownWrapper');
    if (wrapper) wrapper.classList.remove('open');
  }

  toggleProfileDropdown(event) {
    if (event) event.stopPropagation();
    this.closeNavDropdown();
    this.closeSchemesDropdown();
    const dropdown = document.getElementById('userProfileDropdown');
    if (dropdown) dropdown.classList.toggle('open');
  }

  closeProfileDropdown() {
    const dropdown = document.getElementById('userProfileDropdown');
    if (dropdown) dropdown.classList.remove('open');
  }

  navigateToUserDashboard() {
    this.closeProfileDropdown();
    const user = store.user;
    if (user?.is_admin) {
      this.navigate('#/admin-dashboard');
    } else {
      this.navigate('#/user-dashboard');
    }
  }

  selectSchemeType(type) {
    this.closeSchemesDropdown();
    if (type === 'all') {
      this.navigate('#/schemes');
    } else {
      const slugMap = {
        'home_loan': 'home-loan',
        'personal_loan': 'personal-loan',
        'vehicle_loan': 'vehicle-loan',
        'education_loan': 'education-loan',
        'business_loan': 'business-loan',
        'gold_loan': 'gold-loan'
      };
      const slug = slugMap[type] || type;
      this.navigate(`#/schemes/${slug}`);
    }
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
    const isPublicRoute = (
      hash === '#/' ||
      hash === '#/home' ||
      hash.startsWith('#/schemes') ||
      hash === '#/login' ||
      hash === '#/register' ||
      hash === '#/eligibility'
    );

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

    const routePath = hash.split('?')[0];

    if (routePath.startsWith('#/schemes')) {
      document.getElementById('viewSchemes').classList.add('active');
      await this.loadSchemesView();
    } else {
      switch (routePath) {
        case '#/':
        case '#/home':
          document.getElementById('viewHome').classList.add('active');
          const homeBanner = document.getElementById('homeUserWelcomeBanner');
          if (homeBanner) {
            homeBanner.innerHTML = Components.renderHomeUserWelcomeBanner(user);
          }
          if (window.lucide) window.lucide.createIcons();
          break;

        case '#/login':
          document.getElementById('viewLogin').classList.add('active');
          break;

        case '#/register':
          document.getElementById('viewRegister').classList.add('active');
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
          this.navigate('#/home');
          break;
      }
    }

    this.renderHeader();
  }

  renderHeader() {
    const user = store.user;
    const navUser = document.getElementById('navUserControls');
    const loginBtn = document.getElementById('headerLoginBtn');
    const dropdownAuth = document.getElementById('dropdownAuthItems');

    if (user && store.token) {
      if (navUser) navUser.style.display = 'block';
      if (loginBtn) loginBtn.style.display = 'none';
      
      const initials = (user.full_name || 'U').trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().substring(0, 2);
      
      const headerAvatarBtn = document.getElementById('headerAvatarBtn');
      const headerInitials = document.getElementById('headerAvatarInitials');
      const popAvatar = document.getElementById('popoverAvatar');
      const popName = document.getElementById('popoverUserName');
      const popEmail = document.getElementById('popoverUserEmail');
      const popRole = document.getElementById('popoverUserRole');

      const bankLogoUrl = (user.is_admin || user.bank_name) 
        ? Components.getBankLogoUrl(user.bank_name || user.full_name || user.email) 
        : '';

      if (bankLogoUrl) {
        if (headerAvatarBtn) headerAvatarBtn.classList.add('has-logo');
        if (popAvatar) popAvatar.classList.add('has-logo');
        if (headerInitials) {
          headerInitials.innerHTML = `<img src="${bankLogoUrl}" alt="Bank Logo">`;
        }
        if (popAvatar) {
          popAvatar.innerHTML = `<img src="${bankLogoUrl}" alt="Bank Logo">`;
        }
      } else {
        if (headerAvatarBtn) headerAvatarBtn.classList.remove('has-logo');
        if (popAvatar) popAvatar.classList.remove('has-logo');
        if (headerInitials) headerInitials.textContent = initials;
        if (popAvatar) popAvatar.textContent = initials;
      }

      if (popName) popName.textContent = user.full_name;
      if (popEmail) popEmail.textContent = user.email;
      if (popRole) {
        popRole.textContent = user.is_admin ? (user.bank_name ? `${user.bank_name} Admin` : 'System Administrator') : 'Verified Borrower';
        popRole.className = `popover-role-badge ${user.is_admin ? 'admin' : 'user'}`;
      }

      if (user.is_admin) {
        if (dropdownAuth) {
          dropdownAuth.innerHTML = `
            <a href="#/admin-dashboard" class="dropdown-item" onclick="app.closeNavDropdown()">
              <span class="dropdown-icon"><i data-lucide="shield"></i></span>
              <div>
                <div class="item-title">Admin Control Board</div>
                <div class="item-sub">Underwrite & sanction loans</div>
              </div>
            </a>
            <a href="#/admin-users" class="dropdown-item" onclick="app.closeNavDropdown()">
              <span class="dropdown-icon"><i data-lucide="users"></i></span>
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
              <span class="dropdown-icon"><i data-lucide="file-text"></i></span>
              <div>
                <div class="item-title">My Applications</div>
                <div class="item-sub">Track active submissions</div>
              </div>
            </a>
            <a href="javascript:void(0)" class="dropdown-item" onclick="app.closeNavDropdown(); app.showModal('applyLoanModal');">
              <span class="dropdown-icon"><i data-lucide="plus"></i></span>
              <div>
                <div class="item-title">+ New Application</div>
                <div class="item-sub">Apply for home, personal, gold loan</div>
              </div>
            </a>
          `;
        }
      }
    } else {
      if (navUser) navUser.style.display = 'none';
      if (loginBtn) loginBtn.style.display = 'inline-flex';

      if (dropdownAuth) {
        dropdownAuth.innerHTML = `
          <a href="#/login" class="dropdown-item" onclick="app.closeNavDropdown()">
            <span class="dropdown-icon"><i data-lucide="lock"></i></span>
            <div>
              <div class="item-title">Sign In</div>
              <div class="item-sub">Log in to your account</div>
            </div>
          </a>
          <a href="#/register" class="dropdown-item" onclick="app.closeNavDropdown()">
            <span class="dropdown-icon"><i data-lucide="edit-3"></i></span>
            <div>
              <div class="item-title">Create Account</div>
              <div class="item-sub">Register as new borrower</div>
            </div>
          </a>
        `;
      }
    }
    if (window.lucide) window.lucide.createIcons();
  }

  /* ---------------- VIEW LOADERS & API CALLS ---------------- */

  async loadSchemesView() {
    const container = document.getElementById('schemesContainer');
    container.innerHTML = `<div style="text-align:center; padding:3rem;"><div class="status-badge pending">Loading loan schemes...</div></div>`;

    const hash = window.location.hash;
    let selectedType = 'all';

    if (hash.includes('/schemes/home-loan') || hash.includes('type=home_loan')) selectedType = 'home_loan';
    else if (hash.includes('/schemes/personal-loan') || hash.includes('type=personal_loan')) selectedType = 'personal_loan';
    else if (hash.includes('/schemes/vehicle-loan') || hash.includes('type=vehicle_loan')) selectedType = 'vehicle_loan';
    else if (hash.includes('/schemes/education-loan') || hash.includes('type=education_loan')) selectedType = 'education_loan';
    else if (hash.includes('/schemes/business-loan') || hash.includes('type=business_loan')) selectedType = 'business_loan';
    else if (hash.includes('/schemes/gold-loan') || hash.includes('type=gold_loan')) selectedType = 'gold_loan';

    try {
      const schemes = await api.getLoanSchemes();
      container.innerHTML = Components.renderSchemesGrid(schemes, selectedType);
      if (window.lucide) window.lucide.createIcons();
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
      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      container.innerHTML = `<div class="empty-state" style="color:var(--rose);">Failed to load applications: ${err.message}</div>`;
    }
  }

  async loadAdminDashboard(statusFilter = '') {
    const container = document.getElementById('adminLoansContainer');
    const statsContainer = document.getElementById('adminStatsContainer');
    const schemesContainer = document.getElementById('adminSchemesContainer');
    const headingEl = document.getElementById('adminDashboardHeading');
    const badgeEl = document.getElementById('adminBankBadge');
    
    container.innerHTML = `<div style="text-align:center; padding:3rem;"><div class="status-badge pending">Loading bank underwriting queue...</div></div>`;

    try {
      const [stats, loans] = await Promise.all([
        api.getAdminStats(),
        api.getAdminLoans(statusFilter)
      ]);

      store.adminStats = stats;
      store.adminLoans = loans;

      // Update bank scoped branding with official bank logo
      if (stats && stats.bank_name) {
        const logoContainer = document.getElementById('adminBankLogoContainer');
        if (logoContainer) {
          logoContainer.innerHTML = Components.getBankLogoHtml(stats.bank_name, 42);
        }
        if (headingEl) {
          headingEl.textContent = `${stats.bank_name} Underwriting Portal`;
        }
      }

      // Render KPIs
      statsContainer.innerHTML = Components.renderAdminStats(stats);
      
      // Render Per-Scheme Breakdown
      if (schemesContainer && stats.schemes_breakdown) {
        schemesContainer.innerHTML = Components.renderAdminSchemeStats(stats.schemes_breakdown, stats.bank_name);
      }

      // Render Applications Table
      container.innerHTML = Components.renderAdminLoansTable(loans);
      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      container.innerHTML = `<div class="empty-state" style="color:var(--rose);">Failed to load bank admin data: ${err.message}</div>`;
    }
  }

  handleAdminSearch(query) {
    const q = (query || '').toLowerCase().trim();
    const container = document.getElementById('adminLoansContainer');
    if (!container || !store.adminLoans) return;

    if (!q) {
      container.innerHTML = Components.renderAdminLoansTable(store.adminLoans);
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    const filtered = store.adminLoans.filter(l => 
      (l.applicant_name && l.applicant_name.toLowerCase().includes(q)) ||
      (l.applicant_email && l.applicant_email.toLowerCase().includes(q)) ||
      (l.product_type && l.product_type.toLowerCase().includes(q)) ||
      String(l.id).includes(q)
    );

    container.innerHTML = Components.renderAdminLoansTable(filtered);
    if (window.lucide) window.lucide.createIcons();
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
      if (window.lucide) window.lucide.createIcons();
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
      if (chevron) {
        chevron.innerHTML = '<i data-lucide="chevron-down"></i>';
        if (window.lucide) window.lucide.createIcons();
      }
      if (userRow) userRow.classList.remove('active-user-expanded');
    } else {
      dropdownRow.style.display = 'table-row';
      if (chevron) {
        chevron.innerHTML = '<i data-lucide="chevron-up"></i>';
        if (window.lucide) window.lucide.createIcons();
      }
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

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
      store.clearSession();
      const res = await api.login({ email, password });
      localStorage.setItem(CONFIG.TOKEN_KEY, res.access_token);

      const profile = await api.getMe();
      if (res.bank_name) profile.bank_name = res.bank_name;
      if (res.bank_code) profile.bank_code = res.bank_code;
      store.setSession(res.access_token, profile);

      const welcomeTitle = res.is_admin ? 'Admin Portal' : 'Login Successful';
      Components.showToast(welcomeTitle, `Welcome back, ${profile.full_name}!`, 'success');

      if (res.is_admin) {
        this.navigate('#/admin-dashboard');
      } else {
        this.navigate('#/home');
      }
    } catch (err) {
      Components.showToast('Authentication Failed', err.message, 'error');
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
      store.clearSession();
      const user = await api.register(userData);
      Components.showToast('Account Created!', 'Registration successful. Welcome to CrediWise.', 'success');

      const loginRes = await api.login({ email: userData.email, password: userData.password });
      localStorage.setItem(CONFIG.TOKEN_KEY, loginRes.access_token);
      store.setSession(loginRes.access_token, user);
      
      this.navigate('#/home');
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
    container.innerHTML = `<div style="text-align:center; padding:2rem;"><div class="status-badge pending"><i data-lucide="zap" class="lucide" style="color:var(--accent-primary); margin-right:0.4rem;"></i> Calculating Personalised Interest Rates & Offers...</div></div>`;

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
      this.currentRecommendationContext = res;
      this.chatHistory = [];

      container.innerHTML = Components.renderEligibilityResults(res);
      container.scrollIntoView({ behavior: 'smooth' });
      if (window.lucide) window.lucide.createIcons();

      if (res && res.status === 'APPROVED') {
        this.loadGenAIFeatures(res);
      } else {
        this.closeChatWidget();
      }
    } catch (err) {
      if (err.message && (err.message.includes('422') || err.message.includes('Invalid option'))) {
        Components.showToast('Validation Error', 'An input value does not match allowed criteria.', 'error');
      }
      container.innerHTML = `<div class="empty-state" style="color:var(--rose);">Eligibility Assessment Error: ${err.message}</div>`;
    }
  }

  async loadGenAIFeatures(recommendationRes) {
    const summaryContainer = document.getElementById('aiSummaryContainer');
    const explanationContainer = document.getElementById('explanationContainer');

    if (summaryContainer) {
      summaryContainer.innerHTML = Components.renderAISummaryBanner(null, true);
    }
    if (explanationContainer) {
      explanationContainer.innerHTML = Components.renderExplanationPanel(null, true);
    }

    this.showChatFab();

    const [explanationResult, summaryResult] = await Promise.allSettled([
      api.explainRecommendation(recommendationRes),
      api.summarizeRecommendation(recommendationRes)
    ]);

    if (summaryContainer) {
      if (summaryResult.status === 'fulfilled' && summaryResult.value) {
        summaryContainer.innerHTML = Components.renderAISummaryBanner(summaryResult.value, false);
      } else {
        summaryContainer.innerHTML = `
          <div class="ai-summary-banner error-banner">
            <div class="ai-summary-header">
              <span class="ai-badge"><i data-lucide="bot" class="lucide"></i> AI Summary</span>
              <span class="ai-note">AI summary temporarily unavailable — see detailed breakdown below</span>
            </div>
          </div>
        `;
      }
    }

    if (explanationContainer) {
      if (explanationResult.status === 'fulfilled' && explanationResult.value) {
        explanationContainer.innerHTML = Components.renderExplanationPanel(explanationResult.value, false);
      } else {
        explanationContainer.innerHTML = `
          <div class="explanation-box error-box" style="margin-top:1.5rem;">
            <h4><i data-lucide="clipboard-list" class="lucide"></i> Policy Breakdown</h4>
            <p style="font-size:0.9rem; color:var(--text-muted);">Detailed feature explanations temporarily unavailable.</p>
          </div>
        `;
      }
    }
    if (window.lucide) window.lucide.createIcons();
  }

  showChatFab() {
    let fab = document.getElementById('chatFab');
    if (!fab) {
      fab = document.createElement('button');
      fab.id = 'chatFab';
      fab.className = 'chat-fab';
      fab.title = 'AI Loan Assistant';
      fab.onclick = () => this.toggleChatWidget();
      fab.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bot"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`;
      document.body.appendChild(fab);
    }
    fab.style.display = 'flex';
  }

  toggleChatWidget() {
    if (this.isChatOpen) {
      this.closeChatWidget();
    } else {
      this.openChatWidget();
    }
  }

  openChatWidget() {
    let widget = document.getElementById('chatWidgetContainer');
    if (!widget) {
      widget = document.createElement('div');
      widget.id = 'chatWidgetContainer';
      widget.className = 'chat-widget-panel';
      document.body.appendChild(widget);
    }
    widget.innerHTML = Components.renderChatWidget();
    widget.style.display = 'flex';
    this.isChatOpen = true;

    this.renderChatHistory();
    if (window.lucide) window.lucide.createIcons();
  }

  closeChatWidget() {
    const widget = document.getElementById('chatWidgetContainer');
    if (widget) {
      widget.style.display = 'none';
    }
    this.isChatOpen = false;
  }

  renderChatHistory() {
    const container = document.getElementById('chatMessagesContainer');
    if (!container) return;

    if (this.chatHistory.length === 0) {
      if (!this.currentRecommendationContext) {
        container.innerHTML = `
          <div class="chat-intro-box">
            <span class="intro-icon"><i data-lucide="lightbulb" class="lucide"></i></span>
            <p>Run an <strong>Eligibility & Loan Calculation</strong> first to enable the AI credit assistant.</p>
          </div>
        `;
      } else {
        container.innerHTML = `
          <div class="chat-intro-box">
            <span class="intro-icon"><i data-lucide="hand" class="lucide"></i></span>
            <p>Hello! I am your AI Loan Assistant. Ask me anything about your credit eligibility, offer comparison, or document requirements.</p>
          </div>
        `;
      }
      return;
    }

    container.innerHTML = this.chatHistory.map(msg => Components.renderChatMessage(msg)).join('');
    container.scrollTop = container.scrollHeight;
    if (window.lucide) window.lucide.createIcons();
  }

  sendSuggestedPrompt(text) {
    const input = document.getElementById('chatInputText');
    if (input) {
      input.value = text;
      const form = input.closest('form');
      if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
  }

  async handleSendChatMessage(event) {
    event.preventDefault();
    const input = document.getElementById('chatInputText');
    const sendBtn = document.getElementById('chatSendBtn');
    if (!input) return;

    const question = input.value.trim();
    if (!question) return;

    if (!this.currentRecommendationContext) {
      Components.showToast('Run Eligibility First', 'Please run a loan recommendation calculation to activate the AI assistant.', 'info');
      return;
    }

    this.chatHistory.push({ sender: 'user', text: question });
    input.value = '';
    this.renderChatHistory();

    const container = document.getElementById('chatMessagesContainer');
    if (container) {
      const typingDiv = document.createElement('div');
      typingDiv.id = 'botTypingIndicator';
      typingDiv.className = 'chat-bubble-row bot-row';
      typingDiv.innerHTML = `
        <div class="chat-bubble bot typing">
          <span class="typing-dots">Analyzing credit model context...</span>
        </div>
      `;
      container.appendChild(typingDiv);
      container.scrollTop = container.scrollHeight;
    }

    if (sendBtn) sendBtn.disabled = true;

    try {
      const res = await api.chatWithBot(question, this.currentRecommendationContext);
      const typingDiv = document.getElementById('botTypingIndicator');
      if (typingDiv) typingDiv.remove();

      this.chatHistory.push({
        sender: 'bot',
        text: res.answer || 'Thank you for your question.',
        source: res.source || 'gemini',
        grounded: res.grounded !== false
      });
      this.renderChatHistory();
    } catch (err) {
      const typingDiv = document.getElementById('botTypingIndicator');
      if (typingDiv) typingDiv.remove();

      this.chatHistory.push({
        sender: 'bot',
        text: "I couldn't process that question right now. You can try rephrasing or ask about interest rates, EMI, or document requirements.",
        source: 'fallback',
        grounded: true
      });
      this.renderChatHistory();
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  handleSchemeCategoryChange(loanType) {
    const fieldsContainer = document.getElementById('dynamicCategoryFields');
    const purposeInput = document.getElementById('applyPurpose');

    const defaultPurposes = {
      'home_loan': 'Residential Property Purchase / Construction',
      'personal_loan': 'Personal Financial Requirements / Lifestyle Expenses',
      'vehicle_loan': 'Vehicle Purchase / Auto Financing',
      'education_loan': 'Higher Studies / Tuition & Academic Fees',
      'business_loan': 'Business Expansion / Working Capital Support',
      'gold_loan': 'Short-term Liquidity / Emergency Financial Needs'
    };

    if (purposeInput && defaultPurposes[loanType]) {
      purposeInput.value = defaultPurposes[loanType];
    }

    if (!fieldsContainer) return;

    switch (loanType) {
      case 'home_loan':
        fieldsContainer.innerHTML = `
          <div class="dynamic-field-box">
            <h4 style="margin-bottom:0.75rem; color:var(--accent-primary);"><i data-lucide="home" class="lucide" style="color:var(--accent-primary); margin-right:0.4rem;"></i> Property Specifications</h4>
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">Property Type</label>
                <select id="applyPropertyType" class="input-control">
                  <option value="apartment">Ready Apartment / Flat</option>
                  <option value="under_construction">Under-Construction Project</option>
                  <option value="independent_house">Independent Villa / House</option>
                  <option value="plot_purchase">Residential Plot + Construction</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Estimated Property Value (₹)</label>
                <input type="number" id="applyPropertyValue" class="input-control" value="6500000" min="100000" step="any" required>
              </div>
            </div>
          </div>
        `;
        break;

      case 'gold_loan':
        fieldsContainer.innerHTML = `
          <div class="dynamic-field-box">
            <h4 style="margin-bottom:0.75rem; color:var(--accent-primary);"><i data-lucide="award" class="lucide" style="color:var(--accent-primary); margin-right:0.4rem;"></i> Gold Loan Parameters</h4>
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
            <h4 style="margin-bottom:0.75rem; color:var(--accent-primary);"><i data-lucide="car" class="lucide" style="color:var(--accent-primary); margin-right:0.4rem;"></i> Vehicle Details</h4>
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
            <h4 style="margin-bottom:0.75rem; color:var(--accent-primary);"><i data-lucide="graduation-cap" class="lucide" style="color:var(--accent-primary); margin-right:0.4rem;"></i> Academic Institution</h4>
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
            <h4 style="margin-bottom:0.75rem; color:var(--accent-primary);"><i data-lucide="building-2" class="lucide" style="color:var(--accent-primary); margin-right:0.4rem;"></i> Business Details</h4>
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
    if (window.lucide) window.lucide.createIcons();
  }

  fillSchemeAndApply(loanType, recommendedEmi = null, bankName = null, schemeName = null) {
    if (!store.token) {
      Components.showToast('Login Required', 'Please sign in or register to submit a loan application.', 'info');
      this.navigate('#/login');
      return;
    }

    // Comprehensive category normalization matching product IDs and scheme types
    let normalizedCategory = 'personal_loan';
    const l = (loanType || '').toLowerCase();
    if (l.includes('home') || l.includes('_hl_') || l.includes('housing') || l.includes('property') || l.includes('mortgage')) {
      normalizedCategory = 'home_loan';
    } else if (l.includes('veh') || l.includes('car') || l.includes('auto') || l.includes('_vl_') || l.includes('wheel')) {
      normalizedCategory = 'vehicle_loan';
    } else if (l.includes('edu') || l.includes('student') || l.includes('vidya') || l.includes('_el_') || l.includes('academic')) {
      normalizedCategory = 'education_loan';
    } else if (l.includes('bus') || l.includes('msme') || l.includes('sme') || l.includes('mudra') || l.includes('_bl_') || l.includes('working_capital')) {
      normalizedCategory = 'business_loan';
    } else if (l.includes('gold') || l.includes('_gl_')) {
      normalizedCategory = 'gold_loan';
    } else {
      normalizedCategory = 'personal_loan';
    }

    const select = document.getElementById('applyProductType');
    if (select) {
      select.value = normalizedCategory;
      this.handleSchemeCategoryChange(normalizedCategory);
    }

    // Pre-fill target bank & scheme if provided
    if (bankName) {
      const bankSelect = document.getElementById('applyBankName');
      if (bankSelect) {
        let matched = false;
        for (let opt of bankSelect.options) {
          if (opt.value.toLowerCase().trim() === bankName.toLowerCase().trim() ||
              opt.value.toLowerCase().includes(bankName.toLowerCase()) ||
              bankName.toLowerCase().includes(opt.value.toLowerCase())) {
            bankSelect.value = opt.value;
            matched = true;
            break;
          }
        }
        if (!matched) {
          const opt = new Option(bankName, bankName, true, true);
          bankSelect.add(opt);
          bankSelect.value = bankName;
        }
      }
    }

    if (schemeName) {
      const schemeInput = document.getElementById('applySchemeName');
      if (schemeInput) schemeInput.value = schemeName;
    }

    // Auto-sync input fields from active calculator context if available
    const elAmount = document.getElementById('elRequestedAmount');
    if (elAmount && elAmount.value) {
      const applyAmt = document.getElementById('applyAmount');
      if (applyAmt) applyAmt.value = elAmount.value;
    }

    const elTenure = document.getElementById('elTenure');
    if (elTenure && elTenure.value) {
      const applyTen = document.getElementById('applyTenure');
      if (applyTen) applyTen.value = elTenure.value;
    }

    const elMonthly = document.getElementById('elMonthlyIncome');
    if (elMonthly && elMonthly.value) {
      const applyInc = document.getElementById('applyIncome');
      if (applyInc) applyInc.value = Number(elMonthly.value) * 12;
    }

    const elCredit = document.getElementById('elCreditScore');
    if (elCredit && elCredit.value) {
      const applyCibil = document.getElementById('applyCreditScore');
      if (applyCibil) applyCibil.value = elCredit.value;
    }

    const elEmp = document.getElementById('elEmployment');
    if (elEmp && elEmp.value) {
      const applyEmp = document.getElementById('applyEmployment');
      if (applyEmp) applyEmp.value = elEmp.value.toLowerCase();
    }

    this.showModal('applyLoanModal');
  }

  handleApplyBankChange(bankName) {
    const schemeInput = document.getElementById('applySchemeName');
    const prodSelect = document.getElementById('applyProductType');
    if (schemeInput && prodSelect) {
      const pName = prodSelect.options[prodSelect.selectedIndex]?.text || 'Regular Scheme';
      schemeInput.value = `${bankName} ${pName}`;
    }
  }

  async handleApplyLoan(event) {
    event.preventDefault();
    const btn = event.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Submitting Application...';

    // Compulsory Verification Documents Check
    const kycFile = document.getElementById('applyDocKyc')?.files?.[0];
    const incomeFile = document.getElementById('applyDocIncome')?.files?.[0];

    if (!kycFile || !incomeFile) {
      Components.showToast('Compulsory Documents Missing', 'Uploading verification documents (KYC Proof & Income Proof) is mandatory to submit a new loan application.', 'warning');
      btn.disabled = false;
      btn.textContent = originalText;
      return;
    }

    const loanType = document.getElementById('applyProductType').value;
    const bankName = document.getElementById('applyBankName')?.value || 'State Bank of India';
    const schemeName = document.getElementById('applySchemeName')?.value || `${bankName} Regular Scheme`;

    const loanData = {
      product_type: loanType,
      bank_name: bankName,
      scheme_name: schemeName,
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
      const newLoan = await api.applyLoan(loanData);

      // Upload attached verification documents if files selected
      const docInputs = [
        { id: 'applyDocKyc', category: 'kyc', type: 'PAN / Aadhaar KYC' },
        { id: 'applyDocIncome', category: 'income', type: 'Salary Slips / ITR' },
        { id: 'applyDocBank', category: 'bank', type: '6-Month Bank Statement' },
        { id: 'applyDocCollateral', category: 'collateral', type: 'Collateral / Asset Deed' }
      ];

      for (const item of docInputs) {
        const inputEl = document.getElementById(item.id);
        if (inputEl && inputEl.files && inputEl.files.length > 0) {
          const file = inputEl.files[0];
          const formData = new FormData();
          formData.append('doc_category', item.category);
          formData.append('doc_type', item.type);
          formData.append('file', file);
          try {
            await api.uploadDocument(newLoan.id, formData);
          } catch (docErr) {
            console.error(`Failed to upload ${item.category} document:`, docErr);
          }
        }
      }

      Components.showToast('Application Submitted', 'Your loan application and attached verification documents have been submitted successfully.', 'success');
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

    let scheme = schemeName;
    if (!scheme) {
      const allLoans = (store.adminLoans || []).concat(store.userLoans || []).concat((typeof MOCK_DB !== 'undefined' ? MOCK_DB.loans : []));
      const found = allLoans.find(l => l.id === loanId);
      if (found && found.product_type) {
        scheme = Components.formatProductType(found.product_type);
      }
    }
    this.currentDocSchemeName = scheme || this.currentDocSchemeName || 'General Application';

    document.getElementById('docModalTitle').textContent = `Documents for Application #${loanId}`;
    document.getElementById('docModalSubtitle').textContent = `Scheme: ${this.currentDocSchemeName}`;
    
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

      // Disable categories that have already been uploaded (Prevent Duplicate Category Uploads)
      const uploadedCategories = new Set((docs || []).map(d => (d.doc_category || '').toLowerCase()));
      const select = document.getElementById('docCategorySelect');
      const uploadForm = document.getElementById('docUploadForm');
      
      let noticeContainer = document.getElementById('docUploadCompleteNotice');
      if (!noticeContainer && uploadForm && uploadForm.parentNode) {
        noticeContainer = document.createElement('div');
        noticeContainer.id = 'docUploadCompleteNotice';
        uploadForm.parentNode.insertBefore(noticeContainer, uploadForm);
      }

      if (select) {
        let availableCount = 0;
        Array.from(select.options).forEach(opt => {
          const isUploaded = uploadedCategories.has(opt.value.toLowerCase());
          const cleanLabel = opt.textContent.replace(/\s*—\s*Already Uploaded\s*✔/gi, '');
          if (isUploaded) {
            opt.disabled = true;
            opt.textContent = `${cleanLabel} — Already Uploaded ✔`;
          } else {
            opt.disabled = false;
            opt.textContent = cleanLabel;
            availableCount++;
          }
        });

        // Select first available non-disabled option
        const firstAvailable = Array.from(select.options).find(opt => !opt.disabled);
        if (firstAvailable) {
          select.value = firstAvailable.value;
        }

        if (availableCount === 0) {
          if (uploadForm) uploadForm.style.display = 'none';
          if (noticeContainer) {
            noticeContainer.innerHTML = `
              <div style="background: #E6F4F1; color: #00A896; border: 1px solid rgba(0, 168, 150, 0.3); border-radius: 12px; padding: 1rem; margin-bottom: 1.25rem; font-weight: 700; display: flex; align-items: center; gap: 0.75rem;">
                <i data-lucide="check-circle-2" style="width:24px; height:24px; flex-shrink:0;"></i>
                <div>
                  <div style="font-size: 0.95rem; font-weight: 800;">All Required Document Categories Uploaded!</div>
                  <div style="font-size: 0.8rem; opacity: 0.9; font-weight: 500;">All 5 document categories (KYC, Income, Bank, Loan Specific, Collateral) are attached.</div>
                </div>
              </div>
            `;
          }
        } else {
          if (uploadForm) uploadForm.style.display = this.isDocAdminMode ? 'none' : 'block';
          if (noticeContainer) noticeContainer.innerHTML = '';
        }
      }

      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      container.innerHTML = `<div class="empty-state">Failed to load documents: ${err.message}</div>`;
    }
  }

  async handleUploadDocument(event) {
    event.preventDefault();
    if (!this.currentDocLoanId) return;

    const fileInput = document.getElementById('docFileInput');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      Components.showToast('Select File', 'Please choose a document file to upload.', 'error');
      return;
    }

    const categorySelect = document.getElementById('docCategorySelect');
    const selectedOption = categorySelect.options[categorySelect.selectedIndex];
    if (selectedOption && selectedOption.disabled) {
      Components.showToast('Category Uploaded', 'This document category has already been uploaded for this loan.', 'warning');
      return;
    }

    const formData = new FormData();
    formData.append('doc_category', categorySelect.value);
    formData.append('doc_type', categorySelect.options[categorySelect.selectedIndex]?.text?.replace(/—.*$/g, '').trim() || categorySelect.value);
    formData.append('file', fileInput.files[0]);

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
    const userBtn = document.getElementById('btnRoleUser');
    const sysBtn = document.getElementById('btnRoleSystem');
    if (userBtn) userBtn.classList.add('active');
    if (sysBtn) sysBtn.classList.remove('active');

    document.getElementById('loginEmail').value = 'ravi@example.com';
    document.getElementById('loginPassword').value = 'Pass@123';
  }

  fillDemoAdmin() {
    const userBtn = document.getElementById('btnRoleUser');
    const sysBtn = document.getElementById('btnRoleSystem');
    if (userBtn) userBtn.classList.remove('active');
    if (sysBtn) sysBtn.classList.add('active');

    document.getElementById('loginEmail').value = 'admin@loanapp.com';
    document.getElementById('loginPassword').value = 'Admin@123';
  }

  /* ---------------- ADMIN UNDERWRITING ACTIONS ---------------- */

  async reviewLoan(loanId) {
    const targetId = Number(loanId);
    let loan = (store.adminLoans || []).find(l => Number(l.id) === targetId);
    if (!loan && typeof MOCK_DB !== 'undefined' && MOCK_DB.loans) {
      loan = MOCK_DB.loans.find(l => Number(l.id) === targetId);
    }
    if (!loan) {
      try {
        loan = await api.getLoanDetails(loanId);
      } catch (e) {}
    }
    if (loan) {
      this.openReviewModal(
        loan.id,
        loan.applicant_name || 'Applicant',
        Components.formatCurrency(loan.requested_amount),
        loan.requested_amount,
        loan.sanctioned_amount || loan.requested_amount,
        loan.interest_rate_offered || 10.5
      );
    } else {
      this.openReviewModal(
        loanId,
        'Applicant',
        'Requested Amount',
        500000,
        500000,
        10.5
      );
    }
  }

  async openReviewModal(loanId, applicantName, amountStr, reqAmount = 500000, sanctionedAmt = 500000, rate = 10.5) {
    this.currentReviewLoanId = loanId;
    document.getElementById('modalLoanIdTitle').textContent = `Review Loan Application #${loanId}`;
    document.getElementById('modalApplicantDesc').textContent = `${applicantName} — Requested ${amountStr}`;
    
    document.getElementById('adminSanctionAmount').value = sanctionedAmt || reqAmount;
    document.getElementById('adminInterestRate').value = rate || 10.5;
    document.getElementById('adminNoteInput').value = '';

    // Load applicant documents in review modal
    const docsContainer = document.getElementById('reviewLoanDocsList');
    const countBadge = document.getElementById('reviewDocsCountBadge');
    if (docsContainer) {
      docsContainer.innerHTML = '<div style="font-size:0.85rem; color:var(--text-muted); text-align:center;">Loading documents...</div>';
      try {
        const docs = await api.getDocuments(loanId);
        if (countBadge) countBadge.textContent = `${docs.length} Attached`;
        if (docs && docs.length > 0) {
          docsContainer.innerHTML = docs.map(d => {
            const docId = d.id || d.doc_id || 1;
            const fileName = d.original_filename || d.file_name || 'Document';
            const category = (d.doc_category || 'other').toUpperCase();
            const type = d.doc_type || '';
            const status = d.verification_status || d.status || 'pending';
            const isVerified = status === 'verified';
            const isRejected = status === 'rejected';

            return `
              <div style="display:flex; justify-content:space-between; align-items:center; padding: 0.6rem; border-bottom: 1px solid var(--border-color); gap: 0.5rem; background: rgba(255,255,255,0.03); border-radius: 6px; margin-bottom: 0.35rem;">
                <div style="display:flex; flex-direction:column; gap:2px; flex:1; min-width:0;">
                  <div style="font-size:0.85rem; font-weight:700; color: #FFFFFF; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${fileName}
                  </div>
                  <div style="font-size:0.75rem; color:#94A3B8;">
                    ${category} • ${type} • <span style="color:${isVerified ? '#00A896' : isRejected ? '#EF4444' : '#F59E0B'}; font-weight:700;">${status.toUpperCase()}</span>
                  </div>
                </div>
                <div style="display:flex; gap:0.35rem; align-items:center; flex-shrink:0;">
                  <button type="button" class="btn btn-sm btn-outline-primary" style="padding: 0.25rem 0.55rem; font-size: 0.75rem;" onclick="app.openDocumentPreviewModal(${loanId}, ${docId}, '${encodeURIComponent(fileName)}', '${category}', '${type}', '${status}')">
                    <i data-lucide="eye" class="lucide" style="margin-right: 0.25rem;"></i> View
                  </button>
                  ${(!isVerified && !isRejected) ? `
                    <button type="button" class="btn btn-sm btn-success" style="padding: 0.25rem 0.55rem; font-size: 0.75rem;" onclick="app.verifyDocumentAction(${loanId}, ${docId}, 'verified')" title="Verify Document"><i data-lucide="check" class="lucide"></i></button>
                    <button type="button" class="btn btn-sm btn-danger" style="padding: 0.25rem 0.55rem; font-size: 0.75rem;" onclick="app.verifyDocumentAction(${loanId}, ${docId}, 'rejected')" title="Reject Document"><i data-lucide="x" class="lucide"></i></button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('');
        } else {
          docsContainer.innerHTML = '<div style="font-size:0.85rem; color:var(--text-muted); text-align:center;">No documents uploaded yet.</div>';
        }
      } catch (e) {
        docsContainer.innerHTML = `<div style="font-size:0.85rem; color:var(--rose); text-align:center;">Failed to load documents: ${e.message}</div>`;
      }
    }

    this.showModal('reviewLoanModal');
    if (window.lucide) window.lucide.createIcons();
  }

  async handleApproveLoan() {
    if (!this.currentReviewLoanId) return;
    const loanId = this.currentReviewLoanId;
    const sanctionedAmount = Number(document.getElementById('adminSanctionAmount')?.value || 0);
    const interestRate = Number(document.getElementById('adminInterestRate')?.value || 10.5);
    const adminNote = document.getElementById('adminNoteInput')?.value || '';

    try {
      await api.approveLoan(loanId, {
        sanctioned_amount: sanctionedAmount,
        interest_rate_offered: interestRate,
        admin_note: adminNote
      });
      Components.showToast('Loan Approved', `Loan Application #${loanId} has been approved successfully.`, 'success');
      this.hideModal('reviewLoanModal');
      if (typeof this.loadAdminUsersDashboard === 'function') this.loadAdminUsersDashboard();
      if (typeof this.loadAdminDashboard === 'function') this.loadAdminDashboard();
    } catch (err) {
      Components.showToast('Approval Failed', err.message, 'error');
    }
  }

  async handleRejectLoan() {
    if (!this.currentReviewLoanId) return;
    const loanId = this.currentReviewLoanId;
    const adminNote = document.getElementById('adminNoteInput')?.value || '';

    try {
      await api.rejectLoan(loanId, adminNote);
      Components.showToast('Loan Rejected', `Loan Application #${loanId} has been rejected.`, 'info');
      this.hideModal('reviewLoanModal');
      if (typeof this.loadAdminUsersDashboard === 'function') this.loadAdminUsersDashboard();
      if (typeof this.loadAdminDashboard === 'function') this.loadAdminDashboard();
    } catch (err) {
      Components.showToast('Rejection Failed', err.message, 'error');
    }
  }

  /* ---------------- DOCUMENT PREVIEW & INSPECTION ---------------- */

  openDocumentPreviewModal(loanId, docId, encodedFileName, category, type, status) {
    const validDocId = parseInt(docId) || 1;
    const fileName = decodeURIComponent(encodedFileName || 'Document');
    this.currentPreviewDoc = { loanId, docId: validDocId, fileName, category, type, status };

    document.getElementById('previewDocTitle').textContent = fileName;
    document.getElementById('previewDocMeta').textContent = `Category: ${category} • Type: ${type} • Loan #${loanId}`;
    
    const statusBadge = document.getElementById('docPreviewStatusBadge');
    if (statusBadge) {
      statusBadge.innerHTML = Components.renderStatusBadge(status);
    }

    const noteInput = document.getElementById('docVerifyNoteInput');
    if (noteInput) noteInput.value = '';

    const container = document.getElementById('docViewerFrameContainer');
    const downloadBtn = document.getElementById('btnDownloadDocFromPreview');

    // Find actual doc in MOCK_DB or API URL
    const docObj = (typeof MOCK_DB !== 'undefined' && MOCK_DB.documents) ? MOCK_DB.documents.find(d => (d.doc_id === validDocId || d.id === validDocId)) : null;
    let fileUrl = docObj?.file_url;
    const downloadUrl = api.getDocumentDownloadUrl ? api.getDocumentDownloadUrl(loanId, validDocId) : `/admin/loans/${loanId}/documents/${validDocId}/download`;
    const viewUrl = api.getDocumentViewUrl ? api.getDocumentViewUrl(loanId, validDocId) : `/admin/loans/${loanId}/documents/${validDocId}/view`;

    if (downloadBtn) {
      downloadBtn.onclick = () => {
        if (fileUrl) {
          const a = document.createElement('a');
          a.href = fileUrl;
          a.download = fileName;
          a.click();
        } else {
          window.open(downloadUrl, '_blank');
        }
      };
    }

    const isImage = /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(fileName) || (fileUrl && fileUrl.startsWith('blob:'));

    if (fileUrl && isImage) {
      container.innerHTML = `
        <div style="width: 100%; height: 100%; min-height: 380px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); border-radius: 8px; padding: 1rem; overflow: auto;">
          <img src="${fileUrl}" alt="${fileName}" style="max-width: 100%; max-height: 480px; object-fit: contain; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
        </div>
      `;
    } else {
      // Clean Document View Certificate Template
      container.innerHTML = `
        <div style="width: 100%; max-width: 580px; margin: auto; background: #1E293B; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 2rem; color: #F8FAFC; text-align: center; box-shadow: 0 12px 32px rgba(0,0,0,0.35);">
          <div style="width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #072AC8 0%, #00A896 100%); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 1.25rem; box-shadow: 0 4px 16px rgba(7, 42, 200, 0.4);">
            <i data-lucide="file-check-2" style="width:32px; height:32px; color:#FFFFFF;"></i>
          </div>

          <h3 style="font-family:'Plus Jakarta Sans', sans-serif; font-weight: 800; font-size: 1.35rem; margin-bottom: 0.35rem; color: #FFFFFF;">${fileName}</h3>
          <div style="font-size: 0.85rem; color: #94A3B8; margin-bottom: 1.5rem;">
            Loan Application #${loanId} • Category: <strong style="color:#00A896;">${category}</strong>
          </div>

          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 1.25rem; text-align: left; margin-bottom: 1.5rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem; font-size: 0.85rem;">
              <span style="color: #94A3B8;">Document Type:</span>
              <strong style="color: #F8FAFC;">${type || 'Official Verification Proof'}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem; font-size: 0.85rem;">
              <span style="color: #94A3B8;">Verification Status:</span>
              <span>${Components.renderStatusBadge(status)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
              <span style="color: #94A3B8;">File Size:</span>
              <span style="color: #F8FAFC;">${docObj?.file_size || '1.8 MB'}</span>
            </div>
          </div>

          <div style="font-size: 0.8rem; color: #64748B;">
            🔐 Encrypted CrediWise Document Store • Verified Underwriter Access
          </div>
        </div>
      `;
    }

    const decisionToolbar = document.getElementById('docPreviewDecisionToolbar');
    const user = store.user;
    const isPending = (status === 'pending' || status === 'under_review' || !status);
    if (decisionToolbar) {
      decisionToolbar.style.display = (user && user.is_admin && isPending) ? 'flex' : 'none';
    }

    this.showModal('docPreviewModal');
    if (window.lucide) window.lucide.createIcons();
  }

  async decideDocFromPreview(status) {
    if (!this.currentPreviewDoc) return;
    const { loanId, docId } = this.currentPreviewDoc;
    const validDocId = parseInt(docId) || 1;
    const note = document.getElementById('docVerifyNoteInput').value.trim() || `Marked as ${status} by underwriter.`;

    try {
      await api.verifyDocument(loanId, validDocId, status, note);
      Components.showToast('Document Updated', `Document #${validDocId} has been marked as ${status.toUpperCase()}.`, 'success');
      this.hideModal('docPreviewModal');
      
      // Refresh documents in current review modal or document modal
      if (this.currentReviewLoanId === loanId) {
        this.openReviewModal(loanId, document.getElementById('modalApplicantDesc').textContent, '', document.getElementById('adminSanctionAmount').value, document.getElementById('adminSanctionAmount').value, document.getElementById('adminInterestRate').value);
      }
      if (this.currentDocLoanId === loanId) {
        this.openDocumentModal(loanId, '', this.isDocAdminMode);
      }
    } catch (err) {
      Components.showToast('Action Failed', err.message, 'error');
    }
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
      Components.showToast('Application Rejected', `Loan #${this.currentReviewLoanId} status updated to <i data-lucide="x-circle" class="lucide" style="color:var(--rose); margin-right: 0.25rem; vertical-align: -2px;"></i> Rejected.`, 'warning');
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
    if (modal) {
      modal.classList.add('active');
      modal.style.display = 'flex';
      modal.style.opacity = '1';
      modal.style.visibility = 'visible';
      document.body.style.overflow = 'hidden';
      if (window.lucide) window.lucide.createIcons();
    }
  }

  hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
      modal.style.opacity = '0';
      modal.style.visibility = 'hidden';
      document.body.style.overflow = '';
    }
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
window.app = null;
document.addEventListener('DOMContentLoaded', () => {
  app = new ApplicationController();
  window.app = app;
});
