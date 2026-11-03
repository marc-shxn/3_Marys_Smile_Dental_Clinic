import process from 'node:process';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const viteCli = resolve(root, 'node_modules/vite/bin/vite.js');
const children = [
  spawn(process.execPath, [resolve(root, 'server/index.js')], { cwd: root, stdio: 'inherit', env: process.env }),
  spawn(process.execPath, [viteCli, '--host', '127.0.0.1'], { cwd: root, stdio: 'inherit', env: process.env }),
];
let shuttingDown = false;
function stop(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) if (!child.killed) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', error => { console.error(error); stop(1); });
  child.on('exit', code => { if (!shuttingDown && code !== 0) stop(code || 1); });
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
