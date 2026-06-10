// ============================================
// MAIN APP FILE MAP
// ============================================
// TABLE OF CONTENTS:
//
//  1. IMPORTS + DOM REFERENCES
//  2. APP STATE
//  3. LINK GRAPH HELPERS
//  4. CANVAS VIEWPORT + PLACEMENT STATE
//  5. CANVAS TRANSFORMS + PLACEMENT HELPERS
//  6. AUTH + USER BOOTSTRAP
//  7. FILE CLASSIFICATION
//  8. POST FORM + OVERLAY HELPERS
//  9. BODY CONTENT + EMBED HELPERS
// 10. POST DETAIL LAYOUT HELPERS
// 11. POST EDITING FLOW
// 12. CATEGORY MANAGEMENT
// 13. POST LINK DATA + SVG RENDERING
// 14. NOTIFICATIONS
// 15. PROFILE MODAL FLOW
// 16. POST SUBMISSION FLOW
// 17. COVER IMAGE PROMPT FLOW
// 18. POST PERSISTENCE
// 19. COMMENTS FLOW
// 20. POST LOADING + CANVAS RENDERING
// 21. FILE PREVIEW HELPERS
// 22. POST CARD COMPOSITION
// 23. GLOBAL EVENT WIRING
// 24. APP BOOTSTRAP
//
// ============================================

// ============================================
// 1. IMPORTS + DOM REFERENCES
// ============================================

import { supabase } from './supabase-config.js';
import { installPrettyAlerts } from './ui-alerts.js';
import { initWorldsFeature } from './worlds.js';

import { initMusic, setMusicWorldContext } from './music.js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';
import nspell from 'nspell';
import enAff from './spell/en.aff?raw';
import enDic from './spell/en.dic?raw';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// DOM REFERENCES

const mainPageContainer = document.getElementById('mainPageContainer');

// Canvas (new)
const postCanvas = document.getElementById('postCanvas');
const categoryLayer = document.getElementById('categoryLayer');
const linkLayer = document.getElementById('linkLayer');
const SNAP_ALIGN_THRESHOLD = 18; // px in canvas units — tweak to taste


// (legacy) if still in HTML; not used anymore once canvas is wired
const postFeed = document.getElementById('postFeed');

// Post form overlay
const postDeleteBtn = document.getElementById('postDeleteBtn');
const postFormOverlay = document.getElementById('postFormOverlay');
const postTitle = document.getElementById('postTitle');
const postCategory = document.getElementById('postCategory');
const postCategoryDisplay = document.getElementById('postCategoryDisplay');
const postCategoryDisplayText = document.getElementById('postCategoryDisplayText');
const postCategoryDropdown = document.getElementById('postCategoryDropdown');
const postCategoryInput = document.getElementById('postCategoryInput');
const addCategoryToggle = document.getElementById('addCategoryToggle');
const postCategoryPanel = document.getElementById('postCategoryPanel');
const postCategoryPanelClose = document.getElementById('postCategoryPanelClose');
const postCategoryCreateBtn = document.getElementById('postCategoryCreateBtn');
const postCategoryList = document.getElementById('postCategoryList');
const postFileInput = document.getElementById('postFileInput');
const postFileName = document.getElementById('postFileName');
const postText = document.getElementById('postText');
const postSubmitBtn = document.getElementById('postSubmitBtn');
const postCancelBtn = document.getElementById('postCancelBtn');

// Log out
const logoutBtn = document.getElementById('logoutBtn');

// Cover image prompt
const postCoverImageLabel = document.getElementById('postCoverImageLabel');
const postCoverImageInput = document.getElementById('postCoverImageInput');
const postCoverFileName   = document.getElementById('postCoverFileName');
const postYoutubeInput    = document.getElementById('postYoutubeInput');

// Post detail modal
const postDetailOverlay = document.getElementById('postDetailOverlay');
const postDetailModal = document.getElementById('postDetailModal');
const postDetailContent = document.getElementById('postDetailContent');
const commentsList = document.getElementById('commentsList');
const commentInput = document.getElementById('commentInput');
const commentSubmitBtn = document.getElementById('commentSubmitBtn');

// Notification panel
const notifBar   = document.getElementById('notifBar');
const notifPanel = document.getElementById('notifPanel');
const notifList  = document.getElementById('notifList');

// Profile Modal 

const profileOverlay = document.getElementById('profileOverlay');

// ============================================
// 2. APP STATE
// ============================================

let currentUser = null;
let currentUserData = null;
let mentionUserMapCache = null;
let mentionUserMapPromise = null;
let mentionAliasMapCache = null;
let postTextMentionRefreshRaf = 0;
let postSpellChecker = null;
const postSpellIgnoreAll = new Set();
const postSpellIgnoreOne = new Set();
const postSpellFieldIgnoreMap = new WeakMap();
const postSpellFieldRangesMap = new WeakMap();
let postSpellMenuState = {
  tokenEl: null,
  key: '',
  normalizedWord: '',
  suggestion: '',
  fieldEl: null,
  rangeStart: -1,
  rangeEnd: -1
};

// Link creation state: if you right-click a post, new post links to it
let pendingLinkPostId = null;
let activeThreadSourcePostId = null; // edit-mode source post for multi-thread linking
const selectedEditPostIds = new Set();

const POST_SCALE_STORAGE_KEY = 'demo4-post-scales-v1';
const POST_SCALE_MIN = 0.6;
const POST_SCALE_MAX = 2.2;
let postScaleMapLoaded = false;
let postScaleById = {};
let categoryNetworkRafId = 0;
let pendingCategoryNetworkPosts = [];

const CATEGORY_NETWORK_PASTELS = [
  'hsla(274, 42%, 74%, 0.72)', // pastel purple
  'hsla(126, 34%, 74%, 0.72)', // pastel green
  'hsla(208, 42%, 74%, 0.72)', // pastel blue
  'hsla(31, 52%, 72%, 0.72)',  // pastel orange
  'hsla(286, 36%, 72%, 0.72)',
  'hsla(138, 30%, 72%, 0.72)',
  'hsla(218, 36%, 72%, 0.72)',
  'hsla(38, 46%, 70%, 0.72)'
];

// Post create/edit state
let pendingPost = null;
let editMode = false;
let editingPostId   = null;
let editingPost     = null; // full original post row, used to preserve untouched file fields
let categoryRecords = [];
let editingCategoryName = null;
let categoryColorColumn = null;
let categoryColorPickerElements = null;
let categoryColorPickerState = {
  categoryName: null,
  h: 210,
  s: 0.35,
  v: 0.84
};

const THEME_COLOR_KEY = 'demo4-ui-tint-v1';
let themePickerOpen = false;
let themeColorState = { h: 0, s: 0, v: 0 };

const CATEGORY_COLOR_COLUMN_CANDIDATES = [
  'thread_color',
  'color',
  'line_color',
  'network_color'
];

// Filters (normal mode only)
let activeUserFilter = null;      // user_id
let activeCategoryFilter = null;  // category name or NONE_CATEGORY_FILTER
const NONE_CATEGORY_FILTER = '__NONE__';


// Modal state
let activePostForModal = null;

// Double right-click detection
let lastRightClick = 0;
const DOUBLE_CLICK_THRESHOLD = 400; // ms

// Cache last loaded data for re-rendering link lines on pan/zoom/move
let lastLoadedPosts = [];
let lastLoadedLinks = [];

let activeLinkTreeRootPostId = null; // any post id inside the selected connected component

// Profile modal state
let profileEditMode       = false;
let newProfileCoverFile   = null;
let newProfilePfpFile     = null;
let currentProfileUserId  = null;

// Post detail 3-col layout state
let pdColWidths   = { visual: 50, text: 30, comments: 20 };
let pdFullscreen  = false;
let _pdHasVisual  = false;
let _pdHasText    = false;
let pdVisualNavController = null;
let pdHoveredRegion = null;
let pdModalInteractionCleanup = null;
let pdAttachmentCleanup = null;
let pdCommentsCollapsed = false;
let pdContextMenuState = { file: null, files: [] };
let pdVisualZoom = 1;
let pdVisualPanX = 0;
let pdVisualPanY = 0;
let pdPdfRenderToken = 0;

const PD_MIN_ZOOM = 1;
const PD_MAX_ZOOM = 4;
const PD_ZOOM_STEP = 0.18;

const UI_STATE_STORAGE_PREFIX = 'demo4-main-ui-state-v1';
const UI_STATE_QUICK_KEY = 'demo4-main-ui-state-quick-v1';
const UI_STATE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 3;
const DEFAULT_BOOT_SCALE = 0.14;
const DEFAULT_BG_URL = `${import.meta.env.BASE_URL}images/background.jpg`;
const DEFAULT_PFP_URL = `${import.meta.env.BASE_URL}images/pfps/default.png`;
const USE_DEFAULT_FOR_SUPABASE_PFP = true;

let restoredUiState = null;
let restoreInFlight = false;
let uiPersistTimer = null;
let realtimeRefreshTimer = null;
let realtimeNeedsLinks = false;
let mainRealtimeChannel = null;
let lastLoadedWorlds = [];
let worldsFeature = null;
let activeWorldContext = null;
let postsLoadSequence = 0;
const LINK_SCOPE_CHUNK_SIZE = 120;
let loadPostsInFlightPromise = null;
let loadPostsInFlightKey = '';
let worldModeReloadTimer = null;
let worldModeReloadResolve = null;
let worldModeReloadSeq = 0;
let worldModeTransitionPromise = null;
let worldModeTransitionKey = '';
let notificationsLoadPromise = null;
let notificationsLastRequestAt = 0;
let notificationsRetryAfter = 0;
const USER_PROFILE_CACHE_TTL_MS = 60000;
const userProfileCache = new Map();
const userProfileInFlight = new Map();
const POST_RECORD_CACHE_TTL_MS = 30000;
const postRecordCache = new Map();
const postRecordInFlight = new Map();
const FEED_SNAPSHOT_CACHE_TTL_MS = 75000;
const FEED_WIREFRAME_CARD_COUNT = 10;
const feedSnapshotCache = new Map();
const AUTO_FREEZE_MIN_BOOT_MS = 1600;
const AUTO_FREEZE_MAX_BOOT_MS = 9000;
let autoFreezeActive = false;
let autoFreezeReleaseTimer = 0;
let autoFreezeFailsafeTimer = 0;

function getEffectiveAnimationMode() {
  return autoFreezeActive ? 'off' : animationMode;
}

function shouldHardFreezeMotion() {
  return editMode || getEffectiveAnimationMode() === 'off';
}

function isSuperFastStableConnection() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return false;

  if (conn.saveData) return false;

  const effectiveType = String(conn.effectiveType || '').toLowerCase();
  const downlink = Number(conn.downlink || 0);
  const rtt = Number(conn.rtt || 0);

  const fastType = effectiveType === '4g' || effectiveType === '';
  const fastDownlink = downlink >= 20;
  const fastRtt = rtt > 0 && rtt <= 80;

  return fastType && fastDownlink && fastRtt;
}

function clearAutoFreezeTimers() {
  if (autoFreezeReleaseTimer) {
    window.clearTimeout(autoFreezeReleaseTimer);
    autoFreezeReleaseTimer = 0;
  }
  if (autoFreezeFailsafeTimer) {
    window.clearTimeout(autoFreezeFailsafeTimer);
    autoFreezeFailsafeTimer = 0;
  }
}

function setAutoFreezeActive(next) {
  const value = Boolean(next);
  if (autoFreezeActive === value) return;
  autoFreezeActive = value;
  applyAnimationMode(animationMode, { persist: false });
}

function scheduleAutoFreezeRelease(extraPromises = []) {
  if (!autoFreezeActive) return;

  clearAutoFreezeTimers();
  const startAt = performance.now();
  const work = [
    loadPostsInFlightPromise || Promise.resolve(),
    ...(Array.isArray(extraPromises) ? extraPromises : [])
  ];

  Promise.allSettled(work).finally(() => {
    const elapsed = performance.now() - startAt;
    const waitMs = Math.max(0, AUTO_FREEZE_MIN_BOOT_MS - elapsed);
    autoFreezeReleaseTimer = window.setTimeout(() => {
      setAutoFreezeActive(false);
    }, waitMs);
  });

  autoFreezeFailsafeTimer = window.setTimeout(() => {
    setAutoFreezeActive(false);
  }, AUTO_FREEZE_MAX_BOOT_MS);
}

function enforceFrozenMediaState() {
  const shouldFreeze = shouldHardFreezeMotion();
  const videos = document.querySelectorAll('.post-preview-video, .pd-visual-video');

  videos.forEach((video) => {
    if (!(video instanceof HTMLVideoElement)) return;

    if (shouldFreeze) {
      video.pause();
      video.removeAttribute('autoplay');
      return;
    }

    if (video.classList.contains('post-preview-video')) {
      if (!video.hasAttribute('autoplay')) {
        video.setAttribute('autoplay', '');
      }
    }
  });
}

function getLoadPostsRequestKey() {
  return JSON.stringify({
    worldId: activeWorldContext?.world?.id || null,
    editMode: Boolean(editMode),
    activeUserFilter: activeUserFilter || null,
    activeCategoryFilter: activeCategoryFilter || null,
    activeLinkTreeRootPostId: activeLinkTreeRootPostId || null
  });
}

function cloneFeedRows(rows = []) {
  return (rows || []).map((row) => ({ ...row }));
}

function pruneFeedSnapshotCache(now = Date.now()) {
  for (const [cacheKey, snapshot] of feedSnapshotCache.entries()) {
    if (!snapshot || (now - snapshot.ts) > FEED_SNAPSHOT_CACHE_TTL_MS) {
      feedSnapshotCache.delete(cacheKey);
    }
  }
}

function getFeedSnapshot(cacheKey) {
  const now = Date.now();
  pruneFeedSnapshotCache(now);
  const snapshot = feedSnapshotCache.get(cacheKey);
  if (!snapshot) return null;
  return snapshot;
}

function setFeedSnapshot(cacheKey, payload = {}) {
  const posts = cloneFeedRows(payload.posts || []);
  const worlds = cloneFeedRows(payload.worlds || []);
  const userMap = { ...(payload.userMap || {}) };
  feedSnapshotCache.set(cacheKey, {
    ts: Date.now(),
    posts,
    worlds,
    userMap
  });
}

function renderFeedCards(posts = [], worlds = [], userMap = {}, options = {}) {
  if (!postCanvas) return;

  const { wireframe = false } = options;
  postCanvas.innerHTML = '';
  buildPostCard._indexCounter = 0;

  (posts || []).forEach((post) => {
    const user = userMap[post.user_id] || {};
    const card = buildPostCard(post, user);
    if (wireframe) card.classList.add('post-card-wireframe', 'post-card-wireframe--post');
    postCanvas.appendChild(card);
  });

  (worlds || []).forEach((world, index) => {
    const user = userMap[world.user_id] || {};
    const card = worldsFeature.buildWorldCard(world, user, {
      x: world.x,
      y: world.y,
      index: (posts?.length || 0) + index,
      editMode,
      containerFontColor: activeWorldContext?.world?.font_color || '',
      onBeginMove: (worldRow, cardEl, pointerEvent) => {
        if (!editMode) return;
        startPlacement(worldRow, cardEl, pointerEvent);
      },
      onFilterUser: (userId) => {
        activeUserFilter = activeUserFilter === userId ? null : userId;
        loadPosts();
      },
      onFilterCategory: (category) => {
        const nextFilter = category || NONE_CATEGORY_FILTER;
        activeCategoryFilter = activeCategoryFilter === nextFilter ? null : nextFilter;
        loadPosts();
      }
    });
    if (wireframe) card.classList.add('post-card-wireframe', 'post-card-wireframe--world');
    postCanvas.appendChild(card);
  });
}

function renderFeedWireframes(options = {}) {
  if (!postCanvas) return;

  const worldLoading = Boolean(options.worldLoading);
  const count = Number.isFinite(options.count)
    ? Math.max(4, Math.floor(options.count))
    : FEED_WIREFRAME_CARD_COUNT;

  postCanvas.innerHTML = '';

  for (let index = 0; index < count; index += 1) {
    const card = document.createElement('div');
    const isWorldSkeleton = worldLoading ? (index % 3 === 0) : (index % 4 === 0);
    card.className = `post-card post-card-wireframe post-card-wireframe-placeholder${isWorldSkeleton ? ' post-card-wireframe--world' : ' post-card-wireframe--post'}`;
    const x = 60 + (index % 4) * 390;
    const y = 60 + Math.floor(index / 4) * 330;
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    postCanvas.appendChild(card);
  }
}

function getWorldTransitionKey(mode, worldPayload = null) {
  return `${mode}:${String(worldPayload?.world?.id || 'main')}`;
}

async function getUsersMapByIds(userIds = []) {
  const ids = [...new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return {};

  const now = Date.now();
  for (const [id, entry] of userProfileCache.entries()) {
    if (!entry || (now - entry.ts) > USER_PROFILE_CACHE_TTL_MS) {
      userProfileCache.delete(id);
    }
  }

  const result = {};
  const missing = [];

  ids.forEach((id) => {
    const cached = userProfileCache.get(id);
    if (cached?.user) {
      result[id] = cached.user;
    } else {
      missing.push(id);
    }
  });

  if (missing.length > 0) {
    const missingKey = missing.slice().sort().join(',');
    let requestPromise = userProfileInFlight.get(missingKey);

    if (!requestPromise) {
      requestPromise = supabase
        .from('users')
        .select('id, username, pfp, pfp_url')
        .in('id', missing)
        .then(({ data, error: usersError }) => {
          if (usersError) throw usersError;
          return data || [];
        })
        .finally(() => {
          userProfileInFlight.delete(missingKey);
        });

      userProfileInFlight.set(missingKey, requestPromise);
    }

    const fetchedUsers = await requestPromise;
    fetchedUsers.forEach((user) => {
      const id = String(user?.id || '').trim();
      if (!id) return;
      userProfileCache.set(id, { ts: Date.now(), user });
      result[id] = user;
    });
  }

  return result;
}

function getCachedPostRecord(postId) {
  const id = String(postId || '').trim();
  if (!id) return null;

  const now = Date.now();
  const cached = postRecordCache.get(id);
  if (cached && (now - cached.ts) <= POST_RECORD_CACHE_TTL_MS) {
    return cached.post || null;
  }

  if (cached) {
    postRecordCache.delete(id);
  }

  const loaded = (lastLoadedPosts || []).find((post) => String(post?.id || '') === id);
  if (loaded) {
    postRecordCache.set(id, { ts: now, post: loaded });
    return loaded;
  }

  return null;
}

function cachePostRecord(post) {
  const id = String(post?.id || '').trim();
  if (!id || !post) return;
  postRecordCache.set(id, { ts: Date.now(), post });
}

async function getPostRecordById(postId, { fallbackPost = null } = {}) {
  const id = String(postId || '').trim();
  if (!id) return null;

  const cached = getCachedPostRecord(id);
  if (cached) return cached;

  if (fallbackPost && String(fallbackPost?.id || '') === id) {
    cachePostRecord(fallbackPost);
    return fallbackPost;
  }

  let inFlight = postRecordInFlight.get(id);
  if (!inFlight) {
    inFlight = supabase
      .from('posts')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) throw error;
        if (data) {
          cachePostRecord(data);
        }
        return data || null;
      })
      .catch((err) => {
        console.error('Failed to load post record:', err);
        return null;
      })
      .finally(() => {
        postRecordInFlight.delete(id);
      });

    postRecordInFlight.set(id, inFlight);
  }

  return inFlight;
}

function resolvePfpUrl(user = null) {
  const rawPfpUrl = String(user?.pfp_url || '').trim();
  if (rawPfpUrl) {
    if (USE_DEFAULT_FOR_SUPABASE_PFP && /supabase\.co/i.test(rawPfpUrl)) {
      return DEFAULT_PFP_URL;
    }
    return rawPfpUrl;
  }

  const pfpName = String(user?.pfp || '').trim();
  if (pfpName) {
    return `${import.meta.env.BASE_URL}images/pfps/${pfpName}`;
  }

  return DEFAULT_PFP_URL;
}

function applyImageRuntimeDefaults(rootEl) {
  if (!rootEl) return;

  const images = [];
  if (rootEl instanceof HTMLImageElement) {
    images.push(rootEl);
  }
  images.push(...rootEl.querySelectorAll?.('img') || []);

  images.forEach((img) => {
    if (!img.getAttribute('loading')) img.setAttribute('loading', 'lazy');
    if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'async');

    const isAvatar =
      img.dataset.avatar === '1'
      || img.classList.contains('post-footer-pfp')
      || img.classList.contains('comment-pfp')
      || img.id === 'pdPfp';

    if (isAvatar && img.dataset.avatarFallbackBound !== '1') {
      img.dataset.avatarFallbackBound = '1';
      img.addEventListener('error', () => {
        if (img.dataset.avatarFallbackApplied === '1') return;
        img.dataset.avatarFallbackApplied = '1';
        img.src = DEFAULT_PFP_URL;
      });
    }
  });
}

// ============================================
// 3. LINK GRAPH HELPERS
// ============================================

function buildAdjacency(links) {
  const adj = new Map(); // postId -> Set(postId)
  for (const l of (links || [])) {
    const a = String(l.a_post_id);
    const b = String(l.b_post_id);
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  }
  return adj;
}

function getConnectedComponent(startId, links) {
  const start = String(startId);
  const adj = buildAdjacency(links);
  const seen = new Set();
  const stack = [start];

  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);

    const neighbors = adj.get(cur);
    if (!neighbors) continue;
    for (const n of neighbors) {
      if (!seen.has(n)) stack.push(n);
    }
  }

  return seen;
}

function normalizeLinkPair(postAId, postBId) {
  const a = String(postAId);
  const b = String(postBId);
  return a < b
    ? { a_post_id: a, b_post_id: b }
    : { a_post_id: b, b_post_id: a };
}

function findExistingLinkRecord(postAId, postBId, links = lastLoadedLinks) {
  const { a_post_id, b_post_id } = normalizeLinkPair(postAId, postBId);
  return (links || []).find((l) =>
    String(l.a_post_id) === a_post_id && String(l.b_post_id) === b_post_id
  ) || null;
}

function canCurrentUserEditPost(post) {
  if (!currentUser || !post) return false;
  if (currentUserData?.is_admin) return true;
  return String(post.user_id) === String(currentUser.id);
}

function inferCategoryColorColumn(records = []) {
  for (const column of CATEGORY_COLOR_COLUMN_CANDIDATES) {
    if (records.some((row) => Object.prototype.hasOwnProperty.call(row || {}, column))) {
      return column;
    }
  }
  return null;
}

function getCategoryColorValue(record) {
  if (!record) return '';

  const preferredValue = categoryColorColumn
    ? String(record[categoryColorColumn] || '').trim()
    : '';
  if (preferredValue) return preferredValue;

  for (const column of CATEGORY_COLOR_COLUMN_CANDIDATES) {
    const value = String(record[column] || '').trim();
    if (value) return value;
  }

  return '';
}

function toHexColor(value, fallback = '#a6b8d4') {
  const raw = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    const [r, g, b] = raw.slice(1).split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  if (!raw) return fallback;

  const probe = document.createElement('span');
  probe.style.color = raw;
  document.body.appendChild(probe);
  const computed = window.getComputedStyle(probe).color;
  probe.remove();

  const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return fallback;

  const toHex = (n) => Number(n).toString(16).padStart(2, '0');
  return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToHsv(hex) {
  const normalized = toHexColor(hex);
  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = ((b - r) / delta) + 2;
    } else {
      h = ((r - g) / delta) + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v };
}

function hsvToHex(h, s, v) {
  const hue = ((Number(h) % 360) + 360) % 360;
  const sat = clampNumber(Number(s), 0, 1);
  const val = clampNumber(Number(v), 0, 1);

  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hue < 60) {
    rPrime = c;
    gPrime = x;
  } else if (hue < 120) {
    rPrime = x;
    gPrime = c;
  } else if (hue < 180) {
    gPrime = c;
    bPrime = x;
  } else if (hue < 240) {
    gPrime = x;
    bPrime = c;
  } else if (hue < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  const toByte = (channel) => Math.round((channel + m) * 255);
  const toHex = (n) => toByte(n).toString(16).padStart(2, '0');
  return `#${toHex(rPrime)}${toHex(gPrime)}${toHex(bPrime)}`;
}

function getCategoryPickerHexColor() {
  return hsvToHex(
    categoryColorPickerState.h,
    categoryColorPickerState.s,
    categoryColorPickerState.v
  );
}

function getThemePickerHexColor() {
  // Cap V at 0.5 so the tint stays dark enough to be readable
  return hsvToHex(themeColorState.h, themeColorState.s, Math.min(themeColorState.v, 0.5));
}

function applyUiTint(persist = true) {
  const hex = getThemePickerHexColor();
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  document.documentElement.style.setProperty('--ui-tint-bg', `rgba(${r}, ${g}, ${b}, 0.4)`);
  if (persist) {
    localStorage.setItem(THEME_COLOR_KEY, JSON.stringify(themeColorState));
  }
}

function ensureCategoryColorPickerElements() {
  if (categoryColorPickerElements?.root?.isConnected) {
    return categoryColorPickerElements;
  }
  if (!postCategoryPanel) return null;

  const root = document.createElement('div');
  root.className = 'post-form-category-picker';
  root.style.display = 'none';
  root.innerHTML = `
    <div class="post-form-category-picker-sv" data-role="sv">
      <div class="post-form-category-picker-sv-cursor" data-role="sv-cursor"></div>
    </div>
    <input type="range" min="0" max="360" step="1" class="post-form-category-picker-hue" data-role="hue" aria-label="category hue">
    <button type="button" class="post-form-category-picker-submit" data-role="submit" aria-label="save category color">✓</button>
  `;

  postCategoryPanel.appendChild(root);

  const sv = root.querySelector('[data-role="sv"]');
  const svCursor = root.querySelector('[data-role="sv-cursor"]');
  const hueInput = root.querySelector('[data-role="hue"]');
  const submitButton = root.querySelector('[data-role="submit"]');

  const syncUi = () => {
    const hue = clampNumber(categoryColorPickerState.h, 0, 360);
    const sat = clampNumber(categoryColorPickerState.s, 0, 1);
    const val = clampNumber(categoryColorPickerState.v, 0, 1);

    sv.style.setProperty('--picker-hue', String(hue));
    svCursor.style.left = `${sat * 100}%`;
    svCursor.style.top = `${(1 - val) * 100}%`;
    hueInput.value = String(hue);
    submitButton.style.background = getCategoryPickerHexColor();
  };

  const setSvFromPointer = (event) => {
    const rect = sv.getBoundingClientRect();
    const x = clampNumber(event.clientX - rect.left, 0, rect.width);
    const y = clampNumber(event.clientY - rect.top, 0, rect.height);
    categoryColorPickerState.s = rect.width > 0 ? x / rect.width : 0;
    categoryColorPickerState.v = rect.height > 0 ? 1 - (y / rect.height) : 0;
    syncUi();
  };

  let isDraggingSv = false;
  sv.addEventListener('pointerdown', (event) => {
    isDraggingSv = true;
    sv.setPointerCapture(event.pointerId);
    setSvFromPointer(event);
  });

  sv.addEventListener('pointermove', (event) => {
    if (!isDraggingSv) return;
    setSvFromPointer(event);
  });

  sv.addEventListener('pointerup', () => {
    isDraggingSv = false;
  });

  sv.addEventListener('pointercancel', () => {
    isDraggingSv = false;
  });

  hueInput.addEventListener('input', () => {
    categoryColorPickerState.h = Number(hueInput.value || 0);
    syncUi();
  });

  submitButton.addEventListener('click', async () => {
    if (!categoryColorPickerState.categoryName) return;
    const didSave = await handleUpdateCategoryColor(
      categoryColorPickerState.categoryName,
      getCategoryPickerHexColor()
    );
    if (didSave) {
      closeCategoryColorPicker();
    }
  });

  categoryColorPickerElements = { root, sv, svCursor, hueInput, submitButton, syncUi };
  return categoryColorPickerElements;
}

function positionCategoryColorPicker(anchorElement) {
  const picker = ensureCategoryColorPickerElements();
  if (!picker || !anchorElement || !postCategoryPanel) return;

  const panelRect = postCategoryPanel.getBoundingClientRect();
  const anchorRect = anchorElement.getBoundingClientRect();
  const root = picker.root;

  let left = (anchorRect.right - panelRect.left) + 10;
  let top = anchorRect.top - panelRect.top - 4;

  const pickerWidth = root.offsetWidth;
  const pickerHeight = root.offsetHeight;
  const panelWidth = postCategoryPanel.clientWidth;
  const panelHeight = postCategoryPanel.clientHeight;

  if (left + pickerWidth > panelWidth - 8) {
    left = (anchorRect.left - panelRect.left) - pickerWidth - 10;
  }

  if (left < 8) left = 8;

  if (top + pickerHeight > panelHeight - 8) {
    top = panelHeight - pickerHeight - 8;
  }
  if (top < 8) top = 8;

  root.style.left = `${Math.round(left)}px`;
  root.style.top = `${Math.round(top)}px`;
}

function openCategoryColorPicker(categoryName, currentColor, anchorElement) {
  const picker = ensureCategoryColorPickerElements();
  if (!picker) return;

  const hsv = hexToHsv(toHexColor(currentColor));
  categoryColorPickerState = {
    categoryName,
    h: hsv.h,
    s: hsv.s,
    v: hsv.v
  };

  picker.root.style.display = 'grid';
  picker.syncUi();
  positionCategoryColorPicker(anchorElement);
}

function closeCategoryColorPicker() {
  const picker = ensureCategoryColorPickerElements();
  if (!picker) return;
  picker.root.style.display = 'none';
  categoryColorPickerState.categoryName = null;
}

async function updateCategoryColorInDb(categoryName, colorValue) {
  const preferred = categoryColorColumn ? [categoryColorColumn] : [];
  const candidates = [...new Set([...preferred, ...CATEGORY_COLOR_COLUMN_CANDIDATES])];
  let lastError = null;

  for (const column of candidates) {
    const { error } = await supabase
      .from('categories')
      .update({ [column]: colorValue })
      .eq('group_id', 'group0')
      .eq('name', categoryName);

    if (!error) {
      categoryColorColumn = column;
      return;
    }

    lastError = error;

    const message = String(error.message || '').toLowerCase();
    const unknownColumn = String(error.code || '') === '42703' || message.includes('column') || message.includes('does not exist');
    if (!unknownColumn) break;
  }

  throw lastError || new Error('Unable to save category color.');
}

async function toggleThreadLinkBetweenPosts(sourcePostId, targetPostId) {
  const sourceId = String(sourcePostId || '');
  const targetId = String(targetPostId || '');

  if (!sourceId || !targetId || sourceId === targetId) return;

  const { a_post_id, b_post_id } = normalizeLinkPair(sourceId, targetId);
  const existing = findExistingLinkRecord(a_post_id, b_post_id, lastLoadedLinks);

  if (existing?.id) {
    const { error } = await supabase
      .from('post_links')
      .delete()
      .eq('id', existing.id);

    if (error) {
      console.error('Failed to remove link:', error);
      alert(`Failed to remove thread link: ${error.message}`);
      return;
    }
  } else {
    const { error } = await supabase
      .from('post_links')
      .insert([{ group_id: 'group0', a_post_id, b_post_id, created_by: currentUser.id }]);

    if (error) {
      console.error('Failed to add link:', error);
      alert(`Failed to add thread link: ${error.message}`);
      return;
    }
  }

  await loadLinks();
  await loadPosts();
}

async function toggleThreadLinksFromSource(sourcePostId, targetPostIds = []) {
  const sourceId = String(sourcePostId || '');
  if (!sourceId) return;

  const normalizedTargets = [...new Set(
    (targetPostIds || []).map((id) => String(id)).filter((id) => id && id !== sourceId)
  )];
  if (normalizedTargets.length === 0) return;

  const deleteIds = [];
  const insertRows = [];

  for (const targetId of normalizedTargets) {
    const { a_post_id, b_post_id } = normalizeLinkPair(sourceId, targetId);
    const existing = findExistingLinkRecord(a_post_id, b_post_id, lastLoadedLinks);
    if (existing?.id) {
      deleteIds.push(existing.id);
    } else {
      insertRows.push({
        group_id: 'group0',
        a_post_id,
        b_post_id,
        created_by: currentUser.id
      });
    }
  }

  if (deleteIds.length > 0) {
    const { error } = await supabase
      .from('post_links')
      .delete()
      .in('id', deleteIds);

    if (error) {
      console.error('Failed to remove thread links:', error);
      alert(`Failed to remove thread link(s): ${error.message}`);
      return;
    }
  }

  if (insertRows.length > 0) {
    const { error } = await supabase
      .from('post_links')
      .insert(insertRows);

    if (error) {
      console.error('Failed to add thread links:', error);
      alert(`Failed to add thread link(s): ${error.message}`);
      return;
    }
  }

  await loadLinks();
  await loadPosts();
}



// ============================================
// 4. CANVAS VIEWPORT + PLACEMENT STATE
// ============================================

let canvasScale = 1;
const MIN_SCALE = 0.04;
const MAX_SCALE = 2.2;
const ZOOM_SENSITIVITY = 0.0015; // tweak: smaller = slower zoom

let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panStartOffsetX = 0;
let panStartOffsetY = 0;
let canvasOffsetX = 0;
let canvasOffsetY = 0;
let cardLodRafId = 0;

const ANIM_MODES = ['full', 'reduced', 'off'];
let animationMode = localStorage.getItem('demo4-anim-mode') || 'full';

const VIEWPORT_NEAR_MARGIN_PX = 120;
const VIEWPORT_FAR_MARGIN_PX = 680;
const VIEWPORT_LINK_CULL_MARGIN_PX = 360;
const ZOOM_OUT_DETAIL_THRESHOLD = 0.11;
const POST_COORD_MIN = -5000;
const POST_COORD_MAX = 18000;
const POST_CARD_FALLBACK_WIDTH = 320;
const POST_CARD_FALLBACK_HEIGHT = 220;

// Placement mode
let isPlacing = false;
let placingPost = null;      // the post row (must include id)
let placingCardEl = null;    // DOM element for the card being placed
let placeMouseOffsetX = 0;   // center-of-card offset (canvas units)
let placeMouseOffsetY = 0;
let isBulkPlacing = false;
let bulkPlacementItems = [];
let resizingPostState = null;

const CARD_GAP = 10; // minimum gap between cards (px in canvas units)

// ============================================
// 5. CANVAS TRANSFORMS + PLACEMENT HELPERS
// ============================================

function applyCanvasTransform() {
  if (!postCanvas) return;
  postCanvas.style.transform = `translate(${canvasOffsetX}px, ${canvasOffsetY}px) scale(${canvasScale})`;
  postCanvas.style.transformOrigin = '0 0';

  // keep links in sync with pan/zoom
  renderLinks(lastLoadedPosts, lastLoadedLinks);
  scheduleCardLodRefresh();
  scheduleUiStatePersist();
}

function getViewportScreenRect(margin = 0) {
  const viewport = document.getElementById('canvasViewport');
  const rect = viewport?.getBoundingClientRect?.() || {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight
  };

  return {
    left: rect.left - margin,
    top: rect.top - margin,
    right: rect.right + margin,
    bottom: rect.bottom + margin
  };
}

function rectIntersects(a, b) {
  return !(
    a.right < b.left ||
    a.left > b.right ||
    a.bottom < b.top ||
    a.top > b.bottom
  );
}

function clampCanvasCoord(value, min = POST_COORD_MIN, max = POST_COORD_MAX) {
  return Math.min(max, Math.max(min, value));
}

function normalizePostPosition(post, index = 0) {
  const fallbackX = 60 + (index % 4) * 340;
  const fallbackY = 60 + Math.floor(index / 4) * 280;

  const rawX = Number(post?.x);
  const rawY = Number(post?.y);
  const x = Number.isFinite(rawX) ? rawX : fallbackX;
  const y = Number.isFinite(rawY) ? rawY : fallbackY;

  return {
    x: clampCanvasCoord(x),
    y: clampCanvasCoord(y)
  };
}

