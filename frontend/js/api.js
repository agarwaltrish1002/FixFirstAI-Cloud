/**
 * FixFirst AI — API Service Layer
 * =================================
 * All backend communication goes through this module.
 * API keys are NEVER stored here — they remain on the backend server.
 */

export const API_BASE = (import.meta.env && import.meta.env.VITE_API_BASE_URL)
  ? import.meta.env.VITE_API_BASE_URL
  : 'https://fixfirstai-cloud.onrender.com';


// ---------------------------------------------------------------------------
// Generic fetch wrapper
// ---------------------------------------------------------------------------

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const defaults = {
    headers: { 'Content-Type': 'application/json' },
  };

  const token = localStorage.getItem('fixfirst_token');
  if (token) {
    defaults.headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (browser sets multipart boundary)
  if (options.body instanceof FormData) {
    delete defaults.headers['Content-Type'];
  }

  const config = { ...defaults, ...options };
  if (options.headers) {
    config.headers = { ...defaults.headers, ...options.headers };
  }

  try {
    const resp = await fetch(url, config);
    const data = await resp.json();

    if (!resp.ok) {
      const msg = data.detail || data.message || `Request failed (${resp.status})`;
      throw new Error(msg);
    }

    return data;
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error('Cannot connect to backend. Is the server running?');
    }
    throw err;
  }
}


// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** Login with username, password, and role portal */
export async function loginUser(username, password, role = null) {
  const body = { username, password };
  if (role) body.role = role;
  return await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Get current user profile */
export async function getMyProfile() {
  try { return await apiRequest('/api/auth/me'); } catch (e) { return null; }
}

/** Get demo accounts list */
export async function getDemoUsers() {
  try { return await apiRequest('/api/auth/demo-users'); } catch (e) { return null; }
}


// ---------------------------------------------------------------------------
// Dashboard & Stats
// ---------------------------------------------------------------------------

export async function getStats() {
  try { return await apiRequest('/api/stats'); } catch (e) { return null; }
}

export async function getHealthCheck() {
  try { return await apiRequest('/api/health'); } catch (e) { return null; }
}

export async function getAIStatus() {
  try { return await apiRequest('/api/ai/status'); } catch (e) { return null; }
}

export async function getCategories() {
  try { return await apiRequest('/api/categories'); } catch (e) { return null; }
}


// ---------------------------------------------------------------------------
// Complaints
// ---------------------------------------------------------------------------

export async function getComplaints(filters = {}) {
  try {
    const params = new URLSearchParams();
    if (filters.status)   params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.category) params.set('category', filters.category);
    if (filters.search)   params.set('search', filters.search);
    if (filters.sort_by)  params.set('sort_by', filters.sort_by);
    if (filters.order)    params.set('order', filters.order);
    if (filters.page)     params.set('page', filters.page);
    if (filters.per_page) params.set('per_page', filters.per_page);
    const qs = params.toString();
    return await apiRequest(`/api/complaints${qs ? '?' + qs : ''}`);
  } catch (e) { return null; }
}

export async function getComplaint(id) {
  try { return await apiRequest(`/api/complaints/${id}`); } catch (e) { return null; }
}

export async function submitComplaint(payload) {
  return await apiRequest('/api/complaints', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateComplaintStatus(id, status) {
  return await apiRequest(`/api/complaints/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

export async function analyzeComplaint(id) {
  return await apiRequest(`/api/complaints/${id}/analyze`, { method: 'POST' });
}

export async function previewComplaintRisk(payload) {
  try {
    return await apiRequest('/api/complaints/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (e) { return null; }
}

export async function recommendComplaint(payload) {
  return await apiRequest('/api/complaints/recommend', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getRankedComplaints() {
  try { return await apiRequest('/api/complaints/ranked'); } catch (e) { return null; }
}

export async function getCategoryWiseComplaints() {
  try { return await apiRequest('/api/complaints/by-category'); } catch (e) { return null; }
}

export async function resetDemoData() {
  return await apiRequest('/api/complaints/demo', { method: 'DELETE' });
}

/** Student reopens a complaint */
export async function reopenComplaint(complaintId, reason) {
  return await apiRequest(`/api/complaints/${complaintId}/reopen`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

/** Student submits feedback after resolution */
export async function submitComplaintFeedback(complaintId, rating, comment = '') {
  return await apiRequest(`/api/complaints/${complaintId}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ rating, comment }),
  });
}

/** Student — get only their own complaints */
export async function getMyComplaints() {
  try { return await apiRequest('/api/student/my-complaints'); } catch (e) { return null; }
}


// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export async function getTickets() {
  try { return await apiRequest('/api/tickets'); } catch (e) { return null; }
}

export async function getTicket(id) {
  try { return await apiRequest(`/api/tickets/${id}`); } catch (e) { return null; }
}

export async function generateTicket(complaintId) {
  return await apiRequest('/api/tickets', {
    method: 'POST',
    body: JSON.stringify({ complaint_id: complaintId }),
  });
}

export async function resolveTicket(ticketId, payload) {
  return await apiRequest(`/api/tickets/${ticketId}/resolve`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}


// ---------------------------------------------------------------------------
// File Upload
// ---------------------------------------------------------------------------

export async function uploadImage(file) {
  const form = new FormData();
  form.append('file', file);
  return await apiRequest('/api/upload', { method: 'POST', body: form });
}


// ---------------------------------------------------------------------------
// Risk Intelligence
// ---------------------------------------------------------------------------

export async function getCampusRiskIntelligence() {
  try { return await apiRequest('/api/analytics/risk-index'); } catch (e) { return null; }
}


// ---------------------------------------------------------------------------
// Warden Endpoints
// ---------------------------------------------------------------------------

/** Get all available workers */
export async function getWorkers() {
  try { return await apiRequest('/api/warden/workers'); } catch (e) { return null; }
}

/** Assign a complaint to a worker */
export async function assignWorker(complaintId, workerId, instructions = '') {
  return await apiRequest('/api/warden/assign', {
    method: 'POST',
    body: JSON.stringify({ complaint_id: complaintId, worker_id: workerId, instructions }),
  });
}

/** Warden verifies or reopens a completed repair */
export async function verifyRepair(assignmentId, action, feedback = '') {
  return await apiRequest(`/api/warden/verify/${assignmentId}`, {
    method: 'POST',
    body: JSON.stringify({ action, feedback }),
  });
}

/** Get critical P1 alerts */
export async function getCriticalAlerts() {
  try { return await apiRequest('/api/warden/critical-alerts'); } catch (e) { return null; }
}

/** Get overdue tasks (SLA breached) */
export async function getOverdueTasks() {
  try { return await apiRequest('/api/warden/overdue'); } catch (e) { return null; }
}


// ---------------------------------------------------------------------------
// Worker Endpoints
// ---------------------------------------------------------------------------

/** Get tasks assigned to the logged-in worker */
export async function getWorkerTasks(status = null) {
  try {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return await apiRequest(`/api/worker/my-tasks${qs}`);
  } catch (e) { return null; }
}

/** Worker accepts or rejects an assigned task */
export async function respondToTask(assignmentId, action, rejectionReason = '') {
  return await apiRequest(`/api/worker/tasks/${assignmentId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ action, rejection_reason: rejectionReason }),
  });
}

/** Worker updates task status with evidence */
export async function updateWorkerTaskStatus(assignmentId, status, workerNotes = '', beforePhoto = null, afterPhoto = null) {
  return await apiRequest(`/api/worker/tasks/${assignmentId}/status`, {
    method: 'POST',
    body: JSON.stringify({
      status,
      worker_notes: workerNotes,
      before_photo: beforePhoto,
      after_photo: afterPhoto,
    }),
  });
}


// ---------------------------------------------------------------------------
// Admin — Candidate Management
// ---------------------------------------------------------------------------

export async function getAllCandidates(search = '', role = '') {
  try {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (role)   params.set('role', role);
    const qs = params.toString();
    return await apiRequest(`/api/admin/candidates${qs ? '?' + qs : ''}`);
  } catch (e) { return null; }
}

export async function createCandidate(payload) {
  return await apiRequest('/api/admin/candidates', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCandidate(id, payload) {
  return await apiRequest(`/api/admin/candidates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function resetCandidatePassword(id, newPassword = null) {
  return await apiRequest(`/api/admin/candidates/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ new_password: newPassword }),
  });
}

export async function toggleCandidateStatus(id, accountStatus) {
  return await apiRequest(`/api/admin/candidates/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ account_status: accountStatus }),
  });
}

export async function getAuditLogs() {
  try { return await apiRequest('/api/admin/audit-logs'); } catch (e) { return null; }
}


// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function getNotifications() {
  try { return await apiRequest('/api/notifications'); } catch (e) { return null; }
}

export async function markNotificationRead(notificationId) {
  return await apiRequest(`/api/notifications/${notificationId}/read`, { method: 'PUT' });
}

export async function markAllNotificationsRead() {
  return await apiRequest('/api/notifications/read-all', { method: 'PUT' });
}
