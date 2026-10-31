/**
 * FixFirst AI — Complaints Page
 * ===============================
 * List, search, filter, sort complaints. View complaint detail with AI analysis.
 */

import { getComplaints, getComplaint, updateComplaintStatus, generateTicket, analyzeComplaint } from './api.js';
import { escapeHtml, priorityBadge, statusBadge, formatDate, showToast, openModal, closeModal } from './app.js';

let currentFilters = {};

export async function loadComplaints() {
  const page = document.getElementById('page-complaints');

  page.innerHTML = `
    <h2 class="mb-24" style="font-size:22px;">📋 Complaints</h2>

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
      <div id="complaintsTable"><p style="color:var(--gray-500)">Loading...</p></div>
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
      ${c.urgency_rank ? `<td data-label="#"><span class="urgency-rank-badge ${c.urgency_rank <= 3 ? (c.urgency_rank === 1 ? 'rank-top' : 'rank-high') : ''}">#${c.urgency_rank}</span></td>` : '<td data-label="#"></td>'}
      <td data-label="ID"><strong>${escapeHtml(c.id)}</strong>${c.is_demo ? ' <span style="font-size:10px;color:var(--gray-500);">(demo)</span>' : ''}</td>
      <td data-label="Title" class="truncate" style="max-width:220px;">${escapeHtml(c.title)}</td>
      <td data-label="Location">${escapeHtml(c.location)}</td>
      <td data-label="Category">${escapeHtml(c.category)}</td>
      <td data-label="Priority">${priorityBadge(c.priority)}</td>
      <td data-label="Status">${statusBadge(c.status)}</td>
      <td data-label="Date">${formatDate(c.created_at)}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="table-mobile-cards">
        <thead>
          <tr>
            <th>#</th><th>ID</th><th>Title</th><th>Location</th><th>Category</th><th>Priority</th><th>Status</th><th>Date</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p style="margin-top:12px;font-size:13px;color:var(--gray-500);">Showing ${result.complaints.length} of ${result.total} complaints</p>
  `;
}

// ---------------------------------------------------------------------------
// Complaint Detail View (shown in modal)
// ---------------------------------------------------------------------------

export async function showComplaintDetail(id) {
  openModal('Loading...', '<div class="text-center"><div class="spinner" style="margin:20px auto;"></div></div>');

  const c = await getComplaint(id);
  if (!c) {
    openModal('Error', '<div class="alert alert-danger">Could not load complaint details.</div>');
    return;
  }

  const ai = c.ai_analysis || {};
  const ruleEngine = ai.rule_engine || {};
  const override = ai.priority_override || {};
  const isRuleBased = ai.source === 'rule-engine-fallback' || override.source === 'rule-based';

  let safetyWarning = '';
  if (c.priority === 'Critical') {
    safetyWarning = `
      <div class="alert alert-danger mb-16">
        <span class="alert-icon">🚨</span>
        <div>
          <strong>Potential safety hazard detected.</strong><br>
          Please keep people away from the affected area and notify authorized campus staff immediately.
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
        <div class="detail-value">${escapeHtml(c.id)} ${c.is_demo ? '<span class="ai-tag rule-based">Demo Data</span>' : ''}</div>
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
        <div class="detail-label">Date</div>
        <div class="detail-value">${formatDate(c.created_at)}</div>
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

    <h4 class="section-title">Priority & Analysis ${isRuleBased ? '<span class="ai-tag rule-based">Rule-Based</span>' : '<span class="ai-tag ai-based">AI Analyzed</span>'}</h4>

    <div class="detail-grid mb-16">
      <div class="detail-item">
        <div class="detail-label">Priority</div>
        <div class="detail-value">${priorityBadge(c.priority)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Assigned Department</div>
        <div class="detail-value">${escapeHtml(c.assigned_department || '—')}</div>
      </div>
    </div>

    <div class="ai-analysis-section mb-16">
      <h4>💬 Why this priority?</h4>
      <p style="margin-top:8px;">${escapeHtml(c.priority_reason || ai.explanation || 'No explanation available.')}</p>
      ${override.override_applied ? `<p style="margin-top:8px;font-weight:600;color:var(--red);">⚡ Safety override applied: ${escapeHtml(override.explanation || '')}</p>` : ''}
    </div>

    ${ai.summary ? `
    <div class="detail-item mb-8">
      <div class="detail-label">AI Summary</div>
      <div class="detail-value">${escapeHtml(ai.summary)}</div>
    </div>` : ''}

    ${ai.risk_indicators && ai.risk_indicators.length > 0 ? `
    <div class="detail-item mb-8">
      <div class="detail-label">Risk Indicators</div>
      <div class="detail-value">
        <ul style="margin:4px 0 0 16px;">
          ${ai.risk_indicators.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
        </ul>
      </div>
    </div>` : ''}

    ${ai.suggested_action ? `
    <div class="detail-item mb-16">
      <div class="detail-label">Recommended Action</div>
      <div class="detail-value" style="font-weight:500;">${escapeHtml(ai.suggested_action)}</div>
    </div>` : ''}

    <h4 class="section-title mt-24">Update Status</h4>
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
      <select class="filter-select" id="statusSelect">
        ${['Pending', 'Assigned', 'In Progress', 'Resolved'].map(s =>
          `<option value="${s}" ${c.status === s ? 'selected' : ''}>${s}</option>`
        ).join('')}
      </select>
      <button class="btn btn-primary btn-sm" id="updateStatusBtn">Update Status</button>
      <button class="btn btn-secondary btn-sm" id="reanalyzeBtn">🤖 Re-Analyze with AI</button>
      <button class="btn btn-primary btn-sm" id="genTicketBtn">🎫 Generate Ticket</button>
    </div>
  `;

  openModal(`Complaint ${c.id}`, body);

  // Update status button
  document.getElementById('updateStatusBtn').addEventListener('click', async () => {
    const newStatus = document.getElementById('statusSelect').value;
    try {
      await updateComplaintStatus(c.id, newStatus);
      showToast(`Status updated to "${newStatus}"`, 'success');
      closeModal();
      if (document.getElementById('page-complaints').classList.contains('active')) fetchAndRender();
    } catch (err) {
      showToast('Failed to update: ' + err.message, 'error');
    }
  });

  // Re-analyze button
  document.getElementById('reanalyzeBtn').addEventListener('click', async () => {
    const btn = document.getElementById('reanalyzeBtn');
    btn.classList.add('btn-loading');
    btn.disabled = true;
    try {
      const updated = await analyzeComplaint(c.id);
      showToast(`Re-analyzed! New priority: ${updated.priority}`, 'success');
      closeModal();
      showComplaintDetail(c.id);
    } catch (err) {
      showToast('Re-analysis failed: ' + err.message, 'error');
    } finally {
      btn.classList.remove('btn-loading');
      btn.disabled = false;
    }
  });

  // Generate ticket button
  document.getElementById('genTicketBtn').addEventListener('click', async () => {
    const btn = document.getElementById('genTicketBtn');
    btn.classList.add('btn-loading');
    btn.disabled = true;
    try {
      const ticket = await generateTicket(c.id);
      showToast(`Ticket ${ticket.id} generated!`, 'success');
      closeModal();

      // Show ticket detail
      showTicketInModal(ticket);
    } catch (err) {
      showToast('Ticket generation failed: ' + err.message, 'error');
    } finally {
      btn.classList.remove('btn-loading');
      btn.disabled = false;
    }
  });
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
        No real campus department has been contacted.
      </div>
    </div>

    <div class="detail-grid mb-16">
      <div class="detail-item">
        <div class="detail-label">Ticket ID</div>
        <div class="detail-value"><strong>${escapeHtml(t.id)}</strong></div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Complaint ID</div>
        <div class="detail-value">${escapeHtml(t.complaint_id)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Location</div>
        <div class="detail-value">${escapeHtml(t.location)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Priority</div>
        <div class="detail-value">${priorityBadge(t.priority)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Department</div>
        <div class="detail-value">${escapeHtml(t.department)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Status</div>
        <div class="detail-value">${statusBadge(t.status)}</div>
      </div>
    </div>

    <div class="detail-item mb-8">
      <div class="detail-label">Issue Summary</div>
      <div class="detail-value">${escapeHtml(t.issue_summary)}</div>
    </div>

    <div class="detail-item mb-8">
      <div class="detail-label">Priority Reason</div>
      <div class="detail-value">${escapeHtml(t.priority_reason)}</div>
    </div>

    <div class="detail-item mb-16">
      <div class="detail-label">Recommended Action</div>
      <div class="detail-value" style="font-weight:500;">${escapeHtml(t.recommended_action)}</div>
    </div>

    <div class="detail-item">
      <div class="detail-label">Created</div>
      <div class="detail-value">${formatDate(t.created_at)}</div>
    </div>
  `;

  const footer = `<button class="btn btn-secondary btn-sm" onclick="window.print()">🖨️ Print Ticket</button>`;

  openModal(`Maintenance Ticket — ${t.id}`, body, footer);
}

// Export for tickets page to use
window._showTicketModal = showTicketInModal;