function centerViewportOnCards(cards = []) {
  if (!postCanvas || !cards.length) return false;

  const viewport = document.getElementById('canvasViewport');
  const viewportRect = viewport?.getBoundingClientRect?.();
  if (!viewportRect) return false;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  cards.forEach((card) => {
    const x = Number.parseFloat(card.style.left || '0');
    const y = Number.parseFloat(card.style.top || '0');
    const scale = getCardScale(card);
    const width = Math.max(POST_CARD_FALLBACK_WIDTH, (card.offsetWidth || 0) * scale);
    const height = Math.max(POST_CARD_FALLBACK_HEIGHT, (card.offsetHeight || 0) * scale);

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return false;
  }

  const centerCanvasX = (minX + maxX) / 2;
  const centerCanvasY = (minY + maxY) / 2;
  const viewportCenterX = (viewportRect.left + viewportRect.right) / 2;
  const viewportCenterY = (viewportRect.top + viewportRect.bottom) / 2;

  canvasOffsetX = viewportCenterX - (centerCanvasX * canvasScale);
  canvasOffsetY = viewportCenterY - (centerCanvasY * canvasScale);
  applyCanvasTransform();
  return true;
}

function hasVisibleCardInViewport(cards = []) {
  const viewportRect = getViewportScreenRect(0);
  return cards.some((card) => {
    const rect = card.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    return rectIntersects(rect, viewportRect);
  });
}

function centerPosts() {
  if (!postCanvas) return false;
  const cards = Array.from(postCanvas.querySelectorAll('.post-card'));
  return centerViewportOnCards(cards);
}

function debugPostsLayout() {
  const cards = Array.from(postCanvas?.querySelectorAll('.post-card') || []);
  const rows = cards.map((card) => {
    const rect = card.getBoundingClientRect();
    return {
      postId: card.dataset.postId || '',
      leftStyle: card.style.left || '',
      topStyle: card.style.top || '',
      widthStyle: card.style.width || '',
      scale: card.dataset.postScale || '',
      rectX: Number(rect.x.toFixed(2)),
      rectY: Number(rect.y.toFixed(2)),
      rectW: Number(rect.width.toFixed(2)),
      rectH: Number(rect.height.toFixed(2))
    };
  });

  console.table(rows);
  return rows;
}

if (typeof window !== 'undefined') {
  window.centerPosts = centerPosts;
  window.debugPostsLayout = debugPostsLayout;
}

const MAX_ACTIVE_PREVIEW_VIDEOS = 1;

function syncCardEnergyState(card, lod, { allowPreviewVideoPlayback = true } = {}) {
  if (!card) return;

  const nextVideoState = allowPreviewVideoPlayback ? 'play' : 'pause';
  if (card.dataset.lod === lod && card.dataset.previewVideoState === nextVideoState) return;

  card.dataset.lod = lod;
  card.dataset.previewVideoState = nextVideoState;

  const previewVideo = card.querySelector('.post-preview-video');
  if (previewVideo) {
    if (lod === 'near' && allowPreviewVideoPlayback && !shouldHardFreezeMotion()) {
      previewVideo.play().catch(() => {});
    } else {
      previewVideo.pause();
    }
  }

  if (lod !== 'near') {
    const previewAudio = card.querySelector('.post-preview-audio');
    if (previewAudio && !previewAudio.paused) {
      previewAudio.pause();
    }
  }
}

function refreshCardLodStates() {
  if (!postCanvas) return;

  const nearRect = getViewportScreenRect(VIEWPORT_NEAR_MARGIN_PX);
  const farRect = getViewportScreenRect(VIEWPORT_FAR_MARGIN_PX);
  const cards = Array.from(postCanvas.querySelectorAll('.post-card'));
  const nearVideoCards = [];
  const viewportCenterX = (nearRect.left + nearRect.right) / 2;
  const viewportCenterY = (nearRect.top + nearRect.bottom) / 2;

  cards.forEach((card) => {
    const rect = card.getBoundingClientRect();
    card.__lodRect = rect;

    if (rectIntersects(rect, nearRect) && card.querySelector('.post-preview-video')) {
      const centerX = (rect.left + rect.right) / 2;
      const centerY = (rect.top + rect.bottom) / 2;
      const dx = centerX - viewportCenterX;
      const dy = centerY - viewportCenterY;
      nearVideoCards.push({ card, distance: (dx * dx) + (dy * dy) });
    }
  });

  nearVideoCards.sort((a, b) => a.distance - b.distance);
  const activeVideoCards = new Set(
    nearVideoCards.slice(0, MAX_ACTIVE_PREVIEW_VIDEOS).map((entry) => entry.card)
  );

  cards.forEach((card) => {
    const rect = card.__lodRect;
    delete card.__lodRect;

    if (rectIntersects(rect, nearRect)) {
      syncCardEnergyState(card, 'near', {
        allowPreviewVideoPlayback: !card.querySelector('.post-preview-video') || activeVideoCards.has(card)
      });
      return;
    }

    if (rectIntersects(rect, farRect)) {
      syncCardEnergyState(card, 'mid');
      return;
    }

    syncCardEnergyState(card, 'far');
  });

  mainPageContainer?.classList.toggle('zoomed-out-intentional', canvasScale <= ZOOM_OUT_DETAIL_THRESHOLD);
}

function scheduleCardLodRefresh() {
  if (cardLodRafId) return;

  cardLodRafId = window.requestAnimationFrame(() => {
    cardLodRafId = 0;
    refreshCardLodStates();
  });
}

function applyAnimationMode(mode, { persist = true } = {}) {
  animationMode = mode;
  if (persist) {
    localStorage.setItem('demo4-anim-mode', mode);
  }

  const effectiveMode = getEffectiveAnimationMode();
  document.body.classList.remove('anim-full', 'anim-reduced', 'anim-off');
  document.body.classList.add(`anim-${effectiveMode}`);
  document.body.classList.toggle('anim-auto-freeze', autoFreezeActive);
  document.body.classList.toggle('anim-hard-freeze', shouldHardFreezeMotion());

  const btn = document.getElementById('animModeBtn');
  if (btn) {
    const icons = { full: '͙͘͡★', reduced: '͙͘͡★', off: '˚✰' };
    const titles = {
      full: 'animations: full',
      reduced: 'animations: reduced (near only)',
      off: autoFreezeActive ? 'animations: auto freeze (boot)' : 'animations: off'
    };
    btn.textContent = icons[effectiveMode] || '͙͘͡★';
    btn.title = titles[effectiveMode] || '';
    btn.setAttribute('aria-label', titles[effectiveMode] || '');
    btn.classList.toggle('active', effectiveMode !== 'full');
  }

  enforceFrozenMediaState();

  // Sync preview playback states now that mode changed.
  refreshCardLodStates();

  // Refresh link-flow animations
  renderLinks(lastLoadedPosts, lastLoadedLinks);
}

function initAnimToggle() {
  const leftGroup = document.getElementById('musicBarLeft');
  const bar = document.getElementById('musicBar');
  const openPanel = document.getElementById('musicOpenPanel');
  if (!bar) return;

  const btn = document.createElement('button');
  btn.id = 'animModeBtn';
  btn.type = 'button';
  btn.className = 'music-ctrl-btn anim-mode-btn';

  if (leftGroup) {
    leftGroup.appendChild(btn);
  } else {
    bar.insertBefore(btn, openPanel);
  }
  // Sets icon, title, and body class
  applyAnimationMode(animationMode);

  btn.addEventListener('click', () => {
    const baseMode = getEffectiveAnimationMode();
    if (autoFreezeActive) {
      setAutoFreezeActive(false);
    }
    const next = ANIM_MODES[(ANIM_MODES.indexOf(baseMode) + 1) % ANIM_MODES.length];
    applyAnimationMode(next);
  });
}

function initThemeColorPicker() {
  // Restore saved tint
  try {
    const saved = JSON.parse(localStorage.getItem(THEME_COLOR_KEY) || 'null');
    if (saved && typeof saved.h === 'number') {
      themeColorState.h = saved.h;
      themeColorState.s = saved.s;
      themeColorState.v = saved.v;
    }
  } catch {}
  applyUiTint(false);

  const leftGroup = document.getElementById('musicBarLeft');
  if (!leftGroup) return;

  // Trigger button
  const btn = document.createElement('button');
  btn.id = 'tintPickerBtn';
  btn.type = 'button';
  btn.className = 'music-ctrl-btn tint-picker-btn';
  btn.textContent = '\u25c8';
  btn.title = 'ui color';
  btn.setAttribute('aria-label', 'pick ui tint color');
  // Insert before animModeBtn so color picker is leftmost
  const animBtn = leftGroup.querySelector('#animModeBtn');
  if (animBtn) {
    leftGroup.insertBefore(btn, animBtn);
  } else {
    leftGroup.appendChild(btn);
  }

  // Floating picker popup — reuses category picker inner element CSS classes
  const popup = document.createElement('div');
  popup.id = 'tintPickerPopup';
  popup.className = 'music-tint-picker';
  popup.innerHTML = `
    <div class="post-form-category-picker-sv" data-role="sv">
      <div class="post-form-category-picker-sv-cursor" data-role="sv-cursor"></div>
    </div>
    <input type="range" min="0" max="360" step="1" class="post-form-category-picker-hue" data-role="hue" aria-label="ui tint hue">
    <button type="button" class="post-form-category-picker-submit" data-role="submit" title="apply color">\u2713</button>
  `;
  document.body.appendChild(popup);

  const sv       = popup.querySelector('[data-role="sv"]');
  const svCursor = popup.querySelector('[data-role="sv-cursor"]');
  const hueInput = popup.querySelector('[data-role="hue"]');
  const submitBtn = popup.querySelector('[data-role="submit"]');

  let snapshot = { h: 0, s: 0, v: 0 };

  const syncPickerUi = () => {
    sv.style.setProperty('--picker-hue', String(Math.round(themeColorState.h)));
    svCursor.style.left = `${themeColorState.s * 100}%`;
    svCursor.style.top  = `${(1 - themeColorState.v) * 100}%`;
    hueInput.value = String(Math.round(themeColorState.h));
    submitBtn.style.background = getThemePickerHexColor();
    applyUiTint(false); // live preview without persisting
  };

  const setSvFromPointer = (evt) => {
    const rect = sv.getBoundingClientRect();
    const x = Math.max(0, Math.min(evt.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(evt.clientY - rect.top, rect.height));
    themeColorState.s = rect.width  > 0 ? x / rect.width  : 0;
    themeColorState.v = rect.height > 0 ? 1 - y / rect.height : 0;
    syncPickerUi();
  };

  let isDragging = false;
  sv.addEventListener('pointerdown',  (e) => { isDragging = true; sv.setPointerCapture(e.pointerId); setSvFromPointer(e); });
  sv.addEventListener('pointermove',  (e) => { if (isDragging) setSvFromPointer(e); });
  sv.addEventListener('pointerup',    () =>  { isDragging = false; });
  sv.addEventListener('pointercancel',() =>  { isDragging = false; });

  hueInput.addEventListener('input', () => {
    themeColorState.h = Number(hueInput.value || 0);
    syncPickerUi();
  });

  submitBtn.addEventListener('click', () => {
    applyUiTint(true); // persist
    popup.classList.remove('open');
    themePickerOpen = false;
  });

  const revertAndClose = () => {
    themeColorState = { ...snapshot };
    applyUiTint(false);
    popup.classList.remove('open');
    themePickerOpen = false;
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (themePickerOpen) {
      revertAndClose();
    } else {
      snapshot = { ...themeColorState };
      themePickerOpen = true;
      popup.classList.add('open');
      syncPickerUi();
    }
  });

  document.addEventListener('click', (e) => {
    if (!themePickerOpen) return;
    if (popup.contains(e.target) || e.target === btn) return;
    revertAndClose();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (themePickerOpen && e.key === 'Escape') revertAndClose();
  });
}

function clampPostScale(value) {
  return Math.max(POST_SCALE_MIN, Math.min(POST_SCALE_MAX, value));
}

function ensurePostScaleMapLoaded() {
  if (postScaleMapLoaded) return;
  postScaleMapLoaded = true;

  try {
    const raw = localStorage.getItem(POST_SCALE_STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    postScaleById = parsed;
  } catch (err) {
    console.warn('Failed to load post scale map', err);
    postScaleById = {};
  }
}

function persistPostScaleMap() {
  try {
    localStorage.setItem(POST_SCALE_STORAGE_KEY, JSON.stringify(postScaleById));
  } catch (err) {
    console.warn('Failed to persist post scale map', err);
  }
}

function getStoredPostScale(postId) {
  ensurePostScaleMapLoaded();
  const raw = Number(postScaleById[String(postId)]);
  if (!Number.isFinite(raw)) return 1;
  return clampPostScale(raw);
}

function setStoredPostScale(postId, scale) {
  ensurePostScaleMapLoaded();
  postScaleById[String(postId)] = clampPostScale(scale);
  persistPostScaleMap();
}

function getCardScale(cardEl) {
  const raw = Number(cardEl?.dataset?.postScale || '1');
  if (!Number.isFinite(raw)) return 1;
  return clampPostScale(raw);
}

function applyCardScale(cardEl, scale) {
  const next = clampPostScale(scale);
  cardEl.dataset.postScale = String(next);
  cardEl.style.setProperty('--post-scale', String(next));
}

// Convert viewport mouse coordinates to canvas coordinates (account for current pan + zoom)
function viewportPointToCanvasPoint(clientX, clientY) {
  // Inverse of: screen = (canvas * scale) + offset
  return {
    x: (clientX - canvasOffsetX) / canvasScale,
    y: (clientY - canvasOffsetY) / canvasScale
  };
}

function normalizeWheelDelta(e) {
  const lineHeight = 16;
  const pageHeight = window.innerHeight || 800;

  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return e.deltaY * lineHeight;
  }

  if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return e.deltaY * pageHeight;
  }

  return e.deltaY;
}

function getCardRectAt(cardEl, x, y) {
  // offsetWidth/Height are already in canvas units (CSS transform doesn't affect them)
  const scale = getCardScale(cardEl);
  const w = cardEl.offsetWidth * scale;
  const h = cardEl.offsetHeight * scale;
  return { left: x, top: y, right: x + w, bottom: y + h };

}

function rectsOverlap(a, b, gap = 0) {
  return !(
    a.right + gap <= b.left ||
    a.left >= b.right + gap ||
    a.bottom + gap <= b.top ||
    a.top >= b.bottom + gap
  );
}

function canPlaceCardAt(cardEl, x, y) {
  const rect = getCardRectAt(cardEl, x, y);

  const others = postCanvas.querySelectorAll('.post-card');
  for (const other of others) {
    if (other === cardEl) continue;

    const ox = parseFloat(other.style.left || '0');
    const oy = parseFloat(other.style.top || '0');
    const orect = getCardRectAt(other, ox, oy);

    if (rectsOverlap(rect, orect, CARD_GAP)) return false;
  }
  return true;
}

async function waitForCardMedia(cardEl) {
  const images = [...cardEl.querySelectorAll('img')];
  const videos = [...cardEl.querySelectorAll('video')];

  const imagePromises = images.map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
  });

  const videoPromises = videos.map(vid => {
    if (vid.readyState >= 1) return Promise.resolve();
    return new Promise(resolve => { vid.onloadedmetadata = resolve; vid.onerror = resolve; });
  });

  await Promise.all([...imagePromises, ...videoPromises]);
}

function waitForLayoutStability() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function startPlacement(post, cardEl, mouseEvent) {
  stopBulkPlacement();
  isPlacing = true;
  placingPost = post;
  placingCardEl = cardEl;

  placingCardEl.style.zIndex = '20';
  // Disable interactive buttons so the drop click can't accidentally trigger them
  placingCardEl.querySelectorAll(
    '.post-file-preview-play, .post-file-preview-download-btn, .post-preview-mute-btn, .post-file-preview-youtube-activate'
  ).forEach(btn => { btn.style.pointerEvents = 'none'; });

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (isPlacing && placingCardEl === cardEl) {
        updatePlacementPosition(mouseEvent);
      }
    });
  });
}

function stopPlacement() {
  if (placingCardEl) {
    placingCardEl.style.zIndex = '';
    placingCardEl.style.outline = '';
    // Re-enable interactive buttons now that placement is done
    placingCardEl.querySelectorAll(
      '.post-file-preview-play, .post-file-preview-download-btn, .post-preview-mute-btn, .post-file-preview-youtube-activate'
    ).forEach(btn => { btn.style.pointerEvents = ''; });
  }
  isPlacing = false;
  placingPost = null;
  placingCardEl = null;
}

function stopBulkPlacement() {
  if (bulkPlacementItems.length > 0) {
    bulkPlacementItems.forEach((item) => {
      if (!item?.cardEl) return;
      item.cardEl.style.zIndex = '';
      item.cardEl.style.outline = '';
      item.cardEl.style.opacity = '';
      item.cardEl.querySelectorAll(
        '.post-file-preview-play, .post-file-preview-download-btn, .post-preview-mute-btn, .post-file-preview-youtube-activate'
      ).forEach((btn) => { btn.style.pointerEvents = ''; });
    });
  }

  isBulkPlacing = false;
  bulkPlacementItems = [];
}

function startBulkPlacement(posts, mouseEvent) {
  if (!Array.isArray(posts) || posts.length < 2) return false;

  stopPlacement();
  stopBulkPlacement();

  const pointer = viewportPointToCanvasPoint(mouseEvent.clientX, mouseEvent.clientY);
  bulkPlacementItems = posts
    .map((post) => {
      const postId = String(post?.id || '');
      const cardEl = postCanvas?.querySelector(`.post-card[data-post-id="${postId}"]`);
      if (!cardEl) return null;

      const startX = parseFloat(cardEl.style.left || '0');
      const startY = parseFloat(cardEl.style.top || '0');
      return {
        post,
        cardEl,
        offsetX: startX - pointer.x,
        offsetY: startY - pointer.y
      };
    })
    .filter(Boolean);

  if (bulkPlacementItems.length < 2) {
    bulkPlacementItems = [];
    return false;
  }

  bulkPlacementItems.forEach((item) => {
    item.cardEl.style.zIndex = '20';
    item.cardEl.querySelectorAll(
      '.post-file-preview-play, .post-file-preview-download-btn, .post-preview-mute-btn, .post-file-preview-youtube-activate'
    ).forEach((btn) => { btn.style.pointerEvents = 'none'; });
  });

  isBulkPlacing = true;
  updateBulkPlacementPosition(mouseEvent);
  return true;
}

function updateBulkPlacementPosition(e) {
  if (!isBulkPlacing || bulkPlacementItems.length === 0) return;

  const pointer = viewportPointToCanvasPoint(e.clientX, e.clientY);
  for (const item of bulkPlacementItems) {
    const x = pointer.x + item.offsetX;
    const y = pointer.y + item.offsetY;
    item.cardEl.style.left = `${x}px`;
    item.cardEl.style.top = `${y}px`;
    item.cardEl.style.outline = '2px solid rgba(172, 214, 255, 0.68)';
    item.cardEl.style.opacity = '1';
  }

  renderLinks(lastLoadedPosts, lastLoadedLinks);
}

async function tryDropBulkPlacement() {
  if (!isBulkPlacing || bulkPlacementItems.length === 0) return;

  const updates = bulkPlacementItems.map((item) => {
    const x = parseFloat(item.cardEl.style.left || '0');
    const y = parseFloat(item.cardEl.style.top || '0');
    item.post.x = x;
    item.post.y = y;

    let query = supabase
      .from('posts')
      .update({ x, y })
      .eq('id', item.post.id);

    if (!currentUserData?.is_admin) {
      query = query.eq('user_id', currentUser.id);
    }

    return query;
  });

  const results = await Promise.all(updates);
  const failed = results.find((result) => result?.error);
  if (failed?.error) {
    console.error('Bulk move failed:', failed.error.message);
    alert(`Bulk move failed: ${failed.error.message}`);
    return;
  }

  stopBulkPlacement();
  renderLinks(lastLoadedPosts, lastLoadedLinks);
}

function clearEditSelection({ keepThreadSource = false } = {}) {
  selectedEditPostIds.clear();
  if (!keepThreadSource) {
    activeThreadSourcePostId = null;
  }
}

function isEditPostSelected(postId) {
  return selectedEditPostIds.has(String(postId));
}

function toggleEditPostSelection(postId) {
  const id = String(postId || '');
  if (!id) return false;

  if (selectedEditPostIds.has(id)) {
    selectedEditPostIds.delete(id);
    return false;
  }

  selectedEditPostIds.add(id);
  return true;
}

function getSelectableEditPosts() {
  return (lastLoadedPosts || []).filter((post) => canCurrentUserEditPost(post));
}

function getSelectedEditablePostIds() {
  const allowedIds = new Set(getSelectableEditPosts().map((post) => String(post.id)));
  return [...selectedEditPostIds].filter((id) => allowedIds.has(String(id)));
}

function getSelectedEditablePosts() {
  const selectedIds = new Set(getSelectedEditablePostIds());
  return getSelectableEditPosts().filter((post) => selectedIds.has(String(post.id)));
}

function reconcileEditSelectionForVisiblePosts() {
  if (!editMode) {
    clearEditSelection();
    return;
  }

  const visibleEditableIds = new Set(getSelectableEditPosts().map((post) => String(post.id)));
  for (const id of [...selectedEditPostIds]) {
    if (!visibleEditableIds.has(String(id))) {
      selectedEditPostIds.delete(String(id));
    }
  }

  if (activeThreadSourcePostId && !visibleEditableIds.has(String(activeThreadSourcePostId))) {
    activeThreadSourcePostId = null;
  }
}

function updatePlacementPosition(e) {
  if (!isPlacing || !placingCardEl) return;

  const pt = viewportPointToCanvasPoint(e.clientX, e.clientY);

  // offsetWidth/Height are in canvas units — no canvasScale division needed
  const placingScale = getCardScale(placingCardEl);
  const w = placingCardEl.offsetWidth * placingScale;
  const h = placingCardEl.offsetHeight * placingScale;
  placeMouseOffsetX = w / 2;
  placeMouseOffsetY = h / 2;

  let x = pt.x - placeMouseOffsetX;
  let y = pt.y - placeMouseOffsetY;

  const pw = placingCardEl.offsetWidth * placingScale;
  const ph = placingCardEl.offsetHeight * placingScale;
  const pcx = x + pw / 2;
  const pcy = y + ph / 2;

  let snapX = null, snapY = null;
  let bestDx = SNAP_ALIGN_THRESHOLD;
  let bestDy = SNAP_ALIGN_THRESHOLD;

  const cards = postCanvas.querySelectorAll('.post-card');
  for (const other of cards) {
    if (other === placingCardEl) continue;
    const ox  = parseFloat(other.style.left || '0');
    const oy  = parseFloat(other.style.top  || '0');
    const otherScale = getCardScale(other);
    const ocx = ox + (other.offsetWidth * otherScale) / 2;
    const ocy = oy + (other.offsetHeight * otherScale) / 2;

    const dx = Math.abs(pcx - ocx);
    if (dx < bestDx) {
      bestDx = dx;
      snapX = ox + ((other.offsetWidth * otherScale) - pw) / 2;
    }

    const dy = Math.abs(pcy - ocy);
    if (dy < bestDy) {
      bestDy = dy;
      snapY = oy + ((other.offsetHeight * otherScale) - ph) / 2;
    }
  }

  if (snapX !== null) x = snapX;
  if (snapY !== null) y = snapY;

  placingCardEl.style.left = `${x}px`;
  placingCardEl.style.top  = `${y}px`;

  const snapping = snapX !== null || snapY !== null;
  placingCardEl.style.outline = snapping
    ? '2px solid rgba(255,255,255,0.6)'
    : '2px solid rgba(255,255,255,0.25)';

  const ok = canPlaceCardAt(placingCardEl, x, y);
  placingCardEl.style.opacity = ok ? '1' : '0.6';

  renderLinks(lastLoadedPosts, lastLoadedLinks);
}

function beginPostResize(e, cardEl, postId) {
  if (isPlacing || isBulkPlacing) return;

  e.preventDefault();
  e.stopPropagation();

  const startScale = getCardScale(cardEl);
  resizingPostState = {
    cardEl,
    postId: String(postId),
    startX: e.clientX,
    startY: e.clientY,
    startScale
  };

  cardEl.classList.add('post-card-resizing');
}

function updatePostResize(e) {
  if (!resizingPostState?.cardEl) return;

  const dx = e.clientX - resizingPostState.startX;
  const cardBaseWidth = Math.max(220, resizingPostState.cardEl.offsetWidth || 220);
  const delta = dx / cardBaseWidth;
  const nextScale = clampPostScale(resizingPostState.startScale + delta);

  applyCardScale(resizingPostState.cardEl, nextScale);
  renderLinks(lastLoadedPosts, lastLoadedLinks);
}

function endPostResize() {
  if (!resizingPostState?.cardEl) return;

  const { cardEl, postId } = resizingPostState;
  const nextScale = getCardScale(cardEl);

  cardEl.classList.remove('post-card-resizing');
  setStoredPostScale(postId, nextScale);
  resizingPostState = null;

  renderLinks(lastLoadedPosts, lastLoadedLinks);
}

async function tryDropPlacement(e) {
  if (!isPlacing || !placingCardEl || !placingPost) return;

  const x = parseFloat(placingCardEl.style.left || '0');
  const y = parseFloat(placingCardEl.style.top || '0');

  if (!canPlaceCardAt(placingCardEl, x, y)) {
    return; // keep sticky until a valid spot
  }

  const worldId = String(placingCardEl.dataset.worldId || '').trim();
  const postId = String(placingPost?.id || '').trim();

  let placementQuery = null;
  if (worldId) {
    placementQuery = supabase
      .from('worlds')
      .update({ x, y })
      .eq('id', worldId);

    if (!currentUserData?.is_admin) {
      placementQuery = placementQuery.eq('user_id', currentUser.id);
    }
  } else {
    placementQuery = supabase
      .from('posts')
      .update({ x, y })
      .eq('id', postId);

    if (!currentUserData?.is_admin) {
      placementQuery = placementQuery.eq('user_id', currentUser.id);
    }
  }

  const { error } = await placementQuery;
  if (error) {
    console.error('Placement save failed:', error);
    alert(`Placement save failed: ${error.message}`);
    return;
  }

  placingPost.x = x;
  placingPost.y = y;

  stopPlacement();
  renderLinks(lastLoadedPosts, lastLoadedLinks);
}

// ============================================
// 6. AUTH + USER BOOTSTRAP
// ============================================

async function checkAuth() {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Failed to get session:', error);
    return null;
  }

  if (!session) {
    window.location.href = './index.html';
    return null;
  }

  currentUser = session.user;
  console.log('Logged in as:', currentUser.id);

  const { data, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (userError) {
    console.error('Failed to fetch user data:', userError);
    return null;
  }

  currentUserData = data;
  console.log('User data loaded:', currentUserData.username);
  return session;
}

// ============================================
// 7. FILE CLASSIFICATION
// ============================================

async function getFileType(file) {
  const mime = file?.type || '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';

  if (mime.startsWith('video/')) {
    // probe: audio-only mp4 has no video track (videoWidth stays 0)
    const isAudioOnly = await new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const vid = document.createElement('video');
      vid.preload = 'metadata';
      vid.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(vid.videoWidth === 0);
      };
      vid.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(false);
      };
      vid.src = url;
    });
    return isAudioOnly ? 'audio' : 'video';
  }

  return 'other';
}

function isHeicLikeFile(file) {
  const mime = String(file?.type || '').toLowerCase();
  const ext = getFileExtension(file?.name || '');
  return mime === 'image/heic' || mime === 'image/heif' || ext === 'heic' || ext === 'heif';
}

async function normalizeUploadFile(file) {
  if (!isHeicLikeFile(file)) return file;

  const heic2anyModule = await import('heic2any');
  const heic2any = heic2anyModule.default || heic2anyModule;
  const converted = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.9
  });

  const convertedBlob = Array.isArray(converted) ? converted[0] : converted;
  const baseName = String(file.name || 'upload').replace(/\.[^.]+$/, '');
  return new File([convertedBlob], `${baseName}.jpg`, { type: 'image/jpeg' });
}

async function isVisualFile(file) {
  const type = await getFileType(file);
  return type === 'image' || type === 'video';
}


// ============================================
// 8. POST FORM + OVERLAY HELPERS
// ============================================

function applyBackgroundImage(bgUrl = DEFAULT_BG_URL) {
  document.documentElement.style.setProperty('--bg-url', `url(${bgUrl})`);
}

const backgroundImagePreloadCache = new Map();

function preloadBackgroundImage(bgUrl = DEFAULT_BG_URL) {
  const normalizedUrl = String(bgUrl || '').trim() || DEFAULT_BG_URL;
  if (backgroundImagePreloadCache.has(normalizedUrl)) {
    return backgroundImagePreloadCache.get(normalizedUrl);
  }

  const preloadPromise = new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(normalizedUrl);
    img.onerror = () => resolve(normalizedUrl);
    img.src = normalizedUrl;
  });

  backgroundImagePreloadCache.set(normalizedUrl, preloadPromise);
  return preloadPromise;
}

function setCanvasLoadingState(isLoading, label = 'loading posts...') {
  if (!postCanvas) return;
  postCanvas.classList.toggle('is-loading', !!isLoading);

  let indicator = postCanvas.querySelector('.post-canvas-loading');
  if (isLoading) {
    if (document.body.classList.contains('world-loader-active')) {
      indicator?.remove();
      return;
    }

    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'post-canvas-loading';
      postCanvas.appendChild(indicator);
    }
    indicator.textContent = label;
    return;
  }

  indicator?.remove();
}

function applyWorldModeVisuals(worldModeConfig = null) {
  if (!worldModeConfig) {
    mainPageContainer?.classList.remove('world-mode-active');
    mainPageContainer?.style.removeProperty('--world-mode-font-family');
    mainPageContainer?.style.removeProperty('--world-mode-font-color');
    mainPageContainer?.style.removeProperty('--world-mode-ui-color');
    applyBackgroundImage(DEFAULT_BG_URL);
    return;
  }

  mainPageContainer?.classList.add('world-mode-active');
  mainPageContainer?.style.setProperty('--world-mode-font-family', worldModeConfig.fontFamily || 'inherit');
  mainPageContainer?.style.setProperty('--world-mode-font-color', worldModeConfig.fontColor || 'inherit');
  mainPageContainer?.style.setProperty('--world-mode-ui-color', worldModeConfig.uiColor || 'rgba(255,255,255,0.7)');
  applyBackgroundImage(worldModeConfig.backgroundUrl || DEFAULT_BG_URL);
}

function centerCanvasOnPost(postId) {
  if (!postCanvas) return false;

  const targetId = String(postId || '');
  if (!targetId) return false;

  const viewport = document.getElementById('canvasViewport');
  const viewportRect = viewport?.getBoundingClientRect?.();
  if (!viewportRect) return false;

  const viewportCenterX = (viewportRect.left + viewportRect.right) / 2;
  const viewportCenterY = (viewportRect.top + viewportRect.bottom) / 2;

  const cardEl = postCanvas.querySelector(`.post-card[data-post-id="${targetId}"]`);

  let centerCanvasX = null;
  let centerCanvasY = null;

  if (cardEl) {
    const cardX = parseFloat(cardEl.style.left || '0');
    const cardY = parseFloat(cardEl.style.top || '0');
    const cardScale = getCardScale(cardEl);
    const cardW = (cardEl.offsetWidth || 0) * cardScale;
    const cardH = (cardEl.offsetHeight || 0) * cardScale;
    centerCanvasX = cardX + (cardW / 2);
    centerCanvasY = cardY + (cardH / 2);
  } else {
    const post = (lastLoadedPosts || []).find((row) => String(row?.id) === targetId);
    if (!post) return false;
    centerCanvasX = Number(post.x || 0) + 160;
    centerCanvasY = Number(post.y || 0) + 110;
  }

  canvasOffsetX = viewportCenterX - (centerCanvasX * canvasScale);
  canvasOffsetY = viewportCenterY - (centerCanvasY * canvasScale);
  applyCanvasTransform();
  return true;
}

function getPostCanvasCenterPoint(post) {
  const targetId = String(post?.id || '');
  const cardEl = targetId
    ? postCanvas?.querySelector(`.post-card[data-post-id="${targetId}"]`)
    : null;

  if (cardEl) {
    const cardX = parseFloat(cardEl.style.left || '0');
    const cardY = parseFloat(cardEl.style.top || '0');
    const cardScale = getCardScale(cardEl);
    const cardW = (cardEl.offsetWidth || 0) * cardScale;
    const cardH = (cardEl.offsetHeight || 0) * cardScale;
    return {
      x: cardX + (cardW / 2),
      y: cardY + (cardH / 2)
    };
  }

  return {
    x: Number(post?.x || 0) + 160,
    y: Number(post?.y || 0) + 110
  };
}

function frameWorldViewportOnDensePosts(posts = lastLoadedPosts) {
  if (!postCanvas || !activeWorldContext?.world?.id) return false;

  const worldPosts = (posts || []).filter(Boolean);
  if (!worldPosts.length) return false;

  const points = worldPosts.map((post) => {
    const center = getPostCanvasCenterPoint(post);
    return {
      id: String(post.id || ''),
      x: center.x,
      y: center.y
    };
  });

  if (!points.length) return false;

  const radius = 760;
  const radiusSq = radius * radius;
  let densestMembers = points;

  points.forEach((anchor) => {
    const members = points.filter((point) => {
      const dx = point.x - anchor.x;
      const dy = point.y - anchor.y;
      return (dx * dx) + (dy * dy) <= radiusSq;
    });

    if (members.length > densestMembers.length) {
      densestMembers = members;
    }
  });

  const cluster = densestMembers.length ? densestMembers : points;
  const centroid = cluster.reduce((acc, point) => {
    acc.x += point.x;
    acc.y += point.y;
    return acc;
  }, { x: 0, y: 0 });
  centroid.x /= cluster.length;
  centroid.y /= cluster.length;

  const minX = Math.min(...cluster.map((point) => point.x));
  const maxX = Math.max(...cluster.map((point) => point.x));
  const minY = Math.min(...cluster.map((point) => point.y));
  const maxY = Math.max(...cluster.map((point) => point.y));

  const viewport = document.getElementById('canvasViewport');
  const viewportRect = viewport?.getBoundingClientRect?.();
  if (!viewportRect) return false;

  const viewportW = Math.max(1, viewportRect.width);
  const viewportH = Math.max(1, viewportRect.height);
  const clusterW = Math.max(360, (maxX - minX) + 320);
  const clusterH = Math.max(240, (maxY - minY) + 220);

  const fittedScale = Math.min((viewportW * 0.82) / clusterW, (viewportH * 0.82) / clusterH, 0.2);
  const targetScale = clampNumber(fittedScale, 0.08, 0.2);
  canvasScale = targetScale;

  const viewportCenterX = (viewportRect.left + viewportRect.right) / 2;
  const viewportCenterY = (viewportRect.top + viewportRect.bottom) / 2;
  canvasOffsetX = viewportCenterX - (centroid.x * canvasScale);
  canvasOffsetY = viewportCenterY - (centroid.y * canvasScale);
  applyCanvasTransform();
  return true;
}

function recoverViewportForCurrentContext() {
  if (!postCanvas) return false;

  const postCards = Array.from(postCanvas.querySelectorAll('.post-card[data-post-id]'));
  const allCards = Array.from(postCanvas.querySelectorAll('.post-card'));
  const inWorld = Boolean(activeWorldContext?.world?.id);

  if (inWorld) {
    if (frameWorldViewportOnDensePosts(lastLoadedPosts)) {
      return true;
    }

    if (postCards.length > 0 && !hasVisibleCardInViewport(postCards)) {
      return centerViewportOnCards(postCards);
    }

    if (!postCards.length && allCards.length > 0 && !hasVisibleCardInViewport(allCards)) {
      return centerViewportOnCards(allCards);
    }

    return false;
  }

  if (postCards.length > 0) {
    if (!hasVisibleCardInViewport(postCards)) {
      return centerViewportOnCards(postCards);
    }
    return false;
  }

  if (allCards.length > 0 && !hasVisibleCardInViewport(allCards)) {
    return centerViewportOnCards(allCards);
  }

  return false;
}

