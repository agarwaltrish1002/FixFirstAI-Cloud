/**
 * FixFirst AI — Urgency Ranked Queue
 * ====================================
 * Displays all active complaints sorted by multi-factor urgency score.
 * Prioritizes Critical and High hazards at the top, enabling immediate action.
 * Allows viewing full details, assigning technicians, and generating tickets.
 */

import { getRankedComplaints, generateTicket } from './api.js';
import { escapeHtml, formatDate, priorityBadge, statusBadge, showToast } from './app.js';
import { getAuthState } from './auth.js';

let allRankedComplaints = [];
let currentPriorityFilter = 'all';
let currentSearchTerm = '';

export async function loadRankedQueue() {
  const page = document.getElementById('page-ranked-queue');
  if (!page) return;

  const auth = getAuthState();
  const role = (auth.role || '').toLowerCase();
  const isAuthorizedStaff = role === 'warden' || role === 'teacher' || role === 'admin';

  page.innerHTML = `
    <div class="page-header mb-20 flex justify-between items-center flex-wrap gap-12">
      <div>
        <h2 class="page-title flex items-center gap-8">
          <span>🚨</span> Urgency Ranked Queue
        </h2>
        <p class="text-muted" style="margin-top:2px;">
          Dynamically ordered by multi-factor life-safety, damage escalation, and SLA severity.
        </p>
      </div>
      <div class="flex gap-8 items-center flex-wrap">
        <button class="btn btn-secondary btn-sm" id="refreshRankedBtn">🔄 Refresh Queue</button>
        ${isAuthorizedStaff ? `
          <button class="btn btn-primary btn-sm" onclick="navigateTo('warden-assign')">
            👷 Technician Triage &rarr;
          </button>
        ` : ''}
      </div>
    </div>

    ${!isAuthorizedStaff ? `
      <div class="alert alert-info mb-16" style="background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;">
        <span class="alert-icon">ℹ️</span>
        <div>
          <strong>Campus Read-Only Telemetry View:</strong> You are viewing the live urgency queue. Worker dispatch and ticket generation actions are reserved for Campus Wardens and Estate Administrators.
        </div>
      </div>
    ` : ''}

    <!-- Calculation Formula Banner -->
    <div class="card mb-16" style="padding:14px 18px;background:linear-gradient(135deg,#eff6ff 0%,#f8fafc 100%);border:1px solid #cbd5e1;">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="font-size:24px;">🧮</span>
        <div style="flex:1;min-width:240px;">
          <strong style="color:#0f172a;font-size:13px;">Algorithmic Urgency Ranking Model</strong>
          <p style="font-size:12px;color:#475569;margin:2px 0 0;line-height:1.4;">
            Rank = Base Priority (P1=100, P2=65, P3=35, P4=12) + Life-Safety Hazard (+45) + Population Scope (+25) + Escalation Risk (+18) + SLA Aging (+25 max). Resolved complaints are excluded.
          </p>
        </div>
      </div>
    </div>

    <!-- Toolbar: Search + Priority Filter Tabs -->
    <div class="card mb-16" style="padding:14px 18px;">
      <div style="display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap;">
        <div class="search-box" style="flex:1;min-width:220px;max-width:400px;">
          <span class="search-icon">🔍</span>
          <input type="text" id="rankedSearchInput" placeholder="Search by title, location, category..." />
        </div>
        <div id="rankedFilterTabs" class="flex gap-6 flex-wrap" style="align-items:center;">
          <!-- Filter buttons rendered dynamically -->
        </div>
      </div>
    </div>

    <!-- Main List Container -->
    <div id="rankedQueueList">
      <div style="text-align:center;padding:48px;color:var(--gray-500);">
        <div class="spinner" style="margin:0 auto 12px;"></div>
        <p>Loading and computing campus urgency ranks...</p>
      </div>
    </div>
  `;

  // Wire up refresh
  document.getElementById('refreshRankedBtn').addEventListener('click', () => {
    showToast('Refreshing urgency queue...', 'info', 1000);
    fetchAndRenderRanked();
  });

  // Wire up search
  const searchInput = document.getElementById('rankedSearchInput');
  let searchTimer = null;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentSearchTerm = e.target.value.trim().toLowerCase();
      renderFilteredRankedList();
    }, 250);
  });

  await fetchAndRenderRanked();
}

