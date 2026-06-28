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
  docker?: boolean;
  ollamaUrl?: string;
  /** Beginner mode: minimal output, no jargon */
  quick?: boolean;
  /** Show 5 models and let user pick */
  choose?: boolean;
};

export async function runSetup(opts: SetupOptions): Promise<void> {
  const remote = Boolean(opts.docker);
  const baseUrl = resolveOllamaUrl(opts.ollamaUrl);
  const quick = Boolean(opts.quick) && !opts.choose;
  const interactive = Boolean(opts.choose) || (!opts.yes && !opts.model && !quick);

  if (quick) {
    console.log('\n  OpenInference — setting up local AI on your computer\n');
    console.log('  This takes a few minutes the first time. We will:\n');
    console.log('    • find the best open-source model for your hardware');
    console.log('    • install what you need (no account required)');
    console.log('    • download the model and run a quick test\n');
  } else {
    console.log('\n  OpenInference — local model setup\n');
    if (remote) console.log(`  Remote runtime at ${baseUrl}\n`);
  }

  const hw = detectHardware();
  if (!quick) {
    console.log(`  System: ${formatHardware(hw)}`);
    console.log(`  Memory budget for models: ~${hw.budgetGb} GB\n`);
  } else {
    console.log(`  Detected: ${formatHardware(hw)}\n`);
  }

  const catalog = loadCatalog();
  const chatVerified = catalog.filter((m) => m.kind !== 'embed' && m.verified);
  const pool = chatVerified.length >= 3 ? chatVerified : catalog.filter((m) => m.kind !== 'embed');

  if (!quick) {
    console.log(`  Scoring ${pool.length} open-source models for your hardware…\n`);
  } else {
    console.log('  Finding the best model for you…\n');
  }

  const recs = recommendTop(pool, hw.budgetGb, 5);

  if (recs.length === 0) {
    throw new Error(
      `No models fit this computer (~${hw.budgetGb} GB free for AI). Try freeing RAM or use a machine with more memory.`,
    );
  }

  if (interactive) {
    console.log('  Top 5 models for your machine:\n');
    printRecommendations(recs);
  }

  let chosen: Recommendation;

  if (opts.model) {
    const fromRecs = recs.find((r) => r.id === opts.model);
    if (fromRecs) {
      chosen = fromRecs;
    } else {
      const m = catalog.find((c) => c.id === opts.model);
      if (!m) throw new Error(`Model "${opts.model}" not found in catalog.`);
      const fit = fitTier(m.ramGb, hw.budgetGb);
      if (!fit) throw new Error(`Model "${opts.model}" does not fit this machine.`);
      chosen = { ...m, fit, score: 0 };
    }
    if (!quick) console.log(`Using --model ${chosen.id}\n`);
  } else if (opts.yes || quick) {
    chosen = recs[0]!;
    console.log(`  → ${chosen.name} (best match for your computer)\n`);
  } else {
    chosen = await pickRecommendation(recs);
    console.log(`\nSelected: ${chosen.name} (${chosen.id})\n`);
  }

  if (chosen.fit === 'marginal' && !quick) {
    console.log('  Note: this model is a tight fit — it may run slowly.\n');
  }

  if (remote) {
    console.log('  Connecting to AI runtime…\n');
    await ensureRemoteOllama(baseUrl);
    console.log('  Downloading model…\n');
    await pullModelRemote(baseUrl, chosen.id);
  } else {
    const needsInstall = !opts.skipInstall && !(await pingOllama(baseUrl)) && !isOllamaInstalled();
    if (needsInstall) {
      console.log('  Installing local AI runtime (one-time)…\n');
      installOllama();
      if (!isOllamaInstalled()) {
        throw new Error(
          'Install finished but the runtime was not found. Restart your terminal and run `oi` again.',
        );
      }
    } else if (!opts.skipInstall && !isOllamaInstalled() && !(await pingOllama(baseUrl))) {
      throw new Error('Local AI runtime not found. Run `oi` again to install it.');
    }

    if (!quick) console.log('  Starting runtime…\n');
    await ensureHostOllamaRunning(baseUrl);
    console.log('  Downloading model…\n');
    await pullModelHost(chosen.id);
  }

  if (!quick) console.log('  Running test…');
  await verifyModel(baseUrl, chosen.id);

  saveConfig({
    ollamaUrl: baseUrl,
    model: chosen.id,
    modelName: chosen.name,
    setupAt: new Date().toISOString(),
  });

  console.log('\n  ✓ Ready — you can use open-source AI on this computer.\n');
  if (!quick) {
    console.log(`  Model: ${chosen.name}`);
    console.log(`  Config: ~/.openinference/config.json\n`);
  }
}
