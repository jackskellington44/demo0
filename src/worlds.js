import JSZip from 'jszip';

const WORLD_TRIGGER = 'world';
const WORLD_BUCKET = 'worlds';
const WORLD_QUERY_PARAM = 'world';
const MY_WORLDS_STORAGE_PREFIX = 'demo0-my-worlds-v1';
const WORLD_GUEST_ACCESS_STORAGE_PREFIX = 'demo0-world-guest-access-v1';
const MY_WORLDS_LIMIT = 48;
const MAIN_WORLD_LABEL = '4thworld';
const DEFAULT_LOADER_TINT = '23, 27, 34';
const DEFAULT_UI_COLOR = '#cfd8e3';
const DEFAULT_WORLD_TITLE = 'untitled world';
const DEFAULT_WORLD_DESCRIPTION = 'No description yet.';
const WORLD_BG_MAX_WIDTH = 2560;
const WORLD_BG_MAX_HEIGHT = 1440;
const WORLD_BG_TARGET_TYPE = 'image/webp';
const WORLD_BG_TARGET_QUALITY = 0.82;
const WORLD_COVER_MAX_WIDTH = 640;
const WORLD_COVER_MAX_HEIGHT = 640;
const WORLD_COVER_TARGET_TYPE = 'image/webp';
const WORLD_COVER_TARGET_QUALITY = 0.74;
const WORLD_COVER_MAX_STATIC_BYTES = 2 * 1024 * 1024;
const WORLD_COVER_MAX_SOURCE_BYTES = 20 * 1024 * 1024;

const WORLD_COVER_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif'
]);

const WORLD_FONTS = [
  { value: '', label: 'site default' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Trebuchet MS, sans-serif', label: 'Trebuchet' },
  { value: 'Palatino Linotype, serif', label: 'Palatino' },
  { value: 'Courier New, monospace', label: 'Courier New' }
];

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeStorageName(fileName = 'asset') {
  return String(fileName)
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '') || 'asset';
}

function getErrorMessage(error, fallback = 'Unknown error.') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (error instanceof Error && error.message) return error.message;

  const detail = [error.message, error.error_description, error.details, error.hint]
    .map((value) => String(value || '').trim())
    .find(Boolean);

  if (detail) return detail;

  const code = String(error.code || error.status || '').trim();
  if (code) {
    return `Request failed (${code}).`;
  }

  return fallback;
}

function getFileExtension(fileName = '') {
  const parts = String(fileName || '').split('.');
  return parts.length > 1 ? String(parts.pop() || '').toLowerCase() : '';
}

function guessFileExtensionFromMime(mime = '') {
  const normalized = String(mime || '').toLowerCase();
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/avif') return 'avif';
  if (normalized === 'image/gif') return 'gif';
  if (normalized === 'image/heic') return 'heic';
  if (normalized === 'image/heif') return 'heif';
  return 'jpg';
}

function guessMimeFromFileName(fileName = '') {
  const ext = getFileExtension(fileName);
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'heif') return 'image/heif';
  return '';
}

function getFileNameFromUrl(url, fallbackBase = 'background') {
  try {
    const parsed = new URL(String(url || ''), window.location.origin);
    const lastSegment = parsed.pathname.split('/').pop() || '';
    const safe = normalizeStorageName(lastSegment);
    if (safe && safe !== 'asset') return safe;
  } catch {
    // Ignore parse failures; fallback below.
  }

  return `${fallbackBase}.jpg`;
}

function clampImageDimensions(width, height, maxWidth, maxHeight) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const scale = Math.min(1, maxWidth / safeWidth, maxHeight / safeHeight);
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale))
  };
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image for optimization.'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to encode optimized image.'));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });
}

function isRateLimitedError(error) {
  if (!error) return false;
  const status = Number(error.status || error.code || 0);
  if (status === 429) return true;

  const message = getErrorMessage(error, '').toLowerCase();
  return message.includes('too many requests')
    || message.includes('rate limit')
    || message.includes('status 429')
    || message.includes('http 429');
}

async function withRateLimitRetry(task, options = {}) {
  const {
    retries = 4,
    baseDelayMs = 500,
    maxDelayMs = 6000
  } = options;

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isRateLimitedError(error)) {
        throw error;
      }

      const backoff = Math.min(maxDelayMs, baseDelayMs * (2 ** attempt));
      const jitter = Math.floor(Math.random() * 180);
      await sleep(backoff + jitter);
    }
  }

  throw lastError || new Error('Request failed after retries.');
}

async function normalizeWorldImageFile(file) {
  const mime = String(file?.type || '').toLowerCase();
  const ext = getFileExtension(file?.name || '');
  if (mime === 'image/heic' || mime === 'image/heif' || ext === 'heic' || ext === 'heif') {
    const heic2anyModule = await import('heic2any');
    const heic2any = heic2anyModule.default || heic2anyModule;
    const converted = await heic2any({
      blob: file,
      toType: 'image/jpeg'
    });
    const convertedBlob = Array.isArray(converted) ? converted[0] : converted;
    const baseName = String(file.name || 'background').replace(/\.[^.]+$/, '');
    return new File([convertedBlob], `${baseName}.jpg`, { type: 'image/jpeg' });
  }

  return file;
}

async function optimizeWorldImageToWebp(file, options = {}) {
  const {
    maxWidth,
    maxHeight,
    targetType,
    targetQuality,
    maxOutputBytes = Infinity
  } = options;

  const decoded = await loadImageFromBlob(file);
  const { width, height } = clampImageDimensions(
    decoded.naturalWidth || decoded.width,
    decoded.naturalHeight || decoded.height,
    maxWidth,
    maxHeight
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return file;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(decoded, 0, 0, width, height);

  const qualitySteps = [
    targetQuality,
    Math.max(0.68, targetQuality - 0.06),
    Math.max(0.62, targetQuality - 0.12),
    Math.max(0.55, targetQuality - 0.18),
    Math.max(0.48, targetQuality - 0.24)
  ];

  let optimizedBlob = null;
  for (const quality of qualitySteps) {
    const candidate = await canvasToBlob(canvas, targetType, quality);
    optimizedBlob = candidate;
    if ((candidate?.size || 0) <= maxOutputBytes) {
      break;
    }
  }

  if (!optimizedBlob) {
    throw new Error('Failed to optimize image output.');
  }

  const baseName = String(file.name || 'image').replace(/\.[^.]+$/, '');
  return new File([optimizedBlob], `${baseName}.webp`, { type: targetType });
}

async function optimizeWorldBackgroundImage(file) {
  if (!file) return null;

  const normalizedFile = await normalizeWorldImageFile(file);
  return optimizeWorldImageToWebp(normalizedFile, {
    maxWidth: WORLD_BG_MAX_WIDTH,
    maxHeight: WORLD_BG_MAX_HEIGHT,
    targetType: WORLD_BG_TARGET_TYPE,
    targetQuality: WORLD_BG_TARGET_QUALITY
  });
}

function getWorldCardCoverUrl(world, baseUrl) {
  return String(world?.cover_url || world?.background_url || '').trim() || getDefaultBackgroundUrl(baseUrl);
}

function getOptimizedWorldCardCoverUrl(coverUrl) {
  const normalized = String(coverUrl || '').trim();
  if (!normalized) return normalized;

  try {
    const parsed = new URL(normalized, window.location.origin);
    if (!parsed.pathname.includes('/storage/v1/object/public/')) {
      return normalized;
    }

    parsed.pathname = parsed.pathname.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
    parsed.searchParams.set('width', '640');
    parsed.searchParams.set('height', '640');
    parsed.searchParams.set('resize', 'cover');
    parsed.searchParams.set('quality', '70');
    parsed.searchParams.set('format', 'origin');
    return parsed.toString();
  } catch {
    return normalized;
  }
}

function getOptimizedWorldLoaderBackdropUrl(backgroundUrl) {
  const normalized = String(backgroundUrl || '').trim();
  if (!normalized) return normalized;

  try {
    const parsed = new URL(normalized, window.location.origin);
    if (!parsed.pathname.includes('/storage/v1/object/public/')) {
      return normalized;
    }

    parsed.pathname = parsed.pathname.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
    parsed.searchParams.set('width', '96');
    parsed.searchParams.set('height', '96');
    parsed.searchParams.set('resize', 'cover');
    parsed.searchParams.set('quality', '18');
    parsed.searchParams.set('format', 'origin');
    return parsed.toString();
  } catch {
    return normalized;
  }
}

function getOptimizedWorldLoaderCoverUrl(coverUrl) {
  const normalized = String(coverUrl || '').trim();
  if (!normalized) return normalized;

  try {
    const parsed = new URL(normalized, window.location.origin);
    if (!parsed.pathname.includes('/storage/v1/object/public/')) {
      return normalized;
    }

    parsed.pathname = parsed.pathname.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
    parsed.searchParams.set('width', '420');
    parsed.searchParams.set('height', '420');
    parsed.searchParams.set('resize', 'cover');
    parsed.searchParams.set('quality', '72');
    parsed.searchParams.set('format', 'origin');
    return parsed.toString();
  } catch {
    return normalized;
  }
}

const loaderTintCache = new Map();

function clampColorChannel(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

function toRgbTripletString(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const hexMatch = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return hex.split('').map((char) => parseInt(`${char}${char}`, 16)).join(', ');
    }
    return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16)).join(', ');
  }

  const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').slice(0, 3).map((part) => clampColorChannel(part.trim()));
    if (parts.length === 3) return parts.join(', ');
  }

  return '';
}

function setWorldLoaderTint(loaderOverlay, tintValue = '') {
  if (!loaderOverlay) return;
  const nextTint = toRgbTripletString(tintValue) || DEFAULT_LOADER_TINT;
  loaderOverlay.style.setProperty('--world-loader-tint', nextTint);
}

async function sampleLoaderTintFromImage(imageUrl) {
  const normalizedUrl = String(imageUrl || '').trim();
  if (!normalizedUrl) return '';
  if (loaderTintCache.has(normalizedUrl)) {
    return loaderTintCache.get(normalizedUrl) || '';
  }

  const sampled = await new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const width = Math.max(1, Math.min(16, img.naturalWidth || img.width || 1));
        const height = Math.max(1, Math.min(16, img.naturalHeight || img.height || 1));
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve('');
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const data = ctx.getImageData(0, 0, width, height).data;
        const pixelCount = Math.max(1, data.length / 4);
        const startIndex = Math.floor(Math.random() * pixelCount) * 4;
        const red = clampColorChannel(data[startIndex]);
        const green = clampColorChannel(data[startIndex + 1]);
        const blue = clampColorChannel(data[startIndex + 2]);
        resolve(`${red}, ${green}, ${blue}`);
      } catch {
        resolve('');
      }
    };
    img.onerror = () => resolve('');
    img.src = normalizedUrl;
  });

  loaderTintCache.set(normalizedUrl, sampled || '');
  return sampled || '';
}

function syncWorldLoaderTint(loaderOverlay, backgroundUrl, fallbackTint = '') {
  const backdropUrl = getOptimizedWorldLoaderBackdropUrl(backgroundUrl);
  const fallback = toRgbTripletString(fallbackTint) || DEFAULT_LOADER_TINT;
  setWorldLoaderTint(loaderOverlay, fallback);

  if (!loaderOverlay || !backdropUrl) return;

  loaderOverlay.dataset.loaderTintKey = backdropUrl;
  sampleLoaderTintFromImage(backdropUrl)
    .then((sampledTint) => {
      if (!sampledTint) return;
      if (loaderOverlay?.dataset.loaderTintKey !== backdropUrl) return;
      setWorldLoaderTint(loaderOverlay, sampledTint);
    })
    .catch(() => {
      // Fallback tint already applied.
    });
}

function getGuestWorldAccessStorageKey(worldId) {
  return `${WORLD_GUEST_ACCESS_STORAGE_PREFIX}:${String(worldId || '').trim()}`;
}

function hasGuestWorldAccess(worldId) {
  const storageKey = getGuestWorldAccessStorageKey(worldId);
  if (!storageKey || storageKey.endsWith(':')) return false;

  try {
    return window.localStorage.getItem(storageKey) === '1';
  } catch {
    return false;
  }
}

