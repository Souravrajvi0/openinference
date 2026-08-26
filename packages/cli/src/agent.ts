import { loadConfig } from './config';
import { runStart } from './start';
import { askText, askYesNo } from './prompt';
import { LineReader, select } from './linereader';
import {
  HARNESS_TOOL_NAMES,
  MINIMAL_TOOL_NAMES,
  formatTodos,
  loadJsonl,
  newSessionId,
  runHarness,
  sessionDir,
  tinyModelWarning,
  type AskUserQuestion,
  type HarnessLiveState,
  type HarnessMode,
  type HarnessOptions,
  type HarnessResult,
  type HarnessStep,
} from './harness';
import path from 'node:path';
import fs from 'node:fs';

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
  plan?: boolean;
  mode?: HarnessMode;
  resume?: boolean;
  live?: HarnessLiveState;
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
    if (step.tool_name === 'todo_write') {
      console.log(`  ${GREEN}${icon}${RESET} todos`);
      for (const line of String(step.content ?? '').split('\n')) {
        console.log(`     ${line}`);
      }
      return;
    }
    if (step.tool_name === 'exit_plan_mode') {
      const lines = String(step.content ?? '').split('\n').slice(0, 24);
      for (const line of lines) console.log(`  ${dim(icon)} ${line.slice(0, 120)}`);
      return;
    }
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
      ? String(args.command ?? args.description ?? '')
      : toolName === 'write_file' || toolName === 'str_replace'
        ? String(args.path ?? '')
        : preview(args, 60);
  console.log('');
  return askYesNo(`  Allow ${toolName}${detail ? ` (${detail})` : ''}? (y/N): `, false);
}

async function ensureReady(opts: AgentCommandOptions): Promise<boolean> {
  if (loadConfig() || opts.model) return true;
  if (opts.json) {
    throw new Error('No model configured. Run: oi');
  }
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

function parseTools(list: string[] | undefined, mode?: HarnessMode): string[] | undefined {
  const pool = new Set(mode === 'minimal' ? MINIMAL_TOOL_NAMES : HARNESS_TOOL_NAMES);
  if (!list?.length) return mode === 'minimal' ? MINIMAL_TOOL_NAMES : undefined;
  const picked = list.map((s) => s.trim()).filter((s) => pool.has(s));
  return picked.length ? picked : mode === 'minimal' ? MINIMAL_TOOL_NAMES : undefined;
}

async function askUser(questions: AskUserQuestion[]): Promise<string> {
  if (!process.stdin.isTTY || process.env.OI_SIMPLE === '1') {
    return 'No interactive user; continue with a reasonable default.';
  }
  const answers: string[] = [];
  for (const q of questions) {
    const title = q.header ? `${q.header}: ${q.question}` : q.question;
    if (q.options?.length) {
      const picked = await select({
        title: `  ${title}`,
        choices: q.options.map((o) => ({ value: o.label, label: o.label, hint: o.description })),
        hint: '↑↓ move · Enter select',
      });
      answers.push(`${q.id}: ${picked ?? q.options[0]!.label}`);
    } else {
      const text = await askText(`\n  ${title}\n  > `);
      answers.push(`${q.id}: ${text || '(empty)'}`);
    }
  }
  return answers.join('\n');
}

async function reviewPlan(plan: string, auto: boolean): Promise<{ approved: boolean; feedback?: string }> {
  if (auto) return { approved: true };
  if (!process.stdin.isTTY || process.env.OI_SIMPLE === '1') {
    return { approved: false, feedback: 'Non-interactive — rerun with --yes to approve plans.' };
  }
  console.log('');
  console.log(`  ${BOLD}Plan for review${RESET}`);
  console.log('');
  for (const line of plan.split('\n').slice(0, 40)) {
    console.log(`  ${line}`);
  }
  console.log('');
  const ok = await askYesNo('  Approve this plan and start work? (y/N): ', false);
  if (ok) return { approved: true };
  const feedback = await askText('  Feedback (optional): ');
  return { approved: false, feedback: feedback || 'Keep planning.' };
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
    allowedTools: parseTools(opts.tools, opts.mode),
    yes: Boolean(opts.yes),
    plan: Boolean(opts.plan) || Boolean(opts.live?.planMode),
    mode: opts.mode,
    resume: Boolean(opts.resume),
    live: opts.live,
    onStep: opts.json ? undefined : printStep,
    onApprove: opts.yes || opts.json ? undefined : approve,
    onAskUser: opts.json ? undefined : askUser,
    onPlanReview: opts.json ? undefined : (plan) => reviewPlan(plan, Boolean(opts.yes)),
  };

  if (!opts.json) {
    const mode = opts.mode === 'minimal' ? 'minimal' : opts.plan || opts.live?.planMode ? 'plan' : 'standard';
    console.log('');
    console.log(`  ${BOLD}Agent${RESET}  ${dim(model || 'default')}  ${dim(workspace)}  ${dim(mode)}`);
    console.log('');
  }

  const result = await runHarness(harnessOpts);

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result;
  }

  if (result.todos.length) {
    console.log('');
    console.log(`  ${BOLD}Todos${RESET}`);
    for (const line of formatTodos(result.todos).split('\n')) console.log(`  ${line}`);
  }
  console.log('');
  console.log(`  ${GREEN}✓${RESET} ${result.answer.split('\n').join('\n  ')}`);
  console.log(dim(`  session ${result.session_id} · ~/.openinference/sessions/${result.session_id}.jsonl`));
  console.log('');
  return result;
}

