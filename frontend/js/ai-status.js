/**
 * FixFirst AI — AI Status Page
 * ==============================
 * Shows Ollama connection status, model info, and installation instructions.
 */

import { getAIStatus, getHealthCheck } from './api.js';
import { showToast } from './app.js';

export async function loadAIStatus() {
  const page = document.getElementById('page-ai-status');

  page.innerHTML = `
    <h2 class="mb-24" style="font-size:22px;">🤖 AI Status</h2>

    <div class="card mb-24">
      <h3 class="card-title mb-16">Connection Status</h3>
      <div id="aiStatusInfo"><p style="color:var(--gray-500)">Checking...</p></div>
    </div>

    <div class="card mb-24">
      <h3 class="card-title mb-16">📖 AI Model Information</h3>
      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-label">Model</div>
          <div class="detail-value">Qwen 2.5 Coder 7B</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Developer</div>
          <div class="detail-value">Alibaba Cloud (Qwen Team)</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">License</div>
          <div class="detail-value">Apache 2.0</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Parameters</div>
          <div class="detail-value">7 Billion</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Runtime</div>
          <div class="detail-value">Ollama (local inference)</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">RAM Required</div>
          <div class="detail-value">~5-6 GB for inference</div>
        </div>
      </div>
    </div>

    <div class="card mb-24">
      <h3 class="card-title mb-16">🔧 How It Works</h3>
      <div style="font-size:14px;line-height:1.8;">
        <p><strong>1.</strong> When you submit a complaint, the <strong>AI model</strong> analyzes the text and suggests a priority, category, risk indicators, and recommended actions.</p>
        <p class="mt-8"><strong>2.</strong> A separate <strong>Rule-Based Safety Engine</strong> checks for known hazard keywords (exposed wire, blocked exit, etc.).</p>
        <p class="mt-8"><strong>3.</strong> If the rule engine detects a <strong>Critical</strong> hazard but the AI suggested something lower, the engine <strong>overrides the AI</strong> to ensure safety.</p>
        <p class="mt-8"><strong>4.</strong> If Ollama is unavailable, the system falls back to <strong>rule-based analysis only</strong> — no AI features are required for basic operation.</p>
      </div>
    </div>

    <div class="card mb-24" id="installCard">
      <h3 class="card-title mb-16">📦 Installation Instructions</h3>
      <div style="font-size:14px;line-height:1.8;">
        <p><strong>Step 1 — Install Ollama:</strong></p>
        <ol style="margin:4px 0 16px 20px;">
          <li>Go to <a href="https://ollama.com" target="_blank">https://ollama.com</a></li>
          <li>Click "Download for Windows"</li>
          <li>Run the installer</li>
          <li>Ollama will start automatically in the system tray</li>
        </ol>
        <p><strong>Step 2 — Download the Model:</strong></p>
        <p style="margin:4px 0 8px 0;">Open a terminal (Command Prompt or PowerShell) and run:</p>
        <div style="background:var(--gray-100);padding:10px 14px;border-radius:6px;font-family:monospace;font-size:13px;margin-bottom:16px;">
          ollama pull qwen2.5-coder:7b
        </div>
        <p>This downloads ~1.5 GB. After the download finishes, reload this page to check the connection.</p>
      </div>
    </div>

    <div class="card">
      <h3 class="card-title mb-16">⚠️ Limitations & Disclaimers</h3>
      <div style="font-size:14px;line-height:1.8;">
        <ul style="margin-left:20px;">
          <li>The AI model (1.7B parameters) may not always give perfect analysis.</li>
          <li>The AI does <strong>not</strong> make final safety decisions — the rule engine has override authority.</li>
          <li>This is a <strong>demo project</strong> and is not production-ready.</li>
          <li>No data is sent to the cloud — all inference runs locally on your machine.</li>
          <li>The system does <strong>not</strong> guarantee safety.</li>
          <li>For real emergencies, contact campus security directly.</li>
        </ul>
      </div>
    </div>
  `;

  // Check status
  const statusInfo = document.getElementById('aiStatusInfo');
  const aiStatus = await getAIStatus();
  const health = await getHealthCheck();

  if (!health) {
    statusInfo.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <span class="status-dot red"></span>
        <strong style="color:var(--red);">Backend Not Connected</strong>
      </div>
      <p>The backend server is not running. Start it first, then check again.</p>
    `;
    return;
  }

  if (!aiStatus) {
    statusInfo.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <span class="status-dot yellow"></span>
        <strong style="color:var(--yellow);">Backend Connected — AI Status Unknown</strong>
      </div>
    `;
    return;
  }

  if (aiStatus.ollama_available && aiStatus.model_loaded) {
    statusInfo.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <span class="status-dot green"></span>
        <strong style="color:var(--primary);">AI Connected & Ready</strong>
      </div>
      <p>Ollama is running and the <strong>${aiStatus.model_name || 'qwen2.5-coder:7b'}</strong> model is loaded.</p>
      <p class="mt-8">All AI features are fully operational. Complaints will receive AI-powered analysis.</p>
    `;
  } else if (aiStatus.ollama_available && !aiStatus.model_loaded) {
    statusInfo.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <span class="status-dot yellow"></span>
        <strong style="color:var(--orange);">Ollama Connected — Model Not Found</strong>
      </div>
      <p>Ollama is running but the <strong>qwen2.5-coder:7b</strong> model is not downloaded.</p>
      <p class="mt-8">Run this command in a terminal:</p>
      <div style="background:var(--gray-100);padding:10px 14px;border-radius:6px;font-family:monospace;font-size:13px;margin-top:4px;">
        ollama pull qwen3:1.7b
      </div>
      <p class="mt-8">The system is using <strong>rule-based analysis</strong> as a fallback.</p>
    `;
  } else {
    statusInfo.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <span class="status-dot red"></span>
        <strong style="color:var(--red);">Ollama Not Running</strong>
      </div>
      <p>Ollama is not installed or not running. AI features are disabled.</p>
      <p class="mt-8">The system is using <strong>rule-based analysis</strong> as a fallback — all core features still work.</p>
      <p class="mt-8">See the installation instructions below to enable AI features.</p>
    `;
  }
}
