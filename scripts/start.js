import process from 'node:process';
import { assertProductionMailConfigured } from '../server/email.js';

process.env.NODE_ENV = 'production';
if (process.env.STAGING_TEST_MODE === 'true' || process.env.ROBOFLOW_TEST_ENDPOINT) {
  throw new Error('Test-only inference overrides cannot be enabled through the production startup script.');
}
const required = ['DATABASE_URL', 'UPLOADS_DIR', 'ROBOFLOW_API_KEY', 'ADMIN_MFA_ENCRYPTION_KEY'];
const missing = required.filter(name => !String(process.env[name] || '').trim());
if (missing.length) throw new Error(`Production startup requires: ${missing.join(', ')}.`);
if (process.env.REQUIRE_HTTPS !== 'true' || process.env.TRUST_PROXY !== 'true') {
  throw new Error('Production startup requires REQUIRE_HTTPS=true and TRUST_PROXY=true behind an HTTPS reverse proxy.');
}
assertProductionMailConfigured();
await import('../server/index.js');
