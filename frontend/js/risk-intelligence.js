/**
 * FixFirst AI — Campus Risk Intelligence & Preventive Operations
 * ==============================================================
 * Vision: "From Reactive Complaints to Proactive Campus Care"
 *
 * Displays:
 *  - Real-time Priority Distribution Pie / Donut Chart (Critical, High, Medium, Low)
 *  - Building-by-Building Risk Matrix & Safety Scorecards
 *  - Hazard Clusters & Recurring Failure Pattern Detection
 *  - Proactive Preventative Maintenance Advisories & Checklists
 */

import { getCampusRiskIntelligence } from './api.js';
import { escapeHtml, showToast } from './app.js';

export async function loadRiskIntelligence() {
  const page = document.getElementById('page-risk-intelligence');
  if (!page) return;

  page.innerHTML = `
    <div class="page-header mb-20 flex justify-between items-center flex-wrap gap-12">
      <div>
        <h2 class="page-title flex items-center gap-8">
          <span>🧭</span> Campus Risk Intelligence
        </h2>
        <p class="text-muted" style="margin-top:2px;">
          Proactive telemetry: systemic recurrence detection, building scorecards & priority distribution.
        </p>
      </div>
      <div class="flex gap-8 items-center">
        <button class="btn btn-secondary btn-sm" id="refreshRiskBtn">🔄 Refresh Analytics</button>
        <button class="btn btn-primary btn-sm" onclick="navigateTo('submit')">📝 Report Hazard</button>
      </div>
    </div>

    <!-- Top Row: Interactive Priority Distribution Pie Chart & Key Metrics -->
    <div class="dashboard-grid mb-24" style="grid-template-columns: 1fr 1fr; gap:18px;">
      
      <!-- Left: Redesigned Priority Distribution Pie Chart -->
      <div class="card" style="padding:20px;">
        <div class="card-header" style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #f1f5f9;">
          <div>
            <h3 class="card-title" style="font-size:16px;">📊 Complaint Distribution by Priority</h3>
            <p style="font-size:12px;color:var(--gray-500);margin-top:2px;">
              Live breakdown of campus complaints across all 4 severity tiers from the database.
            </p>
          </div>
        </div>
        <div id="priorityPieChartContainer">
          <div style="text-align:center;padding:36px;color:var(--gray-400);">
            <div class="spinner" style="margin:0 auto 10px;"></div>
            <p style="font-size:13px;">Computing priority distribution...</p>
          </div>
        </div>
      </div>

      <!-- Right: Operational KPIs (Active Critical Hazards, Clusters, SLA Rate) -->
      <div class="card" style="padding:20px;">
        <div class="card-header" style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #f1f5f9;">
          <div>
            <h3 class="card-title" style="font-size:16px;">⚡ Critical Operational Metrics</h3>
            <p style="font-size:12px;color:var(--gray-500);margin-top:2px;">
              Immediate campus threat response and SLA compliance benchmarks.
            </p>
          </div>
        </div>
        <div id="kpiStatsContainer" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div style="text-align:center;padding:36px;grid-column:span 2;color:var(--gray-400);">
            <p style="font-size:13px;">Loading telemetry...</p>
          </div>
        </div>
      </div>

    </div>

    <!-- Main 2-Column Intelligence Layout -->
    <div class="dashboard-grid mb-24">
      <!-- Left Column: Building Risk Matrix -->
      <div>
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">🏢 Building Risk Matrix &amp; Safety Health Scores</h3>
              <p style="font-size:12px;color:var(--gray-500);margin-top:2px;">
                Algorithmic 0–100 health index based on active hazards, recurrence, and severity.
              </p>
            </div>
          </div>
          <div id="buildingScorecardsContainer">
            <p style="color:var(--gray-500);">Loading building safety scores...</p>
          </div>
        </div>

        <!-- Detected Hazard Clusters -->
        <div class="card mt-24">
          <div class="card-header">
            <div>
              <h3 class="card-title">⚡ Recurring Hazard Clusters &amp; Pattern Detection</h3>
              <p style="font-size:12px;color:var(--gray-500);margin-top:2px;">
                Identified systemic infrastructure failures before they escalate into emergencies.
              </p>
            </div>
          </div>
          <div id="hazardClustersContainer">
            <p style="color:var(--gray-500);">Scanning for failure patterns...</p>
          </div>
        </div>
      </div>

      <!-- Right Column: Proactive Advisories & Framework -->
      <div>
        <!-- Preventive Advisories -->
        <div class="card mb-24">
          <div class="card-header">
            <h3 class="card-title">🛡️ Proactive Maintenance Advisories</h3>
          </div>
          <p style="font-size:13px;color:var(--gray-700);margin-bottom:16px;">
            Targeted inspection protocols formulated from active hazard trends:
          </p>
          <div id="preventiveAdvisoriesContainer">
            <p style="color:var(--gray-500);">Generating advisories...</p>
          </div>
        </div>

        <!-- Campus Safety Paradigm Box -->
        <div class="card" style="background:#f0fdf4;border:1px solid #bbf7d0;">
          <h4 style="font-size:15px;color:#166534;margin-bottom:8px;">
            🌱 The Proactive Care Framework
          </h4>
          <p style="font-size:13px;line-height:1.6;color:#1e293b;">
            FixFirst AI transitions maintenance from reactive emergencies to scheduled prevention. By correlating localized electrical faults with moisture readings, water leaks with slip risks, and door blockages with safety regulations, facilities teams solve root causes rather than symptoms.
          </p>
          <div class="mt-12">
            <button class="btn btn-primary btn-sm" onclick="navigateTo('tickets')">
              View Actionable Work Tickets &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('refreshRiskBtn').addEventListener('click', () => {
    showToast('Refreshing campus risk telemetry...', 'info', 1200);
    renderIntelligenceData();
  });

  await renderIntelligenceData();
}

async function renderIntelligenceData() {
  const data = await getCampusRiskIntelligence();
  if (!data) {
    document.getElementById('priorityPieChartContainer').innerHTML = `
      <div class="alert alert-danger"><span class="alert-icon">❌</span> Could not load risk intelligence data. Ensure the backend is running.</div>
    `;
    return;
  }

  // 1. Render Pie Chart (Priority Distribution)
  const dist = data.priority_distribution || {
    Critical: data.active_critical_hazards || 0,
    High: data.active_high_risks || 0,
    Medium: 0,
    Low: 0,
    total: 0
  };

  const pieContainer = document.getElementById('priorityPieChartContainer');
  if (pieContainer) {
    pieContainer.innerHTML = renderPriorityPieChart(dist);
    attachPieTooltips(pieContainer);
  }

  // 2. Render Operational KPI Cards (replacing redundant health score number)
  const kpiContainer = document.getElementById('kpiStatsContainer');
  if (kpiContainer) {
    kpiContainer.innerHTML = `
      <div class="stat-card critical" style="margin-bottom:0;">
        <div class="stat-icon">🚨</div>
        <div class="stat-info">
          <div class="stat-number">${data.active_critical_hazards}</div>
          <div class="stat-label">Active Critical Hazards</div>
        </div>
      </div>
      <div class="stat-card high" style="margin-bottom:0;">
        <div class="stat-icon">⚠️</div>
        <div class="stat-info">
          <div class="stat-number">${data.active_high_risks || 0}</div>
          <div class="stat-label">Active High Risks</div>
        </div>
      </div>
      <div class="stat-card" style="margin-bottom:0;border-left:4px solid #3b82f6;">
        <div class="stat-icon">🔍</div>
        <div class="stat-info">
          <div class="stat-number">${data.hazard_clusters_count}</div>
          <div class="stat-label">Recurring Hazard Clusters</div>
        </div>
      </div>
      <div class="stat-card resolved" style="margin-bottom:0;">
        <div class="stat-icon">⏱️</div>
        <div class="stat-info">
          <div class="stat-number">${data.sla_compliance_rate}%</div>
          <div class="stat-label">SLA Compliance Rate</div>
        </div>
      </div>
    `;
  }

  // 3. Building Risk Matrix Cards
  const scorecards = data.building_scorecards || [];
  const scorecardsContainer = document.getElementById('buildingScorecardsContainer');
  if (scorecardsContainer) {
    if (scorecards.length === 0) {
      scorecardsContainer.innerHTML = `
        <div class="empty-state"><p>No location data available.</p></div>
      `;
    } else {
      scorecardsContainer.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${scorecards.map(b => `
            <div style="border:1px solid var(--gray-200);border-radius:var(--radius);padding:14px 16px;background:var(--white);transition:transform 0.15s,box-shadow 0.15s;" class="hover-shadow">
              <div class="flex justify-between items-center mb-8 flex-wrap gap-8">
                <div>
                  <strong style="font-size:15px;color:var(--gray-900);">${escapeHtml(b.location)}</strong>
                  <span class="badge ${b.badge_class}" style="margin-left:8px;">${escapeHtml(b.risk_tier)}</span>
                </div>
                <div style="font-size:17px;font-weight:700;color:${b.color};">
                  ${b.safety_score}<span style="font-size:12px;color:var(--gray-500);font-weight:500;"> / 100</span>
                </div>
              </div>

              <!-- Health Progress Bar -->
              <div style="height:7px;background:var(--gray-100);border-radius:4px;overflow:hidden;margin-bottom:10px;">
                <div style="height:100%;width:${b.safety_score}%;background:${b.color};border-radius:4px;transition:width 0.6s ease;"></div>
              </div>

              <div class="flex justify-between items-center flex-wrap gap-8" style="font-size:12px;color:var(--gray-700);">
                <div>
                  <span>Active: <strong>${b.unresolved_count}</strong></span>
                  <span style="margin:0 6px;">&bull;</span>
                  <span style="color:var(--red);">Critical: <strong>${b.critical_count}</strong></span>
                  <span style="margin:0 6px;">&bull;</span>
                  <span style="color:var(--orange);">High: <strong>${b.high_count}</strong></span>
                </div>
                <div style="background:var(--gray-100);padding:2px 8px;border-radius:4px;color:var(--gray-700);font-size:11px;font-weight:500;">
                  ${escapeHtml(b.primary_concern)}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  // 4. Hazard Clusters
  const clusters = data.hazard_clusters || [];
  const clustersContainer = document.getElementById('hazardClustersContainer');
  if (clustersContainer) {
    if (clusters.length === 0) {
      clustersContainer.innerHTML = `
        <div class="alert alert-success">
          <span class="alert-icon">✅</span>
          <div>No systemic recurrence clusters detected. Isolated complaints are managed individually.</div>
        </div>
      `;
    } else {
      clustersContainer.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:14px;">
          ${clusters.map(cl => `
            <div style="border-left:4px solid ${cl.severity === 'Critical Hotspot' ? 'var(--red)' : 'var(--orange)'};background:var(--gray-50);border-radius:var(--radius);padding:14px 16px;border:1px solid var(--gray-200);border-left-width:4px;">
              <div class="flex justify-between items-center mb-6 flex-wrap gap-8">
                <div>
                  <span style="font-size:11px;font-weight:700;color:var(--gray-500);text-transform:uppercase;">${escapeHtml(cl.cluster_id)} &bull; ${escapeHtml(cl.location)}</span>
                  <h4 style="font-size:14px;font-weight:700;color:var(--gray-900);margin-top:2px;">
                    Recurring ${escapeHtml(cl.category)} Issue (${cl.incident_count} reports)
                  </h4>
                </div>
                <span class="badge ${cl.severity_badge}">${escapeHtml(cl.severity)}</span>
              </div>

              <div style="font-size:12px;line-height:1.6;margin-bottom:8px;">
                <div style="margin-bottom:3px;">
                  <strong style="color:var(--gray-900);">Root Cause:</strong>
                  <span style="color:var(--gray-700);">${escapeHtml(cl.root_cause_hypothesis)}</span>
                </div>
                <div style="margin-bottom:4px;">
                  <strong style="color:var(--red);">Escalation Risk:</strong>
                  <span style="color:var(--gray-700);">${escapeHtml(cl.escalation_risk)}</span>
                </div>
              </div>

              <div style="background:var(--white);padding:6px 10px;border-radius:6px;border:1px solid var(--gray-200);font-size:12px;">
                <strong style="color:#0369a1;">Recommended Protocol:</strong>
                <span style="color:var(--gray-700);margin-left:4px;">${escapeHtml(cl.recommended_action)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  // 5. Preventive Advisories
  const advisories = data.preventive_advisories || [];
  const advContainer = document.getElementById('preventiveAdvisoriesContainer');
  if (advContainer) {
    advContainer.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px;">
        ${advisories.map(adv => `
          <div style="border:1px solid var(--gray-200);border-radius:var(--radius);padding:14px 16px;background:var(--white);">
            <div class="flex justify-between items-center mb-6 flex-wrap gap-8">
              <h4 style="font-size:14px;font-weight:700;color:var(--gray-900);">${escapeHtml(adv.title)}</h4>
              <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:${adv.urgency_color}15;color:${adv.urgency_color};">
                ${escapeHtml(adv.urgency)}
              </span>
            </div>
            <p style="font-size:12px;color:var(--gray-500);margin-bottom:6px;">
              Target Zones: <strong>${escapeHtml(adv.target_zones)}</strong>
            </p>
            <p style="font-size:12px;color:var(--gray-700);margin-bottom:8px;line-height:1.5;">
              ${escapeHtml(adv.rationale)}
            </p>
            <div style="background:var(--gray-50);padding:8px 12px;border-radius:6px;font-size:12px;">
              <strong style="display:block;margin-bottom:4px;color:var(--gray-900);">Action Checklist:</strong>
              <ul style="margin-left:18px;margin-bottom:0;color:var(--gray-700);">
                ${adv.preventive_checklist.map(item => `
                  <li style="margin-bottom:3px;">${escapeHtml(item)}</li>
                `).join('')}
              </ul>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

/**
 * Generates an SVG Pie / Donut Chart with Legend and Hover Effects
 */
function renderPriorityPieChart(dist) {
  const total = dist.total || (
    (dist.Critical || 0) + (dist.High || 0) + (dist.Medium || 0) + (dist.Low || 0)
  );

  if (total === 0) {
    return `
      <div class="empty-state" style="padding:28px 16px;">
        <div style="font-size:36px;margin-bottom:8px;">📊</div>
        <div class="empty-state-title" style="font-size:14px;">No Active Complaints</div>
        <p class="empty-state-text" style="font-size:12px;">Zero complaints recorded in database.</p>
      </div>
    `;
  }

  const items = [
    { label: 'Critical (P1)', count: dist.Critical || 0, color: '#dc2626' },
    { label: 'High (P2)', count: dist.High || 0, color: '#ea580c' },
    { label: 'Medium (P3)', count: dist.Medium || 0, color: '#d97706' },
    { label: 'Low (P4)', count: dist.Low || 0, color: '#0284c7' },
  ];

  // SVG Donut calculation
  const r = 68;
  const c = 2 * Math.PI * r; // ~427.256
  let accumulatedPercent = 0;

  const slices = items.map(item => {
    const pct = total > 0 ? (item.count / total) * 100 : 0;
    const strokeDasharray = `${(pct / 100) * c} ${c}`;
    const strokeDashoffset = -((accumulatedPercent / 100) * c);
    accumulatedPercent += pct;

    return {
      ...item,
      pct: pct.toFixed(1),
      strokeDasharray,
      strokeDashoffset,
    };
  });

  const circles = slices.map(s => {
    if (s.count === 0) return '';
    return `
      <circle
        cx="100" cy="100" r="${r}"
        fill="transparent"
        stroke="${s.color}"
        stroke-width="28"
        stroke-dasharray="${s.strokeDasharray}"
        stroke-dashoffset="${s.strokeDashoffset}"
        class="pie-slice-segment"
        data-label="${s.label}"
        data-count="${s.count}"
        data-pct="${s.pct}"
        style="transition:stroke-width 0.2s, stroke-opacity 0.2s; cursor:pointer;"
      />
    `;
  }).join('');

  return `
    <div style="display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap;padding:6px 0;">
      
      <!-- Donut Chart -->
      <div style="position:relative;width:170px;height:170px;flex-shrink:0;">
        <svg viewBox="0 0 200 200" style="transform:rotate(-90deg);width:100%;height:100%;border-radius:50%;overflow:visible;">
          <!-- Gray track -->
          <circle cx="100" cy="100" r="${r}" fill="transparent" stroke="#f1f5f9" stroke-width="28" />
          ${circles}
        </svg>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;">
          <span style="font-size:26px;font-weight:800;color:#0f172a;line-height:1;">${total}</span>
          <span style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Total</span>
        </div>
      </div>

      <!-- Legend -->
      <div style="flex:1;min-width:180px;display:flex;flex-direction:column;gap:6px;">
        ${slices.map(s => `
          <div class="pie-legend-row" data-label="${s.label}" style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;transition:background 0.15s;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="width:10px;height:10px;border-radius:3px;background:${s.color};display:inline-block;flex-shrink:0;"></span>
              <span style="color:#1e293b;font-weight:600;">${s.label}</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <strong style="color:${s.color};font-size:12px;">${s.count}</strong>
              <span style="font-size:10px;color:#64748b;background:white;padding:1px 6px;border-radius:8px;border:1px solid #cbd5e1;font-weight:600;">${s.pct}%</span>
            </div>
          </div>
        `).join('')}
      </div>

    </div>
    <div id="pieTooltip" style="display:none;text-align:center;font-size:11px;font-weight:600;color:#334155;background:#f1f5f9;padding:4px 8px;border-radius:4px;margin-top:8px;"></div>
  `;
}

function attachPieTooltips(container) {
  const tooltip = container.querySelector('#pieTooltip');
  if (!tooltip) return;

  container.querySelectorAll('.pie-slice-segment').forEach(seg => {
    seg.addEventListener('mouseenter', () => {
      seg.setAttribute('stroke-width', '34');
      const label = seg.getAttribute('data-label');
      const count = seg.getAttribute('data-count');
      const pct = seg.getAttribute('data-pct');
      tooltip.style.display = 'block';
      tooltip.textContent = `🎯 ${label}: ${count} complaints (${pct}% of campus total)`;
    });
    seg.addEventListener('mouseleave', () => {
      seg.setAttribute('stroke-width', '28');
      tooltip.style.display = 'none';
    });
  });
}