function rememberGuestWorldAccess(worldId, unlocked = true) {
  const storageKey = getGuestWorldAccessStorageKey(worldId);
  if (!storageKey || storageKey.endsWith(':')) return;

  try {
    if (unlocked) {
      window.localStorage.setItem(storageKey, '1');
    } else {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // Ignore storage errors.
  }
}

async function optimizeWorldCoverImage(file) {
  if (!file) return null;

  const normalizedMime = String(file.type || '').toLowerCase();
  const normalizedExt = getFileExtension(file.name || '');
  const looksHeicLike = normalizedMime === 'image/heic' || normalizedMime === 'image/heif' || normalizedExt === 'heic' || normalizedExt === 'heif';

  if (!looksHeicLike && normalizedMime && !WORLD_COVER_ALLOWED_MIME_TYPES.has(normalizedMime)) {
    throw new Error('World cover must be JPEG, PNG, GIF, WEBP, HEIC, or HEIF.');
  }

  if ((file.size || 0) > WORLD_COVER_MAX_SOURCE_BYTES) {
    throw new Error('World cover source file is too large. Use a file under 20 MB.');
  }

  const normalizedFile = await normalizeWorldImageFile(file);

  const optimized = await optimizeWorldImageToWebp(normalizedFile, {
    maxWidth: WORLD_COVER_MAX_WIDTH,
    maxHeight: WORLD_COVER_MAX_HEIGHT,
    targetType: WORLD_COVER_TARGET_TYPE,
    targetQuality: WORLD_COVER_TARGET_QUALITY,
    maxOutputBytes: WORLD_COVER_MAX_STATIC_BYTES
  });

  if (optimized.size > WORLD_COVER_MAX_STATIC_BYTES) {
    throw new Error('World cover is too large after optimization. Use an image that can compress below 2 MB.');
  }

  return optimized;
}

function isTypingSurface(target = document.activeElement) {
  if (!target) return false;
  const tag = target.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target.isContentEditable;
}

function getDefaultBackgroundUrl(baseUrl) {
  return `${baseUrl}images/background.jpg`;
}

function getPfpSrc(user, baseUrl) {
  const fallback = `${baseUrl}images/pfps/default.png`;
  if (!user) return fallback;
  return user.pfp_url || (user.pfp ? `${baseUrl}images/pfps/${user.pfp}` : fallback);
}

function getWorldAccent(world) {
  return String(world?.ui_color || world?.font_color || DEFAULT_UI_COLOR).trim() || DEFAULT_UI_COLOR;
}

function applyWorldTitleMarquee(titleEl, trackEl, separator = '\u00A0\u00A0') {
  if (!titleEl || !trackEl) return;

  requestAnimationFrame(() => {
    if (trackEl.scrollWidth <= titleEl.clientWidth) return;

    const originalText = trackEl.textContent;
    trackEl.textContent = `${originalText}${separator}${originalText}`;

    requestAnimationFrame(() => {
      const totalWidth = trackEl.scrollWidth;
      if (totalWidth <= 0) return;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const style = getComputedStyle(trackEl);
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

      const firstHalfWidth = ctx.measureText(`${originalText}${separator}`).width;
      const pct = (firstHalfWidth / totalWidth) * 100;
      trackEl.style.setProperty('--marquee-end-pct', `-${pct.toFixed(3)}%`);
      titleEl.classList.add('is-marquee');
    });
  });
}

function createWorldsDom(baseUrl) {
  const host = document.createElement('div');
  host.id = 'worldsFeatureHost';
  host.innerHTML = `
    <div class="world-maker-overlay" id="worldMakerOverlay" style="display:none;">
      <div class="world-maker-modal" id="worldMakerModal">
        <button type="button" class="world-maker-close" id="worldMakerClose" aria-label="close world maker">×</button>
        <div class="world-maker-shell" id="worldMakerShell" data-step="mode">
          <section class="world-maker-step is-active" data-step-panel="mode">
            <div class="world-maker-kicker">world maker</div>
            <h2 class="world-maker-title">choose your mode</h2>
            <p class="world-maker-copy">Plug &amp; Play reskins the existing world layout. Full Coding lets you upload custom HTML and CSS into a sandboxed iframe.</p>
            <div class="world-maker-mode-grid">
              <button type="button" class="world-maker-mode-btn" id="worldModePlugBtn">
                <span class="world-maker-mode-title">plug &amp; play</span>
                <span class="world-maker-mode-copy">name, description, category, optional background and typography.</span>
              </button>
              <button type="button" class="world-maker-mode-btn" id="worldModeCodeBtn">
                <span class="world-maker-mode-title">full coding</span>
                <span class="world-maker-mode-copy">download the scaffold, customize it offline, then upload your world files.</span>
              </button>
            </div>
          </section>

          <section class="world-maker-step" data-step-panel="plug">
            <div class="world-maker-kicker">plug &amp; play</div>
            <h2 class="world-maker-title">build a reskinned world</h2>
            <div class="world-maker-form-grid">
              <label class="world-maker-field">
                <span>world name</span>
                <input type="text" id="worldPlugName" maxlength="80" autocomplete="off">
              </label>
              <label class="world-maker-field world-maker-field--wide">
                <span>description</span>
                <textarea id="worldPlugDescription" rows="4" maxlength="500"></textarea>
              </label>
              <label class="world-maker-field">
                <span>category</span>
                <select id="worldPlugCategory"></select>
              </label>
              <label class="world-maker-field">
                <span>font choice</span>
                <select id="worldPlugFont"></select>
              </label>
              <label class="world-maker-field">
                <span>font color</span>
                <input type="color" id="worldPlugFontColor" value="#f5f5f5">
              </label>
              <label class="world-maker-field">
                <span>world cover</span>
                <label class="world-maker-upload">
                  <span id="worldPlugCoverLabel">use world background as cover</span>
                  <input type="file" id="worldPlugCover" accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.heic,.heif">
                </label>
              </label>
              <label class="world-maker-field">
                <span>background image</span>
                <label class="world-maker-upload">
                  <span id="worldPlugBackgroundLabel">use site background</span>
                  <input type="file" id="worldPlugBackground" accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.heic,.heif">
                </label>
              </label>
              <label class="world-maker-field">
                <span>who can view</span>
                <select id="worldPlugVisibility">
                  <option value="true">public — anyone</option>
                  <option value="false">private — only me</option>
                </select>
              </label>
              <label class="world-maker-field">
                <span>who can post</span>
                <select id="worldPlugEditing">
                  <option value="true">public — anyone</option>
                  <option value="false">private — only me</option>
                </select>
              </label>
              <label class="world-maker-field">
                <span>world password</span>
                <input type="password" id="worldPlugPassword" autocomplete="new-password" placeholder="optional">
              </label>
              <label class="world-maker-field">
                <span>update preference</span>
                <select id="worldPlugUpdateMode">
                  <option value="auto">auto-update</option>
                  <option value="manual">manual update</option>
                </select>
              </label>
            </div>
            <div class="world-maker-actions">
              <button type="button" class="world-maker-secondary" id="worldPlugBack">back</button>
              <button type="button" class="world-maker-primary" id="worldPlugPublish">publish world</button>
            </div>
          </section>

          <section class="world-maker-step" data-step-panel="code">
            <div class="world-maker-kicker">full coding</div>
            <h2 class="world-maker-title">upload custom files</h2>
            <p class="world-maker-copy">The iframe is sandboxed and cannot talk to Supabase or the parent page. Your uploaded HTML should reference <strong>world.css</strong> from the same folder.</p>
            <div class="world-maker-form-grid">
              <div class="world-maker-field world-maker-field--wide">
                <span>template</span>
                <button type="button" class="world-maker-secondary world-maker-download" id="worldCodeDownload">download template zip</button>
              </div>
              <label class="world-maker-field">
                <span>world.html</span>
                <label class="world-maker-upload">
                  <span id="worldCodeHtmlLabel">choose html</span>
                  <input type="file" id="worldCodeHtml" accept=".html,text/html">
                </label>
              </label>
              <label class="world-maker-field">
                <span>world.css</span>
                <label class="world-maker-upload">
                  <span id="worldCodeCssLabel">choose css</span>
                  <input type="file" id="worldCodeCss" accept=".css,text/css">
                </label>
              </label>
              <label class="world-maker-field">
                <span>world name</span>
                <input type="text" id="worldCodeName" maxlength="80" autocomplete="off" placeholder="world name">
              </label>
              <label class="world-maker-field world-maker-field--wide">
                <span>description</span>
                <textarea id="worldCodeDescription" rows="4" maxlength="500" placeholder="describe the world"></textarea>
              </label>
              <label class="world-maker-field">
                <span>category</span>
                <select id="worldCodeCategory"></select>
              </label>
              <label class="world-maker-field">
                <span>who can view</span>
                <select id="worldCodeVisibility">
                  <option value="true">public — anyone</option>
                  <option value="false">private — only me</option>
                </select>
              </label>
              <label class="world-maker-field">
                <span>who can post</span>
                <select id="worldCodeEditing">
                  <option value="true">public — anyone</option>
                  <option value="false">private — only me</option>
                </select>
              </label>
              <label class="world-maker-field">
                <span>world password</span>
                <input type="password" id="worldCodePassword" autocomplete="new-password" placeholder="optional">
              </label>
            </div>
            <div class="world-maker-actions">
              <button type="button" class="world-maker-secondary" id="worldCodeBack">back</button>
              <button type="button" class="world-maker-primary" id="worldCodePublish">publish world</button>
            </div>
          </section>
        </div>
        <button type="button" class="world-maker-danger" id="worldMakerDelete" style="display:none;">delete world</button>
      </div>
    </div>

    <div class="world-mode-chrome" id="worldModeChrome" style="display:none;">
      <div class="world-mode-nav-bar" id="worldModeNavBar">
        <nav class="world-mode-breadcrumbs" id="worldModeTabs" aria-label="world navigation"></nav>
      </div>
      <div class="world-mode-myworlds-menu" id="worldModeMyWorldsMenu" style="display:none;"></div>
      <button type="button" class="world-mode-recompress" id="worldModeRecompress" style="display:none;">recompress covers</button>
      <button type="button" class="view-toggle world-mode-edit-toggle" id="worldModeEdit" style="display:none;">edit world</button>
      <button type="button" class="world-mode-delete" id="worldModeDelete" style="display:none;">delete</button>
      <div class="world-mode-pfp-wrap">
        <img id="worldModePfp" class="world-mode-pfp" src="${baseUrl}images/pfps/default.png" alt="">
      </div>
      <div class="world-mode-identity-panel">
        <div class="world-mode-name" id="worldModeName"></div>
        <div class="world-mode-description" id="worldModeDescription"></div>
      </div>
      <iframe id="worldModeFrame" class="world-mode-frame" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer" style="display:none;"></iframe>
    </div>

    <div class="world-loader-overlay" id="worldLoaderOverlay" data-mode="loading" style="display:none;">
      <div class="world-loader-backdrop" id="worldLoaderBackdrop"></div>
      <div class="world-loader-wash" id="worldLoaderWash"></div>

      <div class="world-loader-copy">
        <div class="world-loader-kicker" id="worldLoaderKicker">world</div>
        <h2 class="world-loader-title" id="worldLoaderTitle">untitled world</h2>
        <div class="world-loader-meta" id="worldLoaderMeta">by unknown</div>
        <p class="world-loader-description" id="worldLoaderDescription">No description yet.</p>
        <div class="world-loader-status" id="worldLoaderStatusWrap">
          <div class="world-loader-progress" aria-hidden="true">
            <span class="world-loader-progress-bar"></span>
          </div>
          <div class="world-loader-status-text" id="worldLoaderStatus">loading world...</div>
        </div>
      </div>

      <div class="world-loader-cover-shell" id="worldLoaderCoverShell">
        <img class="world-loader-cover" id="worldLoaderCover" src="${baseUrl}images/background.jpg" alt="">
      </div>

      <div class="world-password-panel" id="worldPasswordPanel">
        <div class="world-password-kicker">password required</div>
        <h2 class="world-password-title" id="worldPasswordTitle">unlock this world</h2>
        <p class="world-password-copy" id="worldPasswordCopy">Enter the world password to continue.</p>
        <label class="world-password-field">
          <span>Password</span>
          <input type="password" id="worldPasswordInput" autocomplete="current-password" spellcheck="false">
        </label>
        <div class="world-password-error" id="worldPasswordError" aria-live="polite"></div>
        <div class="world-password-actions">
          <button type="button" class="world-password-secondary" id="worldPasswordCancel">cancel</button>
          <button type="button" class="world-password-primary" id="worldPasswordSubmit">unlock</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(host);
  return {
    makerOverlay: host.querySelector('#worldMakerOverlay'),
    makerShell: host.querySelector('#worldMakerShell'),
    makerClose: host.querySelector('#worldMakerClose'),
    plugName: host.querySelector('#worldPlugName'),
    plugDescription: host.querySelector('#worldPlugDescription'),
    plugCategory: host.querySelector('#worldPlugCategory'),
    plugFont: host.querySelector('#worldPlugFont'),
    plugFontColor: host.querySelector('#worldPlugFontColor'),
    plugCover: host.querySelector('#worldPlugCover'),
    plugCoverLabel: host.querySelector('#worldPlugCoverLabel'),
    plugBackground: host.querySelector('#worldPlugBackground'),
    plugBackgroundLabel: host.querySelector('#worldPlugBackgroundLabel'),
    plugVisibility: host.querySelector('#worldPlugVisibility'),
    plugEditing: host.querySelector('#worldPlugEditing'),
    plugPassword: host.querySelector('#worldPlugPassword'),
    plugUpdateMode: host.querySelector('#worldPlugUpdateMode'),
    plugBack: host.querySelector('#worldPlugBack'),
    plugPublish: host.querySelector('#worldPlugPublish'),
    codeHtml: host.querySelector('#worldCodeHtml'),
    codeCss: host.querySelector('#worldCodeCss'),
    codeHtmlLabel: host.querySelector('#worldCodeHtmlLabel'),
    codeCssLabel: host.querySelector('#worldCodeCssLabel'),
    codeName: host.querySelector('#worldCodeName'),
    codeDescription: host.querySelector('#worldCodeDescription'),
    codeCategory: host.querySelector('#worldCodeCategory'),
    codeVisibility: host.querySelector('#worldCodeVisibility'),
    codeEditing: host.querySelector('#worldCodeEditing'),
    codePassword: host.querySelector('#worldCodePassword'),
    codeBack: host.querySelector('#worldCodeBack'),
    codePublish: host.querySelector('#worldCodePublish'),
    codeDownload: host.querySelector('#worldCodeDownload'),
    modePlugBtn: host.querySelector('#worldModePlugBtn'),
    modeCodeBtn: host.querySelector('#worldModeCodeBtn'),
    modeChrome: host.querySelector('#worldModeChrome'),
    modeNavBar: host.querySelector('#worldModeNavBar'),
    modeTabs: host.querySelector('#worldModeTabs'),
    modeMyWorldsMenu: host.querySelector('#worldModeMyWorldsMenu'),
    modeRecompress: host.querySelector('#worldModeRecompress'),
    modeEdit: host.querySelector('#worldModeEdit'),
    modeDelete: host.querySelector('#worldModeDelete'),
    modePfpWrap: host.querySelector('.world-mode-pfp-wrap'),
    modePfp: host.querySelector('#worldModePfp'),
    modeIdentityPanel: host.querySelector('.world-mode-identity-panel'),
    modeName: host.querySelector('#worldModeName'),
    modeDescription: host.querySelector('#worldModeDescription'),
    modeFrame: host.querySelector('#worldModeFrame'),
    loaderOverlay: host.querySelector('#worldLoaderOverlay'),
    loaderBackdrop: host.querySelector('#worldLoaderBackdrop'),
    loaderWash: host.querySelector('#worldLoaderWash'),
    loaderKicker: host.querySelector('#worldLoaderKicker'),
    loaderTitle: host.querySelector('#worldLoaderTitle'),
    loaderMeta: host.querySelector('#worldLoaderMeta'),
    loaderDescription: host.querySelector('#worldLoaderDescription'),
    loaderStatusWrap: host.querySelector('#worldLoaderStatusWrap'),
    loaderStatus: host.querySelector('#worldLoaderStatus'),
    loaderCoverShell: host.querySelector('#worldLoaderCoverShell'),
    loaderCover: host.querySelector('#worldLoaderCover'),
    passwordOverlay: host.querySelector('#worldLoaderOverlay'),
    passwordModal: host.querySelector('#worldPasswordPanel'),
    passwordTitle: host.querySelector('#worldPasswordTitle'),
    passwordCopy: host.querySelector('#worldPasswordCopy'),
    passwordInput: host.querySelector('#worldPasswordInput'),
    passwordError: host.querySelector('#worldPasswordError'),
    passwordCancel: host.querySelector('#worldPasswordCancel'),
    passwordSubmit: host.querySelector('#worldPasswordSubmit'),
    makerDelete: host.querySelector('#worldMakerDelete')
  };
}

async function buildTemplateZip() {
  const zip = new JSZip();
  zip.file('world.html', `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>world</title>
  <link rel="stylesheet" href="./world.css">
</head>
<body>
  <main class="world-root">
    <section class="hero">
      <p class="eyebrow">custom world</p>
      <h1>hello world</h1>
      <p>Edit this file and re-upload it with world.css. This page runs inside a sandboxed iframe.</p>
    </section>
  </main>
</body>
</html>
`);
  zip.file('world.css', `:root {
  color-scheme: dark;
  --bg-a: #10121a;
  --bg-b: #1d3142;
  --fg: #eef2ff;
  --muted: rgba(238, 242, 255, 0.72);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: Georgia, serif;
  color: var(--fg);
  background:
    radial-gradient(circle at top, rgba(255,255,255,0.08), transparent 40%),
    linear-gradient(135deg, var(--bg-a), var(--bg-b));
}

.world-root {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 48px 24px;
}

.hero {
  width: min(720px, 100%);
}

.eyebrow {
  margin: 0 0 12px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--muted);
  font-size: 0.72rem;
}

h1 {
  margin: 0 0 16px;
  font-size: clamp(2.5rem, 8vw, 5rem);
}

p {
  margin: 0;
  max-width: 48ch;
  line-height: 1.6;
}
`);
  zip.file('README.txt', `World sandbox notes

- Your custom world runs inside an iframe with sandbox="allow-scripts allow-same-origin".
- It cannot access the main app UI or Supabase client from the parent page.
- Keep asset references relative to this folder when possible.
- The app will publish world.html and world.css into your world's storage folder.
`);

  return zip.generateAsync({ type: 'blob' });
}

export function initWorldsFeature(options) {
  const {
    supabase,
    baseUrl,
    getCurrentUser,
    getIsEditMode,
    getCategories,
    onWorldCreated,
    onWorldDeleted,
    onEnterWorld,
    onExitWorld,
    onOpenProfile
  } = options;

  const dom = createWorldsDom(baseUrl);
  let keyBuffer = '';
  let publishInFlight = false;
  let activeWorld = null;
  let activeWorldCreator = null;
  let worldNavStack = [];
  let passwordPromptState = null;
  let makerMode = 'create';
  let makerEditingWorld = null;
  let makerEditingType = 'plug';
  let latestUpdateInfo = null;
  let latestUpdateInfoPromise = null;
  let latestUpdateInfoRetryAt = 0;
  let loadWorldsInFlightPromise = null;
  let loadWorldsInFlightKey = '';
  let myWorldIds = [];
  let myWorldMap = new Map();
  let myWorldsHydrated = false;
  let parentTabAction = async () => {
    await exitWorldMode();
  };

  function getMyWorldStorageKey(userId) {
    return `${MY_WORLDS_STORAGE_PREFIX}:${String(userId || 'guest')}`;
  }

  function dedupeWorldIds(ids = []) {
    const seen = new Set();
    const next = [];
    ids.forEach((id) => {
      const normalized = String(id || '').trim();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      next.push(normalized);
    });
    return next;
  }

  async function loadDirectChildWorlds(parentWorldId) {
    const normalizedParentId = String(parentWorldId || '').trim();
    if (!normalizedParentId) return [];

    const { data, error } = await supabase
      .from('worlds')
      .select('id, parent_world_id, user_id, name')
      .eq('parent_world_id', normalizedParentId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async function loadDescendantWorlds(rootWorldId) {
    const descendants = [];
    let frontier = [String(rootWorldId || '').trim()].filter(Boolean);

    while (frontier.length > 0) {
      const { data, error } = await supabase
        .from('worlds')
        .select('id, parent_world_id, user_id, name')
        .in('parent_world_id', frontier)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const rows = data || [];
      if (!rows.length) break;

      descendants.push(...rows);
      frontier = rows.map((row) => String(row.id || '').trim()).filter(Boolean);
    }

    return descendants;
  }

  async function chooseChildWorldDeleteMode(world, childWorlds = []) {
    if (!childWorlds.length) {
      return 'delete-children';
    }

    const title = String(world?.name || DEFAULT_WORLD_TITLE);
    const childCount = childWorlds.length;
    const message = `${title} contains ${childCount} nested world${childCount === 1 ? '' : 's'}.

Delete contained worlds to remove the full subtree, or move only the direct child worlds to main so they become top-level worlds.`;

    if (typeof window.__prettyChoice === 'function') {
      return window.__prettyChoice({
        title: 'nested worlds detected',
        message,
        cancelLabel: 'cancel',
        choices: [
          { value: 'delete-children', label: 'delete contained worlds', danger: true },
          { value: 'transfer-children', label: 'move child worlds to main' }
        ]
      });
    }

    const shouldDelete = window.confirm(`${message}\n\nPress OK to delete contained worlds, or Cancel to keep them at main.`);
    return shouldDelete ? 'delete-children' : 'transfer-children';
  }

  function readStoredMyWorldIds(userId) {
    if (!userId) return [];
    try {
      const raw = window.localStorage.getItem(getMyWorldStorageKey(userId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return dedupeWorldIds(parsed).slice(0, MY_WORLDS_LIMIT);
    } catch {
      return [];
    }
  }

  function persistMyWorldIds(userId) {
    if (!userId) return;
    try {
      window.localStorage.setItem(getMyWorldStorageKey(userId), JSON.stringify(myWorldIds.slice(0, MY_WORLDS_LIMIT)));
    } catch {
      // Best-effort persistence only.
    }
  }

  function setWorldUrl(worldId) {
    const nextId = String(worldId || '').trim();
    if (!nextId) return;
    const current = new URL(window.location.href);
    if (current.searchParams.get(WORLD_QUERY_PARAM) === nextId) return;

    const next = new URL(window.location.href);
    next.search = '';
    next.searchParams.set(WORLD_QUERY_PARAM, nextId);
    window.history.replaceState(window.history.state, '', `${next.pathname}${next.search}${next.hash}`);
  }

  function clearWorldUrl() {
    const current = new URL(window.location.href);
    if (!current.searchParams.has(WORLD_QUERY_PARAM)) return;

    const next = new URL(window.location.href);
    next.search = '';
    window.history.replaceState(window.history.state, '', `${next.pathname}${next.hash}`);
  }

  async function loadWorldRowsByIds(worldIds = []) {
    const ids = dedupeWorldIds(worldIds);
    if (!ids.length) return [];

    const { data, error } = await supabase
      .from('worlds')
      .select('*')
      .in('id', ids);

    if (error) {
      console.warn('Failed to load remembered worlds:', error);
      return [];
    }

    return data || [];
  }

  async function ensureMyWorldRowsLoaded(worldIds = []) {
    const ids = dedupeWorldIds(worldIds);
    const missing = ids.filter((id) => !myWorldMap.has(id));
    if (!missing.length) return;

    const rows = await loadWorldRowsByIds(missing);
    rows.forEach((row) => {
      if (row?.id) myWorldMap.set(String(row.id), row);
    });
  }

  async function hydrateMyWorlds() {
    if (myWorldsHydrated) return;
    myWorldsHydrated = true;

    const currentUserId = getCurrentUser?.()?.id || null;
    if (!currentUserId) {
      myWorldIds = [];
      myWorldMap = new Map();
      return;
    }

    const storedIds = readStoredMyWorldIds(currentUserId);
    myWorldIds = dedupeWorldIds(storedIds).slice(0, MY_WORLDS_LIMIT);
    await ensureMyWorldRowsLoaded(myWorldIds);
    persistMyWorldIds(currentUserId);
  }

  async function rememberWorld(world) {
    if (!world?.id) return;
    const currentUserId = getCurrentUser?.()?.id || null;
    if (!currentUserId) return;

    const worldId = String(world.id);
    myWorldMap.set(worldId, world);
    myWorldIds = dedupeWorldIds([worldId, ...myWorldIds]).slice(0, MY_WORLDS_LIMIT);
    persistMyWorldIds(currentUserId);
  }

  function pruneRememberedWorld(worldId) {
    const normalized = String(worldId || '').trim();
    if (!normalized) return;
    myWorldMap.delete(normalized);
    myWorldIds = myWorldIds.filter((id) => id !== normalized);
    const currentUserId = getCurrentUser?.()?.id || null;
    persistMyWorldIds(currentUserId);
  }

  function updateWorldNavStack(world) {
    const worldId = String(world?.id || '').trim();
    if (!worldId) return;

    const existingIndex = worldNavStack.findIndex((entry) => String(entry?.id || '') === worldId);
    if (existingIndex >= 0) {
      worldNavStack = worldNavStack.slice(0, existingIndex + 1);
      worldNavStack[existingIndex] = world;
      return;
    }

    worldNavStack = [...worldNavStack, world];
  }

  function renderBreadcrumbBar(entries = []) {
    if (!dom.modeTabs) return;

    dom.modeTabs.innerHTML = '';

    entries.forEach((entry, index) => {
      if (index > 0) {
        const separator = document.createElement('span');
        separator.className = 'world-mode-breadcrumb-separator';
        separator.setAttribute('aria-hidden', 'true');
        separator.textContent = '>';
        dom.modeTabs.appendChild(separator);
      }

      const isCurrent = Boolean(entry?.current);
      const label = String(entry?.label || DEFAULT_WORLD_TITLE);

      if (isCurrent) {
        const current = document.createElement('span');
        current.className = 'world-mode-breadcrumb world-mode-breadcrumb-current';
        current.setAttribute('aria-current', 'page');
        current.textContent = label;
        dom.modeTabs.appendChild(current);
        return;
      }

      const navTarget = String(entry?.navTarget || 'root');
      const worldId = String(entry?.worldId || '').trim();
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'world-mode-breadcrumb';
      button.dataset.worldNav = navTarget;
      button.dataset.worldId = worldId;
      button.textContent = label;
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (navTarget === 'root') {
          showTransitionLoader({
            mode: 'loading',
            kicker: 'main',
            title: MAIN_WORLD_LABEL,
            meta: 'monkey space',
            description: 'Loading the main canvas and bringing everything back into view.',
            status: 'loading main...',
            backgroundUrl: getDefaultBackgroundUrl(baseUrl),
            coverUrl: getDefaultBackgroundUrl(baseUrl),
            showCover: false,
            progress: 8
          });
          await exitWorldMode();
          return;
        }

        if (navTarget === 'crumb' && worldId) {
          await openWorldById(worldId);
        }
      });
      dom.modeTabs.appendChild(button);
    });
  }

  async function renderWorldNavigation(world) {
    clearWorldTabs();

    if (!world || !dom.modeTabs) return;

    parentTabAction = async () => {
      await exitWorldMode();
    };

    const breadcrumbEntries = [
      {
        label: MAIN_WORLD_LABEL,
        navTarget: 'root',
        worldId: '',
        current: false
      },
      ...worldNavStack.map((stackWorld, index) => ({
        label: stackWorld?.name || DEFAULT_WORLD_TITLE,
        navTarget: 'crumb',
        worldId: String(stackWorld?.id || ''),
        current: index === worldNavStack.length - 1
      }))
    ];

    renderBreadcrumbBar(breadcrumbEntries);
  }

  function canUseCustomWorldFrame(world) {
    const customUrl = String(world?.custom_code_url || '').trim();
    if (!customUrl) return false;
    return /\/storage\/v1\/object\/public\/worlds\//i.test(customUrl);
  }

  function fillCategorySelect(selectEl) {
    if (!selectEl) return;
    const categories = (getCategories?.() || []).map((item) => String(item?.name || '').trim()).filter(Boolean);
    selectEl.innerHTML = categories.length
      ? categories.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')
      : '<option value="">no categories</option>';
  }

  function fillFontSelect() {
    dom.plugFont.innerHTML = WORLD_FONTS
      .map((font) => `<option value="${escapeHtml(font.value)}">${escapeHtml(font.label)}</option>`)
      .join('');
  }

  function syncCategories() {
    fillCategorySelect(dom.plugCategory);
    fillCategorySelect(dom.codeCategory);
  }

  function showStep(step) {
    dom.makerShell.dataset.step = step;
    dom.makerShell.querySelectorAll('[data-step-panel]').forEach((panel) => {
      panel.classList.toggle('is-active', panel.getAttribute('data-step-panel') === step);
    });
  }

  function resetMaker() {
    makerMode = 'create';
    makerEditingWorld = null;
    makerEditingType = 'plug';
    dom.plugName.value = '';
    dom.plugDescription.value = '';
    dom.plugFont.value = '';
    dom.plugFontColor.value = '#f5f5f5';
    dom.plugCover.value = '';
    dom.plugCoverLabel.textContent = 'use world background as cover';
    dom.plugBackground.value = '';
    dom.plugBackgroundLabel.textContent = 'use site background';
    dom.plugPassword.value = '';
    dom.plugUpdateMode.value = 'auto';
    dom.codeHtml.value = '';
    dom.codeCss.value = '';
    dom.codeHtmlLabel.textContent = 'choose html';
    dom.codeCssLabel.textContent = 'choose css';
    dom.codeName.value = '';
    dom.codeDescription.value = '';
    dom.codePassword.value = '';
    dom.plugPublish.textContent = 'publish world';
    dom.codePublish.textContent = 'publish world';
    dom.makerDelete.style.display = 'none';
    syncCategories();
    showStep('mode');
  }

  function openMaker() {
    makerMode = 'create';
    makerEditingWorld = null;
    makerEditingType = 'plug';
    syncCategories();
    fillFontSelect();
    dom.makerOverlay.style.display = 'flex';
    dom.plugPublish.textContent = 'publish world';
    dom.codePublish.textContent = 'publish world';
    showStep('mode');
  }

  function openMakerForEdit(world) {
    if (!world?.id) return;

    makerMode = 'edit';
    makerEditingWorld = world;
    makerEditingType = canUseCustomWorldFrame(world) ? 'code' : 'plug';

    syncCategories();
    fillFontSelect();

    dom.plugName.value = world.name || '';
    dom.plugDescription.value = world.description || '';
    dom.plugCategory.value = world.category || dom.plugCategory.value;
    dom.plugFont.value = world.font_family || '';
    dom.plugFontColor.value = world.font_color || '#f5f5f5';
    dom.plugCover.value = '';
    dom.plugCoverLabel.textContent = world.cover_url
      ? 'keep current world cover (choose file to replace)'
      : (world.background_url ? 'use world background as cover (choose file to replace)' : 'use site background as cover');
    dom.plugBackground.value = '';
    dom.plugBackgroundLabel.textContent = world.background_url ? 'keep current background (choose file to replace)' : 'use site background';
    dom.plugVisibility.value = world.is_public_view === false ? 'false' : 'true';
    dom.plugEditing.value = world.is_public_edit === false ? 'false' : 'true';
    dom.plugPassword.value = '';
    dom.plugUpdateMode.value = world.update_mode === 'manual' ? 'manual' : 'auto';

    dom.codeName.value = world.name || '';
    dom.codeDescription.value = world.description || '';
    dom.codeCategory.value = world.category || dom.codeCategory.value;
    dom.codeVisibility.value = world.is_public_view === false ? 'false' : 'true';
    dom.codeEditing.value = world.is_public_edit === false ? 'false' : 'true';
    dom.codePassword.value = '';
    dom.codeHtml.value = '';
    dom.codeCss.value = '';
    dom.codeHtmlLabel.textContent = 'keep current html (choose file to replace)';
    dom.codeCssLabel.textContent = 'keep current css (choose file to replace)';

    dom.plugPublish.textContent = 'update world';
    dom.codePublish.textContent = 'update world';
    dom.makerDelete.style.display = 'inline-flex';

    dom.makerOverlay.style.display = 'flex';
    showStep(makerEditingType);
  }

  function closeMaker() {
    dom.makerOverlay.style.display = 'none';
    resetMaker();
  }

  function isMakerOpen() {
    return dom.makerOverlay.style.display === 'flex';
  }

  function isInWorldMode() {
    return dom.modeChrome.style.display === 'block';
  }

  function renderWorldModeChrome(world, creator) {
    const creatorPfp = getPfpSrc(creator, baseUrl);
    const currentUserId = getCurrentUser?.()?.id || null;
    const inEditMode = Boolean(getIsEditMode?.());
    const canEditWorld = Boolean(currentUserId) && String(currentUserId) === String(world?.user_id || '');
    const canUseRecompress = Boolean(currentUserId);
    const worldFont = world.font_family || 'inherit';
    const worldColor = world.font_color || 'inherit';
    const useCustomFrame = canUseCustomWorldFrame(world);

    dom.modeName.textContent = world.name || DEFAULT_WORLD_TITLE;
    dom.modeDescription.textContent = world.description || DEFAULT_WORLD_DESCRIPTION;
    dom.modeChrome.style.setProperty('--world-mode-font-family', worldFont);
    dom.modeChrome.style.setProperty('--world-mode-font-color', worldColor);
    dom.modePfp.src = creatorPfp;
    dom.modePfp.onclick = creator?.id ? () => onOpenProfile?.(creator.id) : null;
    dom.modePfp.style.cursor = creator?.id ? 'pointer' : '';
    if (dom.modePfpWrap) dom.modePfpWrap.style.display = '';
    if (dom.modeIdentityPanel) dom.modeIdentityPanel.style.display = '';
    if (dom.modeNavBar) dom.modeNavBar.style.display = inEditMode ? 'none' : 'flex';
    dom.modeTabs.style.display = inEditMode ? 'none' : 'inline-flex';
    dom.modeRecompress.style.display = canUseRecompress && inEditMode ? 'inline-flex' : 'none';
    dom.modeEdit.style.display = canEditWorld && inEditMode ? 'inline-flex' : 'none';
    dom.modeDelete.style.display = 'none';
    dom.modeFrame.style.display = useCustomFrame ? 'block' : 'none';
    dom.modeFrame.src = useCustomFrame ? world.custom_code_url : 'about:blank';
  }

  async function renderMainNavigationChrome() {
    if (getIsEditMode?.()) {
      clearWorldModeChrome();
      return;
    }

    clearWorldTabs();
    dom.modeChrome.style.display = 'block';
    dom.modeChrome.style.removeProperty('--world-mode-font-family');
    dom.modeChrome.style.removeProperty('--world-mode-font-color');
    if (dom.modeNavBar) dom.modeNavBar.style.display = 'flex';
    dom.modeTabs.style.display = 'inline-flex';
    dom.modeRecompress.style.display = 'none';
    dom.modeEdit.style.display = 'none';
    dom.modeDelete.style.display = 'none';
    dom.modeFrame.style.display = 'none';
    dom.modeFrame.src = 'about:blank';
    if (dom.modeMyWorldsMenu) dom.modeMyWorldsMenu.style.display = 'none';

    if (dom.modePfpWrap) dom.modePfpWrap.style.display = 'none';
    if (dom.modeIdentityPanel) dom.modeIdentityPanel.style.display = 'none';

    renderBreadcrumbBar([
      {
        label: MAIN_WORLD_LABEL,
        navTarget: 'root',
        worldId: '',
        current: true
      }
    ]);
    parentTabAction = async () => {};
  }

  function clearWorldTabs() {
    if (!dom.modeTabs) return;
    dom.modeTabs.innerHTML = '';
  }

  function setWorldLoaderVisible(visible) {
    if (!dom.loaderOverlay) return;
    dom.loaderOverlay.style.display = visible ? 'block' : 'none';
    dom.loaderOverlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
    document.body.classList.toggle('world-loader-active', !!visible);

    if (!visible) {
      dom.loaderOverlay.dataset.mode = 'loading';
      if (dom.loaderOverlay) dom.loaderOverlay.style.setProperty('--world-loader-progress', '0%');
      if (dom.passwordInput) dom.passwordInput.value = '';
      if (dom.passwordError) dom.passwordError.textContent = '';
    }
  }

  function setWorldLoaderProgress(progress = 0) {
    if (!dom.loaderOverlay) return;
    const normalized = Math.max(0, Math.min(100, Number(progress) || 0));
    dom.loaderOverlay.style.setProperty('--world-loader-progress', `${normalized}%`);
  }

  function populateWorldLoader(world, creator = null, options = {}) {
    const {
      mode = 'loading',
      kicker = 'world',
      status = 'loading world...',
      progress = 0,
      title,
      meta,
      description,
      backgroundUrl: explicitBackgroundUrl,
      coverUrl: explicitCoverUrl,
      showCover = true
    } = options;

    const backgroundUrl = explicitBackgroundUrl || world?.background_url || getDefaultBackgroundUrl(baseUrl);
    const coverUrl = explicitCoverUrl || getWorldCardCoverUrl(world, baseUrl);
    const creatorName = String(creator?.username || 'unknown').trim() || 'unknown';
    if (dom.loaderOverlay) dom.loaderOverlay.dataset.mode = mode;
    if (dom.loaderKicker) dom.loaderKicker.textContent = kicker;
    if (dom.loaderTitle) dom.loaderTitle.textContent = title || world?.name || DEFAULT_WORLD_TITLE;
    if (dom.loaderMeta) dom.loaderMeta.textContent = meta || `by ${creatorName}`;
    if (dom.loaderDescription) dom.loaderDescription.textContent = description || world?.description || DEFAULT_WORLD_DESCRIPTION;
    if (dom.loaderStatus) dom.loaderStatus.textContent = status;
    setWorldLoaderProgress(progress);
    if (dom.loaderCoverShell) {
      dom.loaderCoverShell.style.display = showCover ? '' : 'none';
    }
    if (dom.loaderBackdrop) {
      dom.loaderBackdrop.style.backgroundImage = `url("${getOptimizedWorldLoaderBackdropUrl(backgroundUrl)}")`;
    }
    if (dom.loaderCover) {
      dom.loaderCover.src = getOptimizedWorldLoaderCoverUrl(coverUrl) || coverUrl;
      dom.loaderCover.alt = world?.name ? `${world.name} cover` : 'World cover';
    }
  }

  function setPasswordPromptVisible(visible) {
    if (!dom.loaderOverlay) return;
    if (visible) {
      if (!dom.loaderOverlay.dataset.mode || dom.loaderOverlay.dataset.mode === 'loading') {
        dom.loaderOverlay.dataset.mode = 'password';
      }
      setWorldLoaderVisible(true);
      return;
    }

    setWorldLoaderVisible(false);
  }

  function showTransitionLoader(options = {}) {
    populateWorldLoader(null, null, options);
    setWorldLoaderVisible(true);
  }

  function hideTransitionLoader() {
    setWorldLoaderVisible(false);
  }

  function showPasswordPrompt(world, creator = null, message = '') {
    return new Promise((resolve) => {
      passwordPromptState = { resolve, worldId: world?.id || null };
      populateWorldLoader(world, creator, {
        mode: 'password',
        kicker: 'world access',
        status: 'waiting for password...',
        progress: 0
      });
      if (dom.passwordTitle) {
        dom.passwordTitle.textContent = `unlock ${world?.name || DEFAULT_WORLD_TITLE}`;
      }
      if (dom.passwordCopy) {
        dom.passwordCopy.textContent = 'Enter the password for this world.';
      }
      if (dom.passwordError) dom.passwordError.textContent = message || '';
      setPasswordPromptVisible(true);
      dom.passwordInput?.focus();
      dom.passwordInput?.select();
    });
  }

  function closePasswordPrompt(result = null) {
    const state = passwordPromptState;
    passwordPromptState = null;
    setPasswordPromptVisible(false);
    state?.resolve?.(result);
  }

  async function verifyWorldAccess(worldId, userId) {
    if (!worldId || !userId) return false;

    const { data, error } = await supabase
      .from('world_access')
      .select('id')
      .eq('world_id', worldId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Failed to load world access:', error);
      return false;
    }

    return Boolean(data?.id);
  }

  async function unlockWorldAccess(worldId, password) {
    const { data, error } = await supabase.rpc('grant_world_access', {
      p_world_id: worldId,
      p_password: password
    });

    if (error) throw error;
    return Boolean(data);
  }

  async function verifyWorldPassword(worldId, password) {
    const { data, error } = await supabase.rpc('verify_world_password', {
      p_world_id: worldId,
      p_password: password
    });

    if (error) throw error;
    return Boolean(data);
  }

  async function loadWorldById(worldId) {
    if (!worldId) return null;

    const { data, error } = await supabase
      .from('worlds')
      .select('*')
      .eq('id', worldId)
      .maybeSingle();

    if (error) {
      console.error('Failed to load world:', error);
      return null;
    }

    return data || null;
  }

  function getKnownWorldById(worldId) {
    const normalizedId = String(worldId || '').trim();
    if (!normalizedId) return null;

    const stackMatch = worldNavStack.find((entry) => String(entry?.id || '').trim() === normalizedId);
    if (stackMatch) return stackMatch;

    return myWorldMap.get(normalizedId) || null;
  }

  async function openWorldById(worldId, options = {}) {
    const loaderWorld = options?.world || getKnownWorldById(worldId);
    if (loaderWorld) {
      showTransitionLoader({
        mode: 'loading',
        kicker: 'world',
        title: loaderWorld.name || DEFAULT_WORLD_TITLE,
        meta: 'opening world',
        description: loaderWorld.description || DEFAULT_WORLD_DESCRIPTION,
        backgroundUrl: loaderWorld.background_url || getDefaultBackgroundUrl(baseUrl),
        coverUrl: getWorldCardCoverUrl(loaderWorld, baseUrl),
        showCover: true,
        status: 'loading world...',
        progress: 8
      });
    }

    const nextWorld = await loadWorldById(worldId);
    if (!nextWorld) {
      setWorldLoaderVisible(false);
      pruneRememberedWorld(worldId);
      alert('Could not load that world.');
      return;
    }

    setWorldLoaderProgress(20);
    const nextCreator = await resolveWorldCreator(nextWorld);
    await openWorldMode(nextWorld, nextCreator);
  }

  function clearWorldModeChrome() {
    dom.modeChrome.style.display = 'none';
    dom.modeChrome.style.removeProperty('--world-mode-font-family');
    dom.modeChrome.style.removeProperty('--world-mode-font-color');
    clearWorldTabs();
    if (dom.modeNavBar) dom.modeNavBar.style.display = '';
    dom.modeTabs.style.display = '';
    dom.modeRecompress.style.display = 'none';
    dom.modeEdit.style.display = 'none';
    dom.modeDelete.style.display = 'none';
    dom.modeFrame.style.display = 'none';
    dom.modeFrame.src = 'about:blank';
    if (dom.modePfpWrap) dom.modePfpWrap.style.display = '';
    if (dom.modeIdentityPanel) dom.modeIdentityPanel.style.display = '';
    if (dom.modeMyWorldsMenu) dom.modeMyWorldsMenu.style.display = 'none';
  }

  async function loadWorlds(filters = {}) {
    const requestKey = JSON.stringify(filters || {});
    if (loadWorldsInFlightPromise && loadWorldsInFlightKey === requestKey) {
      console.warn('[feed reload skipped: already loading]');
      return loadWorldsInFlightPromise;
    }

    const runPromise = (async () => {
    Promise.resolve()
      .then(() => ensureLatestUpdateInfo())
      .catch(() => null);

    let query = supabase
      .from('worlds')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters.rootOnly) {
      query = query.is('parent_world_id', null);
    }

    if (Object.prototype.hasOwnProperty.call(filters, 'parentWorldId')) {
      if (filters.parentWorldId) {
        query = query.eq('parent_world_id', filters.parentWorldId);
      }
    }

    if (filters.userId) {
      query = query.eq('user_id', filters.userId);
    }

    if (Object.prototype.hasOwnProperty.call(filters, 'category') && filters.category) {
      query = query.eq('category', filters.category);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Failed to load worlds:', error);
      return [];
    }

    return data || [];
    })();

    loadWorldsInFlightKey = requestKey;
    loadWorldsInFlightPromise = runPromise;

    try {
      return await runPromise;
    } finally {
      if (loadWorldsInFlightPromise === runPromise) {
        loadWorldsInFlightPromise = null;
        loadWorldsInFlightKey = '';
      }
    }
  }

  async function ensureLatestUpdateInfo(force = false) {
    if (latestUpdateInfo && !force) return latestUpdateInfo;
    if (!force && latestUpdateInfoPromise) return latestUpdateInfoPromise;
    if (!force && Date.now() < latestUpdateInfoRetryAt) return latestUpdateInfo;

    const requestPromise = (async () => {
      const { data, error } = await supabase
        .from('updates')
        .select('id, version, description, released_at')
        .order('released_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn('Failed to load update metadata:', error);
        latestUpdateInfoRetryAt = Date.now() + 10000;
        latestUpdateInfo = null;
        return null;
      }

      latestUpdateInfoRetryAt = 0;
      latestUpdateInfo = data || null;
      return latestUpdateInfo;
    })();

    latestUpdateInfoPromise = requestPromise;

    try {
      return await requestPromise;
    } finally {
      if (latestUpdateInfoPromise === requestPromise) {
        latestUpdateInfoPromise = null;
      }
    }
  }

  function worldNeedsManualUpdate(world, currentUserId) {
    if (!world || !currentUserId) return false;
    if (String(world.user_id || '') !== String(currentUserId)) return false;
    if (String(world.update_mode || 'auto') !== 'manual') return false;
    if (!latestUpdateInfo?.released_at) return false;

    const worldUpdatedAt = world.last_updated_at ? new Date(world.last_updated_at).getTime() : 0;
    const latestReleasedAt = new Date(latestUpdateInfo.released_at).getTime();
    if (!Number.isFinite(latestReleasedAt) || latestReleasedAt <= 0) return false;

    return worldUpdatedAt < latestReleasedAt;
  }

  async function applyWorldUpdate(world) {
    const currentUserId = getCurrentUser?.()?.id || null;
    if (!currentUserId || !world?.id) return;

    const { error } = await supabase
      .from('worlds')
      .update({ last_updated_at: new Date().toISOString() })
      .eq('id', world.id)
      .eq('user_id', currentUserId);

    if (error) {
      alert(`Update apply failed: ${error.message}`);
      return;
    }

    await onWorldCreated?.({ ...world, last_updated_at: new Date().toISOString() });
  }

  async function resolveWorldCreator(world, preferredUser = null) {
    if (preferredUser?.id) return preferredUser;

    const { data, error } = await supabase
      .from('users')
      .select('id, username, pfp, pfp_url')
      .eq('id', world.user_id)
      .single();

    if (error) {
      console.error('Failed to load world creator:', error);
      return {};
    }

    return data || {};
  }

  async function openWorldMode(world, creator = null) {
    if (getIsEditMode?.()) return;

    populateWorldLoader(world, creator, {
      mode: 'loading',
      kicker: 'world',
      status: 'loading world...',
      progress: 24
    });
    setWorldLoaderVisible(true);

    const currentUserId = getCurrentUser?.()?.id || null;
    try {
      const resolvedCreator = await resolveWorldCreator(world, creator);
      populateWorldLoader(world, resolvedCreator, {
        mode: 'loading',
        kicker: 'world',
        status: 'loading world...',
        progress: 28
      });

      if (world.is_public_view === false && currentUserId !== world.user_id) {
        alert('This world is private.');
        return;
      }

      if (world.password_hash && currentUserId && currentUserId !== world.user_id) {
        const hasAccess = await verifyWorldAccess(world.id, currentUserId);
        if (!hasAccess) {
          let nextMessage = '';

          while (true) {
            const password = await showPasswordPrompt(world, resolvedCreator, nextMessage);
            if (!password) return;

            try {
              const unlocked = await unlockWorldAccess(world.id, password);
              if (unlocked) break;
              nextMessage = 'Incorrect password.';
            } catch (error) {
              console.error('Failed to unlock world:', error);
              nextMessage = error?.message || 'Could not unlock world.';
            }
          }
        }
      }

      if (world.password_hash && !currentUserId) {
        const hasGuestAccess = hasGuestWorldAccess(world.id);
        if (!hasGuestAccess) {
          let nextMessage = '';

          while (true) {
            const password = await showPasswordPrompt(world, resolvedCreator, nextMessage);
            if (!password) return;

            try {
              const unlocked = await verifyWorldPassword(world.id, password);
              if (unlocked) {
                rememberGuestWorldAccess(world.id, true);
                break;
              }
              nextMessage = 'Incorrect password.';
            } catch (error) {
              console.error('Failed to verify world password:', error);
              nextMessage = error?.message || 'Could not unlock world.';
            }
          }
        }
      }

      activeWorld = world;
      activeWorldCreator = resolvedCreator;
      updateWorldNavStack(world);
      await hydrateMyWorlds();
      await rememberWorld(world);
      setWorldUrl(world.id);

      populateWorldLoader(world, activeWorldCreator, {
        mode: 'loading',
        kicker: 'world',
        status: 'loading world...',
        progress: 32
      });

      renderWorldModeChrome(world, activeWorldCreator);
      dom.modeChrome.style.display = 'block';
      await renderWorldNavigation(world);

      await onEnterWorld?.({
        world,
        creator: activeWorldCreator,
        backgroundUrl: world.background_url || getDefaultBackgroundUrl(baseUrl),
        fontFamily: world.font_family || '',
        fontColor: world.font_color || '',
        uiColor: getWorldAccent(world)
      });
    } finally {
      setWorldLoaderVisible(false);
    }
  }

  async function exitWorldMode() {
    showTransitionLoader({
      mode: 'loading',
      kicker: 'main',
      title: 'main page',
      meta: 'monkey space',
      description: 'Loading the main canvas and bringing everything back into view.',
      status: 'loading main...',
      backgroundUrl: getDefaultBackgroundUrl(baseUrl),
      coverUrl: getDefaultBackgroundUrl(baseUrl),
      showCover: false,
      progress: 0
    });
    activeWorld = null;
    activeWorldCreator = null;
    worldNavStack = [];
    clearWorldUrl();
    parentTabAction = async () => {
      await exitWorldMode();
    };
    clearWorldTabs();
    clearWorldModeChrome();
    await onExitWorld?.();
    await renderMainNavigationChrome();
  }

  async function cleanupWorldAssets(worldId) {
    const { data, error } = await supabase.storage.from(WORLD_BUCKET).list(worldId);
    if (error) throw error;
    const paths = (data || []).map((entry) => `${worldId}/${entry.name}`);
    if (paths.length === 0) return;
    const { error: removeError } = await supabase.storage.from(WORLD_BUCKET).remove(paths);
    if (removeError) throw removeError;
  }

  async function cleanupWorldPosts(worldIds) {
    const normalizedWorldIds = dedupeWorldIds(Array.isArray(worldIds) ? worldIds : [worldIds]);
    if (!normalizedWorldIds.length) return;

    const { error } = await supabase
      .from('posts')
      .delete()
      .in('world_id', normalizedWorldIds);

    if (error) throw error;
  }

  async function deleteWorld(world, options = {}) {
    const {
      includePosts = false,
      fromForm = false
    } = options;

    let descendantWorlds = [];
    let directChildWorlds = [];
    let childWorldAction = null;

    try {
      directChildWorlds = await loadDirectChildWorlds(world.id);
      if (directChildWorlds.length > 0) {
        descendantWorlds = await loadDescendantWorlds(world.id);
        childWorldAction = await chooseChildWorldDeleteMode(world, descendantWorlds);
        if (!childWorldAction) return;
      }
    } catch (error) {
      alert(`Delete failed: ${error.message}`);
      return;
    }

    const confirmed = typeof window.__prettyConfirm === 'function'
      ? await window.__prettyConfirm({
          title: 'delete world?',
          message: (() => {
            const nestedMessage = childWorldAction === 'transfer-children'
              ? 'Direct child worlds will be moved to main.'
              : (descendantWorlds.length > 0 ? 'Contained worlds will also be deleted.' : '');

            return includePosts
              ? `This deletes the world and all the posts inside it. ${nestedMessage} Existing uploaded assets may remain in storage if bucket policies block cleanup.`.trim()
              : `This removes the world from the feed. ${nestedMessage} Existing uploaded assets may remain in storage if bucket policies block cleanup.`.trim();
          })(),
          confirmLabel: 'delete',
          cancelLabel: 'cancel',
          danger: true
        })
      : window.confirm('Delete this world?');

    if (!confirmed) return;

    const isActive = activeWorld?.id === world.id;
    if (isActive) {
      await exitWorldMode();
    }

    const descendantWorldIds = descendantWorlds.map((childWorld) => String(childWorld.id || '').trim()).filter(Boolean);
    const targetWorldIdsForPostDelete = includePosts
      ? dedupeWorldIds([world.id, ...descendantWorldIds])
      : (childWorldAction === 'delete-children' ? descendantWorldIds : []);

    try {
      if (targetWorldIdsForPostDelete.length > 0) {
        await cleanupWorldPosts(targetWorldIdsForPostDelete);
      }

      if (childWorldAction === 'delete-children' && descendantWorldIds.length > 0) {
        const { error: deleteDescendantsError } = await supabase
          .from('worlds')
          .delete()
          .in('id', descendantWorldIds);

        if (deleteDescendantsError) throw deleteDescendantsError;
      }
    } catch (error) {
      alert(`Delete failed: ${error.message}`);
      return;
    }

    const { error } = await supabase
      .from('worlds')
      .delete()
      .eq('id', world.id)
      .eq('user_id', getCurrentUser()?.id || '');

    if (error) {
      alert(`Delete failed: ${error.message}`);
      return;
    }

    try {
      await cleanupWorldAssets(world.id);
      if (childWorldAction === 'delete-children' && descendantWorldIds.length > 0) {
        await Promise.allSettled(descendantWorldIds.map((worldId) => cleanupWorldAssets(worldId)));
      }
    } catch (cleanupError) {
      console.warn('World asset cleanup skipped:', cleanupError?.message || cleanupError);
    }

    pruneRememberedWorld(world.id);

    if (fromForm && isMakerOpen()) {
      closeMaker();
    }

    if (!isActive) {
      if (activeWorld?.id) {
        await renderWorldNavigation(activeWorld);
      } else {
        await renderMainNavigationChrome();
      }
    }

    await onWorldDeleted?.(world);
  }

  async function uploadWorldFile(worldId, fileName, file) {
    const storagePath = `${worldId}/${fileName}`;
    const inferredType = String(file?.type || '').trim() || guessMimeFromFileName(fileName) || 'application/octet-stream';
    const uploadResult = await withRateLimitRetry(async () => {
      const { error: uploadError } = await supabase.storage
        .from(WORLD_BUCKET)
        .upload(storagePath, file, {
          upsert: true,
          contentType: inferredType
        });

      if (uploadError) throw uploadError;
      return true;
    }, {
      retries: 5,
      baseDelayMs: 650,
      maxDelayMs: 8000
    });

    if (!uploadResult) {
      throw new Error('Upload failed.');
    }

    const { data } = supabase.storage.from(WORLD_BUCKET).getPublicUrl(storagePath);
    return data.publicUrl;
  }

  async function updateWorldCoverAsset(worldId, userId, coverUrl) {
    const payloadCandidates = [
      { cover_url: coverUrl },
      { background_url: coverUrl }
    ];

    let lastError = null;

    for (let i = 0; i < payloadCandidates.length; i += 1) {
      const payload = payloadCandidates[i];
      let query = supabase
        .from('worlds')
        .update(payload)
        .eq('id', worldId);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: updated, error } = await withRateLimitRetry(async () => {
        return query
          .select('*')
          .single();
      }, {
        retries: 4,
        baseDelayMs: 500,
        maxDelayMs: 6000
      });

      if (!error) {
        return updated;
      }

      lastError = error;
      const missingCoverColumn = i === 0 && /cover_url|schema cache|column/i.test(`${error?.code || ''} ${error?.message || ''}`);
      if (missingCoverColumn) {
        continue;
      }

      throw error;
    }

    throw lastError || new Error('Failed to save world cover.');
  }

  async function setWorldPassword(worldId, plainPassword) {
    const trimmed = String(plainPassword || '').trim();
    if (!trimmed) return;

    const payloadCandidates = [
      { p_world_id: worldId, p_password: trimmed },
      { p_password: trimmed, p_world_id: worldId },
      { world_id: worldId, password: trimmed }
    ];

    let lastError = null;

    for (const payload of payloadCandidates) {
      const { data, error } = await supabase.rpc('set_world_password', payload);
      if (!error) {
        return;
      }

      lastError = error;

      // PGRST202 = function signature not found in schema cache.
      // Try the next payload shape before surfacing the error.
      if (error.code === 'PGRST202') {
        continue;
      }

      throw error;
    }

    throw lastError || new Error('Failed to update world password.');
  }

  async function publishPlugWorld() {
    if (publishInFlight) return;

    const name = dom.plugName.value.trim();
    const description = dom.plugDescription.value.trim();
    const category = dom.plugCategory.value.trim();

    if (!name || !description || !category) {
      alert('World name, description, and category are required.');
      return;
    }

    const currentUser = getCurrentUser?.();
    if (!currentUser?.id) return;
    const isEdit = makerMode === 'edit' && Boolean(makerEditingWorld?.id);
    const editingWorldId = makerEditingWorld?.id || null;
    const passwordInput = dom.plugPassword.value;

    publishInFlight = true;
    dom.plugPublish.disabled = true;
    dom.plugPublish.textContent = isEdit ? 'updating...' : 'publishing...';

    try {
      const uiColor = dom.plugFontColor.value || DEFAULT_UI_COLOR;
      const draft = {
        name,
        description,
        category,
        font_family: dom.plugFont.value || null,
        font_color: dom.plugFontColor.value || null,
        ui_color: uiColor,
        is_public_view: dom.plugVisibility.value !== 'false',
        is_public_edit: dom.plugEditing.value !== 'false',
        update_mode: dom.plugUpdateMode.value === 'manual' ? 'manual' : 'auto'
      };

      let nextWorld = null;

      if (isEdit) {
        const { data: updated, error: updateError } = await supabase
          .from('worlds')
          .update(draft)
          .eq('id', editingWorldId)
          .eq('user_id', currentUser.id)
          .select('*')
          .single();

        if (updateError) throw updateError;
        nextWorld = updated;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('worlds')
          .insert([{
            ...draft,
            user_id: currentUser.id,
            parent_world_id: activeWorld?.id || null,
            background_url: null,
            custom_code_url: null
          }])
          .select('*')
          .single();

        if (insertError) throw insertError;
        nextWorld = inserted;
      }
      const bgFile = dom.plugBackground.files?.[0] || null;
      const coverFile = dom.plugCover.files?.[0] || null;
      if (bgFile) {
        const optimizedBgFile = await optimizeWorldBackgroundImage(bgFile);
        const backgroundUrl = await uploadWorldFile(
          nextWorld.id,
          `background-${Date.now()}-${normalizeStorageName(optimizedBgFile?.name || bgFile.name)}`,
          optimizedBgFile || bgFile
        );

        const { data: updated, error: updateError } = await supabase
          .from('worlds')
          .update({ background_url: backgroundUrl })
          .eq('id', nextWorld.id)
          .select('*')
          .single();

        if (updateError) throw updateError;
        nextWorld = updated;
      }

      if (coverFile) {
        const optimizedCoverFile = await optimizeWorldCoverImage(coverFile);
        const coverUrl = await uploadWorldFile(
          nextWorld.id,
          `cover-${Date.now()}-${normalizeStorageName(optimizedCoverFile?.name || coverFile.name)}`,
          optimizedCoverFile || coverFile
        );

        nextWorld = await updateWorldCoverAsset(nextWorld.id, currentUser.id, coverUrl);
      }

      if (passwordInput?.trim()) {
        await setWorldPassword(nextWorld.id, passwordInput);
      }

      if (activeWorld?.id === nextWorld.id) {
        activeWorld = nextWorld;
      }

      closeMaker();
      await onWorldCreated?.(nextWorld, {
        startPlacement: !isEdit
      });
    } catch (error) {
      alert(`World save failed: ${getErrorMessage(error)}`);
    } finally {
      publishInFlight = false;
      dom.plugPublish.disabled = false;
      dom.plugPublish.textContent = makerMode === 'edit' ? 'update world' : 'publish world';
    }
  }

  async function publishCodeWorld() {
    if (publishInFlight) return;

    const name = dom.codeName.value.trim();
    const description = dom.codeDescription.value.trim();
    const category = dom.codeCategory.value.trim();
    const htmlFile = dom.codeHtml.files?.[0] || null;
    const cssFile = dom.codeCss.files?.[0] || null;
    const isEdit = makerMode === 'edit' && Boolean(makerEditingWorld?.id);
    const editingWorldId = makerEditingWorld?.id || null;
    const passwordInput = dom.codePassword.value;

    if (!name || !description || !category || (!isEdit && (!htmlFile || !cssFile))) {
      alert('Upload world.html and world.css, then fill in name, description, and category.');
      return;
    }

    const currentUser = getCurrentUser?.();
    if (!currentUser?.id) return;

    publishInFlight = true;
    dom.codePublish.disabled = true;
    dom.codePublish.textContent = isEdit ? 'updating...' : 'publishing...';

    try {
      const draft = {
        name,
        description,
        category,
        is_public_view: dom.codeVisibility.value !== 'false',
        is_public_edit: dom.codeEditing.value !== 'false'
      };

      let nextWorld = null;

      if (isEdit) {
        const { data: updatedBase, error: updateBaseError } = await supabase
          .from('worlds')
          .update(draft)
          .eq('id', editingWorldId)
          .eq('user_id', currentUser.id)
          .select('*')
          .single();

        if (updateBaseError) throw updateBaseError;
        nextWorld = updatedBase;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('worlds')
          .insert([{
            ...draft,
            user_id: currentUser.id,
            parent_world_id: activeWorld?.id || null,
            background_url: null,
            custom_code_url: null,
            font_family: null,
            font_color: null,
            ui_color: DEFAULT_UI_COLOR,
            update_mode: 'auto'
          }])
          .select('*')
          .single();

        if (insertError) throw insertError;
        nextWorld = inserted;
      }

      let customCodeUrl = nextWorld.custom_code_url || null;

      if (htmlFile) {
        customCodeUrl = await uploadWorldFile(nextWorld.id, 'world.html', htmlFile);
      }

      if (cssFile) {
        await uploadWorldFile(nextWorld.id, 'world.css', cssFile);
      }

      if (customCodeUrl !== nextWorld.custom_code_url) {
        const { data: updatedCode, error: updateCodeError } = await supabase
          .from('worlds')
          .update({ custom_code_url: customCodeUrl })
          .eq('id', nextWorld.id)
          .select('*')
          .single();

        if (updateCodeError) throw updateCodeError;
        nextWorld = updatedCode;
      }

      if (passwordInput?.trim()) {
        await setWorldPassword(nextWorld.id, passwordInput);
      }

      if (activeWorld?.id === nextWorld.id) {
        activeWorld = nextWorld;
      }

      closeMaker();
      await onWorldCreated?.(nextWorld, {
        startPlacement: !isEdit
      });
    } catch (error) {
      alert(`World save failed: ${getErrorMessage(error)}`);
    } finally {
      publishInFlight = false;
      dom.codePublish.disabled = false;
      dom.codePublish.textContent = makerMode === 'edit' ? 'update world' : 'publish world';
    }
  }

  async function optimizeExistingWorldBackgrounds(options = {}) {
    const {
      dryRun = false,
      onlyWorldId = null
    } = options;

    const currentUser = getCurrentUser?.();
    if (!currentUser?.id) {
      throw new Error('You must be signed in to optimize world backgrounds.');
    }

    let query = supabase
      .from('worlds')
      .select('id, user_id, name, background_url')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (onlyWorldId) {
      query = query.eq('id', onlyWorldId);
    }

    const { data: worlds, error } = await query;
    if (error) throw error;

    const candidates = (worlds || []).filter((world) => {
      const bgUrl = String(world?.background_url || '').trim();
      return Boolean(bgUrl);
    });

    const report = {
      totalWorlds: candidates.length,
      optimized: 0,
      skipped: 0,
      failed: 0,
      bytesBefore: 0,
      bytesAfter: 0,
      details: []
    };

    for (const world of candidates) {
      const worldId = String(world.id || '').trim();
      const bgUrl = String(world.background_url || '').trim();
      if (!worldId || !bgUrl) {
        report.skipped += 1;
        continue;
      }

      try {
        const response = await withRateLimitRetry(async () => {
          const nextResponse = await fetch(bgUrl, { cache: 'no-store' });
          if (nextResponse.status === 429) {
            const rateErr = new Error('Too many requests, please try again later.');
            rateErr.status = 429;
            throw rateErr;
          }
          if (!nextResponse.ok) {
            throw new Error(`download failed (${nextResponse.status})`);
          }
          return nextResponse;
        }, {
          retries: 5,
          baseDelayMs: 700,
          maxDelayMs: 9000
        });

        const originalBlob = await response.blob();
        const inputFileName = getFileNameFromUrl(bgUrl, `background-${worldId}`);
        const blobMime = String(originalBlob.type || '').toLowerCase();
        const fallbackMime = guessMimeFromFileName(inputFileName);
        const inputType = blobMime.startsWith('image/')
          ? blobMime
          : (fallbackMime || 'image/jpeg');
        const inputFile = new File([originalBlob], inputFileName, { type: inputType });

        const optimizedFile = await optimizeWorldBackgroundImage(inputFile);
        if (!optimizedFile) {
          report.skipped += 1;
          report.details.push({ worldId, name: world.name || DEFAULT_WORLD_TITLE, reason: 'optimizer returned no file' });
          continue;
        }

        report.bytesBefore += originalBlob.size || 0;
        report.bytesAfter += optimizedFile.size || 0;

        if (!dryRun) {
          const optimizedName = `background-${Date.now()}-${normalizeStorageName(optimizedFile.name || inputFile.name)}`;
          const nextBackgroundUrl = await uploadWorldFile(worldId, optimizedName, optimizedFile);

          const { data: updated, error: updateError } = await withRateLimitRetry(async () => {
            return supabase
              .from('worlds')
              .update({ background_url: nextBackgroundUrl })
              .eq('id', worldId)
              .eq('user_id', currentUser.id)
              .select('*')
              .single();
          }, {
            retries: 4,
            baseDelayMs: 500,
            maxDelayMs: 6000
          });

          if (updateError) throw updateError;

          if (activeWorld?.id === worldId) {
            activeWorld = updated;
          }
        }

        report.optimized += 1;
      } catch (err) {
        report.failed += 1;
        report.details.push({
          worldId,
          name: world.name || DEFAULT_WORLD_TITLE,
          reason: getErrorMessage(err)
        });
      }
    }

    return report;
  }

  async function optimizeExistingWorldCovers(options = {}) {
    const {
      dryRun = false,
      onlyWorldId = null
    } = options;

    const currentUser = getCurrentUser?.();
    if (!currentUser?.id) {
      throw new Error('You must be signed in to recompress world covers.');
    }

    let query = supabase
      .from('worlds')
      .select('id, user_id, name, cover_url, background_url')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (onlyWorldId) {
      query = query.eq('id', onlyWorldId);
    }

    const { data: worlds, error } = await query;
    if (error) throw error;

    const candidates = (worlds || []).filter((world) => {
      const sourceUrl = String(world?.cover_url || world?.background_url || '').trim();
      return Boolean(sourceUrl);
    });

    const report = {
      totalWorlds: candidates.length,
      optimized: 0,
      skipped: 0,
      failed: 0,
      bytesBefore: 0,
      bytesAfter: 0,
      details: []
    };

    const initialRetryProfile = {
      retries: 5,
      baseDelayMs: 700,
      maxDelayMs: 9000
    };

    const cooldownRetryProfile = {
      retries: 7,
      baseDelayMs: 1400,
      maxDelayMs: 14000
    };

    async function recompressOneCover(world, retryProfile) {
      const worldId = String(world.id || '').trim();
      const sourceUrl = String(world.cover_url || world.background_url || '').trim();
      if (!worldId || !sourceUrl) {
        return { skipped: true };
      }

      const response = await withRateLimitRetry(async () => {
        const nextResponse = await fetch(sourceUrl, { cache: 'no-store' });
        if (nextResponse.status === 429) {
          const rateErr = new Error('Too many requests, please try again later.');
          rateErr.status = 429;
          throw rateErr;
        }
        if (!nextResponse.ok) {
          throw new Error(`download failed (${nextResponse.status})`);
        }
        return nextResponse;
      }, retryProfile);

      const originalBlob = await response.blob();
      const inputFileName = getFileNameFromUrl(sourceUrl, `cover-${worldId}`);
      const blobMime = String(originalBlob.type || '').toLowerCase();
      const fallbackMime = guessMimeFromFileName(inputFileName);
      const inputType = blobMime.startsWith('image/')
        ? blobMime
        : (fallbackMime || 'image/jpeg');
      const inputFile = new File([originalBlob], inputFileName, { type: inputType });

      const optimizedFile = await optimizeWorldCoverImage(inputFile);
      if (!optimizedFile) {
        return {
          skipped: true,
          detail: { worldId, name: world.name || DEFAULT_WORLD_TITLE, reason: 'optimizer returned no file' }
        };
      }

      if (!dryRun) {
        const optimizedName = `cover-${Date.now()}-${normalizeStorageName(optimizedFile.name || inputFile.name)}`;
        const nextCoverUrl = await uploadWorldFile(worldId, optimizedName, optimizedFile);
        const updated = await updateWorldCoverAsset(worldId, currentUser.id, nextCoverUrl);

        if (activeWorld?.id === worldId) {
          activeWorld = updated;
        }
      }

      return {
        skipped: false,
        bytesBefore: originalBlob.size || 0,
        bytesAfter: optimizedFile.size || 0
      };
    }

    const deferredRateLimited = [];

    for (const world of candidates) {
      const worldId = String(world.id || '').trim();
      const sourceUrl = String(world.cover_url || world.background_url || '').trim();
      if (!worldId || !sourceUrl) {
        report.skipped += 1;
        continue;
      }

      try {
        const result = await recompressOneCover(world, initialRetryProfile);
        if (result?.skipped) {
          report.skipped += 1;
          if (result.detail) {
            report.details.push(result.detail);
          }
          continue;
        }

        report.bytesBefore += result.bytesBefore || 0;
        report.bytesAfter += result.bytesAfter || 0;

        report.optimized += 1;
      } catch (err) {
        if (isRateLimitedError(err)) {
          deferredRateLimited.push(world);
        } else {
          report.failed += 1;
          report.details.push({
            worldId,
            name: world.name || DEFAULT_WORLD_TITLE,
            reason: getErrorMessage(err)
          });
        }
      }

      await sleep(220);
    }

    if (deferredRateLimited.length > 0) {
      await sleep(2500);
      for (const world of deferredRateLimited) {
        const worldId = String(world.id || '').trim();
        try {
          const result = await recompressOneCover(world, cooldownRetryProfile);
          if (result?.skipped) {
            report.skipped += 1;
            if (result.detail) {
              report.details.push(result.detail);
            }
          } else {
            report.bytesBefore += result.bytesBefore || 0;
            report.bytesAfter += result.bytesAfter || 0;
            report.optimized += 1;
          }
        } catch (err) {
          report.failed += 1;
          report.details.push({
            worldId,
            name: world.name || DEFAULT_WORLD_TITLE,
            reason: getErrorMessage(err)
          });
        }

        await sleep(420);
      }
    }

    return report;
  }

  async function downloadTemplateZip() {
    const blob = await buildTemplateZip();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'world-template.zip';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function buildWorldCard(world, creator = {}, options = {}) {
    const card = document.createElement('div');
    card.className = 'post-card world-card';
    card.dataset.worldId = world.id;
    card.dataset.lod = 'near';

    const idx = options.index || 0;
    const fallbackX = 60 + (idx % 4) * 390;
    const fallbackY = 60 + Math.floor(idx / 4) * 360;
    card.style.left = `${options.x ?? fallbackX}px`;
    card.style.top = `${options.y ?? fallbackY}px`;
    card.style.setProperty('--world-ui-color', getWorldAccent(world));
    const worldFontColor = String(world?.font_color || '').trim();
    const worldFontFamily = String(world?.font_family || '').trim();
    const containerFontColor = String(options?.containerFontColor || '').trim();
    const hasContainerFontColor = Object.prototype.hasOwnProperty.call(options || {}, 'containerFontColor');
    if (worldFontColor) {
      card.style.color = worldFontColor;
    } else {
      card.style.removeProperty('color');
    }
    if (worldFontFamily) {
      card.style.fontFamily = worldFontFamily;
    } else {
      card.style.removeProperty('font-family');
    }

    const creatorPfp = getPfpSrc(creator, baseUrl);
    const creatorName = creator?.username || 'unknown';
    const coverUrl = getOptimizedWorldCardCoverUrl(getWorldCardCoverUrl(world, baseUrl));
    const currentUserId = getCurrentUser?.()?.id || null;
    const canEdit = typeof options.canEditWorld === 'function'
      ? Boolean(options.canEditWorld(world))
      : Boolean(currentUserId && currentUserId === world.user_id);
    const showMoveControl = Boolean(options.editMode && canEdit);
    const isPrivateView = world.is_public_view === false;
    const isPrivateEdit = world.is_public_edit === false;
    const hasPassword = Boolean(world.password_hash);
    const hasUpdate = worldNeedsManualUpdate(world, currentUserId) && !options.editMode;

    card.innerHTML = `
      <div class="post-card-content world-card-content">
        <div class="post-title world-card-title"><span class="post-title-track world-card-title-track">${escapeHtml(world.name || DEFAULT_WORLD_TITLE)}</span></div>
        <div class="world-card-orb-wrap">
          <div class="world-card-screen">
            <img class="world-card-cover" src="${escapeHtml(coverUrl)}" alt="" loading="lazy" decoding="async">
          </div>
          ${isPrivateView ? '<span class="world-card-badge world-card-badge--private">private</span>' : ''}
          ${isPrivateEdit ? '<span class="world-card-badge world-card-badge--locked">creator posts only</span>' : ''}
          ${hasPassword ? '<span class="world-card-badge world-card-badge--password">password</span>' : ''}
          ${hasUpdate ? '<button type="button" class="world-card-badge world-card-badge--update">update available</button>' : ''}
        </div>
      </div>
      <div class="post-footer world-card-footer">
        <img class="post-footer-pfp world-card-pfp" src="${escapeHtml(creatorPfp)}" alt="">
        <span class="post-footer-username post-footer-filter-btn"><span class="post-footer-username-track">${escapeHtml(creatorName)}</span></span>
        <span class="post-footer-category post-footer-filter-btn"><span class="post-footer-category-track">${escapeHtml(world.category || 'none')}</span></span>
      </div>
      ${hasUpdate ? '<button type="button" class="world-card-update-action">apply update</button>' : ''}
      ${showMoveControl ? `
        <div class="post-edit-chrome world-edit-chrome" aria-hidden="false">
          <div class="post-edit-top-actions" aria-label="world edit actions">
            <button class="post-edit-button post-edit-button-move world-card-move" type="button" title="move" aria-label="move world">𖦏</button>
          </div>
        </div>
      ` : ''}
    `;

    const titleElement = card.querySelector('.world-card-title');
    if (titleElement) {
      if (hasContainerFontColor) {
        titleElement.style.color = containerFontColor || '#000000';
      } else {
        titleElement.style.color = '#000000';
      }
    }

    applyWorldTitleMarquee(
      titleElement,
      card.querySelector('.world-card-title-track')
    );

    const coverScreen = card.querySelector('.world-card-screen');
    const coverImage = card.querySelector('.world-card-cover');
    if (coverScreen && coverImage) {
      coverScreen.classList.add('is-loading');

      const markReady = () => {
        coverScreen.classList.remove('is-loading');
        coverImage.removeEventListener('load', markReady);
        coverImage.removeEventListener('error', markReady);
      };

      if (coverImage.complete && coverImage.naturalWidth > 0) {
        markReady();
      } else {
        coverImage.addEventListener('load', markReady, { once: true });
        coverImage.addEventListener('error', markReady, { once: true });
      }
    }

    card.querySelector('.world-card-pfp')?.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (options.editMode) return;
      if (creator?.id) {
        await onOpenProfile?.(creator.id);
      }
    });

    if (!options.editMode) {
      card.querySelector('.post-footer-username')?.addEventListener('click', (event) => {
        event.stopPropagation();
        options.onFilterUser?.(creator?.id || null);
      });
      card.querySelector('.post-footer-category')?.addEventListener('click', (event) => {
        event.stopPropagation();
        options.onFilterCategory?.(world.category || null);
      });
    }

    card.querySelector('.world-card-move')?.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      options.onBeginMove?.(world, card, event);
    });

    card.querySelector('.world-card-move')?.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
    });

    card.querySelector('.world-card-move')?.addEventListener('click', (event) => {
      if (event.detail !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      const syntheticEvent = window.__lastMouseEventForPlacement || { clientX: 200, clientY: 200 };
      options.onBeginMove?.(world, card, syntheticEvent);
    });

    card.querySelector('.world-card-badge--update')?.addEventListener('click', (event) => {
      event.stopPropagation();
      const release = latestUpdateInfo;
      const releaseMessage = release
        ? `${release.version || 'latest'}\n\n${release.description || 'No details were provided.'}`
        : 'No release metadata is available yet.';
      alert(releaseMessage);
    });

    card.querySelector('.world-card-update-action')?.addEventListener('click', async (event) => {
      event.stopPropagation();
      await applyWorldUpdate(world);
    });

    card.addEventListener('click', async () => {
      if (options.editMode) return;
      await openWorldMode(world, creator);
    });

    return card;
  }

  function handleCheatCode(event) {
    if (event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (getIsEditMode?.()) {
      keyBuffer = '';
      return;
    }
    if (isTypingSurface()) {
      keyBuffer = '';
      return;
    }

    const key = String(event.key || '').toLowerCase();
    if (!/^[a-z]$/.test(key)) return;

    keyBuffer = `${keyBuffer}${key}`.slice(-WORLD_TRIGGER.length);
    if (keyBuffer === WORLD_TRIGGER) {
      keyBuffer = '';
      event.preventDefault();
      openMaker();
    }
  }

  function closeActiveUi() {
    if (isMakerOpen()) {
      closeMaker();
      return true;
    }
    return false;
  }

  dom.modePlugBtn.addEventListener('click', () => showStep('plug'));
  dom.modeCodeBtn.addEventListener('click', () => showStep('code'));
  dom.makerClose.addEventListener('click', closeMaker);
  dom.plugBack.addEventListener('click', () => showStep('mode'));
  dom.codeBack.addEventListener('click', () => showStep('mode'));
  dom.plugPublish.addEventListener('click', publishPlugWorld);
  dom.codePublish.addEventListener('click', publishCodeWorld);
  dom.codeDownload.addEventListener('click', downloadTemplateZip);
  dom.modeDelete.addEventListener('click', async () => {
    if (activeWorld) {
      await deleteWorld(activeWorld);
    }
  });
  dom.modeEdit.addEventListener('click', async () => {
    if (!activeWorld?.id) return;
    const latestWorld = await loadWorldById(activeWorld.id);
    openMakerForEdit(latestWorld || activeWorld);
  });
  dom.modeRecompress.addEventListener('click', async () => {
    const confirmed = typeof window.__prettyConfirm === 'function'
      ? await window.__prettyConfirm({
          title: 'recompress world covers?',
          message: 'This scans your worlds and recompresses their covers into faster-loading files.',
          confirmLabel: 'recompress',
          cancelLabel: 'cancel'
        })
      : window.confirm('Recompress your world covers?');

    if (!confirmed) return;

    const previousLabel = dom.modeRecompress.textContent;
    dom.modeRecompress.disabled = true;
    dom.modeRecompress.textContent = 'recompressing...';

    try {
      const report = await optimizeExistingWorldCovers();
      const beforeMB = (report.bytesBefore / (1024 * 1024)).toFixed(2);
      const afterMB = (report.bytesAfter / (1024 * 1024)).toFixed(2);
      const savedMB = ((report.bytesBefore - report.bytesAfter) / (1024 * 1024)).toFixed(2);
      const failurePreview = report.details.slice(0, 3)
        .map((item) => `${item.name || item.worldId}: ${item.reason}`)
        .join('\n');
      const failureSummary = report.failed > 0
        ? `\n\nfailures:\n${failurePreview}${report.details.length > 3 ? '\n...' : ''}`
        : '';
      alert(`covers recompressed\n\noptimized: ${report.optimized}/${report.totalWorlds}\nskipped: ${report.skipped}\nfailed: ${report.failed}\n\nsize before: ${beforeMB} MB\nsize after: ${afterMB} MB\nsaved: ${savedMB} MB${failureSummary}`);
      await onWorldCreated?.(activeWorld || null, { startPlacement: false });
    } catch (error) {
      alert(`Cover recompress failed: ${getErrorMessage(error)}`);
    } finally {
      dom.modeRecompress.disabled = false;
      dom.modeRecompress.textContent = previousLabel;
    }
  });
  dom.makerDelete.addEventListener('click', async () => {
    if (!makerEditingWorld?.id) return;
    await deleteWorld(makerEditingWorld, {
      includePosts: true,
      fromForm: true
    });
  });

  dom.passwordCancel?.addEventListener('click', () => {
    closePasswordPrompt(null);
  });

  dom.passwordSubmit?.addEventListener('click', () => {
    if (!passwordPromptState?.worldId) {
      closePasswordPrompt(null);
      return;
    }

    if (!dom.passwordInput) {
      closePasswordPrompt(null);
      return;
    }

    const nextPassword = dom.passwordInput.value.trim();
    if (!nextPassword) {
      if (dom.passwordError) dom.passwordError.textContent = 'Enter a password.';
      return;
    }

    closePasswordPrompt(nextPassword);
  });

  dom.passwordInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      dom.passwordSubmit?.click();
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closePasswordPrompt(null);
    }
  });

  dom.passwordOverlay?.addEventListener('click', (event) => {
    const isBackdropTarget = event.target === dom.passwordOverlay
      || event.target === dom.loaderBackdrop
      || event.target === dom.loaderWash;
    if (isBackdropTarget && dom.passwordOverlay?.dataset.mode === 'password') {
      closePasswordPrompt(null);
    }
  });

  dom.makerOverlay.addEventListener('click', (event) => {
    if (event.target === dom.makerOverlay) {
      closeMaker();
    }
  });

  dom.plugCover.addEventListener('change', () => {
    dom.plugCoverLabel.textContent = dom.plugCover.files?.[0]?.name || 'use world background as cover';
  });
  dom.plugBackground.addEventListener('change', () => {
    dom.plugBackgroundLabel.textContent = dom.plugBackground.files?.[0]?.name || 'use site background';
  });
  dom.codeHtml.addEventListener('change', () => {
    dom.codeHtmlLabel.textContent = dom.codeHtml.files?.[0]?.name || 'choose html';
  });
  dom.codeCss.addEventListener('change', () => {
    dom.codeCssLabel.textContent = dom.codeCss.files?.[0]?.name || 'choose css';
  });

  fillFontSelect();
  syncCategories();
  document.addEventListener('keydown', handleCheatCode);
  hydrateMyWorlds().catch((error) => {
    console.warn('Failed to hydrate My Worlds:', error);
  });
  renderMainNavigationChrome().catch((error) => {
    console.warn('Failed to render main navigation chrome:', error);
  });

  return {
    loadWorlds,
    buildWorldCard,
    showTransitionLoader,
    hideTransitionLoader,
    setWorldLoaderProgress,
    syncCategories,
    closeActiveUi,
    isMakerOpen,
    isInWorldMode,
    openWorldById,
    optimizeExistingWorldBackgrounds,
    optimizeExistingWorldCovers,
    refreshActiveWorldChrome: async (nextWorld = null) => {
      if (nextWorld && activeWorld && nextWorld.id === activeWorld.id) {
        activeWorld = nextWorld;
      }
      if (activeWorld && activeWorldCreator && isInWorldMode()) {
        renderWorldModeChrome(activeWorld, activeWorldCreator);
      } else {
        await renderMainNavigationChrome();
      }
    }
  };
}
