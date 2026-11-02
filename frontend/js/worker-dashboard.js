/**
 * FixFirst AI — Worker Dashboard
 * ================================
 * Displays tasks assigned to the logged-in worker.
 * Workers can only see their own jobs — no other worker's tasks are shown.
 * Supports: Accept/Reject, In Progress, Completed with before/after photos.
 */

import {
  getWorkerTasks, respondToTask, updateWorkerTaskStatus, uploadImage
} from './api.js';
import { escapeHtml, priorityBadge, formatDate, showToast, openModal, closeModal } from './app.js';

export async function loadWorkerTasks() {
  const page = document.getElementById('page-worker-tasks');
  page.innerHTML = `
    <div class="card mb-24" style="background:linear-gradient(135deg,#b45309,#92400e);color:white;border-radius:var(--radius-lg);padding:22px 26px;border:none;">
      <div class="flex justify-between items-center flex-wrap gap-16">
        <div>
          <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:12px;display:inline-block;margin-bottom:8px;">🔧 Worker Dashboard</span>
          <h2 style="font-size:22px;color:white;font-weight:700;line-height:1.2;">My Assigned Tasks</h2>
          <p style="font-size:13px;opacity:0.9;margin-top:6px;">View, accept, update, and complete your assigned maintenance jobs.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-sm" style="background:white;color:#b45309;font-weight:700;" onclick="window.filterWorkerTasks('pending')">Pending</button>
          <button class="btn btn-sm" style="background:rgba(255,255,255,0.2);color:white;" onclick="window.filterWorkerTasks('accepted')">Accepted</button>
          <button class="btn btn-sm" style="background:rgba(255,255,255,0.2);color:white;" onclick="window.filterWorkerTasks('in_progress')">In Progress</button>
          <button class="btn btn-sm" style="background:rgba(255,255,255,0.2);color:white;" onclick="window.filterWorkerTasks(null)">All</button>
        </div>
      </div>
    </div>
    <div id="workerTasksContainer"><div class="spinner-center"><div class="spinner"></div></div></div>
  `;
  await _renderWorkerTasks(null);
}

window.filterWorkerTasks = async (status) => {
  await _renderWorkerTasks(status);
};

