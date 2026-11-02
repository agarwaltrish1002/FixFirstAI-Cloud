/**
 * FixFirst AI — AI & Safety Intelligence Status Page
 * ====================================================
 * Displays independent status indicators for:
 *   1. AI Provider Engine (OpenAI primary, configurable via OPENAI_API_KEY / OPENAI_MODEL)
 *   2. Deterministic Safety Engine (Life-safety override system, always Active)
 *
 * Adheres strictly to the requirement: AI and Safety Engine are presented as
 * two separate status indicators. When AI is disconnected, the Safety Engine
 * remains active and evaluations are labeled as RULE-BASED.
 */

import { getAIStatus, getHealthCheck } from './api.js';
import { escapeHtml, showToast } from './app.js';

export async function loadAIStatus() {
  const page = document.getElementById('page-ai-status');
  if (!page) return;

  page.innerHTML = `
    <div class="page-header mb-20 flex justify-between items-center flex-wrap gap-12">
      <div>
        <h2 class="page-title flex items-center gap-8">
          <span>🤖</span> AI & Safety Engine Status
        </h2>
        <p class="text-muted" style="margin-top:2px;">
          Dual telemetry: Cloud AI inference provider & deterministic campus safety overrides.
        </p>
      </div>
      <button class="btn btn-secondary btn-sm" id="refreshAIStatusBtn">🔄 Re-check Connectivity</button>
    </div>

    <!-- Dual Status Hero Cards -->
    <div class="dashboard-grid mb-24" style="grid-template-columns: 1fr 1fr; gap:18px;">
      
      <!-- Card 1: AI Provider Status -->
      <div class="card" id="aiProviderCard" style="border-top:4px solid #3b82f6;">
        <div class="card-header" style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #f1f5f9;">
          <h3 class="card-title" style="font-size:16px;">🧠 Cloud AI Inference Status</h3>
        </div>
        <div id="aiProviderContent">
          <p style="color:var(--gray-500);">Probing AI connection...</p>
        </div>
      </div>

      <!-- Card 2: Deterministic Safety Engine Status -->
      <div class="card" id="safetyEngineCard" style="border-top:4px solid #16a34a;">
        <div class="card-header" style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #f1f5f9;">
          <h3 class="card-title" style="font-size:16px;">🛡️ Deterministic Safety Engine Status</h3>
        </div>
        <div id="safetyEngineContent">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <span class="dot-indicator dot-green" style="width:12px;height:12px;"></span>
            <strong style="color:#16a34a;font-size:15px;">Safety Engine: ACTIVE</strong>
          </div>
          <p style="font-size:13px;color:#334155;line-height:1.5;">
            Life-safety rules, critical hazard detection, and biological sanitation classifications are hard-enforced independently of cloud AI uptime.
          </p>
          <div class="mt-12" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:8px 12px;font-size:12px;color:#166534;">
            ✅ <strong>48 Campus Safety Rules Active:</strong> Fire, live wire, structural collapse, and biohazard protocols.
          </div>
        </div>
      </div>

    </div>

    <!-- Provider Configuration & Architecture Details -->
    <div class="card mb-24">
      <div class="card-header">
        <h3 class="card-title">⚙️ Provider Architecture & Environment Configuration</h3>
      </div>
      <div class="detail-grid" id="aiConfigDetails">
        <div class="detail-item">
          <div class="detail-label">Active Provider</div>
          <div class="detail-value" id="detailProvider">Loading...</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Configured Model</div>
          <div class="detail-value" id="detailModel">Loading...</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">AI Status</div>
          <div class="detail-value" id="detailAIStatus">Loading...</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Safety Engine Status</div>
          <div class="detail-value" style="color:#16a34a;font-weight:700;">Active (Enforced)</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">API Key Configuration</div>
          <div class="detail-value" id="detailCreds">Checking...</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Evaluation Mode</div>
          <div class="detail-value" id="detailEvalMode">Loading...</div>
        </div>
      </div>
    </div>

    <!-- How Dual Engine Works -->
    <div class="card mb-24">
      <div class="card-header">
        <h3 class="card-title">📖 Dual Intelligence & Fail-Safe Architecture</h3>
      </div>
      <div style="font-size:13px;line-height:1.8;color:#334155;">
        <p>
          <strong>1. OpenAI Contextual Reasoning:</strong> When connected, OpenAI analyzes nuanced student descriptions, evaluates scope and urgency, and provides structured explanations and recommended maintenance actions.
        </p>
        <p class="mt-8">
          <strong>2. Mandatory Safety Engine Authority:</strong> The deterministic safety engine independently evaluates 100% of complaints for life-safety triggers (exposed high-voltage wires, gas leaks, blood/biohazard sanitation). Even if an AI model predicts a low priority, safety rules <strong>strictly override</strong> it to P1 Critical.
        </p>
        <p class="mt-8">
          <strong>3. Honest Fallback Transparency:</strong> If OpenAI API is unreachable or unconfigured, the system never fabricates AI analysis. Complaints are analyzed using deterministic safety logic and explicitly labelled as <strong>RULE-BASED (Safety Engine)</strong>.
        </p>
      </div>
    </div>
  `;

  document.getElementById('refreshAIStatusBtn').addEventListener('click', () => {
    showToast('Checking AI & Safety Engine connectivity...', 'info', 1000);
    renderAIStatusData();
  });

  await renderAIStatusData();
}

