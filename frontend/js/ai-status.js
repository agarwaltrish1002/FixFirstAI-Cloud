/**
 * FixFirst AI — AI Status Page
 * ==============================
 * Displays AI provider connection status, model information, and active engine details.
 * Supports Gemini, Ollama Cloud, and Local Ollama with seamless fallbacks.
 */

import { getAIStatus, getHealthCheck } from './api.js';
import { showToast } from './app.js';

export async function loadAIStatus() {
  const page = document.getElementById('page-ai-status');

  page.innerHTML = `
    <h2 class="mb-24" style="font-size:22px;">🤖 AI & Safety Intelligence Status</h2>

    <div class="card mb-24">
      <h3 class="card-title mb-16">Active AI Provider & Connection Status</h3>
      <div id="aiStatusInfo"><p style="color:var(--gray-500)">Checking status...</p></div>
    </div>

    <div class="card mb-24">
      <h3 class="card-title mb-16">📖 Configured AI Architecture</h3>
      <div class="detail-grid" id="aiConfigDetails">
        <div class="detail-item">
          <div class="detail-label">Active Provider</div>
          <div class="detail-value" id="detailProvider">Loading...</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Active Model</div>
          <div class="detail-value" id="detailModel">Loading...</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Runtime Mode</div>
          <div class="detail-value" id="detailRuntime">Cloud Service</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Credentials Configured</div>
          <div class="detail-value" id="detailCreds">Checking...</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Safety Engine Override</div>
          <div class="detail-value" style="color:var(--primary); font-weight:600;">Active & Enforced</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Fallback System</div>
          <div class="detail-value">Deterministic Rule Engine</div>
        </div>
      </div>
    </div>

    <div class="card mb-24">
      <h3 class="card-title mb-16">🔧 How Multi-Provider Intelligence Works</h3>
      <div style="font-size:14px;line-height:1.8;">
        <p><strong>1. Primary AI Inference:</strong> The backend analyzes student complaints using the configured provider (<strong>Gemini</strong> or <strong>Ollama Cloud</strong>).</p>
        <p class="mt-8"><strong>2. Multi-Tier Fallback:</strong> If cloud AI is unreachable or times out, the backend seamlessly falls back to <strong>Deterministic Rule Engine</strong> or secondary AI.</p>
        <p class="mt-8"><strong>3. Mandatory Safety Authority:</strong> The deterministic safety engine independently evaluates critical hazard keywords (e.g. exposed live wires, fire, blocked exits). If a critical danger is identified, safety rules <strong>override</strong> any lower AI priority.</p>
      </div>
    </div>

    <div class="card">
      <h3 class="card-title mb-16">⚠️ Reliability & Safety Guarantee</h3>
      <div style="font-size:14px;line-height:1.8;">
        <ul style="margin-left:20px;">
          <li>All submitted complaints persist reliably in SQLite / PostgreSQL regardless of AI status.</li>
          <li>API keys and authentication credentials remain securely stored in backend environment variables.</li>
          <li>For immediate life-threatening emergencies, campus emergency response should always be notified directly.</li>
        </ul>
      </div>
    </div>
  `;

  // Check status
  const statusInfo = document.getElementById('aiStatusInfo');
  const detailProvider = document.getElementById('detailProvider');
  const detailModel = document.getElementById('detailModel');
  const detailRuntime = document.getElementById('detailRuntime');
  const detailCreds = document.getElementById('detailCreds');

  const aiStatus = await getAIStatus();
  const health = await getHealthCheck();

  if (!health) {
    statusInfo.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <span class="status-dot red"></span>
        <strong style="color:var(--red);">Backend Not Connected</strong>
      </div>
      <p>The backend server is not running or unreachable.</p>
    `;
    if (detailProvider) detailProvider.textContent = 'Unavailable';
    if (detailModel) detailModel.textContent = 'Unavailable';
    if (detailCreds) detailCreds.textContent = 'Disconnected';
    return;
  }

  if (!aiStatus) {
    statusInfo.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <span class="status-dot yellow"></span>
        <strong style="color:var(--yellow);">Backend Connected — Status Pending</strong>
      </div>
    `;
    return;
  }

  // Populate Details
  const provider = (aiStatus.provider || 'gemini').toUpperCase();
  const model = aiStatus.configured_model || aiStatus.model_name || 'gemini-2.5-flash';
  const credsConfigured = aiStatus.credentials_configured !== undefined ? aiStatus.credentials_configured : true;
  const isReady = aiStatus.ai_ready || (aiStatus.ollama_available && aiStatus.model_loaded);

  if (detailProvider) detailProvider.textContent = provider;
  if (detailModel) detailModel.textContent = model;
  if (detailRuntime) detailRuntime.textContent = provider.includes('OLLAMA_LOCAL') ? 'Local Desktop' : 'Cloud API';
  if (detailCreds) detailCreds.textContent = credsConfigured ? 'Yes (Securely Injected)' : 'Missing / Unconfigured';

  if (isReady) {
    statusInfo.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <span class="status-dot green"></span>
        <strong style="color:var(--primary);">AI Connected & Ready (${provider})</strong>
      </div>
      <p>Active Provider: <strong>${provider}</strong> | Model: <strong>${model}</strong></p>
      <p class="mt-8">All AI analysis features are operational. Fallback safety rules are active.</p>
    `;
  } else if (credsConfigured) {
    statusInfo.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <span class="status-dot yellow"></span>
        <strong style="color:var(--orange);">${provider} Configured — Awaiting Connection</strong>
      </div>
      <p>Credentials configured for <strong>${model}</strong>. If remote provider is busy, deterministic safety rules are actively handling prioritization.</p>
    `;
  } else {
    statusInfo.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <span class="status-dot yellow"></span>
        <strong style="color:var(--orange);">Fallback Safety Engine Active</strong>
      </div>
      <p>No API key configured for ${provider}. System is operating on full deterministic safety intelligence.</p>
    `;
  }
}
