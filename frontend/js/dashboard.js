/**
 * FixFirst AI — Dashboard Page
 * ==============================
 * Loads stats, recent complaints, priority distribution, and category breakdown.
 */

import { getStats, getComplaints } from './api.js';
import { escapeHtml, priorityBadge, statusBadge, formatDate, showToast } from './app.js';

export async function loadDashboard() {
  const page = document.getElementById('page-dashboard');

  page.innerHTML = `
    <!-- Proactive Intelligence Hero Banner -->
    <div class="card mb-24" style="background:linear-gradient(135deg, #15803d 0%, #166534 100%);color:white;border-radius:var(--radius-lg);padding:22px 26px;border:none;">
      <div class="flex justify-between items-center flex-wrap gap-16">
        <div>
          <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:12px;display:inline-block;margin-bottom:8px;">
            AI Campus Intelligence Platform
          </span>
          <h2 style="font-size:22px;color:white;font-weight:700;line-height:1.2;">
            FixFirst AI &mdash; From Reactive Complaints to Proactive Campus Care
          </h2>
          <p style="font-size:13px;opacity:0.9;margin-top:6px;max-width:680px;line-height:1.5;">
            Detect recurring failure clusters, forecast hazard escalation risks, and automate preventive maintenance protocols before minor issues become campus emergencies.
          </p>
        </div>
        <div>
          <button class="btn btn-sm" style="background:white;color:var(--primary-dark);font-weight:700;padding:8px 16px;box-shadow:var(--shadow-md);" onclick="navigateTo('risk-intelligence')">
            🧭 Open Risk Intelligence &rarr;
          </button>
        </div>
      </div>
    </div>

    <div class="flex justify-between items-center mb-16">
      <h3 style="font-size:18px;color:var(--gray-900);font-weight:700;">📊 Campus Operations Overview</h3>
    </div>

    <div class="stats-grid" id="statsGrid">
      <div class="stat-card"><div class="stat-info"><div class="stat-label">Loading...</div></div></div>
    </div>
    <div class="dashboard-grid">
      <div>
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">📝 Recent Complaints</h3>
            <button class="btn btn-sm btn-secondary" onclick="navigateTo('complaints')">View All</button>
          </div>
          <div id="recentComplaints"><p style="color:var(--gray-500)">Loading...</p></div>
        </div>
      </div>
      <div>
        <div class="card mb-24">
          <h3 class="card-title mb-16">📊 Priority Distribution</h3>
          <div id="priorityChart"><p style="color:var(--gray-500)">Loading...</p></div>
        </div>
        <div class="card mb-24">
          <h3 class="card-title mb-16">📁 Categories</h3>
          <div id="categoryBreakdown"><p style="color:var(--gray-500)">Loading...</p></div>
        </div>
        <div class="card">
          <h3 class="card-title mb-16">⚡ Quick Actions</h3>
          <div class="quick-actions">
            <button class="btn btn-primary btn-sm" onclick="navigateTo('submit')">📝 Submit Complaint</button>
            <button class="btn btn-secondary btn-sm" onclick="navigateTo('risk-intelligence')">🧭 Risk Intelligence</button>
            <button class="btn btn-danger btn-sm" onclick="navigateTo('complaints')">🚨 View Critical</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Load stats
  const stats = await getStats();
  if (stats) {
    document.getElementById('statsGrid').innerHTML = `
      <div class="stat-card critical">
        <div class="stat-icon">🚨</div>
        <div class="stat-info">
          <div class="stat-number">${stats.total}</div>
          <div class="stat-label">Total Complaints</div>
        </div>
      </div>
      <div class="stat-card critical">
        <div class="stat-icon">⛔</div>
        <div class="stat-info">
          <div class="stat-number">${stats.critical}</div>
          <div class="stat-label">Critical</div>
        </div>
      </div>
      <div class="stat-card high">
        <div class="stat-icon">⚠️</div>
        <div class="stat-info">
          <div class="stat-number">${stats.high}</div>
          <div class="stat-label">High Priority</div>
        </div>
      </div>
      <div class="stat-card pending">
        <div class="stat-icon">⏳</div>
        <div class="stat-info">
          <div class="stat-number">${stats.pending}</div>
          <div class="stat-label">Pending</div>
        </div>
      </div>
    `;
  } else {
    document.getElementById('statsGrid').innerHTML = `
      <div class="alert alert-danger"><span class="alert-icon">❌</span> Could not load stats. Is the backend running?</div>
    `;
  }

  // Load recent complaints
  const result = await getComplaints({ per_page: 5, sort_by: 'date', order: 'desc' });
  if (result && result.complaints.length > 0) {
    let rows = result.complaints.map(c => `
      <tr class="clickable" onclick="showComplaintDetail('${escapeHtml(c.id)}')">
        <td data-label="ID">${escapeHtml(c.id)}</td>
        <td data-label="Title">${escapeHtml(c.title)}</td>
        <td data-label="Location">${escapeHtml(c.location)}</td>
        <td data-label="Priority">${priorityBadge(c.priority)}</td>
        <td data-label="Status">${statusBadge(c.status)}</td>
        <td data-label="Date">${formatDate(c.created_at)}</td>
      </tr>
    `).join('');

    document.getElementById('recentComplaints').innerHTML = `
      <div class="table-wrapper">
        <table class="table-mobile-cards">
          <thead>
            <tr>
              <th>ID</th><th>Title</th><th>Location</th><th>Priority</th><th>Status</th><th>Date</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } else if (result && result.complaints.length === 0) {
    document.getElementById('recentComplaints').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-title">No complaints yet</div>
        <p class="empty-state-text">Submit your first complaint to get started.</p>
        <button class="btn btn-primary btn-sm" onclick="navigateTo('submit')">Submit Complaint</button>
      </div>
    `;
  } else {
    document.getElementById('recentComplaints').innerHTML = `
      <div class="alert alert-danger"><span class="alert-icon">❌</span> Could not load complaints.</div>
    `;
  }

  // Priority distribution chart
  if (result && result.complaints) {
    const allData = await getComplaints({ per_page: 100 });
    if (allData) {
      const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
      allData.complaints.forEach(c => {
        if (counts[c.priority] !== undefined) counts[c.priority]++;
      });
      const max = Math.max(1, ...Object.values(counts));
      document.getElementById('priorityChart').innerHTML = `
        <div class="priority-bar-chart">
          ${['Critical', 'High', 'Medium', 'Low'].map(p => `
            <div class="priority-bar-row">
              <span class="priority-bar-label" style="color:var(--${p === 'Critical' ? 'red' : p === 'High' ? 'orange' : p === 'Medium' ? 'yellow' : 'primary'})">${p}</span>
              <div class="priority-bar-track">
                <div class="priority-bar-fill ${p.toLowerCase()}" style="width:${(counts[p] / max) * 100}%"></div>
              </div>
              <span class="priority-bar-count">${counts[p]}</span>
            </div>
          `).join('')}
        </div>
      `;

      // Category breakdown
      const catCounts = {};
      allData.complaints.forEach(c => {
        catCounts[c.category] = (catCounts[c.category] || 0) + 1;
      });
      const sorted = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
      document.getElementById('categoryBreakdown').innerHTML = `
        <ul class="category-list">
          ${sorted.map(([cat, count]) => `
            <li><span>${escapeHtml(cat)}</span><span class="category-count">${count}</span></li>
          `).join('')}
        </ul>
      `;
    }
  }
}
