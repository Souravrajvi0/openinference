import fs from 'node:fs';
import path from 'node:path';

export type FitTier = 'perfect' | 'good' | 'marginal';

export type CatalogModel = {
  id: string;
  name: string;
  ramGb: number;
  sizeMb: number;
  quality: number;
  useCase: string;
  kind?: 'embed';
  verified?: boolean;
};

export type Recommendation = CatalogModel & {
  fit: FitTier;
  score: number;
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

export function recommendTop(
  catalog: CatalogModel[],
  budgetGb: number,
  limit = 5,
): Recommendation[] {
  const chatCatalog = catalog.filter((m) => m.kind !== 'embed');
  const scored: Recommendation[] = [];

  for (const model of chatCatalog) {
    const fit = fitTier(model.ramGb, budgetGb);
    if (!fit) continue;
    const score = FIT_POINTS[fit] + model.quality * 0.35;
    scored.push({ ...model, fit, score });
  }

  scored.sort((a, b) => b.score - a.score);

  if (scored.length >= limit) return scored.slice(0, limit);

  // Fill with smallest runnable models if budget is very tight
  const extra = chatCatalog
    .filter((m) => m.ramGb <= budgetGb)
    .filter((m) => !scored.some((s) => s.id === m.id))
    .sort((a, b) => a.ramGb - b.ramGb)
    .slice(0, limit - scored.length)
    .map((m) => ({
      ...m,
      fit: fitTier(m.ramGb, budgetGb) ?? ('marginal' as FitTier),
      score: (fitTier(m.ramGb, budgetGb) ? FIT_POINTS[fitTier(m.ramGb, budgetGb)!] : 40) + m.quality * 0.35,
    }));

  return [...scored, ...extra].slice(0, limit);
}