async function fetchAndRenderRanked() {
  const container = document.getElementById('rankedQueueList');
  if (!container) return;

  try {
    const data = await getRankedComplaints();
    const complaints = (data && (data.ranked_complaints || data.complaints))
      ? (data.ranked_complaints || data.complaints)
      : [];

    allRankedComplaints = complaints;
    renderFilterTabs();
    renderFilteredRankedList();
  } catch (err) {
    container.innerHTML = `
      <div class="alert alert-danger">
        <span class="alert-icon">❌</span>
        <div>
          <strong>Failed to load Urgency Queue:</strong> ${escapeHtml(err.message || 'Backend communication error.')}
        </div>
      </div>
    `;
  }
}

function renderFilterTabs() {
  const tabsContainer = document.getElementById('rankedFilterTabs');
  if (!tabsContainer) return;

  const total = allRankedComplaints.length;
  const critical = allRankedComplaints.filter(c => (c.priority || '').includes('Critical') || (c.priority || '').includes('P1')).length;
  const high = allRankedComplaints.filter(c => (c.priority || '').includes('High') || (c.priority || '').includes('P2')).length;
  const medium = allRankedComplaints.filter(c => (c.priority || '').includes('Medium') || (c.priority || '').includes('P3')).length;
  const low = allRankedComplaints.filter(c => (c.priority || '').includes('Low') || (c.priority || '').includes('P4')).length;

  const tabs = [
    { key: 'all', label: 'All Active', count: total },
    { key: 'critical', label: '🚨 Critical', count: critical, color: '#dc2626' },
    { key: 'high', label: '⚠️ High', count: high, color: '#ea580c' },
    { key: 'medium', label: 'Medium', count: medium, color: '#d97706' },
    { key: 'low', label: 'Low', count: low, color: '#0284c7' },
  ];

  tabsContainer.innerHTML = tabs.map(t => {
    const isActive = currentPriorityFilter === t.key;
    return `
      <button
        class="btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline-secondary'}"
        style="${isActive ? '' : 'background:white;'}padding:5px 12px;font-size:12px;font-weight:600;border-radius:20px;"
        data-filter="${t.key}"
      >
        ${t.label} <span style="background:${isActive ? 'rgba(255,255,255,0.25)' : 'var(--gray-100)'};color:${isActive ? 'white' : 'var(--gray-700)'};padding:1px 6px;border-radius:10px;margin-left:4px;font-size:11px;">${t.count}</span>
      </button>
    `;
  }).join('');

  tabsContainer.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPriorityFilter = btn.getAttribute('data-filter');
      renderFilterTabs();
      renderFilteredRankedList();
    });
  });
}

