const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(json?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function fetchJsonAuth(url, token, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetchJson(url, { ...options, headers });
}

export async function searchVideo(topic, language, opts = {}) {
  const url = new URL(`${API_BASE}/api/video/search`);
  url.searchParams.set('topic', topic);
  url.searchParams.set('language', language);
  if (opts?.max != null) url.searchParams.set('max', String(opts.max));
  if (opts?.webMax != null) url.searchParams.set('webMax', String(opts.webMax));
  if (opts?.spoken) url.searchParams.set('spoken', opts.spoken);
  if (opts?.spokenSecondary) url.searchParams.set('spokenSecondary', opts.spokenSecondary);
  if (opts?.section) url.searchParams.set('section', opts.section);
  return fetchJson(url.toString());
}

export async function getOembed(videoUrl) {
  const url = new URL(`${API_BASE}/api/video/oembed`);
  url.searchParams.set('url', videoUrl);
  return fetchJson(url.toString());
}

export async function generateQuiz(topic, language) {
  return fetchJson(`${API_BASE}/api/quiz/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, language })
  });
}

export async function predictLevel(payload) {
  return fetchJson(`${API_BASE}/api/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function scoreVideoEffectiveness(payload) {
  return fetchJson(`${API_BASE}/api/ml/video-effectiveness`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function searchImage(query, opts = {}) {
  const url = new URL(`${API_BASE}/api/images/search`);
  url.searchParams.set('query', query);
  if (opts?.fresh) url.searchParams.set('fresh', '1');
  return fetchJson(url.toString());
}

export async function getMe(token) {
  return fetchJsonAuth(`${API_BASE}/api/users/me`, token);
}

export async function saveProfile(token, profilePayload = {}) {
  return fetchJsonAuth(`${API_BASE}/api/users/profile`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profilePayload)
  });
}

export async function preRegister(payload = {}) {
  return fetchJson(`${API_BASE}/api/users/pre-register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function markVerified(token, payload = {}) {
  return fetchJsonAuth(`${API_BASE}/api/users/mark-verified`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function startSession(token, payload) {
  return fetchJsonAuth(`${API_BASE}/api/activity/sessions/start`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function completeSession(token, payload) {
  return fetchJsonAuth(`${API_BASE}/api/activity/sessions/complete`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function saveAttempt(token, payload) {
  return fetchJsonAuth(`${API_BASE}/api/activity/attempts`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function getProgressSummary(token) {
  return fetchJsonAuth(`${API_BASE}/api/progress/summary`, token);
}

export async function registerUsername(token, username, email) {
  return fetchJsonAuth(`${API_BASE}/api/users/register-username`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email })
  });
}

export async function resolveUsername(username) {
  return fetchJson(`${API_BASE}/api/users/resolve-username`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username })
  });
}

export async function authLogin(username, password) {
  return fetchJson(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
}

export async function authMe(token) {
  return fetchJsonAuth(`${API_BASE}/api/auth/me`, token);
}

export async function authChangePassword(username, oldPassword, newPassword) {
  return fetchJson(`${API_BASE}/api/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, oldPassword, newPassword })
  });
}

export async function authRequestPasswordReset(username) {
  return fetchJson(`${API_BASE}/api/auth/request-password-reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username })
  });
}

export async function authResetPassword(token, newPassword) {
  return fetchJson(`${API_BASE}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword })
  });
}

export async function authResetPasswordWithEmail(email, newPassword, username) {
  return fetchJson(`${API_BASE}/api/auth/reset-password-firebase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, newPassword, username })
  });
}