function applyWorldFormCategoryLock() {
  const inWorldMode = Boolean(activeWorldContext?.world?.category);

  postCategoryDisplay?.classList.toggle('is-disabled', inWorldMode);
  addCategoryToggle?.classList.toggle('is-disabled', inWorldMode);

  if (inWorldMode) {
    setCategoryValue(activeWorldContext.world.category);
    addCategoryToggle.disabled = true;
    postCategoryDisplay?.setAttribute('aria-disabled', 'true');
    closeCategorySelectDropdown();
    closeCategoryEditorPanel();
    return;
  }

  addCategoryToggle.disabled = false;
  postCategoryDisplay?.removeAttribute('aria-disabled');
}

function clearVisibleCanvasContent() {
  if (!postCanvas) return;

  postCanvas.innerHTML = '';
  buildPostCard._indexCounter = 0;
  lastLoadedPosts = [];
  lastLoadedWorlds = [];
  renderLinks(lastLoadedPosts, lastLoadedLinks);
  scheduleCardLodRefresh();
}

function applyOptimisticPostRemoval(postIds = []) {
  const idSet = new Set((postIds || []).map((id) => String(id)).filter(Boolean));
  if (!idSet.size) return;

  lastLoadedPosts = (lastLoadedPosts || []).filter((post) => !idSet.has(String(post?.id)));
  idSet.forEach((id) => {
    postRecordCache.delete(String(id));
    if (postCanvas) {
      postCanvas.querySelector(`.post-card[data-post-id="${id}"]`)?.remove();
    }
  });

  renderLinks(lastLoadedPosts, lastLoadedLinks);
  scheduleCardLodRefresh();
}

function refreshFeedAfterMutation(options = {}) {
  const { withLinks = true } = options;
  const postsPromise = loadPosts({ force: true });

  if (!withLinks) return postsPromise;

  return postsPromise
    .then(() => loadLinks())
    .then(() => {
      renderLinks(lastLoadedPosts, lastLoadedLinks);
    })
    .catch((error) => {
      console.error('Post-mutation refresh failed:', error);
    });
}

async function enterWorldMode(worldPayload) {
  if (!worldPayload?.world) return;

  const transitionKey = getWorldTransitionKey('enter', worldPayload);
  if (worldModeTransitionPromise && worldModeTransitionKey === transitionKey) {
    console.warn('[feed reload skipped: already loading]');
    return worldModeTransitionPromise;
  }

  const runPromise = (async () => {
    activeWorldContext = worldPayload;
    worldsFeature?.setWorldLoaderProgress?.(0);
    setCanvasLoadingState(true, 'loading world...');
    worldsFeature?.setWorldLoaderProgress?.(16);
    await preloadBackgroundImage(worldPayload?.backgroundUrl || DEFAULT_BG_URL);
    applyWorldModeVisuals(worldPayload);
    clearVisibleCanvasContent();

    worldsFeature?.setWorldLoaderProgress?.(28);
    await loadPosts({ force: true, clearCanvasImmediately: true });
    worldsFeature?.setWorldLoaderProgress?.(68);
    await waitForLayoutStability();
    recoverViewportForCurrentContext();

    worldsFeature?.setWorldLoaderProgress?.(84);
    await Promise.allSettled([
      loadLinks().then(() => renderLinks(lastLoadedPosts, lastLoadedLinks)),
      loadNotifications()
    ]);
    worldsFeature?.setWorldLoaderProgress?.(100);
  })();

  worldModeTransitionKey = transitionKey;
  worldModeTransitionPromise = runPromise;

  try {
    return await runPromise;
  } finally {
    if (worldModeTransitionPromise === runPromise) {
      worldModeTransitionPromise = null;
      worldModeTransitionKey = '';
    }
  }
}

async function exitWorldMode() {
  const transitionKey = getWorldTransitionKey('exit', null);
  if (worldModeTransitionPromise && worldModeTransitionKey === transitionKey) {
    console.warn('[feed reload skipped: already loading]');
    return worldModeTransitionPromise;
  }

  const runPromise = (async () => {
    activeWorldContext = null;
    worldsFeature?.setWorldLoaderProgress?.(0);
    setCanvasLoadingState(true, 'loading main...');
    worldsFeature?.setWorldLoaderProgress?.(16);
    await preloadBackgroundImage(DEFAULT_BG_URL);
    applyWorldModeVisuals(null);
    clearVisibleCanvasContent();

    worldsFeature?.setWorldLoaderProgress?.(28);
    await loadPosts({ force: true, clearCanvasImmediately: true });
    worldsFeature?.setWorldLoaderProgress?.(68);
    await waitForLayoutStability();
    recoverViewportForCurrentContext();

    worldsFeature?.setWorldLoaderProgress?.(84);
    await Promise.allSettled([
      loadLinks().then(() => renderLinks(lastLoadedPosts, lastLoadedLinks)),
      loadNotifications()
    ]);
    worldsFeature?.setWorldLoaderProgress?.(100);
  })();

  worldModeTransitionKey = transitionKey;
  worldModeTransitionPromise = runPromise;

  try {
    return await runPromise;
  } finally {
    worldsFeature?.hideTransitionLoader?.();
    if (worldModeTransitionPromise === runPromise) {
      worldModeTransitionPromise = null;
      worldModeTransitionKey = '';
    }
  }
}

function scheduleWorldModeReload(mode, worldPayload = null, delayMs = 0) {
  worldModeReloadSeq += 1;
  const seq = worldModeReloadSeq;

  if (worldModeReloadResolve) {
    worldModeReloadResolve(false);
    worldModeReloadResolve = null;
  }
  window.clearTimeout(worldModeReloadTimer);

  return new Promise((resolve) => {
    worldModeReloadResolve = resolve;

    const executeReload = async () => {
      if (seq !== worldModeReloadSeq) {
        resolve(false);
        return;
      }

      worldModeReloadResolve = null;
      try {
        if (mode === 'enter') {
          await enterWorldMode(worldPayload);
        } else {
          await exitWorldMode();
        }
        resolve(true);
      } catch (err) {
        console.error('World mode reload failed:', err);
        resolve(false);
      }
    };

    if (delayMs > 0) {
      worldModeReloadTimer = window.setTimeout(executeReload, delayMs);
      return;
    }

    Promise.resolve().then(executeReload);
  });
}

function openPostForm() {
  if (activeWorldContext?.world && activeWorldContext.world.is_public_edit === false) {
    if ((currentUser?.id || null) !== activeWorldContext.world.user_id) {
      alert('Only the world creator can post here.');
      return;
    }
  }
  postFileInput.multiple = true;
  postFormOverlay.style.display = 'flex';
  schedulePostTextMentionRefresh();
  renderPlainFieldSpellDecoration(postTitle);
  renderPlainFieldSpellDecoration(postCategoryInput);
  renderPlainFieldSpellDecoration(postYoutubeInput);
  scheduleUiStatePersist();
}

function setCategoryValue(val) {
  postCategory.value = val || '';
  if (postCategoryDisplayText) {
    postCategoryDisplayText.textContent = val || 'select category';
    postCategoryDisplayText.classList.toggle('is-placeholder', !val);
  }
}

function openCategorySelectDropdown() {
  if (!postCategoryDropdown) return;
  postCategoryDropdown.style.display = 'flex';
  postCategoryDisplay?.classList.add('is-open');
}

function closeCategorySelectDropdown() {
  if (!postCategoryDropdown) return;
  postCategoryDropdown.style.display = 'none';
  postCategoryDisplay?.classList.remove('is-open');
}

function openCategoryEditorPanel() {
  editingCategoryName = null;
  closeCategoryColorPicker();
  renderCategoryEditor();
  postCategoryPanel.style.display = 'flex';
  addCategoryToggle.classList.add('is-open');
}

function closeCategoryEditorPanel() {
  editingCategoryName = null;
  closeCategoryColorPicker();
  renderCategoryEditor();
  postCategoryPanel.style.display = 'none';
  addCategoryToggle.classList.remove('is-open');
}

function closePostForm() {
  postCoverImageInput.value = '';
  postCoverFileName.textContent = 'choose cover image';
  postCoverImageLabel.style.display = 'none';
  postFormOverlay.style.display = 'none';
  postTitle.value = '';
  postFileInput.value = '';
  postFileName.textContent = 'choose file';
  setPostTextBody('');
  postCategory.value = '';
  setCategoryValue('');
  postCategoryInput.value = '';
  closeCategoryEditorPanel();
  editingPostId = null;
  editingPost   = null;
  postDeleteBtn.style.display = 'none'; // hide when form closes
  postYoutubeInput.value = '';
  clearFieldSpellDecoration(postTitle);
  clearFieldSpellDecoration(postCategoryInput);
  clearFieldSpellDecoration(postYoutubeInput);

  // clear pending link target
  pendingLinkPostId = null;
  scheduleUiStatePersist();
}

function hasUnsavedFormContent() {
  if (postTitle.value.trim()) return true;
  if (postFileInput.files && postFileInput.files.length > 0) return true;
  if (getBodyPlainText(postText.innerHTML || '')) return true;
  if (postYoutubeInput.value.trim()) return true;
  return false;
}

async function maybeClosePostForm() {
  if (hasUnsavedFormContent()) {
    const isEditing = Boolean(editingPostId);
    const title = isEditing ? 'discard post edits?' : 'discard this draft?';
    const message = isEditing
      ? 'You have unsaved edits in this post form. Closing now will lose these changes.'
      : 'You have unsaved content in this draft. Closing now will lose it.';

    let shouldClose = false;
    if (typeof window.__prettyConfirm === 'function') {
      shouldClose = await window.__prettyConfirm({
        title,
        message,
        confirmLabel: 'discard',
        cancelLabel: 'keep editing',
        danger: true
      });
    } else {
      shouldClose = confirm('Unsaved changes will be lost. Close anyway?');
    }

    if (!shouldClose) return;
  }
  closePostForm();
}

function closeCoverImagePrompt() {
  coverImageOverlay.style.display = 'none';
  coverImageInput.value = '';
  coverImageFileName.textContent = 'choose image';
  pendingPost = null;
}

function initFileNav(files) {
  let idx = 0;

  const viewer = document.getElementById('fileNavViewer');
  const label  = document.getElementById('fileNavLabel');
  const prev   = document.getElementById('fileNavPrev');
  const next   = document.getElementById('fileNavNext');
  if (!viewer || !label || !prev || !next) return;

  function render() {
    const f = files[idx];
    label.textContent = `${f.name}  (${idx + 1} / ${files.length})`;

    if (f.type === 'image') {
      viewer.innerHTML = `<img class="post-image" src="${f.url}" alt="" loading="lazy" decoding="async">`;
    } else if (f.type === 'video') {
      viewer.innerHTML = `<video class="post-video" src="${f.url}" controls></video>`;
    } else if (f.type === 'audio') {
      viewer.innerHTML = `<audio src="${f.url}" controls style="width:100%"></audio>`;
    } else {
      viewer.innerHTML = `
        <div class="file-nav-download">
          <a href="${f.url}" download>${f.name}</a>
        </div>
      `;
    }
  }

  prev.addEventListener('click', () => { idx = (idx - 1 + files.length) % files.length; render(); });
  next.addEventListener('click', () => { idx = (idx + 1) % files.length; render(); });
  render();
}

// ============================================
// 9. BODY CONTENT + EMBED HELPERS
// ============================================


function extractYouTubeId(url) {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  const candidate = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const isYouTubeHost =
    host === 'youtu.be'
    || host === 'youtube.com'
    || host.endsWith('.youtube.com')
    || host === 'youtube-nocookie.com'
    || host.endsWith('.youtube-nocookie.com');

  if (!isYouTubeHost) return null;

  const isValidId = (value) => /^[a-zA-Z0-9_-]{11}$/.test(String(value || ''));

  if (host === 'youtu.be') {
    const shortId = parsed.pathname.split('/').filter(Boolean)[0] || '';
    return isValidId(shortId) ? shortId : null;
  }

  const watchId = parsed.searchParams.get('v') || '';
  if (isValidId(watchId)) return watchId;

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length >= 2) {
    const [prefix, id] = segments;
    if ((prefix === 'embed' || prefix === 'shorts' || prefix === 'live') && isValidId(id)) {
      return id;
    }
  }

  return null;
}

function getYouTubePosterUrl(youtubeId) {
  if (!youtubeId) return '';
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

function getYouTubeEmbedSrc(youtubeId, { autoplay = false, muted = true } = {}) {
  const autoplayFlag = autoplay ? '1' : '0';
  const muteFlag = muted ? '1' : '0';
  return `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=${autoplayFlag}&mute=${muteFlag}&rel=0&playsinline=1&modestbranding=1&iv_load_policy=3&color=white&origin=${encodeURIComponent(window.location.origin)}`;
}

function createYouTubePosterShellMarkup(youtubeId, shellClass, buttonClass, iconClass) {
  const posterUrl = getYouTubePosterUrl(youtubeId);
  return `
    <div class="${shellClass}" data-youtube-id="${youtubeId}">
      <img class="post-file-preview-cover" src="${posterUrl}" alt="YouTube thumbnail" loading="lazy" decoding="async">
      <button class="${buttonClass}" type="button" aria-label="play YouTube video">
        <span class="${iconClass}" aria-hidden="true">▶︎</span>
      </button>
    </div>
  `;
}

function activateYouTubeEmbed(shell, iframeClass) {
  if (!shell) return;
  const youtubeId = shell.dataset.youtubeId || '';
  if (!youtubeId) return;

  shell.innerHTML = `
    <iframe
      class="${iframeClass}"
      src="${getYouTubeEmbedSrc(youtubeId, { autoplay: true })}"
      title="YouTube video"
      frameborder="0"
      allowfullscreen
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      loading="lazy"
    ></iframe>
  `;
}

function escapeHtml(text = '') {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createTaskLineElement(text) {
  const match = String(text || '').match(/^\s*\[([ xX])\]\s*(.*)$/);
  if (!match) return null;

  const checked = match[1].toLowerCase() === 'x';
  const content = match[2] || '';
  const line = document.createElement('div');
  line.className = 'post-task-line';

  const box = document.createElement('span');
  box.className = 'post-task-box';
  box.setAttribute('aria-hidden', 'true');
  box.textContent = checked ? '☑' : '☐';

  const label = document.createElement('span');
  label.className = 'post-task-text';
  label.textContent = content;

  line.appendChild(box);
  line.appendChild(label);
  return line;
}

function formatTaskListMarkup(html) {
  if (!html) return '';

  const template = document.createElement('template');
  template.innerHTML = String(html);

  const replaceWithTaskLine = (node) => {
    const taskLine = createTaskLineElement(node.textContent || '');
    if (!taskLine || !node.parentNode) return false;
    node.parentNode.replaceChild(taskLine, node);
    return true;
  };

  [...template.content.childNodes].forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      replaceWithTaskLine(node);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toLowerCase();
    const hasNestedBlocks = node.querySelector('ul, ol, li, p, div, br');
    if ((tag === 'div' || tag === 'p') && !hasNestedBlocks) {
      replaceWithTaskLine(node);
    }
  });

  return template.innerHTML;
}

function normalizeLinkUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (/\s/.test(trimmed)) return null;

  const candidate = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (!/^https?:$/i.test(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function formatStoredPostLinkForInput(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return `https://youtu.be/${trimmed}`;
  }

  return trimmed;
}

function getPostExternalUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed || extractYouTubeId(trimmed)) return null;
  return normalizeLinkUrl(trimmed);
}

function renderPostExternalLinkMarkup(value, { clickable = false } = {}) {
  const externalUrl = getPostExternalUrl(value);
  if (!externalUrl) return '';

  const safeUrl = escapeHtml(externalUrl);
  const displayUrl = escapeHtml(formatExternalLinkDisplayText(externalUrl));
  if (!clickable) {
    return `<span class="post-external-link">${displayUrl}</span>`;
  }

  return `<a class="post-external-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer">${displayUrl}</a>`;
}

function formatExternalLinkDisplayText(value) {
  const externalUrl = getPostExternalUrl(value);
  if (!externalUrl) return '';

  try {
    const parsed = new URL(externalUrl);
    const host = parsed.hostname.replace(/^www\./i, '');
    const path = parsed.pathname.replace(/\/+$/g, '');
    const display = `${host}${path}` || host;
    return display.length > 48 ? `${display.slice(0, 45)}...` : display;
  } catch {
    const fallback = externalUrl.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    return fallback.length > 48 ? `${fallback.slice(0, 45)}...` : fallback;
  }
}

function renderPostTitleMarkup(title, { clickableMentions = true } = {}) {
  const titleText = String(title || '').trim();
  if (!titleText) return '';

  return `<div class="post-title"><span class="post-title-track">${formatBodyTextWithMentions(titleText, { clickable: clickableMentions })}</span></div>`;
}

async function loadMentionUserMap() {
  if (mentionUserMapCache) return mentionUserMapCache;

  if (!mentionUserMapPromise) {
    mentionUserMapPromise = (async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, username');

      if (error) throw error;

      const map = {};
      const aliasGroups = new Map();
      (data || []).forEach((user) => {
        const username = String(user?.username || '');
        if (!username || !user?.id) return;
        map[username] = { id: user.id, username };

        const alias = normalizeMentionAlias(username);
        if (!alias) return;
        const group = aliasGroups.get(alias) || [];
        group.push(username);
        aliasGroups.set(alias, group);
      });

      const aliasMap = {};
      aliasGroups.forEach((usernames, alias) => {
        if (usernames.length !== 1) return;
        const canonicalUsername = usernames[0];
        const user = map[canonicalUsername];
        if (!user) return;
        aliasMap[alias] = user;
      });

      mentionUserMapCache = map;
      mentionAliasMapCache = aliasMap;
      return map;
    })().catch((error) => {
      console.error('Failed to load mention users:', error);
      mentionUserMapCache = {};
      mentionAliasMapCache = {};
      return mentionUserMapCache;
    }).finally(() => {
      mentionUserMapPromise = null;
    });
  }

  return mentionUserMapPromise;
}

function getPlainTextFromHtml(value) {
  if (!value) return '';

  const template = document.createElement('template');
  template.innerHTML = String(value);
  return (template.content.textContent || '').replace(/\u00A0/g, ' ');
}

function normalizeMentionAlias(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isMentionBoundaryChar(char) {
  return !char || !/[A-Za-z0-9_]/.test(char);
}

function getMentionCandidates() {
  const candidates = [];

  Object.values(mentionUserMapCache || {}).forEach((user) => {
    if (!user?.username) return;
    candidates.push({ needle: String(user.username), user });
  });

  Object.entries(mentionAliasMapCache || {}).forEach(([alias, user]) => {
    if (!alias || !user?.username) return;
    candidates.push({ needle: alias, user });
  });

  return candidates.sort((left, right) => String(right.needle).length - String(left.needle).length);
}

function findMentionMatchesInText(text) {
  const source = String(text || '');
  const candidates = getMentionCandidates();
  const matches = [];

  candidates.forEach((candidate) => {
    const needle = String(candidate?.needle || '');
    if (!needle) return;

    let searchIndex = 0;
    while (searchIndex <= source.length) {
      const matchIndex = source.indexOf(needle, searchIndex);
      if (matchIndex === -1) break;

      const beforeChar = source[matchIndex - 1];
      const afterChar = source[matchIndex + needle.length];
      if (isMentionBoundaryChar(beforeChar) && isMentionBoundaryChar(afterChar)) {
        matches.push({
          start: matchIndex,
          end: matchIndex + needle.length,
          username: candidate.user?.username || needle,
          userId: candidate.user?.id || null,
          displayText: source.slice(matchIndex, matchIndex + needle.length)
        });
      }

      searchIndex = matchIndex + Math.max(1, needle.length);
    }
  });

  matches.sort((left, right) => {
    if (left.start !== right.start) return left.start - right.start;
    return (right.end - right.start) - (left.end - left.start);
  });

  const accepted = [];
  let lastEnd = -1;
  for (const match of matches) {
    if (match.start < lastEnd) continue;
    accepted.push(match);
    lastEnd = match.end;
  }

  return accepted;
}

function extractMentionUsernames(value) {
  const plainText = getPlainTextFromHtml(value);
  if (!plainText) return [];

  const matches = new Set();
  findMentionMatchesInText(plainText).forEach((match) => {
    if (match.username) matches.add(match.username);
  });

  return [...matches];
}

function highlightMentionsInHtml(html, { clickable = false } = {}) {
  const normalizedHtml = String(html || '');
  if (!normalizedHtml) return normalizedHtml;

  const template = document.createElement('template');
  template.innerHTML = normalizedHtml;

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  textNodes.forEach((node) => {
    const text = node.nodeValue || '';
    if (!text) return;

    const matches = findMentionMatchesInText(text);
    if (matches.length === 0) return;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    for (const match of matches) {
      const matchStart = match.start;
      const username = match.displayText || match.username || '';
      const mentionEnd = match.end;

      if (matchStart > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, matchStart)));
      }

      const mention = document.createElement('span');
      mention.className = 'mention-token';
      if (clickable && match.userId) {
        mention.classList.add('mention-token-link');
        mention.dataset.userId = String(match.userId);
        mention.dataset.username = String(match.username || username);
      }
      mention.textContent = username;
      fragment.appendChild(mention);

      lastIndex = mentionEnd;
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    if (node.parentNode) {
      node.parentNode.replaceChild(fragment, node);
    }
  });

  return template.innerHTML;
}

function getEditableSelectionOffsets(root) {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;

  const startRange = document.createRange();
  startRange.selectNodeContents(root);
  startRange.setEnd(range.startContainer, range.startOffset);

  const endRange = document.createRange();
  endRange.selectNodeContents(root);
  endRange.setEnd(range.endContainer, range.endOffset);

  return {
    start: startRange.toString().length,
    end: endRange.toString().length
  };
}

function restoreEditableSelectionOffsets(root, startOffset, endOffset) {
  const selection = window.getSelection?.();
  if (!selection) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();
  let currentOffset = 0;
  let startNode = null;
  let startNodeOffset = 0;
  let endNode = null;
  let endNodeOffset = 0;

  while (currentNode) {
    const nextOffset = currentOffset + currentNode.nodeValue.length;

    if (!startNode && startOffset <= nextOffset) {
      startNode = currentNode;
      startNodeOffset = Math.max(0, startOffset - currentOffset);
    }

    if (!endNode && endOffset <= nextOffset) {
      endNode = currentNode;
      endNodeOffset = Math.max(0, endOffset - currentOffset);
      break;
    }

    currentOffset = nextOffset;
    currentNode = walker.nextNode();
  }

  if (!startNode) {
    startNode = root;
    startNodeOffset = root.childNodes.length;
  }

  if (!endNode) {
    endNode = startNode;
    endNodeOffset = startNodeOffset;
  }

  const range = document.createRange();
  try {
    range.setStart(startNode, startNodeOffset);
    range.setEnd(endNode, endNodeOffset);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // If the DOM changed too much, keep the current browser selection.
  }
}

function normalizeSpellWord(word = '') {
  return String(word || '').replace(/^'+|'+$/g, '').toLowerCase();
}

function canSpellcheckToken(word, beforeChar = '', afterChar = '') {
  if (!word) return false;
  if (word.length < 3) return false;
  if (/\d/.test(word)) return false;
  if (/^[A-Z]{2,}$/.test(word)) return false;
  if (/[.@/_-]/.test(beforeChar) || /[.@/_-]/.test(afterChar)) return false;
  return true;
}

function isMisspelledWord(word) {
  if (!postSpellChecker) return false;

  const normalized = normalizeSpellWord(word);
  if (!normalized || postSpellIgnoreAll.has(normalized)) return false;

  return !postSpellChecker.correct(word) && !postSpellChecker.correct(normalized);
}

function getWordSuggestion(word) {
  if (!postSpellChecker) return '';
  const suggestions = postSpellChecker.suggest(word) || [];
  return String(suggestions[0] || '').trim();
}

function getPostSpellFieldIgnoreSet(fieldEl) {
  if (!fieldEl) return new Set();
  let ignoreSet = postSpellFieldIgnoreMap.get(fieldEl);
  if (!ignoreSet) {
    ignoreSet = new Set();
    postSpellFieldIgnoreMap.set(fieldEl, ignoreSet);
  }
  return ignoreSet;
}

