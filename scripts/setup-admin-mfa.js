import { createInterface } from 'node:readline/promises';
import { createDatabase } from '../server/database.js';
import '../server/loadLocalEnv.js';
import { encryptTotpSecret, generateTotpSecret, matchingTotpStep, otpAuthUri } from '../server/adminMfa.js';

const email = String(process.argv[2] || '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Usage: npm run admin:mfa:setup -- admin@example.com');
const db = createDatabase();
const terminal = createInterface({ input: process.stdin, output: process.stdout });
try {
  const admin = await db.prepare('SELECT admin_id, email, mfa_enabled_at FROM admin_users WHERE email=? AND is_active=1').get(email);
  if (!admin) throw new Error('No active admin account was found for that email.');
  if (admin.mfa_enabled_at) throw new Error('MFA is already enabled. Use the documented account recovery process to replace it.');
  const secret = generateTotpSecret();
  process.stdout.write(`Add this account to an authenticator app using this setup URI:\n${otpAuthUri(secret, admin.email)}\n\nManual secret: ${secret}\n`);
  process.stdout.write('Enter the current six-digit authenticator code to finish setup.\n');
  const code = (await terminal.question('Authenticator code: ')).trim();
  const lastTotpStep = matchingTotpStep(secret, code);
  if (lastTotpStep === null) throw new Error('That code did not validate. No MFA secret was saved; try setup again.');
  const encrypted = encryptTotpSecret(secret);
  await db.withTransaction(async transaction => {
    await transaction.prepare('UPDATE admin_users SET mfa_secret_ciphertext=?, mfa_secret_iv=?, mfa_secret_tag=?, mfa_enabled_at=CURRENT_TIMESTAMP::text, mfa_last_totp_step=?, updated_at=CURRENT_TIMESTAMP::text WHERE admin_id=?')
      .run(encrypted.ciphertext, encrypted.iv, encrypted.tag, lastTotpStep, admin.admin_id);
    await transaction.prepare('DELETE FROM admin_sessions WHERE admin_id=?').run(admin.admin_id);
  });
  process.stdout.write(`MFA is enabled for ${admin.email}. Existing admin sessions were revoked. Keep the authenticator and encryption key available; loss of either requires operator recovery.\n`);
} finally {
  terminal.close();
  await db.close();
}
