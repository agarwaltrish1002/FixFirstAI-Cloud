/**
 * FixFirst AI — Urgency Ranked Queue
 * ====================================
 * Displays complaints sorted by multi-factor urgency score.
 * Only accessible to teachers/wardens (enforced by backend).
 */

import { getRankedComplaints, generateTicket } from './api.js';
import { escapeHtml, formatDate, showToast } from './app.js';
import { getAuthState } from './auth.js';

export async function loadRankedQueue() {
  const page = document.getElementById('page-ranked-queue');
  const auth = getAuthState();

  // Role guard (backend also enforces this)
  if (auth.role !== 'teacher' && auth.role !== 'warden') {
    page.innerHTML = `
      <div class="alert alert-danger" style="margin:24px;">
        <span class="alert-icon">🔒</span>
        Access restricted. Only Teachers and Wardens can view the Urgency Ranked Queue.
      </div>
    `;
    return;
  }

  page.innerHTML = `
    <div class="flex justify-between items-center mb-16" style="flex-wrap:wrap;gap:12px;">
      <div>
        <h2 style="font-size:22px;font-weight:700;color:var(--gray-900);">📊 Urgency Ranked Queue</h2>
        <p style="font-size:13px;color:var(--gray-500);margin-top:4px;">
          Complaints ranked by multi-factor urgency score. Act on top-ranked items first.
        </p>
      </div>
      <button class="btn btn-sm btn-secondary" id="refreshRankedBtn">🔄 Refresh</button>
    </div>

    <div class="card mb-16" style="padding:14px 20px;background:linear-gradient(135deg,#fef9c3,#fef3c7);border:1px solid #fcd34d;">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-size:20px;">🧮</span>
        <div>
          <strong style="color:#92400e;font-size:13px;">How Urgency Score is Calculated</strong>
          <p style="font-size:12px;color:#78350f;margin:2px 0 0;">
            Priority weight × Safety impact + Age penalty + Spread risk + Damage potential + Pending days factor
          </p>
        </div>
      </div>
    </div>

    <div id="rankedQueueList">
      <div style="text-align:center;padding:48px;color:var(--gray-400);">
        <div style="font-size:32px;margin-bottom:12px;">⏳</div>
        <p>Loading ranked complaints...</p>
      </div>
    </div>
  `;

  document.getElementById('refreshRankedBtn').addEventListener('click', () => loadRankedQueue());

  await fetchAndRenderRanked();
}

async function fetchAndRenderRanked() {
  const container = document.getElementById('rankedQueueList');
  if (!container) return;

  const data = await getRankedComplaints();

  if (!data || !data.complaints || data.complaints.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🏆</div>
        <div class="empty-state-title">All Clear!</div>
        <p class="empty-state-text">No active complaints to rank. Submit a complaint to see it appear here.</p>
      </div>
    `;
    return;
  }

  const complaints = data.complaints;
  const maxScore = complaints[0]?.ranking_score || 100;

  container.innerHTML = `
    <div class="ranked-queue-list">
      ${complaints.map((c, idx) => renderRankedCard(c, idx + 1, maxScore)).join('')}
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
        showToast(`Ticket ${ticket.ticket_id} created!`, 'success');
        btn.textContent = '✅ Ticket Created';
      } catch (err) {
        showToast('Could not generate ticket: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = '🎫 Generate Ticket';
      }
    });
  });
}

