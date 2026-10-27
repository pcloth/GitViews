import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (typeof manifest.icon !== 'string' || !manifest.icon) {
  throw new Error('Set a PNG Marketplace icon in package.json.');
}
const bytes = await readFile(resolve(root, manifest.icon));
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
if (bytes.length < 33 || !bytes.subarray(0, 8).equals(signature) || bytes.toString('ascii', 12, 16) !== 'IHDR') {
  throw new Error(`Marketplace icon must be a valid PNG: ${manifest.icon}`);
}
const width = bytes.readUInt32BE(16);
const height = bytes.readUInt32BE(20);
if (width < 128 || height < 128 || width > 1024 || height > 1024) {
  throw new Error(`Marketplace icon is ${width}×${height}; each dimension must be between 128 and 1024 pixels.`);
}
console.log(`Marketplace icon verified: ${manifest.icon} (${width}×${height}).`);
