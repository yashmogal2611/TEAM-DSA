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
        if (typeof window !== 'undefined' && window.app && window.app.updateStatusPill) {
          window.app.updateStatusPill();
        }
        return this.mockRequest(endpoint, options);
      }

      if (response.status === 401) {
        this.handleUnauthorized();
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
    await new Promise(r => setTimeout(r, 100)); // 100ms latency simulation
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body && typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);

    let currentUser = null;
    if (token) {
      const match = token.match(/user_(\d+)(?:_|$)/);
      if (match) {
        const uid = parseInt(match[1], 10);
        currentUser = MOCK_DB.users.find(u => u.id === uid);
      }
    }
    if (!currentUser && typeof store !== 'undefined' && store.user) {
      currentUser = MOCK_DB.users.find(u => 
        (store.user.id && u.id === store.user.id) || 
        (store.user.email && u.email && u.email.toLowerCase() === store.user.email.toLowerCase())
      );
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
      const name = topRec?.name || 'Top Ranked Institutional Lender';
      const rate = topRec?.interest_rate || 8.5;
      return {
        ai_summary: `Your top recommendation from ${name} offers competitive rates starting at ${rate}% per annum. Based on your financial profile, this product provides optimal affordability with maximum sanctioned limit.`
      };
    }

    // 1f. GenAI Phase 3: POST /chat
    if (endpoint === '/chat' && method === 'POST') {
      const q = (body?.question || '').toLowerCase();
      const topRec = body?.recommendation_context?.top_recommendations?.[0] || body?.recommendation_context?.recommendations?.[0];
      const topName = topRec?.lender_name || topRec?.name || 'Top Ranked Lender';
      const topRate = topRec?.personalised_rate || topRec?.interest_rate || 8.5;

      let answer = `Based on your credit assessment, our AI underwriting system recommends ${topName} as your best option.`;
      let source = "gemini";

      if (q.includes('rank') || q.includes('best') || q.includes('first') || q.includes('why') || q.includes('top') || q.includes('lender') || q.includes('bank')) {
        answer = `${topName} is ranked #1 because it offers the lowest personalised interest rate (${topRate}% p.a.) and the highest composite suitability score for your selected loan parameters.`;
      } else if (q.includes('emi') || q.includes('reduce') || q.includes('lower')) {
        answer = "You can lower your monthly EMI by choosing a longer tenure (e.g. 48 or 60 months) or prepaying existing credit card outstanding balances.";
      } else if (q.includes('doc') || q.includes('paper') || q.includes('require')) {
        answer = "Standard document requirements include PAN Card, Aadhaar Card, last 3 months salary slips, and 6 months bank statement.";
      } else if (q.includes('score') || q.includes('credit') || q.includes('cibil')) {
        answer = "Your credit score profile places you in a favorable risk band, unlocking prime rate discounts across our partner lenders.";
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
      const maxId = MOCK_DB.users.reduce((max, u) => Math.max(max, u.id || 0), 0);
      const newUser = {
        id: Math.max(maxId + 1, 100),
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

      // Generate Lender Product recommendations tailored by purpose and credit profile
      let lendersPool = [];
      const p = (purpose || 'personal_loan').toLowerCase();

      if (p === 'home_loan') {
        lendersPool = [
          { name: "State Bank of India (SBI)", code: "SBI", baseRate: 8.50, feePct: 0.35 },
          { name: "HDFC Bank", code: "HDFC", baseRate: 8.65, feePct: 0.50 },
          { name: "ICICI Bank", code: "ICICI", baseRate: 8.75, feePct: 0.50 },
          { name: "Axis Bank", code: "AXIS", baseRate: 8.85, feePct: 0.75 }
        ];
      } else if (p === 'vehicle_loan') {
        lendersPool = [
          { name: "Tata Capital", code: "TATA", baseRate: 8.75, feePct: 1.0 },
          { name: "ICICI Bank Auto", code: "ICICI", baseRate: 8.90, feePct: 1.25 },
          { name: "State Bank of India (SBI)", code: "SBI", baseRate: 9.10, feePct: 0.75 },
          { name: "HDFC Bank", code: "HDFC", baseRate: 9.20, feePct: 1.0 }
        ];
      } else if (p === 'education_loan') {
        lendersPool = [
          { name: "State Bank of India (SBI)", code: "SBI", baseRate: 8.15, feePct: 0.0 },
          { name: "HDFC Credila", code: "HDFC", baseRate: 8.95, feePct: 1.0 },
          { name: "Canara Bank", code: "CANARA", baseRate: 9.15, feePct: 0.5 },
          { name: "ICICI Bank", code: "ICICI", baseRate: 9.40, feePct: 1.0 }
        ];
      } else if (p === 'business_loan') {
        lendersPool = [
          { name: "Bajaj Finserv MSME", code: "BAJAJ", baseRate: 11.25, feePct: 2.0 },
          { name: "HDFC Bank Business", code: "HDFC", baseRate: 11.50, feePct: 1.75 },
          { name: "ICICI Bank", code: "ICICI", baseRate: 11.75, feePct: 2.0 },
          { name: "Kotak Mahindra Bank", code: "KOTAK", baseRate: 12.00, feePct: 2.25 }
        ];
      } else if (p === 'gold_loan') {
        lendersPool = [
          { name: "Muthoot Finance", code: "MUTHOOT", baseRate: 7.90, feePct: 0.25 },
          { name: "Manappuram Finance", code: "MANAPPURAM", baseRate: 8.10, feePct: 0.50 },
          { name: "State Bank of India (SBI)", code: "SBI", baseRate: 8.25, feePct: 0.50 },
          { name: "HDFC Bank Gold", code: "HDFC", baseRate: 8.50, feePct: 0.75 }
        ];
      } else {
        // Personal Loan
        if (creditScore >= 780) {
          lendersPool = [
            { name: "Kotak Mahindra Bank", code: "KOTAK", baseRate: 10.25, feePct: 1.5 },
            { name: "HDFC Bank", code: "HDFC", baseRate: 10.49, feePct: 1.5 },
            { name: "ICICI Bank", code: "ICICI", baseRate: 10.75, feePct: 2.0 },
            { name: "Axis Bank", code: "AXIS", baseRate: 10.99, feePct: 1.5 }
          ];
        } else {
          lendersPool = [
            { name: "State Bank of India (SBI)", code: "SBI", baseRate: 10.85, feePct: 1.0 },
            { name: "HDFC Bank", code: "HDFC", baseRate: 11.20, feePct: 1.5 },
            { name: "Tata Capital", code: "TATA", baseRate: 11.50, feePct: 1.75 },
            { name: "Bajaj Finserv", code: "BAJAJ", baseRate: 11.90, feePct: 2.0 }
          ];
        }
      }

      const recommendations = lendersPool.map((lender, index) => {
        const baseRate = lender.baseRate;
        const discount = (creditScore >= 780 ? 0.5 : creditScore >= 720 ? 0.2 : 0);
        const personalizedRate = Number(Math.max(6.5, baseRate - discount).toFixed(2));
        const r = personalizedRate / 12 / 100;
        const monthlyEmi = Number(((requestedAmt * r * Math.pow(1 + r, tenure)) / (Math.pow(1 + r, tenure) - 1)).toFixed(2));
        const feePct = lender.feePct;
        const feeAmount = Math.round(requestedAmt * (feePct / 100));
        const totalRepayment = Number((monthlyEmi * tenure + feeAmount).toFixed(2));
        const totalInterest = Number((totalRepayment - requestedAmt - feeAmount).toFixed(2));

        return {
          product_id: `${lender.code}_${p.substring(0, 4)}_${String(index + 1).padStart(2, '0')}`,
          product_name: `${lender.name} ${p.replace('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}`,
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
            composite: Number((0.95 - (index * 0.04)).toFixed(4))
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