function findMisspelledWordRanges(text, { ignoreSet = null } = {}) {
  const ranges = [];
  if (!postSpellChecker || !text) return ranges;

  const wordRegex = /[A-Za-z][A-Za-z']*/g;
  wordRegex.lastIndex = 0;

  let match = wordRegex.exec(text);
  while (match) {
    const rawWord = match[0];
    const start = match.index;
    const end = start + rawWord.length;
    const beforeChar = start > 0 ? text[start - 1] : '';
    const afterChar = end < text.length ? text[end] : '';

    if (canSpellcheckToken(rawWord, beforeChar, afterChar)) {
      const normalizedWord = normalizeSpellWord(rawWord);
      const wordKey = `${normalizedWord}:${start}`;
      const isIgnoredOne = ignoreSet?.has(wordKey);
      if (!isIgnoredOne && isMisspelledWord(rawWord)) {
        ranges.push({ start, end, word: rawWord, normalizedWord, key: wordKey });
      }
    }

    match = wordRegex.exec(text);
  }

  return ranges;
}

function getSpellWordAtCaret(value, caretIndex) {
  const text = String(value || '');
  if (!text) return null;

  let idx = Math.max(0, Math.min(Number(caretIndex) || 0, text.length));
  const isWordChar = (ch) => /[A-Za-z']/.test(ch || '');

  if (!isWordChar(text[idx]) && idx > 0 && isWordChar(text[idx - 1])) {
    idx -= 1;
  }

  if (!isWordChar(text[idx])) return null;

  let start = idx;
  let end = idx + 1;

  while (start > 0 && isWordChar(text[start - 1])) start -= 1;
  while (end < text.length && isWordChar(text[end])) end += 1;

  const word = text.slice(start, end);
  if (!word) return null;

  const beforeChar = start > 0 ? text[start - 1] : '';
  const afterChar = end < text.length ? text[end] : '';
  if (!canSpellcheckToken(word, beforeChar, afterChar)) return null;

  const normalizedWord = normalizeSpellWord(word);
  const key = `${normalizedWord}:${start}`;
  return { start, end, word, normalizedWord, key };
}

function clearFieldSpellDecoration(fieldEl) {
  if (!fieldEl) return;
  fieldEl.style.removeProperty('background-image');
  fieldEl.style.removeProperty('background-repeat');
  fieldEl.style.removeProperty('background-size');
  fieldEl.style.removeProperty('background-position');
  postSpellFieldRangesMap.set(fieldEl, []);
}

function renderPlainFieldSpellDecoration(fieldEl) {
  if (!fieldEl || !postSpellChecker) {
    clearFieldSpellDecoration(fieldEl);
    return;
  }

  const fieldValue = String(fieldEl.value || '');
  if (!fieldValue) {
    clearFieldSpellDecoration(fieldEl);
    return;
  }

  const ignoreSet = getPostSpellFieldIgnoreSet(fieldEl);
  const ranges = findMisspelledWordRanges(fieldValue, { ignoreSet });
  postSpellFieldRangesMap.set(fieldEl, ranges);

  if (!ranges.length) {
    clearFieldSpellDecoration(fieldEl);
    return;
  }

  const style = window.getComputedStyle(fieldEl);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    clearFieldSpellDecoration(fieldEl);
    return;
  }

  ctx.font = `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

  const padLeft = parseFloat(style.paddingLeft) || 0;
  const underlineY = Math.max(2, fieldEl.clientHeight - 4);
  const images = [];
  const sizes = [];
  const positions = [];
  const repeats = [];

  ranges.forEach((range) => {
    const prefix = fieldValue.slice(0, range.start);
    const token = fieldValue.slice(range.start, range.end);
    const x = Math.max(0, padLeft + ctx.measureText(prefix).width - fieldEl.scrollLeft);
    const w = Math.max(2, ctx.measureText(token).width);

    images.push('repeating-linear-gradient(to right, currentColor 0 4px, transparent 4px 7px)');
    sizes.push(`${Math.round(w)}px 1px`);
    positions.push(`${Math.round(x)}px ${underlineY}px`);
    repeats.push('no-repeat');
  });

  fieldEl.style.backgroundImage = images.join(', ');
  fieldEl.style.backgroundSize = sizes.join(', ');
  fieldEl.style.backgroundPosition = positions.join(', ');
  fieldEl.style.backgroundRepeat = repeats.join(', ');
}

function isSpellEnabledPlainField(fieldEl) {
  if (!fieldEl) return false;
  if (fieldEl.disabled || fieldEl.readOnly) return false;
  const tag = fieldEl.tagName?.toLowerCase();
  if (tag === 'textarea') return true;
  if (tag !== 'input') return false;

  const type = String(fieldEl.type || 'text').toLowerCase();
  return type === 'text' || type === 'search';
}

function wirePlainFieldSpellcheck(fieldEl) {
  if (!isSpellEnabledPlainField(fieldEl)) return;

  fieldEl.spellcheck = false;

  const repaint = () => {
    renderPlainFieldSpellDecoration(fieldEl);
  };

  fieldEl.addEventListener('input', repaint);
  fieldEl.addEventListener('scroll', repaint, { passive: true });
  fieldEl.addEventListener('focus', repaint);
  fieldEl.addEventListener('blur', () => {
    hidePostSpellMenu();
  });

  const openFieldSpellMenu = (e) => {
    const text = String(fieldEl.value || '');
    if (!text) {
      hidePostSpellMenu();
      return;
    }

    const caret = Number(fieldEl.selectionStart ?? 0);
    const wordInfo = getSpellWordAtCaret(text, caret);
    if (!wordInfo || !isMisspelledWord(wordInfo.word)) {
      hidePostSpellMenu();
      return;
    }

    const ignoreSet = getPostSpellFieldIgnoreSet(fieldEl);
    if (ignoreSet.has(wordInfo.key)) {
      hidePostSpellMenu();
      return;
    }

    const menu = document.getElementById('postSpellContextMenu');
    const replaceBtn = document.getElementById('postSpellReplaceBtn');
    if (!menu || !replaceBtn) return;

    const suggestion = getWordSuggestion(wordInfo.word);
    replaceBtn.textContent = suggestion || 'no suggestion';
    replaceBtn.disabled = !suggestion;
    postSpellMenuState = {
      tokenEl: null,
      key: wordInfo.key,
      normalizedWord: wordInfo.normalizedWord,
      suggestion,
      fieldEl,
      rangeStart: wordInfo.start,
      rangeEnd: wordInfo.end
    };

    const menuWidth = 220;
    const menuHeight = 126;
    const left = Math.max(10, Math.min(e.clientX + 8, window.innerWidth - menuWidth - 10));
    const top = Math.max(10, Math.min(e.clientY + 8, window.innerHeight - menuHeight - 10));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.classList.add('show');
    menu.setAttribute('aria-hidden', 'false');
    e.preventDefault();
    e.stopPropagation();
  };

  fieldEl.addEventListener('click', openFieldSpellMenu);
  fieldEl.addEventListener('contextmenu', openFieldSpellMenu);

  repaint();
}

function applyPostTextSpellcheckMarkup(html) {
  if (!postSpellChecker || !html) return html;

  const template = document.createElement('template');
  template.innerHTML = html;

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node);
    node = walker.nextNode();
  }

  let absoluteOffset = 0;
  const wordRegex = /[A-Za-z][A-Za-z']*/g;

  nodes.forEach((textNode) => {
    const parentNode = textNode.parentNode;
    const parentEl = parentNode instanceof Element ? parentNode : null;
    const text = textNode.nodeValue || '';
    const nodeStartOffset = absoluteOffset;
    absoluteOffset += text.length;

    if (!text.trim()) return;
    if (parentEl && parentEl.closest('.mention-token, .spellcheck-token, a')) return;

    wordRegex.lastIndex = 0;
    let lastIndex = 0;
    let hasChanges = false;
    const fragment = document.createDocumentFragment();
    let match = wordRegex.exec(text);

    while (match) {
      const rawWord = match[0];
      const start = match.index;
      const end = start + rawWord.length;
      const beforeChar = start > 0 ? text[start - 1] : '';
      const afterChar = end < text.length ? text[end] : '';

      if (!canSpellcheckToken(rawWord, beforeChar, afterChar)) {
        match = wordRegex.exec(text);
        continue;
      }

      const normalizedWord = normalizeSpellWord(rawWord);
      const wordKey = `${normalizedWord}:${nodeStartOffset + start}`;
      const shouldMark = isMisspelledWord(rawWord) && !postSpellIgnoreOne.has(wordKey);

      if (shouldMark) {
        if (start > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
        }

        const misspelled = document.createElement('span');
        misspelled.className = 'spellcheck-token';
        misspelled.textContent = rawWord;
        misspelled.dataset.spellWord = rawWord;
        misspelled.dataset.spellNorm = normalizedWord;
        misspelled.dataset.spellKey = wordKey;
        fragment.appendChild(misspelled);

        lastIndex = end;
        hasChanges = true;
      }

      match = wordRegex.exec(text);
    }

    if (!hasChanges) return;

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    parentNode.replaceChild(fragment, textNode);
  });

  return template.innerHTML;
}

function hidePostSpellMenu() {
  const menu = document.getElementById('postSpellContextMenu');
  if (!menu) return;
  menu.classList.remove('show');
  menu.setAttribute('aria-hidden', 'true');
  postSpellMenuState = {
    tokenEl: null,
    key: '',
    normalizedWord: '',
    suggestion: '',
    fieldEl: null,
    rangeStart: -1,
    rangeEnd: -1
  };
}

function showPostSpellMenu(clientX, clientY, tokenEl) {
  const menu = document.getElementById('postSpellContextMenu');
  const replaceBtn = document.getElementById('postSpellReplaceBtn');
  if (!menu || !replaceBtn || !tokenEl) return;

  const word = tokenEl.dataset.spellWord || tokenEl.textContent || '';
  const normalizedWord = normalizeSpellWord(word);
  const key = tokenEl.dataset.spellKey || '';
  const suggestion = getWordSuggestion(word);

  replaceBtn.textContent = suggestion || 'no suggestion';
  replaceBtn.disabled = !suggestion;

  postSpellMenuState = { tokenEl, key, normalizedWord, suggestion };

  const menuWidth = 220;
  const menuHeight = 126;
  const left = Math.max(10, Math.min(clientX, window.innerWidth - menuWidth - 10));
  const top = Math.max(10, Math.min(clientY, window.innerHeight - menuHeight - 10));

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.classList.add('show');
  menu.setAttribute('aria-hidden', 'false');
}

function initializePostTextSpellcheck() {
  try {
    postSpellChecker = nspell(enAff, enDic);
  } catch (error) {
    postSpellChecker = null;
    console.warn('Custom spellchecker failed to initialize:', error);
  }

  const spellFields = Array.from(document.querySelectorAll('input[type="text"], textarea, [contenteditable="true"]'));
  spellFields.forEach((field) => {
    if (!field) return;
    field.spellcheck = false;
  });

  if (postText) {
    schedulePostTextMentionRefresh();
  }

  spellFields
    .filter((field) => field !== postText)
    .forEach((field) => {
      wirePlainFieldSpellcheck(field);
    });
}

function replaceSpellTokenText(tokenEl, nextWord) {
  if (!tokenEl || !nextWord) return;

  const textNode = document.createTextNode(nextWord);
  tokenEl.replaceWith(textNode);

  const selection = window.getSelection?.();
  if (!selection) return;

  const range = document.createRange();
  range.setStart(textNode, textNode.nodeValue.length);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function refreshPostTextMentions() {
  if (!postText) return;

  const wasFocused = document.activeElement === postText;
  const selectionOffsets = wasFocused ? getEditableSelectionOffsets(postText) : null;

  const sourceHtml = postText.innerHTML || '';
  const normalizedHtml = formatBodyText(sourceHtml);
  const nextHtml = applyPostTextSpellcheckMarkup(normalizedHtml);

  if (postText.innerHTML !== nextHtml) {
    postText.innerHTML = nextHtml;
  }

  if (wasFocused && selectionOffsets) {
    restoreEditableSelectionOffsets(postText, selectionOffsets.start, selectionOffsets.end);
  }
}

function schedulePostTextMentionRefresh() {
  if (postTextMentionRefreshRaf) {
    window.clearTimeout(postTextMentionRefreshRaf);
  }

  postTextMentionRefreshRaf = window.setTimeout(() => {
    postTextMentionRefreshRaf = 0;
    refreshPostTextMentions();
  }, 80);
}

function formatBodyTextWithMentions(text, options = {}) {
  return formatBodyText(text, options);
}

async function queueMentionNotifications({ notificationType, sourcePostId, sourceText, actorUserId }) {
  const mentionUserMap = await loadMentionUserMap();
  const mentionedUsernames = extractMentionUsernames(sourceText);

  if (mentionedUsernames.length === 0) return;

  const { data: sourcePost, error: sourcePostError } = await supabase
    .from('posts')
    .select('id, user_id')
    .eq('id', sourcePostId)
    .maybeSingle();

  if (sourcePostError) {
    console.error('Failed to load source post for mention notifications:', sourcePostError);
    return;
  }

  const sourcePostOwnerId = sourcePost?.user_id ? String(sourcePost.user_id) : null;

  const recipientIds = [...new Set(mentionedUsernames
    .map((username) => mentionUserMap[username]?.id)
    .filter(Boolean)
    .map(String))].filter((recipientId) =>
      recipientId !== String(actorUserId) && recipientId !== sourcePostOwnerId
    );

  if (recipientIds.length === 0) return;

  const { data: existingRows, error: existingError } = await supabase
    .from('notifications')
    .select('recipient_user_id')
    .eq('group_id', 'group0')
    .eq('type', notificationType)
    .eq('post_id', sourcePostId)
    .eq('actor_user_id', actorUserId)
    .in('recipient_user_id', recipientIds);

  if (existingError) {
    console.error('Failed to check existing mention notifications:', existingError);
    return;
  }

  const existingRecipientIds = new Set((existingRows || []).map((row) => String(row.recipient_user_id)));
  const rowsToInsert = recipientIds
    .filter((recipientId) => !existingRecipientIds.has(String(recipientId)))
    .map((recipientId) => ({
      group_id: 'group0',
      recipient_user_id: recipientId,
      actor_user_id: actorUserId,
      post_id: sourcePostId,
      type: notificationType
    }));

  if (rowsToInsert.length === 0) return;

  const { error } = await supabase
    .from('notifications')
    .insert(rowsToInsert);

  if (error) {
    console.error('Failed to create mention notifications:', error);
  }
}

function hasRichTextMarkup(value) {
  if (!value) return false;
  const template = document.createElement('template');
  template.innerHTML = value;
  return [...template.content.childNodes].some(node => node.nodeType === Node.ELEMENT_NODE);
}

function hasRenderableBodyContent(el) {
  if (!el) return false;
  return Boolean((el.textContent || '').trim() || el.querySelector('br, ul, ol, li, p, div'));
}

function hasRenderableBodyMarkup(value) {
  const bodyMarkup = formatBodyText(value);
  if (!bodyMarkup) return false;

  const container = document.createElement('div');
  container.innerHTML = bodyMarkup;
  return hasRenderableBodyContent(container);
}

function sanitizeBodyHtml(value) {
  if (!value) return '';

  if (!hasRichTextMarkup(value)) {
    return escapeHtml(getPlainTextFromHtml(value)).replace(/\n/g, '<br>');
  }

  const template = document.createElement('template');
  template.innerHTML = value;
  const container = document.createElement('div');

  const appendBlockSeparator = (targetParent) => {
    if (!targetParent.lastChild) return;
    if (targetParent.lastChild.nodeType === Node.ELEMENT_NODE && targetParent.lastChild.tagName === 'BR') return;
    targetParent.appendChild(document.createElement('br'));
  };

  function sanitizeNode(node, targetParent, inList = false) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) {
        targetParent.appendChild(document.createTextNode(node.textContent));
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toLowerCase();

    if (tag === 'br') {
      targetParent.appendChild(document.createElement('br'));
      return;
    }

    if (tag === 'b' || tag === 'strong') {
      const strong = document.createElement('strong');
      [...node.childNodes].forEach(child => sanitizeNode(child, strong, inList));
      if (hasRenderableBodyContent(strong)) targetParent.appendChild(strong);
      return;
    }

    if (tag === 'i' || tag === 'em') {
      const em = document.createElement('em');
      [...node.childNodes].forEach(child => sanitizeNode(child, em, inList));
      if (hasRenderableBodyContent(em)) targetParent.appendChild(em);
      return;
    }

    if (tag === 'p' || tag === 'div') {
      appendBlockSeparator(targetParent);
      [...node.childNodes].forEach(child => sanitizeNode(child, targetParent, false));
      return;
    }

    if (tag === 'ul' || tag === 'ol' || tag === 'li') {
      appendBlockSeparator(targetParent);
      [...node.childNodes].forEach(child => sanitizeNode(child, targetParent, false));
      return;
    }

    if (tag === 'span') {
      const fw = node.style?.fontWeight || '';
      const fs = node.style?.fontStyle  || '';
      const isBold   = fw === 'bold' || fw === '700' || fw === 'bolder';
      const isItalic = fs === 'italic' || fs === 'oblique';
      if (isBold && isItalic) {
        const strong = document.createElement('strong');
        const em = document.createElement('em');
        [...node.childNodes].forEach(child => sanitizeNode(child, em, inList));
        if (hasRenderableBodyContent(em)) { strong.appendChild(em); targetParent.appendChild(strong); }
      } else if (isBold) {
        const strong = document.createElement('strong');
        [...node.childNodes].forEach(child => sanitizeNode(child, strong, inList));
        if (hasRenderableBodyContent(strong)) targetParent.appendChild(strong);
      } else if (isItalic) {
        const em = document.createElement('em');
        [...node.childNodes].forEach(child => sanitizeNode(child, em, inList));
        if (hasRenderableBodyContent(em)) targetParent.appendChild(em);
      } else {
        [...node.childNodes].forEach(child => sanitizeNode(child, targetParent, inList));
      }
      return;
    }

    [...node.childNodes].forEach(child => sanitizeNode(child, targetParent, inList));
  }

  [...template.content.childNodes].forEach(node => sanitizeNode(node, container, false));
  return container.innerHTML;
}

function formatBodyText(text) {
  return sanitizeBodyHtml(text);
}

function formatTimestamp(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';

  return dt.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function renderPostBodyMarkup(
  text,
  { externalUrl = null, clickableExternalUrl = false, clickableMentions = false } = {}
) {
  const bodyText = getBodyPlainText(text);
  const hasBodyContent = hasRenderableBodyMarkup(text);
  const bodyExternalUrl = bodyText ? getPostExternalUrl(bodyText) : null;
  const normalizedExternalUrl = getPostExternalUrl(externalUrl);
  const bodyIsDuplicateExternalLink = Boolean(
    bodyExternalUrl && normalizedExternalUrl && bodyExternalUrl === normalizedExternalUrl
  );
  const shouldRenderBodyText = hasBodyContent && !bodyIsDuplicateExternalLink;
  const bodyMarkup = shouldRenderBodyText
    ? `<div class="post-body">${formatBodyText(text)}</div>`
    : '';
  const externalLinkMarkup = renderPostExternalLinkMarkup(externalUrl, {
    clickable: clickableExternalUrl
  });

  if (bodyMarkup && externalLinkMarkup) {
    return `${bodyMarkup}<div class="post-body post-body-external-link">${externalLinkMarkup}</div>`;
  }

  if (bodyMarkup) return bodyMarkup;
  if (externalLinkMarkup) return `<div class="post-body post-body-external-link">${externalLinkMarkup}</div>`;
  return '';
}

function getBodyPlainText(text) {
  const bodyMarkup = formatBodyText(text);
  if (!bodyMarkup) return '';
  const container = document.createElement('div');
  container.innerHTML = bodyMarkup;
  return (container.textContent || '').replace(/\u00A0/g, ' ').trim();
}

function getPostPreviewLabel(post, { maxLength = 60, fallback = 'untitled' } = {}) {
  if (!post) return fallback;

  const title = String(post.title || '').trim();
  if (title) return title;

  const bodyText = getBodyPlainText(post.body || '').replace(/\s+/g, ' ').trim();
  if (bodyText) return bodyText.slice(0, maxLength);

  const fileName = String(post.file_name || '').trim();
  if (fileName) return fileName;

  const externalUrl = getPostExternalUrl(post.youtube_url || '');
  if (externalUrl) return externalUrl.slice(0, maxLength);

  return fallback;
}

function setPostTextBody(text) {
  postSpellIgnoreOne.clear();
  postText.innerHTML = formatBodyText(text || '');
  schedulePostTextMentionRefresh();
}

function getPostTextBody() {
  const sanitized = formatBodyText(postText.innerHTML || '');
  postText.innerHTML = sanitized;
  return sanitized;
}

function insertHtmlAtCursor(html) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    postText.focus();
    document.execCommand('insertHTML', false, html);
    return;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const fragment = range.createContextualFragment(html);
  const lastNode = fragment.lastChild;
  range.insertNode(fragment);

  if (lastNode) {
    range.setStartAfter(lastNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function handlePostTextPaste(e) {
  const html = e.clipboardData?.getData('text/html');
  const text = e.clipboardData?.getData('text/plain') || '';
  const sanitized = html
    ? formatBodyText(html)
    : formatBodyText(text);

  e.preventDefault();
  insertHtmlAtCursor(sanitized || escapeHtml(text));
}

function handlePostTextKeydown(e) {
  const isShortcut = (e.ctrlKey || e.metaKey) && !e.altKey;

  if (isShortcut && !e.shiftKey) {
    const key = String(e.key || '').toLowerCase();
    if (key === 'b' || key === 'i') {
      e.preventDefault();
      document.execCommand(key === 'b' ? 'bold' : 'italic', false);
      schedulePostTextMentionRefresh();
      return;
    }
  }

  if (e.key !== 'Enter' || e.shiftKey) return;

  e.preventDefault();
  insertHtmlAtCursor('<br>');
  schedulePostTextMentionRefresh();
}

function createPdAudioPlayer(audioFiles, { onTrackChange } = {}) {
  if (!audioFiles || audioFiles.length === 0) return null;

  let idx = 0;
  const audio = new Audio();
  audio.preload = 'metadata';

  const player = document.createElement('div');
  player.className = 'pd-audio-player';

  const controls = document.createElement('div');
  controls.className = 'pd-audio-controls';
  controls.innerHTML = `
    ${audioFiles.length > 1 ? `<button class="pd-audio-btn pd-audio-prev" title="previous track">‹</button>` : ''}
    <button class="pd-audio-btn pd-audio-play" title="play / pause">▶︎</button>
    ${audioFiles.length > 1 ? `<button class="pd-audio-btn pd-audio-next" title="next track">›</button>` : ''}
    <span class="pd-audio-title"></span>
  `;
  player.appendChild(controls);

  const seek = document.createElement('input');
  seek.className = 'pd-audio-seek';
  seek.type = 'range';
  seek.min = '0';
  seek.max = '1000';
  seek.step = '1';
  seek.value = '0';
  seek.setAttribute('aria-label', 'audio timeline');
  player.appendChild(seek);

  const playBtn = controls.querySelector('.pd-audio-play');
  const prevBtn = controls.querySelector('.pd-audio-prev');
  const nextBtn = controls.querySelector('.pd-audio-next');
  const titleEl = controls.querySelector('.pd-audio-title');

  function syncSeekUi() {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    if (duration <= 0) {
      seek.value = '0';
      return;
    }
    const ratio = Math.min(1, Math.max(0, currentTime / duration));
    seek.value = String(Math.round(ratio * 1000));
  }

  function syncTrackUi(notify = true) {
    const activeFile = audioFiles[idx];
    titleEl.textContent = activeFile?.name || `track ${idx + 1}`;
    playBtn.textContent = audio.paused ? '▶︎' : '||';
    if (notify && activeFile) {
      onTrackChange?.(activeFile, idx);
    }
  }

  function loadTrack(nextIndex, { autoplay = false, notify = true } = {}) {
    idx = nextIndex;
    const shouldResume = autoplay || !audio.paused;
    audio.pause();
    audio.src = audioFiles[idx].url;
    audio.load();
    seek.value = '0';
    syncTrackUi(notify);

    if (shouldResume) {
      audio.play().then(() => {
        playBtn.textContent = '||';
      }).catch(() => {
        playBtn.textContent = '▶︎';
      });
    }
  }

  playBtn.addEventListener('click', () => {
    if (audio.paused) {
      audio.play().then(() => {
        playBtn.textContent = '||';
      }).catch(() => {});
      return;
    }

    audio.pause();
    playBtn.textContent = '▶︎';
  });

  prevBtn?.addEventListener('click', () => {
    loadTrack((idx - 1 + audioFiles.length) % audioFiles.length, { autoplay: true, notify: true });
  });

  nextBtn?.addEventListener('click', () => {
    loadTrack((idx + 1) % audioFiles.length, { autoplay: true, notify: true });
  });

  audio.addEventListener('ended', () => {
    if (audioFiles.length > 1) {
      loadTrack((idx + 1) % audioFiles.length, { autoplay: true, notify: true });
      return;
    }

    playBtn.textContent = '▶︎';
  });

  audio.addEventListener('play', () => {
    playBtn.textContent = '||';
  });

  audio.addEventListener('pause', () => {
    playBtn.textContent = '▶︎';
  });

  audio.addEventListener('timeupdate', syncSeekUi);
  audio.addEventListener('loadedmetadata', syncSeekUi);
  audio.addEventListener('durationchange', syncSeekUi);

  seek.addEventListener('input', () => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (duration <= 0) return;
    const ratio = Number(seek.value) / 1000;
    audio.currentTime = ratio * duration;
  });

  loadTrack(0, { notify: false });

  return {
    element: player,
    setTrackByUrl(url, { autoplay = false, notify = false } = {}) {
      const nextIndex = audioFiles.findIndex((file) => file.url === url);
      if (nextIndex === -1) return;
      if (nextIndex === idx) {
        syncTrackUi(notify);
        return;
      }
      loadTrack(nextIndex, { autoplay, notify });
    },
    cleanup() {
      audio.pause();
      audio.src = '';
    }
  };
}

function triggerBlobDownload(blob, filename) {
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
  }, 0);
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 60000);
}

async function saveBlobToFile(blob, filename) {
  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
      startIn: 'downloads'
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  triggerBlobDownload(blob, filename);
}

async function triggerFileDownload(url, filename) {
  if (editMode) return;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  await saveBlobToFile(blob, filename);
}

function sanitizeDownloadFilename(value, fallback = 'download') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 180) || fallback;
}

function getPostArchiveName(post) {
  const title = sanitizeDownloadFilename(getPostPreviewLabel(post, { maxLength: 52, fallback: 'post' }), 'post');
  const idSuffix = post?.id ? String(post.id).slice(0, 8) : 'files';
  return `${title}-${idSuffix}.zip`;
}

async function triggerMultiFileZipDownload(files, archiveName = 'attachments.zip') {
  if (editMode) return;
  const zip = new JSZip();
  const nameCounts = new Map();
  const failedFiles = [];
  let added = 0;

  for (const file of (files || [])) {
    const url = String(file?.url || '').trim();
    if (!url) continue;

    const safeBaseName = sanitizeDownloadFilename(file?.name || 'download', 'download');
    const dotIndex = safeBaseName.lastIndexOf('.');
    const hasExt = dotIndex > 0 && dotIndex < safeBaseName.length - 1;
    const stem = hasExt ? safeBaseName.slice(0, dotIndex) : safeBaseName;
    const ext = hasExt ? safeBaseName.slice(dotIndex) : '';

    const nextCount = (nameCounts.get(safeBaseName) || 0) + 1;
    nameCounts.set(safeBaseName, nextCount);
    const uniqueName = nextCount > 1 ? `${stem} (${nextCount})${ext}` : safeBaseName;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      zip.file(uniqueName, blob);
      added += 1;
    } catch (err) {
      failedFiles.push({ name: uniqueName, error: err });
    }
  }

  if (failedFiles.length > 0) {
    const failedNames = failedFiles.slice(0, 3).map((entry) => entry.name).join(', ');
    const extraCount = failedFiles.length > 3 ? ` and ${failedFiles.length - 3} more` : '';
    throw new Error(`Some files could not be added to the zip: ${failedNames}${extraCount}.`);
  }

  if (added === 0) {
    throw new Error('No files could be fetched for zip download.');
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  await saveBlobToFile(zipBlob, sanitizeDownloadFilename(archiveName, 'attachments.zip'));
}

function createPdAttachmentTabBar(attachments, { visualController = null, audioController = null } = {}) {
  if (!attachments || attachments.length === 0) return null;

  const bar = document.createElement('div');
  bar.className = 'pd-file-tab-bar';

  attachments.forEach((attachment) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `pd-file-tab ${attachment.kind === 'audio' ? 'is-audio' : 'is-file'}`;
    button.dataset.fileUrl = attachment.url || '';
    button.dataset.fileName = attachment.name || '';
    const kindToken = attachment.kind === 'audio'
      ? '♫'
      : attachment.kind === 'pdf'
        ? 'pdf'
        : attachment.kind === 'visual'
          ? (attachment.visualType === 'video' ? 'vid' : 'img')
          : 'file';
    button.innerHTML = `
      <span class="pd-tab-kind">${kindToken}</span>
      <span class="pd-tab-name"></span>
    `;
    button.title = attachment.name;
    button.querySelector('.pd-tab-name').textContent = attachment.name;
    button.addEventListener('click', () => {
      bar.querySelectorAll('.pd-file-tab').forEach(b => b.classList.remove('active'));
      button.classList.add('active');

      if (attachment.kind === 'audio' && audioController) {
        audioController.setTrackByUrl(attachment.url, { notify: false });
        return;
      }

      if (attachment.kind === 'pdf' && visualController) {
        visualController.goTo((visual) => visual.type === 'pdf' && visual.url === attachment.url);
        return;
      }

      if (attachment.kind === 'visual' && visualController) {
        visualController.goTo((visual) => {
          if (attachment.visualType) {
            return visual.url === attachment.url && visual.type === attachment.visualType;
          }
          return visual.url === attachment.url;
        });
        return;
      }

      triggerFileDownload(attachment.url, attachment.name);
    });
    bar.appendChild(button);
  });

  // Mark first tab active by default
  const firstTab = bar.querySelector('.pd-file-tab');
  if (firstTab) firstTab.classList.add('active');

  return bar;
}

function wirePreviewVideoControls(content, { freezeMotion = false } = {}) {
  const previewVideo = content.querySelector('.post-preview-video');
  const muteBtn = content.querySelector('.post-preview-mute-btn');
  if (!previewVideo || !muteBtn) return;

  if (freezeMotion || shouldHardFreezeMotion()) {
    previewVideo.pause();
    previewVideo.removeAttribute('autoplay');
    try {
      previewVideo.currentTime = 0;
    } catch {
      // metadata may not be loaded yet
    }
    return;
  }

  muteBtn.textContent = '♫';
  previewVideo.play().catch(() => {});

  muteBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    previewVideo.muted = !previewVideo.muted;
    muteBtn.textContent = previewVideo.muted ? '♫' : '⊘';
  });
}

function wireAudioPreviewControls(content) {
  const audioPreview = content.querySelector('.post-preview-audio');
  const playBtn = content.querySelector('.post-file-preview-play');
  if (!audioPreview || !playBtn) return;

  playBtn.textContent = audioPreview.paused ? '▶︎' : 'II';
  playBtn.addEventListener('click', async (e) => {
    e.stopPropagation();

    try {
      audioPreview.preload = 'auto';

      if (!audioPreview.src && audioPreview.dataset.src) {
        audioPreview.src = audioPreview.dataset.src;
      }

      if (audioPreview.paused) {
        await audioPreview.play();
        playBtn.textContent = 'II';
      } else {
        audioPreview.pause();
        playBtn.textContent = '▶︎';
      }
    } catch (err) {
      console.error('Audio preview failed:', err);
    }
  });

  audioPreview.addEventListener('ended', () => {
    playBtn.textContent = '▶︎';
  });
  audioPreview.addEventListener('pause', () => {
    playBtn.textContent = '▶︎';
  });
  audioPreview.addEventListener('play', () => {
    playBtn.textContent = 'II';
  });
}

function wireFileDownloadControls(content) {
  const downloadButtons = content.querySelectorAll('.post-file-preview-download-btn[data-download-url]');
  downloadButtons.forEach((button) => {
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const url = button.getAttribute('data-download-url');
      const filename = button.getAttribute('data-download-filename') || 'download';
      if (!url) return;

      if (button.disabled) return;
      const originalContent = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `
        <img
          class="pretty-alert-gif post-file-preview-download-gif"
          src="${import.meta.env.BASE_URL}images/pfps/pfp1.webp"
          alt="downloading"
        >
      `;

      try {
        await triggerFileDownload(url, filename);
      } catch (err) {
        console.error('File download failed:', err);
        alert(`Download failed: ${err?.message || err}`);
      }

      window.setTimeout(() => {
        button.innerHTML = originalContent;
        button.disabled = false;
      }, 350);
    });
  });
}

function wireMultiFileDownloadControls(content, post) {
  if (!content || !post?.files || post.files.length < 2) return;

  const button = content.querySelector('.post-file-preview-download-btn[data-download-all="1"]');
  if (!button) return;

  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const filesToDownload = (post.files || [])
      .map((file) => ({
        url: String(file?.url || '').trim(),
        name: String(file?.name || '').trim() || 'download'
      }))
      .filter((file) => file.url);

    if (!filesToDownload.length) return;

    if (button.disabled) return;
    const originalContent = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `
      <img
        class="pretty-alert-gif post-file-preview-download-gif"
        src="${import.meta.env.BASE_URL}images/pfps/pfp3.webp"
        alt="zipping"
      >
    `;

    try {
      await triggerMultiFileZipDownload(filesToDownload, getPostArchiveName(post));
    } catch (err) {
      console.error('Zip download failed:', err);
      alert(`Download failed: ${err?.message || err}`);
    } finally {
      button.innerHTML = originalContent;
      button.disabled = false;
    }
  });
}

function wireYouTubePreviewControls(content, { disableInteraction = false } = {}) {
  const activators = content.querySelectorAll('.post-file-preview-youtube-activate');
  if (!activators.length) return;

  activators.forEach((btn) => {
    let _lastPointerType = 'mouse';
    btn.addEventListener('pointerdown', (e) => { _lastPointerType = e.pointerType; });
    btn.addEventListener('mousedown', (e) => e.stopPropagation());
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // On touch, let the card's tap handler open the post detail instead
      if (_lastPointerType !== 'mouse') return;

      if (disableInteraction || isPlacing || isBulkPlacing || editMode) return;

      const shell = btn.closest('.post-file-preview-youtube-shell');
      activateYouTubeEmbed(shell, 'post-file-preview-youtube-player');
    });
  });
}

function getMultiVisualHoverFrames(post) {
  if (!post || !post.files || post.files.length < 2) return [];

  const frames = [];
  const seen = new Set();
  const push = (url) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    frames.push(url);
  };

  push(post.cover_image_url || '');

  for (const f of post.files) {
    const type = String(f?.type || '').toLowerCase();
    const ext = getFileExtension(f?.name || '');
    if (type === 'image' || isImageExtension(ext)) {
      push(f?.url || '');
    }
  }

  return frames;
}

function wireMultiVisualHoverPreview(content, post, { disableInteraction = false } = {}) {
  if (disableInteraction || !content || !post) return;

  const tile = content.querySelector('.post-file-preview-download.has-cover');
  const cover = tile?.querySelector('.post-file-preview-cover');
  if (!tile || !cover) return;

  const frames = getMultiVisualHoverFrames(post);
  if (frames.length < 2) return;

  for (const src of frames) {
    const img = new Image();
    img.src = src;
  }

  let timerId = 0;
  let idx = 0;

  cover.src = frames[idx];
  timerId = window.setInterval(() => {
    if (!tile.isConnected) {
      window.clearInterval(timerId);
      return;
    }
    idx = (idx + 1) % frames.length;
    cover.src = frames[idx];
  }, 2400);
}

// ============================================
// 10. POST DETAIL LAYOUT HELPERS
// ============================================
function applyPdColWidths() {
  const vc = document.getElementById('pdVisualCol');
  const tc = document.getElementById('pdTextCol');
  const cc = document.getElementById('pdCommentsCol');
  const commentsOpen = !pdCommentsCollapsed;
  if (vc && pdColWidths.visual > 0) vc.style.flex = `0 0 ${pdColWidths.visual}%`;
  if (tc && pdColWidths.text   > 0) tc.style.flex = `0 0 ${pdColWidths.text}%`;
  if (cc) cc.style.flex = commentsOpen ? `0 0 ${pdColWidths.comments}%` : '0 0 0%';
}


// Show/hide columns based on available content
function applyPdLayout(hasVisual, hasText) {
  _pdHasVisual = hasVisual;
  _pdHasText   = hasText;
  pdFullscreen = false;


  const vc  = document.getElementById('pdVisualCol');
  const tc  = document.getElementById('pdTextCol');
  const cc  = document.getElementById('pdCommentsCol');

  const h1  = document.getElementById('pdHandle1');
  const h2  = document.getElementById('pdHandle2');
  const fsb = document.getElementById('pdVisualFullscreenBtn');
  if (fsb) fsb.textContent = '⛶';


  if (hasVisual && hasText) {
    pdColWidths = { visual: 50, text: 30, comments: 20 };
    vc.style.display = ''; h1.style.display = '';
    tc.style.display = ''; h2.style.display = '';
  } else if (hasVisual) {
    pdColWidths = { visual: 80, text: 0, comments: 20 };
    vc.style.display = ''; h1.style.display = 'none';

    tc.style.display = 'none'; h2.style.display = '';
  } else if (hasText) {
    pdColWidths = { visual: 0, text: 80, comments: 20 };
    vc.style.display = 'none'; h1.style.display = 'none';
    tc.style.display = ''; h2.style.display = '';

  } else {
    pdColWidths = { visual: 0, text: 0, comments: 100 };
    vc.style.display = 'none'; h1.style.display = 'none';
    tc.style.display = 'none'; h2.style.display = 'none';
  }
  cc.style.display = '';

  if (pdCommentsCollapsed) {
    const base = pdColWidths.visual + pdColWidths.text;
    if (hasVisual && hasText && base > 0) {
      const visualPct = (pdColWidths.visual / base) * 100;
      const textPct = 100 - visualPct;
      vc.style.flex = `0 0 ${visualPct}%`;
      tc.style.flex = `0 0 ${textPct}%`;
      cc.style.display = 'none';
      h2.style.display = 'none';
      return;
    }
    if (hasVisual) {
      vc.style.flex = '0 0 100%';
      cc.style.display = 'none';
      h2.style.display = 'none';
      return;
    }
    if (hasText) {
      tc.style.flex = '0 0 100%';
      cc.style.display = 'none';
      h2.style.display = 'none';
      return;
    }
  }

  applyPdColWidths();

}

function setPdCommentsCollapsed(collapsed) {
  pdCommentsCollapsed = !!collapsed;
  applyPdLayout(_pdHasVisual, _pdHasText);
}

function showPdFileContextMenu(clientX, clientY, file, files = []) {
  const menu = document.getElementById('pdFileContextMenu');
  const downloadFileBtn = document.getElementById('pdCtxDownloadFile');
  const downloadAllBtn = document.getElementById('pdCtxDownloadAll');
  if (!menu || !downloadFileBtn || !downloadAllBtn || !file?.url) return;

  const deduped = [];
  const seen = new Set();
  (files || []).forEach((entry) => {
    if (!entry?.url || seen.has(entry.url)) return;
    seen.add(entry.url);
    deduped.push(entry);
  });

  pdContextMenuState = {
    file,
    files: deduped
  };

  menu.classList.add('show');
  const maxX = window.innerWidth - menu.offsetWidth - 6;
  const maxY = window.innerHeight - menu.offsetHeight - 6;
  menu.style.left = `${Math.max(6, Math.min(clientX, maxX))}px`;
  menu.style.top = `${Math.max(6, Math.min(clientY, maxY))}px`;
}

function hidePdFileContextMenu() {
  const menu = document.getElementById('pdFileContextMenu');
  if (menu) menu.classList.remove('show');
  pdContextMenuState = { file: null, files: [] };
}

// Fullscreen toggle for the visual column
function togglePdFullscreen() {
  pdFullscreen = !pdFullscreen;
  const vc  = document.getElementById('pdVisualCol');
  const tc  = document.getElementById('pdTextCol');
  const cc  = document.getElementById('pdCommentsCol');
  const h1  = document.getElementById('pdHandle1');
  const h2  = document.getElementById('pdHandle2');
  const fsb = document.getElementById('pdVisualFullscreenBtn');

  if (pdFullscreen) {
    tc.style.display  = 'none';
    cc.style.display  = 'none';
    h1.style.display  = 'none';
    h2.style.display  = 'none';
    vc.style.flex     = '0 0 100%';
    if (fsb) fsb.textContent = '⤡';
  } else {
    tc.style.display  = '';
    cc.style.display = '';
    h1.style.display = '';
    h2.style.display = '';
    vc.style.flex = '';
    pdCommentsCollapsed = false;
    if (fsb) fsb.textContent = '⛶';
    applyPdLayout(_pdHasVisual, _pdHasText);
  }
}

// Build the visual carousel inside the visual column
function buildPdVisualCarousel(visuals, inner, prevBtn, nextBtn, counterEl) {
  if (!visuals || visuals.length === 0) return null;
  let idx = 0;

  function render() {
    const f = visuals[idx];
    const hasMultiple = visuals.length > 1;
    pdVisualZoom = 1;
    pdVisualPanX = 0;
    pdVisualPanY = 0;

    if (prevBtn) {
      prevBtn.style.visibility = hasMultiple ? 'visible' : 'hidden';
    }
    if (nextBtn) {
      nextBtn.style.visibility = hasMultiple ? 'visible' : 'hidden';
    }
    if (counterEl) {
      counterEl.textContent = hasMultiple ? `${idx + 1} / ${visuals.length}` : '';
    }

    if (f.type === 'youtube') {
      inner.innerHTML = createYouTubePosterShellMarkup(
        f.url,
        'pd-youtube-shell',
        'pd-youtube-activate',
        'pd-youtube-activate-icon'
      );
      const activateBtn = inner.querySelector('.pd-youtube-activate');
      activateBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const shell = inner.querySelector('.pd-youtube-shell');
        activateYouTubeEmbed(shell, 'pd-visual-youtube');
      });
    } else if (f.type === 'pdf') {
      renderPdPdfViewer(f, inner);
    } else if (f.type === 'image') {
      inner.innerHTML = `<img class="pd-visual-img" src="${f.url}" alt="" loading="lazy" decoding="async">`;
      applyPdVisualZoom(inner);
    } else {
      inner.innerHTML = `<video class="pd-visual-video" src="${f.url}" controls></video>`;
      if (shouldHardFreezeMotion()) {
        const visualVideo = inner.querySelector('.pd-visual-video');
        visualVideo?.pause();
      }
    }
  }

  render();

  if (prevBtn) {
    prevBtn.onclick = () => { idx = (idx - 1 + visuals.length) % visuals.length; render(); };
  }
  if (nextBtn) {
    nextBtn.onclick = () => { idx = (idx + 1) % visuals.length; render(); };
  }

  return {
    prev() {
      if (visuals.length <= 1) return;
      idx = (idx - 1 + visuals.length) % visuals.length;
      render();
    },
    next() {
      if (visuals.length <= 1) return;
      idx = (idx + 1) % visuals.length;
      render();
    },
    hasMultiple() {
      return visuals.length > 1;
    },
    goTo(match) {
      let nextIndex = -1;
      if (typeof match === 'number') {
        nextIndex = match;
      } else if (typeof match === 'function') {
        nextIndex = visuals.findIndex(match);
      }
      if (nextIndex < 0 || nextIndex >= visuals.length) return;
      idx = nextIndex;
      render();
    },
    getCurrent() {
      return visuals[idx] || null;
    }
  };
}

// Drag-to-resize detail modal columns
function initPdResize() {
  const body = document.getElementById('pdBody');
  const h1   = document.getElementById('pdHandle1');
  const h2   = document.getElementById('pdHandle2');
  let dragging = null;

  h1.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = { handle: 'h1', startX: e.clientX, start: { ...pdColWidths } };
  });
  h2.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = { handle: 'h2', startX: e.clientX, start: { ...pdColWidths } };
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const totalW = body.getBoundingClientRect().width;
    if (!totalW) return;
    const dxPct = ((e.clientX - dragging.startX) / totalW) * 100;

    if (dragging.handle === 'h1') {
      const newV = Math.max(15, Math.min(75, dragging.start.visual + dxPct));
      const newT = Math.max(10, dragging.start.visual + dragging.start.text - newV);
      pdColWidths.visual = newV;
      pdColWidths.text   = newT;
    } else {
      const leftKey = _pdHasText ? 'text' : 'visual';
      const newL = Math.max(15, Math.min(85, dragging.start[leftKey] + dxPct));
      const newC = Math.max(10, dragging.start[leftKey] + dragging.start.comments - newL);
      pdColWidths[leftKey]  = newL;
      pdColWidths.comments  = newC;
    }
    applyPdColWidths();
  });

  document.addEventListener('mouseup', () => { dragging = null; });
}

async function openPostDetailModal(post, user) {
  if (editMode) return;

  if (pdModalInteractionCleanup) {
    pdModalInteractionCleanup();
    pdModalInteractionCleanup = null;
  }
  if (pdAttachmentCleanup) {
    pdAttachmentCleanup();
    pdAttachmentCleanup = null;
  }

  activePostForModal = post;

  // ── User block ──
  const pfpSrc = resolvePfpUrl(user);
  const pdPfpEl = document.getElementById('pdPfp');
  pdPfpEl.loading = 'lazy';
  pdPfpEl.decoding = 'async';
  pdPfpEl.dataset.avatar = '1';
  pdPfpEl.src = pfpSrc;
  applyImageRuntimeDefaults(pdPfpEl);
  pdPfpEl.onclick = user?.id ? () => openProfileModal(user.id) : null;
  pdPfpEl.style.cursor = user?.id ? 'pointer' : '';
  document.getElementById('pdUsername').textContent = user?.username || '';

  // ── Date ──
  const dateEl = document.getElementById('pdDate');
  dateEl.textContent = post.created_at
    ? new Date(post.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  // ── Title + Category ──
  document.getElementById('pdTitle').innerHTML = renderPostTitleMarkup(post.title, { clickableMentions: true });
  let categoryEl = document.getElementById('pdCategory');
  if (!categoryEl) {
    categoryEl = document.createElement('div');
    categoryEl.id        = 'pdCategory';
    categoryEl.className = 'pd-category';
    document.getElementById('pdTitle').insertAdjacentElement('afterend', categoryEl);
  }
  categoryEl.textContent  = post.category || '';
  categoryEl.style.display = post.category ? '' : 'none';

  // ── Classify files ──
  const extFromName = getFileExtension(post.file_name || '');
  const extFromUrl = getFileExtension(post.file_url || '');
  const ext = extFromName || extFromUrl;
  const isImage = post.file_type === 'image'  || isImageExtension(ext);
  const isAudio = post.file_type === 'audio'  || isAudioExtension(ext);
  const isVideo = (post.file_type === 'video' || isVideoExtension(ext)) && !isAudio;
  const isMulti = !!(post.files && post.files.length > 1);
  const hasCover = !!post.cover_image_url;

  let visualFiles = []; // { url, name, type:'image'|'video'|'youtube'|'pdf' }
  let attachments = []; // { url, name, kind:'audio'|'file'|'pdf'|'visual', visualType?:'image'|'video' }

  function pushAttachment(file, kind, extra = {}) {
    attachments.push({
      url: file.url,
      name: file.name || (kind === 'audio' ? 'audio' : 'file'),
      kind,
      ...extra
    });
  }

  if (isMulti) {
    (post.files || []).forEach(f => {
      const attachmentType = String(f?.type || '').toLowerCase();
      const extFromAttachmentName = getFileExtension(f?.name || '');
      const extFromAttachmentUrl = getFileExtension(f?.url || '');
      const attachmentExt = extFromAttachmentName || extFromAttachmentUrl;
      const isImageFile = attachmentType === 'image'
        || attachmentType.startsWith('image/')
        || isImageExtension(attachmentType)
        || isImageExtension(attachmentExt);
      const isAudioFile = attachmentType === 'audio' || attachmentType.startsWith('audio/') || isAudioExtension(attachmentExt);
      const isVideoFile = !isAudioFile && (
        attachmentType === 'video'
        || attachmentType.startsWith('video/')
        || isVideoExtension(attachmentType)
        || isVideoExtension(attachmentExt)
      );

      if (isImageFile) {
        visualFiles.push({ url: f.url, name: f.name || f.url, type: 'image' });
        pushAttachment({ url: f.url, name: f.name || f.url }, 'visual', { visualType: 'image' });
      }
      else if (isVideoFile) {
        visualFiles.push({ url: f.url, name: f.name || f.url, type: 'video' });
        pushAttachment({ url: f.url, name: f.name || f.url }, 'visual', { visualType: 'video' });
      }
      else if (isAudioFile) {
        pushAttachment({ url: f.url, name: f.name || f.url }, 'audio');
      }
      else if (isPdfExtension(attachmentExt)) {
        visualFiles.push({ url: f.url, name: f.name, type: 'pdf' });
        pushAttachment({ url: f.url, name: f.name }, 'pdf');
      }
      else {
        pushAttachment({ url: f.url, name: f.name || f.url }, 'file');
      }
    });
  } else if (post.file_url) {
    if (isImage) {
      visualFiles.push({ url: post.file_url, name: post.file_name, type: 'image' });
      pushAttachment({ url: post.file_url, name: post.file_name || 'image' }, 'visual', { visualType: 'image' });
    }
    else if (isVideo) {
      visualFiles.push({ url: post.file_url, name: post.file_name, type: 'video' });
      pushAttachment({ url: post.file_url, name: post.file_name || 'video' }, 'visual', { visualType: 'video' });
    }
    else if (isAudio) pushAttachment({ url: post.file_url, name: post.file_name || 'audio' }, 'audio');
    else if (isPdfExtension(ext)) {
      visualFiles.push({ url: post.file_url, name: post.file_name || 'pdf', type: 'pdf' });
      pushAttachment({ url: post.file_url, name: post.file_name || 'pdf' }, 'pdf');
    }
    else              pushAttachment({ url: post.file_url, name: post.file_name || 'file' }, 'file');
  }

  // Cover counts as visual if no real visual files
  const coverAsVisual = hasCover && visualFiles.length === 0 && !extractYouTubeId(post.youtube_url || '');
  if (coverAsVisual) {
    visualFiles.push({ url: post.cover_image_url, name: 'cover', type: 'image' });
  }

  // YouTube
  const ytId = extractYouTubeId(post.youtube_url || '');
  if (ytId) {
    visualFiles.unshift({ url: ytId, name: 'youtube', type: 'youtube' });
  }

  const hasVisual = visualFiles.length > 0;
  const hasText   = hasRenderableBodyMarkup(post.body) || !!getPostExternalUrl(post.youtube_url || '');

  // ── Visual column ──
  const visualInner = document.getElementById('pdVisualInner');
  visualInner.innerHTML = '';
  if (hasVisual) {
    pdVisualNavController = buildPdVisualCarousel(
      visualFiles,
      visualInner,
      document.getElementById('pdVisPrev'),
      document.getElementById('pdVisNext'),
      document.getElementById('pdVisualCounter')
    );
  } else {
    pdVisualNavController = null;
  }

  // ── Text column ──
  const contentCol = document.getElementById('postDetailContent');
  contentCol.innerHTML = '';

  const fileTabRow = document.getElementById('pdFileTabRow');
  const audioDock = document.getElementById('pdAudioDock');
  fileTabRow.innerHTML = '';
  audioDock.innerHTML = '';
  fileTabRow.style.display = 'none';
  audioDock.style.display = 'none';

  const audioFiles = attachments.filter((attachment) => attachment.kind === 'audio');
  let audioController = null;

  if (audioFiles.length > 0) {
    audioController = createPdAudioPlayer(audioFiles);
    if (audioController) {
      audioDock.appendChild(audioController.element);
      audioDock.style.display = '';
    }
  }

  if (attachments.length > 0) {
    const attachmentTabBar = createPdAttachmentTabBar(attachments, {
      visualController: pdVisualNavController,
      audioController
    });
    if (attachmentTabBar) {
      fileTabRow.appendChild(attachmentTabBar);
      fileTabRow.style.display = '';
    }
  }

  const menuFiles = [];
  const seenMenuFiles = new Set();
  const pushMenuFile = (url, name) => {
    if (!url || seenMenuFiles.has(url)) return;
    seenMenuFiles.add(url);
    menuFiles.push({ url, name: name || 'file' });
  };

  visualFiles.forEach((f) => {
    if (f.type === 'youtube') return;
    pushMenuFile(f.url, f.name || 'file');
  });
  attachments.forEach((f) => {
    pushMenuFile(f.url, f.name || 'file');
  });

  fileTabRow.oncontextmenu = (e) => {
    const btn = e.target.closest('.pd-file-tab[data-file-url]');
    if (!btn) return;
    e.preventDefault();
    showPdFileContextMenu(e.clientX, e.clientY, {
      url: btn.dataset.fileUrl,
      name: btn.dataset.fileName || 'file'
    }, menuFiles);
  };

  if (visualInner) {
    visualInner.oncontextmenu = (e) => {
      const current = pdVisualNavController?.getCurrent?.();
      if (!current || current.type === 'youtube' || !current.url) return;
      e.preventDefault();
      showPdFileContextMenu(e.clientX, e.clientY, {
        url: current.url,
        name: current.name || 'file'
      }, menuFiles);
    };
  }

  pdAttachmentCleanup = () => {
    if (fileTabRow) {
      fileTabRow.innerHTML = '';
      fileTabRow.style.display = 'none';
    }
    if (audioDock) {
      audioDock.innerHTML = '';
      audioDock.style.display = 'none';
    }
    audioController?.cleanup();
  };

  // Body text
  const bodyMarkup = renderPostBodyMarkup(post.body, {
    externalUrl: post.youtube_url,
    clickableExternalUrl: true
  });
  if (bodyMarkup) {
    const bodyWrap = document.createElement('div');
    bodyWrap.innerHTML = bodyMarkup;
    [...bodyWrap.children].forEach((child) => {
      child.classList.add('post-body-formatted');
      contentCol.appendChild(child);
    });
  }

  // ── Apply layout ──
  setPdCommentsCollapsed(false);
  applyPdLayout(hasVisual, hasText);

  pdModalInteractionCleanup = initPostDetailInteractions();

  postDetailOverlay.style.display = 'flex';
  loadCommentsForPost(post.id);
  loadConnectedTabs(post);
  scheduleUiStatePersist();
}

async function loadConnectedTabs(post) {
  const tabContainer = document.getElementById('pdThreadTabs');
  const threadBar = document.getElementById('pdThreadBar');
  tabContainer.innerHTML = '';

  // Current post tab (active / non-navigating)
  const currentLabel = getPostPreviewLabel(post, { maxLength: 60, fallback: 'untitled' });
  const currentTab = document.createElement('span');
  currentTab.className = 'pd-thread-tab active';
  currentTab.textContent = currentLabel;
  currentTab.title = currentLabel;
  tabContainer.appendChild(currentTab);

  const { data: links, error } = await supabase
    .from('post_links')
    .select('a_post_id, b_post_id')
    .or(`a_post_id.eq.${post.id},b_post_id.eq.${post.id}`)
    .eq('group_id', 'group0');

  if (error || !links || links.length === 0) {
    if (threadBar) threadBar.style.display = 'none';
    return;
  }

  const connectedIds = links.map(l =>
    String(l.a_post_id) === String(post.id) ? l.b_post_id : l.a_post_id
  );

  const { data: connectedPosts, error: postsErr } = await supabase
    .from('posts')
    .select('id, title, body, file_name, user_id')
    .in('id', connectedIds);

  if (postsErr || !connectedPosts || connectedPosts.length === 0) {
    if (threadBar) threadBar.style.display = 'none';
    return;
  }

  if (threadBar) threadBar.style.display = '';

  connectedPosts.forEach(cp => {
    const label = getPostPreviewLabel(cp, { maxLength: 60, fallback: 'untitled' });
    const tab = document.createElement('button');
    tab.className   = 'pd-thread-tab';
    tab.textContent = label;
    tab.title       = label;

    tab.addEventListener('click', async () => {
      const fullPost = await getPostRecordById(cp.id, { fallbackPost: cp });
      const userMap = await getUsersMapByIds([cp.user_id]);
      const fullUser = userMap[String(cp.user_id)] || null;
      if (fullPost) openPostDetailModal(fullPost, fullUser || {});
    });

    tabContainer.appendChild(tab);
  });
}

function closePostDetailModal() {
  pdPdfRenderToken += 1;
  postDetailOverlay.style.display = 'none';
  hidePdFileContextMenu();
  document.getElementById('postDetailContent').innerHTML = '';
  commentsList.innerHTML  = '';
  commentInput.value      = '';
  activePostForModal      = null;
  pdVisualNavController   = null;
  pdVisualZoom            = 1;
  pdVisualPanX            = 0;
  pdVisualPanY            = 0;
  pdHoveredRegion         = null;
  if (pdModalInteractionCleanup) {
    pdModalInteractionCleanup();
    pdModalInteractionCleanup = null;
  }
  if (pdAttachmentCleanup) {
    pdAttachmentCleanup();
    pdAttachmentCleanup = null;
  }
  const fileTabRow = document.getElementById('pdFileTabRow');
  const visualInner = document.getElementById('pdVisualInner');
  if (fileTabRow) fileTabRow.oncontextmenu = null;
  if (visualInner) visualInner.oncontextmenu = null;
  pdCommentsCollapsed = false;
  pdFullscreen            = false;
  scheduleUiStatePersist();
}

// ============================================
// 11. POST EDITING FLOW
// ============================================

function toggleEditMode() {
  editMode = !editMode;
  clearEditSelection();
  stopBulkPlacement();
  stopPlacement();
  activeUserFilter = null;
  activeCategoryFilter = null;
  if (editMode) {
    closeNotificationsPanel();
    closePostDetailModal();
    closeProfileModal();
  }
  mainPageContainer.classList.toggle('edit-mode', editMode);
  document.getElementById('editModeBtn')?.classList.toggle('active', editMode);
  if (!editMode) closePostForm();
  applyAnimationMode(animationMode, { persist: false });
  worldsFeature?.refreshActiveWorldChrome?.();
  loadPosts();
  scheduleUiStatePersist();
}

function openEditForm(post) {
  editingPostId = post.id;
  editingPost   = post; // preserve full row so we can keep untouched file fields
  postFileInput.multiple = true;
  postTitle.value = post.title || '';
  setPostTextBody(post.body || '');
  setCategoryValue(post.category || '');

  // Show what file(s) are currently attached
  if (post.files && post.files.length > 1) {
    postFileName.textContent = `${post.files.length} files attached`;
  } else {
    postFileName.textContent = post.file_name || 'replace file';
  }

  postDeleteBtn.style.display = 'inline-block'; // show in edit mode
  postYoutubeInput.value = formatStoredPostLinkForInput(post.youtube_url);

  const hasNonVisualFile = post.file_url && post.file_type !== 'image' && post.file_type !== 'video';
if (hasNonVisualFile || post.cover_image_url) {
  postCoverImageLabel.style.display = 'block';
  postCoverFileName.textContent = post.cover_image_url
    ? decodeURIComponent(post.cover_image_url.split('/').pop().replace(/^\d+-/, ''))
    : 'choose cover image';
}
  openPostForm();

}

async function handleDeletePost(postId) {
  return handleDeletePosts([postId]);
}

async function handleDeletePosts(postIds = []) {
  try {
    const ids = [...new Set((postIds || []).map((id) => String(id)).filter(Boolean))];
    if (ids.length === 0) return;

    const isBulk = ids.length > 1;
    const confirmMessage = isBulk
      ? `Are you sure you want to delete ${ids.length} posts?`
      : 'Are you sure you want to delete this post?';

    const confirmed = typeof window.__prettyConfirm === 'function'
      ? await window.__prettyConfirm({
          title: isBulk ? 'delete posts?' : 'delete post?',
          message: confirmMessage,
          confirmLabel: 'delete',
          cancelLabel: 'cancel',
          danger: true
        })
      : window.confirm(confirmMessage);
    if (!confirmed) return;

    applyOptimisticPostRemoval(ids);

    let deleteQuery = supabase
      .from('posts')
      .delete()
      .in('id', ids);

    if (!currentUserData?.is_admin) {
      deleteQuery = deleteQuery.eq('user_id', currentUser.id);
    }

    const { error } = await deleteQuery;

    if (error) throw error;

    ids.forEach((id) => selectedEditPostIds.delete(String(id)));
    if (activeThreadSourcePostId && ids.includes(String(activeThreadSourcePostId))) {
      activeThreadSourcePostId = null;
    }

    console.log(isBulk ? 'Posts deleted:' : 'Post deleted:', isBulk ? ids : ids[0]);
    void refreshFeedAfterMutation();
  } catch (error) {
    console.error('Delete failed:', error.message);
    void refreshFeedAfterMutation();
    alert(`Delete failed: ${error.message}`);
  }
}

// ============================================
// 12. CATEGORY MANAGEMENT
// ============================================

async function loadCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('group_id', 'group0')
    .order('name', { ascending: true });

  if (error) {
    console.error('Failed to load categories:', error);
    return;
  }

  categoryRecords = data || [];
  categoryColorColumn = inferCategoryColorColumn(categoryRecords);

  // Rebuild custom dropdown
  if (postCategoryDropdown) {
    postCategoryDropdown.innerHTML = '';
    const noneItem = document.createElement('div');
    noneItem.className = 'post-form-category-option';
    noneItem.dataset.value = '';
    noneItem.textContent = 'none';
    noneItem.addEventListener('click', () => { setCategoryValue(''); closeCategorySelectDropdown(); });
    postCategoryDropdown.appendChild(noneItem);
    categoryRecords.forEach((cat) => {
      const item = document.createElement('div');
      item.className = 'post-form-category-option';
      item.dataset.value = cat.name;
      item.textContent = cat.name;
      item.addEventListener('click', () => { setCategoryValue(cat.name); closeCategorySelectDropdown(); });
      postCategoryDropdown.appendChild(item);
    });
  }

  renderCategoryEditor();
  worldsFeature?.syncCategories();
  console.log(`Loaded ${categoryRecords.length} categories`);
}

function renderCategoryEditor() {
  if (!postCategoryList) return;

  if (!categoryRecords.length) {
    postCategoryList.innerHTML = '<div class="post-form-category-empty">no categories yet</div>';
    return;
  }

  postCategoryList.innerHTML = categoryRecords.map((cat) => {
    const categoryName = String(cat.name || '');
    const encodedName = encodeURIComponent(categoryName);
    const isEditing = editingCategoryName === categoryName;
    const colorValue = getCategoryColorValue(cat) || getCategoryNetworkColor(categoryName, cat);
    const colorControl = `<button type="button" class="post-form-category-color-swatch" data-action="recolor" data-category-name="${encodedName}" aria-label="set category color" style="background:${escapeHtml(colorValue)};"></button>`;

    if (isEditing) {
      return `
        <div class="post-form-category-item" data-category-name="${encodedName}">
          ${colorControl}
          <input type="text" class="post-form-category-edit-input" value="${escapeHtml(categoryName)}" data-category-edit-input="${encodedName}">
          <div class="post-form-category-actions">
            <button type="button" class="post-form-category-action delete" data-action="delete" data-category-name="${encodedName}">x</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="post-form-category-item" data-category-name="${encodedName}">
        ${colorControl}
        <span class="post-form-category-name">${escapeHtml(categoryName)}</span>
        <div class="post-form-category-actions">
          <button type="button" class="post-form-category-action delete" data-action="delete" data-category-name="${encodedName}">x</button>
        </div>
      </div>
    `;
  }).join('');

  if (editingCategoryName) {
    const input = postCategoryList.querySelector('.post-form-category-edit-input');
    input?.focus();
    const cursorPos = input?.value?.length || 0;
    input?.setSelectionRange(cursorPos, cursorPos);
  }
}

async function handleAddCategory() {
  const name = postCategoryInput.value.trim();
  if (!name) return;

  const normalizedName = name.toLowerCase();
  if (categoryRecords.some((cat) => String(cat.name || '').trim().toLowerCase() === normalizedName)) {
    alert('That category already exists.');
    return;
  }

  try {
    const { error } = await supabase
      .from('categories')
      .insert([{ name: name, group_id: 'group0' }]);

    if (error) throw error;

    console.log('Category added:', name);
    await loadCategories();
    setCategoryValue(name);
    postCategoryInput.value = '';
  } catch (error) {
    alert(`Failed to add category: ${error.message}`);
  }
}

async function handleRenameCategory(oldName, nextName) {
  const trimmedOldName = String(oldName || '').trim();
  const trimmedNextName = String(nextName || '').trim();
  if (!trimmedOldName) return;

  if (!trimmedNextName) {
    alert('Enter a category name.');
    return;
  }

  if (
    trimmedNextName.toLowerCase() !== trimmedOldName.toLowerCase()
    && categoryRecords.some((cat) => String(cat.name || '').trim().toLowerCase() === trimmedNextName.toLowerCase())
  ) {
    alert('That category already exists.');
    return;
  }

  try {
    const { error: categoryError } = await supabase
      .from('categories')
      .update({ name: trimmedNextName })
      .eq('group_id', 'group0')
      .eq('name', trimmedOldName);

    if (categoryError) throw categoryError;

    const { error: postError } = await supabase
      .from('posts')
      .update({ category: trimmedNextName })
      .eq('group_id', 'group0')
      .eq('category', trimmedOldName);

    if (postError) throw postError;

    const { error: worldsError } = await supabase
      .from('worlds')
      .update({ category: trimmedNextName })
      .eq('category', trimmedOldName);

    if (worldsError) throw worldsError;

    if (postCategory.value === trimmedOldName) {
      setCategoryValue(trimmedNextName);
    }

    if (editingPost?.category === trimmedOldName) {
      editingPost = { ...editingPost, category: trimmedNextName };
    }

    editingCategoryName = null;
    await loadCategories();
    worldsFeature?.syncCategories();
    setCategoryValue(trimmedNextName);
    await loadPosts();
    await loadLinks();
    renderLinks(lastLoadedPosts, lastLoadedLinks);
  } catch (error) {
    alert(`Failed to rename category: ${error.message}`);
  }
}

async function handleDeleteCategory(name) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) return;

  const deleteMessage = `Delete "${trimmedName}"? Posts using it will be reset to no category.`;
  const confirmed = typeof window.__prettyConfirm === 'function'
    ? await window.__prettyConfirm({
        title: 'delete category?',
        message: deleteMessage,
        confirmLabel: 'delete',
        cancelLabel: 'keep',
        danger: true
      })
    : window.confirm(deleteMessage);

  if (!confirmed) return;

  try {
    const { error: postError } = await supabase
      .from('posts')
      .update({ category: null })
      .eq('group_id', 'group0')
      .eq('category', trimmedName);

    if (postError) throw postError;

    const { error: worldsError } = await supabase
      .from('worlds')
      .delete()
      .eq('category', trimmedName);

    if (worldsError) throw worldsError;

    const { error: categoryError } = await supabase
      .from('categories')
      .delete()
      .eq('group_id', 'group0')
      .eq('name', trimmedName);

    if (categoryError) throw categoryError;

    if (postCategory.value === trimmedName) {
      setCategoryValue('');
    }

    if (editingPost?.category === trimmedName) {
      editingPost = { ...editingPost, category: null };
    }

    editingCategoryName = null;
    await loadCategories();
    worldsFeature?.syncCategories();
    await loadPosts();
    await loadLinks();
    renderLinks(lastLoadedPosts, lastLoadedLinks);
  } catch (error) {
    alert(`Failed to delete category: ${error.message}`);
  }
}

async function handleUpdateCategoryColor(categoryName, nextColor) {
  const trimmedName = String(categoryName || '').trim();
  const normalizedColor = toHexColor(nextColor);
  if (!trimmedName || !normalizedColor) return false;

  try {
    await updateCategoryColorInDb(trimmedName, normalizedColor);

    categoryRecords = categoryRecords.map((record) => {
      if (String(record?.name || '').trim() !== trimmedName) return record;
      const updated = { ...record };
      if (categoryColorColumn) {
        updated[categoryColorColumn] = normalizedColor;
      }
      return updated;
    });

    renderCategoryEditor();
    scheduleCategoryNetworkRender(lastLoadedPosts, { force: true });
    return true;
  } catch (error) {
    alert(`Failed to update category color: ${error.message}`);
    return false;
  }
}

// ============================================
// 13. POST LINK DATA + SVG RENDERING
// ============================================

async function loadLinks() {
  const scopedPostIds = Array.from(
    new Set((lastLoadedPosts || []).map((post) => String(post?.id || '').trim()).filter(Boolean))
  );

  const fetchAllLinks = async () => {
    const { data, error } = await supabase
      .from('post_links')
      .select('id, a_post_id, b_post_id')
      .eq('group_id', 'group0');

    if (error) throw error;
    return data || [];
  };

  const fetchScopedLinks = async (ids) => {
    const uniqueById = new Map();

    for (let i = 0; i < ids.length; i += LINK_SCOPE_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + LINK_SCOPE_CHUNK_SIZE);
      const inList = chunk
        .map((id) => `"${String(id).replace(/"/g, '')}"`)
        .join(',');

      const { data, error } = await supabase
        .from('post_links')
        .select('id, a_post_id, b_post_id')
        .eq('group_id', 'group0')
        .or(`a_post_id.in.(${inList}),b_post_id.in.(${inList})`);

      if (error) throw error;

      for (const link of data || []) {
        uniqueById.set(String(link.id), link);
      }
    }

    return Array.from(uniqueById.values());
  };

  try {
    // Use visible post IDs to avoid scanning unrelated links across all worlds.
    if (scopedPostIds.length > 0) {
      lastLoadedLinks = await fetchScopedLinks(scopedPostIds);
    } else {
      lastLoadedLinks = await fetchAllLinks();
    }
    return lastLoadedLinks;
  } catch (error) {
    console.error('Failed to load links:', error);
    lastLoadedLinks = [];
    return [];
  }
}

