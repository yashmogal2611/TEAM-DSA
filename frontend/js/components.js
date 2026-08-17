/**
 * UI Components & HTML Renderers
 * ApexLoans — Soft & Subtle Aesthetic Beige Palette
 */
const Components = {
  renderStatusBadge(status) {
    switch (status) {
      case 'pending':
      case 'under_review':
        return `<span class="status-badge pending"><i data-lucide="clock"></i> Under Review</span>`;
      case 'approved':
        return `<span class="status-badge approved"><i data-lucide="check-circle-2"></i> Approved</span>`;
      case 'rejected':
        return `<span class="status-badge rejected"><i data-lucide="x-circle"></i> Rejected</span>`;
      case 'verified':
        return `<span class="status-badge approved"><i data-lucide="shield-check"></i> Verified</span>`;
      default:
        return `<span class="status-badge">${status}</span>`;
    }
  },

  renderProgressStepper(status) {
    if (status === 'rejected') {
      return `
        <div class="app-progress-stepper">
          <span class="step-pill done">1. Applied</span>
          <span class="step-arrow">→</span>
          <span class="step-pill" style="background:var(--rose-bg); color:var(--rose);">Rejected</span>
        </div>
      `;
    }

    const isPending = (status === 'pending' || status === 'under_review');
    const isApproved = (status === 'approved');

    return `
      <div class="app-progress-stepper">
        <span class="step-pill done">1. Applied</span>
        <span class="step-arrow">→</span>
        <span class="step-pill ${isPending ? 'current' : 'done'}">2. Review</span>
        <span class="step-arrow">→</span>
        <span class="step-pill ${isApproved ? 'done' : ''}">3. Sanction</span>
      </div>
    `;
  },

  formatCurrency(amount) {
    if (amount === null || amount === undefined) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  },

  formatDate(dateString) {
    if (!dateString) return '—';
    const d = new Date(dateString);
    return d.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  },

  formatProductType(productType) {
    return (productType || '').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  },

  formatCategoryDetails(loan) {
    if (!loan) return '—';
    switch (loan.product_type) {
      case 'home_loan':
        return loan.property_location ? `<i data-lucide="map-pin"></i> ${loan.property_location}` : (loan.purpose || 'Residential Property');
      case 'vehicle_loan':
        return loan.vehicle_make_model ? `<i data-lucide="car"></i> ${loan.vehicle_make_model}` : (loan.purpose || 'Vehicle Purchase');
      case 'business_loan':
        return loan.business_name ? `<i data-lucide="building-2"></i> ${loan.business_name}` : (loan.purpose || 'MSME Expansion');
      case 'education_loan':
        return loan.university_name ? `<i data-lucide="graduation-cap"></i> ${loan.university_name}` : (loan.purpose || 'Higher Studies');
      case 'gold_loan':
        return loan.gold_weight_grams ? `<i data-lucide="sparkles"></i> ${loan.gold_weight_grams}g (${loan.gold_purity_karats || 22}K Gold)` : (loan.purpose || 'Gold Pledge');
      default:
        return loan.purpose || 'Personal Financing';
    }
  },

  renderHomeUserWelcomeBanner(user) {
    if (!user) return '';
    const initials = (user.full_name || 'U').trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().substring(0, 2);
    const roleText = user.is_admin ? 'System Administrator' : 'Verified Borrower';

    return `
      <div class="user-home-welcome-card">
        <div class="welcome-card-content">
          <div class="welcome-user-info">
            <div class="welcome-avatar">${initials}</div>
            <div>
              <div class="welcome-greeting">Welcome back, ${user.full_name}! 👋</div>
              <div class="welcome-role"><i data-lucide="${user.is_admin ? 'shield' : 'check-circle-2'}"></i> ${roleText} • ${user.email}</div>
            </div>
          </div>
          <div class="welcome-actions">
            ${user.is_admin ? `
              <a href="#/admin-dashboard" class="btn btn-primary"><i data-lucide="shield"></i> Open Admin Control Board →</a>
            ` : `
              <a href="#/user-dashboard" class="btn btn-primary"><i data-lucide="layout-dashboard"></i> View My Applications →</a>
              <button class="btn btn-secondary" onclick="app.showModal('applyLoanModal')"><i data-lucide="plus"></i> New Application</button>
            `}
          </div>
        </div>
        
        <!-- Welcome Hero Banner Feature Card -->
        <div class="welcome-banner-img-box">
          <div class="crediwise-intel-badge-card">
            <div class="intel-badge-header">
              <span class="intel-sparkle-icon"><i data-lucide="sparkles"></i></span>
              <span class="intel-brand-title">CrediWise Intelligence</span>
            </div>
            <div class="intel-badge-subtitle">Smart loan recommendations, tailored to your financial goals.</div>
          </div>
        </div>
      </div>
    `;
  },

  getLoanTypeIcon(type) {
    switch(type) {
      case 'home_loan': return 'home';
      case 'personal_loan': return 'user';
      case 'vehicle_loan': return 'car';
      case 'education_loan': return 'graduation-cap';
      case 'business_loan': return 'briefcase';
      case 'gold_loan': return 'coins';
      default: return 'credit-card';
    }
  },

  getLoanTypeImage(type) {
    switch(type) {
      case 'home_loan': return 'assets/images/personal_loan.jpg';
      case 'personal_loan': return 'assets/images/personal_loan.jpg';
      case 'vehicle_loan': return 'assets/images/vehicle_loan.jpg';
      case 'education_loan': return 'assets/images/education_loan.jpg';
      case 'business_loan': return 'assets/images/business_loan.jpg';
      case 'gold_loan': return 'assets/images/gold_loan.jpg';
      default: return 'assets/images/loan_home_banner.jpg';
    }
  },

  renderSchemesGrid(schemes, selectedType = null) {
    if (!schemes || schemes.length === 0) return `<div class="empty-state">No loan schemes found.</div>`;

    const loanTypes = [
      { id: 'all', label: 'All 6 Schemes', icon: 'layers' },
      { id: 'home_loan', label: 'Home Loan', icon: 'home' },
      { id: 'personal_loan', label: 'Personal Loan', icon: 'user' },
      { id: 'vehicle_loan', label: 'Vehicle Loan', icon: 'car' },
      { id: 'education_loan', label: 'Education Loan', icon: 'graduation-cap' },
      { id: 'business_loan', label: 'Business Loan', icon: 'briefcase' },
      { id: 'gold_loan', label: 'Gold Loan', icon: 'coins' }
    ];

    const currentFilter = selectedType || 'all';

    // If specific loan type is selected, render individual detail view
    const filteredSchemes = (currentFilter === 'all') 
      ? schemes 
      : schemes.filter(s => s.loan_type === currentFilter);

    const isSingleView = (currentFilter !== 'all' && filteredSchemes.length === 1);
    const singleScheme = isSingleView ? filteredSchemes[0] : null;

    return `
      <div class="schemes-page-wrapper">
        <!-- Filter Tabs Toolbar -->
        <div class="schemes-filter-tabs">
          ${loanTypes.map(t => `
            <button class="scheme-filter-btn ${currentFilter === t.id ? 'active' : ''}" onclick="app.selectSchemeType('${t.id}')">
              <i data-lucide="${t.icon}"></i> ${t.label}
            </button>
          `).join('')}
        </div>

        ${singleScheme ? `
          <!-- INDIVIDUAL DEDICATED LOAN DETAIL PAGE -->
          <div class="single-loan-detail-page">
            <div class="loan-detail-hero">
              <div class="hero-left">
                <div class="detail-badge"><i data-lucide="${this.getLoanTypeIcon(singleScheme.loan_type)}"></i> RBI Compliant Credit Scheme</div>
                <h1>${singleScheme.display_name}</h1>
                <p class="hero-desc">${singleScheme.description}</p>
                <div class="rate-highlight-banner">
                  <div class="r-badge">Interest Rates</div>
                  <div class="r-val">${singleScheme.interest_rate_min}% - ${singleScheme.interest_rate_max}% <span>p.a.</span></div>
                </div>
                <div class="hero-cta-group">
                  <button class="btn btn-primary" onclick="app.fillSchemeAndApply('${singleScheme.loan_type}')">
                    Apply Under ${singleScheme.display_name} <i data-lucide="arrow-right"></i>
                  </button>
                  <a href="#/eligibility" class="btn btn-secondary"><i data-lucide="calculator"></i> Calculate Eligibility</a>
                </div>
              </div>

              <!-- Featured Image Box for Individual Loan Page -->
              <div class="hero-right-img-box">
                <img src="${this.getLoanTypeImage(singleScheme.loan_type)}" alt="${singleScheme.display_name}" class="loan-hero-img" id="loanImg_${singleScheme.loan_type}" onerror="this.parentElement.classList.add('img-fallback');" />
                <div class="img-caption">${singleScheme.display_name} — High Value Financing</div>
              </div>
            </div>

            <!-- Key Metric Cards Grid -->
            <div class="detail-metrics-grid">
              <div class="metric-card">
                <div class="m-icon"><i data-lucide="banknote"></i></div>
                <div class="m-title">Loan Amount Range</div>
                <div class="m-value">${this.formatCurrency(singleScheme.min_amount)} – ${this.formatCurrency(singleScheme.max_amount)}</div>
              </div>
              <div class="metric-card">
                <div class="m-icon"><i data-lucide="calendar"></i></div>
                <div class="m-title">Tenure Horizon</div>
                <div class="m-value">${singleScheme.min_tenure_months} – ${singleScheme.max_tenure_months} Months</div>
              </div>
              <div class="metric-card">
                <div class="m-icon"><i data-lucide="percent"></i></div>
                <div class="m-title">Annual Interest Rate</div>
                <div class="m-value">${singleScheme.interest_rate_min}% – ${singleScheme.interest_rate_max}% p.a.</div>
              </div>
            </div>

            <!-- Document Checklist & Policy Guidelines -->
            <div class="detail-sections-dual">
              <div class="detail-box">
                <h3><i data-lucide="clipboard-list"></i> Required Documentation Checklist</h3>
                <div class="chk-group">
                  <div class="chk-sub-title">KYC Identity Documents</div>
                  <ul class="chk-list">
                    ${(singleScheme.document_checklist?.kyc_documents || []).map(d => `<li><i data-lucide="check-circle-2" class="icon-inline emerald"></i> ${d}</li>`).join('')}
                  </ul>
                </div>
                <div class="chk-group" style="margin-top:1rem;">
                  <div class="chk-sub-title">Income & Financial Verification</div>
                  <ul class="chk-list">
                    ${(singleScheme.document_checklist?.income_documents || []).map(d => `<li><i data-lucide="check-circle-2" class="icon-inline emerald"></i> ${d}</li>`).join('')}
                  </ul>
                </div>
              </div>

              <div class="detail-box">
                <h3><i data-lucide="shield-check"></i> Standard Underwriting Guidelines</h3>
                <ul class="guidelines-list">
                  <li><i data-lucide="check-circle-2" class="icon-inline emerald"></i> Minimum credit score of <strong>600 CIBIL</strong> (750+ preferred for prime rates).</li>
                  <li><i data-lucide="check-circle-2" class="icon-inline emerald"></i> Maximum allowable FOIR (EMI-to-Income) ratio: <strong>65%</strong>.</li>
                  <li><i data-lucide="check-circle-2" class="icon-inline emerald"></i> Applicant age must be between <strong>21 and 65 years</strong>.</li>
                  <li><i data-lucide="check-circle-2" class="icon-inline emerald"></i> Maximum 5 active running loans across financial institutions.</li>
                </ul>
                <div class="rbi-link-wrapper" style="margin-top:1.5rem;">
                  <a href="${(singleScheme && (singleScheme.loan_type === 'education_loan' || (singleScheme.source_url && (singleScheme.source_url.includes('vidyalakshmi') || singleScheme.source_url.includes('vidyalaxmi'))))) ? 'https://pmvidyalaxmi.co.in/' : ((singleScheme && singleScheme.source_url) ? singleScheme.source_url : 'https://pmvidyalaxmi.co.in/')}" target="_blank" rel="noopener" class="scheme-source-link">
                    <i data-lucide="external-link"></i> Official Regulatory Policy & Documentation
                  </a>
                </div>
              </div>
            </div>
          </div>
        ` : `
          <!-- ALL SCHEMES GRID VIEW -->
          <div class="schemes-grid">
            ${filteredSchemes.map(s => `
              <div class="scheme-card">
                <!-- Loan Type Image Banner -->
                <div class="card-img-wrapper">
                  <img src="${this.getLoanTypeImage(s.loan_type)}" alt="${s.display_name}" class="card-loan-img" onerror="this.parentElement.style.display='none';" />
                  <div class="scheme-badge">${s.interest_rate_min}% - ${s.interest_rate_max}% p.a.</div>
                </div>

                <div class="scheme-card-body">
                  <div class="scheme-header">
                    <h3><i data-lucide="${this.getLoanTypeIcon(s.loan_type)}" class="scheme-type-icon"></i> ${s.display_name}</h3>
                  </div>
                  <p class="scheme-desc">${s.description}</p>
                  
                  <div class="scheme-metrics">
                    <div class="metric-item">
                      <span class="m-val">${this.formatCurrency(s.min_amount)} - ${this.formatCurrency(s.max_amount)}</span>
                      <span class="m-lbl">Loan Amount Range</span>
                    </div>
                    <div class="metric-item">
                      <span class="m-val">${s.min_tenure_months} - ${s.max_tenure_months} Mos</span>
                      <span class="m-lbl">Flexible Tenure</span>
                    </div>
                  </div>

                  <div class="scheme-checklist-box">
                    <div class="chk-header"><i data-lucide="clipboard-list"></i> Document Checklist</div>
                    <ul class="chk-list">
                      ${(s.document_checklist?.kyc_documents || []).slice(0, 2).map(d => `<li><i data-lucide="check" class="icon-inline"></i> ${d}</li>`).join('')}
                    </ul>
                  </div>

                  <div class="scheme-footer">
                    <button class="btn btn-secondary btn-sm" onclick="app.selectSchemeType('${s.loan_type}')">
                      View Details <i data-lucide="eye"></i>
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="app.fillSchemeAndApply('${s.loan_type}')">
                      Apply Now <i data-lucide="arrow-right"></i>
                    </button>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  },

  renderEligibilityResults(data) {
    if (!data) return '';

    const isRejected = (data.status === 'REJECTED');
    const isApproved = (data.status === 'APPROVED');
    const explanation = data.explanation || {};
    const requestId = data.request_id || 'N/A';

    // 1. REJECTED STATUS VIEW
    if (isRejected) {
      return `
        <div class="eligibility-results-wrapper">
          <div class="result-status-card rejected-card">
            <div class="status-header">
              <span class="status-badge rejected"><i data-lucide="x-circle"></i> REJECTED</span>
              <span class="request-id-tag">Req ID: #${requestId}</span>
            </div>
            <h2>Application Criteria Assessment Required</h2>
            <p class="rejection-message">${data.message || 'Criteria not met for loan recommendation.'}</p>
            
            <div class="explanation-box" style="margin-top: 1.5rem;">
              <h4><i data-lucide="clipboard-list"></i> Policy Criteria Failure Reasons</h4>
              <ul class="reasons-list">
                ${(explanation.eligibility_reasons || []).map(r => `<li>${r}</li>`).join('')}
              </ul>
            </div>

            <div class="advice-box" style="margin-top:1.5rem;">
              <h4><i data-lucide="lightbulb"></i> How to improve your eligibility:</h4>
              <ul>
                <li>• Maintain a CIBIL credit score above 600 (preferably 750+ for prime rates).</li>
                <li>• Pay off existing credit cards to lower your monthly EMI obligations.</li>
                <li>• Ensure active loan count is within the maximum threshold of 5.</li>
              </ul>
            </div>
          </div>
        </div>
      `;
    }

    // 2. APPROVED STATUS VIEW
    const risk = data.risk_summary || {};
    const afford = data.affordability_summary || {};
    const recommendations = data.recommendations || [];

    return `
      <div class="eligibility-results-wrapper">
        
        <!-- Status & System Summary Header -->
        <div class="result-status-card approved-card">
          <div class="status-header">
            <span class="status-badge approved"><i data-lucide="check-circle-2"></i> APPROVED</span>
            <span class="request-id-tag">Req ID: #${requestId}</span>
          </div>
          <h2>${data.message || 'Personalised loan offers generated successfully.'}</h2>
        </div>

        <!-- GenAI Phase 2: AI Summary Banner Container -->
        <div id="aiSummaryContainer" style="margin-top:1.25rem;"></div>

        <!-- Metrics Overview Grid: Risk Summary & Affordability Summary -->
        <div class="ml-summary-grid">
          
          <!-- Risk Summary Card -->
          <div class="ml-summary-card risk-card">
            <div class="card-title"><i data-lucide="shield"></i> Underwriting Risk Assessment</div>
            <div class="risk-badge-row">
              <span class="risk-band-pill ${risk.risk_band === 'LOW' ? 'low-risk' : risk.risk_band === 'MEDIUM' ? 'med-risk' : 'high-risk'}">
                Risk Band: ${risk.risk_band || 'LOW'}
              </span>
            </div>
            <div class="metrics-grid">
              <div class="metric-block">
                <span class="m-val">${((risk.risk_score || 0) * 100).toFixed(1)}%</span>
                <span class="m-lbl">Risk Fit Score</span>
              </div>
              <div class="metric-block">
                <span class="m-val">${((risk.probability_of_default || 0) * 100).toFixed(2)}%</span>
                <span class="m-lbl">Default Probability</span>
              </div>
            </div>
          </div>

          <!-- Affordability Summary Card -->
          <div class="ml-summary-card afford-card">
            <div class="card-title"><i data-lucide="credit-card"></i> Affordability & FOIR Summary</div>
            <div class="metrics-grid">
              <div class="metric-block">
                <span class="m-val">${this.formatCurrency(afford.monthly_income)}</span>
                <span class="m-lbl">Monthly Income</span>
              </div>
              <div class="metric-block">
                <span class="m-val">${this.formatCurrency(afford.existing_monthly_emi)}</span>
                <span class="m-lbl">Existing EMIs</span>
              </div>
              <div class="metric-block">
                <span class="m-val">${this.formatCurrency(afford.max_total_emi)}</span>
                <span class="m-lbl">Max EMI Limit (65%)</span>
              </div>
              <div class="metric-block">
                <span class="m-val highlight">${this.formatCurrency(afford.max_affordable_new_emi)}</span>
                <span class="m-lbl">Max Affordable EMI</span>
              </div>
            </div>
          </div>

        </div>

        <!-- Recommendations Grid (Rule #6: Rank 1 highlighted as best) -->
        <h2 class="section-title" style="margin-top:2rem;">
          <i data-lucide="trophy"></i> Recommended Loan Offers (${recommendations.length})
        </h2>

        <div class="ml-recommendations-grid">
          ${recommendations.map(rec => {
            const isRank1 = (rec.rank === 1);
            return `
              <div class="recommendation-card ${isRank1 ? 'rank-1-card' : ''}">
                ${isRank1 ? `
                  <div class="rank-badge-highlight">
                    <i data-lucide="star"></i> RANK #1 — BEST MATCH RECOMMENDATION
                  </div>
                ` : `
                  <div class="rank-badge-standard">Rank #${rec.rank}</div>
                `}

                <div class="rec-header">
                  <div class="lender-tag">${rec.lender_name}</div>
                  <h3>${rec.product_name}</h3>
                </div>

                <div class="financial-hero-box">
                  <div class="hero-amount">${this.formatCurrency(rec.offer_amount)}</div>
                  <div class="hero-sub font-mono">Offer Amount for ${rec.tenure_months} Months</div>
                  
                  <div class="hero-emi-row">
                    <div>
                      <div class="emi-large">${this.formatCurrency(rec.monthly_emi)}</div>
                      <div class="emi-lbl">Monthly EMI</div>
                    </div>
                    <div>
                      <div class="rate-large">${rec.personalised_rate}% <span class="base-rate-strikethrough">(${rec.base_interest_rate}%)</span></div>
                      <div class="emi-lbl">Personalised Rate (p.a.)</div>
                    </div>
                  </div>
                </div>

                <!-- Financial Breakdown -->
                <div class="cost-breakdown-box">
                  <div class="cost-row">
                    <span>Total Interest Payable:</span>
                    <strong>${this.formatCurrency(rec.total_interest)}</strong>
                  </div>
                  <div class="cost-row">
                    <span>Processing Fee (${rec.processing_fee_pct}%):</span>
                    <strong>${this.formatCurrency(rec.processing_fee_amount)}</strong>
                  </div>
                  <div class="cost-row total">
                    <span>Total Repayment Amount:</span>
                    <strong>${this.formatCurrency(rec.total_repayment)}</strong>
                  </div>
                </div>

                <!-- Score Breakdown Grid -->
                ${rec.scores ? `
                  <div class="scores-grid">
                    <div class="score-chip">Match: <strong>${(rec.scores.need_match * 100).toFixed(0)}%</strong></div>
                    <div class="score-chip">Affordability: <strong>${(rec.scores.affordability * 100).toFixed(0)}%</strong></div>
                    <div class="score-chip">Risk Fit: <strong>${(rec.scores.risk_fit * 100).toFixed(0)}%</strong></div>
                    <div class="score-chip">Composite: <strong>${(rec.scores.composite * 100).toFixed(0)}%</strong></div>
                  </div>
                ` : ''}

                <div class="rec-footer">
                  <button class="btn btn-primary btn-full" onclick="app.fillSchemeAndApply('${rec.product_id}', ${rec.monthly_emi})">
                    Apply for ${rec.lender_name} Offer Now →
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- GenAI Phase 1: Explanation Panel Container -->
        <div id="explanationContainer" style="margin-top:2rem;"></div>

        <!-- Explanation & AI Offer Reasons -->
        <div class="ml-explanation-section" style="margin-top:2rem;">
          
          ${(explanation.offer_reasons || []).length > 0 ? `
            <div class="explanation-box offer-reasons-box">
              <h4><i data-lucide="sparkles"></i> Key Offer Highlights</h4>
              <ul class="reasons-list">
                ${explanation.offer_reasons.map(reason => `<li>${reason}</li>`).join('')}
              </ul>
            </div>
          ` : ''}

          ${(explanation.risk_drivers || []).length > 0 ? `
            <div class="explanation-box risk-drivers-box" style="margin-top:1rem;">
              <h4><i data-lucide="bar-chart-3"></i> Risk Drivers Analysis</h4>
              <div class="risk-drivers-list">
                ${explanation.risk_drivers.map(rd => `
                  <div class="risk-driver-item">
                    <div class="rd-header">
                      <span class="rd-feature">${rd.feature}</span>
                      <span class="rd-direction ${rd.direction}">${rd.direction.replace('_', ' ')} (impact: ${rd.impact})</span>
                    </div>
                    <div class="rd-note">${rd.note}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          ${(explanation.comparative_reasons || []).length > 0 ? `
            <div class="explanation-box comparative-box" style="margin-top:1rem;">
              <h4><i data-lucide="scale"></i> Comparative Analysis</h4>
              <ul class="reasons-list">
                ${explanation.comparative_reasons.map(cr => `<li>• ${cr}</li>`).join('')}
              </ul>
            </div>
          ` : ''}

        </div>

      </div>
    `;
  },

  renderAISummaryBanner(data, isLoading) {
    if (isLoading) {
      return `
        <div class="ai-summary-banner loading">
          <div class="ai-summary-header">
            <span class="ai-badge"><i data-lucide="bot"></i> AI Summary</span>
            <span class="ai-loading-skeleton">Synthesizing personalized loan insights with CrediWise AI...</span>
          </div>
        </div>
      `;
    }

    if (!data || !data.ai_summary) {
      return `
        <div class="ai-summary-banner info">
          <div class="ai-summary-header">
            <span class="ai-badge"><i data-lucide="bot"></i> AI Summary</span>
            <span class="ai-text">Personalized loan recommendation summary generated. Review individual offer breakdowns below.</span>
          </div>
        </div>
      `;
    }

    return `
      <div class="ai-summary-banner">
        <div class="ai-summary-header">
          <span class="ai-badge"><i data-lucide="bot"></i> AI Executive Summary</span>
        </div>
        <p class="ai-summary-content">${data.ai_summary}</p>
      </div>
    `;
  },

  renderExplanationPanel(data, isLoading) {
    if (isLoading) {
      return `
        <div class="explanation-panel loading">
          <div class="panel-header">
            <h4><i data-lucide="brain"></i> SHAP Feature Attribution & Financial Reasoning</h4>
          </div>
          <div class="ai-loading-skeleton" style="padding:1rem;">Evaluating risk drivers and affordability factors...</div>
        </div>
      `;
    }

    if (!data) return '';

    const positive = data.positive || [];
    const caution = data.caution || [];
    const topFactors = data.top_factors || [];

    return `
      <div class="explanation-panel">
        <div class="panel-header">
          <h4><i data-lucide="brain"></i> SHAP Feature Attribution & Financial Reasoning</h4>
          <span class="panel-subtitle">Deterministic Phase 1 Explanation Engine</span>
        </div>

        <div class="factors-dual-grid">
          ${positive.length > 0 ? `
            <div class="factor-column positive-col">
              <div class="col-title"><i data-lucide="check-circle-2" style="color:var(--emerald);"></i> Positive Credit Attributes</div>
              <ul class="factor-list">
                ${positive.map(p => `
                  <li class="factor-chip positive">
                    <i data-lucide="check-circle-2" class="lucide" style="color:var(--emerald); flex-shrink:0;"></i> ${p}
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}

          ${caution.length > 0 ? `
            <div class="factor-column caution-col">
              <div class="col-title"><i data-lucide="alert-triangle" style="color:var(--amber);"></i> Risk Caution Factors</div>
              <ul class="factor-list">
                ${caution.map(c => `
                  <li class="factor-chip caution">
                    <i data-lucide="alert-triangle" class="lucide" style="color:var(--amber); flex-shrink:0;"></i> ${c}
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}
        </div>

        ${data.financial_explanation || data.eligibility_explanation ? `
          <div class="explanation-text-box">
            ${data.financial_explanation ? `<p class="exp-para"><strong><i data-lucide="credit-card" class="lucide"></i> Financial Fit:</strong> ${data.financial_explanation}</p>` : ''}
            ${data.eligibility_explanation ? `<p class="exp-para"><strong><i data-lucide="clipboard-list" class="lucide"></i> Policy Fit:</strong> ${data.eligibility_explanation}</p>` : ''}
          </div>
        ` : ''}

        ${topFactors.length > 0 ? `
          <details class="top-factors-collapsible">
            <summary class="factors-summary-title">
              <i data-lucide="search" class="lucide"></i> Inspect SHAP Feature Weights (${topFactors.length} Key Drivers)
            </summary>
            <div class="shap-weights-grid">
              ${topFactors.map(f => {
                const isReduce = (f.direction === 'reduces_risk');
                return `
                  <div class="shap-factor-row ${isReduce ? 'reduces' : 'increases'}">
                    <span class="f-name">${(f.feature || '').replace(/_/g, ' ')}</span>
                    <span class="f-direction ${isReduce ? 'reduces_risk' : 'increases_risk'}">
                      ${isReduce ? '<i data-lucide="trending-down" class="lucide" style="color:var(--emerald);"></i> Reduces Risk' : '<i data-lucide="trending-up" class="lucide" style="color:var(--rose);"></i> Increases Risk'} (${(f.impact || 0).toFixed(2)})
                    </span>
                  </div>
                `;
              }).join('')}
            </div>
          </details>
        ` : ''}
      </div>
    `;
  },

  renderChatWidget() {
    return `
      <div class="chat-widget-inner">
        <div class="chat-widget-header">
          <div class="header-info">
            <span class="bot-avatar"><i data-lucide="bot"></i></span>
            <div>
              <div class="bot-title">CrediWise AI Assistant</div>
              <div class="bot-sub">Grounded Credit Advisory Engine</div>
            </div>
          </div>
          <button class="chat-close-btn" onclick="app.closeChatWidget()" title="Close Assistant"><i data-lucide="x" class="lucide"></i></button>
        </div>

        <div class="chat-messages-container" id="chatMessagesContainer">
          <!-- Chat messages rendered dynamically -->
        </div>

        <div class="chat-suggested-prompts" id="chatSuggestedPrompts">
          <button class="prompt-chip" onclick="app.sendSuggestedPrompt('Why is Rank #1 best for me?')">Why is Rank #1 best?</button>
          <button class="prompt-chip" onclick="app.sendSuggestedPrompt('How can I lower my monthly EMI?')">How to lower EMI?</button>
          <button class="prompt-chip" onclick="app.sendSuggestedPrompt('What documents do I need to submit?')">Required Documents?</button>
        </div>

        <form class="chat-input-area" onsubmit="app.handleSendChatMessage(event)">
          <input type="text" id="chatInputText" class="chat-input" placeholder="Ask a question about your loan offer..." autocomplete="off">
          <button type="submit" class="chat-send-btn" id="chatSendBtn">
            <span>Send</span>
          </button>
        </form>
      </div>
    `;
  },

  renderChatMessage(msg) {
    const isUser = (msg.sender === 'user');
    return `
      <div class="chat-bubble-row ${isUser ? 'user-row' : 'bot-row'}">
        <div class="chat-bubble ${isUser ? 'user' : 'bot'}">
          ${!isUser ? `
            <div class="chat-source-badge">
              ${msg.source === 'gemini' ? '<span class="src-badge gemini"><i data-lucide="bot" class="lucide"></i> AI</span>' : '<span class="src-badge fallback"><i data-lucide="zap" class="lucide"></i> Instant</span>'}
            </div>
          ` : ''}
          <div class="bubble-text">${msg.text}</div>
        </div>
      </div>
    `;
  },

  renderUserLoansTable(loans) {
    const hasLoans = loans && loans.length > 0;

    return `
      <div class="table-card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>App ID & Date</th>
                <th>Scheme & Details</th>
                <th>Financial Terms</th>
                <th>Income & Credit</th>
                <th>Sanction Offer</th>
                <th>Progress & Status</th>
                <th>Documents & Actions</th>
              </tr>
            </thead>
            <tbody>
              ${hasLoans ? loans.map(loan => `
                <tr>
                  <td>
                    <strong>#${loan.id}</strong>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${this.formatDate(loan.applied_at)}</div>
                  </td>
                  <td>
                    <span class="product-tag">${this.formatProductType(loan.product_type)}</span>
                    <div style="font-size:0.775rem; color:var(--text-secondary); margin-top:0.25rem;">${this.formatCategoryDetails(loan)}</div>
                  </td>
                  <td>
                    <strong>${this.formatCurrency(loan.requested_amount)}</strong>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${loan.tenure_months} Mos</div>
                  </td>
                  <td>
                    <div>₹${(loan.annual_income || 0).toLocaleString('en-IN')}/yr</div>
                    <div style="font-size:0.75rem; color:${(loan.credit_score >= 700) ? 'var(--emerald)' : 'var(--amber)'}; font-weight:700;">
                      CIBIL: ${loan.credit_score || 'N/A'}
                    </div>
                  </td>
                  <td>
                    ${loan.sanctioned_amount ? `
                      <strong style="color:var(--emerald);">${this.formatCurrency(loan.sanctioned_amount)}</strong>
                      <div style="font-size:0.75rem; color:var(--accent-primary); font-weight:700;">@ ${loan.interest_rate_offered}% p.a.</div>
                    ` : `<span style="color:var(--text-muted);">Under Review</span>`}
                  </td>
                  <td>
                    <div>${this.renderStatusBadge(loan.status)}</div>
                    ${this.renderProgressStepper(loan.status)}
                  </td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="app.openDocumentModal(${loan.id}, '${this.formatProductType(loan.product_type)}')">
                      <i data-lucide="folder"></i> Docs (${(loan.documents || []).length || 'Upload'})
                    </button>
                  </td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="7" style="text-align:center; padding: 3rem 1.5rem;">
                    <div style="max-width: 400px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 0.6rem;">
                      <div style="width: 44px; height: 44px; border-radius: 50%; background: var(--surface-secondary, #f4f4f6); display: flex; align-items: center; justify-content: center; color: var(--text-muted);">
                        <i data-lucide="folder-open" style="width:22px; height:22px;"></i>
                      </div>
                      <h4 style="margin: 0; font-size: 1rem; font-weight: 600; color: var(--text-primary);">No Active Loan Applications</h4>
                      <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">You haven't submitted any loan applications yet.</p>
                      <button class="btn btn-primary btn-sm" onclick="app.showModal('applyLoanModal')" style="margin-top: 0.4rem;">
                        + Apply For A Loan
                      </button>
                    </div>
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  renderAdminStats(stats) {
    if (!stats) return '';
    return `
      <div class="kpi-card">
        <div class="kpi-icon blue"><i data-lucide="bar-chart-3"></i></div>
        <div class="kpi-details">
          <span class="kpi-value">${stats.total_applications}</span>
          <span class="kpi-label">Total Applications</span>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon amber"><i data-lucide="clock"></i></div>
        <div class="kpi-details">
          <span class="kpi-value">${stats.pending}</span>
          <span class="kpi-label">Pending Underwriting</span>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon emerald"><i data-lucide="check-circle-2"></i></div>
        <div class="kpi-details">
          <span class="kpi-value">${stats.approved}</span>
          <span class="kpi-label">Sanctioned & Approved</span>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon rose"><i data-lucide="x-circle"></i></div>
        <div class="kpi-details">
          <span class="kpi-value">${stats.rejected}</span>
          <span class="kpi-label">Rejected Applications</span>
        </div>
      </div>
    `;
  },

  renderAdminLoansTable(loans) {
    if (!loans || loans.length === 0) {
      return `
        <div class="empty-state">
          <h3>No Applications Match Search / Filter</h3>
        </div>
      `;
    }

    return `
      <div class="table-card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID & Date</th>
                <th>Applicant Profile</th>
                <th>Scheme & Details</th>
                <th>Financial Metrics</th>
                <th>Income & Credit</th>
                <th>Status & Offer</th>
                <th>Underwriter Actions</th>
              </tr>
            </thead>
            <tbody>
              ${loans.map(loan => `
                <tr>
                  <td>
                    <strong>#${loan.id}</strong>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${this.formatDate(loan.applied_at)}</div>
                  </td>
                  <td>
                    <div><strong>${loan.applicant_name || 'User #' + loan.user_id}</strong></div>
                    <div style="font-size:0.775rem; color:var(--text-muted);">${loan.applicant_email || ''}</div>
                    <div style="font-size:0.725rem; color:var(--text-secondary); text-transform:capitalize;">${(loan.employment_type || '').replace('_', ' ')}</div>
                  </td>
                  <td>
                    <span class="product-tag">${this.formatProductType(loan.product_type)}</span>
                    <div style="font-size:0.775rem; color:var(--text-secondary); margin-top:0.25rem;">${this.formatCategoryDetails(loan)}</div>
                  </td>
                  <td>
                    <div>Req: <strong>${this.formatCurrency(loan.requested_amount)}</strong></div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${loan.tenure_months} Mos | FOIR: ${loan.foir_ratio || 40}%</div>
                  </td>
                  <td>
                    <div>₹${(loan.annual_income || 0).toLocaleString('en-IN')}/yr</div>
                    <div style="font-size:0.75rem; color:${(loan.credit_score >= 700) ? 'var(--emerald)' : 'var(--amber)'}; font-weight:700;">
                      CIBIL: ${loan.credit_score || 'N/A'}
                    </div>
                  </td>
                  <td>
                    <div>${this.renderStatusBadge(loan.status)}</div>
                    ${loan.sanctioned_amount ? `
                      <div style="font-size:0.775rem; color:var(--emerald); font-weight:700; margin-top:0.25rem;">Sanction: ${this.formatCurrency(loan.sanctioned_amount)} (@ ${loan.interest_rate_offered}%)</div>
                    ` : ''}
                  </td>
                  <td>
                    <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
                      <button class="btn btn-sm btn-primary" onclick="app.openReviewModal(${loan.id}, '${(loan.applicant_name || '').replace(/'/g, "\\'")}', '${this.formatCurrency(loan.requested_amount)}', ${loan.requested_amount}, ${loan.sanctioned_amount || loan.requested_amount}, ${loan.interest_rate_offered || 10.5})">
                        Review & Sanction
                      </button>
                      <button class="btn btn-sm btn-secondary" onclick="app.openDocumentModal(${loan.id}, '${this.formatProductType(loan.product_type)}', true)">
                        <i data-lucide="folder"></i> Verify Docs
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  renderDocumentsList(documents, isAdmin = false, loanId) {
    if (!documents || documents.length === 0) {
      return `
        <div class="empty-state" style="padding:1.5rem;">
          <p>No documents uploaded yet for this application.</p>
        </div>
      `;
    }

    return `
      <div class="documents-list-wrapper" style="overflow-x: auto; width: 100%;">
        <table class="data-table" style="width: 100%; min-width: 680px;">
          <thead>
            <tr>
              <th style="padding: 0.85rem 1rem; width: 18%;">Category / Type</th>
              <th style="padding: 0.85rem 1rem; width: 28%;">Filename & Size</th>
              <th style="padding: 0.85rem 1rem; width: 15%;">Status</th>
              <th style="padding: 0.85rem 1rem; width: 21%;">Verification Note</th>
              <th style="padding: 0.85rem 1rem; width: 18%; text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${documents.map(doc => {
              const docId = doc.id || doc.doc_id;
              const fileName = doc.original_filename || doc.file_name || 'Document';
              const fileSize = doc.file_size || (doc.file_size_bytes ? (doc.file_size_bytes / 1024).toFixed(1) + ' KB' : '—');
              const status = doc.verification_status || doc.status || 'pending';
              const category = (doc.doc_category || 'other').toUpperCase();
              const type = doc.doc_type || 'document';
              const note = doc.verification_note || '—';

              return `
              <tr>
                <td style="padding: 0.9rem 1rem;">
                  <span class="product-tag" style="text-transform:uppercase;">${category}</span>
                  <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${type}</div>
                </td>
                <td style="padding: 0.9rem 1rem;">
                  <div style="font-weight: 700; color: var(--text-primary); word-break: break-word;">${fileName}</div>
                  <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${fileSize}</div>
                </td>
                <td style="padding: 0.9rem 1rem;">${this.renderStatusBadge(status)}</td>
                <td style="padding: 0.9rem 1rem; font-size: 0.825rem; color: var(--text-secondary); word-break: break-word;">${note}</td>
                <td style="padding: 0.9rem 1rem; text-align: right;">
                  <div style="display: inline-flex; gap: 0.35rem; align-items: center; justify-content: flex-end; flex-wrap: nowrap;">
                    <button type="button" class="btn btn-sm btn-outline-primary" style="padding: 0.3rem 0.6rem; font-size: 0.78rem; white-space: nowrap;" onclick="app.openDocumentPreviewModal(${loanId}, ${docId}, '${encodeURIComponent(fileName)}', '${category}', '${type}', '${status}')" title="Inspect / View Document">
                      <i data-lucide="eye"></i> View
                    </button>
                    ${isAdmin ? (
                      (status === 'pending' || status === 'under_review') ? `
                        <button type="button" class="btn btn-sm btn-success" style="padding: 0.3rem 0.6rem; font-size: 0.78rem; white-space: nowrap;" onclick="app.verifyDocumentAction(${loanId}, ${docId}, 'verified')" title="Verify Document"><i data-lucide="check"></i> Verify</button>
                        <button type="button" class="btn btn-sm btn-danger" style="padding: 0.3rem 0.6rem; font-size: 0.78rem; white-space: nowrap;" onclick="app.verifyDocumentAction(${loanId}, ${docId}, 'rejected')" title="Reject Document"><i data-lucide="x"></i> Reject</button>
                      ` : ''
                    ) : (
                      (status === 'pending' || status === 'under_review') ? `
                        <button type="button" class="btn btn-sm btn-danger" style="padding: 0.3rem 0.6rem; font-size: 0.78rem; white-space: nowrap;" onclick="app.deleteDocumentAction(${loanId}, ${docId})"><i data-lucide="trash-2"></i> Delete</button>
                      ` : ''
                    )}
                  </div>
                </td>
              </tr>
            `;}).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  renderAdminUsersTable(users, loans = []) {
    if (!users || users.length === 0) return `<div class="empty-state">No registered borrowers found.</div>`;

    return `
      <div class="table-card">
        <div class="table-responsive">
          <table class="data-table users-data-table">
            <thead>
              <tr>
                <th>User ID</th>
                <th>Full Name</th>
                <th>Contact Email</th>
                <th>Phone Number</th>
                <th>Account Role</th>
                <th>Joined Date</th>
                <th>Loans Portfolio</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => {
                const userLoans = loans.filter(l => l.user_id === u.id || (l.applicant_email && l.applicant_email.toLowerCase() === u.email.toLowerCase()));
                const approvedCount = userLoans.filter(l => l.status === 'approved').length;

                return `
                  <tr class="user-row" id="user-row-${u.id}">
                    <td><strong>#${u.id}</strong></td>
                    <td><strong>${u.full_name}</strong></td>
                    <td>${u.email}</td>
                    <td>${u.phone || 'N/A'}</td>
                    <td>
                      <span class="status-badge ${u.is_admin ? 'approved' : 'pending'}">
                        ${u.is_admin ? '<i data-lucide="shield"></i> Administrator' : '<i data-lucide="user"></i> Borrower'}
                      </span>
                    </td>
                    <td>${this.formatDate(u.created_at)}</td>
                    <td>
                      <span class="status-badge ${approvedCount > 0 ? 'approved' : userLoans.length > 0 ? 'pending' : 'secondary'}">
                        ${userLoans.length} Application${userLoans.length === 1 ? '' : 's'} (${approvedCount} Active)
                      </span>
                    </td>
                    <td>
                      <button type="button" class="btn btn-secondary btn-sm user-expand-btn" onclick="app.toggleUserLoansDropdown(${u.id}, event)">
                        <i data-lucide="folder-open"></i> View Loans (${userLoans.length}) <span class="chevron-icon" id="user-chevron-${u.id}"><i data-lucide="chevron-down"></i></span>
                      </button>
                    </td>
                  </tr>

                  <!-- Collapsible Loan Details Dropdown Bar -->
                  <tr class="user-loans-dropdown-row" id="user-loans-dropdown-${u.id}" style="display: none;">
                    <td colspan="8" class="dropdown-td-wrapper">
                      <div class="user-loans-dropdown-container">
                        <div class="user-loans-dropdown-header">
                          <div class="dropdown-header-title">
                            <i data-lucide="credit-card"></i> Loan Facilities & Applications for <strong>${u.full_name}</strong> (#${u.id})
                          </div>
                          <div class="dropdown-header-subtitle">
                            Total Applications: ${userLoans.length} | Approved & Active: ${approvedCount}
                          </div>
                        </div>

                        ${userLoans.length === 0 ? `
                          <div class="no-loans-alert">
                            <i data-lucide="info"></i> No loan applications or credit facilities acquired by this borrower yet.
                          </div>
                        ` : `
                          <div class="user-loans-cards-grid">
                            ${userLoans.map(loan => `
                              <div class="user-loan-card ${loan.status}">
                                <div class="user-loan-card-header">
                                  <div class="loan-type-tag">
                                    <span class="loan-id-badge">Loan #${loan.id}</span>
                                    <strong>${this.formatProductType(loan.product_type)}</strong>
                                  </div>
                                  ${this.renderStatusBadge(loan.status)}
                                </div>

                                <div class="user-loan-category-desc">
                                  ${this.formatCategoryDetails(loan)}
                                </div>

                                <div class="user-loan-metrics-grid">
                                  <div class="u-metric">
                                    <span class="u-lbl">Requested Amount</span>
                                    <span class="u-val">${this.formatCurrency(loan.requested_amount)}</span>
                                  </div>
                                  <div class="u-metric">
                                    <span class="u-lbl">Sanctioned Amount</span>
                                    <span class="u-val highlight">${loan.sanctioned_amount ? this.formatCurrency(loan.sanctioned_amount) : 'Pending Sanction'}</span>
                                  </div>
                                  <div class="u-metric">
                                    <span class="u-lbl">Offered Interest Rate</span>
                                    <span class="u-val">${loan.interest_rate_offered ? loan.interest_rate_offered + '% p.a.' : 'Standard Slabs'}</span>
                                  </div>
                                  <div class="u-metric">
                                    <span class="u-lbl">Preferred Tenure</span>
                                    <span class="u-val">${loan.tenure_months || loan.requested_tenure_months || 36} Months</span>
                                  </div>
                                </div>

                                ${loan.admin_note ? `
                                  <div class="user-loan-admin-note">
                                    <strong><i data-lucide="pencil"></i> Underwriter Remarks:</strong> ${loan.admin_note}
                                  </div>
                                ` : ''}

                                ${loan.documents && loan.documents.length > 0 ? `
                                  <div class="user-loan-docs-section">
                                    <div class="docs-title"><i data-lucide="paperclip"></i> Attached Supporting Documents (${loan.documents.length}):</div>
                                    <div class="docs-chip-list">
                                      ${loan.documents.map(d => `
                                        <a href="${api.getDocumentViewUrl(loan.id, d.doc_id || d.id)}" target="_blank" class="doc-view-chip ${d.status || d.verification_status}">
                                          <i data-lucide="file"></i> ${d.file_name || d.original_filename || d.doc_type} (${d.status || d.verification_status || 'uploaded'})
                                        </a>
                                      `).join('')}
                                    </div>
                                  </div>
                                ` : ''}

                                <div class="user-loan-card-footer">
                                   <span class="applied-date">Submitted: ${this.formatDate(loan.applied_at)}</span>
                                   <button type="button" class="btn btn-primary btn-sm" onclick="(window.app || app).reviewLoan(${loan.id})" style="font-size: 0.78rem; padding: 0.4rem 0.85rem; display: inline-flex; align-items: center; gap: 0.4rem; cursor: pointer;">
                                     Review Application <i data-lucide="arrow-right" style="width:14px; height:14px;"></i>
                                   </button>
                                 </div>
                              </div>
                            `).join('')}
                          </div>
                        `}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  showToast(title, message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-msg">${message}</div>
      </div>
    `;

    container.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    // Dynamically shift chatbot FAB upward cleanly above notification
    this.updateChatFabOffset();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(30px)';
      setTimeout(() => {
        toast.remove();
        this.updateChatFabOffset();
      }, 300);
    }, 4000);
  },

  updateChatFabOffset() {
    const container = document.getElementById('toastContainer');
    const fab = document.getElementById('chatFab');
    if (!fab) return;

    const activeToasts = container ? container.querySelectorAll('.toast') : [];
    if (activeToasts.length > 0) {
      fab.classList.add('toast-shifted');
    } else {
      fab.classList.remove('toast-shifted');
    }
  }
};
