// ============================================
// LANDING.JS FILE MAP
// 0. PROFILE PICTURE GRID SETUP
// 1. DOM REFERENCES
// 2. UI STATE
// 3. VIEW TOGGLE (LOGIN/SIGNUP)
// 4. PFP SELECTION AND UPLOAD
// 5. FORM VALIDATION
// 6. LOGIN FLOW
// 7. SIGNUP FLOW
// 8. KEYBOARD SUBMISSION
// 9. APP BOOTSTRAP
// ============================================

import { api } from './api.js';
import { installPrettyAlerts } from './ui-alerts.js';

// ============================================
// 0. PROFILE PICTURE GRID SETUP
// ============================================

const PFP_LIST = [
  'pfp1.webp',  'pfp2.webp',  'pfp3.webp',  'pfp4.webp',  'pfp5.webp',
  'pfp6.webp',  'pfp7.webp',  'pfp8.webp',  'pfp9.webp',  'pfp10.webp',
  'pfp11.webp', 'pfp12.webp', 'pfp13.webp', 'pfp14.webp', 'pfp15.webp',
  'pfp16.webp', 'pfp17.webp', 'pfp18.webp', 'pfp19.webp'
];

const MAX_PFP_UPLOAD_BYTES = 2 * 1024 * 1024;
const ALLOWED_PFP_MIME_TYPES = new Set([
  'image/webp',
  'image/gif',
  'image/png',
  'image/jpeg'
]);

function getLandingWorldId() {
  try {
    return new URLSearchParams(window.location.search).get('world');
  } catch {
    return null;
  }
}

async function applyLandingWorldTheme(worldId) {
  if (!worldId) return;

  const { data: world } = await api.worlds.getTheme(worldId);

  if (!world) return;

  const defaultBackground = `url(${import.meta.env.BASE_URL}images/background.jpg)`;
  document.documentElement.style.setProperty('--bg-url', world.background_url ? `url(${world.background_url})` : defaultBackground);
  document.documentElement.style.setProperty('--font-family', world.font_family || 'Arial, Helvetica, sans-serif');
  document.body.style.color = world.font_color || '';
  if (world.ui_color) {
    document.documentElement.style.setProperty('--ui-tint-bg', world.ui_color);
  }
}

function getPfpValidationError(file) {
  if (!file) return null;

  if (!ALLOWED_PFP_MIME_TYPES.has(file.type)) {
    return 'Profile picture must be webp, gif, png, or jpeg.';
  }

  if (file.size > MAX_PFP_UPLOAD_BYTES) {
    return 'Profile picture must be 2 MB or smaller.';
  }

  return null;
}

function drawImageSafely(ctx, img) {
  try {
    ctx.drawImage(img, 0, 0, 200, 200);
  } catch (e) {
    console.warn('Unable to draw profile picture frame', e);
  }
}

function freezeContainerFrame(container) {
  const img = container.querySelector('img');
  const cvs = container.querySelector('canvas');
  if (img && cvs && img.naturalWidth > 0) {
    const ctx = cvs.getContext('2d');
    if (ctx) drawImageSafely(ctx, img);
    img.classList.remove('pfp-playing');
  }
}

function deselectPFPContainers() {
  pfpContainers.forEach(container => {
    if (container.classList.contains('selected')) {
      freezeContainerFrame(container);
    }
    container.classList.remove('selected');
  });
}

function loadPFPGrid() {
  const pfpGrid = document.getElementById('pfpGrid');

  PFP_LIST.forEach(pfpName => {
    const container = document.createElement('div');
    container.className = 'pfp-container';
    container.dataset.pfp = pfpName;

    const src = `${import.meta.env.BASE_URL}images/pfps/${pfpName}`;

    const cvs = document.createElement('canvas');
    cvs.width  = 200;
    cvs.height = 200;
    const ctx  = cvs.getContext('2d');

    const img = document.createElement('img');
    img.src = src;
    img.alt = pfpName;

    const drawFrame = () => {
      drawImageSafely(ctx, img);
    };

    if (img.complete && img.naturalWidth > 0) drawFrame();
    else img.addEventListener('load', drawFrame, { once: true });

    container.addEventListener('mouseenter', () => {
      img.classList.add('pfp-playing');
    });

    container.addEventListener('mouseleave', () => {
      if (!container.classList.contains('selected')) {
        drawFrame();
        img.classList.remove('pfp-playing');
      }
    });

    container.appendChild(cvs);
    container.appendChild(img);
    pfpGrid.appendChild(container);
  });

  // Add upload tile at the end of the grid
  const uploadContainer = document.createElement('div');
  uploadContainer.className = 'upload-pfp-container';
  uploadContainer.id = 'uploadPFPButton';
  uploadContainer.innerHTML = '<span>+</span>';
  pfpGrid.appendChild(uploadContainer);
}