function orthogonalPathD(x1, y1, x2, y2) {
  // Option A: horizontal then vertical
  const d1 = `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2}`;
  const len1 = Math.abs(x2 - x1) + Math.abs(y2 - y1);

  // Option B: vertical then horizontal
  const d2 = `M ${x1} ${y1} L ${x1} ${y2} L ${x2} ${y2}`;
  const len2 = Math.abs(x2 - x1) + Math.abs(y2 - y1);

  // lengths are the same in this simple case, but we’ll keep structure
  // in case you later add margins/avoidance.
  return (len2 < len1) ? d2 : d1;
}

function getCategoryNetworkColor(categoryName, categoryRecord = null) {
  const explicitColor = getCategoryColorValue(categoryRecord);
  if (explicitColor) return explicitColor;

  const key = String(categoryName || '').trim().toLowerCase();
  let hash = 0;

  for (let i = 0; i < key.length; i += 1) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash |= 0;
  }

  const idx = Math.abs(hash) % CATEGORY_NETWORK_PASTELS.length;
  return CATEGORY_NETWORK_PASTELS[idx];
}

function scheduleCategoryNetworkRender(posts, options = {}) {
  const { force = false } = options;
  pendingCategoryNetworkPosts = posts || [];

  if (!force && (isPlacing || isBulkPlacing || resizingPostState)) return;
  if (categoryNetworkRafId) return;

  categoryNetworkRafId = window.requestAnimationFrame(() => {
    categoryNetworkRafId = 0;
    renderCategoryNetworks(pendingCategoryNetworkPosts || []);
  });
}

function renderCategoryNetworks(posts) {
  if (!categoryLayer || !postCanvas) return;
  categoryLayer.innerHTML = '';

  const visiblePosts = (posts || []).filter(p => String(p.category || '').trim());
  if (visiblePosts.length < 2) return;

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  categoryLayer.appendChild(defs);
  const cullViewportRect = getViewportScreenRect(VIEWPORT_LINK_CULL_MARGIN_PX);

  const glowFilter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  glowFilter.setAttribute('id', 'category-thread-glow');
  glowFilter.setAttribute('x', '-20%');
  glowFilter.setAttribute('y', '-20%');
  glowFilter.setAttribute('width', '140%');
  glowFilter.setAttribute('height', '140%');

  const glow = document.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow');
  glow.setAttribute('dx', '0');
  glow.setAttribute('dy', '0');
  glow.setAttribute('stdDeviation', '1.15');
  glow.setAttribute('flood-color', 'rgba(255, 255, 255, 0.95)');
  glow.setAttribute('flood-opacity', '0.62');
  glowFilter.appendChild(glow);
  defs.appendChild(glowFilter);

  const svgRect = categoryLayer.getBoundingClientRect();
  const groups = new Map();
  const categoryByKey = new Map(
    (categoryRecords || []).map((record) => [
      String(record?.name || '').trim().toLowerCase(),
      record
    ])
  );

  for (const post of visiblePosts) {
    const categoryKey = String(post.category || '').trim().toLowerCase();
    if (!groups.has(categoryKey)) {
      const categoryRecord = categoryByKey.get(categoryKey) || null;
      groups.set(categoryKey, {
        label: String(post.category || '').trim(),
        record: categoryRecord,
        posts: []
      });
    }
    groups.get(categoryKey).posts.push(post);
  }

  for (const group of groups.values()) {
    if (!group.posts || group.posts.length < 2) continue;

    const points = [];
    for (const post of group.posts) {
      const cardEl = postCanvas.querySelector(`.post-card[data-post-id="${post.id}"]`);
      if (!cardEl) continue;

      const rect = cardEl.getBoundingClientRect();
      if (!rectIntersects(rect, cullViewportRect)) continue;

      points.push({
        x: ((rect.left + rect.right) / 2) - svgRect.left,
        y: ((rect.top + rect.bottom) / 2) - svgRect.top
      });
    }

    if (points.length < 2) continue;

    const strokeColor = getCategoryNetworkColor(group.label, group.record);
    const safeLabel = group.label.toLowerCase().replace(/[^a-z0-9_-]/g, '-');

    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i];
        const b = points[j];

        const gradId = `category-thread-grad-${safeLabel}-${i}-${j}`;
        const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        grad.setAttribute('id', gradId);
        grad.setAttribute('gradientUnits', 'userSpaceOnUse');
        grad.setAttribute('x1', a.x);
        grad.setAttribute('y1', a.y);
        grad.setAttribute('x2', b.x);
        grad.setAttribute('y2', b.y);

        const stopStart = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stopStart.setAttribute('offset', '0%');
        stopStart.setAttribute('stop-color', strokeColor);
        stopStart.setAttribute('stop-opacity', '0.0');

        const stopRise = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stopRise.setAttribute('offset', '18%');
        stopRise.setAttribute('stop-color', strokeColor);
        stopRise.setAttribute('stop-opacity', '0.4');

        const stopMid = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stopMid.setAttribute('offset', '50%');
        stopMid.setAttribute('stop-color', strokeColor);
        stopMid.setAttribute('stop-opacity', '1');

        const stopFall = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stopFall.setAttribute('offset', '82%');
        stopFall.setAttribute('stop-color', strokeColor);
        stopFall.setAttribute('stop-opacity', '0.4');

        const stopEnd = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stopEnd.setAttribute('offset', '100%');
        stopEnd.setAttribute('stop-color', strokeColor);
        stopEnd.setAttribute('stop-opacity', '0.0');

        grad.appendChild(stopStart);
        grad.appendChild(stopRise);
        grad.appendChild(stopMid);
        grad.appendChild(stopFall);
        grad.appendChild(stopEnd);
        defs.appendChild(grad);

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${a.x} ${a.y} L ${b.x} ${b.y}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', `url(#${gradId})`);
        path.setAttribute('stroke-width', '1.95');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('filter', 'url(#category-thread-glow)');
        path.style.pointerEvents = 'none';
        categoryLayer.appendChild(path);
      }
    }
  }
}

function renderLinks(posts, links) {
  if (!linkLayer || !postCanvas) return;
  scheduleCategoryNetworkRender(posts);
  linkLayer.innerHTML = '';
  const cullViewportRect = getViewportScreenRect(VIEWPORT_LINK_CULL_MARGIN_PX);

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  linkLayer.appendChild(defs);

  const postGlowFilter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  postGlowFilter.setAttribute('id', 'post-thread-glow');
  postGlowFilter.setAttribute('x', '-20%');
  postGlowFilter.setAttribute('y', '-20%');
  postGlowFilter.setAttribute('width', '140%');
  postGlowFilter.setAttribute('height', '140%');

  const postGlow = document.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow');
  postGlow.setAttribute('dx', '0');
  postGlow.setAttribute('dy', '0');
  postGlow.setAttribute('stdDeviation', '1.15');
  postGlow.setAttribute('flood-color', 'rgba(255, 255, 255, 0.95)');
  postGlow.setAttribute('flood-opacity', '0.62');
  postGlowFilter.appendChild(postGlow);
  defs.appendChild(postGlowFilter);

  const postsById = new Map((posts || []).map(p => [String(p.id), p]));
  const allowedIds = new Set((posts || []).map(p => String(p.id)));
  const svgRect = linkLayer.getBoundingClientRect();

  function clampToEdge(rect, viewportRect, px, py) {
    const l = rect.left - viewportRect.left;
    const r = rect.right - viewportRect.left;
    const t = rect.top - viewportRect.top;
    const b = rect.bottom - viewportRect.top;

    const cx = Math.max(l, Math.min(r, px));
    const cy = Math.max(t, Math.min(b, py));

    const dLeft = Math.abs(cx - l);
    const dRight = Math.abs(cx - r);
    const dTop = Math.abs(cy - t);
    const dBottom = Math.abs(cy - b);
    const minD = Math.min(dLeft, dRight, dTop, dBottom);

    if (minD === dLeft) return { x: l, y: cy };
    if (minD === dRight) return { x: r, y: cy };
    if (minD === dTop) return { x: cx, y: t };
    return { x: cx, y: b };
  }

  for (const link of (links || [])) {
    const aId = String(link.a_post_id);
    const bId = String(link.b_post_id);

    if (!allowedIds.has(aId) || !allowedIds.has(bId)) continue;

    const a = postsById.get(aId);
    const b = postsById.get(bId);
    if (!a || !b) continue;

    const aEl = postCanvas.querySelector(`.post-card[data-post-id="${a.id}"]`);
    const bEl = postCanvas.querySelector(`.post-card[data-post-id="${b.id}"]`);
    if (!aEl || !bEl) continue;

    const aRect = aEl.getBoundingClientRect();
    const bRect = bEl.getBoundingClientRect();
    if (!rectIntersects(aRect, cullViewportRect) && !rectIntersects(bRect, cullViewportRect)) {
      continue;
    }

    const aCx = (aRect.left + aRect.right) / 2 - svgRect.left;
    const aCy = (aRect.top + aRect.bottom) / 2 - svgRect.top;
    const bCx = (bRect.left + bRect.right) / 2 - svgRect.left;
    const bCy = (bRect.top + bRect.bottom) / 2 - svgRect.top;

    const p1 = clampToEdge(aRect, svgRect, bCx, bCy);
    const p2 = clampToEdge(bRect, svgRect, aCx, aCy);

    const d = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.classList.add('link-hit');
    hit.setAttribute('d', d);
    hit.setAttribute('fill', 'none');
    hit.setAttribute('stroke', 'rgba(0,0,0,0)');
    hit.setAttribute('stroke-width', '14');
    hit.style.pointerEvents = 'stroke';
    hit.style.cursor = 'pointer';

    hit.addEventListener('click', (e) => {
      e.stopPropagation();

      if (activeLinkTreeRootPostId === aId || activeLinkTreeRootPostId === bId) {
        activeLinkTreeRootPostId = null;
      } else {
        activeUserFilter = null;
        activeCategoryFilter = null;
        activeLinkTreeRootPostId = aId;
      }

      loadPosts();
    });

    linkLayer.appendChild(hit);

    const gradId = `link-grad-${link.id || `${aId}-${bId}`}`;
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.setAttribute('id', gradId);
    grad.setAttribute('gradientUnits', 'userSpaceOnUse');
    grad.setAttribute('x1', p1.x);
    grad.setAttribute('y1', p1.y);
    grad.setAttribute('x2', p2.x);
    grad.setAttribute('y2', p2.y);

    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', 'rgba(0,0,0,0.78)');
    stop1.setAttribute('stop-opacity', '0.0');

    const stopMid = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stopMid.setAttribute('offset', '50%');
    stopMid.setAttribute('stop-color', 'rgba(0,0,0,0.78)');
    stopMid.setAttribute('stop-opacity', '1');

    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', 'rgba(0,0,0,0.78)');
    stop2.setAttribute('stop-opacity', '0.0');

    grad.appendChild(stop1);
    grad.appendChild(stopMid);
    grad.appendChild(stop2);
    defs.appendChild(grad);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', `url(#${gradId})`);
    path.setAttribute('stroke-width', '1.95');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-dasharray', '28 10 20 22 6 12 30 8 10 16');
    path.setAttribute('stroke-dashoffset', '0');
    path.setAttribute('filter', 'url(#post-thread-glow)');
    path.style.animation = shouldHardFreezeMotion() ? 'none' : 'link-flow 9s linear infinite';
    path.style.pointerEvents = 'none';
    linkLayer.appendChild(path);
  }
}

// ============================================
// 14. NOTIFICATIONS
// ============================================

const MAX_NOTIFICATIONS = 40;

async function filterValidThreadNotifications(notifications) {
  const threadNotifications = (notifications || []).filter((n) =>
    n?.type === 'thread' && n?.post_id && n?.actor_user_id
  );

  if (threadNotifications.length === 0 || !currentUser?.id) {
    return notifications || [];
  }

  const threadActorIds = [...new Set(threadNotifications.map((n) => n.actor_user_id))];
  const { data: candidateLinks, error: linksError } = await supabase
    .from('post_links')
    .select('a_post_id, b_post_id, created_by')
    .eq('group_id', 'group0')
    .in('created_by', threadActorIds);

  if (linksError) {
    console.error('Failed to validate thread notifications:', linksError);
    return notifications || [];
  }

  const relevantPostIds = new Set(threadNotifications.map((n) => String(n.post_id)));
  (candidateLinks || []).forEach((link) => {
    if (!link) return;
    relevantPostIds.add(String(link.a_post_id));
    relevantPostIds.add(String(link.b_post_id));
  });

  const { data: relatedPosts, error: postsError } = await supabase
    .from('posts')
    .select('id, user_id')
    .in('id', Array.from(relevantPostIds));

  if (postsError) {
    console.error('Failed to validate thread notification posts:', postsError);
    return notifications || [];
  }

  const postOwnerMap = {};
  (relatedPosts || []).forEach((post) => {
    postOwnerMap[String(post.id)] = String(post.user_id);
  });

  const isValidThreadNotification = (notification) => {
    const notifiedPostId = String(notification.post_id);
    const actorUserId = String(notification.actor_user_id);

    if (actorUserId === String(currentUser.id)) return false;
    if (postOwnerMap[notifiedPostId] !== String(currentUser.id)) return false;

    return (candidateLinks || []).some((link) => {
      if (String(link.created_by) !== actorUserId) return false;

      const aId = String(link.a_post_id);
      const bId = String(link.b_post_id);
      if (aId !== notifiedPostId && bId !== notifiedPostId) return false;

      const otherPostId = aId === notifiedPostId ? bId : aId;
      return postOwnerMap[otherPostId] === actorUserId;
    });
  };

  return (notifications || []).filter((notification) => {
    if (notification?.type !== 'thread') return true;
    return isValidThreadNotification(notification);
  });
}

