/**
 * FixFirst AI — Authentication & Role Manager
 * ============================================
 * Handles user sessions, JWT tokens in localStorage,
 * role-based UI scoping (Student vs Teacher/Warden), and demo user switching.
 */

import { loginUser, getDemoUsers } from './api.js';

let currentUser = null;
let currentToken = null;
let onAuthChangeCallback = null;

export function getAuthState() {
  if (!currentToken) {
    currentToken = localStorage.getItem('fixfirst_token');
    const userStr = localStorage.getItem('fixfirst_user');
    if (userStr) {
      try {
        currentUser = JSON.parse(userStr);
      } catch (e) {
        currentUser = null;
      }
    }
  }
  return {
    isAuthenticated: !!currentToken && !!currentUser,
    token: currentToken,
    user: currentUser,
    role: currentUser ? currentUser.role : 'guest',
  };
}

export function setAuthState(token, user) {
  currentToken = token;
  currentUser = user;
  localStorage.setItem('fixfirst_token', token);
  localStorage.setItem('fixfirst_user', JSON.stringify(user));
  updateHeaderUI();
  if (typeof onAuthChangeCallback === 'function') {
    onAuthChangeCallback(getAuthState());
  }
}

export function clearAuthState() {
  currentToken = null;
  currentUser = null;
  localStorage.removeItem('fixfirst_token');
  localStorage.removeItem('fixfirst_user');
  updateHeaderUI();
  if (typeof onAuthChangeCallback === 'function') {
    onAuthChangeCallback(getAuthState());
  }
}

export function initAuth(onChange) {
  onAuthChangeCallback = onChange;
  const state = getAuthState();

  // If no user is logged in, default to student1 for a seamless demo experience
  if (!state.isAuthenticated) {
    autoLoginDefaultDemo();
  } else {
    updateHeaderUI();
    if (typeof onAuthChangeCallback === 'function') {
      onAuthChangeCallback(state);
    }
  }

  // Setup click listeners on Login / Role buttons
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest('#roleSwitchBtn')) {
      showLoginModal();
    }
    if (e.target && e.target.closest('#logoutBtn')) {
      clearAuthState();
      showLoginModal();
    }
  });
}

async function autoLoginDefaultDemo() {
  try {
    const res = await loginUser('student1', 'Student@123');
    if (res && res.access_token) {
      setAuthState(res.access_token, res.user);
    }
  } catch (err) {
    console.warn('Auto demo login notice:', err);
    updateHeaderUI();
  }
}

export function updateHeaderUI() {
  const container = document.getElementById('userAuthContainer');
  if (!container) return;

  const state = getAuthState();
  if (state.isAuthenticated && state.user) {
    const isStaff = state.role === 'teacher' || state.role === 'warden';
    const roleBadgeClass = isStaff ? 'role-badge-staff' : 'role-badge-student';
    const roleIcon = isStaff ? '🛡️' : '🎓';
    const roleLabel = state.role === 'warden' ? 'Hostel Warden' : (state.role === 'teacher' ? 'Faculty / Committee' : 'Student');

    container.innerHTML = `
      <div class="user-chip" id="roleSwitchBtn" title="Click to switch role or account">
        <span class="user-role-badge ${roleBadgeClass}">${roleIcon} ${roleLabel}</span>
        <span class="user-name">${state.user.full_name || state.user.username}</span>
        <span class="switch-hint">⇄ Switch</span>
      </div>
    `;
  } else {
    container.innerHTML = `
      <button class="btn btn-sm btn-primary" id="roleSwitchBtn">
        🔑 Log In
      </button>
    `;
  }
}

export async function showLoginModal() {
  const modalOverlay = document.getElementById('modalOverlay');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const modalFooter = document.getElementById('modalFooter');

  if (!modalOverlay || !modalBody) return;

  modalTitle.textContent = 'Campus Portal Authentication';

  let demoAccounts = [];
  try {
    const res = await getDemoUsers();
    demoAccounts = res.accounts || [];
  } catch (e) {
    demoAccounts = [
      { username: 'student1', role: 'student', full_name: 'Aarav Sharma', label: 'Student (Hostel H1)', password: 'Student@123' },
      { username: 'warden1', role: 'warden', full_name: 'Rajesh Kumar', label: 'Chief Hostel Warden', password: 'Warden@123' },
      { username: 'teacher1', role: 'teacher', full_name: 'Dr. Sunita Rao', label: 'Faculty Maintenance Committee', password: 'Teacher@123' },
    ];
  }

  modalBody.innerHTML = `
    <div class="auth-modal-content">
      <div class="auth-banner">
        <h4>Role-Based Access Control</h4>
        <p>Choose your campus role or enter your credentials to test distinct Student and Teacher/Warden views.</p>
      </div>

      <div class="demo-role-grid">
        ${demoAccounts.map(acc => {
          const isStaff = acc.role === 'teacher' || acc.role === 'warden';
          const icon = acc.role === 'warden' ? '🛡️' : (acc.role === 'teacher' ? '👨‍🏫' : '🎓');
          return `
            <div class="demo-card ${isStaff ? 'demo-staff' : 'demo-student'}" data-user="${acc.username}" data-pass="${acc.password}">
              <div class="demo-icon">${icon}</div>
              <div class="demo-info">
                <strong>${acc.label}</strong>
                <small>${acc.full_name} (${acc.username})</small>
              </div>
              <button type="button" class="btn btn-sm btn-outline-primary demo-login-btn">Log In</button>
            </div>
          `;
        }).join('')}
      </div>

      <div class="auth-divider"><span>OR CUSTOM CREDENTIALS</span></div>

      <form id="customLoginForm" class="custom-login-form">
        <div class="form-group mb-2">
          <label>Username</label>
          <input type="text" id="loginUsername" class="form-control" placeholder="e.g. student1 or warden1" required />
        </div>
        <div class="form-group mb-3">
          <label>Password</label>
          <input type="password" id="loginPassword" class="form-control" placeholder="Enter password" required />
        </div>
        <div id="loginErrorMsg" class="alert alert-danger" style="display:none; font-size: 13px; margin-bottom: 10px;"></div>
        <button type="submit" class="btn btn-primary w-100" id="loginSubmitBtn">Sign In with Credentials</button>
      </form>
    </div>
  `;

  modalFooter.innerHTML = `
    <button class="btn btn-outline-secondary" id="authModalClose">Close</button>
  `;

  modalOverlay.classList.add('active');

  // Handle demo clicks
  modalBody.querySelectorAll('.demo-card').forEach(card => {
    card.addEventListener('click', async () => {
      const u = card.getAttribute('data-user');
      const p = card.getAttribute('data-pass');
      await executeLogin(u, p);
    });
  });

  // Handle form submit
  const form = document.getElementById('customLoginForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('loginUsername').value.trim();
    const p = document.getElementById('loginPassword').value;
    await executeLogin(u, p);
  });

  const closeBtn = document.getElementById('authModalClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modalOverlay.classList.remove('active');
    });
  }
}

async function executeLogin(username, password) {
  const errBox = document.getElementById('loginErrorMsg');
  if (errBox) errBox.style.display = 'none';

  try {
    const res = await loginUser(username, password);
    if (res && res.access_token) {
      setAuthState(res.access_token, res.user);
      const modalOverlay = document.getElementById('modalOverlay');
      if (modalOverlay) modalOverlay.classList.remove('active');
      window.showToast?.(`Logged in successfully as ${res.user.full_name} (${res.user.role.toUpperCase()})`, 'success');
    }
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message || 'Login failed. Invalid username or password.';
      errBox.style.display = 'block';
    } else {
      alert(err.message);
    }
  }
}
