/**
 * UI Components & HTML Renderers
 * ApexLoans — Soft & Subtle Aesthetic Beige Palette
 */
const Components = {
  renderStatusBadge(status) {
    switch (status) {
      case 'pending':
      case 'under_review':
        return `<span class="status-badge pending">⏳ Under Review</span>`;
      case 'approved':
        return `<span class="status-badge approved">✅ Approved</span>`;
      case 'rejected':
        return `<span class="status-badge rejected">❌ Rejected</span>`;
      case 'verified':
        return `<span class="status-badge approved">✓ Verified</span>`;
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
        return loan.property_location ? `📍 ${loan.property_location}` : (loan.purpose || 'Residential Property');
      case 'vehicle_loan':
        return loan.vehicle_make_model ? `🚗 ${loan.vehicle_make_model}` : (loan.purpose || 'Vehicle Purchase');
      case 'business_loan':
        return loan.business_name ? `🏢 ${loan.business_name}` : (loan.purpose || 'MSME Expansion');
      case 'education_loan':
        return loan.university_name ? `🎓 ${loan.university_name}` : (loan.purpose || 'Higher Studies');
      case 'gold_loan':
        return loan.gold_weight_grams ? `✨ ${loan.gold_weight_grams}g (${loan.gold_purity_karats || 22}K Gold)` : (loan.purpose || 'Gold Pledge');
      default:
        return loan.purpose || 'Personal Financing';
    }
  },

  renderSchemesGrid(schemes) {
    if (!schemes || schemes.length === 0) return `<div class="empty-state">No loan schemes found.</div>`;

    const iconMap = {
      personal_loan: '💳',
      home_loan: '🏡',
      vehicle_loan: '🚗',
      education_loan: '🎓',
      business_loan: '🏢',
      gold_loan: '🥇'
    };

    return `
      <div class="schemes-grid">
        ${schemes.map(s => `
          <div class="scheme-card">
            <div class="scheme-header">
              <div style="display:flex; align-items:center; gap:0.6rem;">
                <span style="font-size:1.5rem;">${iconMap[s.loan_type] || '📜'}</span>
                <div>
                  <h3 style="font-size:1.2rem; font-weight:800; color:var(--navy-deep);">${s.display_name}</h3>
                  <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">RBI Underwriting Tier-1</div>
                </div>
              </div>
              <div class="scheme-badge">${s.interest_rate_min}% - ${s.interest_rate_max}% p.a.</div>
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
              <div class="chk-header">📋 Mandatory Document Checklist</div>
              <ul class="chk-list">
                ${(s.document_checklist?.kyc_documents || []).slice(0, 2).map(d => `<li>✓ <strong>KYC:</strong> ${d}</li>`).join('')}
                ${(s.document_checklist?.income_documents || []).slice(0, 1).map(d => `<li>✓ <strong>Income:</strong> ${d}</li>`).join('')}
                ${(s.document_checklist?.loan_specific_documents || []).slice(0, 1).map(d => `<li>✓ <strong>Scheme:</strong> ${d}</li>`).join('')}
              </ul>
            </div>

            <div class="scheme-footer">
              <button class="btn btn-primary btn-sm" onclick="app.fillSchemeAndApply('${s.loan_type}')">
                Apply Under Scheme →
              </button>
              <a href="${s.source_url}" target="_blank" rel="noopener" class="scheme-source-link">RBI Policy Specs ↗</a>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  renderEligibilityResults(data) {
    if (!data) return '';
    const summary = data.consumer_summary || {};
    const eligible = data.ranked_eligible_loans || [];
    const ineligible = data.ineligible_loans || [];

    return `
      <div class="eligibility-results-wrapper">
        <div class="foir-summary-card">
          <div class="foir-details">
            <div class="foir-title">Your Credit & FOIR Assessment Summary</div>
            <div class="foir-metrics-row">
              <div>
                <span class="foir-val">${this.formatCurrency(summary.monthly_income)}</span>
                <span class="foir-lbl">Est. Monthly Net Income</span>
              </div>
              <div>
                <span class="foir-val">${this.formatCurrency(summary.existing_emi)}</span>
                <span class="foir-lbl">Existing EMI Commitments</span>
              </div>
              <div>
                <span class="foir-val score-high">${summary.credit_score}</span>
                <span class="foir-lbl">CIBIL Score</span>
              </div>
            </div>
          </div>
        </div>

        <h2 style="font-size:1.4rem; font-weight:800; margin:1.75rem 0 1rem; color:var(--text-primary);">
          ✨ Ranked Eligible Loan Schemes (${eligible.length})
        </h2>

        ${eligible.length === 0 ? `
          <div class="empty-state">
            <h3>No schemes matched your current input parameters</h3>
            <p>Try adjusting requested amount, tenure, or lowering existing EMIs.</p>
          </div>
        ` : `
          <div class="eligible-loans-grid">
            ${eligible.map(item => `
              <div class="eligible-loan-card">
                <div class="match-score-pill">🔥 ${item.match_score}% Match</div>
                <h3>${item.display_name}</h3>
                
                <div class="eligible-stats-row">
                  <div>
                    <div class="stat-big">${item.estimated_interest_rate}%</div>
                    <div class="stat-lbl">Estimated Rate</div>
                  </div>
                  <div>
                    <div class="stat-big">${this.formatCurrency(item.estimated_monthly_emi)}</div>
                    <div class="stat-lbl">Monthly EMI</div>
                  </div>
                  <div>
                    <div class="stat-big">${this.formatCurrency(item.max_eligible_amount)}</div>
                    <div class="stat-lbl">Max Eligibility</div>
                  </div>
                </div>

                <div class="foir-gauge-box">
                  <div class="foir-gauge-bar">
                    <div class="foir-fill" style="width: ${Math.min(100, item.foir_percentage)}%;"></div>
                  </div>
                  <div class="foir-gauge-txt">FOIR Ratio: <strong>${item.foir_percentage}%</strong> (Healthy)</div>
                </div>

                <button class="btn btn-primary btn-full" onclick="app.fillSchemeAndApply('${item.loan_type}', ${item.estimated_monthly_emi})">
                  Apply for ${item.display_name} Now
                </button>
              </div>
            `).join('')}
          </div>
        `}

        ${ineligible.length > 0 ? `
          <h3 style="font-size:1.15rem; font-weight:700; margin:2rem 0 1rem; color:var(--text-secondary);">
            ⚠️ Ineligible Schemes (${ineligible.length})
          </h3>
          <div class="ineligible-list">
            ${ineligible.map(item => `
              <div class="ineligible-card">
                <strong>${item.display_name}</strong>
                <ul class="missing-reasons">
                  ${(item.missing_criteria || []).map(r => `<li>❌ ${r}</li>`).join('')}
                </ul>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${(data.personalized_advice || []).length > 0 ? `
          <div class="advice-box" style="margin-top:1.5rem;">
            <h4>💡 Personalized Financial Advice</h4>
            <ul>
              ${data.personalized_advice.map(adv => `<li>• ${adv}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `;
  },

  renderUserLoansTable(loans) {
    if (!loans || loans.length === 0) {
      return `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <h3>No Loan Applications Found</h3>
          <p>You haven't submitted any loan applications yet.</p>
          <button class="btn btn-primary btn-sm" onclick="app.showModal('applyLoanModal')" style="margin-top:1rem;">
            + Apply For A Loan
          </button>
        </div>
      `;
    }

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
              ${loans.map(loan => `
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
                      📁 Docs (${(loan.documents || []).length || 'Upload'})
                    </button>
                  </td>
                </tr>
              `).join('')}
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
        <div class="kpi-icon blue">📊</div>
        <div class="kpi-details">
          <span class="kpi-value">${stats.total_applications}</span>
          <span class="kpi-label">Total Applications</span>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon amber">⏳</div>
        <div class="kpi-details">
          <span class="kpi-value">${stats.pending}</span>
          <span class="kpi-label">Pending Underwriting</span>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon emerald">✅</div>
        <div class="kpi-details">
          <span class="kpi-value">${stats.approved}</span>
          <span class="kpi-label">Sanctioned & Approved</span>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon rose">❌</div>
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
                        📁 Verify Docs
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
    return this.renderDocumentsTable(documents, loanId, isAdmin);
  },

  renderDocumentsTable(documents, loanId, isAdmin = false) {
    if (!documents || documents.length === 0) {
      return `
        <div class="empty-state" style="padding: 2rem 1rem;">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">📂</div>
          <div style="font-weight: 600; color: var(--text-color);">No documents uploaded yet</div>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;">
            Upload mandatory KYC, income statements, and category-specific proofs.
          </div>
        </div>
      `;
    }

    return `
      <div class="documents-list-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Category / Type</th>
              <th>Filename & Size</th>
              <th>Status</th>
              <th>Verification Note</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${documents.map(doc => {
              const docId = doc.id || doc.doc_id;
              const fileName = doc.original_filename || doc.file_name || 'Document';
              const fileSize = doc.file_size || (doc.file_size_bytes ? (doc.file_size_bytes / 1024).toFixed(1) + ' KB' : '—');
              const status = doc.verification_status || doc.status || 'pending';
              const note = doc.verification_note || '—';
              const category = (doc.doc_category || 'other').toUpperCase();
              const type = doc.doc_type || '';

              return `
              <tr>
                <td>
                  <span class="product-tag" style="text-transform:uppercase;">${category}</span>
                  <div style="font-size:0.75rem; color:var(--text-muted);">${type}</div>
                </td>
                <td><strong>${fileName}</strong> (${fileSize})</td>
                <td>${this.renderStatusBadge(status)}</td>
                <td>${note}</td>
                <td>
                  <div style="display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap;">
                    <button class="btn btn-sm btn-outline-primary" style="padding: 0.25rem 0.6rem; font-size: 0.78rem;" onclick="app.openDocumentPreviewModal(${loanId}, ${docId}, '${encodeURIComponent(fileName)}', '${category}', '${type}', '${status}')" title="Inspect / View Document">
                      👁️ View
                    </button>
                    ${isAdmin ? `
                      <button class="btn btn-sm btn-success" style="padding: 0.25rem 0.6rem; font-size: 0.78rem;" onclick="app.verifyDocumentAction(${loanId}, ${docId}, 'verified')" title="Verify Document">✓ Verify</button>
                      <button class="btn btn-sm btn-danger" style="padding: 0.25rem 0.6rem; font-size: 0.78rem;" onclick="app.verifyDocumentAction(${loanId}, ${docId}, 'rejected')" title="Reject Document">✕ Reject</button>
                    ` : `
                      <button class="btn btn-sm btn-danger" style="padding: 0.25rem 0.6rem; font-size: 0.78rem;" onclick="app.deleteDocumentAction(${loanId}, ${docId})">Delete</button>
                    `}
                  </div>
                </td>
              </tr>
            `;}).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  renderAdminUsersTable(users) {
    if (!users || users.length === 0) return `<div class="empty-state">No registered borrowers found.</div>`;

    return `
      <div class="table-card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>User ID</th>
                <th>Full Name</th>
                <th>Contact Email</th>
                <th>Phone Number</th>
                <th>Account Role</th>
                <th>Joined Date</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => `
                <tr>
                  <td><strong>#${u.id}</strong></td>
                  <td><strong>${u.full_name}</strong></td>
                  <td>${u.email}</td>
                  <td>${u.phone || 'N/A'}</td>
                  <td>
                    <span class="status-badge ${u.is_admin ? 'approved' : 'pending'}">
                      ${u.is_admin ? '🛡️ Administrator' : '👤 Borrower'}
                    </span>
                  </td>
                  <td>${this.formatDate(u.created_at)}</td>
                </tr>
              `).join('')}
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

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(30px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
};
