/**
 * FixFirst AI — Category-Wise Complaint Arranger
 * ===============================================
 * Groups campus complaints into the 10 standard categories,
 * showing department ownership, critical counts, pending queues,
 * and cards ranked by urgency for facility engineers & wardens.
 */

import { getCategoryWiseComplaints } from './api.js';
import { getAuthState } from './auth.js';

let activeCategoryTab = null;
let currentPriorityFilter = 'all';

export async function renderCategoryArranger() {
  const container = document.getElementById('page-category-arranger');
  if (!container) return;

  // Role guard
  const auth = getAuthState();
  const isStaff = auth.role === 'teacher' || auth.role === 'warden';
  if (!isStaff) {
    container.innerHTML = `
      <div class="alert alert-danger" style="margin:24px;">
        <span class="alert-icon">🔒</span>
        Access restricted. Only Teachers and Wardens can view the Category Arranger.
      </div>
    `;
    return;
  }

  container.innerHTML = `<div style="text-align:center;padding:48px;color:var(--gray-400);"><div class="spinner" style="margin:0 auto 12px;"></div><p>Arranging campus complaints by category...</p></div>`;

  const data = await getCategoryWiseComplaints();
  if (!data || !data.categories) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📁</div><div class="empty-state-title">No data available</div><p class="empty-state-text">Could not load category records. Is the backend running?</p></div>`;
    return;
  }

  const categories = data.categories;
  if (!categories.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-title">No complaints yet</div><p class="empty-state-text">Submit some complaints to see the category breakdown.</p></div>`;
    return;
  }

  if (!activeCategoryTab || !categories.some(c => c.category === activeCategoryTab)) {
    activeCategoryTab = categories[0].category;
  }

  const selectedData = categories.find(c => c.category === activeCategoryTab) || categories[0];

  // Filter complaints in active category
  let filteredComplaints = selectedData.complaints || [];
  if (currentPriorityFilter !== 'all') {
    filteredComplaints = filteredComplaints.filter(c =>
      (c.priority || '').toLowerCase().includes(currentPriorityFilter.toLowerCase())
    );
  }

  container.innerHTML = `
    <div class="category-arranger-header">
      <div>
        <h2 style="font-size:22px;font-weight:700;color:var(--gray-900);">📁 Category-Wise Complaint Arranger</h2>
        <p style="font-size:13px;color:var(--gray-500);margin-top:4px;">Structured facility queues across 10 campus departments with priority sorting.</p>
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:var(--gray-600);margin-right:8px;">Filter Priority:</label>
        <select id="categoryPriorityFilter" class="filter-select">
          <option value="all" ${currentPriorityFilter === 'all' ? 'selected' : ''}>All Priorities</option>
          <option value="critical" ${currentPriorityFilter === 'critical' ? 'selected' : ''}>P1 – Critical Only</option>
          <option value="high" ${currentPriorityFilter === 'high' ? 'selected' : ''}>P2 – High Only</option>
          <option value="medium" ${currentPriorityFilter === 'medium' ? 'selected' : ''}>P3 – Medium Only</option>
          <option value="low" ${currentPriorityFilter === 'low' ? 'selected' : ''}>P4 – Low Only</option>
        </select>
      </div>
    </div>

    <!-- Category Pill Tabs -->
    <div class="category-tabs-nav">
      ${categories.map(cat => {
        const isActive = cat.category === activeCategoryTab;
        const hasCritical = cat.critical_complaints > 0;
        return `
          <button class="cat-tab-btn ${isActive ? 'active' : ''} ${hasCritical ? 'has-critical' : ''}" data-cat="${escapeHTML(cat.category)}">
            <span class="cat-tab-name">${escapeHTML(cat.category)}</span>
            <span class="cat-tab-count">${cat.total_complaints}</span>
            ${hasCritical ? `<span class="cat-tab-crit" title="${cat.critical_complaints} Critical">⚠️ ${cat.critical_complaints}</span>` : ''}
          </button>
        `;
      }).join('')}
    </div>

    <!-- Active Category Overview Card -->
    <div class="category-dept-banner">
      <div class="dept-info">
        <strong>${escapeHTML(selectedData.category)}</strong>
        <small>Responsible Department: ${escapeHTML(selectedData.department || 'Facilities Management')}</small>
      </div>
      <div class="dept-metrics">
        <span class="metric-pill">${selectedData.total_complaints} Total</span>
        <span class="metric-pill metric-pill-danger">${selectedData.critical_complaints || 0} P1 Critical</span>
        <span class="metric-pill metric-pill-warning">${selectedData.pending_complaints || 0} Pending</span>
      </div>
    </div>

    <!-- Complaints Queue Grid -->
    <div class="category-cards-queue">
      ${filteredComplaints.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">✅</div>
          <div class="empty-state-title">All Clear in ${escapeHTML(selectedData.category)}</div>
          <p class="empty-state-text">No complaints matching the selected priority filter.</p>
        </div>
      ` : `
        <div class="cards-grid">
          ${filteredComplaints.map(c => renderComplaintCard(c)).join('')}
        </div>
      `}
    </div>
  `;

  // Bind tab events
  container.querySelectorAll('.cat-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategoryTab = btn.getAttribute('data-cat');
      renderCategoryArranger();
    });
  });

  // Bind filter
  const filterSelect = container.querySelector('#categoryPriorityFilter');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      currentPriorityFilter = e.target.value;
      renderCategoryArranger();
    });
  }
}

function renderComplaintCard(c) {
  const pri = c.priority || 'Medium';
  const isP1 = pri.includes('Critical') || pri.includes('P1');
  const isP2 = pri.includes('High') || pri.includes('P2');
  const isP3 = pri.includes('Medium') || pri.includes('P3');
  const pilClass = isP1 ? 'p1-pill' : isP2 ? 'p2-pill' : isP3 ? 'p3-pill' : 'p4-pill';

  const rankNum = c.urgency_rank || null;
  const rankClass = rankNum === 1 ? 'rank-top' : (rankNum && rankNum <= 3 ? 'rank-high' : '');
  const rankScore = c.ranking_score ? c.ranking_score.toFixed(1) : '—';

  return `
    <div class="complaint-card ${isP1 ? 'card-critical-glow' : ''}" onclick="window.showComplaintDetail && window.showComplaintDetail('${escapeHTML(c.id)}')">
      <div class="card-top">
        ${rankNum ? `<span class="urgency-rank-badge ${rankClass}" title="Urgency Rank">#${rankNum}</span>` : ''}
        <span class="priority-badge ${pilClass}">${escapeHTML(pri)}</span>
        <span style="font-size:11px;color:var(--gray-500);margin-left:auto;">${escapeHTML(c.status || 'Pending')}</span>
      </div>

      <h4 style="font-size:14px;font-weight:600;color:var(--gray-900);margin:6px 0 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(c.title)}</h4>
      <p style="font-size:12px;color:var(--gray-500);margin:0 0 6px;">📍 ${escapeHTML(c.location || '—')}</p>

      ${c.ranking_reason ? `
        <div class="ranking-reason-box">
          <small><strong>Score:</strong> ${rankScore} pts — ${escapeHTML(c.ranking_reason)}</small>
        </div>
      ` : ''}

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;color:var(--gray-400);">
        <span>👤 ${escapeHTML(c.student_name || 'Student')}</span>
        <span>${formatDate(c.created_at)}</span>
      </div>
    </div>
  `;
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return isoStr;
  }
}
