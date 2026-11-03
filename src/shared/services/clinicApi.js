async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const responseText = await response.text();
  let body = {};
  try { body = responseText ? JSON.parse(responseText) : {}; } catch { /* Keep non-JSON proxy errors from hiding the HTTP status. */ }
  if (!response.ok) {
    if (response.status === 401 && path.startsWith('/api/admin/') && body.code === 'ADMIN_SESSION_REQUIRED') window.dispatchEvent(new Event('admin-auth-expired'));
    const fallback = response.status ? `The request failed (HTTP ${response.status}).` : 'The request could not be completed.';
    throw Object.assign(new Error(body.error || body.message || fallback), { status: response.status, code: body.code });
  }
  return body;
}
const json = body => JSON.stringify(body);
export const clinicApi = {
  adminData: () => request('/api/admin/data'),
  getPatientAssessments: patientId => request(`/api/admin/data/patients/${encodeURIComponent(patientId)}/assessments`),
  importLegacy: data => request('/api/admin/data/import-legacy', { method: 'POST', body: json(data) }),
  create: (resource, record) => request(`/api/admin/data/${resource}`, { method: 'POST', body: json(record) }),
  update: (resource, id, updates) => request(`/api/admin/data/${resource}/${encodeURIComponent(id)}`, { method: 'PATCH', body: json(updates) }),
  remove: (resource, id) => request(`/api/admin/data/${resource}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  action: (resource, action, payload = {}) => request(`/api/admin/data/actions/${resource}`, { method: 'POST', body: json({ action, ...payload }) }),
  recordPayment: (invoiceId, payment) => request(`/api/admin/data/invoices/${encodeURIComponent(invoiceId)}/payments`, { method: 'POST', body: json(payment) }),
};
export const patientPortalApi = {
  get: () => request('/api/patient/portal'),
  getAssessments: () => request('/api/patient/assessments'),
  deleteAssessment: assessmentId => request(`/api/patient/assessments/${encodeURIComponent(assessmentId)}`, { method: 'DELETE' }),
  validateAssessmentImage: image => request('/api/patient/assessments/validate-image', { method: 'POST', body: json(image) }),
  analyzeAssessment: assessment => request('/api/patient/assessments/analyze', { method: 'POST', body: json(assessment) }),
  saveAssessment: assessment => request('/api/patient/assessments', { method: 'POST', body: json(assessment) }),
  assessmentImageUrl: (assessmentId, imageId) => `/api/patient/assessments/${encodeURIComponent(assessmentId)}/images/${encodeURIComponent(imageId)}`,
  getMessages: () => request('/api/patient/messages'),
  sendMessage: message => request('/api/patient/messages', { method: 'POST', body: json({ message }) }),
  markMessagesRead: () => request('/api/patient/messages/read', { method: 'POST', body: json({}) }),
};
