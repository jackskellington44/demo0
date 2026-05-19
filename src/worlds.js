import JSZip from 'jszip';

const WORLD_TRIGGER = 'world';
const WORLD_BUCKET = 'worlds';
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
    codeBack: host.querySelector('#worldCodeBack'),
    codePublish: host.querySelector('#worldCodePublish'),
    codeDownload: host.querySelector('#worldCodeDownload'),
    modePlugBtn: host.querySelector('#worldModePlugBtn'),
    modeCodeBtn: host.querySelector('#worldModeCodeBtn'),
    modeChrome: host.querySelector('#worldModeChrome'),
    modeTabs: host.querySelector('#worldModeTabs'),
    modeClose: host.querySelector('#worldModeClose'),
    modeActiveTab: host.querySelector('#worldModeActiveTab'),
    modeDelete: host.querySelector('#worldModeDelete'),
    modePfp: host.querySelector('#worldModePfp'),
    modeName: host.querySelector('#worldModeName'),
    modeDescription: host.querySelector('#worldModeDescription'),
    modeFrame: host.querySelector('#worldModeFrame')
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
    dom.plugName.value = '';
    dom.plugDescription.value = '';
    dom.plugFont.value = '';
    dom.plugFontColor.value = '#f5f5f5';
    dom.plugBackground.value = '';
    dom.plugBackgroundLabel.textContent = 'use site background';
    dom.codeHtml.value = '';
    dom.codeCss.value = '';
    dom.codeHtmlLabel.textContent = 'choose html';
    dom.codeCssLabel.textContent = 'choose css';
    dom.codeName.value = '';
    dom.codeDescription.value = '';
    syncCategories();
    showStep('mode');
  }

  function openMaker() {
    syncCategories();
    fillFontSelect();
    dom.makerOverlay.style.display = 'flex';
    showStep('mode');
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
    const worldColor = world.font_color || 'rgba(255,255,255,0.96)';

    dom.modeName.textContent = world.name || DEFAULT_WORLD_TITLE;
    dom.modeDescription.textContent = world.description || DEFAULT_WORLD_DESCRIPTION;
    dom.modeActiveTab.textContent = world.name || DEFAULT_WORLD_TITLE;
    dom.modeChrome.style.setProperty('--world-mode-font-family', worldFont);
    dom.modeChrome.style.setProperty('--world-mode-font-color', worldColor);
    dom.modePfp.src = creatorPfp;
    dom.modePfp.onclick = creator?.id ? () => onOpenProfile?.(creator.id) : null;
    dom.modePfp.style.cursor = creator?.id ? 'pointer' : '';
    dom.modeTabs.style.display = inEditMode ? 'none' : 'inline-flex';
    dom.modeDelete.style.display = canDelete ? 'inline-flex' : 'none';
    dom.modeFrame.style.display = world.custom_code_url ? 'block' : 'none';
    dom.modeFrame.src = world.custom_code_url || 'about:blank';
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
  }

  async function loadWorlds(filters = {}) {
    let query = supabase
      .from('worlds')
      .select('id, user_id, name, description, category, background_url, custom_code_url, font_family, font_color, ui_color, is_public_view, is_public_edit, created_at')
      .order('created_at', { ascending: false });

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
    activeWorld = world;
    activeWorldCreator = await resolveWorldCreator(world, creator);

    renderWorldModeChrome(world, activeWorldCreator);
    dom.modeChrome.style.display = 'block';

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
    clearWorldModeChrome();
    await onExitWorld?.();
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

    if (activeWorld?.id === world.id) {
      await exitWorldMode();
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

    publishInFlight = true;
    dom.plugPublish.disabled = true;
    dom.plugPublish.textContent = 'publishing...';

    try {
      const uiColor = dom.plugFontColor.value || DEFAULT_UI_COLOR;
      const draft = {
        user_id: currentUser.id,
        name,
        description,
        category,
        background_url: null,
        custom_code_url: null,
        font_family: dom.plugFont.value || null,
        font_color: dom.plugFontColor.value || null,
        ui_color: uiColor,
        is_public_view: dom.plugVisibility.value !== 'false',
        is_public_edit: dom.plugEditing.value !== 'false'
      };

      const { data: inserted, error: insertError } = await supabase
        .from('worlds')
        .insert([draft])
        .select('*')
        .single();

      if (insertError) throw insertError;

      let nextWorld = inserted;
      const bgFile = dom.plugBackground.files?.[0] || null;
      if (bgFile) {
        const backgroundUrl = await uploadWorldFile(
          inserted.id,
          `background-${Date.now()}-${normalizeStorageName(bgFile.name)}`,
          bgFile
        );

        const { data: updated, error: updateError } = await supabase
          .from('worlds')
          .update({ background_url: backgroundUrl })
          .eq('id', inserted.id)
          .select('*')
          .single();

        if (updateError) throw updateError;
        nextWorld = updated;
      }

      closeMaker();
      await onWorldCreated?.(nextWorld);
    } catch (error) {
      alert(`World publish failed: ${error.message}`);
    } finally {
      publishInFlight = false;
      dom.plugPublish.disabled = false;
      dom.plugPublish.textContent = 'publish world';
    }
  }

  async function publishCodeWorld() {
    if (publishInFlight) return;

    const name = dom.codeName.value.trim();
    const description = dom.codeDescription.value.trim();
    const category = dom.codeCategory.value.trim();
    const htmlFile = dom.codeHtml.files?.[0] || null;
    const cssFile = dom.codeCss.files?.[0] || null;

    if (!name || !description || !category || !htmlFile || !cssFile) {
      alert('Upload world.html and world.css, then fill in name, description, and category.');
      return;
    }

    const currentUser = getCurrentUser?.();
    if (!currentUser?.id) return;

    publishInFlight = true;
    dom.codePublish.disabled = true;
    dom.codePublish.textContent = 'publishing...';

    try {
      const { data: inserted, error: insertError } = await supabase
        .from('worlds')
        .insert([{
          user_id: currentUser.id,
          name,
          description,
          category,
          background_url: null,
          custom_code_url: null,
          font_family: null,
          font_color: null,
          ui_color: DEFAULT_UI_COLOR,
          is_public_view: dom.codeVisibility.value !== 'false',
          is_public_edit: dom.codeEditing.value !== 'false'
        }])
        .select('*')
        .single();

      if (insertError) throw insertError;

      const htmlUrl = await uploadWorldFile(inserted.id, 'world.html', htmlFile);
      await uploadWorldFile(inserted.id, 'world.css', cssFile);

      const { data: updated, error: updateError } = await supabase
        .from('worlds')
        .update({ custom_code_url: htmlUrl })
        .eq('id', inserted.id)
        .select('*')
        .single();

      if (updateError) throw updateError;

      closeMaker();
      await onWorldCreated?.(updated);
    } catch (error) {
      alert(`World publish failed: ${error.message}`);
    } finally {
      publishInFlight = false;
      dom.codePublish.disabled = false;
      dom.codePublish.textContent = 'publish world';
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
    const canDelete = currentUserId && currentUserId === world.user_id;
    const isPrivateView = world.is_public_view === false;
    const isPrivateEdit = world.is_public_edit === false;

    card.innerHTML = `
      <div class="post-card-content world-card-content">
        <div class="world-card-screen" style="background-image:url('${escapeHtml(coverUrl)}');">
          <div class="world-card-title">${escapeHtml(world.name || DEFAULT_WORLD_TITLE)}</div>
          ${isPrivateView ? '<span class="world-card-badge world-card-badge--private">private</span>' : ''}
          ${isPrivateEdit ? '<span class="world-card-badge world-card-badge--locked">creator posts only</span>' : ''}
        </div>
      </div>
      <div class="post-footer world-card-footer">
        <img class="post-footer-pfp world-card-pfp" src="${escapeHtml(creatorPfp)}" alt="">
        <span class="post-footer-username post-footer-filter-btn"><span class="post-footer-username-track">${escapeHtml(creatorName)}</span></span>
        <span class="post-footer-category post-footer-filter-btn"><span class="post-footer-category-track">${escapeHtml(world.category || 'none')}</span></span>
      </div>
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
  dom.modeClose.addEventListener('click', () => {
    exitWorldMode();
  });
  dom.modeDelete.addEventListener('click', async () => {
    if (activeWorld) {
      await deleteWorld(activeWorld);
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

  return {
    loadWorlds,
    buildWorldCard,
    syncCategories,
    closeActiveUi,
    isMakerOpen,
    isInWorldMode,
    refreshActiveWorldChrome: async (nextWorld = null) => {
      if (nextWorld && activeWorld && nextWorld.id === activeWorld.id) {
        activeWorld = nextWorld;
      }
      if (activeWorld && activeWorldCreator && isInWorldMode()) {
        renderWorldModeChrome(activeWorld, activeWorldCreator);
      }
    }
  };
}
