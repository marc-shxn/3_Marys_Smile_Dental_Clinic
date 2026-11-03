import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function encryptionKey(value = process.env.ADMIN_MFA_ENCRYPTION_KEY) {
  const key = Buffer.from(String(value || ''), 'base64');
  if (key.length !== 32) throw new Error('ADMIN_MFA_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return key;
}

export function generateTotpSecret() {
  return encodeBase32(randomBytes(20));
}

export function otpAuthUri(secret, email) {
  const label = encodeURIComponent(`3 Mary’s Smile Dental Clinic:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent('3 Mary’s Smile Dental Clinic')}&algorithm=SHA1&digits=6&period=30`;
}

export function encryptTotpSecret(secret, key = encryptionKey()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

export function decryptTotpSecret(record, key = encryptionKey()) {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(record.mfa_secret_iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.mfa_secret_tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(record.mfa_secret_ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function verifyTotp(secret, candidate, time = Date.now()) {
  return matchingTotpStep(secret, candidate, time) !== null;
}

export function matchingTotpStep(secret, candidate, time = Date.now()) {
  if (!/^\d{6}$/.test(String(candidate || ''))) return null;
  const step = Math.floor(time / 30000);
  for (let offset = -1; offset <= 1; offset += 1) {
    const expected = totpForStep(secret, step + offset);
    const actualBytes = Buffer.from(String(candidate));
    const expectedBytes = Buffer.from(expected);
    if (actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)) return step + offset;
  }
  return null;
}

export function totpCode(secret, time = Date.now()) {
  return totpForStep(secret, Math.floor(time / 30000));
}

function totpForStep(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(binary).padStart(6, '0');
}

function encodeBase32(bytes) {
  let result = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += alphabet[(buffer << (5 - bits)) & 31];
  return result;
}

function decodeBase32(value) {
  let buffer = 0;
  let bits = 0;
  const result = [];
  for (const character of String(value || '').toUpperCase().replace(/=+$/g, '')) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('Invalid MFA secret.');
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      result.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(result);
}