async function loadNotifications(options = {}) {
  if (!currentUser) return;

  const {
    force = false,
    validateThreads = null
  } = options;

  const panelOpen = Boolean(notifPanel?.classList?.contains('open'));
  const shouldValidateThreads = validateThreads == null ? panelOpen : Boolean(validateThreads);

  const now = Date.now();
  if (!force && notificationsLoadPromise) {
    return notificationsLoadPromise;
  }
  if (!force && now < notificationsRetryAfter) {
    return;
  }
  if (!force && (now - notificationsLastRequestAt) < 1500) {
    return;
  }
  notificationsLastRequestAt = now;

  const runPromise = (async () => {

  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, post_id, actor_user_id, created_at')
    .eq('recipient_user_id', currentUser.id)
    .eq('group_id', 'group0')
    .order('created_at', { ascending: false })
    .limit(MAX_NOTIFICATIONS);

  if (error) {
    console.error('Failed to load notifications:', error);
    const message = String(error?.message || error || '');
    if (/aborted|abort/i.test(message)) {
      notificationsRetryAfter = Date.now() + 6000;
    } else {
      notificationsRetryAfter = Date.now() + 3000;
    }
    return;
  }

  notificationsRetryAfter = 0;

  if (!panelOpen) {
    return;
  }

  const baseNotifications = data || [];
  const filteredNotifications = shouldValidateThreads
    ? await filterValidThreadNotifications(baseNotifications)
    : baseNotifications;

  if (!filteredNotifications || filteredNotifications.length === 0) {
    notifList.innerHTML = `<div class="notif-empty">no notifications</div>`;
    return;
  }

  // Fetch actor usernames
  const actorIds = [...new Set(filteredNotifications.map(n => n.actor_user_id).filter(Boolean))];
  let actorMap = {};
  if (actorIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, username')
      .in('id', actorIds);
    (users || []).forEach(u => { actorMap[u.id] = u.username; });
  }

  notifList.innerHTML = '';

  filteredNotifications.forEach(n => {
    const actor = actorMap[n.actor_user_id] || 'someone';
    const text  = n.type === 'comment'
      ? 'commented on your post'
      : n.type === 'comment_mention'
        ? 'mentioned you in a comment'
        : n.type === 'post_mention'
          ? 'mentioned you in a post'
          : 'connected a thread to your post';
    const stamp = formatTimestamp(n.created_at);

    const item = document.createElement('div');
    item.className = 'notif-item';
    item.innerHTML = `
      <div class="notif-actor">${actor}</div>
      <div class="notif-text">${text}</div>
      <div class="notif-time">${stamp}</div>
    `;

    item.addEventListener('click', async () => {
      const post = await getPostRecordById(n.post_id);
      if (!post) return;

      const userMap = await getUsersMapByIds([post.user_id]);
      const userData = userMap[String(post.user_id)] || {};

      openPostDetailModal(post, userData || {});
    });

    notifList.appendChild(item);
  });
  })();

  notificationsLoadPromise = runPromise;
  try {
    return await runPromise;
  } finally {
    if (notificationsLoadPromise === runPromise) {
      notificationsLoadPromise = null;
    }
  }
}


// ============================================
// 15. PROFILE MODAL FLOW
// ============================================

async function openProfileModal(userId) {
  if (editMode) return;
  if (!userId) return;
  currentProfileUserId = userId;
  profileEditMode     = false;
  newProfileCoverFile = null;
  newProfilePfpFile   = null;

  const { data: user, error } = await supabase
    .from('users')
    .select('id, username, pfp, pfp_url, cover_image_url')
    .eq('id', userId)
    .single();
  if (error || !user) return;

  const isOwnProfile = currentUser && userId === currentUser.id;

  // ── Cover ──
  const coverImg         = document.getElementById('profileCoverImg');
  const coverPlaceholder = document.getElementById('profileCoverPlaceholder');
  const coverOverlay     = document.getElementById('profileCoverOverlay');

  if (user.cover_image_url) {
    coverImg.src           = user.cover_image_url;
    coverImg.style.display = 'block';
    coverPlaceholder.style.display = 'none';
  } else {
    coverImg.style.display         = 'none';
    coverPlaceholder.style.display = 'block';
  }
  coverOverlay.style.display = 'none';

  // ── PFP ──
  const pfpWidget  = document.getElementById('profilePfpWidget');
  const pfpOverlay = document.getElementById('profilePfpOverlay');
  pfpWidget.innerHTML = '';
  const pfpSrc = resolvePfpUrl(user);
  const img = document.createElement('img');
  img.src = pfpSrc;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.dataset.avatar = '1';
  img.style.cssText = 'width:60px;height:60px;object-fit:cover;display:block;';
  pfpWidget.appendChild(img);
  applyImageRuntimeDefaults(img);
  pfpOverlay.style.display = 'none';

  // ── Username ──
  const usernameSpan  = document.getElementById('profileUsername');
  const usernameInput = document.getElementById('profileUsernameInput');
  usernameSpan.textContent  = user.username;
  usernameSpan.style.display  = 'inline';
  usernameInput.value         = user.username;
  usernameInput.style.display = 'none';

  // ── Save btn ──
  document.getElementById('profileSaveBtn').style.display = 'none';

  // ── Posts ──
  const postsList = document.getElementById('profilePostsList');
  postsList.innerHTML = '';

  const [
    { data: worlds },
    { data: posts }
  ] = await Promise.all([
    supabase
      .from('worlds')
      .select('id, user_id, name, description, category, background_url, font_family, font_color, ui_color, is_public_view, is_public_edit')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('posts')
      .select('id, title, body, file_name, user_id, world_id')
      .eq('user_id', userId)
      .eq('group_id', 'group0')
      .order('created_at', { ascending: false })
  ]);

  if (worlds && worlds.length > 0) {
    const worldsLabel = document.createElement('div');
    worldsLabel.className = 'profile-posts-section-label';
    worldsLabel.textContent = 'worlds';
    postsList.appendChild(worldsLabel);

    worlds.forEach((world) => {
      const label = world.name || world.description?.slice(0, 60) || world.category || 'untitled world';
      const item = document.createElement('div');
      item.className = 'profile-post-item profile-world-item';
      item.textContent = label;

      item.addEventListener('click', async () => {
        if (editMode || !world?.id) return;

        const isPrivateView = world.is_public_view === false;
        if (isPrivateView && String(currentUser?.id || '') !== String(world.user_id || '')) {
          alert('This world is private.');
          return;
        }

        closeProfileModal();
        if (worldsFeature?.openWorldById) {
          await worldsFeature.openWorldById(world.id);
        } else {
          await scheduleWorldModeReload('enter', {
            world,
            creator: user,
            backgroundUrl: world.background_url || DEFAULT_BG_URL,
            fontFamily: world.font_family || '',
            fontColor: world.font_color || '',
            uiColor: world.ui_color || 'rgba(255,255,255,0.7)'
          });
        }
      });

      postsList.appendChild(item);
    });
  }

  if (posts && posts.length > 0) {
    const postsLabel = document.createElement('div');
    postsLabel.className = 'profile-posts-section-label';
    postsLabel.textContent = 'posts';
    postsList.appendChild(postsLabel);

    posts.forEach(p => {
      const label = p.title || p.body?.slice(0, 60) || p.file_name || 'untitled';
      const item = document.createElement('div');
      item.className    = 'profile-post-item';
      item.textContent  = label;

      item.addEventListener('click', async () => {
        const wasPostModalOpen = postDetailOverlay?.style.display === 'flex';

        const fullPost = await getPostRecordById(p.id, { fallbackPost: p });
        if (!fullPost) return;

        activeUserFilter = null;
        activeCategoryFilter = null;
        activeLinkTreeRootPostId = null;

        if (fullPost.world_id) {
          const sameWorld = String(activeWorldContext?.world?.id || '') === String(fullPost.world_id);
          if (!sameWorld) {
            const { data: worldRow, error: worldError } = await supabase
              .from('worlds')
              .select('id, user_id, name, description, category, background_url, custom_code_url, font_family, font_color, ui_color, is_public_view, is_public_edit')
              .eq('id', fullPost.world_id)
              .maybeSingle();

            if (worldError || !worldRow) {
              alert('Could not open world for this post.');
              return;
            }

            const isPrivateView = worldRow.is_public_view === false;
            if (isPrivateView && String(currentUser?.id || '') !== String(worldRow.user_id || '')) {
              alert('This world is private.');
              return;
            }

            if (worldsFeature?.openWorldById) {
              await worldsFeature.openWorldById(worldRow.id);
            } else {
              await scheduleWorldModeReload('enter', {
                world: worldRow,
                creator: user,
                backgroundUrl: worldRow.background_url || DEFAULT_BG_URL,
                fontFamily: worldRow.font_family || '',
                fontColor: worldRow.font_color || '',
                uiColor: worldRow.ui_color || 'rgba(255,255,255,0.7)'
              });
            }
          }
        } else if (activeWorldContext?.world?.id) {
          await scheduleWorldModeReload('exit');
        }

        centerCanvasOnPost(fullPost.id);

        if (!wasPostModalOpen) {
          return;
        }

        closeProfileModal();
        openPostDetailModal(fullPost, user);
      });

      postsList.appendChild(item);
    });
  } else if (!worlds || worlds.length === 0) {
    postsList.innerHTML = '<div style="color:rgba(255,255,255,0.2);font-size:0.8rem;padding:10px 0;">no posts yet</div>';
  }

  // ── Edit mode (own profile only, triggered by right-click) ──
  const profileModal = document.getElementById('profileModal');

    let lastProfileRightClick = 0;

  profileModal.oncontextmenu = (e) => {
    if (!isOwnProfile) return;
    e.preventDefault();
    e.stopPropagation();

    const now = Date.now();
    const timeSince = now - lastProfileRightClick;
    lastProfileRightClick = now;

    if (timeSince < DOUBLE_CLICK_THRESHOLD) {
      lastProfileRightClick = 0;
      profileEditMode = !profileEditMode;

      coverOverlay.style.display  = profileEditMode ? 'flex'         : 'none';
      pfpOverlay.style.display    = profileEditMode ? 'flex'         : 'none';
      usernameSpan.style.display  = profileEditMode ? 'none'         : 'inline';
      usernameInput.style.display = profileEditMode ? 'inline'       : 'none';
      document.getElementById('profileSaveBtn').style.display = profileEditMode ? 'inline-block' : 'none';
    }
    // single right-click inside profile does nothing
  };
    profileOverlay.classList.add('open');
  document.body.classList.add('profile-open');
  scheduleUiStatePersist();
}

function closeProfileModal() {
  profileOverlay.classList.remove('open');
  document.body.classList.remove('profile-open');
  profileEditMode     = false;
  newProfileCoverFile = null;
  newProfilePfpFile   = null;
  currentProfileUserId = null;
  scheduleUiStatePersist();
}

async function saveProfileChanges() {
  if (!currentProfileUserId) return;

  const updates = {};

  // Username
  const usernameInput = document.getElementById('profileUsernameInput');
  const newUsername = usernameInput.value.trim();
  if (!newUsername || newUsername.length > 12) {
    alert('Username must be 1–12 characters'); return;
  }

  // Check uniqueness only if changed
  const { data: currentUserRow } = await supabase
    .from('users').select('username').eq('id', currentProfileUserId).single();
  if (newUsername !== currentUserRow?.username) {
    const { data: taken } = await supabase
      .from('users').select('id').eq('username', newUsername).maybeSingle();
    if (taken) { alert('Username already taken'); return; }
    updates.username = newUsername;
  }

  // New cover image
  if (newProfileCoverFile) {
    const path = `covers/${currentProfileUserId}-${Date.now()}.${newProfileCoverFile.name.split('.').pop()}`;
    const { error: upErr } = await supabase.storage
      .from('group0-pfps').upload(path, newProfileCoverFile);
    if (upErr) { alert('Cover upload failed'); return; }
    const { data: urlData } = supabase.storage.from('group0-pfps').getPublicUrl(path);
    updates.cover_image_url = urlData.publicUrl;
  }

  // New pfp
  if (newProfilePfpFile) {
    const ext  = newProfilePfpFile.name.split('.').pop() || 'webp';
    const path = `${currentProfileUserId}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('group0-pfps').upload(path, newProfilePfpFile);
    if (upErr) { alert('PFP upload failed'); return; }
    const { data: urlData } = supabase.storage.from('group0-pfps').getPublicUrl(path);
    updates.pfp_url = urlData.publicUrl;
    updates.pfp     = null;
  }

  if (Object.keys(updates).length === 0) {
    closeProfileModal(); return;
  }

  updates.updated_at = new Date();
  const { error } = await supabase
    .from('users').update(updates).eq('id', currentProfileUserId);
  if (error) { alert(`Save failed: ${error.message}`); return; }

  // Refresh current user data if it's their own profile
  if (currentProfileUserId === currentUser?.id) {
    currentUserData = { ...currentUserData, ...updates };
  }

  mentionUserMapCache = null;
  mentionUserMapPromise = null;
  mentionAliasMapCache = null;

  closeProfileModal();
  await loadPosts();
  renderLinks(lastLoadedPosts, lastLoadedLinks);
}
// ============================================
// 16. POST SUBMISSION FLOW
// ============================================


async function handlePostSubmit() {
  if (postSubmitBtn.disabled) return; // prevent double-submit

  const title     = postTitle.value.trim();
  const body      = getPostTextBody();
  const category  = postCategory.value || null;
  const fileList  = [...postFileInput.files];
  let isMulti     = fileList.length > 1;
  const coverFile = postCoverImageInput.files[0] || null;
  const linkInputValue = postYoutubeInput.value.trim();
  const normalizedLinkUrl = normalizeLinkUrl(linkInputValue);
  const youtubeId = extractYouTubeId(linkInputValue) || extractYouTubeId(normalizedLinkUrl || '') || null;
  const storedLinkUrl = linkInputValue
    ? (normalizedLinkUrl || (youtubeId ? `https://youtu.be/${youtubeId}` : null))
    : null;

  if (linkInputValue && !storedLinkUrl) {
    alert('Enter a valid URL');
    return;
  }

  const hasExistingFile = Boolean(
    editingPost && (editingPost.file_url || (editingPost.files && editingPost.files.length > 0))
  );
  const hasExistingLink = Boolean(editingPost && editingPost.youtube_url && !linkInputValue);

  if (!title && fileList.length === 0 && !getBodyPlainText(body) && !storedLinkUrl && !hasExistingFile && !hasExistingLink) {
    alert('Add a title, text, choose a file, or paste a URL');
    return;
  }

  // Client-side file size check (Supabase free tier = 50 MB per file)
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  for (const file of fileList) {
    if (file.size > MAX_FILE_SIZE) {
      alert(`"${file.name}" is too large — max 50 MB per file.`);
      return;
    }
  }

  let uploadFiles = fileList;
  try {
    uploadFiles = await Promise.all(fileList.map((file) => normalizeUploadFile(file)));
    isMulti = uploadFiles.length > 1;
  } catch {
    alert('Could not process one of your HEIC files. Try converting it to JPG/PNG and uploading again.');
    return;
  }

  for (const file of uploadFiles) {
    if (file.size > MAX_FILE_SIZE) {
      alert(`"${file.name}" is too large after conversion — max 50 MB per file.`);
      return;
    }
  }

  postSubmitBtn.disabled    = true;
  postSubmitBtn.textContent = '...';

  try {

    let fileURL = null, fileName = null, fileType = null;
    let filesArray = null;

    if (uploadFiles.length === 1) {
      const file = uploadFiles[0];
      fileName = file.name;
      fileType = await getFileType(file);
      const filePath = `${currentUser.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('group0-posts').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from('group0-posts').getPublicUrl(filePath);
      fileURL = urlData.publicUrl;

    } else if (isMulti) {
      filesArray = [];
      for (const file of uploadFiles) {
        const ft = await getFileType(file);
        const filePath = `${currentUser.id}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('group0-posts').upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage
          .from('group0-posts').getPublicUrl(filePath);
        filesArray.push({ url: urlData.publicUrl, name: file.name, type: ft });
      }
    }


    // Auto-cover: if multi-file and no manual cover chosen, use first visual file's URL
    let autoCoverUrl = null;
    if (isMulti && !coverFile && filesArray) {
      const firstVisual = filesArray.find(f => f.type === 'image' || f.type === 'video');
      if (firstVisual) autoCoverUrl = firstVisual.url;
    }

    let coverImageURL = null;
    if (coverFile) {
      const coverPath = `${currentUser.id}/covers/${Date.now()}-${coverFile.name}`;
      const { error: coverError } = await supabase.storage
        .from('group0-posts').upload(coverPath, coverFile);
      if (coverError) throw coverError;
      const { data: coverUrlData } = supabase.storage
        .from('group0-posts').getPublicUrl(coverPath);
      coverImageURL = coverUrlData.publicUrl;
    }

    const postRecord = {
      title:       title    || null,
      body:        body     || null,
      category:    category || null,
      youtube_url: storedLinkUrl,
    };

    if (uploadFiles.length === 1) {
      // User chose a new single file — replace everything
      postRecord.file_url  = fileURL;
      postRecord.file_name = fileName;
      postRecord.file_type = fileType;
      postRecord.files     = null;
    } else if (isMulti) {
      // User chose multiple new files — replace everything
      postRecord.files     = filesArray;
      postRecord.file_url  = null;
      postRecord.file_name = null;
      postRecord.file_type = null;
    } else if (editingPostId && editingPost) {
      // Edit with no new file chosen — preserve whatever was already there
      postRecord.file_url  = editingPost.file_url  ?? null;
      postRecord.file_name = editingPost.file_name ?? null;
      postRecord.file_type = editingPost.file_type ?? null;
      postRecord.files     = editingPost.files     ?? null;
    } else {
      // New post with no file
      postRecord.file_url  = null;
      postRecord.file_name = null;
      postRecord.file_type = null;
      postRecord.files     = null;
    }

    // Cover image: use new upload, or auto-cover, or preserve existing on edit
    if (coverImageURL) {
      postRecord.cover_image_url = coverImageURL;
    } else if (autoCoverUrl) {
      postRecord.cover_image_url = autoCoverUrl;
    } else if (editingPostId && editingPost) {
      postRecord.cover_image_url = editingPost.cover_image_url ?? null;
    }

    // ── EDIT ──
    if (editingPostId) {
      const savedPost = await updatePost(editingPostId, postRecord);
      await queueMentionNotifications({
        notificationType: 'post_mention',
        sourcePostId: savedPost?.id || editingPostId,
        sourceText: body,
        actorUserId: currentUser.id
      });
      closePostForm();
      void refreshFeedAfterMutation();
      return;
    }

    // ── CREATE ──
    postRecord.user_id  = currentUser.id;
    postRecord.group_id = 'group0';
    postRecord.world_id = activeWorldContext?.world?.id || null;

    const created = await savePost(postRecord);
    await queueMentionNotifications({
      notificationType: 'post_mention',
      sourcePostId: created.id,
      sourceText: body,
      actorUserId: currentUser.id
    });

    if (pendingLinkPostId) {
      const a = String(pendingLinkPostId);
      const b = String(created.id);
      const a_post_id = a < b ? a : b;
      const b_post_id = a < b ? b : a;
      const { error: linkErr } = await supabase
        .from('post_links')
        .insert([{ group_id: 'group0', a_post_id, b_post_id, created_by: currentUser.id }]);
      if (linkErr) console.error('Failed to create link:', linkErr);
    }

    closePostForm();
    void refreshFeedAfterMutation().then(async () => {
      const createdEl = postCanvas.querySelector(`.post-card[data-post-id="${created.id}"]`);
      if (!createdEl) return;

      await waitForLayoutStability();
      startPlacement(created, createdEl,
        window.__lastMouseEventForPlacement || { clientX: 200, clientY: 200 });
    });
   } catch (error) {
    console.error('Post submission failed:', error?.message || error);
    alert(`Post failed: ${error?.message || error}`);
  } finally {
    postSubmitBtn.disabled    = false;
    postSubmitBtn.textContent = 'submit';
  }
}

async function finalizeCoverImagePromptSave(saved, isEdit) {
  closeCoverImagePrompt();
  const refreshPromise = refreshFeedAfterMutation();

  if (isEdit || !saved) {
    return;
  }

  await refreshPromise;

  const createdEl = postCanvas.querySelector(`.post-card[data-post-id="${saved.id}"]`);
  if (createdEl) {
    await waitForLayoutStability();
    startPlacement(saved, createdEl, window.__lastMouseEventForPlacement || { clientX: 200, clientY: 200 });
  }
}

// ============================================
// 17. COVER IMAGE PROMPT FLOW
// ============================================

async function handleCoverImageSubmit() {
  if (!pendingPost) return;

  const coverFile = coverImageInput.files[0];
  if (!coverFile) { alert('Choose an image or click skip'); return; }

  try {
    const filePath = `${currentUser.id}/covers/${Date.now()}-${coverFile.name}`;
    const { error: uploadError } = await supabase.storage.from('group0-posts').upload(filePath, coverFile);
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('group0-posts').getPublicUrl(filePath);
    pendingPost.cover_image_url = urlData.publicUrl;

    const isEdit = pendingPost._isEdit;
    const editId = pendingPost._editId;
    if (isEdit) { delete pendingPost._isEdit; delete pendingPost._editId; }

    const saved = isEdit ? await updatePost(editId, pendingPost) : await savePost(pendingPost);

    await finalizeCoverImagePromptSave(saved, isEdit);
  } catch (error) {
    console.error('Cover image upload failed:', error.message);
    alert(`Cover image failed: ${error.message}`);
  }
}

async function handleCoverImageSkip() {
  if (!pendingPost) return;

  try {
    const isEdit = pendingPost._isEdit;
    const editId = pendingPost._editId;
    if (isEdit) { delete pendingPost._isEdit; delete pendingPost._editId; }

    const saved = isEdit ? await updatePost(editId, pendingPost) : await savePost(pendingPost);

    await finalizeCoverImagePromptSave(saved, isEdit);
  } catch (error) {
    console.error('Post save failed:', error.message);
    alert(`Post failed: ${error.message}`);
  }
}

// ============================================
// 18. POST PERSISTENCE
// ============================================

async function savePost(postRecord) {
  const { data, error } = await supabase
    .from('posts')
    .insert([postRecord])
    .select();

  if (error) throw error;

  console.log('Post saved:', data?.[0]?.id);
  return data?.[0];
}

async function updatePost(postId, updates) {
  let query = supabase
    .from('posts')
    .update(updates)
    .eq('id', postId);

  if (!currentUserData?.is_admin) {
    query = query.eq('user_id', currentUser.id);
  }

  const { data, error } = await query.select();
  if (error) throw error;
  return data?.[0];
}

// ============================================
// 19. COMMENTS FLOW
// ============================================

async function loadCommentsForPost(postId) {
  const { data: comments, error } = await supabase
    .from('comments')
    .select('id, body, created_at, user_id')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to load comments:', error);
    commentsList.innerHTML = `<div style="opacity:0.7;">failed to load comments</div>`;
    return;
  }

  const commentUserIds = [...new Set((comments || []).map(c => c.user_id).filter(Boolean))];

  let commentUsers = [];
  if (commentUserIds.length > 0) {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, username, pfp, pfp_url')
      .in('id', commentUserIds);

    if (usersError) {
      console.error('Failed to load comment users:', usersError);
    } else {
      commentUsers = users || [];
    }
  }

  const commentUserMap = {};
  commentUsers.forEach(u => { commentUserMap[u.id] = u; });

  commentsList.innerHTML = '';

  if (!comments || comments.length === 0) {
    commentsList.innerHTML = `<div style="opacity:0.7;">no comments yet</div>`;
    return;
  }

  comments.forEach(c => {
    const row = document.createElement('div');
    row.className = 'comment-row';

    const u = commentUserMap[c.user_id];
    const uname = u?.username || 'unknown';
    const pfpSrc = resolvePfpUrl(u);
    const isOwn = currentUser && c.user_id === currentUser.id;
    const stamp = formatTimestamp(c.created_at);

    row.innerHTML = `
      <div class="comment-header">
        <img class="comment-pfp" src="${pfpSrc}" alt="" loading="lazy" decoding="async" data-avatar="1">
        <span class="comment-username">${uname}</span>
        <span class="comment-time">${stamp}</span>
      </div>
      <div class="comment-body">${formatBodyTextWithMentions(c.body || '', { clickable: true })}</div>
    `;
    applyImageRuntimeDefaults(row);

    // Double right-click to edit/delete own comments
    if (isOwn) {
      let lastRightClickComment = 0;

      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const now = Date.now();
        const timeSince = now - lastRightClickComment;
        lastRightClickComment = now;

        if (timeSince < DOUBLE_CLICK_THRESHOLD) {
          lastRightClickComment = 0;
          openCommentEditMode(row, c);
        }
      });
    }

    commentsList.appendChild(row);
  });
}

function openCommentEditMode(row, comment) {
  // Prevent double-opening
  if (row.querySelector('.comment-edit-input')) return;

  const bodyEl = row.querySelector('.comment-body');
  const originalText = bodyEl.textContent;

  // Replace body with an inline input + save/delete buttons
  bodyEl.style.display = 'none';

  const input = document.createElement('textarea');
  input.className = 'comment-edit-input';
  input.value = originalText;

  const actions = document.createElement('div');
  actions.className = 'comment-edit-actions';
  actions.innerHTML = `
    <button class="comment-edit-save">save</button>
    <button class="comment-edit-delete">delete</button>
  `;

  row.appendChild(input);
  row.appendChild(actions);
  input.focus();
  input.select();

  // Cancel — restore original view
    // Double right-click on the row closes edit mode
  let lastRightClickEdit = 0;
  const cancelEdit = () => {
    input.remove();
    actions.remove();
    bodyEl.style.display = '';
    row.removeEventListener('contextmenu', editContextHandler);
  };
  const editContextHandler = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    const timeSince = now - lastRightClickEdit;
    lastRightClickEdit = now;
    if (timeSince < DOUBLE_CLICK_THRESHOLD) {
      lastRightClickEdit = 0;
      cancelEdit();
    }
  };
  row.addEventListener('contextmenu', editContextHandler);

  // Save — update in DB then reload
  actions.querySelector('.comment-edit-save').addEventListener('click', async () => {
    const newText = input.value.trim();
    if (!newText) return;
    const { error } = await supabase
      .from('comments')
      .update({ body: newText })
      .eq('id', comment.id)
      .eq('user_id', currentUser.id);
    if (error) { alert(`Save failed: ${error.message}`); return; }
    await loadCommentsForPost(activePostForModal.id);
  });

  // Delete — remove from DB then reload
  actions.querySelector('.comment-edit-delete').addEventListener('click', async () => {
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', comment.id)
      .eq('user_id', currentUser.id);
    if (error) { alert(`Delete failed: ${error.message}`); return; }
    await loadCommentsForPost(activePostForModal.id);
  });

  // Enter = save, Escape = cancel
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      actions.querySelector('.comment-edit-save').click();
    }
        if (e.key === 'Escape') {
      cancelEdit();
    }
  });
}


async function submitComment() {
  if (!activePostForModal) return;

  const text = commentInput.value.trim();
  if (!text) return;

  const { error } = await supabase
    .from('comments')
    .insert([{
      post_id: activePostForModal.id,
      user_id: currentUser.id,
      body: text
    }]);

  if (error) {
    console.error('Failed to post comment:', error);
    alert(`Comment failed: ${error.message}`);
    return;
  }

  await queueMentionNotifications({
    notificationType: 'comment_mention',
    sourcePostId: activePostForModal.id,
    sourceText: text,
    actorUserId: currentUser.id
  });

  commentInput.value = '';
  await loadCommentsForPost(activePostForModal.id);

  postDetailModal.scrollTop = postDetailModal.scrollHeight;
}

// ============================================
// 20. POST LOADING + CANVAS RENDERING
// ============================================
async function loadPosts(options = {}) {
  const { force = false, clearCanvasImmediately = false } = options;
  const requestKey = getLoadPostsRequestKey();
  if (!force && loadPostsInFlightPromise && loadPostsInFlightKey === requestKey) {
    console.warn('[feed reload skipped: already loading]');
    return loadPostsInFlightPromise;
  }

  const runPromise = (async () => {
  const loadSeq = ++postsLoadSequence;
  const worldLoading = Boolean(activeWorldContext?.world?.id);
  setCanvasLoadingState(true, worldLoading ? 'loading world posts...' : 'loading posts...');

  if (clearCanvasImmediately && postCanvas) {
    const cachedSnapshot = getFeedSnapshot(requestKey);
    if (cachedSnapshot) {
      lastLoadedPosts = cloneFeedRows(cachedSnapshot.posts || []);
      lastLoadedWorlds = cloneFeedRows(cachedSnapshot.worlds || []);
      (lastLoadedPosts || []).forEach((post) => cachePostRecord(post));
      renderFeedCards(lastLoadedPosts, lastLoadedWorlds, cachedSnapshot.userMap || {}, { wireframe: true });
      renderLinks(lastLoadedPosts, lastLoadedLinks);
      scheduleCardLodRefresh();
    } else {
      lastLoadedPosts = [];
      lastLoadedWorlds = [];
      renderFeedWireframes({ worldLoading });
      renderLinks(lastLoadedPosts, lastLoadedLinks);
    }
  }

  try {
    let query = supabase
      .from('posts')
      .select('*')
      .eq('group_id', 'group0')
      .order('created_at', { ascending: false });

    if (activeWorldContext?.world?.id) {
      query = query.eq('world_id', activeWorldContext.world.id);
    } else {
      // Main feed: never show world-specific posts
      query = query.is('world_id', null);
      if (!editMode) {
        // NOTE: tree filter is exclusive, but we do NOT clear it here.
        // We clear it only when user clicks category/username (in those handlers),
        // or when they click empty background (optional).
        if (activeUserFilter) {
          query = query.eq('user_id', activeUserFilter);
        }
        if (activeCategoryFilter) {
          if (activeCategoryFilter === NONE_CATEGORY_FILTER) {
            query = query.is('category', null);
          } else {
            query = query.eq('category', activeCategoryFilter);
          }
        }
      }
    }

    const postsPromise = query;

    const worldCategoryFilter = activeCategoryFilter && activeCategoryFilter !== NONE_CATEGORY_FILTER
      ? activeCategoryFilter
      : null;
    const activeParentWorldId = activeWorldContext?.world?.id || null;
    const worldsPromise = worldsFeature
      ? worldsFeature.loadWorlds({
          userId: (!editMode && !activeWorldContext) ? activeUserFilter : null,
          category: (!editMode && !activeWorldContext) ? worldCategoryFilter : null,
          parentWorldId: activeParentWorldId,
          rootOnly: !activeWorldContext
        })
      : Promise.resolve([]);

    const [{ data: posts, error }, worlds] = await Promise.all([postsPromise, worldsPromise]);

    if (error) {
      console.error('Failed to load posts:', error);
      return;
    }

    if (loadSeq !== postsLoadSequence) {
      return;
    }

    lastLoadedWorlds = worlds || [];

    // Store + apply tree filter (exclusive)
    lastLoadedPosts = posts || [];
    (lastLoadedPosts || []).forEach((post) => cachePostRecord(post));

    if (
      activeThreadSourcePostId &&
      !lastLoadedPosts.some(p => String(p.id) === String(activeThreadSourcePostId))
    ) {
      activeThreadSourcePostId = null;
    }

    if (activeLinkTreeRootPostId) {
      const allowed = getConnectedComponent(activeLinkTreeRootPostId, lastLoadedLinks);
      lastLoadedPosts = lastLoadedPosts.filter(p => allowed.has(String(p.id)));
    }

    reconcileEditSelectionForVisiblePosts();

    // Build user map based on *visible* posts (so you don't fetch unused users)
    const userIds = [...new Set([
      ...(lastLoadedPosts || []).map(p => p.user_id),
      ...(lastLoadedWorlds || []).map(w => w.user_id)
    ].filter(Boolean))];

    let userMap = {};
    if (userIds.length > 0) {
      try {
        userMap = await getUsersMapByIds(userIds);
      } catch (usersError) {
        console.error('Failed to load users:', usersError);
        return;
      }
    }

    if (!postCanvas) {
      console.error('postCanvas element not found. Check your HTML wrapper.');
      return;
    }

    renderFeedCards(lastLoadedPosts, lastLoadedWorlds, userMap, { wireframe: false });
    setFeedSnapshot(requestKey, {
      posts: lastLoadedPosts,
      worlds: lastLoadedWorlds,
      userMap
    });

    console.log(`Loaded ${lastLoadedPosts?.length || 0} posts and ${lastLoadedWorlds?.length || 0} worlds`);

    renderLinks(lastLoadedPosts, lastLoadedLinks);
    scheduleCardLodRefresh();
    requestAnimationFrame(() => {
      const cards = Array.from(postCanvas.querySelectorAll('.post-card'));
      if (!cards.length) return;
      if (!hasVisibleCardInViewport(cards)) {
        centerViewportOnCards(cards);
      }
    });
    scheduleUiStatePersist();
  } catch (err) {
    console.error('loadPosts crashed:', err);
    if (clearCanvasImmediately && postCanvas && postCanvas.children.length === 0) {
      renderFeedWireframes({ worldLoading });
    }
  } finally {
    if (loadSeq === postsLoadSequence) {
      setCanvasLoadingState(false);
    }
  }
  })();

  loadPostsInFlightKey = requestKey;
  loadPostsInFlightPromise = runPromise;

  try {
    return await runPromise;
  } finally {
    if (loadPostsInFlightPromise === runPromise) {
      loadPostsInFlightPromise = null;
      loadPostsInFlightKey = '';
    }
  }
}



function trapScrollInside(el) {
  if (!el) return;

  el.addEventListener('wheel', (e) => {
    if (isPlacing || isBulkPlacing) return; // let canvas zoom handle it during placement
    const canScroll = el.scrollHeight > el.clientHeight;
    if (!canScroll) return;

    e.stopPropagation();

    const atTop = el.scrollTop <= 0;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    const scrollingUp = e.deltaY < 0;
    const scrollingDown = e.deltaY > 0;

    if ((scrollingUp && !atTop) || (scrollingDown && !atBottom)) {
      e.preventDefault();
      el.scrollTop += e.deltaY;
    } else {
      /* still prevent canvas zoom when hovering text */
      e.preventDefault();
    }
  }, { passive: false });
}

// ============================================
// 21. FILE PREVIEW HELPERS
// ============================================

