import JSZip from 'jszip';

const WORLD_TRIGGER = 'world';
const WORLD_BUCKET = 'worlds';
const WORLD_QUERY_PARAM = 'world';
const MY_WORLDS_STORAGE_PREFIX = 'demo0-my-worlds-v1';
const MY_WORLDS_LIMIT = 48;
const DEFAULT_UI_COLOR = '#cfd8e3';
const DEFAULT_WORLD_TITLE = 'untitled world';
const DEFAULT_WORLD_DESCRIPTION = 'No description yet.';

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
                <span>background image</span>
                <label class="world-maker-upload">
                  <span id="worldPlugBackgroundLabel">use site background</span>
                  <input type="file" id="worldPlugBackground" accept="image/*">
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
      </div>
    </div>

    <div class="world-mode-chrome" id="worldModeChrome" style="display:none;">
      <div class="world-mode-tabs" id="worldModeTabs" role="tablist" aria-label="world navigation">
        <button type="button" class="world-mode-tab world-mode-tab-main" id="worldModeClose" role="tab" aria-selected="false">main</button>
        <button type="button" class="world-mode-tab world-mode-tab-active" id="worldModeActiveTab" role="tab" aria-selected="true">world</button>
      </div>
      <div class="world-mode-myworlds-menu" id="worldModeMyWorldsMenu" style="display:none;"></div>
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

    <div class="world-password-overlay" id="worldPasswordOverlay" style="display:none;">
      <div class="world-password-modal" id="worldPasswordModal">
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
    modeTabs: host.querySelector('#worldModeTabs'),
    modeClose: host.querySelector('#worldModeClose'),
    modeActiveTab: host.querySelector('#worldModeActiveTab'),
    modeMyWorldsMenu: host.querySelector('#worldModeMyWorldsMenu'),
    modeDelete: host.querySelector('#worldModeDelete'),
    modePfpWrap: host.querySelector('.world-mode-pfp-wrap'),
    modePfp: host.querySelector('#worldModePfp'),
    modeIdentityPanel: host.querySelector('.world-mode-identity-panel'),
    modeName: host.querySelector('#worldModeName'),
    modeDescription: host.querySelector('#worldModeDescription'),
    modeFrame: host.querySelector('#worldModeFrame'),
    passwordOverlay: host.querySelector('#worldPasswordOverlay'),
    passwordModal: host.querySelector('#worldPasswordModal'),
    passwordTitle: host.querySelector('#worldPasswordTitle'),
    passwordCopy: host.querySelector('#worldPasswordCopy'),
    passwordInput: host.querySelector('#worldPasswordInput'),
    passwordError: host.querySelector('#worldPasswordError'),
    passwordCancel: host.querySelector('#worldPasswordCancel'),
    passwordSubmit: host.querySelector('#worldPasswordSubmit')
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

  async function renderWorldNavigation(world) {
    clearWorldTabs();

    if (!world || !dom.modeTabs) return;

    dom.modeClose.style.display = '';
    dom.modeClose.textContent = 'main';
    dom.modeClose.dataset.worldNav = 'main';
    dom.modeClose.dataset.worldId = '';
    dom.modeClose.classList.remove('world-mode-tab-active');
    dom.modeClose.setAttribute('aria-selected', 'false');
    dom.modeActiveTab.textContent = world.name || DEFAULT_WORLD_TITLE;
    dom.modeActiveTab.dataset.worldNav = 'current';
    dom.modeActiveTab.dataset.worldId = String(world.id || '');
    dom.modeActiveTab.classList.add('world-mode-tab-active');
    dom.modeActiveTab.setAttribute('aria-selected', 'true');
    parentTabAction = async () => {
      await exitWorldMode();
    };

    worldNavStack.slice(0, -1).forEach((stackWorld) => {
      const stackWorldId = String(stackWorld?.id || '').trim();
      if (!stackWorldId) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'world-mode-tab world-mode-tab-crumb';
      button.setAttribute('role', 'tab');
      button.dataset.worldNav = 'crumb';
      button.dataset.worldId = stackWorldId;
      button.textContent = stackWorld.name || DEFAULT_WORLD_TITLE;
      button.setAttribute('aria-selected', 'false');
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        await openWorldById(stackWorldId);
      });

      dom.modeActiveTab.before(button);
    });
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
    const canDelete = currentUserId && currentUserId === world.user_id && inEditMode;
    const worldFont = world.font_family || 'inherit';
    const worldColor = world.font_color || 'inherit';
    const useCustomFrame = canUseCustomWorldFrame(world);

    dom.modeName.textContent = world.name || DEFAULT_WORLD_TITLE;
    dom.modeDescription.textContent = world.description || DEFAULT_WORLD_DESCRIPTION;
    dom.modeActiveTab.textContent = world.name || DEFAULT_WORLD_TITLE;
    dom.modeChrome.style.setProperty('--world-mode-font-family', worldFont);
    dom.modeChrome.style.setProperty('--world-mode-font-color', worldColor);
    dom.modePfp.src = creatorPfp;
    dom.modePfp.onclick = creator?.id ? () => onOpenProfile?.(creator.id) : null;
    dom.modePfp.style.cursor = creator?.id ? 'pointer' : '';
    if (dom.modePfpWrap) dom.modePfpWrap.style.display = '';
    if (dom.modeIdentityPanel) dom.modeIdentityPanel.style.display = '';
    dom.modeClose.style.display = '';
    dom.modeTabs.style.display = inEditMode ? 'none' : 'inline-flex';
    dom.modeDelete.style.display = canDelete ? 'inline-flex' : 'none';
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
    dom.modeTabs.style.display = 'inline-flex';
    dom.modeDelete.style.display = 'none';
    dom.modeFrame.style.display = 'none';
    dom.modeFrame.src = 'about:blank';
    if (dom.modeMyWorldsMenu) dom.modeMyWorldsMenu.style.display = 'none';

    if (dom.modePfpWrap) dom.modePfpWrap.style.display = 'none';
    if (dom.modeIdentityPanel) dom.modeIdentityPanel.style.display = 'none';

    dom.modeClose.style.display = 'none';
    dom.modeClose.textContent = 'main';
    dom.modeClose.dataset.worldNav = 'main';
    dom.modeClose.dataset.worldId = '';
    dom.modeActiveTab.textContent = 'main';
    parentTabAction = async () => {};
  }

  function clearWorldTabs() {
    Array.from(dom.modeTabs.querySelectorAll('[data-world-nav]')).forEach((button) => {
      if (button === dom.modeClose || button === dom.modeActiveTab) return;
      button.remove();
    });
  }

  function setPasswordPromptVisible(visible) {
    if (!dom.passwordOverlay) return;
    dom.passwordOverlay.style.display = visible ? 'flex' : 'none';
    if (!visible) {
      if (dom.passwordInput) dom.passwordInput.value = '';
      if (dom.passwordError) dom.passwordError.textContent = '';
    }
  }

  function showPasswordPrompt(world, message = '') {
    return new Promise((resolve) => {
      passwordPromptState = { resolve, worldId: world?.id || null };
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

  async function openWorldById(worldId) {
    const nextWorld = await loadWorldById(worldId);
    if (!nextWorld) {
      pruneRememberedWorld(worldId);
      alert('Could not load that world.');
      return;
    }

    const nextCreator = await resolveWorldCreator(nextWorld);
    await openWorldMode(nextWorld, nextCreator);
  }

  function clearWorldModeChrome() {
    dom.modeChrome.style.display = 'none';
    dom.modeChrome.style.removeProperty('--world-mode-font-family');
    dom.modeChrome.style.removeProperty('--world-mode-font-color');
    dom.modeActiveTab.textContent = 'world';
    dom.modeTabs.style.display = '';
    dom.modeDelete.style.display = 'none';
    dom.modeFrame.style.display = 'none';
    dom.modeFrame.src = 'about:blank';
    dom.modeClose.style.display = '';
    if (dom.modePfpWrap) dom.modePfpWrap.style.display = '';
    if (dom.modeIdentityPanel) dom.modeIdentityPanel.style.display = '';
    if (dom.modeMyWorldsMenu) dom.modeMyWorldsMenu.style.display = 'none';
  }

  async function loadWorlds(filters = {}) {
    await ensureLatestUpdateInfo();

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
  }

  async function ensureLatestUpdateInfo(force = false) {
    if (latestUpdateInfo && !force) return latestUpdateInfo;

    const { data, error } = await supabase
      .from('updates')
      .select('id, version, description, released_at')
      .order('released_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Failed to load update metadata:', error);
      latestUpdateInfo = null;
      return null;
    }

    latestUpdateInfo = data || null;
    return latestUpdateInfo;
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

    const currentUserId = getCurrentUser?.()?.id || null;
    if (world.is_public_view === false && currentUserId !== world.user_id) {
      alert('This world is private.');
      return;
    }

    if (world.password_hash && !currentUserId) {
      alert('Sign in to unlock this world.');
      return;
    }

    if (world.password_hash && currentUserId) {
      const hasAccess = await verifyWorldAccess(world.id, currentUserId);
      if (!hasAccess) {
        let nextMessage = '';

        while (true) {
          const password = await showPasswordPrompt(world, nextMessage);
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

    activeWorld = world;
    activeWorldCreator = await resolveWorldCreator(world, creator);
    updateWorldNavStack(world);
    await hydrateMyWorlds();
    await rememberWorld(world);
    setWorldUrl(world.id);

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
  }

  async function exitWorldMode() {
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

  async function deleteWorld(world) {
    const confirmed = typeof window.__prettyConfirm === 'function'
      ? await window.__prettyConfirm({
          title: 'delete world?',
          message: 'This removes the world from the feed. Existing uploaded assets may remain in storage if bucket policies block cleanup.',
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
    } catch (cleanupError) {
      console.warn('World asset cleanup skipped:', cleanupError?.message || cleanupError);
    }

    pruneRememberedWorld(world.id);

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
    const { error: uploadError } = await supabase.storage
      .from(WORLD_BUCKET)
      .upload(storagePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(WORLD_BUCKET).getPublicUrl(storagePath);
    return data.publicUrl;
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
      if (bgFile) {
        const backgroundUrl = await uploadWorldFile(
          nextWorld.id,
          `background-${Date.now()}-${normalizeStorageName(bgFile.name)}`,
          bgFile
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
      alert(`World save failed: ${error.message}`);
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
      alert(`World save failed: ${error.message}`);
    } finally {
      publishInFlight = false;
      dom.codePublish.disabled = false;
      dom.codePublish.textContent = makerMode === 'edit' ? 'update world' : 'publish world';
    }
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
    const fallbackX = 60 + (idx % 4) * 340;
    const fallbackY = 60 + Math.floor(idx / 4) * 280;
    card.style.left = `${options.x ?? fallbackX}px`;
    card.style.top = `${options.y ?? fallbackY}px`;
    card.style.setProperty('--world-ui-color', getWorldAccent(world));

    const creatorPfp = getPfpSrc(creator, baseUrl);
    const creatorName = creator?.username || 'unknown';
    const coverUrl = String(world.background_url || '').trim() || getDefaultBackgroundUrl(baseUrl);
    const currentUserId = getCurrentUser?.()?.id || null;
    const canEdit = currentUserId && currentUserId === world.user_id;
    const canDelete = currentUserId && currentUserId === world.user_id;
    const isPrivateView = world.is_public_view === false;
    const isPrivateEdit = world.is_public_edit === false;
    const hasPassword = Boolean(world.password_hash);
    const hasUpdate = worldNeedsManualUpdate(world, currentUserId);

    card.innerHTML = `
      <div class="post-card-content world-card-content">
        <div class="world-card-screen" style="background-image:url('${escapeHtml(coverUrl)}');">
          <div class="world-card-title">${escapeHtml(world.name || DEFAULT_WORLD_TITLE)}</div>
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
      ${options.editMode && canEdit ? '<button type="button" class="world-card-move">move</button>' : ''}
      ${canEdit ? '<button type="button" class="world-card-edit">edit</button>' : ''}
      ${options.editMode && canDelete ? '<button type="button" class="world-card-delete">x</button>' : ''}
    `;

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

    card.querySelector('.world-card-delete')?.addEventListener('click', async (event) => {
      event.stopPropagation();
      await deleteWorld(world);
    });

    card.querySelector('.world-card-edit')?.addEventListener('click', (event) => {
      event.stopPropagation();
      openMakerForEdit(world);
    });

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
  dom.modeClose.addEventListener('click', async () => {
    await parentTabAction();
  });
  dom.modeDelete.addEventListener('click', async () => {
    if (activeWorld) {
      await deleteWorld(activeWorld);
    }
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
    if (event.target === dom.passwordOverlay) {
      closePasswordPrompt(null);
    }
  });

  dom.makerOverlay.addEventListener('click', (event) => {
    if (event.target === dom.makerOverlay) {
      closeMaker();
    }
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
    syncCategories,
    closeActiveUi,
    isMakerOpen,
    isInWorldMode,
    openWorldById,
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
