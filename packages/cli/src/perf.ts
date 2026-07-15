import type { CatalogModel } from './recommend';
import { fitsHardware } from './recommend';
import type { HardwareProfile } from './hardware';

// Rough, honest tok/s estimates. These are heuristics based on model memory
// footprint + execution mode, NOT measurements — always present them as ranges
// and labelled as estimates. (f2 Track C: calibrate with real samples later.)

export type SpeedTier = 'fast' | 'ok' | 'slow' | 'very-slow';
export type ExecMode = 'gpu' | 'partial' | 'cpu';

export type SpeedEstimate = {
  low: number;
  high: number;
  tier: SpeedTier;
  mode: ExecMode;
};

function coreFactor(hw: HardwareProfile): number {
  return Math.min(1.5, Math.max(0.6, hw.cpuCores / 8));
}

function tierOf(mid: number): SpeedTier {
  if (mid >= 25) return 'fast';
  if (mid >= 12) return 'ok';
  if (mid >= 6) return 'slow';
  return 'very-slow';
}

/** Estimate generation speed for a model on this machine. Coarse — ranges only. */
export function estimateSpeed(model: CatalogModel, hw: HardwareProfile): SpeedEstimate {
  const size = Math.max(0.3, model.ramGb); // memory footprint drives throughput
  const cf = coreFactor(hw);

  let mode: ExecMode;
  const vramBudget = hw.gpuUsable ? Math.max(0, hw.vramGb - 0.8) : 0;
  if (hw.gpuUsable && model.ramGb <= vramBudget) mode = 'gpu';
  else if (hw.gpuUsable) mode = 'partial';
  else mode = 'cpu';

  let low: number;
  let high: number;
  if (mode === 'gpu') {
    // GPU throughput varies a lot across cards → deliberately wide band.
    low = 200 / size;
    high = 430 / size;
  } else if (mode === 'partial') {
    // Model spills out of VRAM into RAM — well below full-GPU speed.
    low = (40 / size) * cf;
    high = (70 / size) * cf;
  } else {
    low = (18 / size) * cf;
    high = (30 / size) * cf;
  }

  const r = (n: number) => (n >= 20 ? Math.round(n) : Math.round(n * 10) / 10);
  low = r(low);
  high = r(high);
  return { low, high, tier: tierOf((low + high) / 2), mode };
}

export function formatSpeed(est: SpeedEstimate): string {
  const range = est.low === est.high ? `${est.low}` : `${est.low}–${est.high}`;
  return `~${range} tok/s`;
}

const TIER_NOTE: Record<SpeedTier, string> = {
  fast: 'should feel fast',
  ok: 'usable',
  slow: 'likely slow',
  'very-slow': 'likely too slow to be pleasant',
};
export function tierNote(tier: SpeedTier): string {
  return TIER_NOTE[tier];
}

const TIER_RANK: Record<SpeedTier, number> = { 'very-slow': 0, slow: 1, ok: 2, fast: 3 };

export type Alternative = { model: CatalogModel; est: SpeedEstimate };

/**
 * A meaningfully faster model of comparable quality for the same use case, or
 * null if nothing clearly better fits. Used to nudge away from a slow pick.
 */
export function findFasterAlternative(
  model: CatalogModel,
  catalog: CatalogModel[],
  hw: HardwareProfile,
): Alternative | null {
  const target = estimateSpeed(model, hw);
  const cats = new Set(model.categories ?? []);

  const faster = catalog
    .filter((m) => m.id !== model.id && m.kind !== 'embed')
    .filter((m) => Boolean(fitsHardware(m, hw)))
    .filter((m) => cats.size === 0 || (m.categories ?? []).some((c) => cats.has(c)))
    .filter((m) => m.quality >= model.quality - 10)
    .map((m): Alternative => ({ model: m, est: estimateSpeed(m, hw) }))
    .filter((a) => TIER_RANK[a.est.tier] > TIER_RANK[target.tier]);

  if (faster.length === 0) return null;

  faster.sort((a, b) => {
    if (b.model.quality !== a.model.quality) return b.model.quality - a.model.quality;
    return b.est.high - a.est.high;
  });
  return faster[0]!;
}
