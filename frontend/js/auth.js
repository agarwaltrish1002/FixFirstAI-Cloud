/**
 * FixFirst AI — Authentication & 4-Role Portal Manager
 * =====================================================
 * Handles JWT sessions, 4 separate role login portals,
 * header UI, and notification bell management.
 */

import { loginUser, getDemoUsers, getNotifications, markAllNotificationsRead, markNotificationRead } from './api.js';

let currentUser = null;
let currentToken = null;
let onAuthChangeCallback = null;

const ROLE_CONFIG = {
  student: { icon: '🎓', label: 'Student', color: '#1d4ed8', bgClass: 'role-student' },
  warden:  { icon: '🛡️', label: 'Warden',  color: '#15803d', bgClass: 'role-warden'  },
  worker:  { icon: '🔧', label: 'Worker',  color: '#b45309', bgClass: 'role-worker'  },
  admin:   { icon: '⚙️', label: 'Admin',   color: '#7c3aed', bgClass: 'role-admin'   },
  teacher: { icon: '🛡️', label: 'Warden',  color: '#15803d', bgClass: 'role-warden'  },
};

// ---------------------------------------------------------------------------
// Auth State
// ---------------------------------------------------------------------------

export function getAuthState() {
  if (!currentToken) {
    currentToken = localStorage.getItem('fixfirst_token');
    const userStr = localStorage.getItem('fixfirst_user');
    if (userStr) {
      try { currentUser = JSON.parse(userStr); } catch { currentUser = null; }
    }
  }
  return {
    isAuthenticated: !!currentToken && !!currentUser,
    token: currentToken,
    user: currentUser,
    role: currentUser ? (currentUser.role || 'student') : 'guest',
  };
}

export function setAuthState(token, user) {
  currentToken = token;
  currentUser = user;
  localStorage.setItem('fixfirst_token', token);
  localStorage.setItem('fixfirst_user', JSON.stringify(user));
  updateHeaderUI();
  if (typeof onAuthChangeCallback === 'function') onAuthChangeCallback(getAuthState());
}

export function clearAuthState() {
  stopNotificationPolling();
  currentToken = null;
  currentUser = null;
  localStorage.removeItem('fixfirst_token');
  localStorage.removeItem('fixfirst_user');
  updateHeaderUI();
  showPortal();
  if (typeof onAuthChangeCallback === 'function') onAuthChangeCallback(getAuthState());
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export function initAuth(onChange) {
  onAuthChangeCallback = onChange;
  const state = getAuthState();

  if (!state.isAuthenticated) {
    showPortal();
  } else {
    hidePortal();
    showAppShell();
    updateHeaderUI();
    if (typeof onAuthChangeCallback === 'function') onAuthChangeCallback(state);
  }

  // Header logout button
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (target && (target.closest('#logoutBtn') || target.closest('#logoutSidebarBtn'))) {
      clearAuthState();
    }
    if (target && target.closest('#roleSwitchBtn')) {
      clearAuthState();
    }
  });
}

// ---------------------------------------------------------------------------
// Portal: Show 4 role cards (logged-out state)
// ---------------------------------------------------------------------------

export function showPortal() {
  const portal = document.getElementById('portalOverlay');
  const app = document.getElementById('appShell');
  if (portal) portal.style.display = 'flex';
  if (app) app.style.display = 'none';
}

export function hidePortal() {
  const portal = document.getElementById('portalOverlay');
  if (portal) portal.style.display = 'none';
}

export function showAppShell() {
  const app = document.getElementById('appShell');
  if (app) app.style.display = 'flex';
}

// ---------------------------------------------------------------------------
// Role-specific Login Modal
// ---------------------------------------------------------------------------

