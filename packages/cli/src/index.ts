#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from './config';
import { runStart } from './start';
import { runBrowse, runRecommend, parseUseCaseArg } from './recommend-run';
import { runChat, listInstalledModels } from './chat';
import { runChatRepl } from './chat-repl';
import { runInfo, runPull, runRemove, runSearch, runStorage, runUse, runUsePicker } from './manage';
import { useCaseLabel } from './use-cases';
import { ollamaModelsPath } from './hardware';
import { runShell } from './shell';
import { runAgentCommand } from './agent';
import { DEFAULT_MAX_STEPS, HARNESS_TOOL_NAMES, formatSessionReplay, initProject, listSessionSummaries, loadJsonl, resolveSessionId, sessionPath, undoLast } from './harness';
import { VERSION } from './version';

const program = new Command();

function fail(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`\n  Error: ${msg}\n`);
  process.exit(1);
}

const urlOption = {
  flags: '--ollama-url <url>',
  description: 'Ollama API URL (default: $OLLAMA_URL, saved config, or localhost)',
};

const dockerOption = {
  flags: '--docker',
  description: 'remote Ollama over HTTP (no local install)',
};

const setupOptions = [
  { flags: '-y, --yes', description: 'skip wizard — auto-pick best model and install' },
  { flags: '-m, --model <id>', description: 'use a specific model tag' },
  {
    flags: '--use-case <id>',
    description: 'goal: coding | chat | pdfs | writing | image | research',
  },
  { flags: '--all', description: 'include unverified catalog tags' },
  { flags: '--skip-install', description: 'do not install Ollama if missing' },
  dockerOption,
  urlOption,
] as const;

function attachSetupOptions(cmd: Command): Command {
  for (const o of setupOptions) {
    cmd.option(o.flags, o.description);
  }
  return cmd;
}

function setupFlags(opts: Record<string, unknown>) {
  const useCase = parseUseCaseArg(opts.useCase as string | undefined);
  return {
    yes: Boolean(opts.yes),
    model: opts.model as string | undefined,
    useCase,
    all: Boolean(opts.all),
    skipInstall: Boolean(opts.skipInstall),
    docker: Boolean(opts.docker),
    ollamaUrl: opts.ollamaUrl as string | undefined,
  };
}

program
  .name('oi')
  .description('oi — package manager for local AI models + agent harness')
  .version(VERSION);

const shellCmd = program
  .command('shell', { isDefault: true })
  .description('Interactive shell: banner + slash commands + chat')
  .option(urlOption.flags, urlOption.description)
  .option(dockerOption.flags, dockerOption.description);

shellCmd.action(async (opts) => {
  try {
    await runShell({ ollamaUrl: opts.ollamaUrl, remote: opts.docker });
  } catch (e) {
    fail(e);
  }
});

const startCmd = program
  .command('start')
  .description('Wizard: use case → scan → pick → confirm → install → chat')
  .option('--force', 'run setup again even if already configured')
  .option('--no-chat', 'setup only, do not open chat after');

attachSetupOptions(startCmd);
startCmd.action(async (opts) => {
  try {
    await runStart({ ...setupFlags(opts), force: Boolean(opts.force), chat: opts.chat });
  } catch (e) {
    fail(e);
  }
});

const setupCmd = program.command('setup').description('Wizard without opening chat');
attachSetupOptions(setupCmd);
setupCmd.action(async (opts) => {
  try {
    await runStart({ ...setupFlags(opts), chat: false });
  } catch (e) {
    fail(e);
  }
});

program
  .command('recommend')
  .description('Preview recommendations (no install)')
  .option('-n, --limit <n>', 'number of results', '5')
  .option('--use-case <id>', 'coding | chat | pdfs | writing | image | research')
  .option('--all', 'full catalog')
  .action((opts: { limit: string; useCase?: string; all?: boolean }) => {
    try {
      const n = Math.min(Math.max(parseInt(opts.limit, 10) || 10, 1), 25);
      runRecommend({ limit: n, all: opts.all, useCase: parseUseCaseArg(opts.useCase) });
    } catch (e) {
      fail(e);
    }
  });

program
  .command('browse')
  .description('Browse catalog picks for your hardware and use case')
  .option('--use-case <id>', 'coding | chat | pdfs | writing | image | research')
  .option('--all', 'full catalog')
  .action((opts: { useCase?: string; all?: boolean }) => {
    try {
      runBrowse({ all: opts.all, useCase: parseUseCaseArg(opts.useCase) });
    } catch (e) {
      fail(e);
    }
  });

program
  .command('use [model]')
  .description('Switch active model (no arg = pick from installed)')
  .option(urlOption.flags, urlOption.description)
  .option('--docker', 'remote inference host')
  .action(async (model: string | undefined, opts) => {
    try {
      if (!model?.trim()) {
        const pick = await runUsePicker({ ollamaUrl: opts.ollamaUrl });
        if (pick === 'search') await runSearch('', { ollamaUrl: opts.ollamaUrl });
        return;
      }
      await runUse(model, { ollamaUrl: opts.ollamaUrl, docker: opts.docker });
    } catch (e) {
      fail(e);
    }
  });