// ============================================
// 1. DOM REFERENCES
// ============================================

const loginToggle    = document.getElementById('loginToggle');
const signupToggle   = document.getElementById('signupToggle');
const loginInputs    = document.getElementById('loginInputs');
const signupInputs   = document.getElementById('signupInputs');
const pfpSelection   = document.getElementById('pfpSelection');
const pfpUpload      = document.getElementById('pfpUpload');
const loginUsername  = document.getElementById('loginUsername');
const loginPassword  = document.getElementById('loginPassword');
const signupUsername = document.getElementById('signupUsername');
const signupPassword = document.getElementById('signupPassword');

let pfpContainers  = null;
let uploadPFPButton = null;

// ============================================
// 2. UI STATE
// ============================================

let selectedPFP     = null;
let uploadedPFPFile = null;
let signupInFlight  = false;

// ============================================
// 3. VIEW TOGGLE (LOGIN/SIGNUP)
// ============================================

function setActiveView(view) {
  if (view === 'login') {
    loginToggle.classList.add('active');
    signupToggle.classList.remove('active');
    loginInputs.style.display  = 'flex';
    signupInputs.style.display = 'none';
    pfpSelection.style.display = 'none';
  } else {
    signupToggle.classList.add('active');
    loginToggle.classList.remove('active');
    loginInputs.style.display  = 'none';
    signupInputs.style.display = 'flex';
    pfpSelection.style.display = 'flex';
  }
}

function initializeViews() {
  loginToggle.addEventListener('click',  () => setActiveView('login'));
  signupToggle.addEventListener('click', () => setActiveView('signup'));
  setActiveView('login');
}

// ============================================
// 4. PFP SELECTION AND UPLOAD
// ============================================

function initializePFPSelection() {
  pfpContainers   = document.querySelectorAll('.pfp-container');
  uploadPFPButton = document.getElementById('uploadPFPButton');

  pfpContainers.forEach(container => {
    container.addEventListener('click', function () {
      // Deselect all and freeze the previously selected animated frame
      deselectPFPContainers();
      uploadPFPButton.classList.remove('selected');

      this.classList.add('selected');
      this.querySelector('img')?.classList.add('pfp-playing'); // keep playing when selected
      selectedPFP     = this.dataset.pfp;
      uploadedPFPFile = null;
    });
  });
}

function initializePFPUpload() {
  uploadPFPButton = document.getElementById('uploadPFPButton');

  uploadPFPButton.addEventListener('click', () => pfpUpload.click());

  pfpUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const pfpError = getPfpValidationError(file);
    if (pfpError) {
      alert(pfpError);
      pfpUpload.value = '';
      return;
    }

    // Deselect grid items
    deselectPFPContainers();

    uploadPFPButton.classList.add('selected');
    uploadPFPButton.innerHTML = '<span>✓</span>';
    selectedPFP     = null;
    uploadedPFPFile = file;
  });
}

// ============================================
// 5. FORM VALIDATION
// ============================================

function validateLoginForm() {
  if (!loginUsername.value.trim()) { alert('Please enter a username'); return false; }
  if (!loginPassword.value)        { alert('Please enter a password'); return false; }
  return true;
}

function validateSignupForm() {
  const u = signupUsername.value.trim();
  if (!u || u.length > 12)    { alert('Username must be 1–12 characters'); return false; }
  if (!signupPassword.value)  { alert('Please enter a password'); return false; }
  if (signupPassword.value.length < 6) { alert('Password must be at least 6 characters'); return false; }
  if (!selectedPFP && !uploadedPFPFile) { alert('Please select or upload a profile picture'); return false; }
  if (uploadedPFPFile) {
    const pfpError = getPfpValidationError(uploadedPFPFile);
    if (pfpError) { alert(pfpError); return false; }
  }
  return true;
}

// ============================================
// 6. LOGIN FLOW
// ============================================

