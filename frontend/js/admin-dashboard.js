/**
 * FixFirst AI — Admin Dashboard
 * ================================
 * Candidate management, account control, password reset, audit logs.
 * All operations are backend-enforced (Admin role required).
 */

import {
  getAllCandidates, createCandidate, updateCandidate,
  resetCandidatePassword, toggleCandidateStatus, getAuditLogs
} from './api.js';
import { escapeHtml, formatDate, showToast, openModal, closeModal } from './app.js';

const ROLES = ['student', 'warden', 'worker', 'admin'];
const DEPARTMENTS = [
  'Electrical Maintenance', 'Plumbing & Sanitation Department',
  'Housekeeping & Hygiene Operations', 'Estate & Civil Works',
  'General Facilities & Carpentry', 'Fire & Safety Response Cell',
  'Campus Security & Surveillance', 'IT & Campus Network Center',
  'HVAC & Climate Control Division', 'General Maintenance Services',
  'Academic Affairs', 'Administration',
];

// ---------------------------------------------------------------------------
// Candidates Page
// ---------------------------------------------------------------------------

export async function loadAdminCandidates() {
  const page = document.getElementById('page-admin-candidates');
  page.innerHTML = `
    <div class="card mb-24" style="background:linear-gradient(135deg,#7c3aed,#5b21b6);color:white;border-radius:var(--radius-lg);padding:22px 26px;border:none;">
      <div class="flex justify-between items-center flex-wrap gap-16">
        <div>
          <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:12px;display:inline-block;margin-bottom:8px;">⚙️ Admin Control Panel</span>
          <h2 style="font-size:22px;color:white;font-weight:700;">Candidate Management</h2>
          <p style="font-size:13px;opacity:0.9;margin-top:6px;">Create, edit, activate/deactivate, and manage all campus accounts.</p>
        </div>
        <button class="btn btn-sm" style="background:white;color:#7c3aed;font-weight:700;" onclick="window.showCreateCandidateModal()">+ Add Candidate</button>
      </div>
    </div>

    <!-- Search & Filter Bar -->
    <div class="card mb-16" style="padding:16px;">
      <div class="flex gap-12 flex-wrap items-center">
        <input type="text" id="candidateSearch" class="form-control" style="max-width:280px;" placeholder="🔍 Search by name, username, email…" oninput="window.filterCandidates()" />
        <select id="candidateRoleFilter" class="form-control" style="max-width:160px;" onchange="window.filterCandidates()">
          <option value="">All Roles</option>
          ${ROLES.map(r => `<option value="${r}">${r.charAt(0).toUpperCase() + r.slice(1)}</option>`).join('')}
        </select>
        <select id="candidateStatusFilter" class="form-control" style="max-width:160px;" onchange="window.filterCandidates()">
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <button class="btn btn-secondary btn-sm" onclick="window.loadCandidateTable()">🔄 Refresh</button>
      </div>
    </div>

    <div id="candidateTableContainer"><div class="spinner-center"><div class="spinner"></div></div></div>
  `;

  await loadCandidateTable();
}

