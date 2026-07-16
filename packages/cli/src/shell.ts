import fs from 'node:fs';
import path from 'node:path';

import { configDir, configPath, loadConfig } from './config';
import { listModelTags, resolveOllamaUrl } from './ollama';
import { detectHardware, formatHardware, ollamaModelsPath } from './hardware';
import { runStart } from './start';
import { runBrowse, runRecommend } from './recommend-run';
import { parseUseCaseArg, pickUseCase, useCaseLabel, USE_CASES } from './use-cases';
import { formatChatMetrics, GenerationError, listInstalledModels, streamChatTurn, type ChatMessage } from './chat';
import { loadCatalog } from './recommend';
import { runInfo, runPull, runRemove, runSearch, runWhere, runUse, runUsePicker } from './manage';
import { runDoctor } from './doctor';
import { runServe } from './serve';
import { runIntegrate } from './integrate';
import { runUpdate } from './catalog';
import { LiveMeter } from './meter';
import { runOneShot } from './chat-repl';
import { printHardwareScan } from './prompt';
import { VERSION } from './version';
import { LineReader, type Suggestion } from './linereader';

// ── colors ──────────────────────────────────────────────
const C = (code: number, s: string) => `\x1b[38;5;${code}m${s}\x1b[0m`;
const brand = (s: string) => C(43, s);
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

export type ShellOptions = {
  ollamaUrl?: string;
  remote?: boolean;
  /** Suppress the per-reply tok/s footer. */
  quiet?: boolean;
};

type CommandSpec = {
  name: string;
  args?: string;
  help: string;
  group: 'Setup & models' | 'Session';
};

const COMMANDS: CommandSpec[] = [
  { name: '/setup', help: 'Pick a goal, scan hardware, install a model', group: 'Setup & models' },
  { name: '/search', args: '[query]', help: 'Search models (installed + available)', group: 'Setup & models' },
  { name: '/update', help: 'Refresh catalog + check CLI/runtime updates', group: 'Setup & models' },
  { name: '/recommend', args: '[goal]', help: 'Best models for your hardware', group: 'Setup & models' },
  { name: '/install', args: '<model>', help: 'Download a model', group: 'Setup & models' },
  { name: '/use', args: '[model]', help: 'Pick from installed models (or switch by name)', group: 'Setup & models' },
  { name: '/info', args: '<model>', help: 'Show details for a model', group: 'Setup & models' },
  { name: '/list', help: 'List installed models', group: 'Setup & models' },
  { name: '/remove', args: '<model>', help: 'Delete a model (frees disk)', group: 'Setup & models' },
  { name: '/run', args: '<model> <msg>', help: "Try a model once (doesn't switch)", group: 'Setup & models' },
  { name: '/where', help: 'Show model / config / catalog paths', group: 'Setup & models' },
  { name: '/serve', help: 'Start the local OpenAI-compatible endpoint', group: 'Setup & models' },
  { name: '/web', help: 'Open the local dashboard in your browser', group: 'Setup & models' },
  { name: '/integrate', args: '<tool>', help: 'Config for Cursor / Continue / aider / …', group: 'Setup & models' },
  { name: '/config', help: 'Show model & connection settings', group: 'Setup & models' },
  { name: '/status', help: 'Show current setup', group: 'Session' },
  { name: '/doctor', help: 'Diagnose setup, GPU usage, and speed', group: 'Session' },
  { name: '/scan', help: 'Re-scan this computer', group: 'Session' },
  { name: '/clear', help: 'Clear screen and conversation', group: 'Session' },
  { name: '/help', help: 'Show this help', group: 'Session' },
  { name: '/quit', help: 'Exit', group: 'Session' },
];

const USE_CASE_IDS = USE_CASES.map((u) => u.id);

