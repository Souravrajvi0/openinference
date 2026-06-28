import type { HardwareProfile } from './hardware';
import type { Recommendation } from './recommend';

const TIER_COLOR: Record<string, string> = {
  perfect: '\x1b[32m',
  good: '\x1b[33m',
  marginal: '\x1b[35m',
};
const RESET = '\x1b[0m';

function formatSize(mb: number): string {
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`;
}

export function printHardwareResults(hw: HardwareProfile): void {
  console.log('  Scanning your computer…\n');
  console.log(`  ✓ ${hw.osLabel}`);
  console.log(`  ✓ ${hw.ramGb} GB RAM`);
  console.log(`  ✓ ${hw.cpuCores} CPU cores`);
  if (hw.hasGpu) {
    console.log(`  ✓ ${hw.gpuName ?? 'GPU'} (${hw.vramGb} GB VRAM)`);
  } else {
    console.log('  ✓ CPU inference (no dedicated GPU detected)');
  }
  if (hw.diskFreeGb > 0) {
    console.log(`  ✓ ${hw.diskFreeGb} GB disk free`);
  }
  console.log(`  ✓ ~${hw.budgetGb} GB available for models\n`);
}

export function printHardwareScan(hw: HardwareProfile): void {
  console.log('\n  OpenInference — local AI setup\n');
  printHardwareResults(hw);
}

/** Detailed list for `oi recommend` / `oi browse`. */
export function printRecommendations(recs: Recommendation[]): void {
  console.log('');
  recs.forEach((r, i) => {
    const color = TIER_COLOR[r.fit] ?? '';
    const size = formatSize(r.sizeMb);
    console.log(
      `  [${i + 1}] ${color}${r.fit.padEnd(9)}${RESET} ${r.name.padEnd(22)} ${size.padStart(7)}  ${r.useCase}`,
    );
    console.log(`       ${r.id}`);
  });
  console.log('');
}

/** Wizard step: numbered picks with recommended badge on #1. */
export function printWizardRecommendations(
  recs: Recommendation[],
  totalFit: number,
  opts?: { fallback?: boolean; useCaseLabel?: string },
): void {
  if (opts?.fallback) {
    console.log(
      `  ⚠ No "${opts.useCaseLabel}" models fit, but ${totalFit} small open-source models do on your hardware:\n`,
    );
  } else {
    console.log(`  ${totalFit} models fit your computer for this use case. Top picks:\n`);
  }
  recs.forEach((r, i) => {
    const badge = i === 0 ? '  ⭐ Recommended' : '';
    const size = formatSize(r.sizeMb);
    console.log(`  ${i + 1}. ${r.name.padEnd(22)} ${size.padStart(8)}${badge}`);
  });
  console.log('');
}

export async function askYesNo(prompt: string, defaultYes = true): Promise<boolean> {
  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question(prompt, resolve);
  });
  rl.close();
  const t = answer.trim().toLowerCase();
  if (!t) return defaultYes;
  return !/^(n|no)$/i.test(t);
}

export function printTooSmallHelp(hw: HardwareProfile): void {
  console.log('\n  Nothing in our catalog fits this machine right now.\n');
  console.log(`  RAM budget: ~${hw.budgetGb} GB · Disk free: ${hw.diskFreeGb} GB\n`);
  console.log('  Options:');
  console.log('    • Free disk space or use a VM with 8 GB+ RAM');
  console.log('    • Try a different use case (General Chat has the most tiny models)');
  console.log('    • Force a tiny model:  oi -y -m smollm2:135m\n');
  if (hw.budgetGb < 0.5) {
    console.log('  Tip: update the CLI —  npm update -g @openinference/cli\n');
  }
}

export async function pickRecommendation(recs: Recommendation[]): Promise<Recommendation> {
  if (recs.length === 0) {
    throw new Error('No models fit this machine. Free up RAM or disk, or try another use case.');
  }
  if (recs.length === 1) return recs[0]!;

  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question(`  Choose a model (1-${recs.length}) [1]: `, resolve);
  });
  rl.close();

  const n = parseInt(answer.trim() || '1', 10);
  if (Number.isNaN(n) || n < 1 || n > recs.length) {
    console.log('  Invalid choice — using recommendation #1.\n');
    return recs[0]!;
  }
  return recs[n - 1]!;
}

export async function confirmInstall(opts: {
  modelName: string;
  sizeMb: number;
  needsOllama: boolean;
}): Promise<boolean> {
  const size = formatSize(opts.sizeMb);

  console.log('  This will:\n');
  if (opts.needsOllama) {
    console.log('    • Install Ollama (local AI runtime, one-time)');
  }
  console.log(`    • Download ${size} — ${opts.modelName}`);
  console.log('    • Store models in ~/.ollama/models (managed by Ollama)\n');

  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question('  Continue? (Y/n): ', resolve);
  });
  rl.close();

  const no = /^(n|no)$/i.test(answer.trim());
  if (no) {
    console.log('\n  Setup cancelled. Run `oi` again when you are ready.\n');
    return false;
  }
  return true;
}