function renderFilteredRankedList() {
  const container = document.getElementById('rankedQueueList');
  if (!container) return;

  let list = allRankedComplaints;

  // Priority filter
  if (currentPriorityFilter === 'critical') {
    list = list.filter(c => (c.priority || '').includes('Critical') || (c.priority || '').includes('P1'));
  } else if (currentPriorityFilter === 'high') {
    list = list.filter(c => (c.priority || '').includes('High') || (c.priority || '').includes('P2'));
  } else if (currentPriorityFilter === 'medium') {
    list = list.filter(c => (c.priority || '').includes('Medium') || (c.priority || '').includes('P3'));
  } else if (currentPriorityFilter === 'low') {
    list = list.filter(c => (c.priority || '').includes('Low') || (c.priority || '').includes('P4'));
  }

  // Search filter
  if (currentSearchTerm) {
    list = list.filter(c =>
      (c.title || '').toLowerCase().includes(currentSearchTerm) ||
      (c.location || '').toLowerCase().includes(currentSearchTerm) ||
      (c.category || '').toLowerCase().includes(currentSearchTerm) ||
      (c.id || '').toLowerCase().includes(currentSearchTerm)
    );
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🏆</div>
        <div class="empty-state-title">No Active Complaints</div>
        <p class="empty-state-text">
          ${currentSearchTerm ? 'No complaints match your search filter.' : 'All campus maintenance complaints are currently resolved or clear!'}
        </p>
      </div>
    `;
    return;
  }

  const maxScore = allRankedComplaints[0]?.ranking_score || 100;
  const auth = getAuthState();
  const role = (auth.role || '').toLowerCase();
  const isAuthorizedStaff = role === 'warden' || role === 'teacher' || role === 'admin';

  container.innerHTML = `
    <div class="ranked-queue-list">
      ${list.map((c, idx) => renderRankedCard(c, c.urgency_rank || (idx + 1), maxScore, isAuthorizedStaff)).join('')}
    </div>
  `;

  // Wire up ticket generation buttons
  container.querySelectorAll('.gen-ticket-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      btn.disabled = true;
      btn.textContent = 'Generating...';
      try {
        const ticket = await generateTicket(id);
        showToast(`Ticket ${ticket.id || ticket.ticket_id} created successfully!`, 'success');
        btn.textContent = '✅ Ticket Created';
      } catch (err) {
        showToast('Could not generate ticket: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = '🎫 Generate Ticket';
      }
    });
  });
}

function renderRankedCard(c, rank, maxScore, isAuthorizedStaff) {
  const scorePercent = Math.min(100, Math.max(5, ((c.ranking_score || 0) / maxScore) * 100));

  const priorityStr = c.priority || 'Medium';
  const isCritical = priorityStr.includes('P1') || priorityStr.toLowerCase().includes('critical');
  const isHigh     = priorityStr.includes('P2') || priorityStr.toLowerCase().includes('high');
  const isMedium   = priorityStr.includes('P3') || priorityStr.toLowerCase().includes('medium');

  const priorityColor = isCritical ? '#dc2626' : isHigh ? '#ea580c' : isMedium ? '#d97706' : '#0284c7';
  const priorityBorder= isCritical ? '#fca5a5' : isHigh ? '#fed7aa' : isMedium ? '#fef08a' : '#bae6fd';
  const rankBg        = rank === 1 ? '#dc2626' : rank <= 3 ? '#ea580c' : rank <= 10 ? '#d97706' : '#475569';

  const categoryIcons = {
    'Electrical': '⚡',
    'Plumbing': '🚰',
    'Hygiene & Sanitation': '🧼',
    'Fire Safety': '🔥',
    'Civil Infrastructure': '🏗️',
    'Furniture': '🪑',
    'Security': '🛡️',
    'IT & Networking': '🌐',
    'HVAC & Ventilation': '❄️',
    'HVAC': '❄️',
    'Other Maintenance': '🔧',
  };
  const catIcon = categoryIcons[c.category] || '📁';

  return `
    <div class="ranked-card ${isCritical ? 'card-critical-glow' : ''}" style="background:var(--white);border:1px solid ${priorityBorder};border-radius:12px;padding:16px 20px;margin-bottom:14px;box-shadow:${isCritical ? '0 0 0 2px rgba(220,38,38,0.12)' : 'var(--shadow-sm)'};">
      <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;">
        
        <!-- Rank Circle -->
        <div style="min-width:48px;text-align:center;">
          <div style="width:48px;height:48px;border-radius:50%;background:${rankBg};color:white;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;box-shadow:0 3px 10px rgba(0,0,0,0.15);" title="Urgency Rank #${rank}">
            #${rank}
          </div>
          <span style="font-size:10px;font-weight:700;color:var(--gray-500);display:block;margin-top:4px;">RANK</span>
        </div>

        <!-- Main Complaint Info -->
        <div style="flex:1;min-width:280px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
            <span style="font-size:11px;font-family:monospace;font-weight:700;color:var(--gray-500);background:var(--gray-100);padding:2px 6px;border-radius:4px;">${escapeHtml(c.id)}</span>
            ${priorityBadge(c.priority)}
            <span style="background:#f1f5f9;color:#334155;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600;">
              ${catIcon} ${escapeHtml(c.category || 'General')}
            </span>
            ${statusBadge(c.status)}
            ${c.is_sensitive_hygiene ? '<span class="sensitive-badge">🔒 Sensitive</span>' : ''}
          </div>

          <h4 style="font-size:16px;font-weight:700;color:var(--gray-900);margin-bottom:4px;line-height:1.3;">
            ${escapeHtml(c.title)}
          </h4>

          <p style="font-size:13px;color:var(--gray-600);margin-bottom:8px;">
            📍 <strong>${escapeHtml(c.location || 'Campus')}</strong>${c.room_number ? ' · ' + escapeHtml(c.room_number) : ''}
            &nbsp;|&nbsp; 👤 ${escapeHtml(c.student_name || 'Anonymous')}
            &nbsp;|&nbsp; 🕐 ${formatDate(c.created_at)}
          </p>

          <!-- Urgency Score Progress Bar -->
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span style="font-size:12px;font-weight:700;color:${priorityColor};">
                Urgency Score: ${(c.ranking_score || 0).toFixed(1)} pts
              </span>
              <span style="font-size:11px;color:var(--gray-500);">
                ${scorePercent.toFixed(0)}% of max urgency
              </span>
            </div>
            <div style="height:7px;background:#e2e8f0;border-radius:4px;overflow:hidden;">
              <div style="height:100%;width:${scorePercent}%;background:linear-gradient(90deg,${priorityColor},${priorityColor}bb);border-radius:4px;transition:width 0.4s ease;"></div>
            </div>
            ${c.ranking_reason ? `
              <div style="font-size:11px;color:#475569;margin-top:6px;line-height:1.4;">
                🧮 <strong>Evaluation:</strong> ${escapeHtml(c.ranking_reason)}
              </div>
            ` : ''}
          </div>

          <!-- Scope & Hazard Badges -->
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            ${c.affected_scope ? `<span style="background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:600;">👥 ${escapeHtml(c.affected_scope)}</span>` : ''}
            ${c.damage_risk ? `<span style="background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:600;">⚠️ ${escapeHtml(c.damage_risk)}</span>` : ''}
            ${c.assigned_worker_name ? `<span style="background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:600;">👷 Assigned: ${escapeHtml(c.assigned_worker_name)}</span>` : '<span style="background:#fef2f2;color:#991b1b;border:1px solid #fecaca;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:600;">⏳ Unassigned</span>'}
          </div>
        </div>

        <!-- Action Buttons -->
        <div style="display:flex;flex-direction:column;gap:8px;align-items:stretch;min-width:150px;">
          <button class="btn btn-sm btn-outline-primary" onclick="window.showComplaintDetail('${escapeHtml(c.id)}')" style="font-size:12px;font-weight:600;">
            🔍 View Details
          </button>
          ${isAuthorizedStaff ? `
            <button class="btn btn-sm btn-primary" onclick="window.openAssignModal('${escapeHtml(c.id)}', '${escapeHtml(c.title)}', '${escapeHtml(c.category)}')" style="font-size:12px;">
              👷 Assign Worker
            </button>
            <button class="btn btn-sm btn-secondary gen-ticket-btn" data-id="${escapeHtml(c.id)}" style="font-size:12px;">
              🎫 Generate Ticket
            </button>
          ` : ''}
        </div>

      </div>
    </div>
  `;
}
