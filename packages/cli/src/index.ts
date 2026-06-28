#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from './config';
import { runStart } from './start';
import { runBrowse, runRecommend, parseUseCaseArg } from './recommend-run';
import { runChat, listInstalledModels } from './chat';
import { runChatRepl } from './chat-repl';
import { runInfo, runPull, runRemove, runSearch, runStorage, runUse } from './manage';
import { useCaseLabel } from './use-cases';
import { ollamaModelsPath } from './hardware';
import { runShell } from './shell';
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
  .description('OpenInference — find, install, and chat with local open-source models')
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
  .command('use <model>')
  .description('Switch active model (pulls first if needed)')
  .option(urlOption.flags, urlOption.description)
  .option('--docker', 'remote Ollama')
  .action(async (model: string, opts) => {
    try {
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
