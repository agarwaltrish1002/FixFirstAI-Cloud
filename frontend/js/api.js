/**
 * FixFirst AI — API Service
 * ==========================
 * All communication with the FastAPI backend happens through this module.
 * Dynamically picks up environment configuration for development vs production.
 */

const API_BASE = (import.meta.env && import.meta.env.VITE_API_BASE_URL) 
  ? import.meta.env.VITE_API_BASE_URL 
  : 'http://127.0.0.1:8001';

// ---------------------------------------------------------------------------
// Generic fetch wrapper
// ---------------------------------------------------------------------------

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const defaults = {
    headers: { 'Content-Type': 'application/json' },
  };

  // Merge headers (don't override Content-Type for FormData)
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
// API Functions
// ---------------------------------------------------------------------------

/** Dashboard statistics */
export async function getStats() {
  try {
    return await apiRequest('/api/stats');
  } catch (e) {
    console.error('getStats error:', e);
    return null;
  }
}

/** List complaints with optional filters */
export async function getComplaints(filters = {}) {
  try {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.category) params.set('category', filters.category);
    if (filters.search) params.set('search', filters.search);
    if (filters.sort_by) params.set('sort_by', filters.sort_by);
    if (filters.order) params.set('order', filters.order);
    if (filters.page) params.set('page', filters.page);
    if (filters.per_page) params.set('per_page', filters.per_page);
    const qs = params.toString();
    return await apiRequest(`/api/complaints${qs ? '?' + qs : ''}`);
  } catch (e) {
    console.error('getComplaints error:', e);
    return null;
  }
}

/** Get a single complaint */
export async function getComplaint(id) {
  try {
    return await apiRequest(`/api/complaints/${id}`);
  } catch (e) {
    console.error('getComplaint error:', e);
    return null;
  }
}

/** Submit a new complaint */
export async function submitComplaint(payload) {
  return await apiRequest('/api/complaints', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Update complaint status */
export async function updateComplaintStatus(id, status) {
  return await apiRequest(`/api/complaints/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

/** Re-analyze a complaint with AI */
export async function analyzeComplaint(id) {
  return await apiRequest(`/api/complaints/${id}/analyze`, {
    method: 'POST',
  });
}

/** List all tickets */
export async function getTickets() {
  try {
    return await apiRequest('/api/tickets');
  } catch (e) {
    console.error('getTickets error:', e);
    return null;
  }
}

/** Get a single ticket */
export async function getTicket(id) {
  try {
    return await apiRequest(`/api/tickets/${id}`);
  } catch (e) {
    console.error('getTicket error:', e);
    return null;
  }
}

/** Generate a maintenance ticket from a complaint */
export async function generateTicket(complaintId) {
  return await apiRequest('/api/tickets', {
    method: 'POST',
    body: JSON.stringify({ complaint_id: complaintId }),
  });
}

/** Get AI/Ollama status */
export async function getAIStatus() {
  try {
    return await apiRequest('/api/ai/status');
  } catch (e) {
    console.error('getAIStatus error:', e);
    return null;
  }
}

/** Delete and re-seed demo data */
export async function resetDemoData() {
  return await apiRequest('/api/complaints/demo', {
    method: 'DELETE',
  });
}

/** Upload an image */
export async function uploadImage(file) {
  const form = new FormData();
  form.append('file', file);
  return await apiRequest('/api/upload', {
    method: 'POST',
    body: form,
  });
}

/** Health check */
export async function getHealthCheck() {
  try {
    return await apiRequest('/api/health');
  } catch (e) {
    return null;
  }
}

/** Get list of categories */
export async function getCategories() {
  try {
    return await apiRequest('/api/categories');
  } catch (e) {
    console.error('getCategories error:', e);
    return null;
  }
}

/** Get proactive campus risk intelligence, building scorecards & advisories */
export async function getCampusRiskIntelligence() {
  try {
    return await apiRequest('/api/analytics/risk-index');
  } catch (e) {
    console.error('getCampusRiskIntelligence error:', e);
    return null;
  }
}

/** Real-time pre-submission risk preview as student types */
export async function previewComplaintRisk(payload) {
  try {
    return await apiRequest('/api/complaints/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error('previewComplaintRisk error:', e);
    return null;
  }
}

/** Complete and sign off a maintenance ticket */
export async function resolveTicket(ticketId, payload) {
  return await apiRequest(`/api/tickets/${ticketId}/resolve`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
