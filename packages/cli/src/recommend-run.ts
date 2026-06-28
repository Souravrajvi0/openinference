import type { UseCaseId } from './use-cases';
import { parseUseCaseArg, useCaseLabel } from './use-cases';
import { detectHardware } from './hardware';
import { buildRecommendPool, loadCatalog, recommendTop } from './recommend';
import { printRecommendPreview } from './setup';

export type RecommendRunOptions = {
  limit?: number;
  all?: boolean;
  useCase?: UseCaseId;
};

export function runRecommend(opts: RecommendRunOptions = {}): void {
  const hw = detectHardware();
  const catalog = loadCatalog();
  const useCase = opts.useCase ?? 'chat';
  const { pool, runnable } = buildRecommendPool(catalog, hw, useCase, opts.all);

  const limit = opts.limit ?? 10;
  const recs = recommendTop(runnable, hw.budgetGb, limit, useCase, hw.diskFreeGb, hw);

  printRecommendPreview(recs, hw, {
    useCase,
    poolSize: pool.length,
    runnableSize: runnable.length,
    all: opts.all,
  });
}

export function runBrowse(opts: RecommendRunOptions = {}): void {
  runRecommend({ ...opts, limit: opts.limit ?? 15 });
}

export { parseUseCaseArg, useCaseLabel };