// ── logo ────────────────────────────────────────────────
const LOGO = [
  ' ██    ██    ██   ___  ____  _____ _   _ ',
  ' ██    ██    ██  / _ \\|  _ \\| ____| \\ | |',
  ' ██ ██ ██ ██ ██  | | | | |_) |  _| |  \\| |',
  ' ██ ██ ██ ██ ██  | |_| |  __/| |___| |\\  |',
  ' ██ ██ ██ ██ ██   \\___/|_|   |_____|_| \\_|',
  '  ___ _   _ _____ _____ ____  _____ _   _  ____ _____ ',
  ' |_ _| \\ | |  ___| ____|  _ \\| ____| \\ | |/ ___| ____|',
  '  | ||  \\| | |_  |  _| | |_) |  _| |  \\| | |   |  _|  ',
  '  | || |\\  |  _| | |___|  _ <| |___| |\\  | |___| |___ ',
  ' |___|_| \\_|_|   |_____|_| \\_\\_____|_| \\_|\\____|_____|',
];

const LOGO_WIDTH = Math.max(...LOGO.map((l) => l.length)) + 2;
const BAR_COLOR = 48; // bright spring-green for the ██ blocks
const WORD_COLOR = 43; // on-brand teal for the wordmark

function termWidth(): number {
  return process.stdout.columns ?? 80;
}

/** Human "2 days ago" from an ISO timestamp. */
function formatAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function printLogo(): void {
  console.log('');
  if (termWidth() < LOGO_WIDTH) {
    // Compact fallback for narrow terminals
    console.log(`  ${C(BAR_COLOR, '██')} ${bold(brand('OPEN INFERENCE'))} ${dim('v' + VERSION)}`);
    return;
  }
  for (const line of LOGO) {
    const bars = line.match(/^[█ ]*/)?.[0] ?? '';
    const rest = line.slice(bars.length);
    console.log(`  ${C(BAR_COLOR, bars)}${C(WORD_COLOR, rest)}`);
  }
  console.log('');
  console.log(`  ${bold(brand('Run open-source AI on your machine.'))}  ${dim('v' + VERSION)}`);
}

/** First-time users: logo + a short welcome, no command chrome. The wizard runs next. */
function printFirstRunWelcome(): void {
  printLogo();
  console.log('');
  console.log(`  ${bold('Welcome!')} ${dim("Looks like this is your first time.")}`);
  console.log(`  ${dim("Let’s find a model that runs on this computer.")}`);
  console.log('');
}

/** Returning users: logo + active model + Ready. No scan, no wizard. */
function printReadyHeader(cfg: NonNullable<ReturnType<typeof loadConfig>>): void {
  printLogo();
  console.log('');
  console.log(`  ${dim('Model'.padEnd(10))}${bold(cfg.modelName)}`);
  console.log('');
  console.log(`  ${green('Ready.')}`);
  console.log('');
  console.log(dim('  /help for commands · /quit to exit'));
  console.log('');
}

/** Reprint the appropriate header for the current state (used by /clear). */
function printBanner(): void {
  const cfg = loadConfig();
  if (cfg) printReadyHeader(cfg);
  else printFirstRunWelcome();
}

function printHelp(): void {
  console.log('');
  console.log(bold('  Commands'));
  for (const group of ['Setup & models', 'Session'] as const) {
    console.log('');
    console.log(`  ${dim(group)}`);
    for (const c of COMMANDS.filter((x) => x.group === group)) {
      const usage = `${c.name}${c.args ? ' ' + c.args : ''}`;
      console.log(`    ${brand(usage.padEnd(20))} ${dim(c.help)}`);
    }
  }
  console.log('');
  console.log(`  ${dim('goals:')} ${USE_CASE_IDS.join(' · ')}`);
  console.log(dim('  Custom model? /install <tag> — any tag from the catalog'));
  console.log(dim('  Anything that is not a /command is sent to the active model.'));
  console.log('');
}

function printStatus(): void {
  const cfg = loadConfig();
  if (!cfg) {
    console.log('\n  Not set up yet. Type /setup\n');
    return;
  }
  console.log('');
  console.log(`  Model:    ${bold(cfg.modelName)} ${dim('(' + cfg.model + ')')}`);
  if (cfg.useCase) console.log(`  Use case: ${useCaseLabel(cfg.useCase)}`);
  console.log(`  Since:    ${new Date(cfg.setupAt).toLocaleDateString()}`);
  console.log(`  Storage:  ${ollamaModelsPath()}`);
  console.log('');
}

