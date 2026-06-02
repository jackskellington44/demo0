const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

function buildApiUrl(path, params) {
  const hasBase = API_BASE.length > 0;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = hasBase
    ? new URL(normalizedPath, `${API_BASE}/`)
    : new URL(normalizedPath, window.location.origin);

  if (params && typeof params === 'object') {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      url.searchParams.set(key, String(value));
    });
  }

  return hasBase ? url.toString() : `${url.pathname}${url.search}`;
}

function makeError(message, status, code, details) {
  return {
    message: message || 'Request failed',
    status: status || 500,
    code: code || null,
    details: details || null
  };
}

async function parseJsonResponse(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const err = payload?.error || {};
    return {
      data: null,
      error: makeError(err.message || response.statusText, response.status, err.code, err.details)
    };
  }

  if (payload?.error) {
    const err = payload.error;
    return {
      data: null,
      error: makeError(err.message, response.status, err.code, err.details)
    };
  }

  return {
    data: payload?.data ?? payload ?? null,
    error: null
  };
}

export async function apiRequest(path, { method = 'GET', body, token, headers = {} } = {}) {
  const finalHeaders = { ...headers };
  const init = {
    method,
    headers: finalHeaders,
    credentials: 'omit'
  };

  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  if (body !== undefined && body !== null) {
    finalHeaders['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(buildApiUrl(path), init);
    return parseJsonResponse(response);
  } catch (error) {
    return {
      data: null,
      error: makeError(error?.message || 'Network error', 0, 'NETWORK_ERROR', error)
    };
  }
}

export async function apiUpload(path, { fields = {}, fileField = 'file', file, token } = {}) {
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    formData.append(key, typeof value === 'string' ? value : JSON.stringify(value));
  });

  if (file) {
    formData.append(fileField, file);
  }

  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(buildApiUrl(path), {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'omit'
    });
    return parseJsonResponse(response);
  } catch (error) {
    return {
      data: null,
      error: makeError(error?.message || 'Network error', 0, 'NETWORK_ERROR', error)
    };
  }
}

export function getPublicObjectUrl(bucket, objectPath) {
  return buildApiUrl('/api/storage/object', {
    bucket,
    path: objectPath
  });
}
