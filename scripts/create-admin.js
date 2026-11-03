import process from 'node:process';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { createDatabase } from '../server/database.js';
import '../server/loadLocalEnv.js';

if (process.env.NODE_ENV === 'production') process.umask(0o077);

function askHidden(prompt) {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(new Error('Run this command in an interactive terminal so the password can be entered without being shown.'));
  }
  return new Promise((resolveValue, reject) => {
    let value = '';
    const finish = (error = null) => {
      input.setRawMode(false);
      input.pause();
      input.removeListener('data', onData);
      process.stdout.write('\n');
      if (error) reject(error);
      else resolveValue(value);
    };
    const onData = chunk => {
      for (const character of chunk) {
        if (character === '\u0003') return finish(new Error('Admin setup cancelled.'));
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u0008' || character === '\u007f') {
          if (value.length) { value = value.slice(0, -1); process.stdout.write('\b \b'); }
          continue;
        }
        if (character >= ' ' && character !== '\u007f') { value += character; process.stdout.write('•'); }
      }
    };
    process.stdout.write(prompt);
    input.setEncoding('utf8');
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function askRequiredText(prompt, isValid, validationMessage) {
  while (true) {
    const answer = (await terminal.question(prompt)).trim();
    if (isValid(answer)) return answer;
    process.stdout.write(`${validationMessage}\n`);
  }
}

let database;
let terminal;
try {
  terminal = createInterface({ input: process.stdin, output: process.stdout });
  process.stdout.write('Create admin account\n');
  const fullName = (await askRequiredText(
    'Step 1 of 5 — Admin full name: ',
    value => value.length >= 2 && value.length <= 120,
    'Enter the admin’s full name (2–120 characters).',
  )).replace(/\s+/g, ' ');
  const email = (await askRequiredText(
    'Step 2 of 5 — Admin email address: ',
    value => emailPattern.test(value) && value.length <= 254,
    'Enter a valid email address.',
  )).toLowerCase();
  const phone = (await terminal.question('Step 3 of 5 — Admin phone number (optional): ')).trim();
  terminal.close();
  terminal = null;

  if (phone.length > 30) throw new Error('Enter a phone number with 30 characters or fewer.');

  const password = await askHidden('Step 4 of 5 — Admin password (12 or more characters): ');
  const confirmation = await askHidden('Step 5 of 5 — Confirm password: ');
  if (password.length < 12 || password.length > 256) throw new Error('Use a password between 12 and 256 characters.');
  if (password !== confirmation) throw new Error('The passwords do not match.');

  database = createDatabase();
  const schema = await database.prepare("SELECT to_regclass('public.admin_users') AS admin_users").get();
  if (!schema?.admin_users) throw new Error('Supabase schema is missing. Run npm run db:migrate before creating an admin account.');
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  await database.prepare('INSERT INTO admin_users (admin_id, full_name, email, phone, password_hash, password_salt) VALUES (?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), fullName, email, phone, hash, salt);
  process.stdout.write(`Admin account created for ${email}. The database stores only its salted password hash.\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
} finally {
  terminal?.close();
  await database?.close();
}
