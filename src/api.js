const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const RETRY_DELAY_MS = 1000;
const MAX_RETRIES = 1;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeoutAndRetry(url, options = {}, timeoutMs = 30000) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const requestOptions = { ...options, signal: controller.signal };

    try {
      return await fetch(url, requestOptions);
    } catch (err) {
      const isAbort = err?.name === 'AbortError';
      const isLastAttempt = attempt === MAX_RETRIES;
      if (isAbort || isLastAttempt) throw err;
      await delay(RETRY_DELAY_MS);
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw new Error('Request failed');
}

// ─── Token helpers ─────────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem('auth_token');
}

function setSession(token, user) {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_user', JSON.stringify(user));
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: 'Bearer ' + token } : {};
}

// ─── Low-level fetch wrapper ───────────────────────────────────────────────────

async function apiFetch(path, options = {}, timeoutMs = 30000) {
  try {
    const res = await fetchWithTimeoutAndRetry(`${API_BASE}${path}`, options, timeoutMs);
    let json;
    try {
      json = await res.json();
    } catch {
      return { data: null, error: `Request failed with status ${res.status}` };
    }
    if (!res.ok) {
      return { data: null, error: json.error || `Request failed with status ${res.status}` };
    }
    return json;
  } catch (err) {
    return { data: null, error: err.message };
  }
}

// ─── Shared helpers used by supabase-config.js ────────────────────────────────

export async function apiRequest(path, { method = 'GET', token, body } = {}, timeoutMs = 30000) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  try {
    const res = await fetchWithTimeoutAndRetry(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }, timeoutMs);
    let json;
    try { json = await res.json(); } catch { json = {}; }
    if (!res.ok) return { data: null, error: json.error || `Request failed with status ${res.status}` };
    return json;
  } catch (err) {
    return { data: null, error: err.message };
  }
}

export async function apiUpload(path, { token, fields = {}, file } = {}) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  if (file) formData.append('file', file);
  const headers = {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  try {
    const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: formData });
    let json;
    try { json = await res.json(); } catch { json = {}; }
    if (!res.ok) return { data: null, error: json.error || `Request failed with status ${res.status}` };
    return json;
  } catch (err) {
    return { data: null, error: err.message };
  }
}

export function getPublicObjectUrl(bucket, path) {
  return `${API_BASE}/api/storage/public/${encodeURIComponent(bucket)}/${path}`;
}

// ─── API client ────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    signUp: async ({ username, password, pfp }) => {
      const result = await apiFetch('/auth/signup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password, pfp }),
      });
      if (result.data?.token) {
        setSession(result.data.token, result.data.user);
      }
      return result;
    },

    signIn: async ({ username, password }) => {
      const result = await apiFetch('/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      });
      if (result.data?.token) {
        setSession(result.data.token, result.data.user);
      }
      return result;
    },

    signOut: async () => {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    },

    getUser: async () => {
      const token = getToken();
      if (!token) return { data: null, error: 'Not authenticated' };
      return apiFetch('/auth/me', {
        headers: { ...authHeaders() },
      });
    },

    uploadPfp: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiFetch('/auth/upload-pfp', {
        method:  'POST',
        headers: { ...authHeaders() },
        body:    formData,
      });
    },
  },

  worlds: {
    getTheme: async (worldId) => {
      return apiFetch(`/worlds/${encodeURIComponent(worldId)}/theme`);
    },
  },

  users: {
    getByUsername: async (username) => {
      return apiFetch(`/users?username=${encodeURIComponent(username)}`);
    },

    getById: async (id) => {
      return apiFetch(`/users/${encodeURIComponent(id)}`);
    },
  },
};