function printConfig(opts: ShellOptions): void {
  const cfg = loadConfig();
  console.log('');
  console.log(bold('  Configuration'));
  console.log('');

  if (!cfg) {
    const hw = detectHardware();
    const gpu = !hw.hasGpu
      ? 'none — CPU'
      : hw.gpuUsable
        ? `${hw.gpuName ?? 'GPU'} (${hw.vramGb} GB)`
        : `${hw.gpuName ?? 'GPU'} (${hw.vramGb} GB — using CPU)`;
    const label = (s: string) => s.padEnd(12);
    console.log('  No configuration yet — type /setup to create one.');
    console.log('');
    console.log(`  ${dim('Current defaults')}`);
    console.log(`  ${label('Model')}none`);
    console.log(`  ${label('GPU')}${gpu}`);
    console.log(`  ${label('Config')}${configPath()}`);
    console.log('');
    return;
  }

  const entry = loadCatalog().find((m) => m.id === cfg.model);

  const label = (s: string) => s.padEnd(15);
  console.log(`  ${label('Active model')}${bold(cfg.modelName)} ${dim('(' + cfg.model + ')')}`);
  if (entry) {
    const size = entry.sizeMb >= 1000 ? `${(entry.sizeMb / 1024).toFixed(1)} GB` : `${entry.sizeMb} MB`;
    console.log(`  ${label('')}${dim(`~${entry.ramGb} GB RAM · ${size} download · quality ${entry.quality}/100`)}`);
  }
  if (cfg.useCase) console.log(`  ${label('Use case')}${useCaseLabel(cfg.useCase)}`);
  console.log(`  ${label('Model files')}${ollamaModelsPath()}`);
  console.log(`  ${label('Config file')}${configPath()}`);
  console.log(`  ${label('Set up')}${new Date(cfg.setupAt).toLocaleDateString()}`);
  const hw = detectHardware();
  console.log(`  ${label('Hardware')}${formatHardware(hw)}`);
  console.log(`  ${label('Last scan')}${formatAgo(hw.scannedAt)} ${dim('· /scan to refresh')}`);
  console.log('');
  console.log(dim('  Switch model: /use   ·   Reconfigure: /setup'));
  console.log('');
}

async function showModels(opts: ShellOptions): Promise<void> {
  const names = await listInstalledModels(opts.ollamaUrl);
  if (names.length === 0) {
    console.log('\n  No models downloaded yet. Type /setup or /pull <model>\n');
    return;
  }
  console.log('\n  Downloaded models:\n');
  names.forEach((n) => console.log(`    ${n}`));
  console.log('');
}

/** One chat turn: live meter (spinner · rising tokens · tok/s · elapsed) while
 *  generating, then the reply is revealed with the exact-metrics footer. */
async function chat(history: ChatMessage[], message: string, opts: ShellOptions): Promise<void> {
  history.push({ role: 'user', content: message });

  console.log('');
  const meter = new LiveMeter();
  meter.start();
  let text: string;
  let metrics;
  try {
    ({ text, metrics } = await streamChatTurn(
      history,
      () => meter.bump(),
      { ollamaUrl: opts.ollamaUrl, remote: opts.remote },
    ));
  } finally {
    meter.stop();
  }

  history.push({ role: 'assistant', content: text });
  console.log(`  ${text.replace(/\n/g, '\n  ')}`);
  const footer = formatChatMetrics(metrics);
  if (footer && !opts.quiet) console.log(dim(`  ⎯ ${footer}`));
  console.log('');
}

