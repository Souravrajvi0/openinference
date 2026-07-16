import fs from 'node:fs';
import path from 'node:path';

import type { UseCaseId } from './use-cases';
import { filterByUseCase, useCaseScoreBoost } from './use-cases';
import { fitsDisk, isSmallVm, isTinyVm, type HardwareProfile } from './hardware';

export type FitTier = 'perfect' | 'good' | 'marginal';

export type CatalogModel = {
  id: string;
  name: string;
  ramGb: number;
  sizeMb: number;
  quality: number;
  useCase: string;
  categories?: UseCaseId[];
  kind?: 'embed';
  verified?: boolean;
};

export type Recommendation = CatalogModel & {
  fit: FitTier;
  score: number;
};

export type RecommendOptions = {
  budgetGb: number;
  diskFreeGb?: number;
  useCase?: UseCaseId;
  verifiedOnly?: boolean;
  includeEmbed?: boolean;
  hw?: HardwareProfile;
  /** Model ids to drop (e.g. crashed on this machine). */
  excludeIds?: string[];
};

function modelsPath(): string {
  const nextToDist = path.join(__dirname, 'data', 'models.json');
  if (fs.existsSync(nextToDist)) return nextToDist;
  return path.join(__dirname, '..', 'data', 'models.json');
}

export function loadCatalog(): CatalogModel[] {
  // Prefer a catalog fetched via `oi update` (cached per CLI version);
  // fall back to the bundled baseline. Lazy require avoids an import cycle.
  try {
    const { loadCachedCatalog } = require('./catalog') as typeof import('./catalog');
    const cached = loadCachedCatalog();
    if (cached) return cached.models;
  } catch {
    /* fall through to bundled */
  }
  const raw = fs.readFileSync(modelsPath(), 'utf8');
  return JSON.parse(raw) as CatalogModel[];
}

export function fitTier(needGb: number, budgetGb: number): FitTier | null {
  if (needGb > budgetGb) return null;
  const ratio = needGb / budgetGb;
  if (ratio <= 0.55) return 'perfect';
  if (ratio <= 0.82) return 'good';
  return 'marginal';
}

const FIT_POINTS: Record<FitTier, number> = {
  perfect: 100,
  good: 72,
  marginal: 45,
};

const FIT_LABEL: Record<FitTier, string> = {
  perfect: 'perfect',
  good: 'good',
  marginal: 'marginal',
};

export function fitLabel(fit: FitTier): string {
  return FIT_LABEL[fit];
}

/** Realistic RAM Ollama needs — higher without a usable GPU (llama.cpp + KV cache). */
export function modelRamNeed(model: CatalogModel, hw: HardwareProfile): number {
  let need = model.ramGb;
  if (!hw.gpuUsable) {
    need = Math.round((need * 1.35 + 0.75) * 10) / 10;
  }
  return need;
}

export function fitsHardware(model: CatalogModel, hw: HardwareProfile): FitTier | null {
  // Hard caps for cloud micro-instances — prevents segfaults on 3–4 GB VMs
  if (isTinyVm(hw)) {
    if (model.ramGb > 0.75 || model.sizeMb > 250) return null;
  } else if (isSmallVm(hw)) {
    if (model.ramGb > 1.05 || model.sizeMb > 450) return null;
  }

  const need = modelRamNeed(model, hw);
  const fit = fitTier(need, hw.budgetGb);
  if (!fit) return null;

  // Small CPU-only machines: never recommend marginal or >~1B class
  if (!hw.gpuUsable && hw.ramGb < 8) {
    if (fit === 'marginal') return null;
    if (hw.ramGb < 6 && model.ramGb > 1.25) return null;
  }

  return fit;
}

/** Safe default when nothing else fits (known-good on 3 GB VMs). */
export const TINY_VM_DEFAULT = 'smollm2:135m';

/** Filter catalog by hardware, disk, and optional verified flag. */
export function filterRunnable(
  catalog: CatalogModel[],
  opts: RecommendOptions,
): CatalogModel[] {
  const disk = opts.diskFreeGb ?? 0;
  const hw = opts.hw;
  const excluded = opts.excludeIds && opts.excludeIds.length ? new Set(opts.excludeIds) : null;

  return catalog.filter((m) => {
    if (excluded?.has(m.id)) return false;
    if (!opts.includeEmbed && m.kind === 'embed') return false;
    if (opts.verifiedOnly && !m.verified) return false;

    if (hw) {
      if (!fitsHardware(m, hw)) return false;
    } else if (!fitTier(m.ramGb, opts.budgetGb)) {
      return false;
    }

    if (disk > 0 && !fitsDisk(m.sizeMb, disk)) return false;
    return true;
  });
}

export function scoreModel(
  model: CatalogModel,
  budgetGb: number,
  useCase?: UseCaseId,
  hw?: HardwareProfile,
): Recommendation | null {
  const fit = hw ? fitsHardware(model, hw) : fitTier(model.ramGb, budgetGb);
  if (!fit) return null;

  let score = FIT_POINTS[fit] + model.quality * 0.35;
  if (useCase) score += useCaseScoreBoost(model, useCase);
  if (model.verified) score += 3;
  // Prefer smaller models on tight CPU boxes
  if (hw && !hw.gpuUsable && hw.ramGb < 8) score -= model.ramGb * 4;

  return { ...model, fit, score };
}

export function recommendTop(
  catalog: CatalogModel[],
  budgetGb: number,
  limit = 5,
  useCase?: UseCaseId,
  diskFreeGb?: number,
  hw?: HardwareProfile,
): Recommendation[] {
  const pool = filterRunnable(catalog, { budgetGb, diskFreeGb, includeEmbed: false, hw });
  const scored: Recommendation[] = [];

  for (const model of pool) {
    const rec = scoreModel(model, budgetGb, useCase, hw);
    if (rec) scored.push(rec);
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function buildRecommendPool(
  catalog: CatalogModel[],
  hw: HardwareProfile,
  useCase: UseCaseId,
  all?: boolean,
  excludeIds?: string[],
): { pool: CatalogModel[]; runnable: CatalogModel[] } {
  let pool = catalog.filter((m) => m.kind !== 'embed');

  if (!all) {
    const verified = pool.filter((m) => m.verified);
    if (verified.length >= 10) pool = verified;
  }

  pool = filterByUseCase(pool, useCase);

  const runnable = filterRunnable(pool, {
    budgetGb: hw.budgetGb,
    diskFreeGb: hw.diskFreeGb,
    includeEmbed: false,
    hw,
    excludeIds,
  });

  return { pool, runnable };
}

/** All catalog models that fit RAM + disk (ignores use case). */
export function hardwareFittingModels(
  catalog: CatalogModel[],
  hw: HardwareProfile,
  all?: boolean,
  excludeIds?: string[],
): CatalogModel[] {
  let pool = catalog.filter((m) => m.kind !== 'embed');
  if (!all) {
    const verified = pool.filter((m) => m.verified);
    if (verified.length >= 10) pool = verified;
  }
  return filterRunnable(pool, {
    budgetGb: hw.budgetGb,
    diskFreeGb: hw.diskFreeGb,
    includeEmbed: false,
    hw,
    excludeIds,
  });
}
