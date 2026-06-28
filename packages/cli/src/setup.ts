import type { Recommendation } from './recommend';
import {
  buildRecommendPool,
  fitTier,
  hardwareFittingModels,
  loadCatalog,
  recommendTop,
  scoreModel,
} from './recommend';
import { detectHardware, ollamaModelsPath } from './hardware';
import { saveConfig, type SavedConfig } from './config';
import {
  askYesNo,
  confirmInstall,
  pickRecommendation,
  printHardwareResults,
  printHardwareScan,
  printRecommendations,
  printTooSmallHelp,
  printWizardRecommendations,
} from './prompt';
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
import {
  parseUseCaseArg,
  pickUseCase,
  useCaseLabel,
  type UseCaseId,
} from './use-cases';

export const WIZARD_PICK_COUNT = 10;

export type SetupOptions = {
  yes?: boolean;
  model?: string;
  useCase?: UseCaseId;
  skipInstall?: boolean;
  docker?: boolean;
  ollamaUrl?: string;
  all?: boolean;
};

type PoolResult = {
  useCase: UseCaseId;
  pool: ReturnType<typeof loadCatalog>;
  runnable: ReturnType<typeof loadCatalog>;
  hardwareFallback: boolean;
};

async function resolvePool(
  catalog: ReturnType<typeof loadCatalog>,
  hw: ReturnType<typeof detectHardware>,
  opts: SetupOptions,
): Promise<PoolResult | null> {
  const auto = Boolean(opts.yes);
  const lockedUseCase = opts.useCase;

  if (auto || opts.model) {
    const useCase = lockedUseCase ?? 'chat';
    let { pool, runnable } = buildRecommendPool(catalog, hw, useCase, opts.all);
    let hardwareFallback = false;
    if (runnable.length === 0) {
      runnable = hardwareFittingModels(catalog, hw, opts.all);
      pool = runnable;
      hardwareFallback = runnable.length > 0;
    }
    return { useCase, pool, runnable, hardwareFallback };
  }

  let scanned = false;

  while (true) {
    const useCase = lockedUseCase ?? (await pickUseCase());
    if (!lockedUseCase) console.log(`\n  → ${useCaseLabel(useCase)}\n`);

    if (!scanned) {
      printHardwareScan(hw);
      scanned = true;
    }

    let { pool, runnable } = buildRecommendPool(catalog, hw, useCase, opts.all);
    let hardwareFallback = false;

    console.log(`  Use case: ${useCaseLabel(useCase)}`);
    console.log(`  Catalog: ${pool.length} models for this goal`);

    if (runnable.length === 0) {
      const anyFit = hardwareFittingModels(catalog, hw, opts.all);
      if (anyFit.length > 0) {
        console.log(`  0 models for this goal on your hardware, but ${anyFit.length} other small models fit.\n`);
        const ok = lockedUseCase
          ? true
          : await askYesNo('  Show small models that fit anyway? (Y/n): ', true);
        if (ok) {
          runnable = anyFit;
          pool = anyFit;
          hardwareFallback = true;
        } else if (!lockedUseCase) {
          console.log('\n  Pick another use case:\n');
          continue;
        } else {
          return null;
        }
      } else {
        printTooSmallHelp(hw);
        if (lockedUseCase) return null;
        const retry = await askYesNo('  Try a different use case? (Y/n): ', true);
        if (retry) {
          console.log('');
          continue;
        }
        return null;
      }
    } else {
      console.log(`  ${runnable.length} models fit your hardware\n`);
    }

    return { useCase, pool, runnable, hardwareFallback };
  }
}

