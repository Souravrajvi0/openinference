/**
 * Check catalog tags against Ollama library (best-effort).
 * Run: node scripts/verify-catalog.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.join(__dirname, '..', 'data', 'models.json');
const models = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

const res = await fetch('https://ollama.com/library', { signal: AbortSignal.timeout(20_000) }).catch(() => null);
let html = '';
if (res?.ok) html = await res.text();

const missing = [];
const found = [];

for (const m of models) {
  if (m.kind === 'embed') continue;
  const base = m.id.split(':')[0];
  const inPage = html.includes(`/${base}`) || html.includes(`"${base}"`);
  if (inPage) found.push(m.id);
  else missing.push(m.id);
}

console.log(`Catalog: ${models.length} models`);
console.log(`Likely on ollama.com/library: ${found.length}`);
console.log(`Not found in library HTML: ${missing.length}`);
if (missing.length > 0 && missing.length <= 40) {
  console.log('\nSample missing:', missing.slice(0, 20).join(', '));
}
