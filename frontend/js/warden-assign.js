/**
 * FixFirst AI — Warden Operations & Worker Assignment Panel
 * ==========================================================
 * Allows Wardens and Admins to:
 *   • Review incoming campus complaints and AI classifications
 *   • Assign tasks to specialized maintenance workers with instructions
 *   • Monitor critical P1 biohazard and electrical alerts
 *   • Track SLA overdue tasks
 *   • Verify completed repairs and provide quality feedback
 */

import {
  getComplaints,
  getWorkers,
  assignWorker,
  verifyRepair,
  getCriticalAlerts,
  getOverdueTasks,
} from './api.js';
import {
  escapeHtml,
  priorityBadge,
  statusBadge,
  formatDate,
  showToast,
  openModal,
  closeModal,
} from './app.js';

let cachedWorkers = [];

export async function loadWardenPanel() {
  const page = document.getElementById('page-warden-assign');
  if (!page) return;

  page.innerHTML = `
    <!-- Header Banner -->
    <div class="card mb-24" style="background:linear-gradient(135deg,#15803d,#166534);color:white;border-radius:var(--radius-lg);padding:22px 26px;border:none;">
      <div class="flex justify-between items-center flex-wrap gap-16">
        <div>
          <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:12px;display:inline-block;margin-bottom:8px;">
            🛡️ Warden Operations Command
          </span>
          <h2 style="font-size:22px;color:white;font-weight:700;line-height:1.2;">
            Worker Assignment & Task Verification
          </h2>
          <p style="font-size:13px;opacity:0.9;margin-top:6px;max-width:640px;">
            Delegate unassigned campus repairs to available technicians, review P1 critical biohazards, and verify completed jobs.
          </p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-sm" style="background:white;color:#15803d;font-weight:700;" onclick="window.switchWardenTab('unassigned')">
            📋 Unassigned Queue
          </button>
          <button class="btn btn-sm" style="background:rgba(255,255,255,0.2);color:white;" onclick="window.switchWardenTab('critical')">
            🚨 P1 Alerts
          </button>
          <button class="btn btn-sm" style="background:rgba(255,255,255,0.2);color:white;" onclick="window.switchWardenTab('overdue')">
            ⏳ Overdue Tasks
          </button>
          <button class="btn btn-sm" style="background:rgba(255,255,255,0.2);color:white;" onclick="window.switchWardenTab('verification')">
            ✅ Verification Queue
          </button>
        </div>
      </div>
    </div>

    <!-- Active Tab Content -->
    <div id="wardenTabContent">
      <div class="spinner-center"><div class="spinner"></div></div>
    </div>
  `;

  // Pre-load available workers
  try {
    const res = await getWorkers();
    cachedWorkers = (res && res.workers) ? res.workers : [];
  } catch (e) {
    cachedWorkers = [];
  }

  await renderUnassignedQueue();
}

window.switchWardenTab = async (tab) => {
  if (tab === 'unassigned') await renderUnassignedQueue();
  else if (tab === 'critical') await renderCriticalAlerts();
  else if (tab === 'overdue') await renderOverdueTasks();
  else if (tab === 'verification') await renderVerificationQueue();
};

// ---------------------------------------------------------------------------
// 1. Unassigned Complaints Queue
// ---------------------------------------------------------------------------

