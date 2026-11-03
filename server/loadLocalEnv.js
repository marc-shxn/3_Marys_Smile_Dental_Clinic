import process from 'node:process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV !== 'production') {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const envPath = join(projectRoot, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const entry = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!entry || entry[1] in process.env) continue;
      process.env[entry[1]] = entry[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}
