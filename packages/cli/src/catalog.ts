import fs from 'node:fs';
import path from 'node:path';

import { configDir } from './config';
import { VERSION } from './version';
import type { CatalogModel } from './recommend';

// Fetchable catalog (f1 §6, decided: fetchable with bundled fallback).
// `oi update` refreshes the repository index without a CLI release. The bundled
// data/models.json stays as the offline baseline; a fetched copy is cached in
// ~/.openinference/catalog.json and preferred while it matches this CLI version.

export const CATALOG_URL =
  'https://raw.githubusercontent.com/Souravrajvi0/openinference/dev/packages/cli/data/models.json';

type CatalogCache = {
  fetchedAt: string;
  cliVersion: string;
  source: string;
  models: CatalogModel[];
};

function cachePath(): string {
  return path.join(configDir(), 'catalog.json');
}

/** A fetched catalog must be plausibly complete before we trust it. */
export function validateCatalog(data: unknown): data is CatalogModel[] {
  if (!Array.isArray(data) || data.length < 50) return false;
  return data.every(
    (m) =>
      m !== null &&
      typeof m === 'object' &&
      typeof (m as CatalogModel).id === 'string' &&
      typeof (m as CatalogModel).name === 'string' &&
      typeof (m as CatalogModel).ramGb === 'number' &&
      typeof (m as CatalogModel).sizeMb === 'number' &&
      typeof (m as CatalogModel).quality === 'number',
  );
}

/**
 * The cached (fetched) catalog, or null if absent/invalid/stale.
 * A cache written by a different CLI version is ignored — a fresh install ships
 * a bundled baseline at least as new, and `oi update` re-fetches on demand.
 */
export function loadCachedCatalog(): { models: CatalogModel[]; fetchedAt: string } | null {
  try {
    const raw = JSON.parse(fs.readFileSync(cachePath(), 'utf8')) as CatalogCache;
    if (raw.cliVersion !== VERSION) return null;
    if (!validateCatalog(raw.models)) return null;
    return { models: raw.models, fetchedAt: raw.fetchedAt };
  } catch {
    return null;
  }
}

function saveCache(models: CatalogModel[]): void {
  const cache: CatalogCache = {
    fetchedAt: new Date().toISOString(),
    cliVersion: VERSION,
    source: CATALOG_URL,
    models,
  };
  fs.mkdirSync(configDir(), { recursive: true });
  const tmp = cachePath() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, cachePath());
}

/** One-line provenance for status displays: "153 models · updated 2h ago" or "bundled". */
export function catalogProvenance(): string {
  const cached = loadCachedCatalog();
  if (!cached) return 'bundled with the CLI · refresh with `oi update`';
  const ageMs = Date.now() - new Date(cached.fetchedAt).getTime();
  const hours = Math.round(ageMs / 3_600_000);
  const age = hours < 1 ? 'just now' : hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
  return `updated ${age} via oi update`;
}

const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

type CheckLine = { glyph: string; label: string; text: string; hint?: string };

/** Refresh the catalog cache; returns the summary line + any added/removed detail. */
async function refreshCatalog(current: CatalogModel[]): Promise<{ line: CheckLine; detail: string[] }> {
  let fetched: unknown;
  try {
    const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fetched = await res.json();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return {
      line: { glyph: `${YELLOW}⚠${RESET}`, label: 'Catalog', text: `could not fetch (${m}) — keeping the current one` },
      detail: [],
    };
  }

  if (!validateCatalog(fetched)) {
    return {
      line: { glyph: `${YELLOW}⚠${RESET}`, label: 'Catalog', text: 'fetched index failed validation — keeping the current one' },
      detail: [],
    };
  }

  const before = new Set(current.map((m) => m.id));
  const after = new Set(fetched.map((m) => m.id));
  const added = fetched.filter((m) => !before.has(m.id));
  const removed = current.filter((m) => !after.has(m.id));
  saveCache(fetched);

  if (added.length === 0 && removed.length === 0) {
    return { line: { glyph: `${GREEN}✓${RESET}`, label: 'Catalog', text: `${fetched.length} models — up to date` }, detail: [] };
  }

  const detail: string[] = [];
  for (const m of added.slice(0, 8)) detail.push(`    + ${m.id}  ${DIM}${m.name}${RESET}`);
  if (added.length > 8) detail.push(`    ${DIM}…and ${added.length - 8} more new${RESET}`);
  for (const m of removed.slice(0, 8)) detail.push(`    - ${m.id}`);
  if (removed.length > 8) detail.push(`    ${DIM}…and ${removed.length - 8} more removed${RESET}`);
  return {
    line: {
      glyph: `${GREEN}✓${RESET}`,
      label: 'Catalog',
      text: `updated — ${fetched.length} models (${added.length} new${removed.length ? `, ${removed.length} removed` : ''})`,
    },
    detail,
  };
}