function renderRankedCard(c, rank, maxScore) {
  const scorePercent = Math.min(100, ((c.ranking_score || 0) / maxScore) * 100);

  // Priority label parsing: "P1 – Critical" → we extract keyword
  const priorityStr = c.priority || 'Unknown';
  const isCritical = priorityStr.includes('P1') || priorityStr.toLowerCase().includes('critical');
  const isHigh     = priorityStr.includes('P2') || priorityStr.toLowerCase().includes('high');
  const isMedium   = priorityStr.includes('P3') || priorityStr.toLowerCase().includes('medium');

  const priorityColor = isCritical ? '#dc2626' : isHigh ? '#ea580c' : isMedium ? '#d97706' : '#16a34a';
  const priorityBg    = isCritical ? '#fef2f2' : isHigh ? '#fff7ed' : isMedium ? '#fffbeb' : '#f0fdf4';
  const rankColor     = rank === 1 ? '#dc2626' : rank <= 3 ? '#ea580c' : rank <= 10 ? '#d97706' : '#6b7280';

  const ageStr = c.age_hours != null ? `${Math.round(c.age_hours)}h ago` : formatDate(c.created_at);

  return `
    <div class="ranked-card ${isCritical ? 'card-critical-glow' : ''}" style="background:white;border:1px solid ${isCritical ? '#fca5a5' : '#e5e7eb'};border-radius:12px;padding:16px 20px;margin-bottom:12px;box-shadow:${isCritical ? '0 0 0 2px rgba(220,38,38,0.15)' : 'var(--shadow-sm)'};">
      <div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;">
        <!-- Rank Badge -->
        <div style="min-width:48px;text-align:center;">
          <div style="width:48px;height:48px;border-radius:50%;background:${rankColor};color:white;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,0.15);">
            #${rank}
          </div>
        </div>

        <!-- Main Content -->
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
            <span style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--gray-400);text-transform:uppercase;">${escapeHtml(c.id)}</span>
            <span style="background:${priorityBg};color:${priorityColor};border:1px solid ${priorityColor}30;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;">
              ${escapeHtml(priorityStr)}
            </span>
            <span style="background:var(--gray-100);color:var(--gray-600);border-radius:6px;padding:2px 8px;font-size:11px;">
              ${escapeHtml(c.category || 'Uncategorized')}
            </span>
            <span style="background:var(--gray-50);color:var(--gray-500);border-radius:6px;padding:2px 8px;font-size:11px;">
              ${escapeHtml(c.status || 'Pending')}
            </span>
          </div>

          <h4 style="font-size:15px;font-weight:600;color:var(--gray-900);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${escapeHtml(c.title)}
          </h4>
          <p style="font-size:12px;color:var(--gray-500);margin-bottom:8px;">
            📍 ${escapeHtml(c.location || '—')} &nbsp;|&nbsp; 🕐 ${ageStr}
          </p>

          <!-- Urgency Score Bar -->
          <div style="margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
              <span style="font-size:11px;font-weight:600;color:${rankColor};">Urgency Score: ${(c.ranking_score || 0).toFixed(1)}</span>
              <span style="font-size:11px;color:var(--gray-400);">${scorePercent.toFixed(0)}% of max</span>
            </div>
            <div style="height:6px;background:var(--gray-100);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${scorePercent}%;background:linear-gradient(90deg,${priorityColor},${priorityColor}88);border-radius:3px;transition:width 0.5s;"></div>
            </div>
          </div>

          ${c.ranking_reason ? `
            <div style="background:var(--gray-50);border-left:3px solid ${priorityColor};padding:6px 10px;border-radius:0 6px 6px 0;font-size:12px;color:var(--gray-600);margin-bottom:8px;">
              🧮 ${escapeHtml(c.ranking_reason)}
            </div>
          ` : ''}

          <!-- Factor Pills -->
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${c.affected_scope ? `<span style="background:#eff6ff;color:#1d4ed8;border-radius:20px;padding:2px 8px;font-size:11px;">👥 ${escapeHtml(c.affected_scope)}</span>` : ''}
            ${c.damage_risk ? `<span style="background:#fff7ed;color:#c2410c;border-radius:20px;padding:2px 8px;font-size:11px;">⚠️ ${escapeHtml(c.damage_risk)}</span>` : ''}
          </div>
        </div>

        <!-- Actions -->
        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
          <button class="btn btn-sm btn-primary gen-ticket-btn" data-id="${escapeHtml(c.id)}">
            🎫 Generate Ticket
          </button>
          <button class="btn btn-sm btn-secondary" onclick="navigateTo('complaints')" style="font-size:11px;">
            📋 View Details
          </button>
        </div>
      </div>
    </div>
  `;
}
