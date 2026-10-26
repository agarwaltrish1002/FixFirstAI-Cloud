/**
 * FixFirst AI — Campus Risk Intelligence & Preventive Operations
 * ==============================================================
 * Vision: "From Reactive Complaints to Proactive Campus Care"
 *
 * Displays:
 *  - Campus Health Index & SLA Performance
 *  - Building-by-Building Risk Matrix & Safety Scorecards
 *  - Hazard Clusters & Recurring Failure Pattern Detection
 *  - Proactive Preventative Maintenance Advisories & Checklists
 */

import { getCampusRiskIntelligence } from './api.js';
import { escapeHtml, showToast } from './app.js';

export async function loadRiskIntelligence() {
  const page = document.getElementById('page-risk-intelligence');

  page.innerHTML = `
    <div class="flex justify-between items-center mb-24 flex-wrap gap-12">
      <div>
        <h2 style="font-size:22px;color:var(--gray-900);">🧭 Campus Risk Intelligence</h2>
        <p style="font-size:13px;color:var(--primary-dark);font-weight:600;margin-top:2px;">
          From Reactive Complaints to Proactive Campus Care
        </p>
      </div>
      <div class="flex gap-12 items-center">
        <button class="btn btn-secondary btn-sm" id="refreshRiskBtn">🔄 Refresh Analytics</button>
        <button class="btn btn-primary btn-sm" onclick="navigateTo('submit')">📝 Report Hazard</button>
      </div>
    </div>

    <!-- Top KPI Grid -->
    <div class="stats-grid mb-24" id="kpiGrid">
      <div class="stat-card"><div class="stat-info"><div class="stat-label">Analyzing campus data...</div></div></div>
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

      <!-- Right Column: Proactive Advisories & SLA Risk Matrix -->
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
        <div class="card" style="background:var(--primary-bg);border:1px solid #bbf7d0;">
          <h4 style="font-size:15px;color:var(--primary-dark);margin-bottom:8px;">
            🌱 The Proactive Care Framework
          </h4>
          <p style="font-size:13px;line-height:1.6;color:var(--gray-700);">
            FixFirst AI doesn't wait for disaster. By correlating localized electrical faults with moisture readings, water leaks with slip risks, and door blockages with chemical inventories, it enables facilities teams to resolve root causes rather than symptoms.
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
    showToast('Refreshing campus risk telemetry...', 'info', 1500);
    renderIntelligenceData();
  });

  renderIntelligenceData();
}

async function renderIntelligenceData() {
  const data = await getCampusRiskIntelligence();
  if (!data) {
    document.getElementById('kpiGrid').innerHTML = `
      <div class="alert alert-danger w-full"><span class="alert-icon">❌</span> Could not load risk intelligence data. Ensure the backend is running.</div>
    `;
    return;
  }

  // 1. KPI Cards
  const healthTierClass = data.campus_health_score >= 80 ? 'resolved' : (data.campus_health_score >= 65 ? 'high' : 'critical');
  document.getElementById('kpiGrid').innerHTML = `
    <div class="stat-card ${healthTierClass}">
      <div class="stat-icon">🏥</div>
      <div class="stat-info">
        <div class="stat-number">${data.campus_health_score}<span style="font-size:16px;font-weight:500;">/100</span></div>
        <div class="stat-label">Campus Health Index (${escapeHtml(data.campus_health_tier)})</div>
      </div>
    </div>
    <div class="stat-card critical">
      <div class="stat-icon">🚨</div>
      <div class="stat-info">
        <div class="stat-number">${data.active_critical_hazards}</div>
        <div class="stat-label">Active Critical Hazards</div>
      </div>
    </div>
    <div class="stat-card high">
      <div class="stat-icon">🔍</div>
      <div class="stat-info">
        <div class="stat-number">${data.hazard_clusters_count}</div>
        <div class="stat-label">Recurring Failure Clusters</div>
      </div>
    </div>
    <div class="stat-card resolved">
      <div class="stat-icon">⏱️</div>
      <div class="stat-info">
        <div class="stat-number">${data.sla_compliance_rate}%</div>
        <div class="stat-label">SLA Compliance Rate</div>
      </div>
    </div>
  `;

  // 2. Building Risk Matrix Cards
  const scorecards = data.building_scorecards || [];
  if (scorecards.length === 0) {
    document.getElementById('buildingScorecardsContainer').innerHTML = `
      <div class="empty-state"><p>No location data available.</p></div>
    `;
  } else {
    document.getElementById('buildingScorecardsContainer').innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px;">
        ${scorecards.map(b => `
          <div style="border:1px solid var(--gray-200);border-radius:var(--radius);padding:14px 16px;background:var(--white);transition:transform 0.2s,box-shadow 0.2s;" class="hover-shadow">
            <div class="flex justify-between items-center mb-8 flex-wrap gap-8">
              <div>
                <strong style="font-size:15px;color:var(--gray-900);">${escapeHtml(b.location)}</strong>
                <span class="badge ${b.badge_class}" style="margin-left:8px;">${escapeHtml(b.risk_tier)}</span>
              </div>
              <div style="font-size:18px;font-weight:700;color:${b.color};">
                ${b.safety_score}<span style="font-size:12px;color:var(--gray-500);font-weight:500;"> / 100</span>
              </div>
            </div>

            <!-- Health Progress Bar -->
            <div style="height:8px;background:var(--gray-100);border-radius:4px;overflow:hidden;margin-bottom:10px;">
              <div style="height:100%;width:${b.safety_score}%;background:${b.color};border-radius:4px;transition:width 0.6s ease;"></div>
            </div>

            <div class="flex justify-between items-center flex-wrap gap-8" style="font-size:12px;color:var(--gray-700);">
              <div>
                <span>Active Unresolved: <strong>${b.unresolved_count}</strong></span>
                <span style="margin:0 6px;">&bull;</span>
                <span style="color:var(--red);">Critical: <strong>${b.critical_count}</strong></span>
                <span style="margin:0 6px;">&bull;</span>
                <span style="color:var(--orange);">High: <strong>${b.high_count}</strong></span>
              </div>
              <div style="background:var(--gray-100);padding:2px 8px;border-radius:4px;color:var(--gray-700);">
                ${escapeHtml(b.primary_concern)}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // 3. Hazard Clusters
  const clusters = data.hazard_clusters || [];
  if (clusters.length === 0) {
    document.getElementById('hazardClustersContainer').innerHTML = `
      <div class="alert alert-success">
        <span class="alert-icon">✅</span>
        <div>No systemic recurrence clusters detected. Isolated complaints are managed individually.</div>
      </div>
    `;
  } else {
    document.getElementById('hazardClustersContainer').innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        ${clusters.map(cl => `
          <div style="border-left:4px solid ${cl.severity === 'Critical Hotspot' ? 'var(--red)' : 'var(--orange)'};background:var(--gray-50);border-radius:var(--radius);padding:16px;border:1px solid var(--gray-200);border-left-width:4px;">
            <div class="flex justify-between items-center mb-8 flex-wrap gap-8">
              <div>
                <span style="font-size:11px;font-weight:700;color:var(--gray-500);text-transform:uppercase;">${escapeHtml(cl.cluster_id)} &bull; ${escapeHtml(cl.location)}</span>
                <h4 style="font-size:15px;color:var(--gray-900);margin-top:2px;">
                  Recurring ${escapeHtml(cl.category)} Issue (${cl.incident_count} reports)
                </h4>
              </div>
              <span class="badge ${cl.severity_badge}">${escapeHtml(cl.severity)}</span>
            </div>

            <div style="font-size:13px;line-height:1.6;margin-bottom:8px;">
              <div style="margin-bottom:4px;">
                <strong style="color:var(--gray-900);">Hypothesized Root Cause:</strong>
                <span style="color:var(--gray-700);">${escapeHtml(cl.root_cause_hypothesis)}</span>
              </div>
              <div style="margin-bottom:6px;">
                <strong style="color:var(--red);">Escalation Risk if Delayed:</strong>
                <span style="color:var(--gray-700);">${escapeHtml(cl.escalation_risk)}</span>
              </div>
            </div>

            <div style="background:var(--white);padding:8px 12px;border-radius:6px;border:1px solid var(--gray-200);font-size:12px;">
              <strong style="color:var(--primary-dark);">Proactive Preventive Protocol:</strong>
              <span style="color:var(--gray-700);margin-left:4px;">${escapeHtml(cl.recommended_action)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // 4. Preventive Advisories
  const advisories = data.preventive_advisories || [];
  document.getElementById('preventiveAdvisoriesContainer').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px;">
      ${advisories.map(adv => `
        <div style="border:1px solid var(--gray-200);border-radius:var(--radius);padding:14px 16px;background:var(--white);">
          <div class="flex justify-between items-center mb-6 flex-wrap gap-8">
            <h4 style="font-size:14px;font-weight:700;color:var(--gray-900);">${escapeHtml(adv.title)}</h4>
            <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:${adv.urgency_color}15;color:${adv.urgency_color};">
              ${escapeHtml(adv.urgency)}
            </span>
          </div>
          <p style="font-size:12px;color:var(--gray-500);margin-bottom:8px;">
            Target Zones: <strong>${escapeHtml(adv.target_zones)}</strong>
          </p>
          <p style="font-size:12px;color:var(--gray-700);margin-bottom:10px;line-height:1.5;">
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
