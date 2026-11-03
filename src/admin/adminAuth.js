export const ADMIN_AUTH_SESSION_KEY = 'smile-clinic-admin-session-v2';

try {
  window.sessionStorage.removeItem('smile-clinic-admin-session');
  window.localStorage.removeItem('smile-clinic-admin-password');
  const legacyProfile = JSON.parse(window.localStorage.getItem('smile-clinic-admin-profile') || '{}');
  if (legacyProfile.photo && !window.localStorage.getItem('smile-clinic-admin-photo')) {
    window.localStorage.setItem('smile-clinic-admin-photo', legacyProfile.photo);
  }
  window.localStorage.removeItem('smile-clinic-admin-profile');
} catch { /* Browser storage may be unavailable in restricted contexts. */ }

function clearAdminHint() {
  try { window.sessionStorage.removeItem(ADMIN_AUTH_SESSION_KEY); }
  catch { /* Browser storage may be unavailable in restricted contexts. */ }
}

async function request(path, options = {}) {
  const response = await fetch(`/api/admin/auth/${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && (path === 'session' || body.code === 'ADMIN_SESSION_REQUIRED')) {
      clearAdminHint();
      window.dispatchEvent(new Event('admin-auth-expired'));
    }
    const error = new Error(body.error || 'The admin request could not be completed.');
    error.code = body.code;
    throw error;
  }
  return body;
}

export function isAdminAuthenticated() {
  try { return window.sessionStorage.getItem(ADMIN_AUTH_SESSION_KEY) === 'active'; }
  catch { return false; }
}

export async function authenticateAdmin(email, password) {
  const result = await request('login', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (result.mfaRequired) return result;
  try { window.sessionStorage.setItem(ADMIN_AUTH_SESSION_KEY, 'active'); }
  catch { throw new Error('This browser could not keep the sign-in session. Allow session storage and try again.'); }
  return result.admin;
}

export async function verifyAdminMfa(challengeToken, code) {
  const result = await request('verify-mfa', { method: 'POST', body: JSON.stringify({ challengeToken, code }) });
  try { window.sessionStorage.setItem(ADMIN_AUTH_SESSION_KEY, 'active'); }
  catch { throw new Error('This browser could not keep the sign-in session. Allow session storage and try again.'); }
  return result.admin;
}

export async function loadAdminSession() {
  const result = await request('session');
  try { window.sessionStorage.setItem(ADMIN_AUTH_SESSION_KEY, 'active'); }
  catch { throw new Error('This browser could not keep the sign-in session.'); }
  return result.admin;
}

export async function loadAdminActivity() {
  return request('activity');
}

export async function updateAdminProfile(profile) {
  return request('profile', { method: 'PUT', body: JSON.stringify(profile) });
}

export async function updateAdminPassword(passwords) {
  return request('password', { method: 'PUT', body: JSON.stringify(passwords) });
}

export async function signOutAdmin() {
  clearAdminHint();
  try { await request('logout', { method: 'POST', body: '{}' }); }
  catch { /* The local sign-out should still complete if the server is offline. */ }
}
