import type { Recommendation } from './recommend';
import {
  buildRecommendPool,
  fitsHardware,
  hardwareFittingModels,
  loadCatalog,
  recommendTop,
  scoreModel,
  TINY_VM_DEFAULT,
} from './recommend';
import { detectDiskFreeGb, detectHardware, fitsDisk, isTinyVm, ollamaModelsPath } from './hardware';
import {
  clearCrashedModel,
  loadCrashedModels,
  recordCrashedModel,
  saveConfig,
} from './config';
import {
  askYesNo,
  confirmInstall,
  pickRecommendation,
  printHardwareResults,
  printHardwareScan,
  printRecommendations,
  printTooSmallHelp,
} from './prompt';
import {
  deleteModel,
  ensureHostOllamaRunning,
  ensureRemoteOllama,
  installOllama,
  isOllamaInstalled,
  listModelTags,
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

/** How many picks to compute (so "show more" has content). */
export const WIZARD_PICK_COUNT = 15;
/** How many to show before the user asks for more. */
export const WIZARD_SHOW_COUNT = 5;

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
  excludeIds: string[],
  scanState: { done: boolean } = { done: false },
): Promise<PoolResult | null> {
  const auto = Boolean(opts.yes);
  const lockedUseCase = opts.useCase;

  if (auto || opts.model) {
    const useCase = lockedUseCase ?? 'chat';
    let { pool, runnable } = buildRecommendPool(catalog, hw, useCase, opts.all, excludeIds);
    let hardwareFallback = false;
    if (runnable.length === 0) {
      runnable = hardwareFittingModels(catalog, hw, opts.all, excludeIds);
      pool = runnable;
      hardwareFallback = runnable.length > 0;
    }
    return { useCase, pool, runnable, hardwareFallback };
  }

  while (true) {
    const useCase = lockedUseCase ?? (await pickUseCase());
    if (!useCase) {
      console.log('\n  Setup cancelled. Run `oi` again when ready.\n');
      return null;
    }
    if (!lockedUseCase) console.log(`\n  → ${useCaseLabel(useCase)}\n`);

    if (!scanState.done) {
      printHardwareScan(hw);
      scanState.done = true;
    }

    let { pool, runnable } = buildRecommendPool(catalog, hw, useCase, opts.all, excludeIds);
    let hardwareFallback = false;

    console.log(`  Use case: ${useCaseLabel(useCase)}`);
    console.log(`  Catalog: ${pool.length} models for this goal`);

    if (runnable.length === 0) {
      const anyFit = hardwareFittingModels(catalog, hw, opts.all, excludeIds);
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

type InstallCtx = {
  remote: boolean;
  baseUrl: string;
  needsOllama: boolean;
  ollamaReady: boolean;
};

async function ensureOllama(ctx: InstallCtx): Promise<void> {
  if (ctx.ollamaReady) return;

  if (ctx.remote) {
    await ensureRemoteOllama(ctx.baseUrl);
  } else {
    if (ctx.needsOllama) {
      console.log('  Setting up local inference…\n');
      installOllama();
      if (!isOllamaInstalled()) {
        throw new Error(
          'Setup did not finish. Restart your terminal and run `oi` again.',
        );
      }
    } else if (!isOllamaInstalled() && !(await pingOllama(ctx.baseUrl))) {
      throw new Error('Local inference is not available. Run `oi` again to set up.');
    }
    console.log('  Starting local inference…\n');
    await ensureHostOllamaRunning(ctx.baseUrl);
  }
  ctx.ollamaReady = true;
}

async function pullIfNeeded(ctx: InstallCtx, modelId: string): Promise<boolean> {
  const tags = await listModelTags(ctx.baseUrl).catch((): string[] => []);
  if (tags.includes(modelId)) return true;
  console.log('  Downloading model…\n');
  if (ctx.remote) await pullModelRemote(ctx.baseUrl, modelId);
  else await pullModelHost(modelId);
  return false;
}

async function tryInstallModels(
  candidates: Recommendation[],
  ctx: InstallCtx,
  opts: { auto: boolean; explicitModel: boolean },
): Promise<Recommendation> {
  let lastError: Error | null = null;

  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i]!;

    if (model.sizeMb > 0) {
      const freeGb = detectDiskFreeGb();
      if (freeGb > 0 && !fitsDisk(model.sizeMb, freeGb)) {
        lastError = new Error(`Not enough disk for ${model.name}.`);
        continue;
      }
    }

    let preexisting = false;
    try {
      await ensureOllama(ctx);
      preexisting = await pullIfNeeded(ctx, model.id);
      console.log('  Running a quick test…');
      await verifyModel(ctx.baseUrl, model.id);
      clearCrashedModel(model.id);
      return model;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      lastError = err;
      recordCrashedModel(model.id);
      if (!preexisting) {
        await deleteModel(ctx.baseUrl, model.id).catch(() => {});
        console.log(`  Removed ${model.id} after the failed test (freed disk).\n`);
      }

      const hasNext = i < candidates.length - 1;
      if (opts.explicitModel || !hasNext) break;

      const next = candidates[i + 1]!;
      if (opts.auto) {
        console.log(`  ${model.name} did not run here — trying ${next.name}…\n`);
        continue;
      }

      const retry = await askYesNo(`  ${model.name} failed. Try ${next.name} instead? (Y/n): `, true);
      if (retry) {
        console.log('');
        continue;
      }
      break;
    }
  }

  throw (
    lastError ??
    new Error(
      `No model ran successfully on this computer. Try: oi setup -y -m ${TINY_VM_DEFAULT}`,
    )
  );
}

export async function runSetup(opts: SetupOptions): Promise<void> {
  const remote = Boolean(opts.docker);
  const baseUrl = resolveOllamaUrl(opts.ollamaUrl);
  const auto = Boolean(opts.yes);

  const hw = detectHardware();
  const catalog = loadCatalog();
  const crashed = loadCrashedModels();
  const canChangeUseCase = !opts.useCase;
  const scanState = { done: false };

  const cancelled = () => {
    console.log('\n  Setup cancelled. Run `oi` again when ready.\n');
  };

  const buildPicks = (
    useCase: UseCaseId,
    runnable: ReturnType<typeof loadCatalog>,
  ): Recommendation[] => {
    const recs = recommendTop(runnable, hw.budgetGb, WIZARD_PICK_COUNT, useCase, hw.diskFreeGb, hw);
    let picks =
      recs.length > 0
        ? recs
        : runnable
            .map((m) => scoreModel(m, hw.budgetGb, useCase, hw))
            .filter((r): r is Recommendation => r !== null)
            .sort((a, b) => b.score - a.score)
            .slice(0, WIZARD_PICK_COUNT);

    if (picks.length === 0 && isTinyVm(hw)) {
      const fallback = catalog.find((m) => m.id === TINY_VM_DEFAULT);
      if (fallback) {
        const fit = fitsHardware(fallback, hw) ?? 'good';
        picks = [{ ...fallback, fit, score: 100 }];
        console.log(`  Using safe default for tiny instances: ${fallback.name}\n`);
      }
    }
    return picks;
  };

  // ── Auto / explicit-model paths (no Back navigation) ──
  if (opts.model || auto) {
    const resolved = await resolvePool(catalog, hw, opts, crashed, scanState);
    if (!resolved) return;

    const { useCase, runnable } = resolved;
    if (auto) {
      console.log('\n  OpenInference — quick setup (-y)\n');
      printHardwareResults(hw);
      console.log(`  Use case: ${useCaseLabel(useCase)}\n`);
    }

    const picks = buildPicks(useCase, runnable);
    if (picks.length === 0) {
      printTooSmallHelp(hw);
      return;
    }

    const needsOllama =
      !remote && !opts.skipInstall && !(await pingOllama(baseUrl)) && !isOllamaInstalled();

    let chosen: Recommendation;
    let candidates: Recommendation[];

    if (opts.model) {
      const fromRecs = picks.find((r) => r.id === opts.model);
      if (fromRecs) {
        chosen = fromRecs;
      } else {
        const m = catalog.find((c) => c.id === opts.model);
        if (!m) throw new Error(`Model "${opts.model}" not found in catalog.`);
        const fit = fitsHardware(m, hw);
        if (!fit) throw new Error(`Model "${opts.model}" does not fit this machine.`);
        chosen = { ...m, fit, score: 0 };
      }
      if (crashed.includes(chosen.id)) {
        console.log(`  Note: ${chosen.name} crashed here before — retrying because you asked for it.\n`);
      }
      if (!auto) {
        console.log(`  Using model: ${chosen.name} (${chosen.id})\n`);
        if (!hw.gpuUsable && hw.ramGb < 8) {
          console.log('  Note: CPU-only on limited RAM — only small models are recommended.\n');
        }
        const action = await confirmInstall({ modelName: chosen.name, sizeMb: chosen.sizeMb, needsOllama });
        if (action !== 'install') {
          cancelled();
          return;
        }
        console.log('');
      }
      candidates = [chosen];
    } else {
      chosen = picks[0]!;
      console.log(`  → ${chosen.name} (best match)\n`);
      candidates = picks;
    }

    if (remote) console.log('  Connecting…\n');
    const working = await tryInstallModels(
      candidates,
      { remote, baseUrl, needsOllama, ollamaReady: false },
      { auto: auto && !opts.model, explicitModel: Boolean(opts.model) },
    );
    saveConfig({
      ollamaUrl: baseUrl,
      model: working.id,
      modelName: working.name,
      useCase,
      setupAt: new Date().toISOString(),
    });
    console.log('\n  ✓ Ready — type oi anytime to chat.\n');
    console.log(`  Model:   ${working.name}`);
    console.log(`  Stored:  ${ollamaModelsPath()}`);
    console.log(`  Config:  ~/.openinference/config.json\n`);
    return;
  }

  // ── Interactive wizard: use case ↔ model ↔ confirm, with Back/Cancel ──
  let resolved = await resolvePool(catalog, hw, opts, crashed, scanState);
  if (!resolved) return;

  while (true) {
    const { useCase, runnable, hardwareFallback } = resolved;
    const picks = buildPicks(useCase, runnable);
    if (picks.length === 0) {
      printTooSmallHelp(hw);
      return;
    }

    const needsOllama =
      !remote && !opts.skipInstall && !(await pingOllama(baseUrl)) && !isOllamaInstalled();

    const pickResult = await pickRecommendation(picks, {
      show: WIZARD_SHOW_COUNT,
      totalFit: runnable.length,
      fallback: hardwareFallback,
      useCaseLabel: useCaseLabel(useCase),
      budgetGb: hw.budgetGb,
      canBack: canChangeUseCase,
    });

    if (pickResult.action === 'cancel') {
      cancelled();
      return;
    }
    if (pickResult.action === 'back') {
      console.log('\n  Pick another use case:\n');
      const again = await resolvePool(catalog, hw, { ...opts, useCase: undefined }, crashed, scanState);
      if (!again) return;
      resolved = again;
      continue;
    }

    const chosen = pickResult.model;
    console.log(`  Selected: ${chosen.name}\n`);
    if (!hw.gpuUsable && hw.ramGb < 8) {
      console.log('  Note: CPU-only on limited RAM — only small models are recommended.\n');
    }

    const action = await confirmInstall({
      modelName: chosen.name,
      sizeMb: chosen.sizeMb,
      needsOllama,
      canBrowse: picks.length > 1,
      canBack: canChangeUseCase,
    });

    if (action === 'cancel') {
      cancelled();
      return;
    }
    if (action === 'back') {
      console.log('\n  Pick another use case:\n');
      const again = await resolvePool(catalog, hw, { ...opts, useCase: undefined }, crashed, scanState);
      if (!again) return;
      resolved = again;
      continue;
    }
    if (action === 'browse') {
      console.log('  Pick another model:\n');
      continue;
    }

    // install
    console.log('');
    if (remote) console.log('  Connecting…\n');

    const idx = picks.findIndex((p) => p.id === chosen.id);
    const candidates = idx >= 0 ? picks.slice(idx) : [chosen];

    const working = await tryInstallModels(
      candidates,
      { remote, baseUrl, needsOllama, ollamaReady: false },
      { auto: false, explicitModel: false },
    );

    saveConfig({
      ollamaUrl: baseUrl,
      model: working.id,
      modelName: working.name,
      useCase,
      setupAt: new Date().toISOString(),
    });

    console.log('\n  ✓ Ready — type oi anytime to chat.\n');
    console.log(`  Model:   ${working.name}`);
    console.log(`  Stored:  ${ollamaModelsPath()}`);
    console.log(`  Config:  ~/.openinference/config.json\n`);
    return;
  }
}

export function printRecommendPreview(
  recs: Recommendation[],
  hw: ReturnType<typeof detectHardware>,
  meta: { useCase: UseCaseId; poolSize: number; runnableSize: number; all?: boolean },
): void {
  console.log('\n  OpenInference — model recommendations\n');
  printHardwareResults(hw);
  console.log(`  Use case: ${useCaseLabel(meta.useCase)}\n`);
  console.log(`  ${meta.poolSize} ${useCaseLabel(meta.useCase)} models available.`);
  const filtered = meta.poolSize - meta.runnableSize;
  if (filtered > 0) {
    console.log(`  ${filtered} need more RAM, GPU, or disk than this computer has.`);
  }
  if (recs.length === 0) {
    console.log('\n  None will run well here. Try another goal: oi browse --use-case chat\n');
    return;
  }
  console.log(`  Showing the ${recs.length} that will run well:\n`);
  printRecommendations(recs);
  if (meta.runnableSize > recs.length) {
    console.log(
      `  +${meta.runnableSize - recs.length} more fit your hardware — run \`oi browse\` (or /browse) to see them.`,
    );
  }
  console.log('  Run `oi` for interactive setup, or `oi setup -y` to auto-install the top pick.\n');
}