async function handleLogin() {
  if (!validateLoginForm()) return;
  const username = loginUsername.value.trim();
  const password = loginPassword.value;

  try {
    const { data, error } = await api.auth.signIn({ username, password });
    if (error) throw new Error(String(error));

    window.location.href = `./main.html${window.location.search}`;
  } catch (error) {
    console.error('Login error:', error.message);
    alert(`Login failed: ${error.message}`);
  }
}

// ============================================
// 7. SIGNUP FLOW
// ============================================

async function handleSignup() {
  if (signupInFlight) return;
  if (!validateSignupForm()) return;

  signupInFlight = true;
  const username = signupUsername.value.trim();
  const password = signupPassword.value;

  // Track created resources so we can roll back partial work on failure.
  let createdUserId = null;
  let insertedUserRow = false;

  const setSignupUIBusy = (busy) => {
    signupToggle.disabled = busy;
    loginToggle.disabled = busy;
    signupUsername.disabled = busy;
    signupPassword.disabled = busy;
    if (pfpUpload) pfpUpload.disabled = busy;
    if (uploadPFPButton) uploadPFPButton.style.pointerEvents = busy ? 'none' : '';
    if (pfpContainers) {
      pfpContainers.forEach(container => {
        container.style.pointerEvents = busy ? 'none' : '';
      });
    }
  };

  const rollbackSignupArtifacts = async () => {
    if (insertedUserRow && createdUserId) {
      // Best-effort: nothing client-side can clean up server rows without an
      // authenticated delete endpoint — log for manual cleanup if needed.
      console.warn('Rollback warning: partial signup for user id', createdUserId);
    }
  };

  try {
    setSignupUIBusy(true);

    // Quick pre-check for a friendlier message (DB unique index is still authoritative).
    const { data: existing, error: lookupErr } = await api.users.getByUsername(username);
    if (lookupErr) throw new Error(String(lookupErr));
    if (existing) { alert('Username already taken'); return; }

    // Step 1: create the account first so we have a userId for the pfp filename.
    const { data: signUpData, error: signUpErrMsg } = await api.auth.signUp({
      username,
      password,
      pfp: selectedPFP || null,
    });
    if (signUpErrMsg) {
      const normalizedMessage = String(signUpErrMsg).toLowerCase();
      if (normalizedMessage.includes('already')) {
        throw new Error('Username already taken');
      }
      throw new Error(String(signUpErrMsg));
    }
    if (!signUpData?.user?.id) {
      throw new Error('Signup failed: user account was not created.');
    }

    const userId = signUpData.user.id;
    createdUserId = userId;
    insertedUserRow = true;

    // Step 2: upload custom pfp if provided, then update profile with pfp_url.
    let pfpURL = null;
    if (uploadedPFPFile) {
      const { data: uploadData, error: upErr } = await api.auth.uploadPfp(uploadedPFPFile);
      if (upErr) {
        // Non-fatal: continue signup without the uploaded pfp.
        console.warn('PFP upload failed, continuing without it:', upErr);
      } else {
        pfpURL = uploadData?.url || null;
      }
    }

    // If pfp was uploaded, patch the stored user record with the pfp_url so the
    // rest of the app picks it up immediately after redirect.
    if (pfpURL) {
      const storedUser = JSON.parse(localStorage.getItem('auth_user') || '{}');
      storedUser.pfp_url = pfpURL;
      localStorage.setItem('auth_user', JSON.stringify(storedUser));
    }

    window.location.href = `./main.html${window.location.search}`;
  } catch (error) {
    await rollbackSignupArtifacts();
    console.error('Signup error:', error.message);
    alert(`Signup failed: ${error.message}`);
  } finally {
    setSignupUIBusy(false);
    signupInFlight = false;
  }
}

// ============================================
// 8. KEYBOARD SUBMISSION
// ============================================

function handleEnterKey(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (loginToggle.classList.contains('active')) handleLogin();
  else handleSignup();
}

function initializeFormSubmission() {
  document.querySelectorAll('input').forEach(input => {
    input.addEventListener('keydown', handleEnterKey);
  });
}

// ============================================
// 9. APP BOOTSTRAP
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  installPrettyAlerts({ baseUrl: import.meta.env.BASE_URL });

  document.documentElement.style.setProperty(
    '--bg-url',
    `url(${import.meta.env.BASE_URL}images/background.jpg)`
  );

  loadPFPGrid();
  initializeViews();
  initializePFPSelection();
  initializePFPUpload();
  initializeFormSubmission();
  applyLandingWorldTheme(getLandingWorldId()).catch((error) => {
    console.warn('Failed to apply landing world theme:', error);
  });
});