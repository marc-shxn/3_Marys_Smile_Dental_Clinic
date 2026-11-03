import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../server/database.js';
import '../server/loadLocalEnv.js';

const root = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
const database = createDatabase();

try {
  await database.exec(`CREATE TABLE IF NOT EXISTS public.app_schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  await database.exec('ALTER TABLE public.app_schema_migrations ENABLE ROW LEVEL SECURITY; REVOKE ALL ON TABLE public.app_schema_migrations FROM anon, authenticated');
  const applied = new Set((await database.prepare('SELECT version FROM public.app_schema_migrations').all()).map(row => row.version));
  const files = (await readdir(root)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(root, file), 'utf8');
    await database.withTransaction(async transaction => {
      await transaction.exec(sql);
      await transaction.prepare('INSERT INTO public.app_schema_migrations (version) VALUES (?)').run(file);
    });
    process.stdout.write(`Applied ${file}\n`);
  }
  process.stdout.write('Database migrations are up to date.\n');
} finally {
  await database.close();
}