program
  .command('install <model>')
  .aliases(['pull', 'add'])
  .description('Download a model')
  .option('--default', 'also set as active model')
  .option(urlOption.flags, urlOption.description)
  .option('--docker', 'remote Ollama')
  .action(async (model: string, opts) => {
    try {
      await runPull(model, {
        ollamaUrl: opts.ollamaUrl,
        docker: opts.docker,
        setDefault: Boolean(opts.default),
      });
    } catch (e) {
      fail(e);
    }
  });

program
  .command('search [query]')
  .alias('find')
  .description('Search models that fit this machine (--all for every model)')
  .option('--all', 'include models too big for this machine')
  .option(urlOption.flags, urlOption.description)
  .action(async (query: string | undefined, opts) => {
    try {
      await runSearch(query ?? '', { ollamaUrl: opts.ollamaUrl, all: Boolean(opts.all) });
    } catch (e) {
      fail(e);
    }
  });

program
  .command('info <model>')
  .alias('show')
  .description('Show details for a model (RAM, size, fit, installed state)')
  .option(urlOption.flags, urlOption.description)
  .action(async (model: string, opts) => {
    try {
      await runInfo(model, { ollamaUrl: opts.ollamaUrl });
    } catch (e) {
      fail(e);
    }
  });

program
  .command('agent [goal...]')
  .alias('run')
  .description('Agent harness — plan, todos, unique edits, session log')
  .option('-y, --yes', 'auto-approve writes and shell commands')
  .option('-m, --model <id>', 'override model for this run')
  .option('--cwd <dir>', 'workspace root (default: current directory)')
  .option('--max-steps <n>', `max tool-loop steps (default ${DEFAULT_MAX_STEPS}, or .oi/config.json)`)
  .option('--tools <list>', `comma-separated tools (${HARNESS_TOOL_NAMES.join(', ')})`)
  .option('--json', 'print the run as JSON (no live step log)')
  .option('--plan', 'plan mode — explore, present a plan, wait for approval')
  .option('--mode <mode>', 'standard (full tools) | minimal (read, str_replace, shell)')
  .option('--resume', 'continue the last append-only session')
  .option(urlOption.flags, urlOption.description)
  .option('--docker', 'remote Ollama')
  .action(async (goalParts: string[], opts) => {
    try {
      const parsed = parseInt(String(opts.maxSteps ?? ''), 10);
      const n = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 24) : undefined;
      const tools = typeof opts.tools === 'string' ? opts.tools.split(',') : undefined;
      const mode = String(opts.mode ?? '') === 'minimal' ? 'minimal' : String(opts.mode ?? '') === 'standard' ? 'standard' : undefined;
      await runAgentCommand((goalParts ?? []).join(' ').trim(), {
        yes: Boolean(opts.yes),
        model: opts.model,
        cwd: opts.cwd,
        maxSteps: n,
        tools,
        json: Boolean(opts.json),
        plan: Boolean(opts.plan),
        mode,
        resume: Boolean(opts.resume),
        ollamaUrl: opts.ollamaUrl,
        remote: opts.docker,
      });
    } catch (e) {
      fail(e);
    }
  });

program
  .command('init')
  .description('Create .oi/config.json, .oiignore, and AGENTS.md in this project')
  .option('--force', 'overwrite existing files')
  .option('--cwd <dir>', 'project root (default: current directory)')
  .action((opts: { force?: boolean; cwd?: string }) => {
    try {
      const result = initProject(opts.cwd ?? process.cwd(), { force: Boolean(opts.force) });
      if (!result.created.length && !result.skipped.length) {
        console.log('\n  Nothing to write.\n');
        return;
      }
      console.log('');
      for (const f of result.created) console.log(`  created ${f}`);
      for (const f of result.skipped) console.log(`  exists  ${f}  (pass --force to replace)`);
      console.log('\n  Then: oi agent "what is in this repo?"\n');
    } catch (e) {
      fail(e);
    }
  });

program
  .command('undo')
  .description('Restore the last agent file edit in this workspace')
  .option('--cwd <dir>', 'workspace root (default: current directory)')
  .action((opts: { cwd?: string }) => {
    try {
      console.log(`\n  ${undoLast(opts.cwd ?? process.cwd())}\n`);
    } catch (e) {
      fail(e);
    }
  });