export async function openLoginModal(roleHint = null) {
  const modal = document.getElementById('modalOverlay');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const modalFooter = document.getElementById('modalFooter');
  if (!modal || !modalBody) return;

  const cfg = roleHint ? ROLE_CONFIG[roleHint] : null;
  const roleTitle = cfg ? `${cfg.icon} ${cfg.label} Login` : '🔑 Campus Login';

  modalTitle.textContent = roleTitle;

  // Fetch demo accounts for the selected role
  let demoAccounts = [];
  try {
    const res = await getDemoUsers();
    const all = (res && res.accounts) ? res.accounts : [];
    demoAccounts = roleHint ? all.filter(a => {
      const aRole = a.role === 'teacher' ? 'warden' : a.role;
      return aRole === roleHint;
    }) : all;
  } catch { demoAccounts = []; }

  const demoCardsHtml = demoAccounts.length > 0 ? `
    <div class="login-demo-section">
      <p class="login-demo-label">Quick 1-Click Demo Login:</p>
      <div class="demo-accounts-grid">
        ${demoAccounts.map(acc => `
          <div class="demo-account-card" data-user="${acc.username}" data-pass="${acc.password}">
            <div>
              <div class="demo-account-name">${acc.full_name}</div>
              <div class="demo-account-info">${acc.label}</div>
            </div>
            <button type="button" class="btn btn-sm btn-outline-primary demo-quick-login">
              Login →
            </button>
          </div>
        `).join('')}
      </div>
      <div class="login-divider"><span>OR ENTER CREDENTIALS</span></div>
    </div>
  ` : '';

  modalBody.innerHTML = `
    <div class="login-modal-content">
      ${cfg ? `<div class="login-role-banner role-banner-${roleHint}">
        <span class="login-role-icon">${cfg.icon}</span>
        <span>${cfg.label} Portal Authentication</span>
      </div>` : ''}

      ${demoCardsHtml}

      <form id="loginForm" class="login-form" autocomplete="off">
        <div class="form-group">
          <label class="form-label" for="loginUsername">Username</label>
          <input type="text" id="loginUsername" class="form-control" placeholder="Enter your username" required autocomplete="username" />
        </div>
        <div class="form-group">
          <label class="form-label" for="loginPassword">Password</label>
          <div class="password-input-wrapper">
            <input type="password" id="loginPassword" class="form-control" placeholder="Enter your password" required autocomplete="current-password" />
            <button type="button" class="password-toggle" onclick="this.previousElementSibling.type = this.previousElementSibling.type === 'password' ? 'text' : 'password'">👁</button>
          </div>
        </div>
        <div id="loginError" class="alert alert-danger" style="display:none; font-size:13px; margin-bottom:10px;"></div>
        <button type="submit" class="btn btn-primary w-100" id="loginSubmitBtn">
          Sign In ${cfg ? 'as ' + cfg.label : ''}
        </button>
      </form>
    </div>
  `;

  modalFooter.innerHTML = `
    <button class="btn btn-outline-secondary" id="loginModalBack">← Back to Portal</button>
  `;

  modal.classList.add('active');

  // Demo quick login handlers
  modalBody.querySelectorAll('.demo-account-card').forEach(card => {
    card.querySelector('.demo-quick-login').addEventListener('click', async () => {
      const u = card.dataset.user;
      const p = card.dataset.pass;
      await executeLogin(u, p, roleHint);
    });
  });

  // Form submit
  const form = document.getElementById('loginForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('loginUsername').value.trim();
    const p = document.getElementById('loginPassword').value;
    await executeLogin(u, p, roleHint);
  });

  // Back button
  document.getElementById('loginModalBack').addEventListener('click', () => {
    modal.classList.remove('active');
  });
}

// Make globally accessible for inline onclick in HTML
window.openLoginModal = openLoginModal;

window.quickDemoLogin = async (username, password, roleHint) => {
  await executeLogin(username, password, roleHint);
};

window.continueAsGuest = () => {
  hidePortal();
  showAppShell();
  updateHeaderUI();
  window.navigateTo?.('dashboard');
};

async function executeLogin(username, password, roleHint) {
  const errBox = document.getElementById('loginError');
  const submitBtn = document.getElementById('loginSubmitBtn');
  if (errBox) errBox.style.display = 'none';
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Signing in…'; }

  try {
    const res = await loginUser(username, password, roleHint);
    if (res && res.access_token) {
      setAuthState(res.access_token, res.user);
      const modal = document.getElementById('modalOverlay');
      if (modal) modal.classList.remove('active');
      hidePortal();
      showAppShell();
      const cfg = ROLE_CONFIG[res.user.role] || ROLE_CONFIG.student;
      window.showToast?.(`Welcome, ${res.user.full_name}! Logged in as ${cfg.label}.`, 'success');
    }
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message || 'Invalid username or password.';
      errBox.style.display = 'block';
    } else {
      alert(err.message);
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  }
}

// ---------------------------------------------------------------------------
// Header UI Update
// ---------------------------------------------------------------------------

