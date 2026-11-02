/**
 * FixFirst AI — Role-Specific Dashboard Manager
 * ===============================================
 * Renders tailored dashboards based on the user's role:
 *   - Student: Own complaints, status tracking, reopen & satisfaction feedback
 *   - Warden: Campus operations, P1 hazards, worker assignment quick action
 *   - Worker: Assigned repair workload, status overview
 *   - Admin: System metrics, candidate status, audit trails
 */

import {
  getStats,
  getComplaints,
  getWorkerTasks,
  getAllCandidates,
  getAuditLogs,
  reopenComplaint,
  submitComplaintFeedback,
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
import { getAuthState } from './auth.js';

export async function loadDashboard() {
  const auth = getAuthState();
  const role = auth.role ? auth.role.toLowerCase() : 'student';

  if (role === 'worker') {
    await loadWorkerDashboardSummary();
  } else if (role === 'admin') {
    await loadAdminDashboardSummary();
  } else if (role === 'warden' || role === 'teacher') {
    await loadStaffDashboard();
  } else {
    await loadStudentDashboard();
  }
}

// ---------------------------------------------------------------------------
// 1. Student Dashboard
// ---------------------------------------------------------------------------

async function loadStudentDashboard() {
  const page = document.getElementById('page-dashboard');
  const auth = getAuthState();
  const userName = auth.user ? (auth.user.full_name || auth.user.username) : 'Student';

  page.innerHTML = `
    <!-- Welcome Banner -->
    <div class="card mb-24" style="background:linear-gradient(135deg,#1d4ed8,#1e40af);color:white;border-radius:var(--radius-lg);padding:22px 26px;border:none;">
      <div class="flex justify-between items-center flex-wrap gap-16">
        <div>
          <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:12px;display:inline-block;margin-bottom:8px;">
            🎓 Student Portal
          </span>
          <h2 style="font-size:22px;color:white;font-weight:700;line-height:1.2;">
            Welcome, ${escapeHtml(userName)}!
          </h2>
          <p style="font-size:13px;opacity:0.9;margin-top:6px;max-width:580px;line-height:1.5;">
            Submit campus maintenance complaints, track real-time AI priority and technician progress, and reopen repairs if unsatisfied.
          </p>
        </div>
        <div>
          <button class="btn btn-sm" style="background:white;color:#1d4ed8;font-weight:700;padding:8px 16px;" onclick="navigateTo('submit')">
            📝 Submit New Complaint →
          </button>
        </div>
      </div>
    </div>

    <!-- Student Stats Strip -->
    <div class="stats-grid" id="studentStatsGrid">
      <div class="stat-card"><div class="stat-info"><div class="stat-label">Loading stats...</div></div></div>
    </div>

    <div class="dashboard-grid" style="margin-top:24px;">
      <div>
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">📋 My Recent Complaints</h3>
            <button class="btn btn-sm btn-secondary" onclick="navigateTo('complaints')">View All</button>
          </div>
          <div id="studentRecentComplaints"><p style="color:var(--gray-500)">Loading your complaints...</p></div>
        </div>
      </div>
      <div>
        <div class="card mb-24">
          <h3 class="card-title mb-16">⚡ Quick Actions</h3>
          <div class="quick-actions">
            <button class="btn btn-primary btn-sm" onclick="navigateTo('submit')">📝 Report Maintenance Issue</button>
            <button class="btn btn-secondary btn-sm" onclick="navigateTo('complaints')">📋 My Complaints History</button>
          </div>
        </div>
        <div class="card">
          <h3 class="card-title mb-16">📌 Transparent Resolution Cycle</h3>
          <div style="display:flex;flex-direction:column;gap:12px;">
            ${[
              ['1️⃣', 'Submit Complaint', 'Provide clear details and optional location photos.'],
              ['2️⃣', 'AI + Safety Validation', 'OpenAI context analysis + deterministic life-safety override.'],
              ['3️⃣', 'Technician Dispatched', 'Warden assigns specialized worker with priority SLA.'],
              ['4️⃣', 'Verification & Feedback', 'Confirm repair satisfaction or reopen with 1-click.'],
            ].map(([icon, title, desc]) => `
              <div style="display:flex;gap:10px;align-items:flex-start;">
                <span style="font-size:18px;">${icon}</span>
                <div>
                  <strong style="font-size:13px;color:var(--gray-900);">${title}</strong>
                  <p style="font-size:12px;color:var(--gray-500);margin:2px 0 0;">${desc}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  // Load stats
  const stats = await getStats();
  if (stats && stats.student_stats) {
    const ss = stats.student_stats;
    document.getElementById('studentStatsGrid').innerHTML = `
      <div class="stat-card">
        <div class="stat-icon">📋</div>
        <div class="stat-info">
          <div class="stat-number">${ss.my_total || 0}</div>
          <div class="stat-label">My Complaints</div>
        </div>
      </div>
      <div class="stat-card high">
        <div class="stat-icon">⏳</div>
        <div class="stat-info">
          <div class="stat-number">${ss.my_pending || 0}</div>
          <div class="stat-label">Pending / In Progress</div>
        </div>
      </div>
      <div class="stat-card" style="background:linear-gradient(135deg,#dcfce7,#bbf7d0);">
        <div class="stat-icon">✅</div>
        <div class="stat-info">
          <div class="stat-number">${ss.my_resolved || 0}</div>
          <div class="stat-label">Resolved & Verified</div>
        </div>
      </div>
    `;
  } else if (stats) {
    document.getElementById('studentStatsGrid').innerHTML = `
      <div class="stat-card">
        <div class="stat-icon">📋</div>
        <div class="stat-info"><div class="stat-number">${stats.total || 0}</div><div class="stat-label">Campus Complaints</div></div>
      </div>
      <div class="stat-card high">
        <div class="stat-icon">⏳</div>
        <div class="stat-info"><div class="stat-number">${stats.pending || 0}</div><div class="stat-label">Pending</div></div>
      </div>
    `;
  }

  // Load student complaints
  const result = await getComplaints({ per_page: 8, sort_by: 'date', order: 'desc' });
  const container = document.getElementById('studentRecentComplaints');
  if (result && result.complaints && result.complaints.length > 0) {
    const rows = result.complaints.map(c => {
      const isResolved = c.status === 'Resolved';
      return `
        <tr>
          <td data-label="Title" class="clickable" onclick="showComplaintDetail('${escapeHtml(c.id)}')">
            <strong>${escapeHtml(c.title)}</strong>
            <div style="font-size:12px;color:var(--gray-500);">📍 ${escapeHtml(c.location)}</div>
          </td>
          <td data-label="Priority">${priorityBadge(c.priority)}</td>
          <td data-label="Status">${statusBadge(c.status)}</td>
          <td data-label="Assigned Worker">${escapeHtml(c.assigned_worker_name || 'Pending assignment')}</td>
          <td data-label="Date">${formatDate(c.created_at)}</td>
          <td data-label="Actions">
            ${isResolved ? `
              <div style="display:flex;gap:4px;flex-wrap:wrap;">
                <button class="btn btn-xs btn-outline-primary" onclick="window.promptFeedback('${escapeHtml(c.id)}')">
                  ⭐ Feedback
                </button>
                <button class="btn btn-xs btn-outline-danger" onclick="window.promptReopen('${escapeHtml(c.id)}')">
                  🔄 Reopen
                </button>
              </div>
            ` : `
              <button class="btn btn-xs btn-secondary" onclick="showComplaintDetail('${escapeHtml(c.id)}')">View</button>
            `}
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="table-wrapper">
        <table class="table-mobile-cards">
          <thead>
            <tr><th>Title & Location</th><th>Priority</th><th>Status</th><th>Technician</th><th>Date</th><th>Action</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } else if (result && result.complaints && result.complaints.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <div class="empty-state-title">No complaints yet</div>
        <p class="empty-state-text">You haven't submitted any maintenance requests. Need something repaired?</p>
        <button class="btn btn-primary btn-sm" onclick="navigateTo('submit')">Submit Complaint</button>
      </div>
    `;
  } else {
    container.innerHTML = `<div class="alert alert-danger">Could not load complaints. Please verify server connection.</div>`;
  }
}

// ---------------------------------------------------------------------------
// Student Reopen & Feedback Modals
// ---------------------------------------------------------------------------

window.promptReopen = (complaintId) => {
  openModal(`Reopen Complaint: ${complaintId}`, `
    <p style="font-size:13px;color:var(--gray-600);margin-bottom:12px;">
      If the issue was marked resolved but the problem persists or was poorly repaired, explain what is still broken:
    </p>
    <div class="form-group">
      <label class="form-label">Reason for reopening <span style="color:red">*</span></label>
      <textarea id="reopenReasonInput" class="form-control" rows="3" placeholder="Describe the ongoing defect..." required></textarea>
    </div>
    <div id="reopenError" class="alert alert-danger" style="display:none;font-size:13px;"></div>
  `, `
    <button class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
    <button class="btn btn-danger" onclick="window._submitStudentReopen('${complaintId}')">🔄 Reopen Complaint</button>
  `);
};

window._submitStudentReopen = async (complaintId) => {
  const reason = document.getElementById('reopenReasonInput')?.value?.trim();
  const errBox = document.getElementById('reopenError');
  if (!reason) {
    if (errBox) { errBox.textContent = 'Please provide a reason.'; errBox.style.display = 'block'; }
    return;
  }
  try {
    await reopenComplaint(complaintId, reason);
    closeModal();
    showToast('Complaint reopened. The Warden has been notified.', 'success');
    await loadStudentDashboard();
  } catch (err) {
    if (errBox) { errBox.textContent = err.message || 'Failed to reopen complaint.'; errBox.style.display = 'block'; }
  }
};

window.promptFeedback = (complaintId) => {
  openModal(`Resolution Feedback: ${complaintId}`, `
    <p style="font-size:13px;color:var(--gray-600);margin-bottom:12px;">
      Rate the repair quality and technician performance:
    </p>
    <div class="form-group">
      <label class="form-label">Rating (1 to 5 Stars)</label>
      <select id="feedbackRatingSelect" class="form-control">
        <option value="5">⭐⭐⭐⭐⭐ 5 - Excellent repair</option>
        <option value="4">⭐⭐⭐⭐ 4 - Good quality</option>
        <option value="3">⭐⭐⭐ 3 - Satisfactory</option>
        <option value="2">⭐⭐ 2 - Subpar quality</option>
        <option value="1">⭐ 1 - Very poor repair</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Comments (optional)</label>
      <textarea id="feedbackCommentInput" class="form-control" rows="3" placeholder="Additional remarks for maintenance staff..."></textarea>
    </div>
    <div id="feedbackError" class="alert alert-danger" style="display:none;font-size:13px;"></div>
  `, `
    <button class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="window._submitStudentFeedback('${complaintId}')">Submit Feedback</button>
  `);
};

window._submitStudentFeedback = async (complaintId) => {
  const rating = parseInt(document.getElementById('feedbackRatingSelect')?.value || '5', 10);
  const comment = document.getElementById('feedbackCommentInput')?.value?.trim() || '';
  const errBox = document.getElementById('feedbackError');
  try {
    await submitComplaintFeedback(complaintId, rating, comment);
    closeModal();
    showToast('Thank you for your feedback!', 'success');
    await loadStudentDashboard();
  } catch (err) {
    if (errBox) { errBox.textContent = err.message || 'Failed to submit feedback.'; errBox.style.display = 'block'; }
  }
};

// ---------------------------------------------------------------------------
// 2. Warden Dashboard
// ---------------------------------------------------------------------------

async function loadStaffDashboard() {
  const page = document.getElementById('page-dashboard');
  const auth = getAuthState();
  const userName = auth.user ? (auth.user.full_name || auth.user.username) : 'Warden';

  page.innerHTML = `
    <!-- Hero Banner -->
    <div class="card mb-24" style="background:linear-gradient(135deg,#15803d,#166534);color:white;border-radius:var(--radius-lg);padding:22px 26px;border:none;">
      <div class="flex justify-between items-center flex-wrap gap-16">
        <div>
          <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:12px;display:inline-block;margin-bottom:8px;">
            🛡️ Warden Operations Command
          </span>
          <h2 style="font-size:22px;color:white;font-weight:700;line-height:1.2;">
            Welcome, ${escapeHtml(userName)}
          </h2>
          <p style="font-size:13px;opacity:0.9;margin-top:6px;max-width:680px;">
            Campus-wide risk intelligence, worker assignment dispatch, critical biohazards, and SLA escalation tracking.
          </p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-sm" style="background:white;color:#15803d;font-weight:700;padding:8px 16px;" onclick="navigateTo('warden-assign')">
            👷 Assign Workers →
          </button>
          <button class="btn btn-sm" style="background:rgba(255,255,255,0.15);color:white;font-weight:600;padding:8px 16px;" onclick="navigateTo('ranked-queue')">
            🚨 Urgency Queue
          </button>
        </div>
      </div>
    </div>

    <!-- Campus Stats Strip -->
    <div class="stats-grid" id="statsGrid">
      <div class="stat-card"><div class="stat-info"><div class="stat-label">Loading stats...</div></div></div>
    </div>

    <div class="dashboard-grid" style="margin-top:24px;">
      <div>
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">🚨 Recent Urgent Complaints</h3>
            <button class="btn btn-sm btn-secondary" onclick="navigateTo('complaints')">View All</button>
          </div>
          <div id="recentComplaints"><p style="color:var(--gray-500)">Loading...</p></div>
        </div>
      </div>
      <div>
        <div class="card mb-24">
          <h3 class="card-title mb-16">⚡ Warden Quick Actions</h3>
          <div class="quick-actions">
            <button class="btn btn-primary btn-sm" onclick="navigateTo('warden-assign')">👷 Assign Workers</button>
            <button class="btn btn-danger btn-sm" onclick="navigateTo('ranked-queue')">📊 Urgency Queue</button>
            <button class="btn btn-secondary btn-sm" onclick="navigateTo('risk-intelligence')">🧭 Campus Risk Map</button>
          </div>
        </div>
        <div class="card mb-24">
          <h3 class="card-title mb-16">📊 Priority Breakdown</h3>
          <div id="priorityChart"><p style="color:var(--gray-500)">Loading...</p></div>
        </div>
        <div class="card">
          <h3 class="card-title mb-16">📁 Top Categories</h3>
          <div id="categoryBreakdown"><p style="color:var(--gray-500)">Loading...</p></div>
        </div>
      </div>
    </div>
  `;

  // Fetch stats
  const stats = await getStats();
  if (stats) {
    document.getElementById('statsGrid').innerHTML = `
      <div class="stat-card critical">
        <div class="stat-icon">🚨</div>
        <div class="stat-info"><div class="stat-number">${stats.critical || 0}</div><div class="stat-label">P1 Critical</div></div>
      </div>
      <div class="stat-card high">
        <div class="stat-icon">⚠️</div>
        <div class="stat-info"><div class="stat-number">${stats.high || 0}</div><div class="stat-label">P2 High</div></div>
      </div>
      <div class="stat-card pending">
        <div class="stat-icon">⏳</div>
        <div class="stat-info"><div class="stat-number">${stats.pending || 0}</div><div class="stat-label">Pending Action</div></div>
      </div>
      <div class="stat-card" style="background:linear-gradient(135deg,#dcfce7,#bbf7d0);">
        <div class="stat-icon">✅</div>
        <div class="stat-info"><div class="stat-number">${stats.resolved || 0}</div><div class="stat-label">Resolved</div></div>
      </div>
    `;
  }

  // Load recent complaints
  const result = await getComplaints({ per_page: 6, sort_by: 'urgency', order: 'desc' });
  if (result && result.complaints && result.complaints.length > 0) {
    const rows = result.complaints.map(c => `
      <tr class="clickable" onclick="showComplaintDetail('${escapeHtml(c.id)}')">
        <td data-label="ID"><code>${escapeHtml(c.id)}</code></td>
        <td data-label="Title">${escapeHtml(c.title)}</td>
        <td data-label="Location">${escapeHtml(c.location)}</td>
        <td data-label="Priority">${priorityBadge(c.priority)}</td>
        <td data-label="Assigned Worker">${escapeHtml(c.assigned_worker_name || 'Unassigned')}</td>
        <td data-label="Status">${statusBadge(c.status)}</td>
      </tr>
    `).join('');

    document.getElementById('recentComplaints').innerHTML = `
      <div class="table-wrapper">
        <table class="table-mobile-cards">
          <thead><tr><th>ID</th><th>Title</th><th>Location</th><th>Priority</th><th>Technician</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  // Priority chart & category counts
  const allData = await getComplaints({ per_page: 200 });
  if (allData && allData.complaints) {
    const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    const catCounts = {};
    allData.complaints.forEach(c => {
      const p = (c.priority || '').toLowerCase();
      if (p.includes('critical') || p.includes('p1')) counts.Critical++;
      else if (p.includes('high') || p.includes('p2')) counts.High++;
      else if (p.includes('medium') || p.includes('p3')) counts.Medium++;
      else counts.Low++;
      catCounts[c.category] = (catCounts[c.category] || 0) + 1;
    });

    const max = Math.max(1, ...Object.values(counts));
    const chartEl = document.getElementById('priorityChart');
    if (chartEl) {
      chartEl.innerHTML = `
        <div class="priority-bar-chart">
          ${['Critical', 'High', 'Medium', 'Low'].map(p => `
            <div class="priority-bar-row">
              <span class="priority-bar-label">${p}</span>
              <div class="priority-bar-track">
                <div class="priority-bar-fill ${p.toLowerCase()}" style="width:${(counts[p] / max) * 100}%"></div>
              </div>
              <span class="priority-bar-count">${counts[p]}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    const catEl = document.getElementById('categoryBreakdown');
    if (catEl) {
      const sorted = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
      catEl.innerHTML = `
        <ul class="category-list">
          ${sorted.map(([cat, count]) => `
            <li><span>${escapeHtml(cat)}</span><span class="category-count">${count}</span></li>
          `).join('')}
        </ul>
      `;
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Worker Dashboard Summary
// ---------------------------------------------------------------------------

async function loadWorkerDashboardSummary() {
  const page = document.getElementById('page-dashboard');
  const auth = getAuthState();
  const userName = auth.user ? (auth.user.full_name || auth.user.username) : 'Worker';

  page.innerHTML = `
    <div class="card mb-24" style="background:linear-gradient(135deg,#b45309,#92400e);color:white;border-radius:var(--radius-lg);padding:22px 26px;border:none;">
      <div class="flex justify-between items-center flex-wrap gap-16">
        <div>
          <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:12px;display:inline-block;margin-bottom:8px;">
            🔧 Field Technician Portal
          </span>
          <h2 style="font-size:22px;color:white;font-weight:700;">Welcome, ${escapeHtml(userName)}!</h2>
          <p style="font-size:13px;opacity:0.9;margin-top:6px;">
            Manage and update your assigned campus maintenance jobs.
          </p>
        </div>
        <button class="btn btn-sm" style="background:white;color:#b45309;font-weight:700;" onclick="navigateTo('worker-tasks')">
          🔧 Go to My Tasks →
        </button>
      </div>
    </div>
    <div id="workerDashboardSummary"><div class="spinner-center"><div class="spinner"></div></div></div>
  `;

  const res = await getWorkerTasks();
  const tasks = (res && res.tasks) ? res.tasks : [];
  const pending = tasks.filter(t => t.status === 'Pending').length;
  const inProg  = tasks.filter(t => t.status === 'In Progress').length;
  const done    = tasks.filter(t => ['Completed', 'Verified'].includes(t.status)).length;

  document.getElementById('workerDashboardSummary').innerHTML = `
    <div class="stats-grid mb-24">
      <div class="stat-card high"><div class="stat-icon">⏳</div><div class="stat-info"><div class="stat-number">${pending}</div><div class="stat-label">Pending Acceptance</div></div></div>
      <div class="stat-card" style="background:linear-gradient(135deg,#fef3c7,#fde68a);"><div class="stat-icon">🔧</div><div class="stat-info"><div class="stat-number">${inProg}</div><div class="stat-label">In Progress</div></div></div>
      <div class="stat-card" style="background:linear-gradient(135deg,#dcfce7,#bbf7d0);"><div class="stat-icon">✅</div><div class="stat-info"><div class="stat-number">${done}</div><div class="stat-label">Repairs Completed</div></div></div>
    </div>
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">🔧 Active Assigned Jobs</h3>
        <button class="btn btn-sm btn-primary" onclick="navigateTo('worker-tasks')">Open Task Manager</button>
      </div>
      <div class="table-wrapper">
        <table class="table-mobile-cards">
          <thead><tr><th>Task</th><th>Location</th><th>Priority</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            ${tasks.slice(0, 5).map(t => `
              <tr>
                <td data-label="Task"><strong>${escapeHtml(t.complaint_title || 'Maintenance Job')}</strong></td>
                <td data-label="Location">${escapeHtml(t.location || '—')}</td>
                <td data-label="Priority">${priorityBadge(t.priority || 'P3 – Medium')}</td>
                <td data-label="Status">${statusBadge(t.status)}</td>
                <td data-label="Action"><button class="btn btn-xs btn-primary" onclick="navigateTo('worker-tasks')">Manage</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// 4. Admin Dashboard Summary
// ---------------------------------------------------------------------------

async function loadAdminDashboardSummary() {
  const page = document.getElementById('page-dashboard');
  const auth = getAuthState();
  const userName = auth.user ? (auth.user.full_name || auth.user.username) : 'Admin';

  page.innerHTML = `
    <div class="card mb-24" style="background:linear-gradient(135deg,#7c3aed,#5b21b6);color:white;border-radius:var(--radius-lg);padding:22px 26px;border:none;">
      <div class="flex justify-between items-center flex-wrap gap-16">
        <div>
          <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:12px;display:inline-block;margin-bottom:8px;">
            ⚙️ Administrator Command Console
          </span>
          <h2 style="font-size:22px;color:white;font-weight:700;">Welcome, ${escapeHtml(userName)}</h2>
          <p style="font-size:13px;opacity:0.9;margin-top:6px;">
            Full system control: candidate management, role permissions, audit trails, and system health.
          </p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-sm" style="background:white;color:#7c3aed;font-weight:700;" onclick="navigateTo('admin-candidates')">
            👥 Candidate Management
          </button>
          <button class="btn btn-sm" style="background:rgba(255,255,255,0.2);color:white;" onclick="navigateTo('admin-audit')">
            📑 View Audit Logs
          </button>
        </div>
      </div>
    </div>
    <div id="adminDashboardSummary"><div class="spinner-center"><div class="spinner"></div></div></div>
  `;

  const candRes = await getAllCandidates();
  const candidates = (candRes && candRes.candidates) ? candRes.candidates : [];
  const auditRes = await getAuditLogs();
  const logs = (auditRes && auditRes.logs) ? auditRes.logs : [];

  const students = candidates.filter(c => c.role === 'student').length;
  const wardens  = candidates.filter(c => c.role === 'warden' || c.role === 'teacher').length;
  const workers  = candidates.filter(c => c.role === 'worker').length;
  const admins   = candidates.filter(c => c.role === 'admin').length;

  document.getElementById('adminDashboardSummary').innerHTML = `
    <div class="stats-grid mb-24">
      <div class="stat-card" style="background:linear-gradient(135deg,#dbeafe,#bfdbfe);"><div class="stat-icon">🎓</div><div class="stat-info"><div class="stat-number">${students}</div><div class="stat-label">Students</div></div></div>
      <div class="stat-card" style="background:linear-gradient(135deg,#dcfce7,#bbf7d0);"><div class="stat-icon">🛡️</div><div class="stat-info"><div class="stat-number">${wardens}</div><div class="stat-label">Wardens</div></div></div>
      <div class="stat-card" style="background:linear-gradient(135deg,#fef3c7,#fde68a);"><div class="stat-icon">🔧</div><div class="stat-info"><div class="stat-number">${workers}</div><div class="stat-label">Field Workers</div></div></div>
      <div class="stat-card" style="background:linear-gradient(135deg,#f3e8ff,#e9d5ff);"><div class="stat-icon">⚙️</div><div class="stat-info"><div class="stat-number">${admins}</div><div class="stat-label">Admins</div></div></div>
    </div>
    <div class="dashboard-grid">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">👥 Recent Accounts</h3>
          <button class="btn btn-sm btn-secondary" onclick="navigateTo('admin-candidates')">Manage All</button>
        </div>
        <div class="table-wrapper">
          <table class="table-mobile-cards">
            <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th></tr></thead>
            <tbody>
              ${candidates.slice(0, 5).map(c => `
                <tr>
                  <td data-label="Name"><strong>${escapeHtml(c.full_name)}</strong></td>
                  <td data-label="Username"><code>${escapeHtml(c.username)}</code></td>
                  <td data-label="Role"><span class="badge">${escapeHtml(c.role)}</span></td>
                  <td data-label="Status">${escapeHtml(c.account_status || 'Active')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">📑 Recent Audit Activity</h3>
          <button class="btn btn-sm btn-secondary" onclick="navigateTo('admin-audit')">All Logs</button>
        </div>
        <div style="font-size:12px;display:flex;flex-direction:column;gap:8px;">
          ${logs.slice(0, 5).map(l => `
            <div style="padding:8px;background:var(--gray-50);border-radius:6px;border-left:3px solid #7c3aed;">
              <strong>${escapeHtml(l.action)}</strong> by ${escapeHtml(l.admin_name)}<br/>
              <span style="color:var(--gray-600);">${escapeHtml(l.details)}</span>
              <div style="font-size:11px;color:var(--gray-400);margin-top:2px;">${formatDate(l.created_at)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}
