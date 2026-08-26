import { loadConfig } from './config';
import { runStart } from './start';
import { askYesNo } from './prompt';
import { LineReader } from './linereader';
import {
  HARNESS_TOOL_NAMES,
  runHarness,
  tinyModelWarning,
  type HarnessOptions,
  type HarnessResult,
  type HarnessStep,
} from './harness';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const TEAL = '\x1b[38;5;43m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';

const ICON: Record<HarnessStep['type'], string> = {
  thought: '◎',
  tool_call: '⚙',
  tool_result: '↩',
  answer: '✓',
};

export type AgentCommandOptions = {
  model?: string;
  ollamaUrl?: string;
  remote?: boolean;
  yes?: boolean;
  cwd?: string;
  maxSteps?: number;
  tools?: string[];
  json?: boolean;
};

function dim(s: string): string {
  return `${DIM}${s}${RESET}`;
}

function preview(value: unknown, max = 80): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    const one = value.replace(/\s+/g, ' ').trim();
    return one.length > max ? one.slice(0, max - 1) + '…' : one;
  }
  try {
    const s = JSON.stringify(value);
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  } catch {
    return '';
  }
}

function printStep(step: HarnessStep): void {
  const icon = ICON[step.type];
  if (step.type === 'thought') {
    console.log(`  ${dim(icon)} ${dim(preview(step.content, 120))}`);
    return;
  }
  if (step.type === 'tool_call') {
    const args = preview(step.tool_input, 90);
    console.log(`  ${TEAL}${icon}${RESET} ${BOLD}${step.tool_name ?? 'tool'}${RESET}${args ? dim('  ' + args) : ''}`);
    return;
  }
  if (step.type === 'tool_result') {
    const lines = String(step.content ?? '').split('\n').slice(0, 8);
    for (const line of lines) {
      console.log(`  ${dim(icon)} ${dim(line.slice(0, 100))}`);
    }
    const extra = String(step.content ?? '').split('\n').length - lines.length;
    if (extra > 0) console.log(`  ${dim(`… +${extra} lines`)}`);
    return;
  }
}

async function approve(toolName: string, args: Record<string, unknown>): Promise<boolean> {
  if (!process.stdin.isTTY || process.env.OI_SIMPLE === '1') {
    console.log(`  ${dim(`${toolName} needs --yes in non-interactive mode.`)}`);
    return false;
  }
  const detail =
    toolName === 'run_command'
      ? String(args.command ?? '')
      : toolName === 'write_file'
        ? String(args.path ?? '')
        : preview(args, 60);
  console.log('');
  return askYesNo(`  Allow ${toolName}${detail ? ` (${detail})` : ''}? (y/N): `, false);
}

async function ensureReady(opts: AgentCommandOptions): Promise<boolean> {
  if (loadConfig() || opts.model) return true;
  console.log('\n  Not set up yet. Starting setup wizard…\n');
  await runStart({
    chat: false,
    yes: opts.yes,
    ollamaUrl: opts.ollamaUrl,
    docker: opts.remote,
  });
  if (!loadConfig() && !opts.model) {
    console.log('  Setup not complete. Run `oi` to finish.\n');
    return false;
  }
  return true;
}

function parseTools(list?: string[]): string[] | undefined {
  if (!list?.length) return undefined;
  const names = new Set(HARNESS_TOOL_NAMES);
  const picked = list.map((s) => s.trim()).filter((s) => names.has(s));
  return picked.length ? picked : undefined;
}

