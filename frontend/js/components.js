/**
 * UI Components & HTML Renderers
 */
const Components = {
  /**
   * Status Badge matching exact guide spec:
   * pending -> ⏳ Under Review (Yellow / Amber)
   * approved -> ✅ Approved (Green)
   * rejected -> ❌ Rejected (Red)
   */
  renderStatusBadge(status) {
    switch (status) {
      case 'pending':
        return `<span class="status-badge pending">⏳ Under Review</span>`;
      case 'approved':
        return `<span class="status-badge approved">✅ Approved</span>`;
      case 'rejected':
        return `<span class="status-badge rejected">❌ Rejected</span>`;
      default:
        return `<span class="status-badge">${status}</span>`;
    }
  },

  formatCurrency(amount) {
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
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  formatProductType(productType) {
    return (productType || '').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  },

  /**
   * User Loans Table Renderer
   */
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
                <th>App ID</th>
                <th>Product</th>
                <th>Amount</th>
                <th>Tenure</th>
                <th>Status</th>
                <th>Applied Date</th>
                <th>Admin Note / Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${loans.map(loan => `
                <tr>
                  <td><strong>#${loan.id}</strong></td>
                  <td><span class="product-tag">${this.formatProductType(loan.product_type)}</span></td>
                  <td><strong>${this.formatCurrency(loan.requested_amount)}</strong></td>
                  <td>${loan.tenure_months} Months</td>
                  <td>${this.renderStatusBadge(loan.status)}</td>
                  <td>${this.formatDate(loan.applied_at)}</td>
                  <td>
                    ${loan.admin_note 
                      ? `<div style="font-size:0.825rem; color:var(--text-primary); max-width:240px;"><em>"${loan.admin_note}"</em></div>` 
                      : `<span style="color:var(--text-muted);">No remarks</span>`
                    }
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  /**
   * Admin KPI Dashboard Cards
   */
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
          <span class="kpi-label">Pending Review</span>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon emerald">✅</div>
        <div class="kpi-details">
          <span class="kpi-value">${stats.approved}</span>
          <span class="kpi-label">Approved Loans</span>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon rose">❌</div>
        <div class="kpi-details">
          <span class="kpi-value">${stats.rejected}</span>
          <span class="kpi-label">Rejected Loans</span>
        </div>
      </div>
    `;
  },

  /**
   * Admin Loans Table Renderer with Action Buttons
   */
  renderAdminLoansTable(loans) {
    if (!loans || loans.length === 0) {
      return `
        <div class="empty-state">
          <h3>No Applications Match Filter</h3>
          <p>There are no loan applications under this category.</p>
        </div>
      `;
    }

    return `
      <div class="table-card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Applicant</th>
                <th>Product</th>
                <th>Requested</th>
                <th>Income / Credit</th>
                <th>Employment</th>
                <th>Status</th>
                <th>Applied On</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${loans.map(loan => `
                <tr>
                  <td><strong>#${loan.id}</strong></td>
                  <td>
                    <div><strong>${loan.applicant_name || 'User #' + loan.user_id}</strong></div>
                    <div style="font-size:0.775rem; color:var(--text-muted);">${loan.applicant_email || ''}</div>
                  </td>
                  <td><span class="product-tag">${this.formatProductType(loan.product_type)}</span></td>
                  <td>
                    <div><strong>${this.formatCurrency(loan.requested_amount)}</strong></div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${loan.tenure_months} months</div>
                  </td>
                  <td>
                    <div>₹${(loan.annual_income || 0).toLocaleString('en-IN')}/yr</div>
                    <div style="font-size:0.75rem; color:${(loan.credit_score >= 700) ? 'var(--emerald)' : 'var(--amber)'}; font-weight:600;">
                      Score: ${loan.credit_score || 'N/A'}
                    </div>
                  </td>
                  <td style="text-transform:capitalize;">${loan.employment_type}</td>
                  <td>${this.renderStatusBadge(loan.status)}</td>
                  <td>${this.formatDate(loan.applied_at)}</td>
                  <td>
                    ${loan.status === 'pending' ? `
                      <button class="btn btn-sm btn-primary" onclick="app.openReviewModal(${loan.id}, '${loan.applicant_name.replace(/'/g, "\\'")}', '${this.formatCurrency(loan.requested_amount)}')">
                        Review & Action
                      </button>
                    ` : `
                      <button class="btn btn-sm btn-secondary" onclick="app.openReviewModal(${loan.id}, '${loan.applicant_name.replace(/'/g, "\\'")}', '${this.formatCurrency(loan.requested_amount)}', true)">
                        View Details
                      </button>
                    `}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  /**
   * Admin Users Table Renderer
   */
  renderAdminUsersTable(users) {
    if (!users || users.length === 0) {
      return `
        <div class="empty-state">
          <h3>No Users Found</h3>
        </div>
      `;
    }

    return `
      <div class="table-card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>User ID</th>
                <th>Full Name</th>
                <th>Email Address</th>
                <th>Phone Number</th>
                <th>Registration Date</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => `
                <tr>
                  <td><strong>#${u.id}</strong></td>
                  <td><strong>${u.full_name}</strong></td>
                  <td>${u.email}</td>
                  <td>${u.phone || 'N/A'}</td>
                  <td>${this.formatDate(u.created_at)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  /**
   * Notification Toast trigger
   */
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
