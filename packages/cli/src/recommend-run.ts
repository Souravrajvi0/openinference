import type { UseCaseId } from './use-cases';
import { parseUseCaseArg, useCaseLabel } from './use-cases';
import { detectHardware } from './hardware';
import { loadCrashedModels } from './config';
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
  const crashed = loadCrashedModels();
  const { pool, runnable } = buildRecommendPool(catalog, hw, useCase, opts.all, crashed);

  const limit = opts.limit ?? 5;
  const recs = recommendTop(runnable, hw.budgetGb, limit, useCase, hw.diskFreeGb, hw);

  printRecommendPreview(recs, hw, {
    useCase,
    poolSize: pool.length,
    runnableSize: runnable.length,
    all: opts.all,
  });

  if (crashed.length > 0) {
    console.log(
      `  ${crashed.length} model(s) hidden because they crashed here — retry with \`oi pull <model>\`.\n`,
    );
  }
}

export function runBrowse(opts: RecommendRunOptions = {}): void {
  runRecommend({ ...opts, limit: opts.limit ?? 20 });
}

export { parseUseCaseArg, useCaseLabel };