async function dispatch(
  raw: string,
  history: ChatMessage[],
  opts: ShellOptions,
): Promise<{ exit?: boolean; needsWizard?: boolean }> {
  const [cmd, ...rest] = raw.slice(1).trim().split(/\s+/);
  const arg = rest.join(' ').trim();

  switch (cmd.toLowerCase()) {
    case 'help':
    case 'h':
    case '?':
      printHelp();
      return {};

    case 'recommend':
    case 'rec': {
      // No goal given → ask the user to pick a task first, then recommend.
      const useCase = parseUseCaseArg(arg) ?? (await pickUseCase());
      if (!useCase) {
        console.log('\n  Cancelled.\n');
        return {};
      }
      runRecommend({ useCase });
      return {};
    }

    case 'browse': {
      const useCase = parseUseCaseArg(arg) ?? (await pickUseCase());
      if (!useCase) {
        console.log('\n  Cancelled.\n');
        return {};
      }
      runBrowse({ useCase, all: true });
      return {};
    }

    case 'search':
    case 'find': {
      const all = /(^|\s)--all\b/.test(arg);
      const term = arg.replace(/(^|\s)--all\b/, '').trim();
      await runSearch(term, { ollamaUrl: opts.ollamaUrl, all });
      return {};
    }

    case 'info':
    case 'show':
      if (!arg) {
        console.log('\n  Usage: /info <model>   (Tab to autocomplete)\n');
        return {};
      }
      await runInfo(arg, { ollamaUrl: opts.ollamaUrl });
      return {};

    case 'use': {
      if (!arg) {
        const pick = await runUsePicker({ ollamaUrl: opts.ollamaUrl, docker: opts.remote });
        if (pick === 'search') await runSearch('', { ollamaUrl: opts.ollamaUrl });
        await refreshInstalled(opts);
        return {};
      }
      await runUse(arg, { ollamaUrl: opts.ollamaUrl, docker: opts.remote });
      await refreshInstalled(opts);
      return {};
    }

    case 'install':
    case 'pull':
    case 'add':
      if (!arg) {
        console.log('\n  Usage: /install <model>   (Tab to autocomplete)\n');
        return {};
      }
      await runPull(arg, { ollamaUrl: opts.ollamaUrl, docker: opts.remote });
      await refreshInstalled(opts);
      return {};

    case 'remove':
    case 'rm':
    case 'uninstall':
    case 'delete':
      if (!arg) {
        console.log('\n  Usage: /remove <model>   (Tab to autocomplete)\n');
        return {};
      }
      await runRemove(arg, { ollamaUrl: opts.ollamaUrl, docker: opts.remote });
      await refreshInstalled(opts);
      return {};

    case 'list':
    case 'models':
    case 'ls':
      await showModels(opts);
      return {};

    case 'where':
    case 'storage':
    case 'path':
      await runWhere();
      return {};

    case 'run': {
      const [model, ...rest] = arg.split(/\s+/);
      const prompt = rest.join(' ').trim();
      if (!model || !prompt) {
        console.log('\n  Usage: /run <model> <message>   (one-off — does not switch your active model)\n');
        return {};
      }
      console.log('');
      const out = await runOneShot(prompt, { model, ollamaUrl: opts.ollamaUrl, remote: opts.remote });
      console.log(`  ${out.text.replace(/\n/g, '\n  ')}`);
      const f = formatChatMetrics(out.metrics);
      if (f) console.log(dim(`  ⎯ ${f} · ${model}`));
      console.log('');
      return {};
    }

    case 'update':
      await runUpdate({ currentCatalog: loadCatalog() });
      catalogIds = []; // refresh tab-completion from the new catalog
      return {};

    case 'serve':
      await runServe({ ollamaUrl: opts.ollamaUrl });
      return {};

    case 'web':
    case 'ui':
    case 'dashboard':
      await runServe({ ollamaUrl: opts.ollamaUrl, openUi: true });
      return {};

    case 'integrate': {
      const tool = arg.split(/\s+/)[0];
      if (!tool) {
        console.log('\n  Usage: /integrate <cursor|continue|aider|cline|openai>\n');
        return {};
      }
      runIntegrate(tool, {});
      return {};
    }

    case 'config':
    case 'cfg':
      printConfig(opts);
      return {};

    case 'status':
      printStatus();
      return {};

    case 'doctor':
    case 'diagnose':
      await runDoctor({ ollamaUrl: opts.ollamaUrl });
      return {};

    case 'scan':
      console.log(dim('\n  Re-scanning hardware…'));
      printHardwareScan(detectHardware({ fresh: true }));
      return {};

    case 'setup':
      return { needsWizard: true };

    case 'clear':
    case 'cls':
      console.clear();
      history.length = 0;
      printBanner();
      return {};

    case 'quit':
    case 'exit':
    case 'q':
      return { exit: true };

    default:
      console.log(`\n  Unknown command: /${cmd}  ${dim('(try /help)')}\n`);
      return {};
  }
}

