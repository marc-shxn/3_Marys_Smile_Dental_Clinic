import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { runOralHealthWorkflow } from '../server/roboflowWorkflow.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(projectRoot, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const entry = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!entry || entry[1] in process.env) continue;
    process.env[entry[1]] = entry[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  CRC_TABLE[index] = value >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function makeSyntheticMouthImage() {
  const width = 512;
  const height = 384;
  const stride = width * 3 + 1;
  const pixels = Buffer.alloc(stride * height);
  const teeth = [];
  for (let index = 0; index < 8; index += 1) {
    const x = 118 + index * 38;
    teeth.push({ left: x, right: x + 32, top: 148, bottom: 184 });
    teeth.push({ left: x, right: x + 32, top: 211, bottom: 248 });
  }

  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    pixels[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const mouth = ((x - 256) / 192) ** 2 + ((y - 198) / 86) ** 2 <= 1;
      let red = 238;
      let green = 229;
      let blue = 220;
      if (mouth) [red, green, blue] = [73, 30, 43];
      if (mouth && y >= 178 && y <= 194) [red, green, blue] = [184, 99, 113];
      if (teeth.some(box => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom)) {
        [red, green, blue] = [250, 249, 239];
      }
      const offset = row + 1 + x * 3;
      pixels[offset] = red;
      pixels[offset + 1] = green;
      pixels[offset + 2] = blue;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function outputType(value) {
  if (typeof value === 'string' && (value.length > 64_000 || /^data:image\//i.test(value))) return 'image data (not printed)';
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

try {
  const image = { buffer: makeSyntheticMouthImage() };
  const result = await runOralHealthWorkflow(image);
  console.log(JSON.stringify({
    workflow: 'AI Oral Health Assessment vai-oral-health-assessment-1-yolo26s-t1 Logic',
    smokeImage: 'synthetic mouth illustration (no patient data)',
    imageBytes: image.buffer.length,
    outputNames: result.outputNames,
    outputTypes: Object.fromEntries(result.outputNames.map(name => [name, outputType(result.outputEntry[name])])),
  }, null, 2));
} catch (error) {
  console.error(error.message || 'Roboflow workflow smoke check failed.');
  process.exitCode = 1;
}