export function updateHeaderUI() {
  const container = document.getElementById('userAuthContainer');
  const sidebarLabel = document.getElementById('sidebarRoleLabel');
  const headerSubtitle = document.getElementById('headerSubtitle');
  const notifBell = document.getElementById('notifBellWrapper');
  const resetBtn = document.getElementById('resetDemoBtn');

  const state = getAuthState();

  if (state.isAuthenticated && state.user) {
    const cfg = ROLE_CONFIG[state.role] || ROLE_CONFIG.student;
    const name = state.user.full_name || state.user.username;

    if (container) {
      container.innerHTML = `
        <div class="user-chip ${cfg.bgClass}">
          <span class="user-role-icon">${cfg.icon}</span>
          <span class="user-name">${name}</span>
          <button class="btn btn-xs" id="logoutBtn" title="Logout" style="margin-left:8px;background:rgba(255,255,255,0.2);border:none;color:inherit;border-radius:6px;padding:2px 8px;cursor:pointer;">Logout</button>
        </div>
      `;
    }

    if (sidebarLabel) sidebarLabel.textContent = `${cfg.label} Portal`;
    if (headerSubtitle) headerSubtitle.textContent = `${cfg.label} · Campus Safety & Maintenance`;
    if (notifBell) notifBell.style.display = '';
    if (resetBtn && (state.role === 'admin' || state.role === 'warden')) resetBtn.style.display = '';
  } else {
    if (container) {
      container.innerHTML = `<button class="btn btn-sm btn-primary" onclick="window.showPortal ? window.showPortal() : window.openLoginModal()">🔑 Sign In</button>`;
    }
    if (notifBell) notifBell.style.display = 'none';
    if (sidebarLabel) sidebarLabel.textContent = `Campus Maintenance`;
    if (headerSubtitle) headerSubtitle.textContent = `Public Campus Dashboard`;
  }
}

window.showPortal = showPortal;

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

let _notifInterval = null;

export function startNotificationPolling() {
  _loadNotifications();
  clearInterval(_notifInterval);
  _notifInterval = setInterval(_loadNotifications, 30000);
}

export function stopNotificationPolling() {
  clearInterval(_notifInterval);
}

async function _loadNotifications() {
  const state = getAuthState();
  if (!state.isAuthenticated) return;

  const res = await getNotifications();
  if (!res) return;

  const badge = document.getElementById('notifBadge');
  const list  = document.getElementById('notifList');
  const count = res.unread_count || 0;

  if (badge) {
    if (count > 0) {
      badge.textContent = count > 9 ? '9+' : count;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  }

  if (list) {
    const notifs = res.notifications || [];
    if (notifs.length === 0) {
      list.innerHTML = '<p class="notif-empty">No notifications yet</p>';
    } else {
      list.innerHTML = notifs.slice(0, 10).map(n => `
        <div class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}">
          <div class="notif-item-title">${escapeHtml(n.title)}</div>
          <div class="notif-item-msg">${escapeHtml(n.message)}</div>
          <div class="notif-item-time">${_formatRelTime(n.created_at)}</div>
        </div>
      `).join('');

      // Mark as read on click
      list.querySelectorAll('.notif-item').forEach(el => {
        el.addEventListener('click', async () => {
          if (!el.classList.contains('unread')) return;
          el.classList.remove('unread');
          await markNotificationRead(el.dataset.id);
          _loadNotifications();
        });
      });
    }
  }
}

// Setup notification bell toggle
export function initNotificationBell() {
  const bell = document.getElementById('notifBell');
  const dropdown = document.getElementById('notifDropdown');
  const markAllBtn = document.getElementById('markAllReadBtn');

  if (bell && dropdown) {
    bell.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.style.display !== 'none';
      dropdown.style.display = isOpen ? 'none' : 'block';
    });
    document.addEventListener('click', () => { dropdown.style.display = 'none'; });
    dropdown.addEventListener('click', (e) => e.stopPropagation());
  }

  if (markAllBtn) {
    markAllBtn.addEventListener('click', async () => {
      await markAllNotificationsRead();
      _loadNotifications();
    });
  }
}

function _formatRelTime(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function escapeHtml(text) {
  if (!text) return '';
  const d = document.createElement('div');
  d.textContent = String(text);
  return d.innerHTML;
}
