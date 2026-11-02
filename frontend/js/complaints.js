/**
 * FixFirst AI — Complaints Page
 * ===============================
 * List, search, filter, sort complaints. View complaint detail with AI analysis,
 * worker assignment (Warden), and reopen/feedback (Student).
 */

import {
  getComplaints,
  getComplaint,
  updateComplaintStatus,
  generateTicket,
  analyzeComplaint,
  API_BASE,
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

/**
 * Returns an absolute URL for an uploaded image path like "/uploads/abc.jpg".
 * Falls back gracefully if path is null/undefined.
 */
function imageUrl(path) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE}${path}`;
}

let currentFilters = {};

export async function loadComplaints() {
  const page = document.getElementById('page-complaints');
  if (!page) return;

  page.innerHTML = `
    <h2 class="mb-24" style="font-size:22px;">📋 Campus Complaints</h2>

    <div class="toolbar no-print">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input type="text" id="searchInput" placeholder="Search complaints...">
      </div>
      <select class="filter-select" id="filterPriority">
        <option value="">All Priorities</option>
        <option value="Critical">Critical</option>
        <option value="High">High</option>
        <option value="Medium">Medium</option>
        <option value="Low">Low</option>
      </select>
      <select class="filter-select" id="filterStatus">
        <option value="">All Statuses</option>
        <option value="Pending">Pending</option>
        <option value="Assigned">Assigned</option>
        <option value="In Progress">In Progress</option>
        <option value="Resolved">Resolved</option>
      </select>
      <select class="filter-select" id="filterSort">
        <option value="date-desc">Newest First</option>
        <option value="date-asc">Oldest First</option>
        <option value="priority-asc">Priority (High→Low)</option>
        <option value="priority-desc">Priority (Low→High)</option>
        <option value="urgency-desc">🔥 Urgency (High→Low)</option>
      </select>
    </div>

    <div class="card">
      <div id="complaintsTable"><p style="color:var(--gray-500)">Loading complaints...</p></div>
    </div>
  `;

  // Wire up filter events
  let searchTimeout = null;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentFilters.search = e.target.value.trim();
      fetchAndRender();
    }, 300);
  });

  document.getElementById('filterPriority').addEventListener('change', (e) => {
    currentFilters.priority = e.target.value;
    fetchAndRender();
  });

  document.getElementById('filterStatus').addEventListener('change', (e) => {
    currentFilters.status = e.target.value;
    fetchAndRender();
  });

  document.getElementById('filterSort').addEventListener('change', (e) => {
    const [sortBy, order] = e.target.value.split('-');
    currentFilters.sort_by = sortBy;
    currentFilters.order = order;
    fetchAndRender();
  });

  currentFilters = { sort_by: 'date', order: 'desc' };
  fetchAndRender();
}

async function fetchAndRender() {
  const container = document.getElementById('complaintsTable');
  if (!container) return;
  const result = await getComplaints({ ...currentFilters, per_page: 50 });

  if (!result) {
    container.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span> Could not load complaints. Is the backend running?</div>`;
    return;
  }

  if (result.complaints.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-title">No complaints found</div>
        <p class="empty-state-text">Try adjusting your search or filters.</p>
      </div>
    `;
    return;
  }

  const rows = result.complaints.map(c => `
    <tr class="clickable" onclick="showComplaintDetail('${escapeHtml(c.id)}')">
      <td data-label="ID"><code>${escapeHtml(c.id)}</code></td>
      <td data-label="Title">
        <strong>${escapeHtml(c.title)}</strong>
        ${c.is_sensitive_hygiene ? '<span class="sensitive-badge">🔒 Sensitive</span>' : ''}
      </td>
      <td data-label="Photo">
        ${c.image_path
          ? `<img src="${imageUrl(c.image_path)}" alt="Complaint photo" class="complaint-thumb"
               onerror="this.style.display='none';" />`
          : '<span style="color:var(--gray-300);font-size:11px;">—</span>'
        }
      </td>
      <td data-label="Location">${escapeHtml(c.location)}${c.room_number ? ' (' + escapeHtml(c.room_number) + ')' : ''}</td>
      <td data-label="Category">${escapeHtml(c.category)}</td>
      <td data-label="Priority">${priorityBadge(c.priority)}</td>
      <td data-label="Status">${statusBadge(c.status)}</td>
      <td data-label="Assigned Worker">${escapeHtml(c.assigned_worker_name || '—')}</td>
      <td data-label="Date">${formatDate(c.created_at)}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="table-mobile-cards">
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Photo</th>
            <th>Location</th>
            <th>Category</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Technician</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="font-size:12px;color:var(--gray-500);margin-top:12px;">
      Showing ${result.complaints.length} of ${result.total || result.complaints.length} complaints
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Show Complaint Detail Modal
// ---------------------------------------------------------------------------

export async function showComplaintDetail(id) {
  const c = await getComplaint(id);
  if (!c) {
    showToast('Could not load complaint details.', 'error');
    return;
  }

  const auth = getAuthState();
  const role = auth.role ? auth.role.toLowerCase() : 'student';
  const isWarden = role === 'warden' || role === 'teacher' || role === 'admin';
  const isStudent = role === 'student';

  const ai = c.ai_analysis || {};
  const override = ai.priority_override || {};
  const isRuleBased = ai.source === 'rule-engine-fallback' || override.source === 'rule-based';

  let safetyWarning = '';
  if (c.priority?.includes('P1') || c.priority?.includes('Critical')) {
    safetyWarning = `
      <div class="alert alert-danger mb-16">
        <span class="alert-icon">🚨</span>
        <div>
          <strong>Potential Critical Hazard Detected.</strong><br>
          ${c.is_sensitive_hygiene ? 'Chemical disinfection and biohazard handling required immediately.' : 'Immediate electrical isolation or evacuation procedure applies.'}
        </div>
      </div>
    `;
  }

  const body = `
    ${safetyWarning}

    <h4 class="section-title">Complaint Details</h4>
    <div class="detail-grid mb-24">
      <div class="detail-item">
        <div class="detail-label">Complaint ID</div>
        <div class="detail-value"><code>${escapeHtml(c.id)}</code> ${c.is_demo ? '<span class="ai-tag rule-based">Demo Data</span>' : ''}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Status</div>
        <div class="detail-value">${statusBadge(c.status)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Reported By</div>
        <div class="detail-value">${escapeHtml(c.student_name || 'Anonymous')}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Location</div>
        <div class="detail-value">${escapeHtml(c.location)}${c.room_number ? ', ' + escapeHtml(c.room_number) : ''}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Category</div>
        <div class="detail-value">${escapeHtml(c.category)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Assigned Technician</div>
        <div class="detail-value">${escapeHtml(c.assigned_worker_name || 'Pending assignment')}</div>
      </div>
    </div>

    <div class="detail-item mb-16">
      <div class="detail-label">Title</div>
      <div class="detail-value" style="font-size:16px;font-weight:600;">${escapeHtml(c.title)}</div>
    </div>

    <div class="detail-item mb-24">
      <div class="detail-label">Description</div>
      <div class="detail-value">${escapeHtml(c.description)}</div>
    </div>

    ${imageUrl(c.image_path) ? `
    <div class="detail-item mb-24">
      <div class="detail-label">📷 Attached Photo</div>
      <div class="detail-value complaint-photo-wrap">
        <a href="${imageUrl(c.image_path)}" target="_blank" rel="noopener" title="Open full image">
          <img
            src="${imageUrl(c.image_path)}"
            alt="Complaint photo"
            class="complaint-photo-full"
            onerror="this.closest('.complaint-photo-wrap').innerHTML='<span style=&quot;color:var(--gray-400);font-size:13px;&quot;>⚠️ Photo could not be loaded.</span>';"
          />
        </a>
        <p style="font-size:11px;color:var(--gray-400);margin-top:4px;">Click image to open full-size in a new tab.</p>
      </div>
    </div>` : ''}

    <h4 class="section-title">Priority & Safety Intelligence ${isRuleBased ? '<span class="ai-tag rule-based">Rule-Based</span>' : '<span class="ai-tag ai-based">AI Analyzed</span>'}</h4>

    <div class="detail-grid mb-16">
      <div class="detail-item">
        <div class="detail-label">Priority</div>
        <div class="detail-value">${priorityBadge(c.priority)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Responsible Department</div>
        <div class="detail-value">${escapeHtml(c.assigned_department || '—')}</div>
      </div>
    </div>

    <div class="ai-analysis-section mb-16">
      <h4>💬 Assessment Reason</h4>
      <p style="margin-top:8px;">${escapeHtml(c.priority_reason || ai.explanation || ai.reason || 'No explanation available.')}</p>
      ${override.override_applied ? `<p style="margin-top:8px;font-weight:600;color:var(--red);">⚡ Safety override applied: ${escapeHtml(override.explanation || '')}</p>` : ''}
    </div>

    ${ai.summary ? `
    <div class="detail-item mb-8">
      <div class="detail-label">AI Summary</div>
      <div class="detail-value">${escapeHtml(ai.summary)}</div>
    </div>` : ''}

    ${ai.suggested_action || ai.recommended_action ? `
    <div class="detail-item mb-16">
      <div class="detail-label">Recommended Action</div>
      <div class="detail-value" style="font-weight:500;">${escapeHtml(ai.suggested_action || ai.recommended_action)}</div>
    </div>` : ''}

    <!-- Feedback & Reopen if Student & Resolved -->
    ${isStudent && c.status === 'Resolved' ? `
      <div class="card mb-16" style="background:#f0fdf4;border:1px solid #bbf7d0;">
        <h4 style="font-size:14px;color:#15803d;margin-bottom:8px;">Resolution Feedback</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-primary" onclick="window.promptFeedback('${escapeHtml(c.id)}')">⭐ Rate Resolution Quality</button>
          <button class="btn btn-sm btn-danger" onclick="window.promptReopen('${escapeHtml(c.id)}')">🔄 Reopen Complaint</button>
        </div>
      </div>
    ` : ''}

    <!-- Warden Operations -->
    ${isWarden ? `
      <h4 class="section-title mt-24">Warden Operations</h4>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
        <button class="btn btn-primary btn-sm" onclick="window.openAssignModal('${escapeHtml(c.id)}', '${escapeHtml(c.title)}', '${escapeHtml(c.category)}')">
          👷 Assign Worker
        </button>
        <button class="btn btn-secondary btn-sm" id="genTicketBtn">🎫 Generate Ticket</button>
        <button class="btn btn-secondary btn-sm" id="reanalyzeBtn">🤖 Re-Analyze with AI</button>
      </div>

      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;">
        <label style="font-size:12px;font-weight:600;">Manual Status Override:</label>
        <select class="filter-select" id="statusSelect" style="max-width:160px;">
          ${['Pending', 'Assigned', 'In Progress', 'Resolved'].map(s =>
            `<option value="${s}" ${c.status === s ? 'selected' : ''}>${s}</option>`
          ).join('')}
        </select>
        <button class="btn btn-secondary btn-sm" id="updateStatusBtn">Update</button>
      </div>
    ` : ''}
  `;

  openModal(`Complaint ${c.id}`, body);

  // Wire buttons if present
  const updateBtn = document.getElementById('updateStatusBtn');
  if (updateBtn) {
    updateBtn.addEventListener('click', async () => {
      const newStatus = document.getElementById('statusSelect').value;
      try {
        await updateComplaintStatus(c.id, newStatus);
        showToast(`Status updated to "${newStatus}"`, 'success');
        closeModal();
        if (document.getElementById('page-complaints')?.classList.contains('active')) fetchAndRender();
      } catch (err) {
        showToast('Failed to update: ' + err.message, 'error');
      }
    });
  }

  const reanalyzeBtn = document.getElementById('reanalyzeBtn');
  if (reanalyzeBtn) {
    reanalyzeBtn.addEventListener('click', async () => {
      reanalyzeBtn.disabled = true;
      try {
        const updated = await analyzeComplaint(c.id);
        showToast(`Re-analyzed! Priority: ${updated.priority}`, 'success');
        closeModal();
        showComplaintDetail(c.id);
      } catch (err) {
        showToast('Re-analysis failed: ' + err.message, 'error');
      } finally {
        reanalyzeBtn.disabled = false;
      }
    });
  }

  const genTicketBtn = document.getElementById('genTicketBtn');
  if (genTicketBtn) {
    genTicketBtn.addEventListener('click', async () => {
      genTicketBtn.disabled = true;
      try {
        const ticket = await generateTicket(c.id);
        showToast(`Ticket ${ticket.id} generated!`, 'success');
        closeModal();
        showTicketInModal(ticket);
      } catch (err) {
        showToast('Ticket generation failed: ' + err.message, 'error');
      } finally {
        genTicketBtn.disabled = false;
      }
    });
  }
}

function showTicketInModal(t) {
  if (typeof window._showTicketModal === 'function') {
    window._showTicketModal(t);
    return;
  }
  const body = `
    <div class="alert alert-warning mb-16">
      <span class="alert-icon">🔔</span>
      <div>
        <strong>Demo ticket generated locally.</strong><br>
        Department notified.
      </div>
    </div>
    <div class="detail-grid mb-16">
      <div class="detail-item"><div class="detail-label">Ticket ID</div><div class="detail-value"><strong>${escapeHtml(t.id)}</strong></div></div>
      <div class="detail-item"><div class="detail-label">Priority</div><div class="detail-value">${priorityBadge(t.priority)}</div></div>
      <div class="detail-item"><div class="detail-label">Department</div><div class="detail-value">${escapeHtml(t.department)}</div></div>
      <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value">${statusBadge(t.status)}</div></div>
    </div>
  `;
  openModal(`Maintenance Ticket — ${t.id}`, body);
}

window._showTicketModal = showTicketInModal;
