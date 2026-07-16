import type { HardwareProfile } from './hardware';
import { isTinyVm } from './hardware';
import type { Recommendation } from './recommend';
import { readLine, select, SELECT_HINT } from './linereader';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const GOLD = '\x1b[38;5;220m';
const TEAL = '\x1b[38;5;43m';

const MORE = '__more__';
const CUSTOM = '__custom__';
const BACK = '__back__';
const CANCEL = '__cancel__';

function formatSize(mb: number): string {
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`;
}

/** Map a recommendation to a 1-5 score + plain-language verdict. */
export function rateRec(r: Recommendation): { stars: number; label: string } {
  let s = Math.round((r.quality || 60) / 20);
  if (r.fit === 'marginal') s -= 1;
  s = Math.max(1, Math.min(5, s));

  let label: string;
  if (r.fit === 'marginal') label = 'Runs, but slower';
  else if (r.fit === 'perfect' && r.quality >= 82) label = 'Best';
  else if (r.fit === 'perfect') label = 'Excellent fit';
  else label = 'Recommended';
  return { stars: s, label };
}

function stars(n: number): string {
  return `${GOLD}${'★'.repeat(n)}${DIM}${'☆'.repeat(5 - n)}${RESET}`;
}

/** Outcome-focused, icon-tagged reasons a user actually cares about. */
function reasons(r: Recommendation): string {
  const parts: string[] = [];
  if (r.ramGb > 0 && r.ramGb <= 2) parts.push('⚡ Fast');
  else if (r.ramGb > 0 && r.ramGb <= 5) parts.push('⚡ Snappy');
  if (r.quality >= 85) parts.push('🧠 Top quality');
  else if (r.quality >= 78) parts.push('🧠 Great quality');
  else if (r.quality > 0) parts.push('🧠 Good quality');
  if (r.sizeMb > 0) parts.push(`💾 ${formatSize(r.sizeMb)}`);
  return parts.join('  ');
}

export function printHardwareResults(hw: HardwareProfile): void {
  console.log('  Scanning your computer…\n');
  console.log(`  ✓ ${hw.osLabel}`);
  console.log(`  ✓ ${hw.ramGb} GB RAM`);
  console.log(`  ✓ ${hw.cpuCores} CPU cores`);
  if (hw.hasGpu && hw.gpuUsable) {
    console.log(`  ✓ ${hw.gpuName ?? 'GPU'} (${hw.vramGb} GB VRAM)`);
  } else if (hw.hasGpu) {
    console.log(`  ✓ ${hw.gpuName ?? 'GPU'} (${hw.vramGb} GB — too small to offload, using CPU)`);
  } else {
    console.log('  ✓ CPU inference (no dedicated GPU detected)');
  }
  if (hw.diskFreeGb > 0) {
    console.log(`  ✓ ${hw.diskFreeGb} GB disk free`);
  }
  console.log(`  ✓ ~${hw.budgetGb} GB available for models`);
  if (isTinyVm(hw)) {
    console.log('  ⚠ Tiny instance — only very small models (e.g. SmolLM2 135M) are recommended.\n');
  } else {
    console.log('');
  }
}

export function printHardwareScan(hw: HardwareProfile): void {
  console.log('\n  OpenInference — local AI setup\n');
  printHardwareResults(hw);
}

/** Detailed list for `oi recommend` / `oi browse`. */
export function printRecommendations(recs: Recommendation[]): void {
  console.log('');
  recs.forEach((r, i) => {
    const { stars: sc, label } = rateRec(r);
    console.log(`  ${i + 1}. ${stars(sc)}  ${TEAL}${r.name}${RESET}  ${DIM}${label}${RESET}`);
    const why = reasons(r);
    if (why) console.log(`       ${why}`);
    console.log(`       ${DIM}${r.id}${RESET}`);
    console.log('');
  });
}

/** Free-text prompt. Uses the shared raw-keypress reader (never readline.createInterface
 *  on the interactive path) so it can't corrupt the next prompt's stdin state. */
export async function askText(prompt: string): Promise<string> {
  const answer = await readLine(prompt);
  return (answer ?? '').trim();
}

/** Rough RAM estimate (GB) from an Ollama tag like "llama3.1:8b". Null if no size. */
export function estimateRamFromTag(tag: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*b\b/i.exec(tag);
  if (!m) return null;
  const p = parseFloat(m[1]!);
  if (Number.isNaN(p)) return null;
  const overhead = p < 1 ? 0.55 : p < 2 ? 1.0 : p < 4 ? 1.5 : p < 10 ? 2.2 : p < 30 ? 3.5 : 5.5;
  return Math.round((p * 0.72 + overhead) * 10) / 10;
}

/** Yes/No prompt. In a TTY it uses the shared `select` reader (same stdin
 *  discipline as every other interactive prompt — no readline.createInterface).
 *  In a pipe / non-TTY it reads a line and parses y/n text, preserving the old
 *  scriptable behavior. The default option is used on empty input or Ctrl+C. */
export async function askYesNo(prompt: string, defaultYes = true): Promise<boolean> {
  const simple = process.env.OI_SIMPLE === '1' || !process.stdin.isTTY;
  if (simple) {
    const answer = (await readLine(prompt)) ?? '';
    const t = answer.trim().toLowerCase();
    if (!t) return defaultYes;
    return !/^(n|no)$/i.test(t);
  }

  const yes = { value: true, label: 'Yes' };
  const no = { value: false, label: 'No' };
  const picked = await select<boolean>({
    title: prompt.replace(/\s*\([yYnN/]+\):?\s*$/, '').trimEnd(),
    choices: defaultYes ? [yes, no] : [no, yes],
    hint: SELECT_HINT,
  });
  return picked ?? defaultYes;
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

export type ModelPickResult =
  | { action: 'pick'; model: Recommendation }
  | { action: 'back' }
  | { action: 'cancel' };

export async function pickRecommendation(
  recs: Recommendation[],
  opts?: {
    show?: number;
    totalFit?: number;
    fallback?: boolean;
    useCaseLabel?: string;
    budgetGb?: number;
    /** Show "← Change use case" (hide when --use-case locked the goal). */
    canBack?: boolean;
  },
): Promise<ModelPickResult> {
  if (recs.length === 0) {
    throw new Error('No models fit this machine. Free up RAM or disk, or try another use case.');
  }

  if (opts?.fallback) {
    console.log(
      `  ⚠ No "${opts.useCaseLabel}" models fit, but ${opts.totalFit ?? recs.length} small open-source models do:\n`,
    );
  } else if (opts?.totalFit != null) {
    console.log(`  ${opts.totalFit} models fit your computer for this use case.\n`);
  }

  let show = Math.min(opts?.show ?? recs.length, recs.length);
  const canBack = opts?.canBack !== false;

  while (true) {
    const choices: { value: string; label: string; hint?: string }[] = recs.slice(0, show).map((r, i) => ({
      value: r.id,
      label: r.name,
      hint: `${formatSize(r.sizeMb)}${i === 0 ? '  ⭐ recommended' : ''}`,
    }));
    if (show < recs.length) {
      choices.push({ value: MORE, label: `Show ${recs.length - show} more…`, hint: '' });
    }
    choices.push({ value: CUSTOM, label: '✎ Enter a custom model…', hint: 'any tag from ollama.com/library' });
    if (canBack) {
      choices.push({ value: BACK, label: '← Change use case', hint: 'pick a different goal' });
    }
    choices.push({ value: CANCEL, label: 'Cancel', hint: 'exit setup' });

    const picked = await select<string>({ title: '  Choose a model', choices });
    if (picked === null || picked === CANCEL) return { action: 'cancel' };
    if (picked === BACK) return { action: 'back' };
    if (picked === MORE) {
      show = recs.length;
      continue;
    }
    if (picked === CUSTOM) {
      const tag = await askText('\n  Ollama tag (e.g. mistral:7b, deepseek-r1:14b): ');
      if (!tag) {
        console.log('  No tag entered — pick again.\n');
        continue;
      }
      const est = estimateRamFromTag(tag);
      if (est != null && opts?.budgetGb != null && est > opts.budgetGb) {
        console.log(`\n  ⚠ ${tag} looks like it needs ~${est} GB RAM, but only ~${opts.budgetGb} GB is free for models here.`);
        console.log('    It may run slowly or fail to load — you can still try it.\n');
      }
      return {
        action: 'pick',
        model: {
          id: tag,
          name: tag,
          ramGb: est ?? 0,
          sizeMb: 0,
          quality: 0,
          useCase: 'your choice',
          categories: [],
          fit: 'good',
          score: 0,
        },
      };
    }
    return {
      action: 'pick',
      model: recs.find((r) => r.id === picked) ?? recs[0]!,
    };
  }
}

export type InstallAction = 'install' | 'browse' | 'back' | 'cancel';

export async function confirmInstall(opts: {
  modelName: string;
  sizeMb: number;
  needsOllama: boolean;
  canBrowse?: boolean;
  /** Show "← Change use case" (hide when goal is locked). */
  canBack?: boolean;
}): Promise<InstallAction> {
  const size = opts.sizeMb > 0 ? formatSize(opts.sizeMb) : 'the model (size unknown)';

  console.log('  This will:\n');
  if (opts.needsOllama) {
    console.log('    • Set up local inference (one-time)');
  }
  console.log(`    • Download ${size}${opts.sizeMb > 0 ? ` — ${opts.modelName}` : `: ${opts.modelName}`}`);
  console.log('    • Store model files on this computer\n');

  const choices: { value: InstallAction; label: string; hint?: string }[] = [
    { value: 'install', label: 'Install this model', hint: opts.modelName },
  ];
  if (opts.canBrowse) {
    choices.push({ value: 'browse', label: '← Pick a different model', hint: 'stay on this use case' });
  }
  if (opts.canBack) {
    choices.push({ value: 'back', label: '← Change use case', hint: 'pick a different goal' });
  }
  choices.push({ value: 'cancel', label: 'Cancel', hint: 'exit setup' });

  const picked = await select<InstallAction>({
    title: `  Ready to install ${opts.modelName}?`,
    choices,
  });
  return picked ?? 'cancel';
}
