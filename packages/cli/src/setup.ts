import type { Recommendation } from './recommend';
import { fitTier, loadCatalog, recommendTop } from './recommend';
import { detectHardware, formatHardware } from './hardware';
import { saveConfig } from './config';
import { printRecommendations, pickRecommendation } from './prompt';
import {
  ensureHostOllamaRunning,
  ensureRemoteOllama,
  installOllama,
  isOllamaInstalled,
  pingOllama,
  pullModelHost,
  pullModelRemote,
  resolveOllamaUrl,
  verifyModel,
} from './ollama';

export type SetupOptions = {
  yes?: boolean;
  model?: string;
  skipInstall?: boolean;
  /** Remote Ollama (Docker/VM): pull via HTTP API, no host `ollama` CLI. */
  docker?: boolean;
  ollamaUrl?: string;
};

export async function runSetup(opts: SetupOptions): Promise<void> {
  const remote = Boolean(opts.docker);
  const baseUrl = resolveOllamaUrl(opts.ollamaUrl);

  console.log('\n  OpenInference — local model setup\n');
  if (remote) {
    console.log(`  Mode: remote Ollama (HTTP API at ${baseUrl})\n`);
  }

  const hw = detectHardware();
  console.log(`  System: ${formatHardware(hw)}`);
  console.log(`  Memory budget for models: ~${hw.budgetGb} GB\n`);

  const catalog = loadCatalog();
  const chatVerified = catalog.filter((m) => m.kind !== 'embed' && m.verified);
  const pool = chatVerified.length >= 3 ? chatVerified : catalog.filter((m) => m.kind !== 'embed');
  console.log(`  Scoring ${pool.length} open-source models for your hardware…\n`);

  const recs = recommendTop(pool, hw.budgetGb, 5);

  if (recs.length === 0) {
    throw new Error(
      `No models fit ~${hw.budgetGb} GB available memory. You need at least ~2 GB free after OS overhead.`,
    );
  }

  console.log('  Top 5 models for your machine:\n');
  printRecommendations(recs);

  let chosen: Recommendation;

  if (opts.model) {
    const fromRecs = recs.find((r) => r.id === opts.model);
    if (fromRecs) {
      chosen = fromRecs;
    } else {
      const m = catalog.find((c) => c.id === opts.model);
      if (!m) throw new Error(`Model "${opts.model}" not found in catalog.`);
      const fit = fitTier(m.ramGb, hw.budgetGb);
      if (!fit) throw new Error(`Model "${opts.model}" does not fit this machine (~${hw.budgetGb} GB budget).`);
      chosen = { ...m, fit, score: 0 };
    }
    console.log(`Using --model ${chosen.id}\n`);
  } else if (opts.yes) {
    chosen = recs[0]!;
    console.log(`Auto-selected #1: ${chosen.name} (${chosen.id})\n`);
  } else {
    chosen = await pickRecommendation(recs);
    console.log(`\nSelected: ${chosen.name} (${chosen.id})\n`);
  }

  if (chosen.fit === 'marginal') {
    console.log('  Note: this model is a tight fit — it may run slowly on your hardware.\n');
  }

  if (remote) {
    await ensureRemoteOllama(baseUrl);
    await pullModelRemote(baseUrl, chosen.id);
  } else {
    if (!opts.skipInstall && !(await pingOllama(baseUrl)) && !isOllamaInstalled()) {
      installOllama();
      if (!isOllamaInstalled()) {
        throw new Error('Ollama install finished but `ollama` was not found on PATH. Restart your terminal and retry.');
      }
    } else if (!opts.skipInstall && !isOllamaInstalled() && !(await pingOllama(baseUrl))) {
      throw new Error(
        'Ollama is not installed. Run without --skip-install or install from https://ollama.com',
      );
    }

    await ensureHostOllamaRunning(baseUrl);
    await pullModelHost(chosen.id);
  }

  await verifyModel(baseUrl, chosen.id);

  saveConfig({
    ollamaUrl: baseUrl,
    model: chosen.id,
    modelName: chosen.name,
    setupAt: new Date().toISOString(),
  });

  console.log('  Setup complete\n');
  console.log(`  Model:  ${chosen.name} (${chosen.id})`);
  console.log(`  Ollama: ${baseUrl}`);
  console.log(`  Config: ~/.openinference/config.json\n`);
  console.log('  Gateway .env:');
  console.log(`    OLLAMA_URL=${baseUrl}\n`);
  console.log('  Test:');
  console.log(`    oi chat "Hello"${remote ? ` --ollama-url ${baseUrl}` : ''}\n`);
}
