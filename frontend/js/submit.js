/**
 * FixFirst AI — Smart Complaint Submission
 * ==========================================
 * Features:
 *   • Real-time AI complaint validation (rejects chit-chat & food orders)
 *   • Ambiguity detection prompting user for clarity
 *   • Automatic Category Classification across 10 standard categories
 *   • Contextual P1–P4 Priority Prediction with Safety Engine override
 *   • Recommended department routing and suggested safety actions
 */

import { submitComplaint, uploadImage, getCategories, recommendComplaint } from './api.js';
import { showToast, escapeHtml } from './app.js';
import { getAuthState } from './auth.js';

let selectedFile = null;
let lastRecommendation = null;

export async function loadSubmitForm() {
  const page = document.getElementById('page-submit');
  if (!page) return;

  const authState = getAuthState();
  const defaultStudentName = (authState.user && authState.user.full_name) || '';

  // Fetch standard 10 categories
  const catData = await getCategories();
  const categories = catData ? catData.categories : [
    'Electrical', 'Plumbing', 'Hygiene & Sanitation', 'Civil Infrastructure',
    'Furniture', 'Fire Safety', 'Security', 'IT & Networking',
    'HVAC & Ventilation', 'Other Maintenance',
  ];

  const catOptions = categories.map(c =>
    `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`
  ).join('');

  page.innerHTML = `
    <div class="submit-container" style="max-width:760px; margin:0 auto;">
      <div class="page-header mb-20">
        <h2 class="page-title">📝 Submit Campus Maintenance Complaint</h2>
        <p class="text-muted">AI-powered intake pipeline automatically validates, categorizes, and ranks priority.</p>
      </div>

      <div class="card">
        <form id="complaintForm" novalidate>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Student Name / Submitter</label>
              <input type="text" class="form-input" id="f-name" value="${escapeHtml(defaultStudentName)}" placeholder="e.g. Aarav Sharma" maxlength="100">
            </div>
            <div class="form-group">
              <label class="form-label">Room / Hall Number</label>
              <input type="text" class="form-input" id="f-room" placeholder="e.g. Room 204 or Lab 3" maxlength="50">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Location / Building <span class="required">*</span></label>
            <input type="text" class="form-input" id="f-location" placeholder="e.g. Academic Block A, Hostel H1, Library" required maxlength="200">
            <div class="form-error" id="err-location"></div>
          </div>

          <div class="form-group">
            <label class="form-label">Complaint Title <span class="required">*</span></label>
            <input type="text" class="form-input" id="f-title" placeholder="e.g. Burning smell from electrical socket" required minlength="4" maxlength="200">
            <div class="form-error" id="err-title"></div>
          </div>

          <div class="form-group">
            <label class="form-label">Detailed Description <span class="required">*</span></label>
            <textarea class="form-textarea" id="f-desc" rows="4" placeholder="Describe the problem, hazard signs, or physical equipment involved..." required minlength="8" maxlength="2000"></textarea>
            <div class="form-error" id="err-desc"></div>
            <div class="form-hint" id="desc-count">0 / 2000 characters</div>
          </div>

          <!-- Real-Time AI Intelligence Preview -->
          <div id="aiRecommendationCard" class="ai-recommendation-card" style="display:none;"></div>

          <div class="form-group mt-16">
            <div class="d-flex justify-between align-items-center mb-6">
              <label class="form-label mb-0">Maintenance Category <span class="required">*</span></label>
              <span id="autoCategoryTag" class="badge-ai-auto" style="display:none;">✨ Auto-Detected</span>
            </div>
            <select class="form-select" id="f-category" required>
              <option value="">Select or let AI auto-detect</option>
              ${catOptions}
            </select>
            <div class="form-error" id="err-category"></div>
          </div>

          <div class="form-group">
            <label class="form-label">Photo Attachment (optional)</label>
            <div class="file-upload" id="fileUploadArea">
              <div class="file-upload-icon">📷</div>
              <p class="file-upload-text">Click or drag photo here<br><strong>JPG, PNG, GIF, WebP</strong> — Max 5 MB</p>
              <input type="file" id="f-image" accept=".jpg,.jpeg,.png,.gif,.webp" style="display:none;">
            </div>
            <div class="file-preview" id="filePreview" style="display:none;"></div>
            <div class="form-error" id="err-image"></div>
          </div>

          <div class="submit-actions mt-24">
            <button type="submit" class="btn btn-primary btn-lg" id="submitBtn">
              🚀 Submit Complaint
            </button>
            <button type="reset" class="btn btn-outline-secondary">
              Clear Form
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Wire elements
  const form = document.getElementById('complaintForm');
  const titleField = document.getElementById('f-title');
  const descField = document.getElementById('f-desc');
  const locField = document.getElementById('f-location');
  const catField = document.getElementById('f-category');
  const descCount = document.getElementById('desc-count');
  const aiCard = document.getElementById('aiRecommendationCard');
  const autoTag = document.getElementById('autoCategoryTag');
  const fileInput = document.getElementById('f-image');
  const uploadArea = document.getElementById('fileUploadArea');
  const preview = document.getElementById('filePreview');
  const submitBtn = document.getElementById('submitBtn');

  selectedFile = null;
  lastRecommendation = null;

  // Real-time AI Analysis Debounce
  let recDebounce = null;
  let userManuallyChangedCategory = false;

  catField.addEventListener('change', () => {
    userManuallyChangedCategory = true;
    if (autoTag) autoTag.style.display = 'none';
  });

  const runLiveRecommendation = () => {
    clearTimeout(recDebounce);
    recDebounce = setTimeout(async () => {
      const titleVal = titleField.value.trim();
      const descVal = descField.value.trim();
      const locVal = locField.value.trim();

      if (titleVal.length < 3 && descVal.length < 5) {
        aiCard.style.display = 'none';
        return;
      }

      try {
        const res = await recommendComplaint({
          title: titleVal,
          description: descVal,
          location: locVal,
          category: catField.value || undefined,
        });

        lastRecommendation = res;
        renderAIRecommendation(res, aiCard, catField, autoTag, userManuallyChangedCategory, submitBtn);
      } catch (err) {
        console.warn('Live recommendation notice:', err);
      }
    }, 350);
  };

  titleField.addEventListener('input', runLiveRecommendation);
  locField.addEventListener('input', runLiveRecommendation);
  descField.addEventListener('input', () => {
    descCount.textContent = `${descField.value.length} / 2000 characters`;
    runLiveRecommendation();
  });

  // File Upload Handlers
  uploadArea.addEventListener('click', () => fileInput.click());
  uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = 'var(--primary)'; });
  uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = ''; });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '';
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) handleFile(fileInput.files[0]);
  });

  function handleFile(file) {
    const errImg = document.getElementById('err-image');
    errImg.textContent = '';
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      errImg.textContent = 'Invalid file type. Only JPG, PNG, GIF, WebP allowed.';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      errImg.textContent = 'File too large. Maximum 5 MB.';
      return;
    }
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.innerHTML = `
        <img src="${e.target.result}" alt="Preview">
        <button class="remove-file" type="button" title="Remove">&times;</button>
      `;
      preview.style.display = 'inline-block';
      uploadArea.style.display = 'none';
      preview.querySelector('.remove-file').addEventListener('click', () => {
        selectedFile = null;
        fileInput.value = '';
        preview.style.display = 'none';
        uploadArea.style.display = '';
      });
    };
    reader.readAsDataURL(file);
  }

  // Form Reset
  form.addEventListener('reset', () => {
    selectedFile = null;
    userManuallyChangedCategory = false;
    preview.style.display = 'none';
    uploadArea.style.display = '';
    aiCard.style.display = 'none';
    if (autoTag) autoTag.style.display = 'none';
    if (submitBtn) submitBtn.disabled = false;
    document.querySelectorAll('.form-error').forEach(el => el.textContent = '');
    descCount.textContent = '0 / 2000 characters';
  });

  // Submit Handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    document.querySelectorAll('.form-error').forEach(el => el.textContent = '');

    const name = document.getElementById('f-name').value.trim() || 'Student';
    const location = locField.value.trim();
    const room = document.getElementById('f-room').value.trim();
    const title = titleField.value.trim();
    const desc = descField.value.trim();
    let category = catField.value;

    let hasError = false;
    if (location.length < 2) {
      document.getElementById('err-location').textContent = 'Please specify building or area.';
      hasError = true;
    }
    if (title.length < 4) {
      document.getElementById('err-title').textContent = 'Title must be at least 4 characters.';
      hasError = true;
    }
    if (desc.length < 8) {
      document.getElementById('err-desc').textContent = 'Please provide more details (at least 8 characters).';
      hasError = true;
    }

    if (!category && lastRecommendation && lastRecommendation.category) {
      category = lastRecommendation.category;
    }
    if (!category) {
      category = 'Other Maintenance';
    }

    if (hasError) return;

    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Processing with AI...';

    try {
      let imagePath = null;
      if (selectedFile) {
        submitBtn.textContent = 'Uploading photo...';
        const upRes = await uploadImage(selectedFile);
        if (upRes && upRes.path) imagePath = upRes.path;
      }

      submitBtn.textContent = 'Analyzing and Filing...';
      const newComplaint = await submitComplaint({
        student_name: name,
        location,
        room_number: room,
        title,
        description: desc,
        category,
        image_path: imagePath,
      });

      showToast(`Complaint filed! Priority: ${newComplaint.priority || 'Logged'} (ID: ${newComplaint.id})`, 'success');
      form.reset();
      window.location.hash = '#complaints';
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = '🚀 Submit Complaint';
      showToast(err.message || 'Submission failed. Please check the form.', 'error');
    }
  });
}

function renderAIRecommendation(res, card, catSelect, autoTag, userManuallyChanged, submitBtn) {
  if (!res) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';

  // Scenario 1: Rejected Invalid Input (Chit-Chat, Food Order, Nonsense)
  if (res.is_valid === false && !res.is_ambiguous) {
    card.className = 'ai-recommendation-card ai-card-invalid';
    card.innerHTML = `
      <div class="ai-card-header">
        <span class="ai-tag tag-danger">❌ Invalid Submission</span>
      </div>
      <p class="ai-msg-danger">${escapeHtml(res.validation_message || 'This does not appear to be a campus maintenance complaint.')}</p>
      ${res.suggestion ? `<p class="ai-suggestion-text">💡 <strong>Tip:</strong> ${escapeHtml(res.suggestion)}</p>` : ''}
    `;
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  // Scenario 2: Ambiguous Input (Needs more details)
  if (res.is_ambiguous) {
    card.className = 'ai-recommendation-card ai-card-ambiguous';
    card.innerHTML = `
      <div class="ai-card-header">
        <span class="ai-tag tag-warning">ℹ️ Clarification Needed</span>
      </div>
      <p class="ai-msg-warning">${escapeHtml(res.validation_message || 'Your complaint is too vague.')}</p>
      <p class="ai-clarification-prompt">👉 ${escapeHtml(res.clarification_prompt || 'Please specify exactly what appliance, fixture, or room area is affected.')}</p>
    `;
    if (submitBtn) submitBtn.disabled = false;
    return;
  }

  // Scenario 3: Valid Legitimate Complaint
  if (submitBtn) submitBtn.disabled = false;
  const isP1 = res.is_critical || (res.priority && res.priority.includes('Critical'));
  const prio = res.priority || 'P3 – Medium';

  card.className = `ai-recommendation-card ${isP1 ? 'ai-card-critical' : 'ai-card-valid'}`;

  // Automatically select category in dropdown if user hasn't overridden
  if (!userManuallyChanged && res.category && catSelect) {
    catSelect.value = res.category;
    if (autoTag) {
      autoTag.style.display = 'inline-block';
      autoTag.textContent = `✨ Auto-Detected: ${res.category}`;
    }
  }

  card.innerHTML = `
    <div class="ai-card-header">
      <div class="d-flex align-items-center gap-2">
        <span class="ai-tag ${isP1 ? 'tag-danger' : 'tag-success'}">🤖 AI Recommendation</span>
        <span class="ai-conf-badge">Confidence: ${(res.confidence * 100).toFixed(0)}%</span>
        ${res.requires_manual_review ? `<span class="badge badge-warning" style="font-size:11px;">⚠️ Flagged for Review</span>` : ''}
      </div>
      <span class="priority-pill ${isP1 ? 'p1-pill' : ''}">${prio}</span>
    </div>

    <div class="ai-card-body">
      <div class="rec-grid">
        <div class="rec-item">
          <small>Detected Category</small>
          <strong>📁 ${escapeHtml(res.category || 'Other Maintenance')}</strong>
        </div>
        <div class="rec-item">
          <small>Assigned Department</small>
          <strong>🏢 ${escapeHtml(res.department || 'General Maintenance')}</strong>
        </div>
      </div>

      <div class="rec-reason mt-8">
        <p class="mb-4"><strong>Priority Reason:</strong> ${escapeHtml(res.priority_reason || 'Evaluated based on campus safety guidelines.')}</p>
        ${res.suggested_action ? `<p class="mb-0 text-muted"><strong>Suggested Action:</strong> ${escapeHtml(res.suggested_action)}</p>` : ''}
      </div>

      ${res.safety_warning ? `
        <div class="rec-safety-alert mt-8">
          <span>⚠️ <strong>Safety Alert:</strong> ${escapeHtml(res.safety_warning)}</span>
        </div>
      ` : ''}
    </div>
  `;
}
