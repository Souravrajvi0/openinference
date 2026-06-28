import { loadConfig, setActiveModel } from './config';
import { loadCatalog } from './recommend';
import { detectHardware } from './hardware';
import {
  ensureHostOllamaRunning,
  listModelTags,
  pullModelHost,
  pullModelRemote,
  resolveOllamaUrl,
  pingOllama,
} from './ollama';

export async function runUse(modelId: string, opts: { ollamaUrl?: string; docker?: boolean }): Promise<void> {
  const catalog = loadCatalog();
  const entry = catalog.find((m) => m.id === modelId);
  const name = entry?.name ?? modelId;
  const base = resolveOllamaUrl(opts.ollamaUrl);

  if (!(await pingOllama(base))) {
    if (opts.docker) throw new Error(`Ollama not reachable at ${base}`);
    await ensureHostOllamaRunning(base);
  }

  const installed = await listModelTags(base);
  const has = installed.some((t) => t === modelId || t.startsWith(`${modelId}:`));

  if (!has) {
    console.log(`\n  ${modelId} is not downloaded yet. Pulling…\n`);
    if (opts.docker) await pullModelRemote(base, modelId);
    else await pullModelHost(modelId);
  }

  setActiveModel(modelId, name);
  console.log(`\n  ✓ Active model: ${name} (${modelId})\n`);
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