// ── tab completion ──────────────────────────────────────
let catalogIds: string[] = [];
function loadCatalogIds(): string[] {
  if (catalogIds.length) return catalogIds;
  try {
    catalogIds = loadCatalog().map((m) => m.id);
  } catch {
    catalogIds = [];
  }
  return catalogIds;
}

// Installed models, cached for `/rm` completion. Refreshed after pulls/removes.
let installedTags: string[] = [];
async function refreshInstalled(opts: ShellOptions): Promise<void> {
  try {
    installedTags = await listModelTags(opts.ollamaUrl);
  } catch {
    installedTags = [];
  }
}

function suggest(line: string): Suggestion[] {
  if (!line.startsWith('/')) return [];

  // /run: complete the model from installed, then keep typing the message.
  const runCmd = /^\/run\s+(\S*)$/.exec(line);
  if (runCmd) {
    const [, partial] = runCmd;
    return installedTags
      .filter((id) => id.startsWith(partial))
      .slice(0, 7)
      .map((id) => ({ value: `/run ${id} `, label: id, hint: 'then type your message', submit: false }));
  }

  // /use and /remove act on what you already have → complete from installed models.
  const installedCmd = /^(\/use|\/remove|\/rm|\/uninstall|\/delete)\s+(.*)$/.exec(line);
  if (installedCmd) {
    const [, cmd, partial] = installedCmd;
    return installedTags
      .filter((id) => id.startsWith(partial))
      .slice(0, 7)
      .map((id) => ({ value: `${cmd} ${id}`, label: id, submit: true }));
  }

  // /install and /info discover from the catalog (the repository).
  const catalogCmd = /^(\/install|\/pull|\/add|\/info|\/show)\s+(.*)$/.exec(line);
  if (catalogCmd) {
    const [, cmd, partial] = catalogCmd;
    const ids = loadCatalogIds();
    const hits: Suggestion[] = ids
      .filter((id) => id.startsWith(partial))
      .slice(0, 7)
      .map((id) => ({ value: `${cmd} ${id}`, label: id, submit: true }));
    // Let the user install ANY Ollama tag, even if it's not in our catalog.
    if (partial && !ids.includes(partial)) {
      hits.push({ value: `${cmd} ${partial}`, label: partial, hint: 'use this exact tag', submit: true });
    }
    return hits;
  }

  const integrateCmd = /^\/integrate\s+(.*)$/.exec(line);
  if (integrateCmd) {
    const [, partial] = integrateCmd;
    return ['cursor', 'continue', 'aider', 'cline', 'openai']
      .filter((t) => t.startsWith(partial))
      .map((t) => ({ value: `/integrate ${t}`, label: t, submit: true }));
  }

  const goal = /^(\/recommend|\/browse)\s+(.*)$/.exec(line);
  if (goal) {
    const [, cmd, partial] = goal;
    return USE_CASES.filter((u) => u.id.startsWith(partial)).map((u) => ({
      value: `${cmd} ${u.id}`,
      label: u.id,
      hint: u.description,
      submit: true,
    }));
  }

  // Once a command has a space/args, stop showing the command menu.
  if (/\s/.test(line)) return [];

  const ARG_CMDS = new Set(['/install', '/info', '/remove', '/integrate', '/run']);
  return COMMANDS.filter((c) => c.name.startsWith(line)).map((c) => {
    const needsArg = ARG_CMDS.has(c.name);
    return {
      value: needsArg ? `${c.name} ` : c.name,
      label: `${c.name}${c.args ? ' ' + c.args : ''}`,
      hint: c.help,
      submit: !needsArg,
    };
  });
}

