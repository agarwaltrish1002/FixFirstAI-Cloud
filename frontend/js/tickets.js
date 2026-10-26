/**
 * FixFirst AI — Maintenance Tickets & SLA Management
 * ====================================================
 * Vision: "From Reactive Complaints to Proactive Campus Care"
 *
 * Lists all maintenance tickets, displays live SLA deadlines & urgency,
 * and provides digital resolution sign-off with root-cause capture.
 */

import { getTickets, getTicket, resolveTicket } from './api.js';
import { escapeHtml, priorityBadge, statusBadge, formatDate, showToast, openModal, closeModal } from './app.js';

export async function loadTickets() {
  const page = document.getElementById('page-tickets');

  page.innerHTML = `
    <div class="flex justify-between items-center mb-24 flex-wrap gap-12">
      <div>
        <h2 style="font-size:22px;color:var(--gray-900);">🎫 Maintenance Tickets &amp; SLA Tracking</h2>
        <p style="font-size:13px;color:var(--primary-dark);font-weight:600;margin-top:2px;">
          Actionable Work Orders with Target Completion Times &amp; Safety Sign-Off
        </p>
      </div>
      <div>
        <button class="btn btn-secondary btn-sm" onclick="navigateTo('risk-intelligence')">
          🧭 View Campus Risk Scorecards
        </button>
      </div>
    </div>

    <div class="alert alert-info mb-24">
      <span class="alert-icon">⏱️</span>
      <div>
        <strong>Dynamic SLA Enforcement Active:</strong> Critical safety hazards require immediate response (&le; 2 hours). High priority issues are scheduled for &le; 24 hours. Click any ticket to inspect root causes, view print layout, or log technician sign-off.
      </div>
    </div>

    <div class="card">
      <div id="ticketsTable"><p style="color:var(--gray-500)">Loading tickets...</p></div>
    </div>
  `;

  renderTicketsTable();
}