function getFileExtension(filename = '') {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function isImageExtension(ext) {
  return [
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp',
    'heic', 'heif', 'avif', 'svg'
  ].includes(ext);
}

function isAudioExtension(ext) {
  return [
    'mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'oga'
  ].includes(ext);
}

function isVideoExtension(ext) {
  return [
    'mp4', 'mov', 'webm', 'm4v', 'ogv'
  ].includes(ext);
}

function isPdfExtension(ext) {
  return ext === 'pdf';
}

function isVisualExtension(ext) {
  return isImageExtension(ext) || isVideoExtension(ext);
}

function clampValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getPdVisualPanLimits(visualInner, imageEl) {
  if (!visualInner || !imageEl) return { maxX: 0, maxY: 0 };

  const baseW = imageEl.offsetWidth;
  const baseH = imageEl.offsetHeight;
  const viewportW = visualInner.clientWidth;
  const viewportH = visualInner.clientHeight;

  const zoomedW = baseW * pdVisualZoom;
  const zoomedH = baseH * pdVisualZoom;

  return {
    maxX: Math.max(0, (zoomedW - viewportW) / 2),
    maxY: Math.max(0, (zoomedH - viewportH) / 2)
  };
}

function clampPdVisualPan(visualInner, imageEl) {
  const { maxX, maxY } = getPdVisualPanLimits(visualInner, imageEl);
  pdVisualPanX = clampValue(pdVisualPanX, -maxX, maxX);
  pdVisualPanY = clampValue(pdVisualPanY, -maxY, maxY);
}

function applyPdVisualZoom(visualInner) {
  if (!visualInner) return;
  const imageEl = visualInner.querySelector('.pd-visual-img');
  if (!imageEl) return;

  clampPdVisualPan(visualInner, imageEl);

  imageEl.style.transformOrigin = 'center center';
  imageEl.style.transform = `translate(${pdVisualPanX}px, ${pdVisualPanY}px) scale(${pdVisualZoom})`;
  imageEl.classList.toggle('pd-visual-img-draggable', pdVisualZoom > 1);
}

function adjustPdVisualZoom(delta, visualInner, anchorClientX = null, anchorClientY = null) {
  if (!visualInner) return;
  const imageEl = visualInner.querySelector('.pd-visual-img');
  if (!imageEl) return;

  const oldScale = pdVisualZoom;
  const next = clampValue(pdVisualZoom + delta, PD_MIN_ZOOM, PD_MAX_ZOOM);
  if (next === oldScale) return;

  if (anchorClientX != null && anchorClientY != null) {
    const rect = visualInner.getBoundingClientRect();
    const px = anchorClientX - rect.left;
    const py = anchorClientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const zoomRatio = next / oldScale;
    pdVisualPanX = (1 - zoomRatio) * (px - cx) + zoomRatio * pdVisualPanX;
    pdVisualPanY = (1 - zoomRatio) * (py - cy) + zoomRatio * pdVisualPanY;
  }

  pdVisualZoom = next;

  if (pdVisualZoom <= PD_MIN_ZOOM) {
    pdVisualPanX = 0;
    pdVisualPanY = 0;
  }

  clampPdVisualPan(visualInner, imageEl);
  applyPdVisualZoom(visualInner);
}

async function renderPdPdfViewer(file, inner) {
  const token = ++pdPdfRenderToken;

  inner.innerHTML = `
    <div class="pd-pdf-shell">
      <div class="pd-pdf-toolbar">
        <button class="pd-pdf-btn" data-action="prev">‹</button>
        <span class="pd-pdf-page-indicator">1 / 1</span>
        <button class="pd-pdf-btn" data-action="next">›</button>
      </div>
      <div class="pd-pdf-body">
        <div class="pd-pdf-thumbs"></div>
        <div class="pd-pdf-pages"></div>
      </div>
    </div>
  `;

  const toolbar = inner.querySelector('.pd-pdf-toolbar');
  const pageIndicator = inner.querySelector('.pd-pdf-page-indicator');
  const thumbsEl = inner.querySelector('.pd-pdf-thumbs');
  const pagesEl = inner.querySelector('.pd-pdf-pages');
  if (!toolbar || !pageIndicator || !thumbsEl || !pagesEl) return;

  let totalPages = 0;
  let activePage = 1;
  const pageEls = [];
  const thumbBtns = [];

  const updateActivePage = (nextPage) => {
    const clamped = clampValue(nextPage, 1, Math.max(1, totalPages));
    activePage = clamped;
    pageIndicator.textContent = `${activePage} / ${Math.max(1, totalPages)}`;

    thumbBtns.forEach((btn, idx) => {
      const isActive = idx + 1 === activePage;
      btn.classList.toggle('active', isActive);
    });
  };

  const jumpToPage = (pageNum) => {
    const target = pageEls[pageNum - 1];
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    updateActivePage(pageNum);
  };

  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.getAttribute('data-action');
    if (action === 'prev') jumpToPage(activePage - 1);
    if (action === 'next') jumpToPage(activePage + 1);
  });

  try {
    const loadingTask = pdfjsLib.getDocument({ url: file.url, withCredentials: false });
    const pdfDoc = await loadingTask.promise;
    if (token !== pdPdfRenderToken) return;

    totalPages = pdfDoc.numPages;
    updateActivePage(1);

    for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
      const page = await pdfDoc.getPage(pageNum);
      if (token !== pdPdfRenderToken) return;

      const baseViewport = page.getViewport({ scale: 1 });
      const targetWidth = Math.max(560, (pagesEl.clientWidth || 860) - 32);
      const pageScale = clampValue(targetWidth / baseViewport.width, 0.65, 2.1);
      const viewport = page.getViewport({ scale: pageScale });

      const pageWrap = document.createElement('div');
      pageWrap.className = 'pd-pdf-page';
      pageWrap.dataset.page = String(pageNum);

      const pageCanvas = document.createElement('canvas');
      pageCanvas.className = 'pd-pdf-page-canvas';
      pageCanvas.width = Math.floor(viewport.width);
      pageCanvas.height = Math.floor(viewport.height);

      const pageCtx = pageCanvas.getContext('2d', { alpha: false });
      await page.render({ canvasContext: pageCtx, viewport }).promise;
      if (token !== pdPdfRenderToken) return;

      pageWrap.appendChild(pageCanvas);
      pagesEl.appendChild(pageWrap);
      pageEls.push(pageWrap);

      const thumbViewport = page.getViewport({ scale: 0.2 });
      const thumbBtn = document.createElement('button');
      thumbBtn.className = 'pd-pdf-thumb';
      thumbBtn.type = 'button';

      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.className = 'pd-pdf-thumb-canvas';
      thumbCanvas.width = Math.floor(thumbViewport.width);
      thumbCanvas.height = Math.floor(thumbViewport.height);

      const thumbCtx = thumbCanvas.getContext('2d', { alpha: false });
      await page.render({ canvasContext: thumbCtx, viewport: thumbViewport }).promise;
      if (token !== pdPdfRenderToken) return;

      const thumbLabel = document.createElement('span');
      thumbLabel.className = 'pd-pdf-thumb-label';
      thumbLabel.textContent = String(pageNum);

      thumbBtn.appendChild(thumbCanvas);
      thumbBtn.appendChild(thumbLabel);
      thumbBtn.addEventListener('click', () => jumpToPage(pageNum));
      thumbsEl.appendChild(thumbBtn);
      thumbBtns.push(thumbBtn);
    }

    pagesEl.addEventListener('scroll', () => {
      if (pageEls.length === 0) return;
      const containerTop = pagesEl.getBoundingClientRect().top;

      let closestPage = 1;
      let bestDist = Number.POSITIVE_INFINITY;
      pageEls.forEach((el, idx) => {
        const dist = Math.abs(el.getBoundingClientRect().top - containerTop);
        if (dist < bestDist) {
          bestDist = dist;
          closestPage = idx + 1;
        }
      });
      updateActivePage(closestPage);
    }, { passive: true });

    updateActivePage(1);
  } catch (error) {
    console.error('Failed to render PDF preview:', error);
    inner.innerHTML = `<div class="pd-pdf-error">Unable to render PDF preview.</div>`;
  }
}

function initPostDetailInteractions() {
  const visualCol = document.getElementById('pdVisualCol');
  const textCol = document.getElementById('pdTextCol');
  const commentsCol = document.getElementById('pdCommentsCol');
  const visualInner = document.getElementById('pdVisualInner');
  const textInner = document.getElementById('postDetailContent');
  const commentsInner = document.querySelector('.pd-comments-inner');
  if (!visualCol || !textCol || !commentsCol || !visualInner || !textInner || !commentsInner) {
    return () => {};
  }

  const enterVisual = () => { pdHoveredRegion = 'visual'; };
  const enterText = () => { pdHoveredRegion = 'text'; };
  const enterComments = () => { pdHoveredRegion = 'comments'; };

  let draggingImage = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let panStartX = 0;
  let panStartY = 0;

  const onVisualWheel = (e) => {
    if (pdHoveredRegion !== 'visual') return;

    const current = pdVisualNavController?.getCurrent?.();
    const imageActive = current && current.type === 'image';
    if (!imageActive) return;

    e.preventDefault();
    e.stopPropagation();
    const zoomDelta = e.deltaY < 0 ? PD_ZOOM_STEP : -PD_ZOOM_STEP;
    adjustPdVisualZoom(zoomDelta, visualInner, e.clientX, e.clientY);
  };

  const onVisualPointerDown = (e) => {
    const imageEl = visualInner.querySelector('.pd-visual-img');
    if (!imageEl) return;
    if (pdVisualZoom <= 1) return;
    if (e.button !== 0) return;

    draggingImage = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panStartX = pdVisualPanX;
    panStartY = pdVisualPanY;
    visualInner.classList.add('pd-visual-dragging');

    try {
      visualInner.setPointerCapture?.(e.pointerId);
    } catch {
      // best effort
    }

    e.preventDefault();
  };

  const onVisualPointerMove = (e) => {
    if (!draggingImage) return;

    const imageEl = visualInner.querySelector('.pd-visual-img');
    if (!imageEl) return;

    pdVisualPanX = panStartX + (e.clientX - dragStartX);
    pdVisualPanY = panStartY + (e.clientY - dragStartY);
    clampPdVisualPan(visualInner, imageEl);
    applyPdVisualZoom(visualInner);
    e.preventDefault();
  };

  const stopVisualDrag = () => {
    draggingImage = false;
    visualInner.classList.remove('pd-visual-dragging');
  };

  const onTextWheel = (e) => {
    if (pdHoveredRegion !== 'text') return;
    e.stopPropagation();
  };

  const onCommentsWheel = (e) => {
    if (pdHoveredRegion !== 'comments') return;
    e.stopPropagation();
  };

  visualCol.addEventListener('mouseenter', enterVisual);
  textCol.addEventListener('mouseenter', enterText);
  commentsCol.addEventListener('mouseenter', enterComments);

  visualInner.addEventListener('wheel', onVisualWheel, { passive: false });
  visualInner.addEventListener('pointerdown', onVisualPointerDown);
  visualInner.addEventListener('pointermove', onVisualPointerMove);
  visualInner.addEventListener('pointerup', stopVisualDrag);
  visualInner.addEventListener('pointercancel', stopVisualDrag);
  visualInner.addEventListener('lostpointercapture', stopVisualDrag);
  textInner.addEventListener('wheel', onTextWheel, { passive: true });
  commentsInner.addEventListener('wheel', onCommentsWheel, { passive: true });

  return () => {
    visualCol.removeEventListener('mouseenter', enterVisual);
    textCol.removeEventListener('mouseenter', enterText);
    commentsCol.removeEventListener('mouseenter', enterComments);

    visualInner.removeEventListener('wheel', onVisualWheel);
    visualInner.removeEventListener('pointerdown', onVisualPointerDown);
    visualInner.removeEventListener('pointermove', onVisualPointerMove);
    visualInner.removeEventListener('pointerup', stopVisualDrag);
    visualInner.removeEventListener('pointercancel', stopVisualDrag);
    visualInner.removeEventListener('lostpointercapture', stopVisualDrag);
    textInner.removeEventListener('wheel', onTextWheel);
    commentsInner.removeEventListener('wheel', onCommentsWheel);
    stopVisualDrag();
    pdHoveredRegion = null;
  };
}

function getFilePreviewLabel(filename = '') {
  const ext = getFileExtension(filename);
  if (!ext) return '?';
  return ext.toUpperCase();
}

function getNonVisualPreviewIconData(filename = '', fileType = 'other', { isMulti = false } = {}) {
  if (isMulti) return { token: '▦', className: 'is-files' };

  const ext = getFileExtension(filename);
  const textExts = ['txt', 'md', 'rtf', 'doc', 'docx', 'odt', 'pages'];
  const codeExts = ['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'xml', 'py', 'java', 'c', 'cpp', 'cs', 'rb', 'php'];
  const sheetExts = ['csv', 'xls', 'xlsx', 'ods', 'numbers'];
  const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz'];

  if (fileType === 'audio' || isAudioExtension(ext)) return { token: '♫', className: 'is-audio' };
  if (textExts.includes(ext)) return { token: '≣', className: 'is-text' };
  if (codeExts.includes(ext)) return { token: '⌨', className: 'is-code' };
  if (sheetExts.includes(ext)) return { token: '▤', className: 'is-sheet' };
  if (archiveExts.includes(ext)) return { token: '▣', className: 'is-archive' };
  if (ext === 'pdf') return { token: '◫', className: 'is-pdf' };
  return { token: '◻', className: 'is-generic' };
}

function getPostCardFileLineText(post, mediaState) {
  if (!post || !mediaState) return '';
  if (mediaState.hasYoutube) return '';
  if (post.files && post.files.length > 1) return '';
  return String(post.file_name || '').trim();
}

function getPostCardMultiFileListMarkup(post, mediaState) {
  if (!post || !mediaState) return '';
  if (mediaState.hasYoutube) return '';
  if (mediaState.hasVisual) return '';
  if (!post.files || post.files.length < 2) return '';

  const items = post.files
    .map((f) => String(f?.name || '').trim())
    .filter(Boolean)
    .map((name) => escapeHtml(name))
    .join('   +   ');

  if (!items) return '';

  return `
    <div class="post-fileline post-filelist" aria-label="attached files">
      <span class="post-fileline-track post-filelist-track">${items}</span>
    </div>
  `;
}

function buildFilePreviewMarkup(post) {
  // ── YOUTUBE ──
  const youtubeId = extractYouTubeId(post.youtube_url || '');
  if (youtubeId) {
    return `
      <div class="post-file-preview post-file-preview-youtube${post.cover_image_url ? ' has-cover' : ''}">
        ${createYouTubePosterShellMarkup(
          youtubeId,
          `post-file-preview-youtube-shell${post.cover_image_url ? ' has-cover' : ''}`,
          'post-file-preview-youtube-activate',
          'post-file-preview-youtube-activate-icon'
        )}
      </div>
    `;
  }

  // ── MULTI-FILE ──
  if (post.files && post.files.length > 1) {
    const hasCover = !!post.cover_image_url;
    const multiIcon = getNonVisualPreviewIconData('', 'other', { isMulti: true });
    return `
      <div class="post-file-preview post-file-preview-download${hasCover ? ' has-cover' : ''}">
        ${hasCover ? `<img class="post-file-preview-cover" src="${post.cover_image_url}" alt="" loading="lazy" decoding="async">` : ''}
        ${!hasCover ? `<div class="post-file-preview-icon ${multiIcon.className}" aria-hidden="true">${multiIcon.token}</div>` : ''}
        <div class="post-file-preview-label">+</div>
        <button
          class="post-file-preview-download-btn"
          type="button"
          data-download-all="1"
          aria-label="download all files"
        >⤓</button>
      </div>
    `;
  }

  const ext = getFileExtension(post.file_name || '');
  const label = getFilePreviewLabel(post.file_name || '');
  const isImage = post.file_type === 'image' || isImageExtension(ext);
  const isAudio = post.file_type === 'audio' || isAudioExtension(ext);
  const isVideo = (post.file_type === 'video' || isVideoExtension(ext)) && !isAudio;

  if (isImage && post.file_url) {
    return `<img class="post-image" src="${post.file_url}" alt="" loading="lazy" decoding="async">`;
  }

  if (isVideo && post.file_url) {
    const label = getFilePreviewLabel(post.file_name || '');
    return `
      <div class="post-file-preview post-file-preview-video">
        <video class="post-preview-video" src="${post.file_url}" muted loop autoplay playsinline preload="metadata" disablepictureinpicture controlslist="nodownload nofullscreen noremoteplayback" x-webkit-airplay="deny"></video>
        <div class="post-file-preview-label">${label}</div>
        <button class="post-preview-mute-btn" type="button" aria-label="toggle sound">x</button>
      </div>
    `;
  }

  if (isAudio && post.file_url) {
    const hasCover = !!post.cover_image_url;
    const icon = getNonVisualPreviewIconData(post.file_name || '', 'audio');
    return `
      <div class="post-file-preview post-file-preview-audio ${hasCover ? 'has-cover' : ''}">
        ${hasCover ? `<img class="post-file-preview-cover" src="${post.cover_image_url}" alt="" loading="lazy" decoding="async">` : ''}
        ${!hasCover ? `<div class="post-file-preview-icon ${icon.className}" aria-hidden="true">${icon.token}</div>` : ''}
        <div class="post-file-preview-label">${label}</div>
        <button class="post-file-preview-play" type="button" aria-label="play audio">▶︎</button>
        <audio class="post-preview-audio" src="${post.file_url}" preload="none"></audio>
      </div>
    `;
  }

  // replace the existing `if (post.file_url)` (the download tile) with:
  if (post.file_url) {
    const hasCover = !!post.cover_image_url;
    const icon = getNonVisualPreviewIconData(post.file_name || '', post.file_type || 'other');
    return `
      <div class="post-file-preview post-file-preview-download${hasCover ? ' has-cover' : ''}">
        ${hasCover ? `<img class="post-file-preview-cover" src="${post.cover_image_url}" alt="" loading="lazy" decoding="async">` : ''}
        ${!hasCover ? `<div class="post-file-preview-icon ${icon.className}" aria-hidden="true">${icon.token}</div>` : ''}
        <div class="post-file-preview-label">${label}</div>
        <button
          class="post-file-preview-download-btn"
          type="button"
          data-download-url="${escapeHtml(post.file_url)}"
          data-download-filename="${escapeHtml(post.file_name || 'download')}"
          aria-label="download file"
        >⤓</button>
      </div>
    `;
  }

  const fallbackIcon = getNonVisualPreviewIconData(post.file_name || '', post.file_type || 'other');
  return `
    <div class="post-file-preview">
      <div class="post-file-preview-icon ${fallbackIcon.className}" aria-hidden="true">${fallbackIcon.token}</div>
      <div class="post-file-preview-label">${label}</div>
    </div>
  `;
}

function getPostCardMediaState(post) {
  const isMultiFile = !!(post.files && post.files.length > 1);
  const fileExt = getFileExtension(post.file_name || '');
  const isImageFile = isImageExtension(fileExt) || post.file_type === 'image';
  const isAudioFile = isAudioExtension(fileExt) || post.file_type === 'audio';
  const isVideoFile = (isVideoExtension(fileExt) || post.file_type === 'video') && !isAudioFile;
  const isVisualFile = isImageFile || isVideoFile;
  const hasVisualAttachments = isMultiFile && (post.files || []).some((file) => {
    const attachmentType = String(file?.type || '').toLowerCase();
    const attachmentExt = getFileExtension(file?.name || '');
    return attachmentType === 'image' || attachmentType === 'video' || isImageExtension(attachmentExt) || isVideoExtension(attachmentExt);
  });
  const hasCoverImage = !!post.cover_image_url;
  const youtubeId = extractYouTubeId(post.youtube_url || '');
  const hasYoutube = !!youtubeId;
  const hasAnyFile = !!post.file_url || isMultiFile;
  const isOtherFile = (!!post.file_url && !isVisualFile && !isAudioFile) || isMultiFile;
  const hasVisual = (hasAnyFile && (isVisualFile || hasVisualAttachments || hasCoverImage)) || hasYoutube;

  let visualSrc = null;
  if (isImageFile || isVideoFile) {
    visualSrc = post.file_url;
  } else if (hasCoverImage) {
    visualSrc = post.cover_image_url;
  } else if (hasYoutube) {
    visualSrc = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
  }

  return {
    isMultiFile,
    isImageFile,
    isAudioFile,
    isVideoFile,
    isVisualFile,
    hasVisualAttachments,
    hasCoverImage,
    hasYoutube,
    hasAnyFile,
    isOtherFile,
    hasVisual,
    visualSrc
  };
}

function getPostCardContentConfig(post, mediaState) {
  const hasTitle = !!(post.title && post.title.trim());
  const hasText = hasRenderableBodyMarkup(post.body) || !!getPostExternalUrl(post.youtube_url || '');
  const disableCardInteractions = !!editMode;
  const {
    isImageFile,
    isAudioFile,
    isVideoFile,
    hasCoverImage,
    hasYoutube,
    hasAnyFile,
    isOtherFile,
    hasVisual,
    visualSrc
  } = mediaState;

  const bodyMarkup = renderPostBodyMarkup(post.body, {
    externalUrl: post.youtube_url,
    clickableExternalUrl: !disableCardInteractions
  });
  const fileLineText = getPostCardFileLineText(post, mediaState);
  const fileListMarkup = getPostCardMultiFileListMarkup(post, mediaState);
  const shouldShowFileLine =
    !!fileLineText &&
    hasAnyFile &&
    !hasYoutube &&
    !mediaState.isMultiFile &&
    (isAudioFile || isOtherFile);
  const fileLineMarkup = shouldShowFileLine
    ? `<div class="post-fileline"><span class="post-fileline-track">${escapeHtml(fileLineText)}</span></div>`
    : '';

  const buildPreviewMarkup = () => {
    if (isImageFile) return `<img class="post-image" src="${visualSrc}" alt="" loading="lazy" decoding="async">`;
    if (isVideoFile || isAudioFile || isOtherFile || hasYoutube) return buildFilePreviewMarkup(post);
    if (hasCoverImage) return `<img class="post-image" src="${visualSrc}" alt="" loading="lazy" decoding="async">`;
    return '';
  };

  if (hasTitle && (hasVisual || isAudioFile || isOtherFile) && hasText) {
    return {
      classes: ['post-layout-title-visual-text'],
      html: `
        ${renderPostTitleMarkup(post.title, { clickableMentions: !disableCardInteractions })}
        ${fileListMarkup}
        ${fileLineMarkup}
        <div class="post-visual-text-row">
          ${buildPreviewMarkup()}
          ${bodyMarkup}
        </div>
      `
    };
  }

  if (hasTitle && (hasVisual || isAudioFile || isOtherFile)) {
    return {
      classes: ['post-layout-title-visual'],
      html: `
        ${renderPostTitleMarkup(post.title, { clickableMentions: !disableCardInteractions })}
        ${fileListMarkup}
        ${fileLineMarkup}
        ${buildPreviewMarkup()}
      `
    };
  }

  if ((isAudioFile || isOtherFile) && hasText) {
    return {
      classes: ['post-layout-visual-text'],
      html: `
        ${fileListMarkup}
        ${fileLineMarkup}
        <div class="post-visual-text-row">
          ${buildFilePreviewMarkup(post)}
          ${bodyMarkup}
        </div>
      `
    };
  }

  if (hasVisual && hasText) {
    return {
      classes: ['post-layout-visual-text'],
      html: `
        ${fileListMarkup}
        ${fileLineMarkup}
        <div class="post-visual-text-row">
          ${isImageFile ? `<img class="post-image" src="${visualSrc}" alt="" loading="lazy" decoding="async">` : buildFilePreviewMarkup(post)}
          ${bodyMarkup}
        </div>
      `
    };
  }

  if (hasTitle && hasText) {
    return {
      classes: ['post-layout-title-text'],
      html: `
        ${renderPostTitleMarkup(post.title, { clickableMentions: !disableCardInteractions })}
        ${bodyMarkup}
      `
    };
  }

  if (hasVisual) {
    if (isVideoFile) {
      return {
        classes: ['post-layout-visual', 'post-layout-visual-natural'],
        cardClasses: ['post-card-natural-video'],
        html: buildFilePreviewMarkup(post),
        onRender(content, card) {
          content.querySelector('.post-file-preview-video')?.classList.add('post-file-preview-video-natural');
          lockNaturalVideoCardWidth(card, content);
        }
      };
    }

    if (isOtherFile || hasYoutube) {
      return {
        classes: ['post-layout-visual'],
        html: `${fileListMarkup}${fileLineMarkup}${buildFilePreviewMarkup(post)}`
      };
    }

    return {
      classes: ['post-layout-visual'],
      html: `<img class="post-image" src="${visualSrc}" alt="" loading="lazy" decoding="async">`
    };
  }

  if (isAudioFile || isOtherFile) {
    return {
      classes: ['post-layout-visual'],
      html: `${fileListMarkup}${fileLineMarkup}${buildFilePreviewMarkup(post)}`
    };
  }

  if (hasTitle) {
    return {
      classes: ['post-layout-title'],
      html: renderPostTitleMarkup(post.title, { clickableMentions: !disableCardInteractions })
    };
  }

  if (hasText) {
    return {
      classes: ['post-layout-text'],
      html: bodyMarkup
    };
  }

  return { classes: [], html: '' };
}

function lockNaturalVideoCardWidth(card, content) {
  const vid = content.querySelector('.post-preview-video');
  if (!vid) return;

  const applyNaturalWidth = () => {
    if (!vid.videoWidth || !vid.videoHeight) return;
    const aspect = vid.videoWidth / vid.videoHeight;
    let h = Math.min(vid.videoHeight, 400);
    let w = Math.round(h * aspect);
    if (w > 300) {
      w = 300;
      h = Math.round(w / aspect);
    }
    card.style.width = `${w}px`;
  };

  if (vid.readyState >= 1) applyNaturalWidth();
  else vid.addEventListener('loadedmetadata', applyNaturalWidth, { once: true });
}

function closeHelpOverlay() {
  const helpOverlay = document.getElementById('helpOverlay');
  if (!helpOverlay) return;
  helpOverlay.style.display = 'none';
  scheduleUiStatePersist();
}

function toggleHelpOverlay() {
  const helpOverlay = document.getElementById('helpOverlay');
  if (!helpOverlay) return;
  const isOpen = helpOverlay.style.display !== 'none';
  helpOverlay.style.display = isOpen ? 'none' : 'flex';
  scheduleUiStatePersist();
}

function closeNotificationsPanel() {
  notifPanel.classList.remove('open');
  document.body.classList.remove('notif-open');
  scheduleUiStatePersist();
}

function openNotificationsPanel() {
  notifPanel.classList.add('open');
  document.body.classList.add('notif-open');
  loadNotifications({ force: true, validateThreads: true });
  scheduleUiStatePersist();
}

function getUiStateStorageKey() {
  return `${UI_STATE_STORAGE_PREFIX}:${currentUser?.id || 'anon'}`;
}

function isFiniteNumber(value) {
  return Number.isFinite(value) && !Number.isNaN(value);
}

function buildUiStateSnapshot() {
  const helpOverlay = document.getElementById('helpOverlay');

  return {
    version: 1,
    savedAt: Date.now(),
    canvasScale,
    canvasOffsetX,
    canvasOffsetY,
    activePostId: activePostForModal?.id || null,
    postFormOpen: postFormOverlay?.style.display === 'flex',
    profileUserId: profileOverlay?.classList.contains('open') ? currentProfileUserId : null,
    notifOpen: !!notifPanel?.classList.contains('open'),
    helpOpen: !!helpOverlay && helpOverlay.style.display !== 'none',
    editMode,
    activeUserFilter,
    activeCategoryFilter,
    activeLinkTreeRootPostId
  };
}

function persistUiStateNow() {
  if (!currentUser) return;

  try {
    const snapshot = buildUiStateSnapshot();
    sessionStorage.setItem(getUiStateStorageKey(), JSON.stringify(snapshot));

    const quickSnapshot = {
      savedAt: snapshot.savedAt,
      canvasScale: snapshot.canvasScale,
      canvasOffsetX: snapshot.canvasOffsetX,
      canvasOffsetY: snapshot.canvasOffsetY
    };
    sessionStorage.setItem(UI_STATE_QUICK_KEY, JSON.stringify(quickSnapshot));
  } catch (err) {
    console.warn('Failed to persist UI state', err);
  }
}

function readQuickViewportState() {
  try {
    const raw = sessionStorage.getItem(UI_STATE_QUICK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > UI_STATE_MAX_AGE_MS) return null;
    return parsed;
  } catch (err) {
    console.warn('Failed to read quick viewport state', err);
    return null;
  }
}

function scheduleUiStatePersist() {
  if (restoreInFlight) return;

  window.clearTimeout(uiPersistTimer);
  uiPersistTimer = window.setTimeout(() => {
    persistUiStateNow();
  }, 120);
}

function readPersistedUiState() {
  if (!currentUser) return null;

  try {
    const raw = sessionStorage.getItem(getUiStateStorageKey());
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > UI_STATE_MAX_AGE_MS) return null;
    return parsed;
  } catch (err) {
    console.warn('Failed to read persisted UI state', err);
    return null;
  }
}

function isReasonableViewportState(snapshot) {
  if (!snapshot) return false;

  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number(snapshot.canvasScale)));
  if (!Number.isFinite(scale) || scale <= 0) return false;

  const offsetX = Number(snapshot.canvasOffsetX);
  const offsetY = Number(snapshot.canvasOffsetY);
  if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) return false;

  // Hard cap to reject pathological stale offsets from previous broken sessions.
  const HARD_OFFSET_LIMIT = 50000;
  if (Math.abs(offsetX) > HARD_OFFSET_LIMIT || Math.abs(offsetY) > HARD_OFFSET_LIMIT) {
    return false;
  }

  const viewportCenterX = (window.innerWidth || 0) / 2;
  const viewportCenterY = (window.innerHeight || 0) / 2;
  const centerCanvasX = (viewportCenterX - offsetX) / scale;
  const centerCanvasY = (viewportCenterY - offsetY) / scale;

  const CENTER_MARGIN = 3000;
  if (centerCanvasX < (POST_COORD_MIN - CENTER_MARGIN)) return false;
  if (centerCanvasX > (POST_COORD_MAX + CENTER_MARGIN)) return false;
  if (centerCanvasY < (POST_COORD_MIN - CENTER_MARGIN)) return false;
  if (centerCanvasY > (POST_COORD_MAX + CENTER_MARGIN)) return false;

  return true;
}

function applyInitialViewportState(snapshot) {
  if (
    snapshot &&
    isFiniteNumber(snapshot.canvasScale) &&
    isFiniteNumber(snapshot.canvasOffsetX) &&
    isFiniteNumber(snapshot.canvasOffsetY) &&
    isReasonableViewportState(snapshot)
  ) {
    canvasScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, snapshot.canvasScale));
    canvasOffsetX = snapshot.canvasOffsetX;
    canvasOffsetY = snapshot.canvasOffsetY;
    return;
  }

  if (snapshot) {
    console.warn('Ignoring stale viewport state; using safe startup viewport.');
  }

  canvasScale = DEFAULT_BOOT_SCALE;
  canvasOffsetX = Math.round(window.innerWidth * 0.34);
  canvasOffsetY = Math.round(window.innerHeight * 0.22);
}

async function restoreUiPanelsAndModals(snapshot) {
  if (!snapshot) return;

  activeUserFilter = snapshot.activeUserFilter || null;
  activeCategoryFilter = snapshot.activeCategoryFilter || null;
  activeLinkTreeRootPostId = snapshot.activeLinkTreeRootPostId || null;

  if (snapshot.notifOpen) {
    openNotificationsPanel();
  }

  if (snapshot.postFormOpen && !editMode) {
    openPostForm();
  }

  const helpOverlay = document.getElementById('helpOverlay');
  if (snapshot.helpOpen && helpOverlay) {
    helpOverlay.style.display = 'flex';
  }

  if (snapshot.profileUserId) {
    await openProfileModal(snapshot.profileUserId);
  }

  if (snapshot.activePostId) {
    const post = await getPostRecordById(snapshot.activePostId);
    const postErr = !post;

    if (!postErr && post) {
      const userMap = await getUsersMapByIds([post.user_id]);
      const user = userMap[String(post.user_id)] || null;

      await openPostDetailModal(post, user || {});
    }
  }
}

function scheduleRealtimeRefresh(options = {}) {
  const {
    withLinks = false,
    withNotifications = false,
    maybeCommentPostId = null
  } = options;

  if (withLinks) realtimeNeedsLinks = true;

  window.clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = window.setTimeout(async () => {
    await loadPosts();

    const secondaryTasks = [];

    if (realtimeNeedsLinks) {
      secondaryTasks.push(
        loadLinks().then(() => {
          realtimeNeedsLinks = false;
          renderLinks(lastLoadedPosts, lastLoadedLinks);
        })
      );
    } else {
      renderLinks(lastLoadedPosts, lastLoadedLinks);
    }

    if (withNotifications && notifPanel?.classList.contains('open')) {
      secondaryTasks.push(loadNotifications());
    }

    if (
      activePostForModal &&
      maybeCommentPostId &&
      String(activePostForModal.id) === String(maybeCommentPostId)
    ) {
      secondaryTasks.push(loadCommentsForPost(activePostForModal.id));
    }

    if (secondaryTasks.length > 0) {
      await Promise.allSettled(secondaryTasks);
    }
  }, 220);
}

function initializeRealtimeRefresh() {
  if (mainRealtimeChannel) return;

  mainRealtimeChannel = supabase
    .channel(`main-live:${currentUser?.id || 'anon'}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'posts', filter: 'group_id=eq.group0' },
      () => {
        scheduleRealtimeRefresh({ withLinks: true });
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'post_links', filter: 'group_id=eq.group0' },
      () => {
        scheduleRealtimeRefresh({ withLinks: true });
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'worlds' },
      () => {
        scheduleRealtimeRefresh();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'comments' },
      (payload) => {
        const changedPostId = payload?.new?.post_id || payload?.old?.post_id || null;
        scheduleRealtimeRefresh({ maybeCommentPostId: changedPostId });
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_user_id=eq.${currentUser?.id}`
      },
      () => {
        scheduleRealtimeRefresh({ withNotifications: true });
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Realtime refresh subscribed');
      }
    });
}

function handleGlobalKeydown(e) {
  const tag = document.activeElement?.tagName?.toLowerCase();
  const isTyping = tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable;

  if (!isTyping && postDetailOverlay?.style.display === 'flex') {
    if (e.key === 'ArrowLeft' && pdVisualNavController?.hasMultiple?.()) {
      e.preventDefault();
      pdVisualNavController.prev();
      return;
    }
    if (e.key === 'ArrowRight' && pdVisualNavController?.hasMultiple?.()) {
      e.preventDefault();
      pdVisualNavController.next();
      return;
    }
  }

  if (e.key === 'h' || e.key === 'H') {
    if (!isTyping) {
      e.preventDefault();
      toggleHelpOverlay();
      return;
    }
  }

  if (e.key !== 'Escape') return;

  if (worldsFeature?.closeActiveUi?.()) {
    return;
  }

  const helpOverlay = document.getElementById('helpOverlay');
  if (helpOverlay?.style.display !== 'none') {
    closeHelpOverlay();
  } else if (postDetailOverlay?.style.display === 'flex') {
    closePostDetailModal();
  } else if (postFormOverlay?.style.display === 'flex') {
    maybeClosePostForm();
  } else if (editMode) {
    toggleEditMode();
  }
}

function applyMarqueeIfNeeded(containerEl, trackEl, separator = '\u00A0\u00A0') {
  if (!containerEl || !trackEl) return;

  requestAnimationFrame(() => {
    if (trackEl.scrollWidth <= containerEl.clientWidth) return;

    const originalText = trackEl.textContent;
    trackEl.textContent = originalText + separator + originalText;

    requestAnimationFrame(() => {
      const totalWidth = trackEl.scrollWidth;
      if (totalWidth <= 0) return;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const style = getComputedStyle(trackEl);
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

      const firstHalfWidth = ctx.measureText(originalText + separator).width;
      const pct = (firstHalfWidth / totalWidth) * 100;
      trackEl.style.setProperty('--marquee-end-pct', `-${pct.toFixed(3)}%`);
    });

    containerEl.classList.add('is-marquee');
  });
}

