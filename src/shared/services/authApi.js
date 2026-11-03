async function request(path, options = {}) {
  const response = await fetch('/api/auth/' + path, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'The request could not be completed.');
    error.code = body.code;
    throw error;
  }
  return body;
}
export const authApi = {
  register: async data => { const result = await request('register', { method: 'POST', body: JSON.stringify(data) }); window.dispatchEvent(new Event('patient-auth-changed')); return result; },
  login: async data => { const result = await request('login', { method: 'POST', body: JSON.stringify(data) }); window.dispatchEvent(new Event('patient-auth-changed')); return result; },
  logout: async () => { const result = await request('logout', { method: 'POST' }); window.dispatchEvent(new Event('patient-auth-changed')); return result; },
  session: () => request('session'),
  updateProfile: data => request('profile', { method: 'PUT', body: JSON.stringify(data) }),
  forgotPassword: data => request('forgot-password', { method: 'POST', body: JSON.stringify(data) }),
  verifyResetCode: data => request('verify-reset-code', { method: 'POST', body: JSON.stringify(data) }),
  resetPassword: data => request('reset-password', { method: 'POST', body: JSON.stringify(data) }),
  verifyEmail: data => request('verify-email', { method: 'POST', body: JSON.stringify(data) }),
  resendVerification: data => request('resend-verification', { method: 'POST', body: JSON.stringify(data) }),
  saveRegistration: data => patientRequest('registration', { method: 'PUT', body: JSON.stringify(data) }),
};

async function patientRequest(path, options = {}) {
  const response = await fetch('/api/patient/' + path, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body;
}
export const appointmentApi = {
  availability: month => patientRequest('appointments/availability?month=' + encodeURIComponent(month)),
  create: data => patientRequest('appointments', { method: 'POST', body: JSON.stringify(data) }),
  list: () => patientRequest('appointments'),
};