// ── persistent history ──────────────────────────────────
function historyPath(): string {
  return path.join(configDir(), 'history');
}

function loadHistory(): string[] {
  try {
    return fs.readFileSync(historyPath(), 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function saveHistory(lines: string[]): void {
  try {
    fs.mkdirSync(configDir(), { recursive: true });
    fs.writeFileSync(historyPath(), lines.slice(-200).join('\n') + '\n', 'utf8');
  } catch {
    /* history is best-effort */
  }
}

export async function runShell(opts: ShellOptions = {}): Promise<void> {
  // First launch: logo + welcome, then straight into the wizard — no command
  // chrome. Returning launch: logo + active model + Ready, no scan, no wizard.
  if (!loadConfig()) {
    printFirstRunWelcome();
    try {
      await runStart({ chat: false, ollamaUrl: opts.ollamaUrl, docker: opts.remote });
    } catch (e) {
      console.error(`\n  ${red('Error')}: ${msg(e)}\n`);
    }
    if (!loadConfig()) {
      console.log(dim('\n  Setup not finished — run `oi` again when ready.\n'));
      return;
    }
    // Wizard already printed "✓ Ready"; just add the command hint.
    console.log(dim('  /help for commands · /quit to exit'));
    console.log('');
  } else {
    printReadyHeader(loadConfig()!);
  }

  // Seed installed-model list for /rm completion (best-effort, non-blocking on failure).
  void refreshInstalled(opts);

  const history: ChatMessage[] = [];
  const cmdHistory: string[] = loadHistory();
  const reader = new LineReader({
    prompt: brand('  oi ❯ '),
    promptWidth: 7,
    marker: brand('oi ❯'),
    markerWidth: 4,
    suggest,
    history: cmdHistory,
  });

  const remember = (line: string) => {
    if (line && line !== cmdHistory[cmdHistory.length - 1]) cmdHistory.push(line);
  };

  try {
    while (true) {
      const raw = await reader.question();
      if (raw === null) break; // Ctrl+C / Ctrl+D
      const line = raw.trim();
      if (!line) continue;
      remember(line);

      // Slash command
      if (line.startsWith('/')) {
        // Commands that open their own prompts run the wizard (its own stdin).
        if (/^\/setup\b/i.test(line)) {
          try {
            await runStart({ chat: false, force: true, ollamaUrl: opts.ollamaUrl, docker: opts.remote });
          } catch (e) {
            console.error(`\n  ${red('Error')}: ${msg(e)}\n`);
          }
          continue;
        }

        let result;
        try {
          result = await dispatch(line, history, opts);
        } catch (e) {
          console.error(`\n  ${red('Error')}: ${msg(e)}\n`);
          continue;
        }
        if (result.exit) break;
        continue;
      }

      // Plain text → chat. Run setup first if needed.
      if (!loadConfig()) {
        console.log(`\n  No model yet — starting setup.\n`);
        try {
          await runStart({ chat: false, ollamaUrl: opts.ollamaUrl, docker: opts.remote });
        } catch (e) {
          console.error(`\n  ${red('Error')}: ${msg(e)}\n`);
        }
        if (!loadConfig()) {
          console.log('  Setup not finished — type /setup to try again.\n');
          continue;
        }
        // Don't forward the word that triggered setup (e.g. "hi"/"oi") to the
        // model — it produces a confusing unprompted reply. Drop to a fresh prompt.
        console.log(dim('  Ready — ask me anything.\n'));
        continue;
      }

      try {
        await chat(history, line, opts);
      } catch (e) {
        if (history[history.length - 1]?.role === 'user') history.pop();
        // Show whatever the model produced before it failed — never eat the wait.
        if (e instanceof GenerationError && e.partial) {
          console.log(`  ${e.partial.replace(/\n/g, '\n  ')}`);
          console.log(dim('  ⎯ generation stopped early'));
        }
        console.error(`  ${red('Error')}: ${msg(e)}\n`);
      }
    }
  } finally {
    saveHistory(cmdHistory);
  }

  console.log(green('\n  Bye.\n'));
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
