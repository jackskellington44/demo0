const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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

async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, options);
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
