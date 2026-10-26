/**
 * FixFirst AI — Main Application
 * ================================
 * SPA router, toast system, modal system, and utility helpers.
 */

import { getHealthCheck, resetDemoData } from './api.js';
import { loadDashboard } from './dashboard.js';
import { loadComplaints, showComplaintDetail } from './complaints.js';
import { loadSubmitForm } from './submit.js';
import { loadTickets } from './tickets.js';
import { loadAIStatus } from './ai-status.js';
import { loadRiskIntelligence } from './risk-intelligence.js';

// ---------------------------------------------------------------------------
// Toast notification system
// ---------------------------------------------------------------------------

const TOAST_ICONS = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
};

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} duration ms before auto-dismiss
 */
export function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${TOAST_ICONS[type] || ''}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-dismiss" aria-label="Dismiss">&times;</button>
  `;

  const dismiss = () => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  };

  toast.querySelector('.toast-dismiss').addEventListener('click', dismiss);
  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
}

// ---------------------------------------------------------------------------
// Modal system
// ---------------------------------------------------------------------------

export function openModal(title, bodyHtml, footerHtml = '') {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalFooter').innerHTML = footerHtml;
  document.getElementById('modalOverlay').classList.add('active');
}

export function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Escape HTML to prevent XSS */
export function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

/** Format an ISO date string to a readable format */
export function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return isoStr;
  }
}

/** Return a CSS class suffix for a priority level */
export function priorityClass(priority) {
  const map = { Critical: 'critical', High: 'high', Medium: 'medium', Low: 'low' };
  return map[priority] || 'medium';
}

/** Return a CSS class suffix for a status */
export function statusClass(status) {
  const map = {
    Pending: 'pending',
    Assigned: 'assigned',
    'In Progress': 'in-progress',
    Resolved: 'resolved',
    Open: 'assigned',
  };
  return map[status] || 'pending';
}

/** Return a badge HTML snippet for priority */
export function priorityBadge(priority) {
  return `<span class="badge badge-${priorityClass(priority)}">${escapeHtml(priority)}</span>`;
}

/** Return a badge HTML snippet for status */
export function statusBadge(status) {
  return `<span class="badge badge-${statusClass(status)}">${escapeHtml(status)}</span>`;
}

// ---------------------------------------------------------------------------
// SPA Router
// ---------------------------------------------------------------------------

const PAGES = ['dashboard', 'risk-intelligence', 'submit', 'complaints', 'tickets', 'ai-status'];
let currentPage = 'dashboard';

function navigateTo(page) {
  if (!PAGES.includes(page)) page = 'dashboard';
  currentPage = page;

  // Update sidebar active state
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Show/hide page sections
  document.querySelectorAll('.page').forEach(el => {
    el.classList.toggle('active', el.id === `page-${page}`);
  });

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');

  // Load page content
  switch (page) {
    case 'dashboard':         loadDashboard(); break;
    case 'risk-intelligence': loadRiskIntelligence(); break;
    case 'submit':            loadSubmitForm(); break;
    case 'complaints':        loadComplaints(); break;
    case 'tickets':           loadTickets(); break;
    case 'ai-status':         loadAIStatus(); break;
  }
}

// Make navigateTo available globally for inline onclick handlers
window.navigateTo = navigateTo;
window.showComplaintDetail = showComplaintDetail;

// ---------------------------------------------------------------------------
// Backend connection check
// ---------------------------------------------------------------------------

async function checkConnection() {
  const dot = document.getElementById('connectionDot');
  const label = document.getElementById('connectionLabel');
  const health = await getHealthCheck();

  if (health) {
    dot.className = 'connection-dot connected';
    label.textContent = health.ollama_available ? 'AI Connected' : 'Backend OK';
  } else {
    dot.className = 'connection-dot disconnected';
    label.textContent = 'Disconnected';
  }
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  // Sidebar navigation
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(el.dataset.page);
    });
  });

  // Hamburger menu
  const hamburger = document.getElementById('hamburgerBtn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
  });

  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  });

  // Modal close
  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  // Reset demo data button
  document.getElementById('resetDemoBtn').addEventListener('click', async () => {
    if (!confirm('Reset all demo complaints? Your submitted complaints will remain.')) return;
    try {
      await resetDemoData();
      showToast('Demo data reset successfully!', 'success');
      if (currentPage === 'dashboard') loadDashboard();
      if (currentPage === 'complaints') loadComplaints();
    } catch (e) {
      showToast('Failed to reset demo data: ' + e.message, 'error');
    }
  });

  // Hash-based routing
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  navigateTo(hash);

  // Connection check
  checkConnection();
  setInterval(checkConnection, 30000);
});
