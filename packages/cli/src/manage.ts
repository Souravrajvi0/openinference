import { clearConfig, loadConfig, saveConfig, setActiveModel } from './config';
import { fitsHardware, loadCatalog, type CatalogModel } from './recommend';
import { detectDiskFreeGb, detectHardware, fitsDisk } from './hardware';
import { askYesNo } from './prompt';
import { useCaseLabel } from './use-cases';
import { select } from './linereader';
import {
  deleteModel,
  ensureHostOllamaRunning,
  listModelTags,
  modelSizeBytes,
  pullModelHost,
  pullModelRemote,
  resolveOllamaUrl,
  pingOllama,
} from './ollama';

const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const TEAL = '\x1b[38;5;43m';
const RESET = '\x1b[0m';

function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

function formatMb(mb: number): string {
  return mb >= 1000 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

/** Best-effort: the set of installed model tags. Empty + known=false if Ollama is unreachable. */
async function installedSet(ollamaUrl?: string): Promise<{ tags: Set<string>; known: boolean }> {
  try {
    const base = resolveOllamaUrl(ollamaUrl);
    if (await pingOllama(base)) {
      return { tags: new Set(await listModelTags(base)), known: true };
    }
  } catch {
    /* fall through */
  }
  return { tags: new Set(), known: false };
}

function isInstalled(tags: Set<string>, id: string): boolean {
  return tags.has(id) || tags.has(`${id}:latest`);
}

function catLabels(m: CatalogModel): string {
  const cats = m.categories ?? [];
  if (cats.length) return cats.map((c) => useCaseLabel(c)).join(', ');
  return m.useCase;
}

/** Pad a string that contains ANSI codes to a target *visible* width. */
function padVisible(colored: string, plainLen: number, width: number): string {
  return colored + ' '.repeat(Math.max(1, width - plainLen));
}

/** `oi search <query>` — search the catalog (the repository) and show installed/available state.
 *  Hardware-aware: by default only shows models that fit this machine (+ anything installed).
 *  Pass `all` to include models too big for this machine. */
export async function runSearch(
  query: string,
  opts: { ollamaUrl?: string; all?: boolean } = {},
): Promise<void> {
  const catalog = loadCatalog();
  const hw = detectHardware();
  const cfg = loadConfig();
  const q = query.trim().toLowerCase();
  const { tags, known } = await installedSet(opts.ollamaUrl);

  const installed = (m: CatalogModel) => isInstalled(tags, m.id);
  const fits = (m: CatalogModel) => Boolean(fitsHardware(m, hw));

  const matches = catalog.filter((m) => {
    if (m.kind === 'embed') return false;
    if (!q) return true;
    const hay = `${m.id} ${m.name} ${m.useCase} ${(m.categories ?? []).join(' ')}`.toLowerCase();
    return hay.includes(q);
  });

  if (matches.length === 0) {
    console.log(`\n  No models match "${query}". Try a broader term, e.g. oi search chat\n`);
    return;
  }

  // Default view: only what runs here (plus anything already installed).
  let shown = opts.all ? matches : matches.filter((m) => fits(m) || installed(m));
  const hiddenTooBig = matches.length - shown.length;

  // If nothing fits, fall back to the smallest few so the list is never empty.
  let noneFit = false;
  if (shown.length === 0) {
    noneFit = true;
    shown = [...matches].sort((a, b) => a.sizeMb - b.sizeMb).slice(0, 5);
  }

  // Sort: installed → fits → quality.
  shown.sort((a, b) => {
    const ai = installed(a) ? 1 : 0;
    const bi = installed(b) ? 1 : 0;
    if (ai !== bi) return bi - ai;
    const af = fits(a) ? 1 : 0;
    const bf = fits(b) ? 1 : 0;
    if (af !== bf) return bf - af;
    return b.quality - a.quality;
  });

  const rows = shown.slice(0, 30);
  const idW = Math.min(30, Math.max(...rows.map((m) => m.id.length))) + 2;

  const scope = opts.all ? 'all models' : 'models that fit this machine';
  console.log(`\n  ${q ? `Matching "${query}"` : 'Models'} · ${scope}:\n`);

  if (noneFit) {
    console.log(`  ${DIM}Nothing here fits your machine — smallest options shown:${RESET}\n`);
  }

  for (const m of rows) {
    const inst = installed(m);
    const active = cfg?.model === m.id;
    const id = m.id.padEnd(idW);
    let badge = ' '.repeat(13);
    if (known) {
      badge = inst
        ? padVisible(`${GREEN}✓ installed${RESET}`, 11, 13)
        : padVisible(`${DIM}not installed${RESET}`, 13, 13);
    }
    const size = formatMb(m.sizeMb).padStart(8);
    const tail = active
      ? `  ${TEAL}⭐ active${RESET}`
      : !fits(m)
        ? `  ${DIM}— too big${RESET}`
        : '';
    console.log(`    ${id}${badge} ${size}   ${DIM}${catLabels(m)}${RESET}${tail}`);
  }

  console.log('');
  if (!opts.all && hiddenTooBig > 0) {
    console.log(`  ${DIM}+${hiddenTooBig} more need a bigger machine — add --all to see them.${RESET}`);
  }
  console.log(`  ${DIM}oi info <model> for details · oi install <model> to download${RESET}\n`);
}

/** `oi info <model>` — full detail for one model, package-manager style. */
export async function runInfo(modelId: string, opts: { ollamaUrl?: string } = {}): Promise<void> {
  const catalog = loadCatalog();
  const m =
    catalog.find((c) => c.id === modelId) ??
    catalog.find((c) => c.id.startsWith(modelId)) ??
    catalog.find((c) => c.name.toLowerCase().includes(modelId.toLowerCase()));

  if (!m) {
    console.log(`\n  "${modelId}" is not in the catalog. Try: oi search ${modelId}\n`);
    return;
  }

  const hw = detectHardware();
  const cfg = loadConfig();
  const fit = fitsHardware(m, hw);
  const { tags, known } = await installedSet(opts.ollamaUrl);
  const inst = isInstalled(tags, m.id);
  const active = cfg?.model === m.id;

  const label = (s: string) => s.padEnd(20);
  console.log(`\n  ${TEAL}${m.name}${RESET}  ${DIM}(${m.id})${RESET}\n`);
  console.log(`  ${label('RAM needed')}~${m.ramGb} GB`);
  if (hw.gpuUsable) console.log(`  ${label('VRAM (full offload)')}~${m.ramGb} GB`);
  console.log(`  ${label('Download size')}${formatMb(m.sizeMb)}`);
  console.log(`  ${label('Quality')}${m.quality}/100`);
  console.log(`  ${label('Best for')}${catLabels(m)}`);
  console.log(`  ${label('Fits this machine')}${fit ? `yes (${fit} fit)` : 'no — needs more RAM or disk'}`);
  if (known) {
    console.log(`  ${label('Installed')}${inst ? (active ? 'yes — active model' : 'yes') : 'no'}`);
  }
  console.log(`  ${label('Runtime')}${DIM}Ollama (powered by)${RESET}`);
  console.log('');
  console.log(`  ${DIM}License, context length, quantization and benchmarks: coming soon.${RESET}`);
  console.log('');
  if (active) {
    console.log(`  This is your active model.\n`);
  } else if (inst) {
    console.log(`  Switch to it:  oi use ${m.id}\n`);
  } else {
    console.log(`  Install it:    oi install ${m.id}\n`);
  }
}

const INSTALL_MORE = '__install_more__';

export type UsePickerResult = 'switched' | 'unchanged' | 'search' | 'empty' | 'cancelled';

function catalogEntryForTag(catalog: CatalogModel[], tag: string): CatalogModel | undefined {
  return (
    catalog.find((m) => m.id === tag) ??
    catalog.find((m) => tag.startsWith(`${m.id}:`)) ??
    catalog.find((m) => m.id.startsWith(tag.split(':')[0]!))
  );
}

function switchActiveModel(
  modelId: string,
  name: string,
  baseUrl: string,
  entry?: CatalogModel,
): void {
  if (loadConfig()) {
    setActiveModel(modelId, name);
  } else {
    saveConfig({
      ollamaUrl: baseUrl,
      model: modelId,
      modelName: name,
      useCase: entry?.categories?.[0],
      setupAt: new Date().toISOString(),
    });
  }
}

/** Interactive picker — installed models only. Last row opens search to install more. */
export async function runUsePicker(
  opts: { ollamaUrl?: string; docker?: boolean } = {},
): Promise<UsePickerResult> {
  const base = resolveOllamaUrl(opts.ollamaUrl);
  const cfg = loadConfig();

  if (!(await pingOllama(base))) {
    if (opts.docker) {
      console.log('\n  Local inference is not reachable.\n');
      return 'cancelled';
    }
    try {
      await ensureHostOllamaRunning(base);
    } catch {
      console.log('\n  Local inference is not running. Run /setup or try again.\n');
      return 'cancelled';
    }
  }

  const tags = await listModelTags(base);
  if (tags.length === 0) {
    console.log('\n  No models installed yet.');
    console.log('  Run /setup or /install <model> to get started.\n');
    return 'empty';
  }

  const catalog = loadCatalog();
  const activeId = cfg?.model;

  if (tags.length === 1 && tags[0] === activeId) {
    const entry = catalogEntryForTag(catalog, tags[0]!);
    const label = entry?.name ?? tags[0]!;
    console.log(`\n  Only one model installed: ${label} (already active)\n`);
    return 'unchanged';
  }

  type Pick = { value: string; label: string; hint?: string };
  const choices: Pick[] = tags.map((tag) => {
    const entry = catalogEntryForTag(catalog, tag);
    const isActive = tag === activeId;
    const name = entry?.name ?? tag;
    const prefix = isActive ? '●' : '○';
    const size = entry ? formatMb(entry.sizeMb) : undefined;
    const use = entry ? catLabels(entry) : undefined;
    const hint = [use, size, isActive ? 'active' : undefined].filter(Boolean).join(' · ');
    return {
      value: tag,
      label: `${prefix} ${name}`,
      hint: hint || undefined,
    };
  });

  choices.push({
    value: INSTALL_MORE,
    label: '+ Install another model…',
    hint: 'search catalog',
  });

  const picked = await select<string>({
    title: '  Installed models — pick one to chat with:',
    choices,
    hint: '↑↓ move · Enter select · Ctrl+C cancel',
  });

  if (picked === null) {
    console.log('');
    return 'cancelled';
  }

  if (picked === INSTALL_MORE) return 'search';

  if (picked === activeId) {
    const entry = catalogEntryForTag(catalog, picked);
    console.log(`\n  ${entry?.name ?? picked} is already active.\n`);
    return 'unchanged';
  }

  const entry = catalogEntryForTag(catalog, picked);
  const name = entry?.name ?? picked;
  switchActiveModel(picked, name, base, entry);
  console.log(`\n  ✓ Active model: ${name} (${picked})\n`);
  return 'switched';
}

export async function runUse(modelId: string, opts: { ollamaUrl?: string; docker?: boolean }): Promise<void> {
  const catalog = loadCatalog();
  const entry = catalog.find((m) => m.id === modelId) ?? catalog.find((m) => modelId.startsWith(m.id));
  const name = entry?.name ?? modelId;
  const base = resolveOllamaUrl(opts.ollamaUrl);

  if (!(await pingOllama(base))) {
    if (opts.docker) throw new Error(`Local inference not reachable at ${base}`);
    await ensureHostOllamaRunning(base);
  }

  const installed = await listModelTags(base);
  const match =
    installed.find((t) => t === modelId) ??
    installed.find((t) => t.startsWith(`${modelId}:`)) ??
    installed.find((t) => modelId.startsWith(t.split(':')[0]!));

  if (!match) {
    console.log(`\n  ${modelId} is not installed.`);
    console.log(`  Install it:  oi install ${modelId}\n`);
    return;
  }

  switchActiveModel(match, catalogEntryForTag(catalog, match)?.name ?? name, base, entry);
  console.log(`\n  ✓ Active model: ${catalogEntryForTag(catalog, match)?.name ?? name} (${match})\n`);
}

export async function runPull(
  modelId: string,
  opts: { ollamaUrl?: string; docker?: boolean; setDefault?: boolean },
): Promise<void> {
  const base = resolveOllamaUrl(opts.ollamaUrl);
  const catalog = loadCatalog();
  const entry = catalog.find((m) => m.id === modelId);

  if (entry) {
    const hw = detectHardware();
    if (entry.ramGb > hw.budgetGb) {
      console.log(`\n  Warning: ${entry.name} may not fit (~${entry.ramGb} GB needed, ~${hw.budgetGb} GB available).\n`);
    }
    if (entry.sizeMb > 0) {
      const freeGb = detectDiskFreeGb();
      if (freeGb > 0 && !fitsDisk(entry.sizeMb, freeGb)) {
        throw new Error(
          `Not enough disk for ${entry.name} (~${(entry.sizeMb / 1024).toFixed(1)} GB needed, ${freeGb} GB free). ` +
            'Free up space or remove a model with `oi rm <model>`.',
        );
      }
    }
  }

  if (opts.docker) await pullModelRemote(base, modelId);
  else {
    if (!(await pingOllama(base))) await ensureHostOllamaRunning(base);
    await pullModelHost(modelId);
  }

  if (opts.setDefault) {
    setActiveModel(modelId, entry?.name ?? modelId);
    console.log(`\n  ✓ Downloaded and set as active: ${entry?.name ?? modelId}\n`);
  } else {
    console.log(`\n  ✓ Downloaded: ${modelId}\n`);
  }
}

export async function runRemove(
  modelId: string,
  opts: { ollamaUrl?: string; docker?: boolean; yes?: boolean },
): Promise<void> {
  const base = resolveOllamaUrl(opts.ollamaUrl);

  if (!(await pingOllama(base))) {
    if (opts.docker) throw new Error(`Ollama not reachable at ${base}`);
    await ensureHostOllamaRunning(base);
  }

  const installed = await listModelTags(base);
  if (installed.length === 0) {
    console.log('\n  No models are downloaded — nothing to remove.\n');
    return;
  }

  // Resolve the exact installed tag the user means.
  const matches = installed.filter(
    (t) => t === modelId || t === `${modelId}:latest` || t.startsWith(`${modelId}:`),
  );
  if (matches.length === 0) {
    console.log(`\n  "${modelId}" is not downloaded. Installed models:\n`);
    installed.forEach((t) => console.log(`    ${t}`));
    console.log('');
    return;
  }
  if (matches.length > 1 && !matches.includes(modelId)) {
    console.log(`\n  "${modelId}" matches several models — please be specific:\n`);
    matches.forEach((t) => console.log(`    ${t}`));
    console.log('');
    return;
  }
  const target = matches.includes(modelId) ? modelId : matches[0]!;

  const bytes = await modelSizeBytes(base, target);
  const sizeStr = bytes ? formatBytes(bytes) : null;
  const cfg = loadConfig();
  const isActive = cfg?.model === target;

  if (!opts.yes) {
    console.log('');
    console.log(`  Remove ${target}${sizeStr ? ` (${sizeStr})` : ''}?`);
    if (isActive) console.log('  ⚠ This is your active model.');
    const ok = await askYesNo('  Continue? (y/N): ', false);
    if (!ok) {
      console.log('\n  Cancelled.\n');
      return;
    }
  }

  await deleteModel(base, target);

  const diskFreeGb = detectHardware().diskFreeGb;
  const freed = sizeStr ? ` · freed ${sizeStr}` : '';
  const free = diskFreeGb > 0 ? ` · ${diskFreeGb} GB now free` : '';
  console.log(`\n  ✓ Removed ${target}${freed}${free}\n`);

  // If we deleted the active model, repoint to another or clear the config.
  if (isActive) {
    const remaining = (await listModelTags(base).catch(() => [])).filter((t) => t !== target);
    if (remaining.length > 0) {
      const next = remaining[0]!;
      const entry = loadCatalog().find((m) => m.id === next);
      setActiveModel(next, entry?.name ?? next);
      console.log(`  Active model is now ${entry?.name ?? next} (${next}).\n`);
    } else {
      clearConfig();
      console.log('  That was your only model — run `oi` to set up again.\n');
    }
  }
}

export async function runStorage(): Promise<void> {
  const { ollamaModelsPath } = await import('./hardware');
  const cfg = loadConfig();
  const base = resolveOllamaUrl(cfg?.ollamaUrl);

  console.log('\n  OpenInference — model storage\n');
  console.log('  Models are stored by Ollama, not OpenInference.\n');
  console.log(`  Default path: ${ollamaModelsPath()}\n`);

  if (await pingOllama(base)) {
    const tags = await listModelTags(base);
    if (tags.length === 0) {
      console.log('  No models downloaded yet. Run: oi\n');
    } else {
      console.log('  Downloaded on this machine:\n');
      tags.forEach((t) => console.log(`    ${t}`));
      console.log('');
    }
  } else {
    console.log('  Ollama is not running — start it with `oi` or open the Ollama app.\n');
  }

  if (cfg) {
    console.log(`  Active model: ${cfg.modelName} (${cfg.model})`);
    if (cfg.useCase) console.log(`  Use case:     ${cfg.useCase}`);
    console.log('');
  }
}
