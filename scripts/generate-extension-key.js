import crypto from 'node:crypto';
import fs from 'node:fs';

const { publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'der' },
});

const base64Key = publicKey.toString('base64');
const sha256 = crypto.createHash('sha256').update(publicKey).digest();
const id = Array.from(sha256.slice(0, 16)).map(b => {
  return String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 0x0f));
}).join('');

console.log('Fixed Extension ID:', id);
console.log('Manifest Key (base64 length):', base64Key.length);

const manifestPath = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\extension\\manifest.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.key = base64Key;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('Updated manifest.json with deterministic key!');
console.log('Canonical Extension ID is now:', id);
