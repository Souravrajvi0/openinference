import fs from 'node:fs';
import path from 'node:path';

import type { UseCaseId } from './use-cases';
import { filterByUseCase, useCaseScoreBoost } from './use-cases';
import { fitsDisk, type HardwareProfile } from './hardware';

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
};

function modelsPath(): string {
  const nextToDist = path.join(__dirname, 'data', 'models.json');
  if (fs.existsSync(nextToDist)) return nextToDist;
  return path.join(__dirname, '..', 'data', 'models.json');
}

export function loadCatalog(): CatalogModel[] {
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

/** Filter catalog by hardware, disk, and optional verified flag. */
export function filterRunnable(
  catalog: CatalogModel[],
  opts: RecommendOptions,
): CatalogModel[] {
  const disk = opts.diskFreeGb ?? 0;

  return catalog.filter((m) => {
    if (!opts.includeEmbed && m.kind === 'embed') return false;
    if (opts.verifiedOnly && !m.verified) return false;
    if (!fitTier(m.ramGb, opts.budgetGb)) return false;
    if (disk > 0 && !fitsDisk(m.sizeMb, disk)) return false;
    return true;
  });
}

export function scoreModel(
  model: CatalogModel,
  budgetGb: number,
  useCase?: UseCaseId,
): Recommendation | null {
  const fit = fitTier(model.ramGb, budgetGb);
  if (!fit) return null;

  let score = FIT_POINTS[fit] + model.quality * 0.35;
  if (useCase) score += useCaseScoreBoost(model, useCase);
  if (model.verified) score += 3;

  return { ...model, fit, score };
}

export function recommendTop(
  catalog: CatalogModel[],
  budgetGb: number,
  limit = 5,
  useCase?: UseCaseId,
  diskFreeGb?: number,
): Recommendation[] {
  const pool = filterRunnable(catalog, { budgetGb, diskFreeGb, includeEmbed: false });
  const scored: Recommendation[] = [];

  for (const model of pool) {
    const rec = scoreModel(model, budgetGb, useCase);
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
  });

  return { pool, runnable };
}
