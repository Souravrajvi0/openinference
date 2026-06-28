import type { Recommendation } from './recommend';
import { fitTier, loadCatalog, recommendTop } from './recommend';
import { detectHardware, formatHardware } from './hardware';
import { printRecommendations } from './prompt';

export type RecommendRunOptions = {
  limit?: number;
  all?: boolean;
};

export function runRecommend(opts: RecommendRunOptions = {}): Recommendation[] {
  const hw = detectHardware();
  const catalog = loadCatalog();
  const chat = catalog.filter((m) => m.kind !== 'embed');

  let pool = chat;
  if (!opts.all) {
    const verified = chat.filter((m) => m.verified);
    if (verified.length >= 3) pool = verified;
  }

  const limit = opts.limit ?? 5;
  const recs = recommendTop(pool, hw.budgetGb, limit);

  console.log('\n  OpenInference — model recommendations\n');
  console.log(`  System: ${formatHardware(hw)}`);
  console.log(`  Memory budget: ~${hw.budgetGb} GB`);
  console.log(
    `  Catalog: ${pool.length} models scored${opts.all ? '' : ' (verified Ollama tags only; use --all for full catalog)'}\n`,
  );

  if (recs.length === 0) {
    console.log('  No models fit this machine.\n');
    return recs;
  }

  console.log(`  Top ${recs.length} for your hardware:\n`);
  printRecommendations(recs);
  console.log('  Run `oi setup` to install Ollama and pull your choice.\n');

  return recs;
}

export { fitTier };