/** Latest published CLI version from the npm registry, or null. */
async function latestCliVersion(): Promise<string | null> {
  try {
    const res = await fetch('https://registry.npmjs.org/@openinference/cli', {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { 'dist-tags'?: { latest?: string } };
    return body['dist-tags']?.latest ?? null;
  } catch {
    return null;
  }
}

/** Latest Ollama release tag (e.g. "0.5.7"), or null. */
async function latestOllamaVersion(): Promise<string | null> {
  try {
    const res = await fetch('https://api.github.com/repos/ollama/ollama/releases/latest', {
      headers: { accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { tag_name?: string };
    return body.tag_name?.replace(/^v/, '') ?? null;
  } catch {
    return null;
  }
}

/**
 * `oi update` — brew-outdated semantics: refresh the catalog index AND report
 * what else is out of date (CLI, runtime). Reports only — never downloads
 * anything heavy without being asked (f1 principle 4).
 */
export async function runUpdate(opts: { currentCatalog: CatalogModel[] }): Promise<void> {
  console.log(`\n  Checking for updates…\n`);

  const { getOllamaVersion, resolveOllamaUrl } = await import('./ollama');
  const [catalog, cliLatest, ollamaLocal, ollamaLatest] = await Promise.all([
    refreshCatalog(opts.currentCatalog),
    latestCliVersion(),
    getOllamaVersion(resolveOllamaUrl()).catch(() => null),
    latestOllamaVersion(),
  ]);

  const lines: CheckLine[] = [catalog.line];

  if (cliLatest && cliLatest !== VERSION) {
    lines.push({
      glyph: `${YELLOW}⚠${RESET}`,
      label: 'CLI',
      text: `${VERSION} → ${cliLatest} available`,
      hint: 'npm install -g @openinference/cli@latest',
    });
  } else {
    lines.push({ glyph: cliLatest ? `${GREEN}✓${RESET}` : `${DIM}·${RESET}`, label: 'CLI', text: cliLatest ? `${VERSION} — current` : `${VERSION} (could not check npm)` });
  }

  if (ollamaLocal && ollamaLatest && ollamaLocal !== ollamaLatest) {
    lines.push({
      glyph: `${YELLOW}⚠${RESET}`,
      label: 'Runtime',
      text: `Ollama ${ollamaLocal} → ${ollamaLatest} available`,
      hint: 'https://ollama.com/download',
    });
  } else if (ollamaLocal) {
    lines.push({ glyph: `${GREEN}✓${RESET}`, label: 'Runtime', text: `Ollama ${ollamaLocal} — ${ollamaLatest ? 'current' : 'running (could not check latest)'}` });
  } else {
    lines.push({ glyph: `${DIM}·${RESET}`, label: 'Runtime', text: 'not running — start it to check its version' });
  }

  lines.push({ glyph: `${DIM}·${RESET}`, label: 'Models', text: `${DIM}update-check coming soon (registry digests)${RESET}` });

  const w = Math.max(...lines.map((l) => l.label.length)) + 2;
  for (const l of lines) {
    console.log(`  ${l.glyph} ${l.label.padEnd(w)}${l.text}`);
    if (l.hint) console.log(`     ${' '.repeat(w)}${DIM}${l.hint}${RESET}`);
  }
  if (catalog.detail.length) {
    console.log('');
    for (const d of catalog.detail) console.log(d);
  }
  console.log(`\n  ${DIM}Nothing is downloaded without asking — installed models are untouched.${RESET}\n`);
}
