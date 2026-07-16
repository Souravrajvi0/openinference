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
const RESET = '\x1b[0m';

/** `oi update` — refresh the repository index (NOT the models, NOT the CLI). */
export async function runUpdate(opts: { currentCatalog: CatalogModel[] }): Promise<void> {
  console.log(`\n  Refreshing model catalog…`);
  console.log(`  ${DIM}${CATALOG_URL}${RESET}\n`);

  let fetched: unknown;
  try {
    const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fetched = await res.json();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.log(`  Could not fetch the catalog (${m}).`);
    console.log(`  ${DIM}Keeping the current one — nothing changed.${RESET}\n`);
    return;
  }

  if (!validateCatalog(fetched)) {
    console.log('  The fetched catalog failed validation — keeping the current one.');
    console.log(`  ${DIM}This protects you from a truncated or malformed index.${RESET}\n`);
    return;
  }

  const before = new Set(opts.currentCatalog.map((m) => m.id));
  const after = new Set(fetched.map((m) => m.id));
  const added = fetched.filter((m) => !before.has(m.id));
  const removed = opts.currentCatalog.filter((m) => !after.has(m.id));

  saveCache(fetched);

  if (added.length === 0 && removed.length === 0) {
    console.log(`  ${GREEN}✓${RESET} Already up to date — ${fetched.length} models.\n`);
    return;
  }

  console.log(`  ${GREEN}✓${RESET} Catalog updated — ${fetched.length} models.\n`);
  if (added.length) {
    console.log(`  New (${added.length}):`);
    for (const m of added.slice(0, 8)) console.log(`    + ${m.id}  ${DIM}${m.name}${RESET}`);
    if (added.length > 8) console.log(`    ${DIM}…and ${added.length - 8} more${RESET}`);
  }
  if (removed.length) {
    console.log(`  Removed (${removed.length}):`);
    for (const m of removed.slice(0, 8)) console.log(`    - ${m.id}`);
    if (removed.length > 8) console.log(`    ${DIM}…and ${removed.length - 8} more${RESET}`);
  }
  console.log(`\n  ${DIM}oi search to browse · installed models are untouched${RESET}\n`);
}
