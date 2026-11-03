import { createInterface } from 'node:readline/promises';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../server/database.js';
import '../server/loadLocalEnv.js';

const email = String(process.argv[2] || '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Usage: npm run admin:mfa:reset -- admin@example.com');
const db = createDatabase();
const terminal = createInterface({ input: process.stdin, output: process.stdout });
try {
  const admin = await db.prepare('SELECT admin_id, email FROM admin_users WHERE email=? AND is_active=1').get(email);
  if (!admin) throw new Error('No active admin account was found for that email.');
  const confirmation = await terminal.question(`Type RESET MFA for ${admin.email} to continue: `);
  if (confirmation !== `RESET MFA for ${admin.email}`) throw new Error('MFA reset cancelled.');
  await db.withTransaction(async transaction => {
    await transaction.prepare('UPDATE admin_users SET mfa_secret_ciphertext=NULL, mfa_secret_iv=NULL, mfa_secret_tag=NULL, mfa_enabled_at=NULL, mfa_last_totp_step=NULL, updated_at=CURRENT_TIMESTAMP::text WHERE admin_id=?').run(admin.admin_id);
    await transaction.prepare('DELETE FROM admin_sessions WHERE admin_id=?').run(admin.admin_id);
    await transaction.prepare('DELETE FROM admin_mfa_challenges WHERE admin_id=?').run(admin.admin_id);
    await transaction.prepare(`INSERT INTO admin_activity_log (activity_id, admin_id, event_type, http_method, route, status_code)
      VALUES (?, NULL, 'Admin MFA reset by server operator', 'CLI', '/admin/mfa/reset', 200)`).run(randomUUID());
  });
  process.stdout.write(`MFA was cleared for ${admin.email}; active sessions were revoked. Run the MFA setup command before the account can sign in again.\n`);
} finally {
  terminal.close();
  await db.close();
}
