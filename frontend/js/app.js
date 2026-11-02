/**
 * FixFirst AI — Main Application & SPA Router
 * ==============================================
 * SPA router, toast system, modal system, role guards, and navigation.
 */

import { getHealthCheck, resetDemoData } from './api.js';
import { loadDashboard } from './dashboard.js';
import { loadComplaints, showComplaintDetail } from './complaints.js';
import { loadSubmitForm } from './submit.js';
import { loadTickets } from './tickets.js';
import { loadAIStatus } from './ai-status.js';
import { loadRiskIntelligence } from './risk-intelligence.js';
import { loadRankedQueue } from './ranked-queue.js';
import { renderCategoryArranger } from './category-manager.js';
import { loadWardenPanel } from './warden-assign.js';
import { loadWorkerTasks, loadWorkerHistory } from './worker-dashboard.js';
import { loadAdminCandidates, loadAuditLogs } from './admin-dashboard.js';
import {
  initAuth,
  getAuthState,
  initNotificationBell,
  startNotificationPolling,
} from './auth.js';

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
  if (!container) return;
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

export function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

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

export function priorityClass(priority) {
  const p = (priority || '').toLowerCase();
  if (p.includes('critical') || p.includes('p1')) return 'critical';
  if (p.includes('high') || p.includes('p2')) return 'high';
  if (p.includes('medium') || p.includes('p3')) return 'medium';
  if (p.includes('low') || p.includes('p4')) return 'low';
  return 'medium';
}

export function statusClass(status) {
  const map = {
    Pending: 'pending',
    Assigned: 'assigned',
    Accepted: 'in-progress',
    'In Progress': 'in-progress',
    Completed: 'assigned',
    Resolved: 'resolved',
    Verified: 'resolved',
    Open: 'assigned',
  };
  return map[status] || 'pending';
}

export function priorityBadge(priority) {
  return `<span class="badge badge-${priorityClass(priority)}">${escapeHtml(priority)}</span>`;
}

export function statusBadge(status) {
  return `<span class="badge badge-${statusClass(status)}">${escapeHtml(status)}</span>`;
}

// ---------------------------------------------------------------------------
// SPA Router
// ---------------------------------------------------------------------------

const ALL_PAGES = [
  'dashboard',
  'submit',
  'complaints',
  'warden-assign',
  'ranked-queue',
  'risk-intelligence',
  'category-arranger',
  'tickets',
  'ai-status',
  'worker-tasks',
  'worker-history',
  'admin-candidates',
  'admin-audit',
];

let currentPage = 'dashboard';

export function navigateTo(page) {
  if (!ALL_PAGES.includes(page)) page = 'dashboard';

  const auth = getAuthState();
  const role = auth.role ? auth.role.toLowerCase() : 'guest';
  const isWarden = role === 'warden' || role === 'teacher' || role === 'admin';
  const isAdmin = role === 'admin';
  const isWorker = role === 'worker';

  // Role access guards
  if (['warden-assign', 'ranked-queue', 'category-arranger', 'risk-intelligence', 'tickets'].includes(page) && !isWarden) {
    showToast('That section is only available to Wardens and Administrators.', 'warning');
    page = 'dashboard';
  } else if (['admin-candidates', 'admin-audit'].includes(page) && !isAdmin) {
    showToast('Admin privileges required.', 'warning');
    page = 'dashboard';
  } else if (['worker-tasks', 'worker-history'].includes(page) && !isWorker && !isAdmin) {
    showToast('Field worker privileges required.', 'warning');
    page = 'dashboard';
  }

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
  const sb = document.getElementById('sidebar');
  const sbo = document.getElementById('sidebarOverlay');
  if (sb) sb.classList.remove('open');
  if (sbo) sbo.classList.remove('active');

  // Load page content
  switch (page) {
    case 'dashboard':         loadDashboard(); break;
    case 'submit':            loadSubmitForm(); break;
    case 'complaints':        loadComplaints(); break;
    case 'warden-assign':     loadWardenPanel(); break;
    case 'ranked-queue':      loadRankedQueue(); break;
    case 'risk-intelligence': loadRiskIntelligence(); break;
    case 'category-arranger': renderCategoryArranger(); break;
    case 'tickets':           loadTickets(); break;
    case 'ai-status':         loadAIStatus(); break;
    case 'worker-tasks':      loadWorkerTasks(); break;
    case 'worker-history':    loadWorkerHistory(); break;
    case 'admin-candidates':  loadAdminCandidates(); break;
    case 'admin-audit':       loadAuditLogs(); break;
  }
}

// Make globally accessible
window.navigateTo = navigateTo;
window.showComplaintDetail = showComplaintDetail;
window.showToast = showToast;
window.openModal = openModal;
window.closeModal = closeModal;

// ---------------------------------------------------------------------------
// Role-based sidebar visibility
// ---------------------------------------------------------------------------

function updateSidebarForRole() {
  const auth = getAuthState();
  const rawRole = auth.role ? auth.role.toLowerCase() : 'student';
  const role = rawRole === 'teacher' ? 'warden' : rawRole;

  document.querySelectorAll('.nav-item[data-roles]').forEach(item => {
    const allowed = item.getAttribute('data-roles').split(',').map(r => r.trim());
    if (allowed.includes(role) || (role === 'admin' && !allowed.includes('worker'))) {
      item.style.display = '';
    } else if (allowed.includes(role)) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  });
}

// ---------------------------------------------------------------------------
// Backend connection check
// ---------------------------------------------------------------------------

async function checkConnection() {
  const dot = document.getElementById('connectionDot');
  const label = document.getElementById('connectionLabel');
  if (!dot || !label) return;

  const health = await getHealthCheck();
  if (health) {
    dot.className = 'connection-dot connected';
    label.textContent = health.ai_ready ? 'AI Connected' : 'Backend OK';
  } else {
    dot.className = 'connection-dot disconnected';
    label.textContent = 'Disconnected';
  }
}

// ---------------------------------------------------------------------------
// Auth change handler
// ---------------------------------------------------------------------------

function onAuthChange(authState) {
  updateSidebarForRole();
  if (authState.isAuthenticated) {
    startNotificationPolling();
    // Redirect to role default if current page is unauthorized
    navigateTo('dashboard');
  }
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  // Sidebar navigation click
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(el.dataset.page);
    });
  });

  // Mobile hamburger
  const hamburger = document.getElementById('hamburgerBtn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  if (hamburger && sidebar && overlay) {
    hamburger.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('active');
    });

    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    });
  }

  // Modal close handlers
  const closeBtn = document.getElementById('modalCloseBtn');
  const modalOverlay = document.getElementById('modalOverlay');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }

  // Reset demo data button
  const resetBtn = document.getElementById('resetDemoBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (!confirm('Reset all demo complaints and worker tasks? Custom user data will be preserved.')) return;
      try {
        await resetDemoData();
        showToast('Demo data reset successfully!', 'success');
        navigateTo(currentPage);
      } catch (e) {
        showToast('Failed to reset demo data: ' + e.message, 'error');
      }
    });
  }

  // Initialise Notification Bell
  initNotificationBell();

  // Initialise Auth
  initAuth(onAuthChange);

  // Connection check
  checkConnection();
  setInterval(checkConnection, 30000);
});