window.loadCandidateTable = loadCandidateTable;
async function loadCandidateTable() {
  const container = document.getElementById('candidateTableContainer');
  if (!container) return;
  container.innerHTML = `<div class="spinner-center"><div class="spinner"></div></div>`;

  const search = document.getElementById('candidateSearch')?.value || '';
  const role   = document.getElementById('candidateRoleFilter')?.value || '';
  const res = await getAllCandidates(search, role);
  const statusFilter = document.getElementById('candidateStatusFilter')?.value || '';

  let candidates = (res && res.candidates) ? res.candidates : [];
  if (statusFilter) candidates = candidates.filter(c => c.account_status === statusFilter);

  if (candidates.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👥</div>
        <div class="empty-state-title">No candidates found</div>
        <p class="empty-state-text">Try adjusting the search filters, or click "+ Add Candidate" to create a new account.</p>
      </div>
    `;
    return;
  }

  const roleColors = { student:'#1d4ed8', warden:'#15803d', worker:'#b45309', admin:'#7c3aed' };

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="table-mobile-cards">
        <thead><tr>
          <th>Name</th><th>Username</th><th>Role</th><th>Department</th><th>Area</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody>
          ${candidates.map(c => {
            const color = roleColors[c.role] || '#6b7280';
            const isActive = c.account_status !== 'Inactive';
            return `
              <tr>
                <td data-label="Name">
                  <div style="font-weight:600;">${escapeHtml(c.full_name)}</div>
                  <div style="font-size:12px;color:var(--gray-500);">${escapeHtml(c.email || '—')}</div>
                </td>
                <td data-label="Username"><code>${escapeHtml(c.username)}</code></td>
                <td data-label="Role">
                  <span class="badge" style="background:${color}1a;color:${color};border:1px solid ${color}33;">
                    ${escapeHtml(c.role)}
                  </span>
                </td>
                <td data-label="Department" style="font-size:12px;">${escapeHtml(c.department_or_hostel || '—')}</td>
                <td data-label="Area" style="font-size:12px;">${escapeHtml(c.assigned_area || '—')}</td>
                <td data-label="Status">
                  <span class="badge ${isActive ? 'badge-success' : 'badge-inactive'}">
                    ${isActive ? '● Active' : '○ Inactive'}
                  </span>
                </td>
                <td data-label="Actions">
                  <div class="action-buttons">
                    <button class="btn btn-xs btn-secondary" onclick="window.showEditCandidateModal('${c.id}')">✏️ Edit</button>
                    <button class="btn btn-xs btn-warning" onclick="window.showResetPasswordModal('${c.id}', '${escapeHtml(c.full_name)}')">🔑 Reset PW</button>
                    <button class="btn btn-xs ${isActive ? 'btn-danger' : 'btn-success'}" onclick="window.toggleStatus('${c.id}', '${isActive ? 'Inactive' : 'Active'}', '${escapeHtml(c.full_name)}')">
                      ${isActive ? '🚫 Deactivate' : '✅ Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    <p style="font-size:12px;color:var(--gray-500);margin-top:8px;">Showing ${candidates.length} candidate${candidates.length !== 1 ? 's' : ''}</p>
  `;
}

window.filterCandidates = () => loadCandidateTable();

// ---------------------------------------------------------------------------
// Create Candidate Modal
// ---------------------------------------------------------------------------

window.showCreateCandidateModal = () => {
  openModal('Add New Candidate', `
    <form id="createCandidateForm" autocomplete="off">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group">
          <label class="form-label">Full Name *</label>
          <input type="text" id="cf_fullname" class="form-control" placeholder="e.g. Priya Sharma" required />
        </div>
        <div class="form-group">
          <label class="form-label">Email *</label>
          <input type="email" id="cf_email" class="form-control" placeholder="user@campus.edu" required />
        </div>
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input type="text" id="cf_phone" class="form-control" placeholder="+91 98765 43210" />
        </div>
        <div class="form-group">
          <label class="form-label">Username *</label>
          <input type="text" id="cf_username" class="form-control" placeholder="e.g. priya_sharma" required />
        </div>
        <div class="form-group">
          <label class="form-label">Role *</label>
          <select id="cf_role" class="form-control" required>
            <option value="">Select Role…</option>
            ${ROLES.map(r => `<option value="${r}">${r.charAt(0).toUpperCase() + r.slice(1)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Department</label>
          <select id="cf_dept" class="form-control">
            <option value="">Select Department…</option>
            ${DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="grid-column:1/-1;">
          <label class="form-label">Assigned Campus Area</label>
          <input type="text" id="cf_area" class="form-control" placeholder="e.g. Hostel Block A" />
        </div>
        <div class="form-group" style="grid-column:1/-1;">
          <label class="form-label">
            Temporary Password
            <span style="font-size:11px;color:var(--gray-500);">(leave blank to auto-generate)</span>
          </label>
          <input type="text" id="cf_password" class="form-control" placeholder="Leave blank to auto-generate" autocomplete="new-password" />
          <small class="text-muted">Min 12 chars, must include uppercase, lowercase, number, and special character.</small>
        </div>
      </div>
      <div id="createCandidateError" class="alert alert-danger" style="display:none;font-size:13px;margin-top:12px;"></div>
    </form>
  `, `
    <button class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="window._submitCreateCandidate()">Create Account</button>
  `);
};

window._submitCreateCandidate = async () => {
  const errBox = document.getElementById('createCandidateError');
  const payload = {
    full_name:     document.getElementById('cf_fullname')?.value?.trim(),
    email:         document.getElementById('cf_email')?.value?.trim(),
    phone:         document.getElementById('cf_phone')?.value?.trim(),
    username:      document.getElementById('cf_username')?.value?.trim().toLowerCase(),
    role:          document.getElementById('cf_role')?.value,
    department:    document.getElementById('cf_dept')?.value,
    assigned_area: document.getElementById('cf_area')?.value?.trim(),
    password:      document.getElementById('cf_password')?.value?.trim() || null,
  };

  if (!payload.full_name || !payload.email || !payload.username || !payload.role) {
    if (errBox) { errBox.textContent = 'Full name, email, username, and role are required.'; errBox.style.display = 'block'; }
    return;
  }

  try {
    const res = await createCandidate(payload);
    closeModal();
    showToast(`✅ Account created for ${payload.full_name}!`, 'success');
    // Show generated password if auto-generated
    if (res.temporary_password) {
      openModal('Generated Password', `
        <div class="alert alert-info" style="font-size:14px;">
          <p>✅ Account created successfully!</p>
          <p>Ask <strong>${escapeHtml(payload.full_name)}</strong> to log in with:</p>
          <p><strong>Username:</strong> <code>${escapeHtml(payload.username)}</code></p>
          <p><strong>Temporary Password:</strong> <code style="font-size:16px;font-weight:bold;">${escapeHtml(res.temporary_password)}</code></p>
          <p style="color:var(--orange-600);font-size:12px;">⚠️ This password is shown only once. Share it securely and ask the user to change it on first login.</p>
        </div>
      `, `<button class="btn btn-primary" onclick="window.closeModal()">Understood</button>`);
    }
    await loadCandidateTable();
  } catch (err) {
    if (errBox) { errBox.textContent = err.message || 'Failed to create candidate.'; errBox.style.display = 'block'; }
  }
};

// ---------------------------------------------------------------------------
// Edit Candidate Modal
// ---------------------------------------------------------------------------

window.showEditCandidateModal = async (candidateId) => {
  const res = await getAllCandidates();
  const candidates = (res && res.candidates) ? res.candidates : [];
  const c = candidates.find(x => x.id === candidateId);
  if (!c) { showToast('Candidate not found.', 'error'); return; }

  openModal(`Edit: ${c.full_name}`, `
    <form id="editCandidateForm" autocomplete="off">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group">
          <label class="form-label">Full Name *</label>
          <input type="text" id="ef_fullname" class="form-control" value="${escapeHtml(c.full_name)}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Email *</label>
          <input type="email" id="ef_email" class="form-control" value="${escapeHtml(c.email || '')}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input type="text" id="ef_phone" class="form-control" value="${escapeHtml(c.phone || '')}" />
        </div>
        <div class="form-group">
          <label class="form-label">Role *</label>
          <select id="ef_role" class="form-control" required>
            ${ROLES.map(r => `<option value="${r}" ${c.role === r ? 'selected' : ''}>${r.charAt(0).toUpperCase() + r.slice(1)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Department</label>
          <select id="ef_dept" class="form-control">
            <option value="">None</option>
            ${DEPARTMENTS.map(d => `<option value="${d}" ${c.department_or_hostel === d ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Assigned Area</label>
          <input type="text" id="ef_area" class="form-control" value="${escapeHtml(c.assigned_area || '')}" />
        </div>
      </div>
      <div id="editCandidateError" class="alert alert-danger" style="display:none;font-size:13px;margin-top:12px;"></div>
    </form>
  `, `
    <button class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="window._submitEditCandidate('${candidateId}')">Save Changes</button>
  `);
};

window._submitEditCandidate = async (candidateId) => {
  const errBox = document.getElementById('editCandidateError');
  const payload = {
    full_name:     document.getElementById('ef_fullname')?.value?.trim(),
    email:         document.getElementById('ef_email')?.value?.trim(),
    phone:         document.getElementById('ef_phone')?.value?.trim(),
    role:          document.getElementById('ef_role')?.value,
    department:    document.getElementById('ef_dept')?.value,
    assigned_area: document.getElementById('ef_area')?.value?.trim(),
  };

  try {
    await updateCandidate(candidateId, payload);
    closeModal();
    showToast('Candidate updated successfully.', 'success');
    await loadCandidateTable();
  } catch (err) {
    if (errBox) { errBox.textContent = err.message || 'Failed to update candidate.'; errBox.style.display = 'block'; }
  }
};

// ---------------------------------------------------------------------------
// Reset Password Modal
// ---------------------------------------------------------------------------

window.showResetPasswordModal = (candidateId, fullName) => {
  openModal(`Reset Password: ${fullName}`, `
    <div class="alert alert-warning" style="font-size:13px;margin-bottom:16px;">
      ⚠️ This will generate a new temporary password. The existing password will be invalidated immediately.
      <strong>Never share passwords via unsecured channels.</strong>
    </div>
    <div class="form-group">
      <label class="form-label">New Password <span style="color:var(--gray-500);font-size:11px;">(optional — leave blank to auto-generate)</span></label>
      <input type="text" id="resetPasswordInput" class="form-control" placeholder="Leave blank to auto-generate" autocomplete="new-password" />
      <small class="text-muted">Min 12 chars with uppercase, lowercase, number, and special character.</small>
    </div>
    <div id="resetPwError" class="alert alert-danger" style="display:none;font-size:13px;margin-top:12px;"></div>
  `, `
    <button class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
    <button class="btn btn-warning" onclick="window._submitResetPassword('${candidateId}', '${escapeHtml(fullName)}')">🔑 Reset Password</button>
  `);
};

window._submitResetPassword = async (candidateId, fullName) => {
  const errBox = document.getElementById('resetPwError');
  const newPw = document.getElementById('resetPasswordInput')?.value?.trim() || null;

  try {
    const res = await resetCandidatePassword(candidateId, newPw);
    closeModal();
    const generatedPw = res.temporary_password;
    if (generatedPw) {
      openModal('New Password Generated', `
        <div class="alert alert-success" style="font-size:14px;">
          <p>✅ Password reset successful for <strong>${escapeHtml(fullName)}</strong>.</p>
          <p><strong>Temporary Password:</strong></p>
          <code style="font-size:18px;font-weight:bold;display:block;padding:10px;background:#f0fdf4;border-radius:6px;margin:8px 0;">${escapeHtml(generatedPw)}</code>
          <p style="color:var(--orange-600);font-size:12px;">⚠️ This password is shown only once. Share it securely with the user.</p>
        </div>
      `, `<button class="btn btn-primary" onclick="window.closeModal()">Acknowledged</button>`);
    } else {
      showToast('Password reset successfully.', 'success');
    }
  } catch (err) {
    if (errBox) { errBox.textContent = err.message || 'Failed to reset password.'; errBox.style.display = 'block'; }
  }
};

// ---------------------------------------------------------------------------
// Toggle Active / Inactive
// ---------------------------------------------------------------------------

window.toggleStatus = async (candidateId, newStatus, fullName) => {
  const action = newStatus === 'Inactive' ? 'deactivate' : 'activate';
  if (!confirm(`Are you sure you want to ${action} the account for ${fullName}?`)) return;
  try {
    await toggleCandidateStatus(candidateId, newStatus);
    showToast(`Account ${newStatus === 'Inactive' ? 'deactivated' : 'activated'} for ${fullName}.`, 'success');
    await loadCandidateTable();
  } catch (err) {
    showToast(err.message || 'Failed to update status.', 'error');
  }
};

// ---------------------------------------------------------------------------
// Audit Logs
// ---------------------------------------------------------------------------

export async function loadAuditLogs() {
  const page = document.getElementById('page-admin-audit');
  page.innerHTML = `
    <div class="flex justify-between items-center mb-24">
      <div>
        <h2 style="font-size:20px;font-weight:700;color:var(--gray-900);">📑 Admin Audit Log</h2>
        <p style="font-size:13px;color:var(--gray-500);">A tamper-evident record of all account and permission changes.</p>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="window.loadAuditLogs()">🔄 Refresh</button>
    </div>
    <div id="auditLogContainer"><div class="spinner-center"><div class="spinner"></div></div></div>
  `;

  window.loadAuditLogs = async () => {
    const container = document.getElementById('auditLogContainer');
    if (!container) return;
    container.innerHTML = `<div class="spinner-center"><div class="spinner"></div></div>`;
    const res = await getAuditLogs();
    const logs = (res && res.logs) ? res.logs : [];

    if (!logs.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📑</div><div class="empty-state-title">No audit events yet</div><p class="empty-state-text">Admin actions will be recorded here.</p></div>`;
      return;
    }

    container.innerHTML = `
      <div class="table-wrapper">
        <table class="table-mobile-cards">
          <thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
          <tbody>
            ${logs.map(l => `
              <tr>
                <td data-label="Time" style="font-size:12px;white-space:nowrap;">${formatDate(l.created_at)}</td>
                <td data-label="Admin" style="font-size:12px;">${escapeHtml(l.admin_name)}</td>
                <td data-label="Action"><code style="font-size:11px;">${escapeHtml(l.action)}</code></td>
                <td data-label="Target" style="font-size:12px;">${escapeHtml(l.target_username || l.target_user_id || '—')}</td>
                <td data-label="Details" style="font-size:12px;">${escapeHtml(l.details)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <p style="font-size:12px;color:var(--gray-500);margin-top:8px;">${logs.length} events recorded</p>
    `;
  };

  await window.loadAuditLogs();
}