export async function runAgentGoal(goal: string, opts: AgentCommandOptions = {}): Promise<HarnessResult> {
  const cfg = loadConfig();
  const model = opts.model ?? cfg?.model ?? '';
  const workspace = opts.cwd ?? process.cwd();
  const warn = tinyModelWarning(model);
  if (warn && !opts.json) {
    console.log(`\n  ${dim('Note:')} ${warn}\n`);
  }

  const harnessOpts: HarnessOptions = {
    goal,
    workspace,
    model: opts.model,
    ollamaUrl: opts.ollamaUrl,
    remote: opts.remote,
    maxSteps: opts.maxSteps,
    allowedTools: parseTools(opts.tools),
    yes: Boolean(opts.yes),
    onStep: opts.json ? undefined : printStep,
    onApprove: opts.yes || opts.json ? undefined : approve,
  };

  if (!opts.json) {
    console.log('');
    console.log(`  ${BOLD}Agent${RESET}  ${dim(model || 'default')}  ${dim(workspace)}`);
    console.log('');
  }

  const result = await runHarness(harnessOpts);

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result;
  }

  console.log('');
  console.log(`  ${GREEN}✓${RESET} ${result.answer.split('\n').join('\n  ')}`);
  console.log('');
  return result;
}

async function runAgentRepl(opts: AgentCommandOptions): Promise<void> {
  const cfg = loadConfig();
  console.log('');
  console.log(`  ${BOLD}oi agent${RESET}  ${dim('harness on your local model')}`);
  console.log(`  Model      ${cfg?.modelName ?? opts.model ?? '—'}`);
  console.log(`  Workspace  ${opts.cwd ?? process.cwd()}`);
  console.log(`  Tools      ${HARNESS_TOOL_NAMES.join(', ')}`);
  console.log('');
  console.log(dim('  Type a goal · /help · /quit'));
  console.log('');

  const history: string[] = [];
  const reader = new LineReader({
    prompt: `${TEAL}  agent ❯ ${RESET}`,
    promptWidth: 10,
    marker: `${TEAL}agent ❯${RESET}`,
    markerWidth: 7,
    suggest: (line) => {
      if (!line.startsWith('/')) return [];
      return ['/help', '/quit', '/yes', '/status']
        .filter((c) => c.startsWith(line))
        .map((c) => ({ value: c, label: c, submit: true }));
    },
    history,
  });

  const session = { ...opts };

  try {
    while (true) {
      const raw = await reader.question();
      if (raw === null) break;
      const line = raw.trim();
      if (!line) continue;
      if (line !== history[history.length - 1]) history.push(line);

      const low = line.toLowerCase();
      if (low === '/quit' || low === '/exit' || low === '/q') break;
      if (low === '/help' || low === '/h') {
        console.log('');
        console.log('  Type a goal and the local model will use tools to work on it.');
        console.log('  /yes      auto-approve writes and shell');
        console.log('  /status   model + workspace');
        console.log('  /quit     exit');
        console.log('');
        continue;
      }
      if (low === '/yes') {
        session.yes = !session.yes;
        console.log(`\n  Auto-approve is ${session.yes ? 'on' : 'off'}.\n`);
        continue;
      }
      if (low === '/status') {
        const live = loadConfig();
        console.log('');
        console.log(`  Model      ${live?.modelName ?? session.model ?? '—'}`);
        console.log(`  Workspace  ${session.cwd ?? process.cwd()}`);
        console.log(`  Approve    ${session.yes ? 'auto' : 'ask'}`);
        console.log('');
        continue;
      }
      if (line.startsWith('/')) {
        console.log(`\n  Unknown command: ${line}  ${dim('(try /help)')}\n`);
        continue;
      }

      try {
        await runAgentGoal(line, session);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`\n  ${RED}Error${RESET}: ${msg}\n`);
      }
    }
  } finally {
    /* LineReader restores stdin when question() resolves */
  }

  console.log(`${GREEN}\n  Bye.\n${RESET}`);
}

/** `oi agent [goal…]` — one-shot or interactive harness. */
export async function runAgentCommand(goal: string, opts: AgentCommandOptions = {}): Promise<void> {
  const ready = await ensureReady(opts);
  if (!ready) return;

  if (!goal.trim()) {
    await runAgentRepl(opts);
    return;
  }

  await runAgentGoal(goal.trim(), opts);
}