async function runAgentRepl(opts: AgentCommandOptions): Promise<void> {
  const cfg = loadConfig();
  const live: HarnessLiveState = opts.live ?? {
    planMode: Boolean(opts.plan),
    todos: [],
    sessionId: newSessionId(),
  };
  const session = { ...opts, live, resume: false };

  console.log('');
  console.log(`  ${BOLD}oi agent${RESET}  ${dim('harness on your local model')}`);
  console.log(`  Model      ${cfg?.modelName ?? opts.model ?? '—'}`);
  console.log(`  Workspace  ${opts.cwd ?? process.cwd()}`);
  console.log(`  Mode       ${opts.mode === 'minimal' ? 'minimal' : live.planMode ? 'plan' : 'standard'}`);
  console.log(`  Session    ${live.sessionId}`);
  console.log('');
  console.log(dim('  Type a goal · /plan · /todos · /help · /quit'));
  console.log('');

  const history: string[] = [];
  const reader = new LineReader({
    prompt: `${TEAL}  agent ❯ ${RESET}`,
    promptWidth: 10,
    marker: `${TEAL}agent ❯${RESET}`,
    markerWidth: 7,
    suggest: (line) => {
      if (!line.startsWith('/')) return [];
      return ['/help', '/quit', '/yes', '/status', '/plan', '/plan off', '/todos', '/resume', '/sessions']
        .filter((c) => c.startsWith(line))
        .map((c) => ({ value: c, label: c, submit: !c.endsWith(' ') && c !== '/plan' }));
    },
    history,
  });

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
        console.log('  /plan [goal]   plan mode (explore, present a plan, wait)');
        console.log('  /plan off      leave plan mode');
        console.log('  /todos         show the session checklist');
        console.log('  /resume        continue the last saved session');
        console.log('  /sessions      list recent session logs');
        console.log('  /yes           auto-approve writes and shell');
        console.log('  /status        model + workspace + mode');
        console.log('  /quit          exit');
        console.log('');
        continue;
      }
      if (low === '/yes') {
        session.yes = !session.yes;
        console.log(`\n  Auto-approve is ${session.yes ? 'on' : 'off'}.\n`);
        continue;
      }
      if (low === '/plan off') {
        live.planMode = false;
        console.log('\n  Plan mode off.\n');
        continue;
      }
      if (low === '/plan' || low.startsWith('/plan ')) {
        live.planMode = true;
        const rest = line.slice(5).trim();
        if (!rest) {
          console.log('\n  Plan mode on — next goal will explore first.\n');
          continue;
        }
        try {
          await runAgentGoal(rest, { ...session, plan: true, live, resume: false });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`\n  ${RED}Error${RESET}: ${msg}\n`);
        }
        continue;
      }
      if (low === '/todos') {
        console.log('');
        console.log(formatTodos(live.todos).split('\n').map((l) => `  ${l}`).join('\n'));
        console.log('');
        continue;
      }
      if (low === '/resume') {
        session.resume = true;
        try {
          await runAgentGoal('Continue from where we left off.', { ...session, live, resume: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`\n  ${RED}Error${RESET}: ${msg}\n`);
        }
        session.resume = false;
        continue;
      }
      if (low === '/sessions') {
        printSessions();
        continue;
      }
      if (low === '/status') {
        const liveCfg = loadConfig();
        console.log('');
        console.log(`  Model      ${liveCfg?.modelName ?? session.model ?? '—'}`);
        console.log(`  Workspace  ${session.cwd ?? process.cwd()}`);
        console.log(`  Approve    ${session.yes ? 'auto' : 'ask'}`);
        console.log(`  Plan       ${live.planMode ? 'on' : 'off'}`);
        console.log(`  Session    ${live.sessionId}`);
        console.log('');
        continue;
      }
      if (line.startsWith('/')) {
        console.log(`\n  Unknown command: ${line}  ${dim('(try /help)')}\n`);
        continue;
      }

      try {
        await runAgentGoal(line, { ...session, live, resume: false });
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

function printSessions(): void {
  const dir = sessionDir();
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    files = [];
  }
  if (files.length === 0) {
    console.log('\n  No sessions yet.\n');
    return;
  }
  const rows = files
    .map((f) => {
      const id = f.slice(0, -6);
      const full = path.join(dir, f);
      const st = fs.statSync(full);
      const events = loadJsonl(full);
      const start = events.find((e) => e.type === 'start');
      return { id, mtime: st.mtimeMs, goal: String(start?.goal ?? '') };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 12);
  console.log('');
  for (const r of rows) {
    const when = new Date(r.mtime).toLocaleString();
    console.log(`  ${r.id}  ${dim(when)}`);
    if (r.goal) console.log(`    ${dim(r.goal.slice(0, 80))}`);
  }
  console.log('');
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
