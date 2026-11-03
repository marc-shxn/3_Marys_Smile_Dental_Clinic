import process from 'node:process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDatabase } from '../server/database.js';
import '../server/loadLocalEnv.js';

const sourcePath = resolve(process.argv[2] || process.env.LEGACY_SQLITE_PATH || '');
const sourceUploads = resolve(process.env.LEGACY_UPLOADS_DIR || '');
const targetUploads = resolve(process.env.UPLOADS_DIR || '');
if (!process.argv[2] && !process.env.LEGACY_SQLITE_PATH) throw new Error('Provide the old SQLite file path: npm run db:import-sqlite -- <path-to-clinic.sqlite>.');
if (!existsSync(sourcePath)) throw new Error(`Legacy SQLite database not found: ${sourcePath}`);
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to the empty Supabase target through your private environment.');
if (!process.env.UPLOADS_DIR) throw new Error('Set UPLOADS_DIR to the new persistent image-storage directory.');
if (!process.env.LEGACY_UPLOADS_DIR) throw new Error('Set LEGACY_UPLOADS_DIR to the old data directory containing assessment-uploads.');
if (sourcePath === targetUploads || sourcePath.startsWith(targetUploads + sep)) throw new Error('The SQLite source must not be inside the new uploads directory.');

const transferOrder = [
  'clinics', 'patient_accounts', 'admin_users', 'app_settings', 'patients',
  'auth_sessions', 'admin_sessions', 'admin_login_throttles', 'patient_login_throttles', 'ip_login_throttles',
  'password_reset_throttles', 'email_verification_throttles', 'email_verification_tokens', 'admin_mfa_challenges',
  'admin_activity_log', 'pending_file_deletions', 'password_reset_tokens', 'medical_history', 'appointments', 'visits',
  'oral_assessments', 'oral_assessment_images', 'conversations', 'messages', 'notifications', 'invoices', 'receipts',
  'collection_goals', 'reports', 'legacy_imports',
];
const identifier = name => `"${String(name).replaceAll('"', '""')}"`;
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const newlyCopied = [];
const sqlite = new DatabaseSync(sourcePath, { readOnly: true });
const database = createDatabase();
try {
  const targetTables = new Set((await database.prepare("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'").all()).map(row => row.table_name));
  const missing = transferOrder.filter(table => !targetTables.has(table));
  if (missing.length) throw new Error(`Run database migrations first; target tables are missing: ${missing.join(', ')}.`);

  const targetRows = await Promise.all(transferOrder.map(async table => ({
    table_name: table,
    count: Number((await database.prepare(`SELECT COUNT(*)::bigint AS count FROM public.${identifier(table)}`).get()).count),
  })));
  const occupied = targetRows.filter(row => row.count > 0 && !(row.table_name === 'clinics' && row.count === 1));
  if (occupied.length) throw new Error(`Refusing to import into a populated Supabase target: ${occupied.map(row => `${row.table_name} (${row.count})`).join(', ')}.`);
  const defaultClinic = await database.prepare("SELECT clinic_id FROM public.clinics WHERE clinic_id='default-clinic'").get();
  if (targetRows.find(row => row.table_name === 'clinics')?.count === 1 && !defaultClinic) {
    throw new Error('The target clinics table is occupied by a row other than the expected migration-created default clinic.');
  }

  const sourceTables = new Set(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
  const knownSourceTables = new Set(transferOrder);
  const unhandledTables = [...sourceTables].filter(table => !table.startsWith('sqlite_') && !knownSourceTables.has(table));
  if (unhandledTables.length) {
    throw new Error(`The legacy database contains tables that are not covered by this importer: ${unhandledTables.join(', ')}. Review them before importing so no data is silently skipped.`);
  }
  const targetColumns = new Map();
  for (const table of transferOrder) {
    targetColumns.set(table, new Set((await database.prepare("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=? ORDER BY ordinal_position").all(table)).map(row => row.column_name)));
  }
  const filesToCopy = sourceTables.has('oral_assessment_images')
    ? sqlite.prepare('SELECT storage_path FROM oral_assessment_images').all().map(row => row.storage_path).filter(Boolean)
    : [];
  mkdirSync(targetUploads, { recursive: true, mode: 0o700 });

  const counts = {};
  await database.withTransaction(async transaction => {
    for (const table of transferOrder) {
      if (!sourceTables.has(table)) { counts[table] = 0; continue; }
      const sourceCols = sqlite.prepare(`PRAGMA table_info(${identifier(table)})`).all().map(row => row.name);
      const unsupported = sourceCols.filter(column => !targetColumns.get(table).has(column));
      if (unsupported.length) throw new Error(`The legacy ${table} table has columns not represented in PostgreSQL: ${unsupported.join(', ')}. Resolve these before importing so no data is silently dropped.`);
      const columns = sourceCols.filter(column => targetColumns.get(table).has(column));
      if (!columns.length) throw new Error(`No matching columns were found for ${table}.`);
      const rows = sqlite.prepare(`SELECT ${columns.map(identifier).join(', ')} FROM ${identifier(table)}`).all();
      for (const row of rows) {
        const placeholders = columns.map(() => '?').join(', ');
        const clinicUpdates = columns.filter(column => column !== 'clinic_id');
        const conflict = table === 'clinics'
          ? (clinicUpdates.length
            ? ` ON CONFLICT (clinic_id) DO UPDATE SET ${clinicUpdates.map(column => `${identifier(column)} = EXCLUDED.${identifier(column)}`).join(', ')}`
            : ' ON CONFLICT (clinic_id) DO NOTHING')
          : '';
        await transaction.prepare(`INSERT INTO public.${identifier(table)} (${columns.map(identifier).join(', ')}) VALUES (${placeholders})${conflict}`).run(...Object.values(row));
      }
      counts[table] = rows.length;
    }

    const visited = new Set();
    for (const storagePath of filesToCopy) {
      if (visited.has(storagePath)) continue;
      const parts = String(storagePath).replaceAll('\\', '/').split('/');
      if (parts[0] !== 'assessment-uploads' || parts.length !== 4 || parts.some(part => !part || part === '.' || part === '..')) {
        throw new Error('A stored assessment image has an unsafe path; no import was committed.');
      }
      const oldPath = resolve(sourceUploads, ...parts);
      const newPath = resolve(targetUploads, ...parts);
      if (!oldPath.startsWith(resolve(sourceUploads) + sep) || !newPath.startsWith(resolve(targetUploads) + sep)) throw new Error('An assessment image path escaped its storage directory.');
      if (!existsSync(oldPath)) throw new Error(`A referenced assessment image is missing: ${basename(oldPath)}.`);
      mkdirSync(resolve(newPath, '..'), { recursive: true, mode: 0o700 });
      copyFileSync(oldPath, newPath, 1);
      chmodSync(newPath, 0o600);
      newlyCopied.push(newPath);
      if (digest(oldPath) !== digest(newPath)) throw new Error(`Assessment image verification failed: ${basename(oldPath)}.`);
      visited.add(storagePath);
    }
    if (visited.size !== filesToCopy.length) throw new Error('One or more assessment image files were not copied.');
    for (const table of transferOrder) {
      if (table === 'clinics') continue; // The target contains the migration-created default clinic row.
      const actualCount = Number((await transaction.prepare(`SELECT COUNT(*)::bigint AS count FROM public.${identifier(table)}`).get()).count);
      if (actualCount !== counts[table]) throw new Error(`Row-count verification failed for ${table}: copied ${counts[table]}, found ${actualCount}.`);
    }
    await transaction.exec(`SELECT setval(pg_get_serial_sequence('public.visits', 'visit_id'), COALESCE((SELECT MAX(visit_id) FROM public.visits), 1), EXISTS (SELECT 1 FROM public.visits))`);
  });

  process.stdout.write('SQLite data import completed. Row counts copied by table:\n');
  for (const [table, count] of Object.entries(counts)) process.stdout.write(`  ${table}: ${count}\n`);
  process.stdout.write(`Assessment image files copied and SHA-256 verified: ${filesToCopy.length}\n`);
  process.stdout.write('Keep the old SQLite file and uploads directory unchanged until post-import validation and backup are complete.\n');
} catch (error) {
  for (const path of newlyCopied) { try { rmSync(path, { force: true }); } catch { /* Preserve the original import error. */ } }
  throw error;
} finally {
  sqlite.close();
  await database.close();
}