const sessionsCmd = program
  .command('sessions')
  .alias('session')
  .description('List recent agent sessions')
  .option('-n, --limit <n>', 'how many to show', '12')
  .action((opts: { limit?: string }) => {
    try {
      const limit = Math.min(Math.max(parseInt(String(opts.limit ?? '12'), 10) || 12, 1), 50);
      const rows = listSessionSummaries(limit);
      if (!rows.length) {
        console.log('\n  No sessions yet. Run: oi agent\n');
        return;
      }
      console.log('');
      for (const r of rows) {
        console.log(`  ${r.id}  ${new Date(r.mtime).toLocaleString()}`);
        if (r.goal) console.log(`    ${r.goal.slice(0, 90)}`);
      }
      console.log('\n  oi sessions show [id]   ·  oi sessions replay [id]\n');
    } catch (e) {
      fail(e);
    }
  });

sessionsCmd
  .command('show [id]')
  .description('Print a session log (default: latest)')
  .action((id: string | undefined) => {
    try {
      const resolved = resolveSessionId(id);
      if (!resolved) {
        console.log('\n  No sessions yet.\n');
        return;
      }
      const events = loadJsonl(sessionPath(resolved));
      console.log(`\n  session ${resolved}  (${events.length} events)\n`);
      const start = events.find((e) => e.type === 'start');
      if (start?.goal) console.log(`  goal   ${String(start.goal)}\n`);
      const answers = events.filter((e) => e.type === 'answer');
      const last = answers[answers.length - 1];
      if (last?.content) console.log(`  ${String(last.content)}\n`);
    } catch (e) {
      fail(e);
    }
  });

sessionsCmd
  .command('replay [id]')
  .description('Replay tool steps from a session log (default: latest)')
  .action((id: string | undefined) => {
    try {
      const resolved = resolveSessionId(id);
      if (!resolved) {
        console.log('\n  No sessions yet.\n');
        return;
      }
      const events = loadJsonl(sessionPath(resolved));
      console.log(`\n  replay ${resolved}\n`);
      console.log(formatSessionReplay(events));
      console.log('');
    } catch (e) {
      fail(e);
    }
  });

program
  .command('chat [message]')
  .description('Chat with active model (no message = interactive)')
  .option('-y, --yes', 'if setup needed, skip wizard')
  .option('-m, --model <id>', 'override model for this session')
  .option(urlOption.flags, urlOption.description)
  .option('--docker', 'remote Ollama')
  .action(async (message: string | undefined, opts) => {
    try {
      const chatOpts = {
        model: opts.model,
        ollamaUrl: opts.ollamaUrl,
        remote: opts.docker,
      };
      if (!message?.trim()) {
        if (!loadConfig() && !opts.model) {
          console.log('\n  Not set up yet. Starting setup wizard…\n');
          await runStart({ chat: false, yes: opts.yes, ollamaUrl: opts.ollamaUrl, docker: opts.docker });
        }
        if (!loadConfig() && !opts.model) {
          console.log('  Setup not complete. Run `oi` to finish.\n');
          return;
        }
        await runChatRepl(chatOpts);
        return;
      }
      const reply = await runChat(message.trim(), chatOpts);
      console.log(`\n${reply}\n`);
    } catch (e) {
      fail(e);
    }
  });

program
  .command('remove <model>')
  .aliases(['rm', 'uninstall'])
  .description('Delete a downloaded model and free disk space')
  .option('-y, --yes', 'skip confirmation')
  .option(urlOption.flags, urlOption.description)
  .option('--docker', 'remote Ollama')
  .action(async (model: string, opts) => {
    try {
      await runRemove(model, {
        ollamaUrl: opts.ollamaUrl,
        docker: opts.docker,
        yes: Boolean(opts.yes),
      });
    } catch (e) {
      fail(e);
    }
  });

program
  .command('list')
  .aliases(['models', 'ls'])
  .description('List installed models')
  .option(urlOption.flags, urlOption.description)
  .action(async (opts: { ollamaUrl?: string }) => {
    try {
      const names = await listInstalledModels(opts.ollamaUrl);
      if (names.length === 0) {
        console.log('\n  No models yet. Run: oi\n');
        return;
      }
      console.log('\n  Models on this computer:\n');
      names.forEach((n) => console.log(`    ${n}`));
      console.log(`\n  Stored under: ${ollamaModelsPath()}\n`);
    } catch (e) {
      fail(e);
    }
  });

program
  .command('storage')
  .description('Where models are stored and what is downloaded')
  .action(async () => {
    try {
      await runStorage();
    } catch (e) {
      fail(e);
    }
  });

program
  .command('status')
  .description('Show saved setup')
  .action(() => {
    const cfg = loadConfig();
    if (!cfg) {
      console.log('\n  Not set up yet. Run:\n\n    oi\n');
      return;
    }
    console.log('\n  OpenInference\n');
    console.log(`  Model:    ${cfg.modelName} (${cfg.model})`);
    if (cfg.useCase) console.log(`  Use case: ${useCaseLabel(cfg.useCase)}`);
    console.log(`  Since:    ${new Date(cfg.setupAt).toLocaleDateString()}`);
    console.log(`  Storage:  ${ollamaModelsPath()}\n`);
    console.log('  Run `oi` to chat · `oi use <model>` to switch\n');
  });

program.parse();
