/**
 * FixFirst AI — Dashboard Page
 * ==============================
 * Role-aware dashboard:
 *   - Students: Their own complaints, personal stats
 *   - Teachers/Wardens: Campus-wide risk stats, priority breakdown, top critical items
 */

import { getStats, getComplaints } from './api.js';
import { escapeHtml, priorityBadge, statusBadge, formatDate, showToast } from './app.js';
import { getAuthState } from './auth.js';

export async function loadDashboard() {
  const auth = getAuthState();
  const isStaff = auth.role === 'teacher' || auth.role === 'warden';

  if (isStaff) {
    await loadStaffDashboard();
  } else {
    await loadStudentDashboard();
  }
}

// ---------------------------------------------------------------------------
// Student Dashboard
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
            Submit maintenance complaints and track their AI-analysed priority and resolution status in real time.
          </p>
        </div>
        <div>
          <button class="btn btn-sm" style="background:white;color:var(--primary-dark);font-weight:700;padding:8px 16px;" onclick="navigateTo('submit')">
            📝 Submit New Complaint →
          </button>
        </div>
      </div>
    </div>

    <!-- Student Stats Strip -->
    <div class="stats-grid" id="studentStatsGrid">
      <div class="stat-card"><div class="stat-info"><div class="stat-label">Loading...</div></div></div>
    </div>

    <div class="dashboard-grid" style="margin-top:24px;">
      <div>
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">📋 My Recent Complaints</h3>
            <button class="btn btn-sm btn-secondary" onclick="navigateTo('complaints')">View All</button>
          </div>
          <div id="studentRecentComplaints"><p style="color:var(--gray-500)">Loading...</p></div>
        </div>
      </div>
      <div>
        <div class="card mb-24">
          <h3 class="card-title mb-16">⚡ Quick Actions</h3>
          <div class="quick-actions">
            <button class="btn btn-primary btn-sm" onclick="navigateTo('submit')">📝 Submit Complaint</button>
            <button class="btn btn-secondary btn-sm" onclick="navigateTo('complaints')">📋 My Complaints</button>
          </div>
        </div>
        <div class="card">
          <h3 class="card-title mb-16">📌 How It Works</h3>
          <div style="display:flex;flex-direction:column;gap:12px;">
            ${[
              ['1️⃣', 'Submit a Campus Complaint', 'Describe the problem with location details.'],
              ['2️⃣', 'AI Validates & Classifies', 'Gemini AI checks if it\'s a valid maintenance issue.'],
              ['3️⃣', 'Priority Auto-Assigned', 'P1 Critical → P4 Low based on risk analysis.'],
              ['4️⃣', 'Track Resolution', 'View status updates as the issue gets resolved.'],
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
          <div class="stat-label">Pending</div>
        </div>
      </div>
      <div class="stat-card" style="background:linear-gradient(135deg,#dcfce7,#bbf7d0);">
        <div class="stat-icon">✅</div>
        <div class="stat-info">
          <div class="stat-number">${ss.my_resolved || 0}</div>
          <div class="stat-label">Resolved</div>
        </div>
      </div>
      <div class="stat-card critical">
        <div class="stat-icon">🚨</div>
        <div class="stat-info">
          <div class="stat-number">${ss.my_critical || 0}</div>
          <div class="stat-label">My Critical</div>
        </div>
      </div>
    `;
  } else if (stats) {
    // Fallback: show campus stats in simple form
    document.getElementById('studentStatsGrid').innerHTML = `
      <div class="stat-card critical">
        <div class="stat-icon">🚨</div>
        <div class="stat-info"><div class="stat-number">${stats.total}</div><div class="stat-label">Campus Complaints</div></div>
      </div>
      <div class="stat-card high">
        <div class="stat-icon">⚠️</div>
        <div class="stat-info"><div class="stat-number">${stats.pending}</div><div class="stat-label">Pending</div></div>
      </div>
    `;
  }

  // Load MY complaints (backend scopes to student's own)
  const result = await getComplaints({ per_page: 5, sort_by: 'date', order: 'desc' });
  const container = document.getElementById('studentRecentComplaints');
  if (result && result.complaints && result.complaints.length > 0) {
    const rows = result.complaints.map(c => `
      <tr class="clickable" onclick="showComplaintDetail('${escapeHtml(c.id)}')">
        <td data-label="Title">${escapeHtml(c.title)}</td>
        <td data-label="Priority">${priorityBadge(c.priority)}</td>
        <td data-label="Status">${statusBadge(c.status)}</td>
        <td data-label="Date">${formatDate(c.created_at)}</td>
      </tr>
    `).join('');
    container.innerHTML = `
      <div class="table-wrapper">
        <table class="table-mobile-cards">
          <thead><tr><th>Title</th><th>Priority</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } else if (result && result.complaints && result.complaints.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-title">No complaints yet</div>
        <p class="empty-state-text">You haven't submitted any complaints. Click the button below to get started.</p>
        <button class="btn btn-primary btn-sm" onclick="navigateTo('submit')">Submit Complaint</button>
      </div>
    `;
  } else {
    container.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span> Could not load your complaints.</div>`;
  }
}

