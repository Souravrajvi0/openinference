import readline from 'node:readline';

import type { Recommendation } from './recommend';
import { fitLabel } from './recommend';

const TIER_COLOR: Record<string, string> = {
  perfect: '\x1b[32m',
  good: '\x1b[33m',
  marginal: '\x1b[35m',
};
const RESET = '\x1b[0m';

export function printRecommendations(recs: Recommendation[]): void {
  console.log('');
  recs.forEach((r, i) => {
    const color = TIER_COLOR[r.fit] ?? '';
    const size = r.sizeMb >= 1000 ? `${(r.sizeMb / 1000).toFixed(1)} GB` : `${r.sizeMb} MB`;
    console.log(
      `  [${i + 1}] ${color}${fitLabel(r.fit).padEnd(9)}${RESET} ${r.name.padEnd(22)} ${size.padStart(7)}  ${r.useCase}`,
    );
    console.log(`       ${r.id}`);
  });
  console.log('');
}

export async function pickRecommendation(recs: Recommendation[]): Promise<Recommendation> {
  if (recs.length === 0) {
    throw new Error('No models fit this machine. Free up RAM or use a machine with more memory.');
  }
  if (recs.length === 1) return recs[0]!;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question(`Pick a model [1-${recs.length}] (default 1): `, resolve);
  });
  rl.close();

  const n = parseInt(answer.trim() || '1', 10);
  if (Number.isNaN(n) || n < 1 || n > recs.length) {
    console.log('Invalid choice — using recommendation #1.');
    return recs[0]!;
  }
  return recs[n - 1]!;
}