async function _renderWorkerTasks(statusFilter) {
  const container = document.getElementById('workerTasksContainer');
  if (!container) return;
  container.innerHTML = `<div class="spinner-center"><div class="spinner"></div></div>`;

  const res = await getWorkerTasks(statusFilter);
  const tasks = (res && res.tasks) ? res.tasks : [];

  if (tasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">✅</div>
        <div class="empty-state-title">No tasks found</div>
        <p class="empty-state-text">You currently have no ${statusFilter || ''} assigned tasks.</p>
      </div>
    `;
    return;
  }

  // Stats strip
  const pending   = tasks.filter(t => t.status === 'Pending').length;
  const accepted  = tasks.filter(t => t.status === 'Accepted').length;
  const inProg    = tasks.filter(t => t.status === 'In Progress').length;
  const completed = tasks.filter(t => t.status === 'Completed').length;

  container.innerHTML = `
    <div class="stats-grid mb-24">
      <div class="stat-card high"><div class="stat-icon">⏳</div><div class="stat-info"><div class="stat-number">${pending}</div><div class="stat-label">Pending</div></div></div>
      <div class="stat-card" style="background:linear-gradient(135deg,#dbeafe,#bfdbfe)"><div class="stat-icon">✅</div><div class="stat-info"><div class="stat-number">${accepted}</div><div class="stat-label">Accepted</div></div></div>
      <div class="stat-card" style="background:linear-gradient(135deg,#fef3c7,#fde68a)"><div class="stat-icon">🔧</div><div class="stat-info"><div class="stat-number">${inProg}</div><div class="stat-label">In Progress</div></div></div>
      <div class="stat-card" style="background:linear-gradient(135deg,#dcfce7,#bbf7d0)"><div class="stat-icon">🏁</div><div class="stat-info"><div class="stat-number">${completed}</div><div class="stat-label">Completed</div></div></div>
    </div>
    <div class="worker-tasks-grid" id="workerTaskCards">
      ${tasks.map(t => _buildTaskCard(t)).join('')}
    </div>
  `;
}

function _buildTaskCard(task) {
  const statusColors = {
    'Pending':     '#f59e0b',
    'Accepted':    '#3b82f6',
    'In Progress': '#8b5cf6',
    'Completed':   '#10b981',
    'Rejected':    '#ef4444',
    'Verified':    '#059669',
  };
  const color = statusColors[task.status] || '#6b7280';
  const isSensitive = task.is_sensitive_hygiene;

  let actionButtons = '';
  if (task.status === 'Pending') {
    actionButtons = `
      <div class="task-actions">
        <button class="btn btn-success btn-sm" onclick="window.workerAcceptTask('${task.assignment_id}')">✅ Accept</button>
        <button class="btn btn-danger btn-sm" onclick="window.workerRejectTask('${task.assignment_id}')">❌ Reject</button>
      </div>
    `;
  } else if (task.status === 'Accepted') {
    actionButtons = `
      <div class="task-actions">
        <button class="btn btn-primary btn-sm" onclick="window.workerStartTask('${task.assignment_id}')">▶ Start Work</button>
      </div>
    `;
  } else if (task.status === 'In Progress') {
    actionButtons = `
      <div class="task-actions">
        <button class="btn btn-success btn-sm" onclick="window.workerCompleteTask('${task.assignment_id}', '${task.complaint_id}')">🏁 Mark Complete</button>
      </div>
    `;
  } else if (task.status === 'Completed') {
    actionButtons = `<div class="task-actions"><span class="badge" style="background:#d1fae5;color:#065f46;">Awaiting Warden Verification</span></div>`;
  } else if (task.status === 'Verified') {
    actionButtons = `<div class="task-actions"><span class="badge" style="background:#dcfce7;color:#14532d;">✅ Verified by Warden</span></div>`;
  }

  return `
    <div class="worker-task-card ${isSensitive ? 'sensitive-task' : ''}">
      <div class="task-card-header">
        <div>
          <span class="task-id">#${escapeHtml(task.complaint_id || 'N/A')}</span>
          ${isSensitive ? '<span class="sensitive-badge">🔒 Confidential</span>' : ''}
        </div>
        <span class="task-status-dot" style="background:${color}; color:white; padding:2px 10px; border-radius:12px; font-size:12px; font-weight:600;">${escapeHtml(task.status)}</span>
      </div>

      <h4 class="task-title">${escapeHtml(task.complaint_title || 'Maintenance Task')}</h4>

      <div class="task-meta-grid">
        <div class="task-meta-item">
          <span class="meta-label">📍 Location</span>
          <span class="meta-value">${escapeHtml(task.location || '—')}</span>
        </div>
        <div class="task-meta-item">
          <span class="meta-label">⚡ Priority</span>
          <span class="meta-value">${priorityBadge(task.priority || 'P3 – Medium')}</span>
        </div>
        <div class="task-meta-item">
          <span class="meta-label">🏷️ Category</span>
          <span class="meta-value">${escapeHtml(task.category || '—')}</span>
        </div>
        <div class="task-meta-item">
          <span class="meta-label">📅 Assigned</span>
          <span class="meta-value">${formatDate(task.assigned_at)}</span>
        </div>
      </div>

      ${task.description && !isSensitive ? `
        <div class="task-description">
          <p>${escapeHtml(task.description)}</p>
        </div>
      ` : isSensitive ? `
        <div class="task-description sensitive-desc">
          <p>🔒 <em>Complaint details are protected to preserve resident privacy.</em></p>
        </div>
      ` : ''}

      ${task.instructions ? `
        <div class="task-instructions">
          <strong>📋 Warden Instructions:</strong>
          <p>${escapeHtml(task.instructions)}</p>
        </div>
      ` : ''}

      ${actionButtons}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Task Actions
// ---------------------------------------------------------------------------

window.workerAcceptTask = async (assignmentId) => {
  try {
    await respondToTask(assignmentId, 'accept');
    showToast('Task accepted! You are now responsible for this repair.', 'success');
    await _renderWorkerTasks(null);
  } catch (err) {
    showToast(err.message || 'Failed to accept task.', 'error');
  }
};

window.workerRejectTask = (assignmentId) => {
  openModal('Reject Task', `
    <div class="form-group">
      <label class="form-label">Reason for rejection <span style="color:red">*</span></label>
      <textarea id="rejectReason" class="form-control" rows="3" placeholder="Please explain why you cannot take this task..." required></textarea>
    </div>
    <div id="rejectError" class="alert alert-danger" style="display:none; font-size:13px;"></div>
  `, `
    <button class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
    <button class="btn btn-danger" onclick="window._submitReject('${assignmentId}')">Reject Task</button>
  `);
};

window._submitReject = async (assignmentId) => {
  const reason = document.getElementById('rejectReason')?.value?.trim();
  const errBox = document.getElementById('rejectError');
  if (!reason) {
    if (errBox) { errBox.textContent = 'Please provide a reason.'; errBox.style.display = 'block'; }
    return;
  }
  try {
    await respondToTask(assignmentId, 'reject', reason);
    closeModal();
    showToast('Task rejected. The warden will be notified.', 'info');
    await _renderWorkerTasks(null);
  } catch (err) {
    if (errBox) { errBox.textContent = err.message || 'Failed to reject task.'; errBox.style.display = 'block'; }
  }
};

window.workerStartTask = async (assignmentId) => {
  try {
    await updateWorkerTaskStatus(assignmentId, 'In Progress');
    showToast('Work started! Status updated to In Progress.', 'success');
    await _renderWorkerTasks(null);
  } catch (err) {
    showToast(err.message || 'Failed to update status.', 'error');
  }
};

window.workerCompleteTask = (assignmentId, complaintId) => {
  openModal('Mark Task Complete', `
    <p style="color:var(--gray-600);font-size:13px;margin-bottom:16px;">
      Provide completion notes and upload photos before submitting for Warden verification.
    </p>
    <div class="form-group">
      <label class="form-label">Completion Notes <span style="color:red">*</span></label>
      <textarea id="completionNotes" class="form-control" rows="3" placeholder="Describe what was done, parts used, time taken..." required></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Before Photo (optional)</label>
      <input type="file" id="beforePhotoInput" class="form-control" accept="image/*" />
    </div>
    <div class="form-group">
      <label class="form-label">After Photo (optional)</label>
      <input type="file" id="afterPhotoInput" class="form-control" accept="image/*" />
    </div>
    <div id="completeError" class="alert alert-danger" style="display:none; font-size:13px;"></div>
  `, `
    <button class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
    <button class="btn btn-success" id="submitCompleteBtn" onclick="window._submitComplete('${assignmentId}')">🏁 Submit for Verification</button>
  `);
};

window._submitComplete = async (assignmentId) => {
  const notes = document.getElementById('completionNotes')?.value?.trim();
  const errBox = document.getElementById('completeError');
  const submitBtn = document.getElementById('submitCompleteBtn');
  if (!notes) {
    if (errBox) { errBox.textContent = 'Completion notes are required.'; errBox.style.display = 'block'; }
    return;
  }
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Uploading…'; }

  try {
    let beforeUrl = null, afterUrl = null;
    const beforeFile = document.getElementById('beforePhotoInput')?.files?.[0];
    const afterFile  = document.getElementById('afterPhotoInput')?.files?.[0];
    if (beforeFile) {
      const res = await uploadImage(beforeFile);
      beforeUrl = res?.url || res?.path || null;
    }
    if (afterFile) {
      const res = await uploadImage(afterFile);
      afterUrl = res?.url || res?.path || null;
    }
    await updateWorkerTaskStatus(assignmentId, 'Completed', notes, beforeUrl, afterUrl);
    closeModal();
    showToast('Task marked complete! Awaiting Warden verification.', 'success');
    await _renderWorkerTasks(null);
  } catch (err) {
    if (errBox) { errBox.textContent = err.message || 'Failed to submit completion.'; errBox.style.display = 'block'; }
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '🏁 Submit for Verification'; }
  }
};

// ---------------------------------------------------------------------------
// Worker Task History
// ---------------------------------------------------------------------------

export async function loadWorkerHistory() {
  const page = document.getElementById('page-worker-history');
  page.innerHTML = `
    <div class="flex justify-between items-center mb-24">
      <h2 style="font-size:20px;font-weight:700;color:var(--gray-900);">📜 My Repair History</h2>
    </div>
    <div id="workerHistoryContainer"><div class="spinner-center"><div class="spinner"></div></div></div>
  `;

  const res = await getWorkerTasks();
  const tasks = (res && res.tasks) ? res.tasks.filter(t => ['Completed', 'Verified'].includes(t.status)) : [];

  const container = document.getElementById('workerHistoryContainer');
  if (!tasks.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📜</div>
        <div class="empty-state-title">No completed tasks yet</div>
        <p class="empty-state-text">Your completed and verified repairs will appear here.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="table-mobile-cards">
        <thead><tr><th>Complaint ID</th><th>Title</th><th>Category</th><th>Priority</th><th>Status</th><th>Completed</th></tr></thead>
        <tbody>
          ${tasks.map(t => `
            <tr>
              <td data-label="ID">${escapeHtml(t.complaint_id || '—')}</td>
              <td data-label="Title">${escapeHtml(t.complaint_title || 'Maintenance Task')}</td>
              <td data-label="Category">${escapeHtml(t.category || '—')}</td>
              <td data-label="Priority">${priorityBadge(t.priority || '—')}</td>
              <td data-label="Status"><span class="badge" style="background:#d1fae5;color:#065f46;">${escapeHtml(t.status)}</span></td>
              <td data-label="Completed">${formatDate(t.completed_at || t.assigned_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