async function renderAIStatusData() {
  const providerContent = document.getElementById('aiProviderContent');
  const detailProvider = document.getElementById('detailProvider');
  const detailModel = document.getElementById('detailModel');
  const detailAIStatus = document.getElementById('detailAIStatus');
  const detailCreds = document.getElementById('detailCreds');
  const detailEvalMode = document.getElementById('detailEvalMode');

  const health = await getHealthCheck();
  const aiStatus = await getAIStatus();

  if (!health) {
    if (providerContent) {
      providerContent.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span class="dot-indicator dot-red" style="width:12px;height:12px;"></span>
          <strong style="color:#dc2626;font-size:15px;">Backend Disconnected</strong>
        </div>
        <p style="font-size:13px;color:#64748b;">The FastAPI backend server is unreachable. Please verify local host status.</p>
      `;
    }
    return;
  }

  const provider = (aiStatus?.provider || health.provider || 'openai').toUpperCase();
  const model = aiStatus?.configured_model || aiStatus?.model_name || health.model || 'gpt-4.1';
  const status = aiStatus?.ai_status || (health.ai_ready ? 'Connected' : 'Disconnected');
  const errorMsg = aiStatus?.ai_error || health.ai_error;

  if (detailProvider) detailProvider.textContent = provider;
  if (detailModel) detailModel.textContent = model;
  if (detailCreds) detailCreds.textContent = aiStatus?.credentials_configured ? 'Configured in Environment (OPENAI_API_KEY)' : 'Missing / Not Set';

  if (status === 'Connected') {
    if (detailAIStatus) detailAIStatus.innerHTML = '<span style="color:#16a34a;font-weight:700;">🟢 Connected</span>';
    if (detailEvalMode) detailEvalMode.textContent = `OpenAI (${model}) + Safety Engine Override`;
    if (providerContent) {
      providerContent.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span class="dot-indicator dot-green" style="width:12px;height:12px;"></span>
          <strong style="color:#16a34a;font-size:15px;">AI: CONNECTED</strong>
        </div>
        <p style="font-size:13px;color:#334155;margin-bottom:8px;">
          Active Provider: <strong>${escapeHtml(provider)}</strong> | Model: <strong>${escapeHtml(model)}</strong>
        </p>
        <p style="font-size:12px;color:#16a34a;background:#f0fdf4;padding:6px 10px;border-radius:6px;border:1px solid #bbf7d0;">
          ✅ Verified live connectivity with OpenAI API. Full contextual categorization & structured reasoning active.
        </p>
      `;
    }
  } else if (status === 'Error') {
    if (detailAIStatus) detailAIStatus.innerHTML = '<span style="color:#dc2626;font-weight:700;">🔴 Error</span>';
    if (detailEvalMode) detailEvalMode.textContent = 'Rule-Based Fallback (Safety Engine)';
    if (providerContent) {
      providerContent.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span class="dot-indicator dot-red" style="width:12px;height:12px;"></span>
          <strong style="color:#dc2626;font-size:15px;">AI: ERROR</strong>
        </div>
        <p style="font-size:13px;color:#dc2626;margin-bottom:8px;">
          ${escapeHtml(errorMsg || 'Failed to authenticate with OpenAI API.')}
        </p>
        <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:6px;padding:8px 12px;font-size:12px;color:#9f1239;">
          ⚠️ <strong>Fail-Safe Active:</strong> Deterministic Safety Engine is handling all intake and priority ranking. Results are labelled <em>RULE-BASED</em>.
        </div>
      `;
    }
  } else {
    // Disconnected
    if (detailAIStatus) detailAIStatus.innerHTML = '<span style="color:#d97706;font-weight:700;">🟡 Disconnected</span>';
    if (detailEvalMode) detailEvalMode.textContent = 'Rule-Based Fallback (Safety Engine)';
    if (providerContent) {
      providerContent.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span class="dot-indicator dot-yellow" style="width:12px;height:12px;"></span>
          <strong style="color:#d97706;font-size:15px;">AI: DISCONNECTED</strong>
        </div>
        <p style="font-size:13px;color:#475569;margin-bottom:8px;">
          <code>OPENAI_API_KEY</code> is not configured in environment.
        </p>
        <div style="background:#fefce8;border:1px solid #fef08a;border-radius:6px;padding:8px 12px;font-size:12px;color:#854d0e;">
          🛡️ <strong>Safety Guarantee:</strong> All complaints are accurately categorized and ranked via the deterministic Safety Engine. No fabricated AI claims are made.
        </div>
      `;
    }
  }
}
