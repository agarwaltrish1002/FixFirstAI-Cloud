/**
 * FixFirst AI — Submit Complaint Page
 * =====================================
 * Renders the complaint form, validates inputs, and POSTs to the API.
 */

import { submitComplaint, uploadImage, getCategories, previewComplaintRisk } from './api.js';
import { showToast, escapeHtml, priorityBadge } from './app.js';

let selectedFile = null;

export async function loadSubmitForm() {
  const page = document.getElementById('page-submit');

  // Fetch categories
  const catData = await getCategories();
  const categories = catData ? catData.categories : [
    'Electrical Safety', 'Water Leakage', 'Infrastructure', 'Hygiene',
    'Emergency Exit', 'Lighting', 'Drinking Water', 'Other',
  ];

  const catOptions = categories.map(c =>
    `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`
  ).join('');

  page.innerHTML = `
    <h2 class="mb-24" style="font-size:22px;">📝 Submit a Complaint</h2>
    <div class="card" style="max-width:720px;">
      <form id="complaintForm" novalidate>
        <div class="form-group">
          <label class="form-label">Student Name <span class="form-hint">(optional)</span></label>
          <input type="text" class="form-input" id="f-name" placeholder="e.g. Arjun Mehta" maxlength="100">
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Location / Building <span class="required">*</span></label>
            <input type="text" class="form-input" id="f-location" placeholder="e.g. Academic Block A" required maxlength="200">
            <div class="form-error" id="err-location"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Room Number</label>
            <input type="text" class="form-input" id="f-room" placeholder="e.g. 204" maxlength="50">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Complaint Title <span class="required">*</span></label>
          <input type="text" class="form-input" id="f-title" placeholder="Short title of the issue" required minlength="5" maxlength="200">
          <div class="form-error" id="err-title"></div>
        </div>

        <div class="form-group">
          <label class="form-label">Description <span class="required">*</span></label>
          <textarea class="form-textarea" id="f-desc" placeholder="Describe the issue in detail..." required minlength="10" maxlength="2000"></textarea>
          <div class="form-error" id="err-desc"></div>
          <div class="form-hint" id="desc-count">0 / 2000 characters</div>
        </div>

        <div class="form-group">
          <label class="form-label">Category <span class="required">*</span></label>
          <select class="form-select" id="f-category" required>
            <option value="">Select a category</option>
            ${catOptions}
          </select>
          <div class="form-error" id="err-category"></div>
        </div>

        <div class="form-group">
          <label class="form-label">Photo (optional)</label>
          <div class="file-upload" id="fileUploadArea">
            <div class="file-upload-icon">📷</div>
            <p class="file-upload-text">Click or drag an image here<br><strong>JPG, PNG, GIF, WebP</strong> — Max 5 MB</p>
            <input type="file" id="f-image" accept=".jpg,.jpeg,.png,.gif,.webp" style="display:none;">
          </div>
          <div class="file-preview" id="filePreview" style="display:none;"></div>
          <div class="form-error" id="err-image"></div>
        </div>

        <!-- Live AI Pre-Submission Safety Assessment -->
        <div id="liveSafetyPreview" style="display:none;margin-top:20px;border-radius:var(--radius);padding:14px 16px;border:1.5px solid var(--gray-200);background:var(--gray-50);transition:all 0.3s ease;">
          <div class="flex justify-between items-center mb-6">
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gray-500);letter-spacing:0.5px;">
              ⚡ Live Safety &amp; Risk Preview
            </span>
            <span id="previewPriorityBadge" class="badge badge-medium">Evaluating...</span>
          </div>
          <p id="previewAdviceText" style="font-size:13px;font-weight:600;margin-bottom:4px;color:var(--gray-900);">
            Analyzing description...
          </p>
          <p id="previewReasonText" style="font-size:12px;color:var(--gray-700);margin-bottom:0;line-height:1.4;">
          </p>
        </div>

        <div style="display:flex;gap:12px;margin-top:24px;">
          <button type="submit" class="btn btn-primary" id="submitBtn">🚀 Submit Complaint</button>
          <button type="reset" class="btn btn-secondary">Clear Form</button>
        </div>
      </form>
    </div>
  `;

  // Wire up events
  const form = document.getElementById('complaintForm');
  const descField = document.getElementById('f-desc');
  const descCount = document.getElementById('desc-count');
  const fileInput = document.getElementById('f-image');
  const uploadArea = document.getElementById('fileUploadArea');
  const preview = document.getElementById('filePreview');

  selectedFile = null;

  // Character counter and Live Safety Assessment
  const titleField = document.getElementById('f-title');
  const catField = document.getElementById('f-category');
  const livePreviewBox = document.getElementById('liveSafetyPreview');
  const previewBadge = document.getElementById('previewPriorityBadge');
  const previewAdvice = document.getElementById('previewAdviceText');
  const previewReason = document.getElementById('previewReasonText');

  let previewDebounce = null;
  const updateLivePreview = () => {
    clearTimeout(previewDebounce);
    previewDebounce = setTimeout(async () => {
      const titleVal = titleField ? titleField.value.trim() : '';
      const descVal = descField ? descField.value.trim() : '';
      const catVal = catField ? catField.value : '';

      if (titleVal.length < 3 && descVal.length < 5) {
        livePreviewBox.style.display = 'none';
        return;
      }

      const res = await previewComplaintRisk({ title: titleVal, description: descVal, category: catVal });
      if (!res) return;

      livePreviewBox.style.display = 'block';
      const prio = res.predicted_priority || 'Medium';
      previewBadge.className = `badge badge-${prio.toLowerCase()}`;
      previewBadge.textContent = prio;

      if (res.is_critical) {
        livePreviewBox.style.border = '1.5px solid var(--red)';
        livePreviewBox.style.background = 'var(--red-bg)';
        previewAdvice.style.color = '#991b1b';
      } else if (prio === 'High') {
        livePreviewBox.style.border = '1.5px solid var(--orange)';
        livePreviewBox.style.background = 'var(--orange-bg)';
        previewAdvice.style.color = '#9a3412';
      } else {
        livePreviewBox.style.border = '1.5px solid var(--gray-200)';
        livePreviewBox.style.background = 'var(--gray-50)';
        previewAdvice.style.color = 'var(--gray-900)';
      }

      previewAdvice.textContent = res.immediate_advice || 'Standard triage assigned.';
      previewReason.textContent = res.priority_reason ? `Identified concern: ${res.priority_reason}` : '';
    }, 250);
  };

  titleField.addEventListener('input', updateLivePreview);
  descField.addEventListener('input', () => {
    descCount.textContent = `${descField.value.length} / 2000 characters`;
    updateLivePreview();
  });
  catField.addEventListener('change', updateLivePreview);

  // File upload area
  uploadArea.addEventListener('click', () => fileInput.click());
  uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = 'var(--primary)'; });
  uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = ''; });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '';
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
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

  // Form reset
  form.addEventListener('reset', () => {
    selectedFile = null;
    preview.style.display = 'none';
    uploadArea.style.display = '';
    if (livePreviewBox) livePreviewBox.style.display = 'none';
    document.querySelectorAll('.form-error').forEach(el => el.textContent = '');
    descCount.textContent = '0 / 2000 characters';
  });

  // Form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Clear errors
    document.querySelectorAll('.form-error').forEach(el => el.textContent = '');

    const name = document.getElementById('f-name').value.trim() || 'Anonymous';
    const location = document.getElementById('f-location').value.trim();
    const room = document.getElementById('f-room').value.trim();
    const title = document.getElementById('f-title').value.trim();
    const desc = document.getElementById('f-desc').value.trim();
    const category = document.getElementById('f-category').value;

    // Validate
    let valid = true;
    if (location.length < 2) {
      document.getElementById('err-location').textContent = 'Location is required (at least 2 characters).';
      valid = false;
    }
    if (title.length < 5) {
      document.getElementById('err-title').textContent = 'Title must be at least 5 characters.';
      valid = false;
    }
    if (desc.length < 10) {
      document.getElementById('err-desc').textContent = 'Description must be at least 10 characters.';
      valid = false;
    }
    if (!category) {
      document.getElementById('err-category').textContent = 'Please select a category.';
      valid = false;
    }

    if (!valid) return;

    const btn = document.getElementById('submitBtn');
    btn.classList.add('btn-loading');
    btn.disabled = true;

    try {
      // Upload image first if selected
      let imagePath = null;
      if (selectedFile) {
        try {
          const uploadResult = await uploadImage(selectedFile);
          imagePath = uploadResult.path;
        } catch (uploadErr) {
          showToast('Image upload failed: ' + uploadErr.message, 'warning');
        }
      }

      // Submit complaint
      const result = await submitComplaint({
        student_name: name,
        location: location,
        room_number: room,
        title: title,
        description: desc,
        category: category,
        image_path: imagePath,
      });

      showToast(`Complaint ${result.id} submitted successfully! Priority: ${result.priority}`, 'success', 6000);
      form.reset();
      selectedFile = null;
      preview.style.display = 'none';
      uploadArea.style.display = '';

      // Show the AI analysis result
      if (result.priority === 'Critical') {
        showToast('⚠️ CRITICAL SAFETY HAZARD detected! Immediate attention required.', 'error', 8000);
      }

    } catch (err) {
      showToast('Submission failed: ' + err.message, 'error');
    } finally {
      btn.classList.remove('btn-loading');
      btn.disabled = false;
    }
  });
}