// ---------------------------------------------------------------------------
// Staff (Teacher / Warden) Dashboard
// ---------------------------------------------------------------------------

async function loadStaffDashboard() {
  const page = document.getElementById('page-dashboard');
  const auth = getAuthState();
  const isWarden = auth.role === 'warden';
  const userName = auth.user ? (auth.user.full_name || auth.user.username) : 'Staff';
  const roleLabel = isWarden ? 'Hostel Warden' : 'Faculty Committee';

  page.innerHTML = `
    <!-- Proactive Intelligence Hero Banner -->
    <div class="card mb-24" style="background:linear-gradient(135deg,#15803d,#166534);color:white;border-radius:var(--radius-lg);padding:22px 26px;border:none;">
      <div class="flex justify-between items-center flex-wrap gap-16">
        <div>
          <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:12px;display:inline-block;margin-bottom:8px;">
            🛡️ ${escapeHtml(roleLabel)} — Command Dashboard
          </span>
          <h2 style="font-size:22px;color:white;font-weight:700;line-height:1.2;">
            Welcome, ${escapeHtml(userName)}
          </h2>
          <p style="font-size:13px;opacity:0.9;margin-top:6px;max-width:680px;line-height:1.5;">
            Campus-wide risk intelligence, urgency ranked complaints, and department performance at a glance.
          </p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-sm" style="background:white;color:var(--primary-dark);font-weight:700;padding:8px 16px;" onclick="navigateTo('ranked-queue')">
            📊 Ranked Queue →
          </button>
          <button class="btn btn-sm" style="background:rgba(255,255,255,0.15);color:white;font-weight:600;padding:8px 16px;" onclick="navigateTo('risk-intelligence')">
            🧭 Risk Intelligence
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

    <div class="dashboard-grid" style="margin-top:24px;">
      <div>
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">🚨 Recent High-Priority Complaints</h3>
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
            <button class="btn btn-danger btn-sm" onclick="navigateTo('ranked-queue')">📊 Urgency Queue</button>
            <button class="btn btn-secondary btn-sm" onclick="navigateTo('category-arranger')">📁 By Category</button>
            <button class="btn btn-primary btn-sm" onclick="navigateTo('tickets')">🎫 Tickets & SLA</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Load campus stats
  const stats = await getStats();
  if (stats) {
    document.getElementById('statsGrid').innerHTML = `
      <div class="stat-card critical">
        <div class="stat-icon">🚨</div>
        <div class="stat-info"><div class="stat-number">${stats.total}</div><div class="stat-label">Total Complaints</div></div>
      </div>
      <div class="stat-card critical">
        <div class="stat-icon">⛔</div>
        <div class="stat-info"><div class="stat-number">${stats.critical}</div><div class="stat-label">P1 Critical</div></div>
      </div>
      <div class="stat-card high">
        <div class="stat-icon">⚠️</div>
        <div class="stat-info"><div class="stat-number">${stats.high}</div><div class="stat-label">P2 High</div></div>
      </div>
      <div class="stat-card pending">
        <div class="stat-icon">⏳</div>
        <div class="stat-info"><div class="stat-number">${stats.pending}</div><div class="stat-label">Pending</div></div>
      </div>
    `;
  } else {
    document.getElementById('statsGrid').innerHTML = `
      <div class="alert alert-danger"><span class="alert-icon">❌</span> Could not load stats. Is the backend running?</div>
    `;
  }

  // Load recent complaints (all, sorted by urgency)
  const result = await getComplaints({ per_page: 5, sort_by: 'urgency', order: 'desc' });
  if (result && result.complaints.length > 0) {
    const rows = result.complaints.map(c => `
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
          <thead><tr><th>ID</th><th>Title</th><th>Location</th><th>Priority</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } else if (result && result.complaints.length === 0) {
    document.getElementById('recentComplaints').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-title">No complaints yet</div>
        <p class="empty-state-text">No student complaints have been submitted yet.</p>
      </div>
    `;
  } else {
    document.getElementById('recentComplaints').innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span> Could not load complaints.</div>`;
  }

  // Priority distribution chart
  if (result && result.complaints) {
    const allData = await getComplaints({ per_page: 200 });
    if (allData) {
      // Count by normalised priority keyword
      const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
      allData.complaints.forEach(c => {
        const p = (c.priority || '').toLowerCase();
        if (p.includes('critical') || p.includes('p1')) counts.Critical++;
        else if (p.includes('high') || p.includes('p2')) counts.High++;
        else if (p.includes('medium') || p.includes('p3')) counts.Medium++;
        else if (p.includes('low') || p.includes('p4')) counts.Low++;
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