async function renderTicketsTable() {
  const container = document.getElementById('ticketsTable');
  const result = await getTickets();

  if (!result) {
    container.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span> Could not load tickets. Is the backend running?</div>`;
    return;
  }

  if (result.tickets.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎫</div>
        <div class="empty-state-title">No tickets yet</div>
        <p class="empty-state-text">Generate your first ticket from an active complaint.</p>
        <button class="btn btn-primary btn-sm" onclick="navigateTo('complaints')">View Complaints</button>
      </div>
    `;
    return;
  }

  const rows = result.tickets.map(t => {
    const sla = t.sla_status || { remaining_display: 'On Track', urgency_class: 'sla-ontrack' };
    return `
      <tr class="clickable" data-ticket-id="${escapeHtml(t.id)}">
        <td data-label="Ticket ID"><strong>${escapeHtml(t.id)}</strong></td>
        <td data-label="Complaint">${escapeHtml(t.complaint_id)}</td>
        <td data-label="Location">${escapeHtml(t.location)}</td>
        <td data-label="Summary" class="truncate" style="max-width:200px;">${escapeHtml(t.issue_summary)}</td>
        <td data-label="Priority">${priorityBadge(t.priority)}</td>
        <td data-label="SLA Target">
          <span class="sla-badge ${sla.urgency_class}">
            ${escapeHtml(sla.remaining_display)}
          </span>
        </td>
        <td data-label="Department">${escapeHtml(t.department)}</td>
        <td data-label="Status">${statusBadge(t.status)}</td>
        <td data-label="Created">${formatDate(t.created_at)}</td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="table-mobile-cards">
        <thead>
          <tr>
            <th>Ticket ID</th>
            <th>Complaint</th>
            <th>Location</th>
            <th>Summary</th>
            <th>Priority</th>
            <th>SLA Status</th>
            <th>Department</th>
            <th>Status</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  // Click handler for ticket rows
  container.querySelectorAll('tr[data-ticket-id]').forEach(row => {
    row.addEventListener('click', async () => {
      const ticketId = row.dataset.ticketId;
      const ticket = await getTicket(ticketId);
      if (ticket) {
        showInteractiveTicketModal(ticket);
      } else {
        showToast('Could not load ticket details.', 'error');
      }
    });
  });
}

export function showInteractiveTicketModal(t) {
  const sla = t.sla_status || { remaining_display: 'On Track', urgency_class: 'sla-ontrack', status: 'On Track' };
  const isResolved = t.status === 'Resolved' || t.status === 'Resolved & Verified';

  const body = `
    <div class="alert alert-warning mb-16 no-print">
      <span class="alert-icon">🔔</span>
      <div>
        <strong>Official Work Order &amp; Preventive Audit Record:</strong><br>
        Review hazard telemetry, SLA compliance, and document root-cause prevention.
      </div>
    </div>

    <!-- Ticket Summary Header Grid -->
    <div class="detail-grid mb-16">
      <div class="detail-item">
        <div class="detail-label">Ticket ID</div>
        <div class="detail-value"><strong>${escapeHtml(t.id)}</strong></div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Linked Complaint</div>
        <div class="detail-value">${escapeHtml(t.complaint_id)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Location</div>
        <div class="detail-value">${escapeHtml(t.location)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Assigned Department</div>
        <div class="detail-value">${escapeHtml(t.department)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Severity Priority</div>
        <div class="detail-value">${priorityBadge(t.priority)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">SLA Window</div>
        <div class="detail-value">
          <span class="sla-badge ${sla.urgency_class}">${escapeHtml(sla.status)} &bull; ${escapeHtml(sla.remaining_display)}</span>
        </div>
      </div>
    </div>

    <div class="detail-item mb-12">
      <div class="detail-label">Issue Summary</div>
      <div class="detail-value" style="font-size:15px;font-weight:600;">${escapeHtml(t.issue_summary)}</div>
    </div>

    <div class="detail-item mb-12">
      <div class="detail-label">Priority Rationale</div>
      <div class="detail-value">${escapeHtml(t.priority_reason || 'Standard triage.')}</div>
    </div>

    <div class="detail-item mb-16">
      <div class="detail-label">Recommended Preventive Action</div>
      <div class="detail-value" style="font-weight:500;color:var(--primary-dark);">${escapeHtml(t.recommended_action)}</div>
    </div>

    <!-- Proactive Resolution Details -->
    ${isResolved ? `
      <div style="background:var(--primary-bg);border:1px solid #bbf7d0;border-radius:var(--radius);padding:14px;margin-bottom:16px;">
        <h4 style="font-size:13px;text-transform:uppercase;color:var(--primary-dark);margin-bottom:8px;font-weight:700;">
          ✅ Verified Resolution &amp; Root Cause Audit
        </h4>
        <div class="detail-grid">
          <div class="detail-item">
            <div class="detail-label">Technician</div>
            <div class="detail-value">${escapeHtml(t.technician_name || 'Staff Technician')}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Safety Protocols Verified</div>
            <div class="detail-value">${t.safety_signoff ? '✅ Yes (Signed off)' : '⚠️ Pending Signoff'}</div>
          </div>
        </div>
        <div class="detail-item mt-8">
          <div class="detail-label">Root Cause Identified</div>
          <div class="detail-value">${escapeHtml(t.root_cause || 'Wear and environmental factors.')}</div>
        </div>
        <div class="detail-item mt-8">
          <div class="detail-label">Preventive Measures Taken</div>
          <div class="detail-value">${escapeHtml(t.preventive_action || 'Component serviced and tested under load.')}</div>
        </div>
      </div>
    ` : `
      <!-- Technician Resolution Form -->
      <div class="no-print" style="border:1.5px dashed var(--gray-300);background:var(--gray-50);border-radius:var(--radius);padding:16px;margin-top:16px;">
        <h4 style="font-size:14px;font-weight:700;color:var(--gray-900);margin-bottom:12px;">
          🛠️ Technician Sign-Off &amp; Prevention Logging
        </h4>
        <div class="form-group mb-12">
          <label class="form-label" style="font-size:12px;">Technician / Lead Engineer Name <span class="required">*</span></label>
          <input type="text" class="form-input" id="res-tech" placeholder="e.g. Ramesh Patel (Senior Electrician)" required>
        </div>
        <div class="form-group mb-12">
          <label class="form-label" style="font-size:12px;">Identified Root Cause <span class="required">*</span></label>
          <input type="text" class="form-input" id="res-cause" placeholder="e.g. Cable insulation degraded from moisture seepage" required>
        </div>
        <div class="form-group mb-12">
          <label class="form-label" style="font-size:12px;">Preventive Measures Taken <span class="required">*</span></label>
          <input type="text" class="form-input" id="res-prev" placeholder="e.g. Replaced conduit with IP65 weather-sealed pipe and tested GFCI" required>
        </div>
        <div style="margin-bottom:14px;">
          <label style="font-size:13px;display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" id="res-signoff" checked style="width:16px;height:16px;cursor:pointer;">
            <span>I certify that safety clearance protocols were verified on-site.</span>
          </label>
        </div>
        <button class="btn btn-primary btn-sm" id="submitResolutionBtn">
          ✅ Complete Resolution &amp; Sign-Off
        </button>
      </div>
    `}

    <div class="detail-item mt-16" style="font-size:12px;color:var(--gray-500);">
      Created: ${formatDate(t.created_at)} &bull; Last Updated: ${formatDate(t.updated_at)}
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary btn-sm" onclick="window.print()">🖨️ Print Work Order</button>
    <button class="btn btn-secondary btn-sm" onclick="closeModal()">Close</button>
  `;

  openModal(`Work Order — ${t.id}`, body, footer);

  // Wire up resolution button if active
  const resBtn = document.getElementById('submitResolutionBtn');
  if (resBtn) {
    resBtn.addEventListener('click', async () => {
      const tech = document.getElementById('res-tech').value.trim();
      const cause = document.getElementById('res-cause').value.trim();
      const prev = document.getElementById('res-prev').value.trim();
      const signoff = document.getElementById('res-signoff').checked;

      if (!tech || tech.length < 2) {
        showToast('Please enter the technician name.', 'error');
        return;
      }
      if (!cause || cause.length < 5) {
        showToast('Please enter the identified root cause.', 'error');
        return;
      }
      if (!prev || prev.length < 5) {
        showToast('Please describe the preventive measures taken.', 'error');
        return;
      }

      resBtn.classList.add('btn-loading');
      resBtn.disabled = true;

      try {
        await resolveTicket(t.id, {
          technician_name: tech,
          root_cause: cause,
          preventive_action: prev,
          safety_signoff: signoff,
          status: 'Resolved & Verified'
        });
        showToast(`Ticket ${t.id} successfully resolved with safety sign-off!`, 'success');
        closeModal();
        renderTicketsTable();
      } catch (err) {
        showToast('Failed to resolve ticket: ' + err.message, 'error');
      } finally {
        resBtn.classList.remove('btn-loading');
        resBtn.disabled = false;
      }
    });
  }
}

// Global modal linkage
window._showTicketModal = showInteractiveTicketModal;
