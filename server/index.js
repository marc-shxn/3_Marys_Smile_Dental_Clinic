import process from 'node:process';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { randomBytes, randomUUID, randomInt, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { createReadStream, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, lstatSync, chmodSync, rmdirSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertProductionMailConfigured, sendEmail } from './email.js';
import './loadLocalEnv.js';
import { decryptTotpSecret, encryptionKey, matchingTotpStep } from './adminMfa.js';
import { createPatientChatExchange, handleAdminData, handlePatientPortalData, listPatientMessages, markPatientMessagesRead } from './clinicData.js';
import { createDatabase } from './database.js';
import { collectWorkflowDetections, runOralHealthWorkflow } from './roboflowWorkflow.js';
import { clinicTreatmentOptions, dentalProcedures } from '../src/shared/data/dentalServices.js';
import { CLINIC_CLOSE_HOUR, CLINIC_HOLIDAYS, CLINIC_OPEN_HOUR, CLINIC_OPEN_WEEKDAYS, CLINIC_SLOT_MINUTES, CLINIC_TIME_ZONE } from '../src/shared/data/clinicSchedule.js';

const here = dirname(fileURLToPath(import.meta.url));
const productionMode = process.env.NODE_ENV === 'production';
if (productionMode) process.umask(0o077);
const dataDir = resolve(process.env.UPLOADS_DIR || join(here, 'data'));
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
if (productionMode) chmodSync(dataDir, 0o700);
const db = createDatabase();
const schemaState = (await db.prepare("SELECT to_regclass('public.patient_accounts') AS patient_accounts").get());
if (!schemaState?.patient_accounts) throw new Error('Supabase schema is missing. Run npm run db:migrate before starting the backend.');
(await db.exec('DELETE FROM auth_sessions WHERE expires_at <= FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP))::bigint; DELETE FROM admin_sessions WHERE expires_at <= FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP))::bigint; DELETE FROM password_reset_tokens WHERE expires_at <= FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP))::bigint OR used_at IS NOT NULL; DELETE FROM email_verification_tokens WHERE expires_at <= FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP))::bigint OR used_at IS NOT NULL; DELETE FROM admin_mfa_challenges WHERE expires_at <= FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP))::bigint OR used_at IS NOT NULL;'));

if (productionMode) {
  assertProductionMailConfigured();
  encryptionKey();
}
const roboflowTestEndpoint = (() => {
  if (process.env.STAGING_TEST_MODE !== 'true') {
    if (process.env.ROBOFLOW_TEST_ENDPOINT) throw new Error('ROBOFLOW_TEST_ENDPOINT is permitted only when STAGING_TEST_MODE=true.');
    return '';
  }
  const endpoint = new URL(String(process.env.ROBOFLOW_TEST_ENDPOINT || ''));
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)) {
    throw new Error('Staging test inference must use an HTTP endpoint bound to loopback.');
  }
  return endpoint.toString();
})();
const port = Number(process.env.PORT || process.env.API_PORT || 8787);
const host = process.env.HOST || (productionMode ? '0.0.0.0' : '127.0.0.1');
const frontendDir = resolve(here, '..', 'dist');
if (productionMode && !existsSync(join(frontendDir, 'index.html'))) throw new Error('Production frontend build not found. Run npm run build before npm start.');
const sessionSeconds = 60 * 60 * 24 * 7;
const eventClients = new Set();
const patientMessageRateLimits = new Map();
const ASSESSMENT_CONSENT_VERSION = 'assessment-roboflow-workflow-v6';
const pendingAssessments = new Map();
const PENDING_ASSESSMENT_TTL = 15 * 60 * 1000;
const validatedAssessmentImages = new Map();
const VALIDATED_IMAGE_TTL = 15 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [token, pending] of pendingAssessments) if (pending.expiresAt <= now) pendingAssessments.delete(token);
  for (const [token, validated] of validatedAssessmentImages) if (validated.expiresAt <= now) validatedAssessmentImages.delete(token);
}, 60 * 1000).unref();
const ROBOFLOW_FINDING_GUIDANCE = [
  { match: /plaque/i, description: 'The model marked an area that may show plaque on this uploaded view.', recommendation: 'Brush gently for two minutes twice daily and clean between teeth each day.', educationTitle: 'What is plaque?', education: 'Plaque is a soft film of bacteria that forms on teeth. Regular brushing and cleaning between teeth help remove it.' },
  { match: /tartar|calculus/i, description: 'The model marked an area that may show hardened buildup on this uploaded view.', recommendation: 'Consider asking a dental professional whether a cleaning is appropriate.', educationTitle: 'What is tartar?', education: 'When plaque stays on teeth, it can harden into tartar. A dental professional can remove hardened deposits.' },
  { match: /gingiv|gum inflammation/i, description: 'The model marked a gum area for closer review; a photo cannot confirm inflammation.', recommendation: 'Keep the gumline clean and arrange a dental examination if redness, swelling, or bleeding continues.', educationTitle: 'Healthy gums', education: 'Gum appearance can vary with lighting and image angle. A dentist can assess gum health during an examination.' },
  { match: /discolor|stain/i, description: 'The model marked an area with a color difference in this image.', recommendation: 'Discuss persistent or changing discoloration with a dental professional.', educationTitle: 'Tooth color changes', education: 'Tooth color can be affected by lighting, staining, and other factors. A dentist can help identify the cause.' },
  { match: /cavit|caries|decay/i, description: 'The model marked an area that needs an in-person dental assessment; this image result is not a diagnosis.', recommendation: 'Please arrange a dental examination to have this area assessed by a licensed dentist.', educationTitle: 'Why an examination matters', education: 'Photos cannot confirm tooth decay. A dental professional may need an examination and other tests to assess a concern.' },
  { match: /missing tooth|tooth missing/i, description: 'The model marked a possible missing-tooth area; the photo and angle may affect this result.', recommendation: 'Ask a dentist to confirm the area and discuss suitable care options.', educationTitle: 'Missing teeth', education: 'Only a dental examination can confirm whether a tooth is missing and what care may be appropriate.' },
  { match: /fractur|broken tooth|cracked tooth/i, description: 'The model marked an area that may have a fracture; this needs in-person dental review.', recommendation: 'Arrange a dental examination, especially if the tooth is painful or sensitive.', educationTitle: 'Tooth fractures', education: 'A photo cannot show the full depth of a crack. A dentist can examine the tooth and recommend care.' },
  { match: /root remnant|retained root|root fragment/i, description: 'The model marked a possible root remnant that requires dental confirmation.', recommendation: 'Please arrange an in-person dental examination to review this area.', educationTitle: 'Root remnants', education: 'A visual model result cannot confirm a root remnant. A dental examination and possibly an X-ray may be needed.' },
  { match: /tooth wear|attrition|abrasion|erosion/i, description: 'The model marked a surface that may show tooth wear.', recommendation: 'Discuss persistent sensitivity or visible wear with a dental professional.', educationTitle: 'Tooth wear', education: 'Tooth wear may have several causes. A dentist can assess the pattern and suggest ways to protect the teeth.' },
  { match: /restored tooth|restoration|filling|crown/i, description: 'The model marked a possible dental restoration; this is not a check of its condition.', recommendation: 'Keep regular dental checkups so existing restorations can be reviewed.', educationTitle: 'Dental restorations', education: 'Fillings and crowns restore teeth. A dental professional should assess their fit and condition.' },
];
const FINDING_CATEGORIES = [
  ['Plaque', /plaque/i], ['Tartar', /tartar|calculus/i], ['Gingivitis', /gingiv|gum inflammation/i],
  ['Tooth Discoloration', /discolor|stain/i], ['Visible Cavity', /cavit|caries|decay/i],
  ['Missing Tooth', /missing tooth|tooth missing/i], ['Fractured Tooth', /fractur|broken tooth|cracked tooth/i],
  ['Restored Tooth', /restored tooth|restoration|filling|crown/i], ['Root Remnants', /root remnant|retained root|root fragment/i],
  ['Tooth Wear', /tooth wear|attrition|abrasion|erosion/i],
];
function canonicalFinding(label) { const normalized = String(label || '').replace(/[_-]+/g, ' ').trim(); return FINDING_CATEGORIES.find(([, pattern]) => pattern.test(normalized))?.[0] || normalized.slice(0, 100) || 'Possible finding'; }
function summarizeWorkflowOutput(value, key = '', depth = 0) {
  if (depth > 6) return '[maximum depth]';
  if (Array.isArray(value)) return { type: 'array', length: value.length, sample: value.slice(0, 5).map(item => summarizeWorkflowOutput(item, '', depth + 1)) };
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([childKey]) => !/(image|base64|url|visualization|overlay|mask|crop)/i.test(childKey))
      .slice(0, 25)
      .map(([childKey, childValue]) => [childKey, summarizeWorkflowOutput(childValue, childKey, depth + 1)]));
  }
  if (typeof value === 'string') return /^(class|class_name|label|finding|name|error|message)$/i.test(key) ? value.slice(0, 120) : `[string length=${value.length}]`;
  return value;
}
async function validateDentalImage(image) {
  const workflow = await runOralHealthWorkflow(image, roboflowTestEndpoint ? { endpoint: roboflowTestEndpoint } : {});
  const detections = collectWorkflowDetections(workflow.outputEntry);
  if (!detections.length && process.env.NODE_ENV !== 'production') {
    console.info('[Roboflow photo validation diagnostics]', JSON.stringify({
      angle: image.kind === 'teeth' ? image.angle : 'xray',
      workflowOutputNames: workflow.outputNames,
      workflowOutputSummary: summarizeWorkflowOutput(workflow.outputEntry),
      detections: [],
      validationResult: 'accepted_no_findings',
      note: 'The workflow returned a valid output with no finding detections. No findings do not establish that an image is non-dental or that teeth are healthy.',
    }));
  }
  return workflow;
}
function guidanceForFinding(label) {
  return ROBOFLOW_FINDING_GUIDANCE.find(item => item.match.test(label)) || {
    description: 'The model identified this label in the uploaded image. It needs confirmation by a dental professional.',
    recommendation: 'Ask a dental professional to review this finding during an examination.',
    educationTitle: 'About this image finding',
    education: 'Automated image labels can be affected by angle, focus, lighting, and the model’s training data.',
  };
}
async function analyzeOralHealthImages(images) {
  const perImage = [];
  for (let index = 0; index < images.length; index += 3) {
    const batch = await Promise.all(images.slice(index, index + 3).map(async (image, offset) => {
      const workflow = image.workflowResult || await validateDentalImage(image);
      const predictions = collectWorkflowDetections(workflow.outputEntry).map(prediction => ({
        ...prediction,
        label: canonicalFinding(prediction.label),
        rawLabel: prediction.label,
      }));
      return {
        image,
        imageIndex: index + offset,
        imageSize: { width: image.imageWidth, height: image.imageHeight },
        predictions,
        workflowOutputNames: workflow.outputNames,
      };
    }));
    perImage.push(...batch);
  }
  const findings = perImage.flatMap(({ image, imageIndex, imageSize, predictions }) => predictions.map(prediction => {
    const guidance = guidanceForFinding(prediction.label);
    return { ...prediction, imageIndex, kind: image.kind, angle: image.kind === 'teeth' ? image.angle : 'xray', fileName: image.name, imageSize, description: guidance.description };
  })).sort((a, b) => b.confidence - a.confidence);
  const uniqueRecommendations = [...new Set(findings.map(finding => guidanceForFinding(finding.label).recommendation))];
  const uniqueEducation = [...new Map(findings.map(finding => {
    const guidance = guidanceForFinding(finding.label);
    return [guidance.educationTitle, { title: guidance.educationTitle, body: guidance.education }];
  })).values()];
  const criticalLabel = findings.some(finding => /cavit|caries|decay|missing tooth|fractur|root remnant/i.test(finding.label));
  const riskLevel = criticalLabel ? 'High' : findings.length >= 1 ? 'Moderate' : null;
  const byAngle = perImage.map(({ image, imageIndex, imageSize, workflowOutputNames }) => ({ imageIndex, angle: image.kind === 'xray' ? 'xray' : image.angle, kind: image.kind, fileName: image.name, imageSize, workflowOutputNames, findings: findings.filter(finding => finding.imageIndex === imageIndex) }));
  const assessedAt = new Date().toISOString();
  const annotatedImages = byAngle.map(image => ({ imageIndex: image.imageIndex, angle: image.angle, kind: image.kind, fileName: image.fileName, imageSize: image.imageSize, detections: image.findings.filter(finding => finding.box).map(({ label, rawLabel, confidence, box }) => ({ label, rawLabel, confidence, box })) }));
  return {
    summary: findings.length ? `${findings.length} possible image ${findings.length === 1 ? 'finding was' : 'findings were'} returned for review.` : 'The uploaded photos were accepted, but the model returned no finding labels. This does not confirm that teeth are healthy or rule out an oral-health concern.',
    assessedAt,
    riskLevel,
    riskDescription: findings.length
      ? 'This preliminary level is based only on model labels and is not a clinical risk score or diagnosis.'
      : 'The model returned no finding labels, so a risk level could not be scored from these photos. This does not rule out an oral-health concern.',
    findings,
    byAngle,
    annotatedImages,
    recommendations: uniqueRecommendations.length ? uniqueRecommendations : ['Continue regular brushing and clean between teeth daily.', 'Keep routine dental visits and ask a dentist about any concerns.'],
    education: uniqueEducation,
    model: 'AI Oral Health Assessment vai-oral-health-assessment-1-yolo26s-t1 Logic workflow',
    limitations: 'Automated labels can be inaccurate and depend on photo quality, angle, lighting, and the model’s training data. A licensed dental professional must confirm any concern in person.',
  };
}
function patientChatAutoReply(message, patientName) {
  const text = String(message || '').toLocaleLowerCase();
  const firstName = String(patientName || 'there').trim().split(/\s+/)[0] || 'there';
  if (/\b(hi|hello|hey)\b/.test(text) && !/service|clinic|hours|appointment|book|address|contact|location/.test(text)) {
    return { kind: 'welcome', message: `Hello ${firstName}!\n\nWe’re glad you reached out to 3 Mary’s Smile Dental Clinic.\n\nYour message has been received, and our dental team will get back to you as soon as we’re available.` };
  }
  if (/service|procedure|treatment|offer/.test(text)) {
    const serviceList = dentalProcedures.map(procedure => `• ${procedure}`).join('\n');
    return { kind: 'faq', message: `Hello ${firstName}!\n\nOur dental services include:\n${serviceList}\n\nTell us which procedure you’re interested in, and our team can help with the next steps.` };
  }
  if (/where|address|location|located/.test(text)) {
    return { kind: 'faq', message: `Hello ${firstName}!\n\nYou can visit us at:\n#11 Block 01 Gumaok East, San Jose del Monte, Bulacan\n\nOpen the exact location in Google Maps:\nhttps://www.google.com/maps/search/?api=1&query=14.799310%2C121.068612` };
  }
  if (/hour|open|close|schedule.*clinic/.test(text)) {
    return { kind: 'faq', message: `Hello ${firstName}!\n\nClinic hours:\n9:00 AM–5:00 PM, Monday through Saturday.` };
  }
  if (/appointment|book|schedule/.test(text)) {
    return { kind: 'faq', message: `Hello ${firstName}!\n\nTo book an appointment, use the “Book an appointment” button on our website. Choose a procedure, then select an available date and time.\n\nWe’ll be glad to help if you have questions.` };
  }
  if (/contact|phone|call|email/.test(text)) {
    return { kind: 'faq', message: `Hello ${firstName}!\n\nPhone: 0906 240 8920\nEmail: bheca_austria17@yahoo.com\n\nWe’re open Monday through Saturday, 9:00 AM–5:00 PM.` };
  }
  return { kind: 'welcome', message: `Hello ${firstName}!\n\nWe’re glad you reached out to 3 Mary’s Smile Dental Clinic.\n\nWe’ve received your message, and our team will respond as soon as we’re available.` };
}
const notify = resource => {
  const payload = `event: clinic-data\ndata: ${JSON.stringify({ resource, updatedAt: new Date().toISOString() })}\n\n`;
  for (const client of eventClients) client.write(payload);
};
const json = (res, status, payload, headers = {}) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
    ...headers,
  });
  res.end(JSON.stringify(payload));
};
const assetMimeTypes = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp', '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
function serveFrontend(req, res, pathname) {
  if (!productionMode || !['GET', 'HEAD'].includes(req.method) || pathname === '/api' || pathname.startsWith('/api/')) return false;
  let decodedPath;
  try { decodedPath = decodeURIComponent(pathname); } catch { json(res, 400, { error: 'Invalid URL path.' }); return true; }
  const requestedPath = resolve(frontendDir, `.${decodedPath}`);
  const distRoot = frontendDir + sep;
  let filePath = requestedPath.startsWith(distRoot) && existsSync(requestedPath) && lstatSync(requestedPath).isFile()
    ? requestedPath
    : null;
  if (!filePath) {
    if (extname(decodedPath)) { json(res, 404, { error: 'Not found.' }); return true; }
    filePath = join(frontendDir, 'index.html');
  }
  const extension = extname(filePath).toLowerCase();
  const headers = {
    'Content-Type': assetMimeTypes[extension] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
    'Cache-Control': filePath.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-store',
  };
  if (req.method === 'HEAD') { res.writeHead(200, headers); res.end(); return true; }
  res.writeHead(200, headers);
  createReadStream(filePath).on('error', () => { if (!res.headersSent) json(res, 500, { error: 'The page could not be loaded.' }); else res.destroy(); }).pipe(res);
  return true;
}
const hashToken = token => createHash('sha256').update(token).digest('hex');
const normalizeEmail = value => String(value || '').trim().toLowerCase();
const stripControlChars = value => Array.from(String(value || '')).filter(character => {
  const code = character.charCodeAt(0);
  return !(code <= 31 || (code >= 127 && code <= 159));
}).join('');
const isGmailAddress = value => /^[^\s@]+@gmail\.com$/.test(normalizeEmail(value));
const formatPersonName = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, separator, letter) => `${separator}${letter.toUpperCase()}`);
const publicAccount = row => ({ id: row.account_id, patientNumber: row.patient_number || '', fullName: row.full_name, email: row.email, phone: row.phone || '' });
async function nextPatientNumber() {
  const rows = (await db.prepare("SELECT patient_number FROM patients WHERE patient_number LIKE 'PT-%'").all());
  let sequence = rows.reduce((highest, row) => Math.max(highest, Number(String(row.patient_number).slice(3)) || 0), 0) + 1;
  let candidate = `PT-${String(sequence).padStart(4, '0')}`;
  while ((await db.prepare('SELECT 1 FROM patients WHERE patient_number=?').get(candidate))) {
    sequence += 1;
    candidate = `PT-${String(sequence).padStart(4, '0')}`;
  }
  return candidate;
}
const clinicDateParts = date => {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
};
const clinicDateTime = (date, hour) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+08:00`);
const pad = value => String(value).padStart(2, '0');
const formatSlot = hour => {
  const period = hour < 12 ? 'AM' : 'PM';
  return { time: `${pad(hour)}:00`, label: `${pad(hour % 12 || 12)}:00 ${period}` };
};
const slotHours = Array.from({ length: Math.floor((CLINIC_CLOSE_HOUR - CLINIC_OPEN_HOUR) * 60 / CLINIC_SLOT_MINUTES) }, (_, index) => CLINIC_OPEN_HOUR + index * CLINIC_SLOT_MINUTES / 60);
const isValidClinicDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date) && (() => {
  const parts = clinicDateParts(date);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).toISOString().slice(0, 10) === date;
})();
const cookieExpiry = age => 'clinic_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + age + (process.env.NODE_ENV === 'production' ? '; Secure' : '');
const sessionCookie = token => 'clinic_session=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + sessionSeconds + (process.env.NODE_ENV === 'production' ? '; Secure' : '');
const adminCookieExpiry = age => 'clinic_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + age + (process.env.NODE_ENV === 'production' ? '; Secure' : '');
const adminSessionCookie = token => 'clinic_admin_session=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + sessionSeconds + (process.env.NODE_ENV === 'production' ? '; Secure' : '');
function readCookie(req, name) {
  const header = req.headers.cookie || '';
  const entry = header.split(';').map(value => value.trim()).find(value => value.startsWith(name + '='));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
}
async function readBody(req, maxBytes = 20000) {
  let raw = '';
  for await (const part of req) {
    raw += part;
    if (raw.length > maxBytes) throw Object.assign(new Error('Request is too large.'), { status: 413 });
  }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw Object.assign(new Error('Invalid JSON request.'), { status: 400 }); }
}
function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}
function verifyHash(value, salt, expected) {
  const actual = scryptSync(value, salt, 64);
  const wanted = Buffer.from(expected, 'hex');
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}
async function accountForSession(req) {
  const token = readCookie(req, 'clinic_session');
  if (!token) return null;
  return (await db.prepare('SELECT a.account_id, a.full_name, a.email, a.phone, p.patient_number FROM auth_sessions s JOIN patient_accounts a ON a.account_id=s.account_id LEFT JOIN patients p ON p.account_id=a.account_id WHERE s.token_hash=? AND s.expires_at>unixepoch() AND a.email_verified_at IS NOT NULL').get(hashToken(token))) || null;
}
async function adminForSession(req) {
  const token = readCookie(req, 'clinic_admin_session');
  if (!token) return null;
  return (await db.prepare(`SELECT a.admin_id, a.full_name, a.email, a.phone, a.role
    FROM admin_sessions s JOIN admin_users a ON a.admin_id=s.admin_id
    WHERE s.token_hash=? AND s.expires_at>unixepoch() AND a.is_active=1`).get(hashToken(token))) || null;
}
const publicAdmin = admin => ({ id: admin.admin_id, name: admin.full_name, email: admin.email, phone: admin.phone || '', role: admin.role });
const throttleKeyColumns = { admin_login_throttles: 'email_hash', patient_login_throttles: 'email_hash', password_reset_throttles: 'email_hash', email_verification_throttles: 'email_hash', ip_login_throttles: 'ip_hash' };
function throttleKeyColumn(table) {
  const column = throttleKeyColumns[table];
  if (!column) throw new Error('Unknown login throttle table.');
  return column;
}
async function isRateLimited(table, email) {
  const emailHash = hashToken(normalizeEmail(email));
  const keyColumn = throttleKeyColumn(table);
  const record = (await db.prepare(`SELECT failures, blocked_until, unixepoch(updated_at) AS updated_epoch FROM ${table} WHERE ${keyColumn}=?`).get(emailHash));
  const now = Math.floor(Date.now() / 1000);
  if (record?.blocked_until > now) return true;
  if (record?.blocked_until) (await db.prepare(`DELETE FROM ${table} WHERE ${keyColumn}=?`).run(emailHash));
  return false;
}
async function recordFailedAttempt(table, email, limit, windowSeconds) {
  const emailHash = hashToken(normalizeEmail(email));
  const keyColumn = throttleKeyColumn(table);
  const now = Math.floor(Date.now() / 1000);
  const record = (await db.prepare(`SELECT failures, blocked_until, unixepoch(updated_at) AS updated_epoch FROM ${table} WHERE ${keyColumn}=?`).get(emailHash));
  if (record?.blocked_until > now) return true;
  const failures = record && now - record.updated_epoch < windowSeconds ? record.failures + 1 : 1;
  const blockedUntil = failures >= limit ? now + windowSeconds : 0;
  (await db.prepare(`INSERT INTO ${table} (${keyColumn}, failures, blocked_until, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP::text)
    ON CONFLICT(${keyColumn}) DO UPDATE SET failures=excluded.failures, blocked_until=excluded.blocked_until, updated_at=CURRENT_TIMESTAMP::text`)
    .run(emailHash, failures, blockedUntil));
  return blockedUntil > now;
}
async function clearFailedAttempts(table, email) {
  (await db.prepare(`DELETE FROM ${table} WHERE ${throttleKeyColumn(table)}=?`).run(hashToken(normalizeEmail(email))));
}
function clientIp(req) {
  const forwarded = process.env.TRUST_PROXY === 'true' ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  const candidate = forwarded || req.socket.remoteAddress || 'unknown';
  return isIP(candidate) ? candidate.toLowerCase() : 'unknown';
}
function loginIpKey(req, scope) {
  return `${scope}:ip:${clientIp(req)}`;
}
async function issueAdminSession(req, account) {
  (await db.prepare('DELETE FROM admin_sessions WHERE admin_id=? AND expires_at<=unixepoch()').run(account.admin_id));
  const token = randomBytes(32).toString('hex');
  (await db.prepare('INSERT INTO admin_sessions (session_id, admin_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
    .run(randomUUID(), account.admin_id, hashToken(token), Math.floor(Date.now() / 1000) + sessionSeconds));
  req.adminUser = account;
  return jsonPayloadForAdmin(account, token);
}
function jsonPayloadForAdmin(account, token) {
  return { body: { admin: publicAdmin(account) }, cookie: adminSessionCookie(token) };
}
async function issueEmailVerification(accountId, email) {
  const code = String(randomInt(0, 10000)).padStart(4, '0');
  const credentials = passwordHash(code);
  const verificationId = randomUUID();
  (await db.prepare('DELETE FROM email_verification_tokens WHERE account_id=? AND used_at IS NULL').run(accountId));
  (await db.prepare('INSERT INTO email_verification_tokens (verification_id, account_id, code_hash, code_salt, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(verificationId, accountId, credentials.hash, credentials.salt, Math.floor(Date.now() / 1000) + 30 * 60));
  if (!productionMode) return { verificationCode: code };
  try {
    await sendEmail({
      to: email,
      subject: 'Verify your 3 Mary’s Smile account',
      text: `Your email verification code is ${code}. It expires in 30 minutes. If you did not create this account, you can ignore this message.`,
    });
    return { verificationSent: true };
  } catch (error) {
    console.error('Patient email verification message could not be sent:', error.message);
    return { verificationSent: false };
  }
}
async function queueAssessmentFiles(targetDb, patientId, assessmentId = null) {
  const rows = assessmentId
    ? (await targetDb.prepare('SELECT i.storage_path FROM oral_assessment_images i JOIN oral_assessments a ON a.assessment_id=i.assessment_id WHERE a.patient_id=? AND a.assessment_id=?').all(patientId, assessmentId))
    : (await targetDb.prepare('SELECT i.storage_path FROM oral_assessment_images i JOIN oral_assessments a ON a.assessment_id=i.assessment_id WHERE a.patient_id=?').all(patientId));
  const insert = targetDb.prepare('INSERT INTO pending_file_deletions (relative_path) VALUES (?) ON CONFLICT (relative_path) DO NOTHING');
  for (const row of rows) {
    const storedPath = String(row.storage_path || '');
    const parts = storedPath.split('/');
    if (parts[0] !== 'assessment-uploads' || parts.length < 4 || parts.some(part => !part || part === '.' || part === '..' || part.includes('\\') || part.includes('\0'))) {
      throw new Error('An assessment has an unsafe stored-image path.');
    }
    (await insert.run(storedPath));
  }
}
function safeAssessmentImagePath(storagePath) {
  const normalized = String(storagePath || '').replaceAll('\\', '/');
  const parts = normalized.split('/');
  if (parts[0] !== 'assessment-uploads' || parts.length !== 4 || parts.some(part => !part || part === '.' || part === '..' || part.includes('\\') || part.includes('\0'))) return null;
  const uploadRoot = resolve(dataDir, 'assessment-uploads');
  const finalPath = resolve(dataDir, normalized);
  let current = uploadRoot;
  try {
    for (const [index, part] of parts.slice(1).entries()) {
      current = join(current, part);
      const info = lstatSync(current);
      if (info.isSymbolicLink()) return null;
      if (index < 2 && !info.isDirectory()) return null;
      if (index === 2 && !info.isFile()) return null;
    }
  } catch { return null; }
  return finalPath === current && current.startsWith(uploadRoot + sep) ? current : null;
}
async function flushPendingFileDeletions() {
  const rows = (await db.prepare('SELECT relative_path FROM pending_file_deletions ORDER BY created_at').all());
  for (const row of rows) {
    try {
      const parts = String(row.relative_path || '').split('/');
      if (parts[0] !== 'assessment-uploads' || parts.length < 4 || parts.some(part => !part || part === '.' || part === '..' || part.includes('\\') || part.includes('\0'))) {
        throw new Error('Unsafe queued assessment file path.');
      }
      const filePath = resolve(dataDir, ...parts);
      const uploadRoot = resolve(dataDir, 'assessment-uploads');
      if (!filePath.startsWith(uploadRoot + sep)) throw new Error('Assessment file path escaped upload storage.');
      let current = uploadRoot;
      for (const part of parts.slice(1, -1)) {
        current = join(current, part);
        if (!existsSync(current)) break;
        const info = lstatSync(current);
        if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Assessment upload directory is not safe.');
      }
      if (existsSync(filePath)) {
        const info = lstatSync(filePath);
        if (!info.isFile() || info.isSymbolicLink()) throw new Error('Assessment upload is not a regular file.');
        rmSync(filePath);
      }
      for (const directory of [dirname(filePath), dirname(dirname(filePath))]) {
        try { rmdirSync(directory); } catch { /* Keep non-empty directories in place. */ }
      }
      (await db.prepare('DELETE FROM pending_file_deletions WHERE relative_path=?').run(row.relative_path));
    } catch (error) {
      console.error('Assessment file deletion is pending operator review:', error.message);
    }
  }
}
function auditAdminRequest(req, res) {
  res.once('finish', async () => {
    const adminId = req.adminUser?.admin_id;
    if (!adminId) return;
    try {
      const path = new URL(req.url || '/', 'http://localhost').pathname
        .replace(/\/api\/admin\/data\/patients\/[^/]+\/assessments\/[^/]+/g, '/api/admin/data/patients/:id/assessments/:id')
        .replace(/\/api\/admin\/data\/patients\/[^/]+/g, '/api/admin/data/patients/:id')
        .replace(/\/api\/admin\/data\/[^/]+\/[^/]+/g, '/api/admin/data/:resource/:id');
      (await db.prepare('INSERT INTO admin_activity_log (activity_id, admin_id, event_type, http_method, route, status_code) VALUES (?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), adminId, `${req.method} ${path}`, req.method || 'GET', path.slice(0, 200), res.statusCode));
      (await db.prepare("DELETE FROM admin_activity_log WHERE NULLIF(created_at, '')::timestamptz < CURRENT_TIMESTAMP - INTERVAL '180 days'").run());
    } catch (error) { console.error('Admin activity event could not be recorded:', error.message); }
  });
}
(await flushPendingFileDeletions());
setInterval(() => flushPendingFileDeletions().catch(error => console.error('Assessment file cleanup could not run:', error.message)), 60_000).unref();
async function ensurePatientNumber(account) {
  if (account.patient_number) return account;
  (await db.exec('BEGIN IMMEDIATE'));
  try {
    const patient = (await db.prepare('SELECT patient_id, patient_number FROM patients WHERE account_id=?').get(account.account_id));
    const patientNumber = patient?.patient_number || (await nextPatientNumber());
    if (patient) {
      (await db.prepare('UPDATE patients SET patient_number=? WHERE patient_id=?').run(patientNumber, patient.patient_id));
    } else {
      const nameParts = String(account.full_name || '').trim().split(/\s+/).filter(Boolean);
      (await db.prepare('INSERT INTO patients (patient_id, clinic_id, account_id, full_name, email, phone, patient_number, first_name, last_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), 'default-clinic', account.account_id, account.full_name, account.email, account.phone || null, patientNumber, nameParts[0] || '', nameParts.length > 1 ? nameParts.at(-1) : nameParts[0] || ''));
    }
    (await db.exec('COMMIT'));
    return { ...account, patient_number: patientNumber };
  } catch (error) {
    (await db.exec('ROLLBACK'));
    throw error;
  }
}
async function handle(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, database: 'postgres' });
  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    eventClients.add(res);
    const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': keep-alive\n\n'); }, 25000);
    req.on('close', () => { clearInterval(heartbeat); eventClients.delete(res); });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/auth/login') {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length > 256) {
      return json(res, 401, { error: 'Email or password is incorrect.' });
    }
    if (!(await db.prepare('SELECT 1 FROM admin_users LIMIT 1').get())) {
      return json(res, 503, { error: 'No admin account is set up yet. Run npm run admin:create on the clinic server first.' });
    }
    const ipKey = loginIpKey(req, 'admin');
    if ((await isRateLimited('admin_login_throttles', email)) || (await isRateLimited('ip_login_throttles', ipKey))) return json(res, 429, { error: 'Too many sign-in attempts. Try again in 15 minutes.' });
    const account = (await db.prepare('SELECT admin_id, full_name, email, phone, role, password_hash, password_salt, mfa_secret_ciphertext, mfa_secret_iv, mfa_secret_tag, mfa_enabled_at, mfa_last_totp_step FROM admin_users WHERE email=? AND is_active=1').get(email));
    if (!account || !verifyHash(password, account.password_salt, account.password_hash)) {
      const blocked = (await recordFailedAttempt('admin_login_throttles', email, 10, 15 * 60));
      const ipBlocked = (await recordFailedAttempt('ip_login_throttles', ipKey, 40, 15 * 60));
      const limited = blocked || ipBlocked;
      return json(res, limited ? 429 : 401, { error: limited ? 'Too many sign-in attempts. Try again in 15 minutes.' : 'Email or password is incorrect.' });
    }
    if (!account.mfa_enabled_at || !account.mfa_secret_ciphertext) {
      if (productionMode) return json(res, 403, { error: 'Admin multi-factor authentication must be enrolled by the server operator before sign-in.', code: 'ADMIN_MFA_SETUP_REQUIRED' });
      (await clearFailedAttempts('admin_login_throttles', email));
      const localSession = (await issueAdminSession(req, account));
      return json(res, 200, localSession.body, { 'Set-Cookie': localSession.cookie });
    }
    (await clearFailedAttempts('admin_login_throttles', email));
    (await db.prepare('DELETE FROM admin_mfa_challenges WHERE admin_id=? AND used_at IS NULL').run(account.admin_id));
    const challengeToken = randomBytes(32).toString('hex');
    (await db.prepare('INSERT INTO admin_mfa_challenges (challenge_id, admin_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
      .run(randomUUID(), account.admin_id, hashToken(challengeToken), Math.floor(Date.now() / 1000) + 5 * 60));
    return json(res, 200, { mfaRequired: true, challengeToken });
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/auth/verify-mfa') {
    const body = await readBody(req);
    const challengeToken = String(body.challengeToken || '');
    const code = String(body.code || '');
    const ipKey = loginIpKey(req, 'admin');
    if ((await isRateLimited('ip_login_throttles', ipKey))) return json(res, 429, { error: 'Too many sign-in attempts. Try again in 15 minutes.' });
    const challenge = (await db.prepare(`SELECT c.challenge_id, c.admin_id, c.attempts, a.full_name, a.email, a.phone, a.role,
      a.mfa_secret_ciphertext, a.mfa_secret_iv, a.mfa_secret_tag, a.mfa_enabled_at, a.mfa_last_totp_step
      FROM admin_mfa_challenges c JOIN admin_users a ON a.admin_id=c.admin_id
      WHERE c.token_hash=? AND c.expires_at>unixepoch() AND c.used_at IS NULL AND a.is_active=1`)
      .get(hashToken(challengeToken)));
    if (!challenge || challenge.attempts >= 5 || !challenge.mfa_enabled_at) return json(res, 401, { error: 'The authenticator code is invalid or expired.' });
    let matchingStep = null;
    try { matchingStep = matchingTotpStep(decryptTotpSecret(challenge), code); }
    catch (error) { console.error('Admin MFA secret could not be read:', error.message); }
    if (matchingStep === null || matchingStep <= Number(challenge.mfa_last_totp_step ?? -1)) {
      (await db.prepare('UPDATE admin_mfa_challenges SET attempts=attempts+1 WHERE challenge_id=?').run(challenge.challenge_id));
      (await recordFailedAttempt('ip_login_throttles', ipKey, 40, 15 * 60));
      return json(res, 401, { error: 'The authenticator code is invalid or expired.' });
    }
    (await db.prepare('UPDATE admin_users SET mfa_last_totp_step=? WHERE admin_id=?').run(matchingStep, challenge.admin_id));
    (await db.prepare('UPDATE admin_mfa_challenges SET used_at=CURRENT_TIMESTAMP::text WHERE challenge_id=?').run(challenge.challenge_id));
    (await clearFailedAttempts('ip_login_throttles', ipKey));
    const session = (await issueAdminSession(req, challenge));
    return json(res, 200, session.body, { 'Set-Cookie': session.cookie });
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/auth/logout') {
    const token = readCookie(req, 'clinic_admin_session');
    req.adminUser = (await adminForSession(req));
    if (token) (await db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(hashToken(token)));
    return json(res, 200, { ok: true }, { 'Set-Cookie': adminCookieExpiry(0) });
  }
  if (url.pathname.startsWith('/api/admin/')) {
    const admin = (await adminForSession(req));
    if (!admin) return json(res, 401, { error: 'Sign in to the clinic admin account to continue.', code: 'ADMIN_SESSION_REQUIRED' }, { 'Set-Cookie': adminCookieExpiry(0) });
    req.adminUser = admin;
    if (req.method === 'GET' && url.pathname === '/api/admin/auth/session') return json(res, 200, { admin: publicAdmin(admin) });
    if (req.method === 'GET' && url.pathname === '/api/admin/auth/activity') {
      const activities = (await db.prepare(`SELECT event_type AS eventType, http_method AS method, route, status_code AS statusCode, created_at AS createdAt
        FROM admin_activity_log WHERE admin_id=? ORDER BY created_at DESC LIMIT 100`).all(admin.admin_id));
      return json(res, 200, { activities });
    }
    if (req.method === 'PUT' && url.pathname === '/api/admin/auth/profile') {
      const body = await readBody(req);
      const fullName = String(body.name || '').trim().replace(/\s+/g, ' ');
      const email = normalizeEmail(body.email);
      const phone = String(body.phone || '').trim();
      if (fullName.length < 2 || fullName.length > 120) return json(res, 400, { error: 'Enter a name between 2 and 120 characters.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(res, 400, { error: 'Enter a valid email address.' });
      if (phone.length > 30) return json(res, 400, { error: 'Enter a phone number with 30 characters or fewer.' });
      try {
        (await db.prepare('UPDATE admin_users SET full_name=?, email=?, phone=?, updated_at=CURRENT_TIMESTAMP::text WHERE admin_id=?')
          .run(fullName, email, phone, admin.admin_id));
      } catch (error) {
        if (error.code === '23505' || String(error.message).includes('UNIQUE')) return json(res, 409, { error: 'That email address is already used by another admin.' });
        throw error;
      }
      const updated = (await db.prepare('SELECT admin_id, full_name, email, phone, role FROM admin_users WHERE admin_id=?').get(admin.admin_id));
      return json(res, 200, { admin: publicAdmin(updated) });
    }
    if (req.method === 'PUT' && url.pathname === '/api/admin/auth/password') {
      const body = await readBody(req);
      const currentPassword = String(body.currentPassword || '');
      const newPassword = String(body.newPassword || '');
      const stored = (await db.prepare('SELECT password_hash, password_salt FROM admin_users WHERE admin_id=? AND is_active=1').get(admin.admin_id));
      if (currentPassword.length > 256 || !verifyHash(currentPassword, stored.password_salt, stored.password_hash)) {
        return json(res, 401, { error: 'The current password is incorrect.' });
      }
      if (newPassword.length < 12 || newPassword.length > 256) return json(res, 400, { error: 'Use a new password between 12 and 256 characters.' });
      if (newPassword === currentPassword) return json(res, 400, { error: 'Choose a new password different from the current one.' });
      const credentials = passwordHash(newPassword);
      const currentTokenHash = hashToken(readCookie(req, 'clinic_admin_session'));
      (await db.prepare('UPDATE admin_users SET password_hash=?, password_salt=?, password_changed_at=CURRENT_TIMESTAMP::text, updated_at=CURRENT_TIMESTAMP::text WHERE admin_id=?')
        .run(credentials.hash, credentials.salt, admin.admin_id));
      (await db.prepare('DELETE FROM admin_sessions WHERE admin_id=? AND token_hash<>?').run(admin.admin_id, currentTokenHash));
      return json(res, 200, { ok: true });
    }
    if (url.pathname.startsWith('/api/admin/auth/')) return json(res, 404, { error: 'Not found.' });
  }
  const adminAssessmentDelete = url.pathname.match(/^\/api\/admin\/data\/patients\/([\w-]+)\/assessments\/([\w-]+)$/);
  if (req.method === 'DELETE' && adminAssessmentDelete) {
    const [, patientId, assessmentId] = adminAssessmentDelete;
    if (!(await db.prepare('SELECT 1 FROM oral_assessments WHERE patient_id=? AND assessment_id=?').get(patientId, assessmentId))) return json(res, 404, { error: 'Assessment record not found.' });
    (await db.exec('BEGIN IMMEDIATE'));
    try {
      (await queueAssessmentFiles(db, patientId, assessmentId));
      (await db.prepare('DELETE FROM oral_assessments WHERE patient_id=? AND assessment_id=?').run(patientId, assessmentId));
      (await db.exec('COMMIT'));
      (await flushPendingFileDeletions());
      notify('oral-assessments');
      return json(res, 200, { ok: true });
    } catch (error) {
      try { (await db.exec('ROLLBACK')); } catch { /* The transaction may already have rolled back. */ }
      throw error;
    }
  }
  const adminAssessmentList = url.pathname.match(/^\/api\/admin\/data\/patients\/([\w-]+)\/assessments$/);
  if (req.method === 'GET' && adminAssessmentList) {
    const patientId = adminAssessmentList[1];
    if (!(await db.prepare('SELECT 1 FROM patients WHERE patient_id=?').get(patientId))) return json(res, 404, { error: 'Patient record not found.' });
    const rows = (await db.prepare('SELECT assessment_id, status, result_json, assessment_date, risk_level, findings_json, recommendations_json, confidence_scores_json, annotated_images_json, created_at FROM oral_assessments WHERE patient_id=? ORDER BY COALESCE(assessment_date, created_at) DESC').all(patientId));
    const imageQuery = db.prepare('SELECT image_id, image_kind, angle, original_name, mime_type, file_size, image_width, image_height FROM oral_assessment_images WHERE assessment_id=? ORDER BY created_at, image_id');
      const assessments = await Promise.all(rows.map(async row => {
      let result;
      try { result = JSON.parse(row.result_json || '{}'); } catch { result = {}; }
      delete result.toothMapping;
      delete result.odontogramData;
      result.findings = (Array.isArray(result.findings) ? result.findings : JSON.parse(row.findings_json || '[]')).map(finding => {
        const cleaned = { ...finding };
        delete cleaned.toothNumber;
        delete cleaned.mappingConfidence;
        delete cleaned.mappingMethod;
        return cleaned;
      });
      const images = (await imageQuery.all(row.assessment_id)).map(image => ({
        id: image.image_id, kind: image.image_kind, angle: image.angle || '', fileName: image.original_name, mimeType: image.mime_type,
        sizeBytes: image.file_size, width: image.image_width, height: image.image_height,
        url: `/api/admin/data/patients/${encodeURIComponent(patientId)}/assessments/${encodeURIComponent(row.assessment_id)}/images/${encodeURIComponent(image.image_id)}`,
      }));
      const imageById = new Map(images.map(image => [image.id, image]));
      result.annotatedImages = (Array.isArray(result.annotatedImages) ? result.annotatedImages : []).map(annotated => ({
        ...annotated,
        detections: (Array.isArray(annotated.detections) ? annotated.detections : []).map(detection => {
          const cleaned = { ...detection };
          delete cleaned.toothNumber;
          return cleaned;
        }),
        url: imageById.get(annotated.imageId)?.url || '',
      }));
      return {
        id: row.assessment_id, patientId, status: row.status, assessedAt: row.assessment_date || result.assessedAt || row.created_at,
        riskLevel: row.risk_level || result.riskLevel || null, result, images,
        findings: Array.isArray(result.findings) ? result.findings : JSON.parse(row.findings_json || '[]'),
        recommendations: Array.isArray(result.recommendations) ? result.recommendations : JSON.parse(row.recommendations_json || '[]'),
        confidenceScores: (JSON.parse(row.confidence_scores_json || '[]')).map(score => {
          const cleaned = { ...score };
          delete cleaned.toothNumber;
          delete cleaned.mappingConfidence;
          delete cleaned.mappingMethod;
          return cleaned;
        }), annotatedImages: result.annotatedImages, readOnly: true,
        createdAt: row.created_at,
      };
    }));
    return json(res, 200, { patientId, assessments });
  }
  const adminAssessmentImage = url.pathname.match(/^\/api\/admin\/data\/patients\/([\w-]+)\/assessments\/([\w-]+)\/images\/([\w-]+)$/);
  if (req.method === 'GET' && adminAssessmentImage) {
    const [, patientId, assessmentId, imageId] = adminAssessmentImage;
    const image = (await db.prepare(`SELECT i.storage_path, i.mime_type, i.file_size FROM oral_assessment_images i
      JOIN oral_assessments a ON a.assessment_id=i.assessment_id WHERE i.image_id=? AND a.assessment_id=? AND a.patient_id=?`).get(imageId, assessmentId, patientId));
    if (!image) return json(res, 404, { error: 'Assessment photo not found.' });
    const filePath = safeAssessmentImagePath(image.storage_path);
    if (!filePath) return json(res, 404, { error: 'Assessment photo not found.' });
    let photo;
    try { photo = readFileSync(filePath); } catch { return json(res, 404, { error: 'Assessment photo is unavailable.' }); }
    if (photo.length !== image.file_size) return json(res, 404, { error: 'Assessment photo is unavailable.' });
    res.writeHead(200, { 'Content-Type': image.mime_type, 'Content-Length': photo.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' });
    return res.end(photo);
  }
  const adminResult = (await handleAdminData(db, req, res, {
    json, readBody, notify,
    beforePatientDelete: async patientId => (await queueAssessmentFiles(db, patientId)),
    afterFileDeletion: async () => { (await flushPendingFileDeletions()); },
  }));
  if (adminResult !== false) return adminResult;
  if (serveFrontend(req, res, url.pathname)) return;
  if (!url.pathname.startsWith('/api/auth/') && !url.pathname.startsWith('/api/patient/')) return json(res, 404, { error: 'Not found.' });

  if (req.method === 'POST' && url.pathname === '/api/auth/resend-verification') {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    if (!isGmailAddress(email)) return json(res, 400, { error: 'Enter a valid Gmail address ending in @gmail.com.' });
    if ((await isRateLimited('email_verification_throttles', email))) return json(res, 429, { error: 'A verification message was recently sent. Wait before requesting another.' });
    (await recordFailedAttempt('email_verification_throttles', email, 3, 60 * 60));
    const account = (await db.prepare('SELECT account_id, email, email_verified_at FROM patient_accounts WHERE email=?').get(email));
    let result = {};
    if (account && !account.email_verified_at) result = (await issueEmailVerification(account.account_id, account.email));
    return json(res, 200, { ok: true, ...result });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/verify-email') {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const code = String(body.code || '');
    if (!isGmailAddress(email)) return json(res, 400, { error: 'Enter a valid Gmail address ending in @gmail.com.' });
    if (!/^\d{4}$/.test(code)) return json(res, 400, { error: 'Enter the four-digit verification code.' });
    if ((await isRateLimited('email_verification_throttles', email))) return json(res, 429, { error: 'Too many verification attempts. Request a new code later.' });
    const verification = (await db.prepare(`SELECT v.verification_id, v.account_id, v.code_hash, v.code_salt, v.attempts
      FROM email_verification_tokens v JOIN patient_accounts a ON a.account_id=v.account_id
      WHERE a.email=? AND v.expires_at>unixepoch() AND v.used_at IS NULL ORDER BY v.created_at DESC LIMIT 1`).get(email));
    if (!verification || verification.attempts >= 5 || !verifyHash(code, verification.code_salt, verification.code_hash)) {
      if (verification && verification.attempts < 5) (await db.prepare('UPDATE email_verification_tokens SET attempts=attempts+1 WHERE verification_id=?').run(verification.verification_id));
      (await recordFailedAttempt('email_verification_throttles', email, 10, 15 * 60));
      return json(res, 400, { error: 'The verification code is invalid or expired. Request a new code.' });
    }
    (await db.prepare('UPDATE patient_accounts SET email_verified_at=CURRENT_TIMESTAMP::text WHERE account_id=?').run(verification.account_id));
    (await db.prepare('UPDATE email_verification_tokens SET used_at=CURRENT_TIMESTAMP::text WHERE verification_id=?').run(verification.verification_id));
    (await clearFailedAttempts('email_verification_throttles', email));
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    const body = await readBody(req);
    const firstName = formatPersonName(body.firstName);
    const middleName = formatPersonName(body.middleName);
    const lastName = formatPersonName(body.lastName);
    const fullName = formatPersonName(body.fullName || [firstName, middleName, lastName].filter(Boolean).join(' '));
    const email = normalizeEmail(body.email);
    const phone = String(body.phone || '').trim();
    const dateOfBirth = String(body.dateOfBirth || '').trim();
    const gender = String(body.gender || '').trim();
    const address = String(body.address || '').trim();
    const password = String(body.password || '');
    if (firstName.length < 1 || lastName.length < 1 || fullName.length < 2) return json(res, 400, { error: 'Enter your first and last name.' });
    if (!isGmailAddress(email)) return json(res, 400, { error: 'Enter a valid Gmail address ending in @gmail.com.' });
    if (phone && !/^\+?[\d\s().-]{7,20}$/.test(phone)) return json(res, 400, { error: 'Enter a valid phone number, or leave it blank.' });
    if (password.length < 8) return json(res, 400, { error: 'Use a password with at least 8 characters.' });
    const credentials = passwordHash(password);
    const accountId = randomUUID();
    const patientId = randomUUID();
    const patientNumber = (await nextPatientNumber());
    try {
      (await db.exec('BEGIN'));
      (await db.prepare('INSERT INTO patient_accounts (account_id, full_name, first_name, middle_name, last_name, email, phone, date_of_birth, gender, address, password_hash, password_salt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(accountId, fullName, firstName, middleName || null, lastName, email, phone, dateOfBirth || '', gender || '', address || null, credentials.hash, credentials.salt));
      (await db.prepare('INSERT INTO patients (patient_id, clinic_id, account_id, full_name, email, phone, date_of_birth, gender, address, patient_number, first_name, last_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(patientId, 'default-clinic', accountId, fullName, email, phone || null, dateOfBirth || null, gender || null, address || null, patientNumber, firstName, lastName));
      (await db.exec('COMMIT'));
    } catch (error) {
      try { (await db.exec('ROLLBACK')); } catch (rollbackError) {
        console.error('Patient registration transaction rollback failed:', rollbackError.message);
      }
      if (error.code === '23505' || String(error.message).includes('UNIQUE')) return json(res, 409, { error: 'An account with that email already exists.' });
      throw error;
    }
    const verificationResult = (await issueEmailVerification(accountId, email));
    return json(res, 201, { user: { id: accountId, patientNumber, fullName, email, phone }, verificationRequired: true, ...verificationResult });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    if (!isGmailAddress(email)) return json(res, 400, { error: 'Enter a valid Gmail address ending in @gmail.com.' });
    const ipKey = loginIpKey(req, 'patient');
    if ((await isRateLimited('patient_login_throttles', email)) || (await isRateLimited('ip_login_throttles', ipKey))) return json(res, 429, { error: 'Too many sign-in attempts. Try again in 15 minutes.' });
    const row = (await db.prepare('SELECT a.account_id, a.full_name, a.email, a.phone, a.password_hash, a.password_salt, p.patient_number FROM patient_accounts a LEFT JOIN patients p ON p.account_id=a.account_id WHERE a.email=?').get(email));
    if (!row || String(body.password || '').length > 256 || !verifyHash(String(body.password || ''), row.password_salt, row.password_hash)) {
      const blocked = (await recordFailedAttempt('patient_login_throttles', email, 10, 15 * 60));
      const ipBlocked = (await recordFailedAttempt('ip_login_throttles', ipKey, 40, 15 * 60));
      const limited = blocked || ipBlocked;
      return json(res, limited ? 429 : 401, { error: limited ? 'Too many sign-in attempts. Try again in 15 minutes.' : 'Email or password is incorrect.' });
    }
    const verified = (await db.prepare('SELECT email_verified_at FROM patient_accounts WHERE account_id=?').get(row.account_id));
    if (!verified?.email_verified_at) return json(res, 403, { error: 'Verify your email before signing in.', code: 'EMAIL_VERIFICATION_REQUIRED' });
    (await clearFailedAttempts('patient_login_throttles', email));
    (await clearFailedAttempts('ip_login_throttles', ipKey));
    const account = (await ensurePatientNumber(row));
    const token = randomBytes(32).toString('hex');
    (await db.prepare('INSERT INTO auth_sessions (session_id, account_id, token_hash, expires_at) VALUES (?, ?, ?, ?)').run(randomUUID(), row.account_id, hashToken(token), Math.floor(Date.now() / 1000) + sessionSeconds));
    return json(res, 200, { user: publicAccount(account) }, { 'Set-Cookie': sessionCookie(token) });
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/session') {
    const row = (await accountForSession(req));
    if (!row) return json(res, 401, { error: 'Sign in to continue.' }, { 'Set-Cookie': cookieExpiry(0) });
    return json(res, 200, { user: publicAccount((await ensurePatientNumber(row))) });
  }

  if (req.method === 'PUT' && url.pathname === '/api/auth/profile') {
    const account = (await accountForSession(req));
    if (!account) return json(res, 401, { error: 'Sign in again to update your profile.' });
    const body = await readBody(req);
    const fullName = formatPersonName(body.fullName);
    const email = normalizeEmail(body.email);
    const phone = String(body.phone || '').trim();
    if (fullName.length < 2) return json(res, 400, { error: 'Enter your full name.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'Enter a valid email address.' });
    if (phone && !/^\+?[\d\s().-]{7,20}$/.test(phone)) return json(res, 400, { error: 'Enter a valid phone number.' });
    const nameParts = fullName.split(' ');
    const firstName = nameParts.shift();
    const lastName = nameParts.length ? nameParts.pop() : firstName;
    const middleName = nameParts.join(' ');
    const emailChanged = email !== account.email;
    try {
      (await db.prepare('UPDATE patient_accounts SET full_name=?, first_name=?, middle_name=?, last_name=?, email=?, phone=?, email_verified_at=CASE WHEN ? <> 0 THEN NULL ELSE email_verified_at END WHERE account_id=?').run(fullName, firstName, middleName || null, lastName, email, phone, emailChanged ? 1 : 0, account.account_id));
      (await db.prepare('UPDATE patients SET full_name=?, email=?, phone=? WHERE account_id=?').run(fullName, email, phone || null, account.account_id));
      notify('patients');
      if (emailChanged) {
        (await db.prepare('DELETE FROM auth_sessions WHERE account_id=?').run(account.account_id));
        (await issueEmailVerification(account.account_id, email));
        return json(res, 200, { user: { id: account.account_id, patientNumber: account.patient_number || '', fullName, email, phone }, verificationRequired: true }, { 'Set-Cookie': cookieExpiry(0) });
      }
      return json(res, 200, { user: { id: account.account_id, patientNumber: account.patient_number || '', fullName, email, phone } });
    } catch (error) {
      if (error.code === '23505' || String(error.message).includes('UNIQUE')) return json(res, 409, { error: 'That email address is already associated with an account.' });
      throw error;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = readCookie(req, 'clinic_session');
    if (token) (await db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(hashToken(token)));
    return json(res, 200, { ok: true }, { 'Set-Cookie': cookieExpiry(0) });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/forgot-password') {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    if (!isGmailAddress(email)) return json(res, 400, { error: 'Enter a valid Gmail address ending in @gmail.com.' });
    if ((await isRateLimited('password_reset_throttles', email))) return json(res, 429, { error: 'A reset request was recently sent. Please wait before trying again.' });
    (await recordFailedAttempt('password_reset_throttles', email, 3, 60 * 60));
    const account = (await db.prepare('SELECT account_id FROM patient_accounts WHERE email=?').get(email));
    let resetCode;
    if (account) {
      const code = String(randomInt(0, 10000)).padStart(4, '0');
      const credentials = passwordHash(code);
      const resetId = randomUUID();
      (await db.prepare('DELETE FROM password_reset_tokens WHERE account_id=? AND used_at IS NULL').run(account.account_id));
      (await db.prepare('INSERT INTO password_reset_tokens (reset_id, account_id, token_hash, code_hash, code_salt, expires_at) VALUES (?, ?, ?, ?, ?, ?)').run(resetId, account.account_id, hashToken(randomBytes(32).toString('hex')), credentials.hash, credentials.salt, Math.floor(Date.now() / 1000) + 60 * 30));
      if (productionMode) {
        try {
          await sendEmail({
            to: email,
            subject: 'Your 3 Mary’s Smile password reset code',
            text: `Your password reset code is ${code}. It expires in 30 minutes. If you did not request this, you can ignore this email.`,
          });
        } catch (error) {
          (await db.prepare('DELETE FROM password_reset_tokens WHERE reset_id=?').run(resetId));
          console.error('Patient password reset email could not be sent:', error.message);
        }
      } else resetCode = code;
    }
    return json(res, 200, { ok: true, resetCode });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/verify-reset-code') {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const code = String(body.code || '');
    if (!isGmailAddress(email)) return json(res, 400, { error: 'Enter a valid Gmail address ending in @gmail.com.' });
    if (!/^\d{4}$/.test(code)) return json(res, 400, { error: 'Enter the four-digit code.' });
    const reset = (await db.prepare('SELECT r.reset_id, r.account_id, r.code_hash, r.code_salt, r.attempts FROM password_reset_tokens r JOIN patient_accounts a ON a.account_id=r.account_id WHERE a.email=? AND r.expires_at>unixepoch() AND r.used_at IS NULL AND r.code_verified_at IS NULL ORDER BY r.created_at DESC LIMIT 1').get(email));
    if (!reset || reset.attempts >= 5) return json(res, 400, { error: 'The code is invalid or expired. Request a new code.' });
    if (!verifyHash(code, reset.code_salt, reset.code_hash)) {
      (await db.prepare('UPDATE password_reset_tokens SET attempts=attempts+1 WHERE reset_id=?').run(reset.reset_id));
      return json(res, 400, { error: 'The code is invalid or expired. Request a new code.' });
    }
    const token = randomBytes(32).toString('hex');
    (await db.prepare('UPDATE password_reset_tokens SET token_hash=?, code_verified_at=CURRENT_TIMESTAMP::text WHERE reset_id=?').run(hashToken(token), reset.reset_id));
    return json(res, 200, { resetToken: token });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/reset-password') {
    const body = await readBody(req);
    const token = String(body.token || '');
    const password = String(body.password || '');
    if (password.length < 8) return json(res, 400, { error: 'Use a password with at least 8 characters.' });
    if (!token) return json(res, 400, { error: 'This reset link is missing or invalid.' });
    const reset = (await db.prepare('SELECT reset_id, account_id FROM password_reset_tokens WHERE token_hash=? AND code_verified_at IS NOT NULL AND expires_at>unixepoch() AND used_at IS NULL').get(hashToken(token)));
    if (!reset) return json(res, 400, { error: 'This reset link has expired or was already used. Request a new code.' });
    const credentials = passwordHash(password);
    (await db.exec('BEGIN IMMEDIATE'));
    try {
      (await db.prepare('UPDATE patient_accounts SET password_hash=?, password_salt=? WHERE account_id=?').run(credentials.hash, credentials.salt, reset.account_id));
      (await db.prepare('UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP::text WHERE reset_id=?').run(reset.reset_id));
      (await db.prepare('DELETE FROM auth_sessions WHERE account_id=?').run(reset.account_id));
      (await db.exec('COMMIT'));
    } catch (error) {
      (await db.exec('ROLLBACK'));
      throw error;
    }
    return json(res, 200, { ok: true });
  }

  if (url.pathname.startsWith('/api/patient/')) {
    if (req.method === 'GET' && url.pathname === '/api/patient/appointments/availability') {
      const month = String(url.searchParams.get('month') || '');
      if (!/^\d{4}-\d{2}$/.test(month) || Number(month.slice(5)) < 1 || Number(month.slice(5)) > 12) return json(res, 400, { error: 'Choose a valid calendar month.' });
      const [year, monthNumber] = month.split('-').map(Number);
      const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
      const monthStart = `${month}-01`;
      const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 7);
      const from = clinicDateTime(monthStart, 0).toISOString();
      const to = clinicDateTime(`${nextMonth}-01`, 0).toISOString();
      const bookedRows = (await db.prepare("SELECT starts_at FROM appointments WHERE clinic_id=? AND status <> 'cancelled' AND starts_at >= ? AND starts_at < ?").all('default-clinic', from, to));
      const booked = new Set(bookedRows.map(row => row.starts_at));
      const days = Array.from({ length: daysInMonth }, (_, index) => {
        const date = `${month}-${pad(index + 1)}`;
        const { weekday } = clinicDateParts(date);
        const isHoliday = CLINIC_HOLIDAYS.includes(date);
        const isOpen = CLINIC_OPEN_WEEKDAYS.includes(weekday) && !isHoliday;
        const slots = isOpen ? slotHours.map(hour => {
          const slotDate = clinicDateTime(date, hour);
          const startsAt = slotDate.toISOString();
          return { ...formatSlot(hour), startsAt, available: slotDate.getTime() > Date.now() && !booked.has(startsAt) };
        }) : [];
        return { date, open: isOpen, reason: isHoliday ? 'holiday' : (isOpen ? '' : 'closed'), slots, availableCount: slots.filter(slot => slot.available).length };
      });
      return json(res, 200, { month, timeZone: CLINIC_TIME_ZONE, openTime: formatSlot(CLINIC_OPEN_HOUR).label, closeTime: formatSlot(CLINIC_CLOSE_HOUR).label, holidays: CLINIC_HOLIDAYS, days });
    }
    const account = (await accountForSession(req));
    if (!account) return json(res, 401, { error: 'Please sign in again to book an appointment.' });
    const patient = (await db.prepare('SELECT patient_id FROM patients WHERE account_id=?').get(account.account_id));
    if (!patient && (url.pathname === '/api/patient/assessments' || url.pathname.startsWith('/api/patient/assessments/'))) return json(res, 404, { error: 'Your patient profile is not available. Please complete your registration first.' });
    if (req.method === 'POST' && url.pathname === '/api/patient/assessments/validate-image') {
      const body = await readBody(req, 8 * 1024 * 1024);
      if (body.consent !== true || String(body.consentVersion || '') !== ASSESSMENT_CONSENT_VERSION) return json(res, 400, { error: 'Review and accept the AI photo assessment consent before continuing.' });
      if (!process.env.ROBOFLOW_API_KEY) return json(res, 503, { error: 'AI image validation is not configured yet. Please try again later.' });
      const match = typeof body.dataUrl === 'string' ? body.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/) : null;
      const kind = String(body.kind || '');
      const angle = String(body.angle || '');
      if (!match || !['teeth', 'xray'].includes(kind)) return json(res, 400, { error: 'Choose a valid JPG, PNG, or WEBP dental image.' });
      if (kind === 'teeth' && !['front', 'upper', 'lower'].includes(angle)) return json(res, 400, { error: 'Choose a valid teeth photo view.' });
      const buffer = Buffer.from(match[2], 'base64');
      if (!buffer.length || buffer.length > 5 * 1024 * 1024) return json(res, 413, { error: 'Each image must be 5 MB or smaller.' });
      const mimeMatchesBytes = match[1] === 'image/jpeg'
        ? buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
        : match[1] === 'image/png'
          ? buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
          : buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
      if (!mimeMatchesBytes) return json(res, 400, { error: 'The image does not match its declared image format.' });
      const imageWidth = Math.trunc(Number(body.width || 0));
      const imageHeight = Math.trunc(Number(body.height || 0));
      if (!Number.isInteger(imageWidth) || !Number.isInteger(imageHeight) || imageWidth < 320 || imageHeight < 240 || imageWidth > 12000 || imageHeight > 12000) return json(res, 400, { error: 'Each photo must be at least 320 × 240 pixels and no larger than 12,000 pixels per side.' });
      const image = {
        kind,
        angle: kind === 'teeth' ? angle : '',
        name: stripControlChars(String(body.fileName || 'assessment-photo').replace(/[\\/]/g, '_')).trim().slice(0, 180) || 'assessment-photo',
        mimeType: match[1],
        buffer,
        imageWidth,
        imageHeight,
      };
      try {
        image.workflowResult = await validateDentalImage(image);
      } catch (error) {
        console.error('Roboflow photo validation failed:', error.code || 'ROBOFLOW_WORKFLOW_ERROR', error.message);
        return json(res, error.status || 503, { error: error.message || 'This image could not be checked. Please try again.', code: error.code || 'ROBOFLOW_WORKFLOW_ERROR' });
      }
      const now = Date.now();
      for (const [token, validated] of validatedAssessmentImages) if (validated.expiresAt <= now) validatedAssessmentImages.delete(token);
      while (validatedAssessmentImages.size >= 30) validatedAssessmentImages.delete(validatedAssessmentImages.keys().next().value);
      const validationToken = randomBytes(32).toString('base64url');
      validatedAssessmentImages.set(validationToken, { accountId: account.account_id, patientId: patient.patient_id, image, expiresAt: now + VALIDATED_IMAGE_TTL });
      return json(res, 200, { validationToken, message: 'Image checked by the oral-health analysis workflow.' });
    }
    if (req.method === 'GET' && url.pathname === '/api/patient/assessments') {
      const rows = (await db.prepare('SELECT assessment_id, status, result_json, assessment_date, risk_level, created_at FROM oral_assessments WHERE patient_id=? ORDER BY COALESCE(assessment_date, created_at) DESC').all(patient.patient_id));
      const imagesFor = db.prepare('SELECT image_id, image_kind, angle, original_name, mime_type, file_size, image_width, image_height FROM oral_assessment_images WHERE assessment_id=? ORDER BY created_at, image_id');
      const assessments = await Promise.all(rows.map(async row => ({
        id: row.assessment_id,
        status: row.status,
        result: JSON.parse(row.result_json || '{}'),
        assessedAt: row.assessment_date || row.created_at,
        riskLevel: row.risk_level || null,
        createdAt: row.created_at,
        images: (await imagesFor.all(row.assessment_id)).map(image => ({
          id: image.image_id,
          kind: image.image_kind,
          angle: image.angle || '',
          fileName: image.original_name,
          mimeType: image.mime_type,
          sizeBytes: image.file_size,
          width: image.image_width,
          height: image.image_height,
          url: `/api/patient/assessments/${encodeURIComponent(row.assessment_id)}/images/${encodeURIComponent(image.image_id)}`,
        })),
      })));
      return json(res, 200, { assessments });
    }
    const deletePatientAssessment = url.pathname.match(/^\/api\/patient\/assessments\/([\w-]+)$/);
    if (req.method === 'DELETE' && deletePatientAssessment) {
      const assessmentId = deletePatientAssessment[1];
      if (!(await db.prepare('SELECT 1 FROM oral_assessments WHERE assessment_id=? AND patient_id=?').get(assessmentId, patient.patient_id))) return json(res, 404, { error: 'Assessment record not found.' });
      (await db.exec('BEGIN IMMEDIATE'));
      try {
        (await queueAssessmentFiles(db, patient.patient_id, assessmentId));
        (await db.prepare('DELETE FROM oral_assessments WHERE assessment_id=? AND patient_id=?').run(assessmentId, patient.patient_id));
        (await db.exec('COMMIT'));
        (await flushPendingFileDeletions());
      } catch (error) {
        try { (await db.exec('ROLLBACK')); } catch { /* The transaction may already have rolled back. */ }
        throw error;
      }
      notify('oral-assessments');
      return json(res, 200, { ok: true });
    }
    const assessmentImageRoute = url.pathname.match(/^\/api\/patient\/assessments\/([\w-]+)\/images\/([\w-]+)$/);
    if (req.method === 'GET' && assessmentImageRoute) {
      const [, assessmentId, imageId] = assessmentImageRoute;
      const image = (await db.prepare(`SELECT i.storage_path, i.mime_type, i.file_size
        FROM oral_assessment_images i JOIN oral_assessments a ON a.assessment_id=i.assessment_id
        WHERE i.image_id=? AND a.assessment_id=? AND a.patient_id=?`).get(imageId, assessmentId, patient.patient_id));
      if (!image) return json(res, 404, { error: 'Assessment photo not found.' });
      const filePath = safeAssessmentImagePath(image.storage_path);
      if (!filePath) return json(res, 404, { error: 'Assessment photo not found.' });
      let photo;
      try { photo = readFileSync(filePath); } catch { return json(res, 404, { error: 'Assessment photo is unavailable.' }); }
      res.writeHead(200, { 'Content-Type': image.mime_type, 'Content-Length': photo.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' });
      return res.end(photo);
    }
    if (req.method === 'POST' && ['/api/patient/assessments/analyze', '/api/patient/assessments'].includes(url.pathname)) {
      const body = await readBody(req, 36 * 1024 * 1024);
      if (body.consent !== true || String(body.consentVersion || '') !== ASSESSMENT_CONSENT_VERSION) return json(res, 400, { error: 'Review and accept the AI photo assessment consent before continuing.' });
      if (url.pathname.endsWith('/analyze')) {
        if (!process.env.ROBOFLOW_API_KEY) return json(res, 503, { error: 'AI analysis is not configured yet. Add a Roboflow API key to the project .env file, then restart the server.' });
        if (!Array.isArray(body.images) || body.images.length < 1 || body.images.length > 15) return json(res, 400, { error: 'Add at least one photo and no more than 15 images per assessment.' });
        const validAngles = new Set(['front', 'upper', 'lower']);
        const seenAngles = new Set();
        const seenValidationTokens = new Set();
        const usedValidationTokens = [];
        let totalBytes = 0;
        const images = [];
        for (const item of body.images) {
          const kind = String(item?.kind || '');
          const angle = String(item?.angle || '');
          if (!['teeth', 'xray'].includes(kind)) return json(res, 400, { error: 'One of the selected images is invalid. Use JPG, PNG, or WEBP files.' });
          if (kind === 'teeth' && (!validAngles.has(angle) || seenAngles.has(angle))) return json(res, 400, { error: 'Each teeth photo must use a valid, unique angle.' });
          if (kind === 'teeth') seenAngles.add(angle);
          const validationToken = String(item?.validationToken || '');
          if (validationToken) {
            if (seenValidationTokens.has(validationToken)) return json(res, 400, { error: 'A validated photo cannot be used more than once.' });
            seenValidationTokens.add(validationToken);
            const validated = validatedAssessmentImages.get(validationToken);
            if (!validated || validated.expiresAt <= Date.now() || validated.accountId !== account.account_id || validated.patientId !== patient.patient_id || validated.image.kind !== kind || validated.image.angle !== (kind === 'teeth' ? angle : '')) {
              return json(res, 400, { error: 'One of your photos needs to be checked again. Please remove and upload it again.' });
            }
            const image = validated.image;
            totalBytes += image.buffer.length;
            if (totalBytes > 14 * 1024 * 1024) return json(res, 413, { error: 'Keep the combined assessment images under 14 MB.' });
            images.push(image);
            usedValidationTokens.push(validationToken);
            continue;
          }
          const match = typeof item?.dataUrl === 'string' ? item.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/) : null;
          if (!match) return json(res, 400, { error: 'One of the selected images is invalid. Use JPG, PNG, or WEBP files.' });
          const buffer = Buffer.from(match[2], 'base64');
          if (!buffer.length || buffer.length > 5 * 1024 * 1024) return json(res, 413, { error: 'Each image must be 5 MB or smaller.' });
          const mimeMatchesBytes = match[1] === 'image/jpeg'
            ? buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
            : match[1] === 'image/png'
              ? buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
              : buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
          if (!mimeMatchesBytes) return json(res, 400, { error: 'An image file does not match its declared image format.' });
          totalBytes += buffer.length;
          if (totalBytes > 14 * 1024 * 1024) return json(res, 413, { error: 'Keep the combined assessment images under 14 MB.' });
          const name = stripControlChars(String(item.fileName || 'assessment-photo').replace(/[\\/]/g, '_')).trim().slice(0, 180) || 'assessment-photo';
          const imageWidth = Math.trunc(Number(item.width || 0));
          const imageHeight = Math.trunc(Number(item.height || 0));
          if (!Number.isInteger(imageWidth) || !Number.isInteger(imageHeight) || imageWidth < 320 || imageHeight < 240 || imageWidth > 12000 || imageHeight > 12000) return json(res, 400, { error: 'Each photo must be at least 320 × 240 pixels and no larger than 12,000 pixels per side.' });
          images.push({ kind, angle: kind === 'teeth' ? angle : '', name, mimeType: match[1], buffer, imageWidth, imageHeight });
        }
        const requiredAngles = ['front', 'upper', 'lower'];
        const missingAngles = requiredAngles.filter(angle => !seenAngles.has(angle));
        if (missingAngles.length) {
          const labels = { front: 'Front View', upper: 'Upper Teeth', lower: 'Lower Teeth' };
          return json(res, 400, { error: `Complete all required photo views before generating a report. Missing: ${missingAngles.map(angle => labels[angle]).join(', ')}.` });
        }
        let result;
        try { result = await analyzeOralHealthImages(images); }
        catch (error) {
          console.error('Roboflow oral assessment failed:', error.code || 'ROBOFLOW_WORKFLOW_ERROR', error.message);
          return json(res, error.status || 503, { error: error.message || 'The AI analysis could not be completed. Please try again.', code: error.code || 'ROBOFLOW_WORKFLOW_ERROR' });
        }
        const now = Date.now();
        for (const [token, pending] of pendingAssessments) if (pending.expiresAt <= now || pending.accountId === account.account_id) pendingAssessments.delete(token);
        while (pendingAssessments.size >= 5) pendingAssessments.delete(pendingAssessments.keys().next().value);
        const analysisToken = randomBytes(32).toString('base64url');
        pendingAssessments.set(analysisToken, { accountId: account.account_id, patientId: patient.patient_id, images, result, consentedAt: new Date(now).toISOString(), expiresAt: now + PENDING_ASSESSMENT_TTL });
        for (const token of usedValidationTokens) validatedAssessmentImages.delete(token);
        return json(res, 200, { analysisToken, result });
      }

      const analysisToken = String(body.analysisToken || '');
      const pending = pendingAssessments.get(analysisToken);
      if (!pending || pending.expiresAt <= Date.now() || pending.accountId !== account.account_id || pending.patientId !== patient.patient_id) {
        pendingAssessments.delete(analysisToken);
        return json(res, 400, { error: 'This analysis has expired. Analyze your photos again before saving.' });
      }
      const images = pending.images;
      const assessmentId = randomUUID();
      const timestamp = new Date().toISOString();
      const directory = resolve(dataDir, 'assessment-uploads', account.account_id, assessmentId);
      mkdirSync(directory, { recursive: true });
      try {
        const storedImageRefs = images.map(image => {
          const imageId = randomUUID();
          const extension = image.mimeType === 'image/jpeg' ? '.jpg' : image.mimeType === 'image/png' ? '.png' : '.webp';
          const storagePath = `assessment-uploads/${account.account_id}/${assessmentId}/${imageId}${extension}`;
          return { image, imageId, storagePath };
        });
        const result = {
          ...pending.result,
          annotatedImages: (pending.result.annotatedImages || []).map(annotated => {
            const imageRef = storedImageRefs[annotated.imageIndex];
            return imageRef ? { ...annotated, imageId: imageRef.imageId, url: `/api/patient/assessments/${encodeURIComponent(assessmentId)}/images/${encodeURIComponent(imageRef.imageId)}` } : annotated;
          }),
        };
        (await db.exec('BEGIN IMMEDIATE'));
        const confidenceScores = result.findings.map(({ label, confidence, angle, imageIndex, box }) => ({ label, confidence, angle, imageIndex, box }));
        (await db.prepare(`INSERT INTO oral_assessments (assessment_id, patient_id, status, consent_version, consented_at, result_json, assessment_date, risk_level, findings_json, recommendations_json, confidence_scores_json, tooth_mapping_json, odontogram_data_json, annotated_images_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(assessmentId, patient.patient_id, 'completed', ASSESSMENT_CONSENT_VERSION, pending.consentedAt, JSON.stringify(result), result.assessedAt || timestamp, result.riskLevel || null, JSON.stringify(result.findings || []), JSON.stringify(result.recommendations || []), JSON.stringify(confidenceScores), JSON.stringify([]), JSON.stringify({}), JSON.stringify(result.annotatedImages || []), timestamp));
        const insertImage = db.prepare('INSERT INTO oral_assessment_images (image_id, assessment_id, image_kind, angle, original_name, mime_type, file_size, image_width, image_height, storage_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (const { image, imageId, storagePath } of storedImageRefs) {
          const imagePath = resolve(dataDir, storagePath);
          writeFileSync(imagePath, image.buffer, { flag: 'wx', mode: productionMode ? 0o600 : 0o644 });
          if (productionMode) chmodSync(imagePath, 0o600);
          (await insertImage.run(imageId, assessmentId, image.kind, image.angle, image.name, image.mimeType, image.buffer.length, image.imageWidth, image.imageHeight, storagePath, timestamp));
        }
        (await db.exec('COMMIT'));
        pending.result = result;
      } catch (error) {
        try { (await db.exec('ROLLBACK')); } catch { /* The transaction may already have rolled back. */ }
        rmSync(directory, { recursive: true, force: true });
        throw error;
      }
      pendingAssessments.delete(analysisToken);
      notify('patients');
      notify('oral-assessments');
      const savedImages = (await db.prepare('SELECT image_id, image_kind, angle, original_name, mime_type, file_size, image_width, image_height FROM oral_assessment_images WHERE assessment_id=?').all(assessmentId));
      return json(res, 201, { assessment: { id: assessmentId, status: 'completed', result: pending.result, message: 'Your assessment was saved to history.', createdAt: timestamp, images: savedImages.map(image => ({ id: image.image_id, kind: image.image_kind, angle: image.angle || '', fileName: image.original_name, mimeType: image.mime_type, sizeBytes: image.file_size, width: image.image_width, height: image.image_height, url: `/api/patient/assessments/${encodeURIComponent(assessmentId)}/images/${encodeURIComponent(image.image_id)}` })) } });
    }
    if (req.method === 'GET' && url.pathname === '/api/patient/appointments') {
      const patient = (await db.prepare('SELECT patient_id FROM patients WHERE account_id=?').get(account.account_id));
      if (!patient) return json(res, 200, { appointments: [] });
      const appointments = (await db.prepare(`
        SELECT appointment_id AS id, starts_at AS startsAt, service, status, notes, created_at AS createdAt
        FROM appointments
        WHERE patient_id=?
        ORDER BY starts_at DESC
      `).all(patient.patient_id));
      return json(res, 200, { appointments });
    }
    if (req.method === 'PUT' && url.pathname === '/api/patient/registration') {
      const body = await readBody(req);
      const patient = body.patient && typeof body.patient === 'object' ? body.patient : {};
      const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
      const fullName = String(patient.fullName || account.full_name || '').trim().replace(/\s+/g, ' ');
      const address = String(patient.address || '').trim();
      const phone = String(patient.phone || account.phone || '').trim();
      const birthday = String(patient.birthday || '').trim();
      const sex = String(patient.sex || '').trim();
      const civilStatus = String(patient.civilStatus || '').trim();
      const age = Number(patient.age);
      if (!body.consent) return json(res, 400, { error: 'Confirm the patient information before submitting registration.' });
      if (fullName.length < 2 || !address || !phone || !Number.isInteger(age) || age < 1 || age > 120 || !birthday || !Number.isFinite(Date.parse(`${birthday}T00:00:00Z`)) || !['Male', 'Female'].includes(sex) || !['Single', 'Married', 'Widowed', 'Separated'].includes(civilStatus)) {
        return json(res, 400, { error: 'Complete the required patient information before submitting registration.' });
      }
      if (!/^\+?[\d\s().-]{7,20}$/.test(phone)) return json(res, 400, { error: 'Enter a valid phone number.' });
      if (!String(patient.guardianName || '').trim() || !/^\d{10,15}$/.test(String(patient.guardianPhone || '').replace(/\D/g, ''))) return json(res, 400, { error: 'Enter the patient or guardian name and a valid contact number.' });
      const requiredAnswers = ['hospitalized', 'physicianCare', 'medications', 'allergies', 'bleeding', 'seriousIllness', 'mouthGrowths', ...(sex === 'Female' ? ['pregnant'] : [])];
      if (requiredAnswers.some(key => !['Yes', 'No'].includes(String(answers[key] || '')))) return json(res, 400, { error: 'Answer each required medical history question before submitting.' });
      const requiredDetails = [['hospitalized', 'hospitalizedDetails'], ['physicianCare', 'physicianDetails'], ['medications', 'medicationDetails'], ['allergies', 'allergyDetails'], ['bleeding', 'bleedingDetails'], ['seriousIllness', 'seriousIllnessDetails'], ['mouthGrowths', 'mouthGrowthDetails']];
      if (requiredDetails.some(([question, detail]) => answers[question] === 'Yes' && !String(answers[detail] || '').trim())) return json(res, 400, { error: 'Please complete the details for each medical history answer marked Yes.' });
      if (Array.isArray(answers.conditions) && answers.conditions.includes('Other') && !String(answers.otherCondition || '').trim()) return json(res, 400, { error: 'Please describe the other medical condition you selected.' });
      const linkedPatient = (await db.prepare('SELECT patient_id FROM patients WHERE account_id=?').get(account.account_id));
      if (!linkedPatient) return json(res, 404, { error: 'Your patient record is not available. Please sign in again.' });
      const nameParts = fullName.split(' ').filter(Boolean);
      const firstName = nameParts.shift() || '';
      const lastName = nameParts.length ? nameParts.pop() : firstName;
      const middleName = nameParts.join(' ');
      const timestamp = new Date().toISOString();
      const conditions = Array.isArray(answers.conditions) ? answers.conditions.map(value => String(value).trim()).filter(Boolean) : [];
      const otherCondition = String(answers.otherCondition || '').trim();
      if (otherCondition && !conditions.includes('Other')) conditions.push(`Other: ${otherCondition}`);
      const allergySummary = answers.allergies === 'Yes' ? String(answers.allergyDetails || 'Yes; details not provided').trim() : answers.allergies === 'No' ? 'None reported' : '';
      const medicationSummary = answers.medications === 'Yes' ? String(answers.medicationDetails || 'Yes; details not provided').trim() : answers.medications === 'No' ? 'None reported' : '';
      const seriousSummary = answers.seriousIllness === 'Yes' ? String(answers.seriousIllnessDetails || 'Yes; details not provided').trim() : answers.seriousIllness === 'No' ? 'None reported' : '';
      const pregnancySummary = answers.pregnant || '';
      const mouthSummary = answers.mouthGrowths === 'Yes' ? String(answers.mouthGrowthDetails || 'Yes; details not provided').trim() : answers.mouthGrowths === 'No' ? 'None reported' : '';
      const responseLabels = {
        hospitalized: 'Hospitalized during the past 2 years', physicianCare: 'Under a physician’s care during the past 2 years',
        medications: 'Taken medications during the past 2 years', allergies: 'Known allergies to penicillin, drugs, or medicines',
        bleeding: 'Excessive bleeding requiring special treatment', pregnant: 'Currently pregnant',
        seriousIllness: 'Other serious illnesses', mouthGrowths: 'Sores, lumps, or unusual growths in the mouth',
      };
      const responseDetails = {
        hospitalizedDetails: 'Hospitalization details', physicianDetails: 'Physician care details', medicationDetails: 'Medication details',
        allergyDetails: 'Allergy details', bleedingDetails: 'Bleeding details', pregnancyDetails: 'Pregnancy details',
        seriousIllnessDetails: 'Serious illness details', mouthGrowthDetails: 'Mouth concern details', otherCondition: 'Other condition',
      };
      const registrationResponses = {
        submittedAt: String(body.submittedAt || timestamp),
        questions: Object.entries(responseLabels).filter(([key]) => key !== 'pregnant' || sex === 'Female').map(([key, label]) => ({ label, answer: String(answers[key] || '') })),
        details: Object.entries(responseDetails).filter(([key]) => answers[key]).map(([key, label]) => ({ label, answer: String(answers[key]) })),
        conditions,
        referredBy: String(patient.referredBy || '').trim(),
        guardianName: String(patient.guardianName || '').trim(),
        guardianPhone: String(patient.guardianPhone || '').trim(),
      };
      (await db.exec('BEGIN IMMEDIATE'));
      try {
        (await db.prepare('UPDATE patient_accounts SET full_name=?, first_name=?, middle_name=?, last_name=?, phone=?, date_of_birth=?, gender=?, address=? WHERE account_id=?')
          .run(fullName, firstName, middleName || null, lastName, phone, birthday, sex, address, account.account_id));
        (await db.prepare(`UPDATE patients SET full_name=?, first_name=?, last_name=?, email=?, phone=?, date_of_birth=?, gender=?, address=?, age=?, civil_status=?, occupation=?, height=?, weight=?, referred_by=?, parent_guardian_name=?, parent_guardian_number=?, updated_at=? WHERE account_id=?`)
          .run(fullName, firstName, lastName, account.email, phone, birthday, sex, address, age, civilStatus, String(patient.occupation || '').trim() || null,
            patient.height === '' || patient.height == null ? null : Number(patient.height), patient.weight === '' || patient.weight == null ? null : Number(patient.weight),
            String(patient.referredBy || '').trim() || null, String(patient.guardianName || '').trim() || null, String(patient.guardianPhone || '').trim() || null,
            timestamp, account.account_id));
        (await db.prepare(`INSERT INTO medical_history (medical_history_id, patient_id, allergies, medications, medical_conditions, serious_illnesses, pregnancy_status, mouth_growths, clinical_notes, responses_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(patient_id) DO UPDATE SET allergies=excluded.allergies, medications=excluded.medications, medical_conditions=excluded.medical_conditions,
          serious_illnesses=excluded.serious_illnesses, pregnancy_status=excluded.pregnancy_status, mouth_growths=excluded.mouth_growths, responses_json=excluded.responses_json, updated_at=excluded.updated_at`)
          .run(randomUUID(), linkedPatient.patient_id, allergySummary || null, medicationSummary || null, conditions.join(', ') || null, seriousSummary || null,
            pregnancySummary || null, mouthSummary || null, null, JSON.stringify(registrationResponses), timestamp, timestamp));
        (await db.exec('COMMIT'));
        notify('patients');
        notify('medicalHistory');
        return json(res, 200, { ok: true, patientNumber: (await db.prepare('SELECT patient_number FROM patients WHERE patient_id=?').get(linkedPatient.patient_id))?.patient_number || '' });
      } catch (error) {
        (await db.exec('ROLLBACK'));
        if (error.code === '23505' || String(error.message).includes('UNIQUE')) return json(res, 409, { error: 'This patient registration is already linked to another account.' });
        throw error;
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/patient/portal') {
      try { return json(res, 200, (await handlePatientPortalData(db, account.account_id))); }
      catch (error) { return json(res, error.status || 500, { error: error.status ? error.message : 'Your patient information could not be loaded.' }); }
    }
    if (req.method === 'GET' && url.pathname === '/api/patient/messages') {
      try {
        const messages = (await listPatientMessages(db, account.account_id));
        return json(res, 200, { messages, unreadCount: messages.filter(message => message.direction === 'sent' && !message.isRead).length });
      } catch (error) { return json(res, error.status || 500, { error: error.status ? error.message : 'Your messages could not be loaded.' }); }
    }
    if (req.method === 'POST' && url.pathname === '/api/patient/messages/read') {
      try {
        const result = (await markPatientMessagesRead(db, account.account_id));
        if (result.updated) notify('messages');
        return json(res, 200, result);
      } catch (error) { return json(res, error.status || 500, { error: error.status ? error.message : 'Your messages could not be marked as read.' }); }
    }
    if (req.method === 'POST' && url.pathname === '/api/patient/messages') {
      const body = await readBody(req);
      const message = stripControlChars(body.message).trim();
      if (!message) return json(res, 400, { error: 'Write a message before sending it.' });
      if (message.length > 2000) return json(res, 413, { error: 'Keep messages to 2,000 characters or fewer.' });
      const limitWindow = Date.now() - 60_000;
      const recentSends = (patientMessageRateLimits.get(account.account_id) || []).filter(sentAt => sentAt > limitWindow);
      if (recentSends.length >= 12) return json(res, 429, { error: 'You’ve sent several messages recently. Please wait a minute and try again.' });
      recentSends.push(Date.now());
      patientMessageRateLimits.set(account.account_id, recentSends);
      (await db.exec('BEGIN'));
      try {
        const patient = (await db.prepare('SELECT full_name FROM patients WHERE account_id=?').get(account.account_id));
        const automaticReply = patientChatAutoReply(message, patient?.full_name);
        const result = (await createPatientChatExchange(db, account.account_id, { message, autoReply: automaticReply.message, autoReplyKind: automaticReply.kind }));
        (await db.exec('COMMIT'));
        notify('messages');
        notify('notifications');
        return json(res, 201, result);
      } catch (error) {
        (await db.exec('ROLLBACK'));
        return json(res, error.status || 500, { error: error.status ? error.message : 'Your message could not be sent.' });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/patient/appointments') {
      const body = await readBody(req);
      const service = String(body.service || '').trim();
      const startsAt = String(body.startsAt || '').trim();
      const notes = String(body.notes || '').trim().slice(0, 2000);
      const parsedDate = Date.parse(startsAt);
      const normalizedStartsAt = Number.isFinite(parsedDate) ? new Date(parsedDate).toISOString() : '';
      const clinicParts = Number.isFinite(parsedDate) ? new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(parsedDate)).reduce((parts, item) => ({ ...parts, [item.type]: item.value }), {}) : {};
      const clinicDate = clinicParts.year ? `${clinicParts.year}-${clinicParts.month}-${clinicParts.day}` : '';
      const clinicHour = Number(clinicParts.hour);
      const clinicMinute = Number(clinicParts.minute);
      if (!clinicTreatmentOptions.includes(service)) return json(res, 400, { error: 'Choose a procedure or consultation from the clinic’s current appointment options.' });
      if (!Number.isFinite(parsedDate) || parsedDate < Date.now() || !isValidClinicDate(clinicDate)) return json(res, 400, { error: 'Choose a future appointment date and time.' });
      const { weekday } = clinicDateParts(clinicDate);
      if (!CLINIC_OPEN_WEEKDAYS.includes(weekday) || CLINIC_HOLIDAYS.includes(clinicDate)) return json(res, 400, { error: 'The clinic is closed on that date. Choose another date.' });
      if (clinicMinute !== 0 || clinicHour < CLINIC_OPEN_HOUR || clinicHour >= CLINIC_CLOSE_HOUR || (clinicHour - CLINIC_OPEN_HOUR) * 60 % CLINIC_SLOT_MINUTES !== 0) return json(res, 400, { error: 'Choose an available time during clinic hours, Monday through Saturday, 9:00 AM to 5:00 PM.' });
      const patient = (await db.prepare('SELECT patient_id FROM patients WHERE account_id=?').get(account.account_id));
      if (!patient) return json(res, 404, { error: 'Your patient profile is not available. Please contact the clinic.' });
      const appointmentId = randomUUID();
      (await db.exec('BEGIN IMMEDIATE'));
      try {
        if ((await db.prepare("SELECT 1 FROM appointments WHERE clinic_id=? AND starts_at=? AND status <> 'cancelled'").get('default-clinic', normalizedStartsAt))) {
          (await db.exec('ROLLBACK'));
          return json(res, 409, { error: 'That time was just booked. Please choose another available time.' });
        }
        (await db.prepare('INSERT INTO appointments (appointment_id, clinic_id, patient_id, starts_at, service, status, notes, appointment_date, appointment_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(appointmentId, 'default-clinic', patient.patient_id, normalizedStartsAt, service, 'scheduled', notes || null, clinicDate, `${pad(clinicHour)}:${pad(clinicMinute)}`));
        (await db.exec('COMMIT'));
      } catch (error) {
        (await db.exec('ROLLBACK'));
        if (error.code === '23505') return json(res, 409, { error: 'That time was just booked. Please choose another available time.' });
        throw error;
      }
      return json(res, 201, { appointment: { id: appointmentId, startsAt: normalizedStartsAt, service, status: 'scheduled' } });
    }
    return json(res, 404, { error: 'Not found.' });
  }

  return json(res, 404, { error: 'Not found.' });
}

const server = createServer((req, res) => {
  db.withContext(async () => {
    if (productionMode && process.env.REQUIRE_HTTPS === 'true') {
      const requestPath = new URL(req.url || '/', 'http://localhost').pathname;
      const https = Boolean(req.socket.encrypted)
        || (process.env.TRUST_PROXY === 'true' && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
      if (!https && requestPath !== '/api/health') return json(res, 426, { error: 'Use the secure HTTPS address for this service.' });
      if (https) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    }
    auditAdminRequest(req, res);
    await handle(req, res);
  }).catch(error => {
    console.error('API request failed:', error.message);
    json(res, error.status || 500, { error: error.status ? error.message : 'The server could not complete the request.' });
  });
});
server.listen(port, host, () => console.log(`Clinic app listening on ${productionMode ? 'production' : 'development'} mode at ${host}:${port}`));