async function renderUnassignedQueue() {
  const container = document.getElementById('wardenTabContent');
  if (!container) return;
  container.innerHTML = `<div class="spinner-center"><div class="spinner"></div></div>`;

  const res = await getComplaints({ per_page: 50, sort_by: 'urgency', order: 'desc' });
  const all = (res && res.complaints) ? res.complaints : [];
  // Unassigned complaints (status == Pending or without assigned_worker_name)
  const unassigned = all.filter(c => !c.assigned_worker_name && c.status !== 'Resolved');

  if (unassigned.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎉</div>
        <div class="empty-state-title">No Unassigned Complaints</div>
        <p class="empty-state-text">All active complaints have been delegated to maintenance workers.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="card mb-16">
      <div class="flex justify-between items-center flex-wrap gap-12">
        <h3 class="card-title" style="margin:0;">
          📋 Complaints Needing Assignment (${unassigned.length})
        </h3>
        <span style="font-size:12px;color:var(--gray-500);">Sorted by calculated urgency score</span>
      </div>
    </div>

    <div class="table-wrapper">
      <table class="table-mobile-cards">
        <thead>
          <tr>
            <th>ID</th>
            <th>Title & Location</th>
            <th>Category</th>
            <th>Priority</th>
            <th>Safety & Risk Details</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${unassigned.map(c => `
            <tr>
              <td data-label="ID"><code>${escapeHtml(c.id)}</code></td>
              <td data-label="Title & Location">
                <strong>${escapeHtml(c.title)}</strong>
                <div style="font-size:12px;color:var(--gray-500);">📍 ${escapeHtml(c.location)} ${c.room_number ? '· Rm ' + escapeHtml(c.room_number) : ''}</div>
              </td>
              <td data-label="Category">${escapeHtml(c.category)}</td>
              <td data-label="Priority">${priorityBadge(c.priority)}</td>
              <td data-label="Risk Details" style="font-size:12px;max-width:280px;">
                ${c.is_sensitive_hygiene ? '<span class="sensitive-badge mb-4">🔒 Sensitive Hygiene Issue</span><br/>' : ''}
                ${escapeHtml(c.priority_reason || c.description || '—')}
              </td>
              <td data-label="Action">
                <button class="btn btn-sm btn-primary" onclick="window.openAssignModal('${escapeHtml(c.id)}', '${escapeHtml(c.title)}', '${escapeHtml(c.category)}')">
                  👷 Assign Worker
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// 2. Critical P1 Alerts Queue
// ---------------------------------------------------------------------------

async function renderCriticalAlerts() {
  const container = document.getElementById('wardenTabContent');
  if (!container) return;
  container.innerHTML = `<div class="spinner-center"><div class="spinner"></div></div>`;

  const res = await getCriticalAlerts();
  const alerts = (res && res.alerts) ? res.alerts : [];

  if (alerts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🛡️</div>
        <div class="empty-state-title">No Active Critical Alerts</div>
        <p class="empty-state-text">No P1 life hazards or acute sanitary contamination incidents are currently open.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="card mb-16" style="border-left:4px solid #ef4444;">
      <h3 class="card-title" style="color:#b91c1c;">
        🚨 P1 Critical Safety & Sanitation Incidents (${alerts.length})
      </h3>
      <p style="font-size:12px;color:var(--gray-600);margin-top:4px;">
        Immediate intervention required. Chemical disinfection for blood contamination and rapid power cut for electrical hazards.
      </p>
    </div>

    <div class="table-wrapper">
      <table class="table-mobile-cards">
        <thead>
          <tr>
            <th>ID</th>
            <th>Hazard Description</th>
            <th>Location</th>
            <th>Type</th>
            <th>Assigned Worker</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${alerts.map(a => `
            <tr style="${a.priority?.includes('P1') ? 'background:#fef2f2;' : ''}">
              <td data-label="ID"><code>${escapeHtml(a.id)}</code></td>
              <td data-label="Hazard">
                <strong style="color:#b91c1c;">${escapeHtml(a.title)}</strong>
                <p style="font-size:12px;margin:4px 0 0;color:var(--gray-700);">${escapeHtml(a.priority_reason || a.description)}</p>
              </td>
              <td data-label="Location">📍 ${escapeHtml(a.location)}</td>
              <td data-label="Type">
                ${a.is_sensitive_hygiene ? '<span class="badge" style="background:#fce7f3;color:#9d174d;">🩸 Bio-Hygiene</span>' : '<span class="badge badge-critical">⚡ Life Hazard</span>'}
              </td>
              <td data-label="Assigned Worker">${escapeHtml(a.assigned_worker_name || 'Unassigned')}</td>
              <td data-label="Status">${statusBadge(a.status)}</td>
              <td data-label="Action">
                <button class="btn btn-sm btn-danger" onclick="window.openAssignModal('${escapeHtml(a.id)}', '${escapeHtml(a.title)}', '${escapeHtml(a.category)}')">
                  ${a.assigned_worker_name ? 'Re-assign' : '⚡ Urgent Assign'}
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// 3. Overdue Tasks
// ---------------------------------------------------------------------------

async function renderOverdueTasks() {
  const container = document.getElementById('wardenTabContent');
  if (!container) return;
  container.innerHTML = `<div class="spinner-center"><div class="spinner"></div></div>`;

  const res = await getOverdueTasks();
  const tasks = (res && res.overdue_tasks) ? res.overdue_tasks : [];

  if (tasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⏱️</div>
        <div class="empty-state-title">No Overdue Tasks</div>
        <p class="empty-state-text">All active maintenance tasks are currently within their SLA completion windows.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="card mb-16" style="border-left:4px solid #f59e0b;">
      <h3 class="card-title" style="color:#b45309;">
        ⏳ Overdue Complaints Exceeding SLA Target (${tasks.length})
      </h3>
      <p style="font-size:12px;color:var(--gray-600);margin-top:4px;">
        Tasks that have not been resolved within target SLA windows (P1: 2h, P2: 8h, P3: 24h).
      </p>
    </div>

    <div class="table-wrapper">
      <table class="table-mobile-cards">
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Location</th>
            <th>Priority</th>
            <th>Assigned Worker</th>
            <th>Age (Hrs)</th>
            <th>Overdue By</th>
          </tr>
        </thead>
        <tbody>
          ${tasks.map(t => `
            <tr>
              <td data-label="ID"><code>${escapeHtml(t.id)}</code></td>
              <td data-label="Title"><strong>${escapeHtml(t.title)}</strong></td>
              <td data-label="Location">${escapeHtml(t.location)}</td>
              <td data-label="Priority">${priorityBadge(t.priority)}</td>
              <td data-label="Assigned Worker">${escapeHtml(t.assigned_worker_name || 'Unassigned')}</td>
              <td data-label="Age">${t.age_hours} hrs</td>
              <td data-label="Overdue By" style="color:#dc2626;font-weight:700;">+${t.hours_overdue} hrs</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// 4. Verification Queue (Repairs awaiting Warden verification)
// ---------------------------------------------------------------------------

async function renderVerificationQueue() {
  const container = document.getElementById('wardenTabContent');
  if (!container) return;
  container.innerHTML = `<div class="spinner-center"><div class="spinner"></div></div>`;

  // Fetch complaints with status == 'In Progress' or where worker has completed
  const res = await getComplaints({ status: 'In Progress', per_page: 50 });
  const inProgress = (res && res.complaints) ? res.complaints : [];

  if (inProgress.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-title">No Repairs Awaiting Sign-off</div>
        <p class="empty-state-text">Repairs completed by workers will appear here for Warden physical verification.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="card mb-16">
      <h3 class="card-title">🔍 Repair Verification & Sign-Off (${inProgress.length})</h3>
      <p style="font-size:12px;color:var(--gray-600);margin-top:4px;">
        Review work completed by technicians. Verify quality and resolve, or request rework if incomplete.
      </p>
    </div>

    <div class="table-wrapper">
      <table class="table-mobile-cards">
        <thead>
          <tr>
            <th>ID</th>
            <th>Complaint</th>
            <th>Location</th>
            <th>Technician</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${inProgress.map(c => `
            <tr>
              <td data-label="ID"><code>${escapeHtml(c.id)}</code></td>
              <td data-label="Complaint">
                <strong>${escapeHtml(c.title)}</strong>
                <div style="font-size:12px;color:var(--gray-500);">${escapeHtml(c.category)} · ${priorityBadge(c.priority)}</div>
              </td>
              <td data-label="Location">${escapeHtml(c.location)}</td>
              <td data-label="Technician">${escapeHtml(c.assigned_worker_name || 'Worker')}</td>
              <td data-label="Status">${statusBadge(c.status)}</td>
              <td data-label="Actions">
                <button class="btn btn-sm btn-success" onclick="window.openVerificationModal('${escapeHtml(c.id)}', 'verify')">
                  ✅ Verify & Resolve
                </button>
                <button class="btn btn-sm btn-secondary" onclick="window.openVerificationModal('${escapeHtml(c.id)}', 'reopen')">
                  🔄 Require Rework
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Assignment Modal
// ---------------------------------------------------------------------------

window.openAssignModal = async (complaintId, title, category) => {
  if (!cachedWorkers.length) {
    try {
      const res = await getWorkers();
      cachedWorkers = (res && res.workers) ? res.workers : [];
    } catch { cachedWorkers = []; }
  }

  // Filter or highlight recommended workers by department matching category
  const workerOptions = cachedWorkers.map(w => {
    return `<option value="${w.id}">${escapeHtml(w.name)} — ${escapeHtml(w.department)} (${escapeHtml(w.assigned_area || 'Campus-wide')}) [Active jobs: ${w.active_jobs_count || 0}]</option>`;
  }).join('');

  openModal(`Assign Worker: ${complaintId}`, `
    <div style="font-size:13px;color:var(--gray-700);margin-bottom:14px;">
      <strong>Issue:</strong> ${escapeHtml(title)}<br/>
      <strong>Category:</strong> ${escapeHtml(category)}
    </div>
    <form id="assignWorkerForm">
      <div class="form-group">
        <label class="form-label">Select Maintenance Worker <span style="color:red">*</span></label>
        <select id="assignWorkerSelect" class="form-control" required>
          <option value="">Choose technician…</option>
          ${workerOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Special Instructions for Worker (optional)</label>
        <textarea id="assignInstructions" class="form-control" rows="3" placeholder="e.g. Ensure PPE is worn. Check circuit breaker before touching switchboard. Contact warden upon arrival."></textarea>
      </div>
      <div id="assignError" class="alert alert-danger" style="display:none;font-size:13px;"></div>
    </form>
  `, `
    <button class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="window._submitWorkerAssignment('${complaintId}')">Confirm Assignment</button>
  `);
};

window._submitWorkerAssignment = async (complaintId) => {
  const workerId = document.getElementById('assignWorkerSelect')?.value;
  const instructions = document.getElementById('assignInstructions')?.value?.trim() || '';
  const errBox = document.getElementById('assignError');

  if (!workerId) {
    if (errBox) { errBox.textContent = 'Please select a worker.'; errBox.style.display = 'block'; }
    return;
  }

  try {
    await assignWorker(complaintId, workerId, instructions);
    closeModal();
    showToast(`✅ Complaint ${complaintId} assigned to technician successfully!`, 'success');
    await renderUnassignedQueue();
  } catch (err) {
    if (errBox) { errBox.textContent = err.message || 'Failed to assign worker.'; errBox.style.display = 'block'; }
  }
};

// ---------------------------------------------------------------------------
// Verification / Reopen Modal
// ---------------------------------------------------------------------------

window.openVerificationModal = (assignmentIdOrComplaintId, action) => {
  const isVerify = action === 'verify';
  openModal(isVerify ? 'Verify & Close Repair' : 'Require Rework', `
    <p style="font-size:13px;color:var(--gray-600);margin-bottom:12px;">
      ${isVerify ? 'Confirm that the maintenance work has been physically inspected and meets campus safety standards.' : 'Explain what issues remain unresolved and what specific corrections are required from the worker.'}
    </p>
    <div class="form-group">
      <label class="form-label">Warden Verification Feedback / Notes</label>
      <textarea id="verifyFeedback" class="form-control" rows="3" placeholder="${isVerify ? 'Inspection completed, repair verified satisfactory.' : 'Issue persists: please re-inspect...'}" required></textarea>
    </div>
    <div id="verifyError" class="alert alert-danger" style="display:none;font-size:13px;"></div>
  `, `
    <button class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
    <button class="btn ${isVerify ? 'btn-success' : 'btn-danger'}" onclick="window._submitVerification('${assignmentIdOrComplaintId}', '${action}')">
      ${isVerify ? '✅ Confirm & Close Ticket' : '🔄 Send Back for Rework'}
    </button>
  `);
};

window._submitVerification = async (assignmentId, action) => {
  const feedback = document.getElementById('verifyFeedback')?.value?.trim() || '';
  const errBox = document.getElementById('verifyError');

  try {
    await verifyRepair(assignmentId, action, feedback);
    closeModal();
    showToast(action === 'verify' ? '✅ Repair verified and complaint closed!' : '🔄 Task returned to worker for rework.', 'success');
    await renderVerificationQueue();
  } catch (err) {
    if (errBox) { errBox.textContent = err.message || 'Failed to submit verification.'; errBox.style.display = 'block'; }
  }
};