function attachLongPress(element, onPress, options = {}) {
  if (!element || typeof onPress !== 'function') return;

  const {
    duration = 400,
    stopPropagationOnMouseDown = false,
    shouldIgnoreMouseDown = null,
    shouldIgnorePointerDown = shouldIgnoreMouseDown
  } = options;

  let pressTimer = null;
  let activePointerId = null;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerMoved = false;
  const MOVE_THRESHOLD = 10;

  element.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (shouldIgnoreMouseDown?.(e)) return;
    if (stopPropagationOnMouseDown) e.stopPropagation();

    pressTimer = setTimeout(() => {
      pressTimer = null;
      onPress(e);
    }, duration);
  });

  const clearPressTimer = () => {
    clearTimeout(pressTimer);
    pressTimer = null;
  };

  element.addEventListener('mouseup', clearPressTimer);
  element.addEventListener('mouseleave', clearPressTimer);

  element.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    if (shouldIgnorePointerDown?.(e)) return;
    if (stopPropagationOnMouseDown) e.stopPropagation();

    activePointerId = e.pointerId;
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    pointerMoved = false;

    try {
      element.setPointerCapture?.(e.pointerId);
    } catch {
      // no-op: pointer capture is best-effort only
    }

    e.preventDefault();
  });

  element.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') return;
    if (activePointerId !== e.pointerId) return;

    const dx = e.clientX - pointerStartX;
    const dy = e.clientY - pointerStartY;
    if (Math.hypot(dx, dy) > MOVE_THRESHOLD) {
      pointerMoved = true;
      clearPressTimer();
    }
  });

  const clearPointerState = (e) => {
    if (e && e.pointerType === 'mouse') return;
    activePointerId = null;
    pointerMoved = false;
  };

  element.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') return;
    if (activePointerId !== e.pointerId) return;

    const shouldActivate = !pointerMoved && !shouldIgnorePointerDown?.(e);
    clearPressTimer();
    clearPointerState(e);

    if (shouldActivate) {
      onPress(e);
    }
  });

  element.addEventListener('pointercancel', (e) => {
    clearPressTimer();
    clearPointerState(e);
  });

  element.addEventListener('lostpointercapture', clearPressTimer);
}

// ============================================
// 22. POST CARD COMPOSITION
// ============================================
function buildPostCard(post, user) {
  const card = document.createElement('div');
  card.className = 'post-card';
  card.dataset.postId = post.id;
  const canEditThisPost = canCurrentUserEditPost(post);
  const isSelected = isEditPostSelected(post.id);

  const idx = (buildPostCard._indexCounter || 0);
  buildPostCard._indexCounter = idx + 1;

  const { x, y } = normalizePostPosition(post, idx);

  card.style.left = `${x}px`;
  card.style.top = `${y}px`;
  applyCardScale(card, getStoredPostScale(post.id));
  card.dataset.lod = 'near';

  const mediaState = getPostCardMediaState(post);

  const content = document.createElement('div');
  content.className = 'post-card-content';

  const contentConfig = getPostCardContentConfig(post, mediaState);
  content.classList.add(...contentConfig.classes);
  if (contentConfig.cardClasses?.length) {
    card.classList.add(...contentConfig.cardClasses);
  }
  content.innerHTML = contentConfig.html;
  applyImageRuntimeDefaults(content);
  contentConfig.onRender?.(content, card);

  if (
  content.classList.contains('post-layout-title-visual-text') ||
  content.classList.contains('post-layout-title-text') ||
  content.classList.contains('post-layout-visual-text') ||
  content.classList.contains('post-layout-text')
) {
  const bodyEl = content.querySelector('.post-body');
  if (bodyEl && !bodyEl.classList.contains('post-body-external-link')) {
    const text = bodyEl.textContent.trim();
    if (text.length >= 35) {
      content.classList.add('is-long-text');
      trapScrollInside(bodyEl);
    }
  }
}

  if (!editMode) {
    const titleEl = content.querySelector('.post-title');
    const titleTrackEl = content.querySelector('.post-title-track');
    applyMarqueeIfNeeded(titleEl, titleTrackEl);

    const fileLineEl = content.querySelector('.post-fileline');
    const fileLineTrackEl = content.querySelector('.post-fileline-track');
    applyMarqueeIfNeeded(fileLineEl, fileLineTrackEl, '   ·   ');

    const fileListEl = content.querySelector('.post-filelist');
    const fileListTrackEl = content.querySelector('.post-filelist-track');
    applyMarqueeIfNeeded(fileListEl, fileListTrackEl, '   +   ');
  }

  wirePreviewVideoControls(content, { freezeMotion: shouldHardFreezeMotion() });
  wireAudioPreviewControls(content);
  wireFileDownloadControls(content);
  wireMultiFileDownloadControls(content, post);
  wireYouTubePreviewControls(content, { disableInteraction: editMode });
  wireMultiVisualHoverPreview(content, post, { disableInteraction: editMode });

  card.appendChild(content);

  const footer = document.createElement('div');
  footer.className = 'post-footer';

  const pfpSrc = resolvePfpUrl(user);


      if (editMode && canEditThisPost) {
    footer.innerHTML = `
      <img class="post-footer-pfp" src="${pfpSrc}" alt="" data-user-id="${post.user_id}" data-avatar="1" loading="lazy" decoding="async" style="cursor:pointer;">
      <span class="post-footer-username"><span class="post-footer-username-track">${user?.username || 'unknown'}</span></span>
      <span class="post-footer-category"><span class="post-footer-category-track">${post.category || 'none'}</span></span>
    `;

    const editChrome = document.createElement('div');
    editChrome.className = 'post-edit-chrome';
    editChrome.innerHTML = `
      <div class="post-edit-top-actions" aria-label="post edit actions">
        <button class="post-edit-button post-edit-button-thread ${String(activeThreadSourcePostId) === String(post.id) ? 'active' : ''}" type="button" title="thread">𓍯</button>
        <button class="post-edit-button post-edit-button-edit" type="button" title="edit">☰</button>
        <button class="post-edit-button post-edit-button-move" type="button" title="move">𖦏</button>
      </div>
      <button class="post-edit-button post-edit-button-delete" type="button" title="delete">x</button>
    `;
    card.appendChild(editChrome);

    const threadBtn = editChrome.querySelector('.post-edit-button-thread');
    const editBtn = editChrome.querySelector('.post-edit-button-edit');
    const moveBtn = editChrome.querySelector('.post-edit-button-move');
    const deleteBtn = editChrome.querySelector('.post-edit-button-delete');

    moveBtn?.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();

      const selectedPosts = getSelectedEditablePosts();
      const canUseBulkMove = isEditPostSelected(post.id) && selectedPosts.length > 1;
      if (canUseBulkMove) {
        startBulkPlacement(selectedPosts, e);
        return;
      }

      startPlacement(post, card, e);
    });

    moveBtn?.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
    });

    moveBtn?.addEventListener('click', (e) => {
      if (e.detail !== 0) return;
      e.stopPropagation();
      e.preventDefault();

      const syntheticEvent = window.__lastMouseEventForPlacement || { clientX: 200, clientY: 200 };
      const selectedPosts = getSelectedEditablePosts();
      const canUseBulkMove = isEditPostSelected(post.id) && selectedPosts.length > 1;
      if (canUseBulkMove) {
        startBulkPlacement(selectedPosts, syntheticEvent);
        return;
      }

      startPlacement(post, card, window.__lastMouseEventForPlacement || { clientX: 200, clientY: 200 });
    });

    editBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditForm(post);
    });

    threadBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();

      const selectedIds = getSelectedEditablePostIds();
      const canUseBulkThread = isEditPostSelected(post.id) && selectedIds.length > 1;
      if (canUseBulkThread) {
        const targetIds = selectedIds.filter((id) => String(id) !== String(post.id));
        await toggleThreadLinksFromSource(post.id, targetIds);
        activeThreadSourcePostId = null;
        return;
      }

      activeThreadSourcePostId = String(activeThreadSourcePostId) === String(post.id)
        ? null
        : String(post.id);
      await loadPosts();
    });

    deleteBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();

      const selectedIds = getSelectedEditablePostIds();
      const canUseBulkDelete = isEditPostSelected(post.id) && selectedIds.length > 1;
      if (canUseBulkDelete) {
        await handleDeletePosts(selectedIds);
        return;
      }

      await handleDeletePost(post.id);
    });

  } else {
    footer.innerHTML = `
    <img class="post-footer-pfp" src="${pfpSrc}" alt="" data-user-id="${post.user_id}" data-avatar="1" loading="lazy" decoding="async" style="cursor:pointer;">
    <span class="post-footer-username post-footer-filter-btn"><span class="post-footer-username-track">${user?.username || 'unknown'}</span></span>
    <span class="post-footer-category post-footer-filter-btn"><span class="post-footer-category-track">${post.category || 'none'}</span></span>
  `;

    const usernameEl = footer.querySelector('.post-footer-username');
    if (!editMode && usernameEl && user?.id) {
      usernameEl.addEventListener('click', (e) => {
        e.stopPropagation();
        activeUserFilter = (activeUserFilter === user.id) ? null : user.id;
        loadPosts();
      });
    }

    const categoryEl = footer.querySelector('.post-footer-category');
    if (!editMode && categoryEl) {
      categoryEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const isNone = post.category == null;
        const nextFilter = isNone ? NONE_CATEGORY_FILTER : post.category;
        activeCategoryFilter = (activeCategoryFilter === nextFilter) ? null : nextFilter;
        loadPosts();
      });
    }
  }

  applyImageRuntimeDefaults(footer);

  const pfpEl = footer.querySelector('.post-footer-pfp');
  if (!editMode) {
    attachLongPress(pfpEl, () => openProfileModal(post.user_id), {
      duration: 400,
      stopPropagationOnMouseDown: true
    });
  }

  card.appendChild(footer);

  const lodBadge = document.createElement('div');
  lodBadge.className = 'post-lod-badge';
  lodBadge.textContent = String(post.title || post.file_name || post.category || 'post').slice(0, 52);
  card.appendChild(lodBadge);

  if (editMode && canEditThisPost) {
    const resizeHandle = document.createElement('button');
    resizeHandle.type = 'button';
    resizeHandle.className = 'post-resize-handle post-edit-button width-right';
    resizeHandle.title = 'drag left/right to resize width';
    resizeHandle.textContent = '↔';
    resizeHandle.addEventListener('mousedown', (e) => beginPostResize(e, card, post.id));
    card.appendChild(resizeHandle);
  }

  if (editMode && activeThreadSourcePostId) {
    const postId = String(post.id);
    const sourceId = String(activeThreadSourcePostId);
    if (postId === sourceId) {
      card.classList.add('post-card-thread-source');
    } else if (findExistingLinkRecord(sourceId, postId, lastLoadedLinks)) {
      card.classList.add('post-card-thread-linked');
    }
  }

  if (editMode && isSelected) {
    card.classList.add('post-card-selected');
  }

  if (!editMode) {
    const categoryEl = card.querySelector('.post-footer-category');
    const categoryTrackEl = card.querySelector('.post-footer-category-track');
    applyMarqueeIfNeeded(categoryEl, categoryTrackEl);

    const usernameEl = card.querySelector('.post-footer-username');
    const usernameTrackEl = card.querySelector('.post-footer-username-track');
    applyMarqueeIfNeeded(usernameEl, usernameTrackEl, '\u00A0');
  }

  card.addEventListener('click', async (e) => {
    if (!editMode) return;

    if (
      e.target.closest('.post-footer-action') ||
      e.target.closest('.post-edit-button') ||
      e.target.closest('.post-footer-pfp') ||
      e.target.closest('.post-footer-username') ||
      e.target.closest('.post-footer-category') ||
      e.target.closest('.post-preview-mute-btn') ||
      e.target.closest('.post-file-preview-play') ||
      e.target.closest('.post-file-preview-download-btn') ||
      e.target.closest('.post-file-preview-youtube-activate') ||
      e.target.closest('.post-resize-handle')
    ) {
      return;
    }

    if (canEditThisPost && e.ctrlKey) {
      e.stopPropagation();
      e.preventDefault();
      toggleEditPostSelection(post.id);
      await loadPosts();
      return;
    }

    if (!activeThreadSourcePostId) return;

    e.stopPropagation();

    const sourceId = String(activeThreadSourcePostId);
    const targetId = String(post.id);
    if (sourceId === targetId) return;

    await toggleThreadLinkBetweenPosts(sourceId, targetId);
  });

  attachLongPress(card, () => openPostDetailModal(post, user), {
    duration: 400,
    shouldIgnorePointerDown: (e) => Boolean(
      e.target.closest('.post-edit-button') ||
      e.target.closest('.post-footer-pfp') ||
      e.target.closest('.post-footer-username') ||
      e.target.closest('.post-footer-category') ||
      e.target.closest('.post-footer-action') ||
      e.target.closest('.post-resize-handle') ||
      e.target.closest('.post-preview-mute-btn') ||
      e.target.closest('.post-file-preview-play') ||
      e.target.closest('.post-file-preview-download-btn')
    ),
    shouldIgnoreMouseDown: (e) => {
      if (isPlacing || isBulkPlacing) return true;
      return Boolean(
        e.target.closest('.post-edit-button') ||
        e.target.closest('.post-footer-pfp') ||
        e.target.closest('.post-footer-username') ||
        e.target.closest('.post-footer-category') ||
        e.target.closest('.post-footer-action') ||
        e.target.closest('.post-resize-handle') ||
        e.target.closest('.post-preview-mute-btn') ||
        e.target.closest('.post-file-preview-play') ||
        e.target.closest('.post-file-preview-download-btn') ||
        e.target.closest('.post-file-preview-youtube-activate')
      );
    }
  });

  return card;
}

// ============================================
// 23. GLOBAL EVENT WIRING
// ============================================

function initializeEventListeners() {
  const closestFromEventTarget = (target, selector) => {
    if (!target) return null;
    if (target instanceof Element) return target.closest(selector);
    if (target.nodeType === Node.TEXT_NODE) return target.parentElement?.closest(selector) || null;
    return null;
  };

  const recordPlacementPointer = (e) => {
    window.__lastMouseEventForPlacement = e;
  };

  window.addEventListener('mousemove', recordPlacementPointer);
  window.addEventListener('pointermove', recordPlacementPointer);
  window.addEventListener('pointerdown', recordPlacementPointer);

  initPdResize();

  const canvasViewport = document.getElementById('canvasViewport');
  let activePanPointerId = null;
  let panStartPointerX = 0;
  let panStartPointerY = 0;
  let panStartPointerOffsetX = 0;
  let panStartPointerOffsetY = 0;

  const beginPointerPan = (e) => {
    if (isPlacing || isBulkPlacing) return;
    if (e.target.closest('.post-card')) return;
    if (e.target.closest('#linkLayer')) return;

    if (activeLinkTreeRootPostId) {
      activeLinkTreeRootPostId = null;
      loadPosts();
      return;
    }

    activePanPointerId = e.pointerId;
    panStartPointerX = e.clientX;
    panStartPointerY = e.clientY;
    panStartPointerOffsetX = canvasOffsetX;
    panStartPointerOffsetY = canvasOffsetY;

    try {
      canvasViewport.setPointerCapture?.(e.pointerId);
    } catch {
      // best effort only
    }

    return true;
  };

  const updatePointerPan = (e) => {
    if (activePanPointerId !== e.pointerId) return;
    const dx = e.clientX - panStartPointerX;
    const dy = e.clientY - panStartPointerY;
    canvasOffsetX = panStartPointerOffsetX + dx;
    canvasOffsetY = panStartPointerOffsetY + dy;
    applyCanvasTransform();
  };

  const endPointerPan = (e) => {
    if (e && activePanPointerId !== null && e.pointerId !== activePanPointerId) return;
    activePanPointerId = null;
  };

  // Canvas pan controls
  canvasViewport.addEventListener('mousedown', (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panStartOffsetX = canvasOffsetX;
    panStartOffsetY = canvasOffsetY;
  });

  canvasViewport.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    if (beginPointerPan(e)) {
      e.preventDefault();
    }
  });

  // Background drag pan in view mode
  canvasViewport.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (isPlacing || isBulkPlacing) return;
    if (e.target.closest('.post-card')) return;
    if (e.target.closest('#linkLayer')) return;

    if (activeLinkTreeRootPostId) {
      activeLinkTreeRootPostId = null;
      loadPosts();
      return;
    }

    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panStartOffsetX = canvasOffsetX;
    panStartOffsetY = canvasOffsetY;
  });

  canvasViewport.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') return;
    updatePointerPan(e);
  });

  canvasViewport.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') return;
    endPointerPan(e);
  });

  canvasViewport.addEventListener('pointercancel', (e) => {
    if (e.pointerType === 'mouse') return;
    endPointerPan(e);
  });

  window.addEventListener('mousemove', (e) => {
    if (resizingPostState) {
      updatePostResize(e);
      return;
    }
    if (!isPanning) return;
    const dx = e.clientX - panStartX;
    const dy = e.clientY - panStartY;
    canvasOffsetX = panStartOffsetX + dx;
    canvasOffsetY = panStartOffsetY + dy;
    applyCanvasTransform();
  });

  window.addEventListener('mouseup', () => {
    endPostResize();
    isPanning = false;
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 1) isPanning = false;
  }); 

  window.addEventListener('mousemove', (e) => {
    if (isBulkPlacing) {
      updateBulkPlacementPosition(e);
      return;
    }
    if (isPlacing) updatePlacementPosition(e);
  });

  window.addEventListener('mousedown', async (e) => {
    if (isBulkPlacing) {
      if (e.button !== 0) return;
      await tryDropBulkPlacement();
      return;
    }

    if (!isPlacing) return;
    if (e.button !== 0) return;
    await tryDropPlacement(e);
  });

  document.addEventListener('click', async (e) => {
    const mentionEl = closestFromEventTarget(e.target, '.mention-token-link');
    if (!mentionEl) return;

    const userId = mentionEl.dataset.userId;
    if (!userId) return;

    e.preventDefault();
    e.stopPropagation();
    await openProfileModal(userId);
  });

  canvasViewport.addEventListener('auxclick', (e) => {
    if (e.button === 1) e.preventDefault();
  });

  // Canvas context menu gestures
    (canvasViewport || mainPageContainer).addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (isPlacing || isBulkPlacing) return;

    const now = Date.now();
    const timeSince = now - lastRightClick;
    lastRightClick = now;

    const isFormOpen = postFormOverlay.style.display === 'flex';

    if (timeSince < DOUBLE_CLICK_THRESHOLD) {
      lastRightClick = 0;
      closePostForm();
      toggleEditMode();
      return;
    }

    // if right-clicked on a post, next created post links to it
    const clickedCard = e.target.closest('.post-card');
    pendingLinkPostId = clickedCard ? clickedCard.dataset.postId : null;

    setTimeout(() => {
      if (lastRightClick !== now) return;

      if (isFormOpen) {
        closePostForm();
        return;
      }

      if (!editMode) {
        openPostForm();
      }
    }, DOUBLE_CLICK_THRESHOLD);
  });

  // Profile modal controls
  document.getElementById('profileClose').addEventListener('click', closeProfileModal);


  document.getElementById('profileSaveBtn').addEventListener('click', saveProfileChanges);

  // Post detail modal controls
  const pdVisualFullscreenBtn = document.getElementById('pdVisualFullscreenBtn');
  const pdCtxDownloadFile = document.getElementById('pdCtxDownloadFile');
  const pdCtxDownloadAll = document.getElementById('pdCtxDownloadAll');
  const pdFileContextMenu = document.getElementById('pdFileContextMenu');
  const postSpellContextMenu = document.getElementById('postSpellContextMenu');
  const postSpellReplaceBtn = document.getElementById('postSpellReplaceBtn');
  const postSpellIgnoreBtn = document.getElementById('postSpellIgnoreBtn');
  const postSpellIgnoreAllBtn = document.getElementById('postSpellIgnoreAllBtn');

  if (pdVisualFullscreenBtn) {
    pdVisualFullscreenBtn.addEventListener('click', () => {
      togglePdFullscreen();
    });
  }

  if (pdCtxDownloadFile) {
    pdCtxDownloadFile.addEventListener('click', () => {
      const file = pdContextMenuState.file;
      if (file?.url) {
        triggerFileDownload(file.url, file.name || 'download');
      }
      hidePdFileContextMenu();
    });
  }

  if (pdCtxDownloadAll) {
    pdCtxDownloadAll.addEventListener('click', async () => {
      const files = pdContextMenuState.files || [];
      for (const file of files) {
        if (file?.url) {
          triggerFileDownload(file.url, file.name || 'download');
          await new Promise(r => setTimeout(r, 100));
        }
      }
      hidePdFileContextMenu();
    });
  }

  document.addEventListener('click', (e) => {
    if (!pdFileContextMenu) return;
    if (e.target.closest('#pdFileContextMenu')) return;
    if (pdFileContextMenu.classList.contains('show')) {
      hidePdFileContextMenu();
    }
  });

  if (pdFileContextMenu) {
    pdFileContextMenu.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  if (postSpellReplaceBtn) {
    postSpellReplaceBtn.addEventListener('click', () => {
      if (!postSpellMenuState.suggestion) {
        hidePostSpellMenu();
        return;
      }

      if (postSpellMenuState.tokenEl) {
        replaceSpellTokenText(postSpellMenuState.tokenEl, postSpellMenuState.suggestion);
        postText?.focus();
        schedulePostTextMentionRefresh();
      } else if (
        postSpellMenuState.fieldEl
        && postSpellMenuState.rangeStart >= 0
        && postSpellMenuState.rangeEnd > postSpellMenuState.rangeStart
      ) {
        const field = postSpellMenuState.fieldEl;
        const currentValue = String(field.value || '');
        const nextValue =
          currentValue.slice(0, postSpellMenuState.rangeStart)
          + postSpellMenuState.suggestion
          + currentValue.slice(postSpellMenuState.rangeEnd);
        field.value = nextValue;
        const caret = postSpellMenuState.rangeStart + postSpellMenuState.suggestion.length;
        field.setSelectionRange?.(caret, caret);
        renderPlainFieldSpellDecoration(field);
      }

      hidePostSpellMenu();
    });
  }

  if (postSpellIgnoreBtn) {
    postSpellIgnoreBtn.addEventListener('click', () => {
      if (!postSpellMenuState.key) {
        hidePostSpellMenu();
        return;
      }

      if (postSpellMenuState.tokenEl) {
        postSpellIgnoreOne.add(postSpellMenuState.key);
        replaceSpellTokenText(postSpellMenuState.tokenEl, postSpellMenuState.tokenEl.textContent || '');
        postText?.focus();
      } else if (postSpellMenuState.fieldEl) {
        const ignoreSet = getPostSpellFieldIgnoreSet(postSpellMenuState.fieldEl);
        ignoreSet.add(postSpellMenuState.key);
        renderPlainFieldSpellDecoration(postSpellMenuState.fieldEl);
      }

      hidePostSpellMenu();
    });
  }

  if (postSpellIgnoreAllBtn) {
    postSpellIgnoreAllBtn.addEventListener('click', () => {
      if (!postSpellMenuState.normalizedWord) {
        hidePostSpellMenu();
        return;
      }

      const activeField = postSpellMenuState.fieldEl;
      postSpellIgnoreAll.add(postSpellMenuState.normalizedWord);
      hidePostSpellMenu();
      schedulePostTextMentionRefresh();
      if (activeField) {
        renderPlainFieldSpellDecoration(activeField);
      }
    });
  }

  postSpellContextMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  postSpellContextMenu?.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pdFileContextMenu?.classList.contains('show')) {
      hidePdFileContextMenu();
    }
    if (e.key === 'Escape') {
      hidePostSpellMenu();
    }
  });

  document.getElementById('profileCoverInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    newProfileCoverFile = file;
    const coverImg = document.getElementById('profileCoverImg');
    coverImg.src           = URL.createObjectURL(file);
    coverImg.style.display = 'block';
    document.getElementById('profileCoverPlaceholder').style.display = 'none';
  });

  document.getElementById('profilePfpInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    newProfilePfpFile = file;
    const pfpWidget = document.getElementById('profilePfpWidget');
    pfpWidget.innerHTML = '';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.style.cssText = 'width:60px;height:60px;object-fit:cover;display:block;';
    pfpWidget.appendChild(img);
  });

  // Canvas wheel zoom
  canvasViewport.addEventListener('wheel', (e) => {
    e.preventDefault();

    const delta = normalizeWheelDelta(e);
    const zoomFactor = Math.exp(-delta * ZOOM_SENSITIVITY);

    const oldScale = canvasScale;
    let newScale = oldScale * zoomFactor;
    newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    if (newScale === oldScale) return;

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    const before = viewportPointToCanvasPoint(mouseX, mouseY);

    canvasScale = newScale;

    canvasOffsetX = mouseX - before.x * canvasScale;
    canvasOffsetY = mouseY - before.y * canvasScale;

    applyCanvasTransform();
  }, { passive: false });

  postCancelBtn.addEventListener('click', maybeClosePostForm);

  postText?.addEventListener('keydown', handlePostTextKeydown);
  postText?.addEventListener('paste', handlePostTextPaste);
  postText?.addEventListener('input', schedulePostTextMentionRefresh);
  postText?.addEventListener('compositionend', schedulePostTextMentionRefresh);
  const openPostTextSpellMenu = (e) => {
    const misspelled = closestFromEventTarget(e.target, '.spellcheck-token');
    if (!misspelled) {
      hidePostSpellMenu();
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    showPostSpellMenu(e.clientX + 8, e.clientY + 8, misspelled);
  };

  postText?.addEventListener('click', openPostTextSpellMenu);
  postText?.addEventListener('contextmenu', openPostTextSpellMenu);
  postText?.addEventListener('blur', () => {
    const activeEl = document.activeElement;
    if (activeEl && activeEl.closest && activeEl.closest('#postSpellContextMenu')) {
      return;
    }
    hidePostSpellMenu();
  });

  document.addEventListener('click', (e) => {
    if (!postSpellContextMenu?.classList.contains('show')) return;
    if (e.target.closest('#postSpellContextMenu')) return;
    if (e.target.closest('.spellcheck-token')) return;
    hidePostSpellMenu();
  });

  window.addEventListener('resize', hidePostSpellMenu);

   postCoverImageInput.addEventListener('change', () => {
    const file = postCoverImageInput.files[0];
    if (file) {
      postCoverFileName.textContent = file.name;
    } else {
      postCoverFileName.textContent = editingPost?.cover_image_url
        ? 'replace cover'
        : 'choose cover image';
    }
  });


  postFileInput.addEventListener('change', async () => {
  const files = [...postFileInput.files];
  if (files.length === 0) {
    postFileName.textContent = 'choose file';
    postCoverImageLabel.style.display = 'none';
    postCoverImageInput.value = '';
    postCoverFileName.textContent = 'choose cover image';
    return;
  }

  postFileName.textContent = files.length === 1
    ? files[0].name
    : `${files.length} files`;

  // Show cover input if any file is non-visual
  const types = await Promise.all(files.map(f => getFileType(f)));
  const anyNonVisual = types.some(t => t !== 'image' && t !== 'video');

  if (anyNonVisual) {
    postCoverImageLabel.style.display = 'block';
  } else {
    postCoverImageLabel.style.display = 'none';
    postCoverImageInput.value = '';
    postCoverFileName.textContent = 'choose cover image';
  }
});

  postSubmitBtn.addEventListener('click', handlePostSubmit);

  addCategoryToggle.addEventListener('click', () => {
    closeCategorySelectDropdown();
    if (postCategoryPanel.style.display === 'none') {
      openCategoryEditorPanel();
      postCategoryInput.focus();
    } else {
      closeCategoryEditorPanel();
    }
  });

  postCategoryDisplay?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (postCategoryDropdown.style.display === 'none' || postCategoryDropdown.style.display === '') {
      closeCategoryEditorPanel();
      openCategorySelectDropdown();
    } else {
      closeCategorySelectDropdown();
    }
  });

  document.addEventListener('click', (e) => {
    if (!postCategoryDropdown) return;
    if (!e.target.closest('#postCategoryCustom')) {
      closeCategorySelectDropdown();
    }
  });

  postCategoryPanelClose?.addEventListener('click', closeCategoryEditorPanel);
  postCategoryCreateBtn?.addEventListener('click', handleAddCategory);

  postCategoryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCategory();
    }
  });

  postCategoryList?.addEventListener('click', async (e) => {
    const button = e.target.closest('[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const categoryName = decodeURIComponent(button.dataset.categoryName || '');

    if (action === 'recolor') {
      const categoryRecord = categoryRecords.find(
        (record) => String(record?.name || '') === categoryName
      ) || null;
      const currentColor = getCategoryColorValue(categoryRecord) || getCategoryNetworkColor(categoryName, categoryRecord);
      openCategoryColorPicker(categoryName, currentColor, button);
      return;
    }

    if (action === 'delete') {
      closeCategoryColorPicker();
      await handleDeleteCategory(categoryName);
    }
  });

  postCategoryList?.addEventListener('dblclick', (e) => {
    const nameEl = e.target.closest('.post-form-category-name');
    if (!nameEl) return;

    const item = nameEl.closest('.post-form-category-item');
    const encodedName = item?.dataset.categoryName || '';
    const categoryName = decodeURIComponent(encodedName);
    if (!categoryName) return;

    editingCategoryName = categoryName;
    closeCategoryColorPicker();
    renderCategoryEditor();
  });

  postCategoryList?.addEventListener('keydown', async (e) => {
    const input = e.target.closest('.post-form-category-edit-input');

    if (!input) return;

    const categoryName = decodeURIComponent(input.dataset.categoryEditInput || '');

    if (e.key === 'Enter') {
      e.preventDefault();
      await handleRenameCategory(categoryName, input.value || '');
      return;
    }

    if (e.key === 'Escape') {
      editingCategoryName = null;
      renderCategoryEditor();
    }
  });

  postCategoryPanel?.addEventListener('click', (e) => {
    const pickerRoot = categoryColorPickerElements?.root;
    if (!pickerRoot || pickerRoot.style.display === 'none') return;

    const insidePicker = e.target.closest('.post-form-category-picker');
    const swatchButton = e.target.closest('.post-form-category-color-swatch');
    if (!insidePicker && !swatchButton) {
      closeCategoryColorPicker();
    }
  });


  logoutBtn?.addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      alert(`Logout failed: ${error.message}`);
      return;
    }
    window.location.href = './index.html';
  });

  postDeleteBtn.addEventListener('click', async () => {
  if (!editingPostId) return;
  await handleDeletePost(editingPostId);
  closePostForm();
});

  postDetailOverlay?.addEventListener('click', (e) => {
    if (e.target === postDetailOverlay) closePostDetailModal();
  });

  commentSubmitBtn?.addEventListener('click', submitComment);
  commentInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitComment();
    }
  });

  // Global keyboard shortcuts and dismiss behavior
  document.addEventListener('keydown', handleGlobalKeydown);

  document.getElementById('helpClose')?.addEventListener('click', closeHelpOverlay);

  const helpOverlay = document.getElementById('helpOverlay');
  helpOverlay?.addEventListener('click', (e) => {
    if (e.target === helpOverlay) {
      closeHelpOverlay();
    }
  });

  // Notification panel toggle
  notifBar.addEventListener('click', () => {
    if (editMode) return;
    const isOpen = notifPanel.classList.contains('open');
    if (isOpen) {
      closeNotificationsPanel();
    } else {
      openNotificationsPanel();
    }
  });

  window.addEventListener('beforeunload', persistUiStateNow);
  window.addEventListener('pagehide', persistUiStateNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      persistUiStateNow();
    }
  });

}




// ============================================
// 24. APP BOOTSTRAP
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Main page loaded');

  if (animationMode !== 'off') {
    setAutoFreezeActive(!isSuperFastStableConnection());
  } else {
    setAutoFreezeActive(false);
  }

  installPrettyAlerts({ baseUrl: import.meta.env.BASE_URL });
  initializePostTextSpellcheck();

  const canvasViewport = document.getElementById('canvasViewport');
  if (canvasViewport) {
    canvasViewport.style.opacity = '0';
    canvasViewport.style.filter = 'blur(8px)';
    canvasViewport.style.transition = 'opacity 200ms ease, filter 260ms ease';
  }

  const quickViewportState = readQuickViewportState();
  applyInitialViewportState(quickViewportState);
  applyCanvasTransform();

  applyBackgroundImage(DEFAULT_BG_URL);

  const session = await checkAuth();
  if (!session) return;

  await loadMentionUserMap();

  restoredUiState = readPersistedUiState();

  if (restoredUiState?.editMode) {
    editMode = true;
    mainPageContainer.classList.add('edit-mode');
  }

  if (restoredUiState) {
    activeUserFilter = restoredUiState.activeUserFilter || null;
    activeCategoryFilter = restoredUiState.activeCategoryFilter || null;
    activeLinkTreeRootPostId = restoredUiState.activeLinkTreeRootPostId || null;
  }

  applyInitialViewportState(restoredUiState);

  initializeEventListeners();
  await loadCategories();
  worldsFeature = initWorldsFeature({
    supabase,
    baseUrl: import.meta.env.BASE_URL,
    getCurrentUser: () => currentUser,
    getIsEditMode: () => editMode,
    getCategories: () => categoryRecords,
    onWorldCreated: async (world, options = {}) => {
      await loadPosts();
      await loadLinks();
      renderLinks(lastLoadedPosts, lastLoadedLinks);

      if (!options?.startPlacement || !world?.id) {
        return;
      }

      const worldCardEl = postCanvas?.querySelector(`.world-card[data-world-id="${world.id}"]`);
      if (!worldCardEl) {
        return;
      }

      await waitForLayoutStability();
      startPlacement(
        world,
        worldCardEl,
        window.__lastMouseEventForPlacement || { clientX: 200, clientY: 200 }
      );
    },
    onWorldDeleted: async () => {
      await loadPosts();
    },
    onEnterWorld: async (worldPayload) => {
      await setMusicWorldContext(worldPayload?.world || null, {
        autoplay: true,
        forceRestart: true
      });
      await scheduleWorldModeReload('enter', worldPayload);
    },
    onExitWorld: async () => {
      await setMusicWorldContext(null, {
        autoplay: true,
        forceRestart: true
      });
      await scheduleWorldModeReload('exit');
    },
    onOpenProfile: async (userId) => {
      await openProfileModal(userId);
    }
  });

  if (typeof window !== 'undefined') {
    window.optimizeMyWorldBackgrounds = async (options = {}) => {
      return worldsFeature?.optimizeExistingWorldBackgrounds?.(options);
    };
  }

  const bootWorldId = new URLSearchParams(window.location.search).get('world');
  await loadPosts();

  if (canvasViewport) {
    requestAnimationFrame(() => {
      canvasViewport.style.opacity = '1';
      canvasViewport.style.filter = 'blur(0px)';
    });
  }

  const deferredLinksPromise = Promise.resolve()
    .then(async () => {
      await loadLinks();
      renderLinks(lastLoadedPosts, lastLoadedLinks);
    })
    .catch((err) => console.error('Deferred links load failed:', err));

  const deferredNotificationsPromise = Promise.resolve()
    .then(() => loadNotifications())
    .catch((err) => console.error('Deferred notifications load failed:', err));

  await initMusic(currentUser, currentUserData);
  await setMusicWorldContext(activeWorldContext?.world || null, {
    autoplay: false,
    forceRestart: false
  });
  initAnimToggle();
  initThemeColorPicker();

  applyCanvasTransform();
  renderLinks(lastLoadedPosts, lastLoadedLinks);

  restoreInFlight = true;
  await restoreUiPanelsAndModals(restoredUiState);
  restoreInFlight = false;

  if (bootWorldId && worldsFeature?.openWorldById && !activeWorldContext?.world?.id) {
    await worldsFeature.openWorldById(bootWorldId);
  }

  initializeRealtimeRefresh();
  persistUiStateNow();

  scheduleCardLodRefresh();
  scheduleAutoFreezeRelease([deferredLinksPromise, deferredNotificationsPromise]);

  console.log('Main page ready');
});