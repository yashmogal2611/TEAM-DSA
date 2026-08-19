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
      let response;
      try {
        const headers = options.isFormData
          ? { ...(options.auth !== false ? { 'Authorization': `Bearer ${localStorage.getItem(CONFIG.TOKEN_KEY)}` } : {}) }
          : { ...this.getHeaders(options.auth !== false), ...options.headers };

        response = await fetch(`${this.baseUrl}${endpoint}`, {
          ...options,
          headers
        });
      } catch (networkErr) {
        console.warn('Backend network connection failed. Operating in Mock Mode fallback.', networkErr);
        CONFIG.setMockMode(true);
        if (typeof window !== 'undefined' && window.app && window.app.updateApiStatusPill) {
          window.app.updateApiStatusPill();
        }
        return this.mockRequest(endpoint, options);
      }

      if (response.status === 401) {
        if (!endpoint.includes('/auth/login') && !endpoint.includes('/auth/admin-login')) {
          this.handleUnauthorized();
        }
        const errData = await response.json().catch(() => ({ detail: 'Unauthorized' }));
        throw new Error(errData.detail || 'Unauthorized (401)');
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || data.message || `HTTP error ${response.status}`);
      }
      return data;
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
    let currentUser = null;

    if (token) {
      // 1. Primary: Check logged-in user stored in active session
      try {
        const storedUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY));
        if (storedUser && storedUser.id) {
          currentUser = MOCK_DB.users.find(u => u.id === storedUser.id || (u.email && storedUser.email && u.email.toLowerCase() === storedUser.email.toLowerCase())) || storedUser;
          if (!MOCK_DB.users.some(u => u.id === currentUser.id)) {
            MOCK_DB.users.push(currentUser);
            MOCK_DB.save();
          }
        }
      } catch (e) {}

      // 2. Fallback: Parse user ID from mock token using exact regex matching
      if (!currentUser) {
        const tokenMatch = token.match(/user_(\d+)_mock_token/);
        const currentUserId = tokenMatch ? parseInt(tokenMatch[1], 10) : null;
        if (currentUserId) {
          currentUser = MOCK_DB.users.find(u => u.id === currentUserId) || null;
        }
      }
    }

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

    // 1d. GenAI Phase 1: POST /explanation
    if (endpoint === '/explanation' && method === 'POST') {
      const isApproved = body?.status === 'APPROVED';
      return {
        positive: [
          'Credit score of 780 is a strong positive factor for low interest rate offers.',
          'Monthly income provides healthy debt service coverage ratio.',
          'Clean employment record strengthens approval likelihood.'
        ],
        caution: [
          'Existing monthly EMI obligations slightly reduce maximum sanctioned limit.',
          'Active loan count is near standard policy threshold.'
        ],
        top_factors: [
          { feature: 'credit_score', impact: -0.32, direction: 'reduces_risk' },
          { feature: 'monthly_income', impact: -0.21, direction: 'reduces_risk' },
          { feature: 'existing_monthly_emi', impact: 0.14, direction: 'increases_risk' },
          { feature: 'number_of_active_loans', impact: 0.08, direction: 'increases_risk' }
        ],
        financial_explanation: `Based on your monthly income of ₹${(body?.affordability_summary?.monthly_income || 90000).toLocaleString('en-IN')}, your maximum affordable new EMI is ₹${(body?.affordability_summary?.max_affordable_new_emi || 35000).toLocaleString('en-IN')}/month.`,
        eligibility_explanation: isApproved ? 'You meet all standard credit policy criteria.' : 'One or more policy criteria failed validation.'
      };
    }

    // 1e. GenAI Phase 2: POST /summarize
    if (endpoint === '/summarize' && method === 'POST') {
      const topRec = body?.top_recommendations?.[0];
      const name = topRec?.name || 'HDFC Bank Personal Loan';
      const rate = topRec?.interest_rate || 9.5;
      return {
        ai_summary: `Your top recommendation from ${name} offers competitive rates starting at ${rate}% per annum. Based on your financial profile, this product provides optimal affordability with maximum sanctioned limit.`
      };
    }

    // 1f. GenAI Phase 3: POST /chat
    if (endpoint === '/chat' && method === 'POST') {
      const q = (body?.question || '').toLowerCase();
      let answer = "Based on your credit assessment, our AI underwriting system recommends comparing top offers based on total interest cost and monthly EMI affordability.";
      let source = "gemini";

      if (q.includes('rank') || q.includes('best') || q.includes('first') || q.includes('hdfc') || q.includes('why')) {
        answer = "HDFC Bank is ranked #1 because it offers the lowest personalised interest rate (9.5% p.a.) and the highest composite suitability score for your credit profile.";
      } else if (q.includes('emi') || q.includes('reduce') || q.includes('lower')) {
        answer = "You can lower your monthly EMI by choosing a longer tenure (e.g. 48 or 60 months) or prepaying existing credit card outstanding balances.";
      } else if (q.includes('doc') || q.includes('paper') || q.includes('require')) {
        answer = "Standard document requirements include PAN Card, Aadhaar Card, last 3 months salary slips, and 6 months bank statement.";
      } else if (q.includes('score') || q.includes('credit') || q.includes('cibil')) {
        answer = "Your credit score is 780, placing you in the Low Risk band, which unlocks prime rate discounts across all partner lenders.";
      }

      return {
        answer,
        source,
        grounded: true
      };
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

    // 3b. Auth: Admin 3-Factor Login POST /auth/admin-login
    if (endpoint === '/auth/admin-login' && method === 'POST') {
      const email = (body?.email || '').toLowerCase().trim();
      const password = body?.password;
      const passkey = (body?.bank_passkey || '').trim();

      // Platform Super Admin — no passkey required
      if (email === 'admin@loanapp.com') {
        if (password !== 'Admin@123') throw new Error('Invalid email or password (401)');
        const mockToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.super_admin_mock_token`;
        return {
          access_token: mockToken,
          token_type: 'bearer',
          is_admin: true,
          user_id: 1,
          email: email,
          full_name: 'Platform Super Admin',
          role: 'super_admin',
          bank_id: null,
          bank_name: 'All Financial Institutions',
          bank_code: 'ALL',
          is_super_admin: true
        };
      }

      const BANK_CREDENTIALS = {
        'sbi.admin@loanapp.com': { bank_code: 'SBI', bank_name: 'State Bank of India', bank_id: 1, passkey: 'SBI@Pass#2026' },
        'hdfc.admin@loanapp.com': { bank_code: 'HDFC', bank_name: 'HDFC Bank', bank_id: 2, passkey: 'HDFC@Pass#2026' },
        'icici.admin@loanapp.com': { bank_code: 'ICICI', bank_name: 'ICICI Bank', bank_id: 3, passkey: 'ICICI@Pass#2026' },
        'axis.admin@loanapp.com': { bank_code: 'AXIS', bank_name: 'Axis Bank', bank_id: 4, passkey: 'AXIS@Pass#2026' },
        'kotak.admin@loanapp.com': { bank_code: 'KOTAK', bank_name: 'Kotak Mahindra Bank', bank_id: 5, passkey: 'KOTAK@Pass#2026' },
        'bob.admin@loanapp.com': { bank_code: 'BOB', bank_name: 'Bank of Baroda', bank_id: 6, passkey: 'BOB@Pass#2026' },
        'union.admin@loanapp.com': { bank_code: 'UNION', bank_name: 'Union Bank of India', bank_id: 7, passkey: 'UNION@Pass#2026' },
        'tata.admin@loanapp.com': { bank_code: 'TATA', bank_name: 'Tata Capital', bank_id: 8, passkey: 'TATA@Pass#2026' },
        'bajaj.admin@loanapp.com': { bank_code: 'BAJAJ', bank_name: 'Bajaj Finance', bank_id: 9, passkey: 'BAJAJ@Pass#2026' },
        'muthoot.admin@loanapp.com': { bank_code: 'MUTHOOT', bank_name: 'Muthoot Finance', bank_id: 10, passkey: 'MUTHOOT@Pass#2026' },
        'lic.admin@loanapp.com': { bank_code: 'LIC', bank_name: 'LIC Housing Finance', bank_id: 11, passkey: 'LIC@Pass#2026' },
      };

      const bankInfo = BANK_CREDENTIALS[email];
      if (!bankInfo || password !== 'Admin@123') {
        throw new Error('Invalid email or password (401)');
      }
      if (!passkey || passkey !== bankInfo.passkey) {
        throw new Error(`Invalid institutional passkey for ${bankInfo.bank_name} (401)`);
      }

      const mockToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.admin_${bankInfo.bank_id}_mock_token`;
      return {
        access_token: mockToken,
        token_type: 'bearer',
        is_admin: true,
        user_id: 99 + bankInfo.bank_id,
        email: email,
        full_name: `${bankInfo.bank_name} Underwriter`,
        role: 'bank_admin',
        bank_id: bankInfo.bank_id,
        bank_name: bankInfo.bank_name,
        bank_code: bankInfo.bank_code,
        is_super_admin: false
      };
    }


    // 3c. Auth: Partner Banks GET /auth/banks
    if (endpoint === '/auth/banks' && method === 'GET') {
      return [
        { id: 1, bank_code: 'SBI', bank_name: 'State Bank of India', is_active: true },
        { id: 2, bank_code: 'HDFC', bank_name: 'HDFC Bank', is_active: true },
        { id: 3, bank_code: 'ICICI', bank_name: 'ICICI Bank', is_active: true },
        { id: 4, bank_code: 'KOTAK', bank_name: 'Kotak Mahindra Bank', is_active: true },
        { id: 5, bank_code: 'BOB', bank_name: 'Bank of Baroda', is_active: true }
      ];
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
        loan_purpose: ['home_loan', 'personal_loan', 'vehicle_loan', 'education_loan', 'business_loan', 'gold_loan', 'HOME_LOAN', 'PERSONAL_LOAN', 'VEHICLE_LOAN', 'EDUCATION_LOAN', 'BUSINESS_LOAN', 'GOLD_LOAN', 'HOME_RENOVATION', 'HOME_PURCHASE', 'HOME_CONSTRUCTION', 'MEDICAL', 'EDUCATION', 'TRAVEL', 'WEDDING', 'VEHICLE_PURCHASE', 'BUSINESS', 'DEBT_CONSOLIDATION', 'OTHER']
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
              `<i data-lucide="x-circle" class="lucide" style="color:var(--rose); margin-right: 0.4rem;"></i> ${rejectionCode}`,
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

      // Generate Category-Tailored Lender Product recommendations
      const SCHEME_LENDERS_MAP = {
        home_loan: [
          { name: "State Bank of India", code: "SBI", prodName: "SBI Regular Home Loan", baseRate: 8.50, feePct: 0.35 },
          { name: "HDFC Bank", code: "HDFC", prodName: "HDFC Reach Home Loan", baseRate: 8.65, feePct: 0.50 },
          { name: "LIC Housing Finance", code: "LIC", prodName: "LIC Griha Siddhi Home Loan", baseRate: 8.70, feePct: 0.25 }
        ],
        education_loan: [
          { name: "State Bank of India", code: "SBI", prodName: "SBI Student Education Loan", baseRate: 8.15, feePct: 0.0 },
          { name: "HDFC Credila", code: "HDFC_CREDILA", prodName: "HDFC Credila Higher Education Loan", baseRate: 8.95, feePct: 1.0 },
          { name: "Bank of Baroda", code: "BOB", prodName: "BOB Baroda Vidya Education Loan", baseRate: 8.85, feePct: 0.5 }
        ],
        vehicle_loan: [
          { name: "State Bank of India", code: "SBI", prodName: "SBI Car & Vehicle Loan", baseRate: 8.75, feePct: 0.5 },
          { name: "ICICI Bank", code: "ICICI", prodName: "ICICI Bank Auto Finance", baseRate: 8.85, feePct: 0.5 },
          { name: "Kotak Mahindra Bank", code: "KOTAK", prodName: "Kotak Drive Auto Loan", baseRate: 8.90, feePct: 0.75 }
        ],
        gold_loan: [
          { name: "Muthoot Finance", code: "MUTHOOT", prodName: "Muthoot Gold Power Loan", baseRate: 9.00, feePct: 0.5 },
          { name: "State Bank of India", code: "SBI", prodName: "SBI Gold Loan Scheme", baseRate: 9.15, feePct: 0.25 },
          { name: "HDFC Bank", code: "HDFC", prodName: "HDFC Sampoorna Gold Loan", baseRate: 9.30, feePct: 0.5 }
        ],
        business_loan: [
          { name: "State Bank of India", code: "SBI", prodName: "SBI SME Business Growth Loan", baseRate: 11.50, feePct: 1.0 },
          { name: "HDFC Bank", code: "HDFC", prodName: "HDFC Business Enterprise Loan", baseRate: 11.75, feePct: 1.5 },
          { name: "MUDRA", code: "MUDRA", prodName: "MUDRA Tarun Scheme", baseRate: 11.00, feePct: 0.5 }
        ],
        personal_loan: [
          { name: "HDFC Bank", code: "HDFC", prodName: "HDFC Express Personal Loan", baseRate: 10.50, feePct: 1.5 },
          { name: "State Bank of India", code: "SBI", prodName: "SBI Xpress Credit", baseRate: 10.75, feePct: 1.0 },
          { name: "ICICI Bank", code: "ICICI", prodName: "ICICI Instant Personal Loan", baseRate: 10.99, feePct: 1.5 }
        ]
      };

      const normPurpose = (purpose || "personal_loan").toLowerCase();
      const matchedKey = Object.keys(SCHEME_LENDERS_MAP).find(k => normPurpose.includes(k.replace('_loan', ''))) || 'personal_loan';
      const lenders = SCHEME_LENDERS_MAP[matchedKey] || SCHEME_LENDERS_MAP.personal_loan;

      const recommendations = lenders.map((lender, index) => {
        const baseRate = lender.baseRate;
        const discount = creditScore >= 780 ? 0.6 : creditScore >= 720 ? 0.2 : 0;
        const personalizedRate = Number((Math.max(6.0, baseRate - discount)).toFixed(2));
        const r = personalizedRate / 12 / 100;
        const monthlyEmi = Number(((requestedAmt * r * Math.pow(1 + r, tenure)) / (Math.pow(1 + r, tenure) - 1)).toFixed(2));
        const feePct = lender.feePct;
        const feeAmount = Math.round(requestedAmt * (feePct / 100));
        const totalRepayment = Number((monthlyEmi * tenure + feeAmount).toFixed(2));
        const totalInterest = Number((totalRepayment - requestedAmt - feeAmount).toFixed(2));

        return {
          product_id: `${lender.code}_${matchedKey.substring(0, 4).toUpperCase()}_${String(index + 1).padStart(2, '0')}`,
          product_name: lender.prodName,
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
            `<i data-lucide="check" class="lucide" style="color:var(--emerald); margin-right: 0.4rem;"></i> Covers your full requested amount of ₹${requestedAmt.toLocaleString('en-IN')}.`,
            `<i data-lucide="check" class="lucide" style="color:var(--emerald); margin-right: 0.4rem;"></i> Low total interest cost of ₹${recommendations[0].total_interest.toLocaleString('en-IN')}.`,
            `<i data-lucide="check" class="lucide" style="color:var(--emerald); margin-right: 0.4rem;"></i> Competitive personalized interest rate starting at ${recommendations[0].personalised_rate}% p.a.`
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
      return MOCK_DB.loans.filter(l => l.user_id === currentUser.id || (l.applicant_email && currentUser.email && l.applicant_email.toLowerCase() === currentUser.email.toLowerCase()));
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
      const newId = (MOCK_DB.documents.length + 1) * 101;
      
      const formData = options.body || options.formData;
      const category = formData?.get ? (formData.get('doc_category') || 'kyc') : 'kyc';
      const fileObj = formData?.get ? formData.get('file') : null;
      const fileName = fileObj?.name || (typeof fileObj === 'string' ? fileObj : 'uploaded_document.pdf');
      const fileSize = fileObj?.size ? (fileObj.size / 1024).toFixed(1) + ' KB' : '1.8 MB';

      const typeLabels = {
        'kyc': 'KYC Proof (PAN / Aadhaar / Passport)',
        'income': 'Income Proof (Salary Slips / ITR)',
        'bank': 'Bank Account Statement (6 Months)',
        'loan_specific': 'Loan Specific Agreement / Admission Letter',
        'collateral': 'Collateral Deed / Appraisal Document'
      };

      const doc = {
        id: newId,
        doc_id: newId,
        loan_id: loanId,
        doc_category: category,
        doc_type: typeLabels[category] || 'Verification Document',
        file_name: fileName,
        original_filename: fileName,
        file_size: fileSize,
        file_url: (fileObj && typeof fileObj === 'object' && typeof URL !== 'undefined') ? URL.createObjectURL(fileObj) : null,
        status: 'pending',
        verification_status: 'pending',
        verification_note: 'Awaiting Underwriter Review',
        uploaded_at: new Date().toISOString().split('T')[0]
      };
      MOCK_DB.documents.push(doc);
      MOCK_DB.save();
      return doc;
    }

    // 12. Documents: List GET /loans/{id}/documents & GET /admin/loans/{id}/documents
    if ((endpoint.match(/\/loans\/\d+\/documents$/) || endpoint.match(/\/admin\/loans\/\d+\/documents$/)) && method === 'GET') {
      const parts = endpoint.split('/');
      const loanId = parseInt(parts[parts.length - 2]);
      return MOCK_DB.documents.filter(d => d.loan_id === loanId);
    }

    // 13. Documents: Delete DELETE /loans/{id}/documents/{doc_id}
    if (endpoint.match(/\/loans\/\d+\/documents\/\d+$/) && method === 'DELETE') {
      const parts = endpoint.split('/');
      const docId = parseInt(parts[4]);
      MOCK_DB.documents = MOCK_DB.documents.filter(d => (d.doc_id !== docId && d.id !== docId));
      MOCK_DB.save();
      return { success: true, message: 'Document deleted' };
    }

    // 14. Admin: List Loans GET /admin/loans (supports ?status=&bank_id= for super admin)
    if (endpoint.startsWith('/admin/loans') && !endpoint.match(/\/admin\/loans\/\d+/) && method === 'GET') {
      if (!currentUser || !currentUser.is_admin) throw new Error('Not authorized as admin (403)');
      const urlParams = new URL(`http://dummy${endpoint}`).searchParams;
      const statusFilter = urlParams.get('status');
      const bankIdFilter = urlParams.get('bank_id') ? parseInt(urlParams.get('bank_id')) : null;

      const isSuperAdmin = currentUser.is_super_admin || currentUser.role === 'super_admin' || currentUser.bank_code === 'ALL';

      let loans = MOCK_DB.loans;
      if (!isSuperAdmin) {
        // Strict bank-scoped filter for bank admins
        const bankCode = currentUser.bank_code || '';
        const bankName = currentUser.bank_name || '';
        loans = loans.filter(l => !l.bank_name || l.bank_name.toLowerCase().includes(bankCode.toLowerCase()) || bankName.toLowerCase().includes((l.bank_name || '').toLowerCase()));
      } else if (bankIdFilter !== null) {
        // Super admin filtering by specific bank
        loans = loans.filter(l => l.bank_id === bankIdFilter || (l.bank_id == null && bankIdFilter === 1));
      }

      if (statusFilter) loans = loans.filter(l => l.status === statusFilter);
      return loans;
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
    if (endpoint.match(/\/admin\/loans\/\d+\/documents\/\d+\/verify/) && (method === 'PATCH' || method === 'POST')) {
      if (!currentUser || !currentUser.is_admin) throw new Error('Not an admin (403)');
      const parts = endpoint.split('/');
      const docId = parseInt(parts[5]);
      const doc = MOCK_DB.documents.find(d => (d.doc_id === docId || d.id === docId));
      if (!doc) throw new Error('Document not found (404)');

      doc.status = body?.status || body?.verification_status || 'verified';
      doc.verification_status = doc.status;
      doc.verification_note = body?.verification_note || 'Verified by admin';
      MOCK_DB.save();
      return doc;
    }

    // 18. Admin: Stats GET /admin/stats (supports ?bank_id= for super admin)
    if (endpoint.startsWith('/admin/stats') && !endpoint.includes('/schemes') && method === 'GET') {
      if (!currentUser || !currentUser.is_admin) throw new Error('Not an admin (403)');
      const isSuperAdmin = currentUser.is_super_admin || currentUser.role === 'super_admin' || currentUser.bank_code === 'ALL';
      const urlParams = new URL(`http://dummy${endpoint}`).searchParams;
      const bankIdFilter = urlParams.get('bank_id') ? parseInt(urlParams.get('bank_id')) : null;

      let bankName, bankCode, bankId;

      if (isSuperAdmin && bankIdFilter !== null) {
        // Scoped to a specific bank selected via dropdown
        const MOCK_BANKS = [
          { id: 1, bank_code: 'SBI', bank_name: 'State Bank of India' },
          { id: 2, bank_code: 'HDFC', bank_name: 'HDFC Bank' },
          { id: 3, bank_code: 'ICICI', bank_name: 'ICICI Bank' },
          { id: 4, bank_code: 'AXIS', bank_name: 'Axis Bank' },
          { id: 5, bank_code: 'KOTAK', bank_name: 'Kotak Mahindra Bank' },
          { id: 6, bank_code: 'BOB', bank_name: 'Bank of Baroda' },
        ];
        const foundBank = MOCK_BANKS.find(b => b.id === bankIdFilter);
        bankName = foundBank ? foundBank.bank_name : 'Unknown Bank';
        bankCode = foundBank ? foundBank.bank_code : 'UNK';
        bankId = bankIdFilter;
      } else if (isSuperAdmin) {
        bankName = 'All Financial Institutions';
        bankCode = 'ALL';
        bankId = null;
      } else {
        bankName = currentUser.bank_name || 'State Bank of India';
        bankCode = currentUser.bank_code || 'SBI';
        bankId = currentUser.bank_id || 1;
      }

      let scopedLoans = MOCK_DB.loans;
      if (!isSuperAdmin) {
        scopedLoans = scopedLoans.filter(l => !l.bank_name || l.bank_name.toLowerCase().includes(bankCode.toLowerCase()) || bankName.toLowerCase().includes((l.bank_name || '').toLowerCase()));
      } else if (isSuperAdmin && bankIdFilter !== null) {
        scopedLoans = scopedLoans.filter(l => l.bank_id === bankIdFilter || (l.bank_id == null && bankIdFilter === 1));
      }

      const schemesBreakdown = [
        {
          scheme_name: `${bankName} Regular Scheme`,
          total_applications: scopedLoans.length || 1,
          pending_count: scopedLoans.filter(l => l.status === 'pending').length,
          under_review_count: scopedLoans.filter(l => l.status === 'under_review').length,
          approved_count: scopedLoans.filter(l => l.status === 'approved').length,
          rejected_count: scopedLoans.filter(l => l.status === 'rejected').length,
          approval_rate: scopedLoans.length ? Math.round((scopedLoans.filter(l => l.status === 'approved').length / scopedLoans.length) * 100) : 0,
          total_requested_volume: scopedLoans.reduce((s, l) => s + (l.requested_amount || 0), 0) || 5000000,
          total_sanctioned_volume: scopedLoans.reduce((s, l) => s + (l.sanctioned_amount || 0), 0),
          avg_ticket_size: scopedLoans.length ? Math.round(scopedLoans.reduce((s, l) => s + (l.requested_amount || 0), 0) / scopedLoans.length) : 0
        }
      ];

      return {
        total_applications: scopedLoans.length,
        pending: scopedLoans.filter(l => l.status === 'pending').length,
        under_review: scopedLoans.filter(l => l.status === 'under_review').length,
        approved: scopedLoans.filter(l => l.status === 'approved').length,
        rejected: scopedLoans.filter(l => l.status === 'rejected').length,
        total_users: MOCK_DB.users.filter(u => !u.is_admin).length,
        total_documents: MOCK_DB.documents ? MOCK_DB.documents.length : 0,
        bank_id: bankId,
        bank_name: bankName,
        bank_code: bankCode,
        applications_by_type: { personal_loan: 0, home_loan: 0, vehicle_loan: 0, education_loan: 0, business_loan: 0, gold_loan: 0 },
        total_requested_volume: scopedLoans.reduce((s, l) => s + (l.requested_amount || 0), 0),
        total_approved_volume: scopedLoans.reduce((s, l) => s + (l.sanctioned_amount || 0), 0),
        schemes_breakdown: schemesBreakdown
      };
    }

    // 18b. Admin: Schemes Breakdown GET /admin/stats/schemes
    if (endpoint.startsWith('/admin/stats/schemes') && method === 'GET') {
      if (!currentUser || !currentUser.is_admin) throw new Error('Not an admin (403)');
      const bankName = currentUser.bank_name || 'State Bank of India';
      const bankCode = currentUser.bank_code || 'SBI';
      const isSuperAdmin = currentUser.is_super_admin || currentUser.role === 'super_admin' || currentUser.bank_code === 'ALL';
      const scopedLoans = isSuperAdmin ? MOCK_DB.loans : MOCK_DB.loans.filter(l => !l.bank_name || l.bank_name.toLowerCase().includes(bankCode.toLowerCase()) || bankName.toLowerCase().includes((l.bank_name || '').toLowerCase()));
      return [
        {
          scheme_name: `${isSuperAdmin ? 'All Financial Institutions' : bankName} Regular Scheme`,
          total_applications: scopedLoans.length || 1,
          pending_count: scopedLoans.filter(l => l.status === 'pending').length,
          under_review_count: 0,
          approved_count: scopedLoans.filter(l => l.status === 'approved').length,
          rejected_count: scopedLoans.filter(l => l.status === 'rejected').length,
          approval_rate: scopedLoans.length ? Math.round((scopedLoans.filter(l => l.status === 'approved').length / scopedLoans.length) * 100) : 0,
          total_requested_volume: scopedLoans.reduce((s, l) => s + (l.requested_amount || 0), 0) || 5000000,
          total_sanctioned_volume: scopedLoans.reduce((s, l) => s + (l.sanctioned_amount || 0), 0),
          avg_ticket_size: scopedLoans.length ? Math.round(scopedLoans.reduce((s, l) => s + (l.requested_amount || 0), 0) / scopedLoans.length) : 0
        }
      ];
    }

    // 18c. Admin: Banks Directory GET /admin/banks (Super Admin only)
    if (endpoint === '/admin/banks' && method === 'GET') {
      if (!currentUser || !currentUser.is_admin) throw new Error('Not an admin (403)');
      const isSuperAdmin = currentUser.is_super_admin || currentUser.role === 'super_admin' || currentUser.bank_code === 'ALL';
      if (!isSuperAdmin) throw new Error('Super Admin access required (403)');
      return [
        { id: 1, bank_code: 'SBI', bank_name: 'State Bank of India', is_active: true, total_applications: MOCK_DB.loans.filter(l => !l.bank_name || l.bank_name.includes('SBI') || l.bank_name.includes('State Bank')).length, pending_count: MOCK_DB.loans.filter(l => l.status === 'pending' && (!l.bank_name || l.bank_name.includes('SBI') || l.bank_name.includes('State Bank'))).length },
        { id: 2, bank_code: 'HDFC', bank_name: 'HDFC Bank', is_active: true, total_applications: MOCK_DB.loans.filter(l => l.bank_name && l.bank_name.includes('HDFC')).length, pending_count: MOCK_DB.loans.filter(l => l.status === 'pending' && l.bank_name && l.bank_name.includes('HDFC')).length },
        { id: 3, bank_code: 'ICICI', bank_name: 'ICICI Bank', is_active: true, total_applications: MOCK_DB.loans.filter(l => l.bank_name && l.bank_name.includes('ICICI')).length, pending_count: 0 },
        { id: 4, bank_code: 'AXIS', bank_name: 'Axis Bank', is_active: true, total_applications: MOCK_DB.loans.filter(l => l.bank_name && l.bank_name.includes('Axis')).length, pending_count: 0 },
        { id: 5, bank_code: 'KOTAK', bank_name: 'Kotak Mahindra Bank', is_active: true, total_applications: MOCK_DB.loans.filter(l => l.bank_name && l.bank_name.includes('Kotak')).length, pending_count: 0 },
        { id: 6, bank_code: 'BOB', bank_name: 'Bank of Baroda', is_active: true, total_applications: MOCK_DB.loans.filter(l => l.bank_name && l.bank_name.includes('Baroda')).length, pending_count: 0 },
        { id: 7, bank_code: 'UNION', bank_name: 'Union Bank of India', is_active: true, total_applications: 0, pending_count: 0 },
        { id: 8, bank_code: 'TATA', bank_name: 'Tata Capital', is_active: true, total_applications: MOCK_DB.loans.filter(l => l.bank_name && l.bank_name.includes('Tata')).length, pending_count: 0 },
        { id: 9, bank_code: 'BAJAJ', bank_name: 'Bajaj Finance', is_active: true, total_applications: MOCK_DB.loans.filter(l => l.bank_name && l.bank_name.includes('Bajaj')).length, pending_count: 0 },
        { id: 10, bank_code: 'MUTHOOT', bank_name: 'Muthoot Finance', is_active: true, total_applications: MOCK_DB.loans.filter(l => l.bank_name && l.bank_name.includes('Muthoot')).length, pending_count: 0 },
        { id: 11, bank_code: 'LIC', bank_name: 'LIC Housing Finance', is_active: true, total_applications: MOCK_DB.loans.filter(l => l.bank_name && l.bank_name.includes('LIC')).length, pending_count: 0 },
      ];
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

  async recommendLoans(inputs) {
    try {
      return await this.request('/api/v1/recommend', { method: 'POST', body: JSON.stringify(inputs), auth: false });
    } catch (err) {
      console.warn('ML recommend API unavailable, using resilient fallback calculation:', err);
      return this.mockRequest('/api/v1/recommend', { method: 'POST', body: JSON.stringify(inputs) });
    }
  }

  checkEligibility(inputs) {
    return this.recommendLoans(inputs);
  }

  explainRecommendation(recommendationResponse) {
    return this.request('/explanation', {
      method: 'POST',
      body: JSON.stringify(recommendationResponse),
      auth: false
    });
  }

  summarizeRecommendation(recommendationResponse) {
    const topRecs = (recommendationResponse?.recommendations || []).map(r => ({
      name: r.product_name || r.lender_name || 'Loan Offer',
      score: r.scores ? r.scores.composite : (r.score || 0.85),
      interest_rate: r.personalised_rate || r.estimated_interest_rate || 10.5,
      emi_ratio: r.monthly_emi ? (r.monthly_emi / (recommendationResponse.affordability_summary?.monthly_income || 90000)) : 0.25,
      reasons: recommendationResponse.explanation?.offer_reasons || []
    }));

    return this.request('/summarize', {
      method: 'POST',
      body: JSON.stringify({ top_recommendations: topRecs }),
      auth: false
    });
  }

  chatWithBot(question, recommendationContext) {
    return this.request('/chat', {
      method: 'POST',
      body: JSON.stringify({
        question,
        recommendation_context: recommendationContext
      }),
      auth: false
    });
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
    if (this.isBankAdminSession && this.isBankAdminSession()) {
      return this.request(`/admin/loans/${loanId}/documents`);
    }
    return this.request(`/loans/${loanId}/documents`);
  }

  deleteDocument(loanId, docId) {
    return this.request(`/loans/${loanId}/documents/${docId}`, { method: 'DELETE' });
  }

  getAdminLoans(status = '', bankId = null) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (bankId !== null && bankId !== undefined) params.set('bank_id', bankId);
    const query = params.toString() ? `?${params.toString()}` : '';
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
      body: JSON.stringify({ verification_status: status, status, verification_note: note })
    });
  }

  adminLogin(credentials) {
    return this.request('/auth/admin-login', { method: 'POST', body: JSON.stringify(credentials), auth: false });
  }

  getPartnerBanks() {
    return this.request('/auth/banks', { auth: false });
  }

  getAdminStats(bankId = null) {
    const query = bankId !== null && bankId !== undefined ? `?bank_id=${bankId}` : '';
    return this.request(`/admin/stats${query}`);
  }

  getAdminSchemeStats(bankId = null) {
    const query = bankId !== null && bankId !== undefined ? `?bank_id=${bankId}` : '';
    return this.request(`/admin/stats/schemes${query}`);
  }

  getAdminBanks() {
    return this.request('/admin/banks');
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