export async function runSetup(opts: SetupOptions): Promise<void> {
  const remote = Boolean(opts.docker);
  const baseUrl = resolveOllamaUrl(opts.ollamaUrl);
  const auto = Boolean(opts.yes);

  const hw = detectHardware();
  const catalog = loadCatalog();

  const resolved = await resolvePool(catalog, hw, opts);
  if (!resolved) return;

  const { useCase, runnable, hardwareFallback } = resolved;

  if (auto) {
    console.log('\n  OpenInference — quick setup (-y)\n');
    printHardwareResults(hw);
    console.log(`  Use case: ${useCaseLabel(useCase)}\n`);
  }

  const recs = recommendTop(runnable, hw.budgetGb, WIZARD_PICK_COUNT, useCase, hw.diskFreeGb);
  const picks =
    recs.length > 0
      ? recs
      : runnable
          .map((m) => scoreModel(m, hw.budgetGb, useCase))
          .filter((r): r is Recommendation => r !== null)
          .sort((a, b) => b.score - a.score)
          .slice(0, WIZARD_PICK_COUNT);

  if (picks.length === 0) {
    printTooSmallHelp(hw);
    return;
  }

  if (!auto && !opts.model) {
    printWizardRecommendations(picks, runnable.length, {
      fallback: hardwareFallback,
      useCaseLabel: useCaseLabel(useCase),
    });
  }

  let chosen: Recommendation;

  if (opts.model) {
    const fromRecs = picks.find((r) => r.id === opts.model);
    if (fromRecs) {
      chosen = fromRecs;
    } else {
      const m = catalog.find((c) => c.id === opts.model);
      if (!m) throw new Error(`Model "${opts.model}" not found in catalog.`);
      const fit = fitTier(m.ramGb, hw.budgetGb);
      if (!fit) throw new Error(`Model "${opts.model}" does not fit this machine.`);
      chosen = { ...m, fit, score: 0 };
    }
    if (!auto) console.log(`  Using model: ${chosen.name} (${chosen.id})\n`);
  } else if (auto) {
    chosen = picks[0]!;
    console.log(`  → ${chosen.name} (best match)\n`);
  } else {
    chosen = await pickRecommendation(picks);
    console.log(`\n  Selected: ${chosen.name}\n`);
  }

  if (chosen.fit === 'marginal' && !auto) {
    console.log('  Note: this model is a tight fit — it may run slowly.\n');
  }

  const needsOllama =
    !remote && !opts.skipInstall && !(await pingOllama(baseUrl)) && !isOllamaInstalled();

  if (!auto) {
    const ok = await confirmInstall({
      modelName: chosen.name,
      sizeMb: chosen.sizeMb,
      needsOllama,
    });
    if (!ok) return;
    console.log('');
  }

  if (remote) {
    console.log('  Connecting to Ollama…\n');
    await ensureRemoteOllama(baseUrl);
    console.log('  Downloading model…\n');
    await pullModelRemote(baseUrl, chosen.id);
  } else {
    if (needsOllama) {
      console.log('  Installing Ollama…\n');
      installOllama();
      if (!isOllamaInstalled()) {
        throw new Error(
          'Install finished but Ollama was not found. Restart your terminal and run `oi` again.',
        );
      }
    } else if (!opts.skipInstall && !isOllamaInstalled() && !(await pingOllama(baseUrl))) {
      throw new Error('Ollama not found. Run `oi` again to install it.');
    }

    console.log('  Starting Ollama…\n');
    await ensureHostOllamaRunning(baseUrl);
    console.log('  Downloading model…\n');
    await pullModelHost(chosen.id);
  }

  console.log('  Running a quick test…');
  await verifyModel(baseUrl, chosen.id);

  const cfg: SavedConfig = {
    ollamaUrl: baseUrl,
    model: chosen.id,
    modelName: chosen.name,
    useCase,
    setupAt: new Date().toISOString(),
  };
  saveConfig(cfg);

  console.log('\n  ✓ Ready — you can use open-source AI on this computer.\n');
  console.log(`  Model:   ${chosen.name}`);
  console.log(`  Stored:  ${ollamaModelsPath()}`);
  console.log(`  Config:  ~/.openinference/config.json\n`);
}

export function printRecommendPreview(
  recs: Recommendation[],
  hw: ReturnType<typeof detectHardware>,
  meta: { useCase: UseCaseId; poolSize: number; runnableSize: number; all?: boolean },
): void {
  console.log('\n  OpenInference — model recommendations\n');
  printHardwareResults(hw);
  console.log(`  Use case: ${useCaseLabel(meta.useCase)}`);
  console.log(
    `  ${meta.poolSize} models for this goal · ${meta.runnableSize} fit your hardware` +
      `${meta.all ? '' : ' (verified tags preferred; use --all for full catalog)'}\n`,
  );
  if (recs.length === 0) {
    console.log('  No models fit this machine. Try: oi browse --use-case chat\n');
    return;
  }
  console.log(`  Top ${recs.length}:\n`);
  printRecommendations(recs);
  console.log('  Run `oi` for the setup wizard, or `oi -y` to auto-install the top pick.\n');
}
