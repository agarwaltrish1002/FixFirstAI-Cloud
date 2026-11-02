/**
 * FixFirst AI — Modern Category Analytics & Triage Interface
 * ============================================================
 * Displays 10 campus maintenance categories with real-time analytics:
 *   • Total complaints, Active complaints, Resolved complaints, and Critical counts
 *   • Department ownership & resolution velocity
 *   • Interactive selection: click any card to load that category's complaints
 *   • Category-wise filtering, priority sorting, and search functionality
 *   • 100% sourced from live backend database
 */

import { getCategoryWiseComplaints } from './api.js';
import { escapeHtml, formatDate, priorityBadge, statusBadge, showToast } from './app.js';
import { getAuthState } from './auth.js';

let activeCategoryName = null;
let categoryRecords = [];
let currentPriorityFilter = 'all';
let currentStatusFilter = 'all';
let currentCategorySearch = '';

const CATEGORY_META = {
  'Electrical': { icon: '⚡', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  'Plumbing': { icon: '🚰', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' },
  'Hygiene & Sanitation': { icon: '🧼', color: '#0d9488', bg: '#f0fdfa', border: '#99f6e4' },
  'Fire Safety': { icon: '🔥', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
  'Civil Infrastructure': { icon: '🏗️', color: '#475569', bg: '#f8fafc', border: '#cbd5e1' },
  'Furniture': { icon: '🪑', color: '#d97706', bg: '#fffbeb', border: '#fed7aa' },
  'Security': { icon: '🛡️', color: '#4f46e5', bg: '#eef2ff', border: '#c7d2fe' },
  'IT & Networking': { icon: '🌐', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  'HVAC & Ventilation': { icon: '❄️', color: '#06b6d4', bg: '#ecfeff', border: '#a5f3fc' },
  'HVAC': { icon: '❄️', color: '#06b6d4', bg: '#ecfeff', border: '#a5f3fc' },
  'Other Maintenance': { icon: '🔧', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
};

export async function renderCategoryArranger() {
  const container = document.getElementById('page-category-arranger');
  if (!container) return;

  container.innerHTML = `
    <div class="page-header mb-20 flex justify-between items-center flex-wrap gap-12">
      <div>
        <h2 class="page-title flex items-center gap-8">
          <span>📁</span> Category Analytics & Maintenance Triage
        </h2>
        <p class="text-muted" style="margin-top:2px;">
          Live breakdown across 10 campus operational domains. Click any category to inspect complaints.
        </p>
      </div>
      <button class="btn btn-secondary btn-sm" id="refreshCatBtn">🔄 Refresh Categories</button>
    </div>

    <!-- Category Grid Container -->
    <div id="categoryCardsGrid" class="dashboard-grid mb-24" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:14px;">
      <div style="grid-column: 1 / -1; text-align:center; padding:36px; color:var(--gray-500);">
        <div class="spinner" style="margin:0 auto 10px;"></div>
        <p>Loading campus category analytics...</p>
      </div>
    </div>

    <!-- Selected Category Deep-Dive Section -->
    <div id="selectedCategorySection">
      <!-- Rendered dynamically -->
    </div>
  `;

  document.getElementById('refreshCatBtn').addEventListener('click', () => {
    showToast('Refreshing category analytics...', 'info', 1000);
    fetchAndRenderCategories();
  });

  await fetchAndRenderCategories();
}

async function fetchAndRenderCategories() {
  const data = await getCategoryWiseComplaints();
  if (!data || !data.categories) {
    const grid = document.getElementById('categoryCardsGrid');
    if (grid) {
      grid.innerHTML = `
        <div class="alert alert-danger" style="grid-column:1/-1;">
          <span class="alert-icon">❌</span> Could not load category data from backend.
        </div>
      `;
    }
    return;
  }

  categoryRecords = data.categories;

  if (!activeCategoryName || !categoryRecords.some(c => c.category === activeCategoryName)) {
    // Default to the category with the most active complaints, or the first one
    const sorted = [...categoryRecords].sort((a, b) => (b.active_complaints || 0) - (a.active_complaints || 0));
    activeCategoryName = sorted[0]?.category || categoryRecords[0]?.category;
  }

  renderCategoryCards();
  renderSelectedCategoryView();
}

function renderCategoryCards() {
  const grid = document.getElementById('categoryCardsGrid');
  if (!grid) return;

  grid.innerHTML = categoryRecords.map(cat => {
    const isSelected = cat.category === activeCategoryName;
    const meta = CATEGORY_META[cat.category] || { icon: '📁', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' };
    const total = cat.total_complaints || 0;
    const active = cat.active_complaints !== undefined ? cat.active_complaints : (cat.pending_complaints || 0);
    const resolved = cat.resolved_complaints !== undefined ? cat.resolved_complaints : Math.max(0, total - active);
    const critical = cat.critical_complaints || 0;
    const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 100;

    return `
      <div
        class="category-stat-card ${isSelected ? 'category-card-active' : ''}"
        data-cat="${escapeHtml(cat.category)}"
        style="
          background: ${isSelected ? 'white' : '#ffffff'};
          border: 2px solid ${isSelected ? 'var(--primary)' : '#e2e8f0'};
          border-radius: 12px;
          padding: 14px 16px;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
          box-shadow: ${isSelected ? '0 4px 14px rgba(37,99,235,0.18)' : '0 1px 3px rgba(0,0,0,0.04)'};
          position: relative;
        "
      >
        ${critical > 0 ? `
          <span style="position:absolute;top:10px;right:10px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;">
            🚨 ${critical} Critical
          </span>
        ` : ''}

        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="font-size:24px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;background:${meta.bg};border:1px solid ${meta.border};border-radius:8px;">
            ${meta.icon}
          </span>
          <div style="min-width:0;flex:1;">
            <h4 style="font-size:14px;font-weight:700;color:#0f172a;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${escapeHtml(cat.category)}
            </h4>
            <span style="font-size:11px;color:#64748b;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${escapeHtml(cat.department || 'Maintenance')}
            </span>
          </div>
        </div>

        <!-- 3-Pill Summary -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;background:#f8fafc;padding:6px;border-radius:6px;margin:8px 0;text-align:center;">
          <div>
            <div style="font-size:10px;color:#64748b;font-weight:600;">TOTAL</div>
            <div style="font-size:13px;font-weight:700;color:#0f172a;">${total}</div>
          </div>
          <div>
            <div style="font-size:10px;color:#d97706;font-weight:600;">ACTIVE</div>
            <div style="font-size:13px;font-weight:700;color:#d97706;">${active}</div>
          </div>
          <div>
            <div style="font-size:10px;color:#16a34a;font-weight:600;">RESOLVED</div>
            <div style="font-size:13px;font-weight:700;color:#16a34a;">${resolved}</div>
          </div>
        </div>

        <!-- Mini Progress Bar -->
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#64748b;margin-bottom:2px;">
          <span>Resolution</span>
          <span style="font-weight:600;">${resolutionRate}%</span>
        </div>
        <div style="height:4px;background:#e2e8f0;border-radius:2px;overflow:hidden;">
          <div style="height:100%;width:${resolutionRate}%;background:#16a34a;border-radius:2px;"></div>
        </div>
      </div>
    `;
  }).join('');

  // Wire click events
  grid.querySelectorAll('.category-stat-card').forEach(card => {
    card.addEventListener('click', () => {
      activeCategoryName = card.getAttribute('data-cat');
      renderCategoryCards();
      renderSelectedCategoryView();
    });
  });
}

function renderSelectedCategoryView() {
  const container = document.getElementById('selectedCategorySection');
  if (!container) return;

  const selectedCat = categoryRecords.find(c => c.category === activeCategoryName) || categoryRecords[0];
  if (!selectedCat) {
    container.innerHTML = '';
    return;
  }

  const meta = CATEGORY_META[selectedCat.category] || { icon: '📁', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' };
  let complaints = selectedCat.complaints || [];

  // Apply Priority Filter
  if (currentPriorityFilter !== 'all') {
    complaints = complaints.filter(c => (c.priority || '').toLowerCase().includes(currentPriorityFilter.toLowerCase()));
  }

  // Apply Status Filter
  if (currentStatusFilter !== 'all') {
    complaints = complaints.filter(c => (c.status || '').toLowerCase() === currentStatusFilter.toLowerCase());
  }

  // Apply Search
  if (currentCategorySearch) {
    const q = currentCategorySearch.toLowerCase();
    complaints = complaints.filter(c =>
      (c.title || '').toLowerCase().includes(q) ||
      (c.location || '').toLowerCase().includes(q) ||
      (c.student_name || '').toLowerCase().includes(q) ||
      (c.id || '').toLowerCase().includes(q)
    );
  }

  const auth = getAuthState();
  const role = (auth.role || '').toLowerCase();
  const isStaff = role === 'warden' || role === 'teacher' || role === 'admin';

  container.innerHTML = `
    <div class="card mb-24" style="border-top:4px solid ${meta.color};">
      
      <!-- Category Banner Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;padding-bottom:14px;border-bottom:1px solid #e2e8f0;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-size:28px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:${meta.bg};border:1px solid ${meta.border};border-radius:10px;">
            ${meta.icon}
          </span>
          <div>
            <h3 style="font-size:18px;font-weight:700;color:#0f172a;margin:0;">
              ${escapeHtml(selectedCat.category)} Complaints
            </h3>
            <span style="font-size:12px;color:#64748b;">
              Managed by: <strong>${escapeHtml(selectedCat.department || 'General Maintenance')}</strong>
            </span>
          </div>
        </div>

        <!-- Filter & Search Controls -->
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <div class="search-box" style="min-width:200px;max-width:260px;">
            <span class="search-icon">🔍</span>
            <input type="text" id="catSearchInput" value="${escapeHtml(currentCategorySearch)}" placeholder="Search this category..." />
          </div>

          <select id="catPrioritySelect" class="filter-select" style="max-width:140px;font-size:12px;">
            <option value="all" ${currentPriorityFilter === 'all' ? 'selected' : ''}>All Priorities</option>
            <option value="critical" ${currentPriorityFilter === 'critical' ? 'selected' : ''}>🚨 P1 Critical</option>
            <option value="high" ${currentPriorityFilter === 'high' ? 'selected' : ''}>⚠️ P2 High</option>
            <option value="medium" ${currentPriorityFilter === 'medium' ? 'selected' : ''}>P3 Medium</option>
            <option value="low" ${currentPriorityFilter === 'low' ? 'selected' : ''}>P4 Low</option>
          </select>

          <select id="catStatusSelect" class="filter-select" style="max-width:130px;font-size:12px;">
            <option value="all" ${currentStatusFilter === 'all' ? 'selected' : ''}>All Statuses</option>
            <option value="pending" ${currentStatusFilter === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="assigned" ${currentStatusFilter === 'assigned' ? 'selected' : ''}>Assigned</option>
            <option value="in progress" ${currentStatusFilter === 'in progress' ? 'selected' : ''}>In Progress</option>
            <option value="resolved" ${currentStatusFilter === 'resolved' ? 'selected' : ''}>Resolved</option>
          </select>
        </div>
      </div>

      <!-- Complaints Table / List -->
      ${complaints.length === 0 ? `
        <div class="empty-state" style="padding:36px;">
          <div class="empty-state-icon">✅</div>
          <div class="empty-state-title">No matching complaints</div>
          <p class="empty-state-text">
            ${currentCategorySearch || currentPriorityFilter !== 'all' || currentStatusFilter !== 'all'
              ? 'No complaints match your active search or filters in this category.'
              : `Zero active complaints recorded under ${escapeHtml(selectedCat.category)}.`}
          </p>
        </div>
      ` : `
        <div class="table-wrapper">
          <table class="table-mobile-cards">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Location</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Technician</th>
                <th>Reported Date</th>
                <th style="text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${complaints.map(c => `
                <tr class="clickable" onclick="window.showComplaintDetail('${escapeHtml(c.id)}')">
                  <td data-label="ID"><code>${escapeHtml(c.id)}</code></td>
                  <td data-label="Title">
                    <strong>${escapeHtml(c.title)}</strong>
                    ${c.is_sensitive_hygiene ? '<span class="sensitive-badge">🔒 Sensitive</span>' : ''}
                  </td>
                  <td data-label="Location">${escapeHtml(c.location)}${c.room_number ? ' (' + escapeHtml(c.room_number) + ')' : ''}</td>
                  <td data-label="Priority">${priorityBadge(c.priority)}</td>
                  <td data-label="Status">${statusBadge(c.status)}</td>
                  <td data-label="Technician">${escapeHtml(c.assigned_worker_name || '—')}</td>
                  <td data-label="Date">${formatDate(c.created_at)}</td>
                  <td data-label="Actions" style="text-align:right;" onclick="event.stopPropagation();">
                    <button class="btn btn-sm btn-outline-primary" onclick="window.showComplaintDetail('${escapeHtml(c.id)}')" style="padding:3px 8px;font-size:11px;">
                      🔍 Details
                    </button>
                    ${isStaff && c.status !== 'Resolved' ? `
                      <button class="btn btn-sm btn-primary" onclick="window.openAssignModal('${escapeHtml(c.id)}', '${escapeHtml(c.title)}', '${escapeHtml(c.category)}')" style="padding:3px 8px;font-size:11px;margin-left:4px;">
                        👷 Assign
                      </button>
                    ` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div style="font-size:12px;color:var(--gray-500);margin-top:12px;display:flex;justify-content:space-between;align-items:center;">
          <span>Showing <strong>${complaints.length}</strong> of <strong>${(selectedCat.complaints || []).length}</strong> complaints in ${escapeHtml(selectedCat.category)}</span>
          <span style="font-size:11px;color:#64748b;">Source: Verified Campus Database</span>
        </div>
      `}

    </div>
  `;

  // Bind category search
  const searchInput = document.getElementById('catSearchInput');
  let searchTimer = null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        currentCategorySearch = e.target.value.trim();
        renderSelectedCategoryView();
      }, 250);
    });
  }

  // Bind priority filter
  const prioSelect = document.getElementById('catPrioritySelect');
  if (prioSelect) {
    prioSelect.addEventListener('change', (e) => {
      currentPriorityFilter = e.target.value;
      renderSelectedCategoryView();
    });
  }

  // Bind status filter
  const statSelect = document.getElementById('catStatusSelect');
  if (statSelect) {
    statSelect.addEventListener('change', (e) => {
      currentStatusFilter = e.target.value;
      renderSelectedCategoryView();
    });
  }
}
