#!/usr/bin/env node
import { Command, Help } from 'commander';
import { loadConfig } from './config';
import { runStart } from './start';
import { runBrowse, runRecommend, parseUseCaseArg } from './recommend-run';
import { listInstalledModels, formatChatMetrics, GenerationError } from './chat';

/** Print any partial reply a failed generation produced before erroring out. */
function showPartial(e: unknown): void {
  if (e instanceof GenerationError && e.partial) {
    console.log(`${e.partial}\n`);
    console.log(`\x1b[2m  ⎯ generation stopped early\x1b[0m`);
  }
}
import { runChatRepl, runOneShot } from './chat-repl';
import { runInfo, runPull, runRemove, runSearch, runWhere, runUse, runUsePicker } from './manage';
import { useCaseLabel } from './use-cases';
import { ollamaModelsPath } from './hardware';
import { runShell } from './shell';
import { runDoctor } from './doctor';
import { runServe } from './serve';
import { runIntegrate } from './integrate';
import { runMcp } from './mcp';
import { runUpdate, catalogProvenance } from './catalog';
import { loadCatalog } from './recommend';
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

// Grouped, scannable root help instead of commander's flat 18-command wall.
// Subcommand help (`oi search --help`) keeps the default detailed format.
const ROOT_HELP = `
  oi — run open-source AI models on your machine

  Usage: oi [command] [options]

  Get started
    oi                    interactive shell — setup on first run, then chat
    setup                 pick + install a model for this machine
    doctor                diagnose setup, GPU usage, and speed

  Models
    search [query]        find models that fit this machine
    info <model>          size, speed estimate, fit, installed state
    install <model>       download a model
    use [model]           switch the active model
    run <model> [msg]     try a model once — active model unchanged
    list                  installed models
    remove <model>        delete a model, free disk space
    recommend             best picks for this machine
    update                refresh catalog · check CLI/runtime updates

  Use your models elsewhere
    serve                 OpenAI-compatible endpoint on localhost:11435
    web                   dashboard in your browser
    integrate <tool>      connect Cursor, Continue, aider, Cline, …
    mcp                   MCP server over stdio

  More
    chat [message]        chat with the active model
    where                 model / config / catalog paths
    status                current setup
    <command> --help      full options for any command
`;

program
  .name('oi')
  .description('oi — run open-source AI models on your machine')
  .version(VERSION)
  .configureHelp({
    formatHelp: (cmd, helper) => (cmd.parent ? new Help().formatHelp(cmd, helper) : ROOT_HELP),
  });

const shellCmd = program
  .command('shell', { isDefault: true })
  .description('Interactive shell: banner + slash commands + chat')
  .option(urlOption.flags, urlOption.description)
  .option(dockerOption.flags, dockerOption.description)
  .option('--quiet', 'hide the per-reply tok/s footer');

shellCmd.action(async (opts) => {
  try {
    await runShell({ ollamaUrl: opts.ollamaUrl, remote: opts.docker, quiet: Boolean(opts.quiet) });
  } catch (e) {
    fail(e);
  }
});

const setupCmd = program.command('setup').description('Configure a local model without opening the shell');
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
  .command('browse', { hidden: true }) // folded into search/recommend — kept as a hidden alias
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
  .command('chat [message]')
  .description('Chat with active model (no message = interactive)')
  .option('-y, --yes', 'if setup needed, skip wizard')
  .option('-m, --model <id>', 'override model for this session')
  .option('--quiet', 'hide the per-reply tok/s footer')
  .option(urlOption.flags, urlOption.description)
  .option('--docker', 'remote Ollama')
  .action(async (message: string | undefined, opts) => {
    try {
      const chatOpts = {
        model: opts.model,
        ollamaUrl: opts.ollamaUrl,
        remote: opts.docker,
        quiet: Boolean(opts.quiet),
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
      console.log('');
      const { text, metrics } = await runOneShot(message.trim(), chatOpts);
      console.log(`${text}\n`);
      const footer = formatChatMetrics(metrics);
      if (footer && !chatOpts.quiet) console.log(`\x1b[2m  ⎯ ${footer}\x1b[0m\n`);
    } catch (e) {
      showPartial(e);
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
  .command('serve')
  .description('Run a local OpenAI-compatible endpoint (correct context, timeouts, keep-alive)')
  .option('--port <n>', 'port (default 11435)')
  .option('--host <host>', 'bind address (default 127.0.0.1; non-local requires OI_API_KEY)')
  .option('--aliases', 'enable capability aliases (model:"coding" → best installed model)')
  .option(urlOption.flags, urlOption.description)
  .action(async (opts: { port?: string; host?: string; aliases?: boolean; ollamaUrl?: string }) => {
    try {
      await runServe({
        port: opts.port ? parseInt(opts.port, 10) : undefined,
        host: opts.host,
        aliases: Boolean(opts.aliases),
        ollamaUrl: opts.ollamaUrl,
      });
    } catch (e) {
      fail(e);
    }
  });

program
  .command('web')
  .alias('ui')
  .description('Open the local dashboard in your browser (catalog · monitor · doctor · playground)')
  .option('--port <n>', 'port (default 11435)')
  .option('--aliases', 'enable capability aliases')
  .option(urlOption.flags, urlOption.description)
  .action(async (opts: { port?: string; aliases?: boolean; ollamaUrl?: string }) => {
    try {
      await runServe({
        port: opts.port ? parseInt(opts.port, 10) : undefined,
        aliases: Boolean(opts.aliases),
        ollamaUrl: opts.ollamaUrl,
        openUi: true,
      });
    } catch (e) {
      fail(e);
    }
  });

program
  .command('integrate <tool>')
  .description('Show how to use oi from Cursor, Continue, aider, Cline, or the OpenAI SDK')
  .option('--port <n>', 'endpoint port (default 11435)')
  .action((tool: string, opts: { port?: string }) => {
    try {
      runIntegrate(tool, { port: opts.port ? parseInt(opts.port, 10) : undefined });
    } catch (e) {
      fail(e);
    }
  });

program
  .command('mcp')
  .description('Run oi as an MCP server (stdio) exposing local models as a tool')
  .option(urlOption.flags, urlOption.description)
  .action(async (opts: { ollamaUrl?: string }) => {
    try {
      await runMcp({ ollamaUrl: opts.ollamaUrl });
    } catch (e) {
      fail(e);
    }
  });

program
  .command('update')
  .description('Refresh the model catalog + check for CLI/runtime updates (downloads nothing)')
  .action(async () => {
    try {
      await runUpdate({ currentCatalog: loadCatalog() });
    } catch (e) {
      fail(e);
    }
  });

program
  .command('doctor')
  .description('Diagnose setup, GPU usage, and speed — and how to fix what is wrong')
  .option('--json', 'machine-readable output')
  .option(urlOption.flags, urlOption.description)
  .action(async (opts: { json?: boolean; ollamaUrl?: string }) => {
    try {
      await runDoctor({ ollamaUrl: opts.ollamaUrl, json: Boolean(opts.json) });
    } catch (e) {
      fail(e);
    }
  });

program
  .command('where')
  .aliases(['storage', 'path'])
  .description('Show where models, config, and the catalog live')
  .action(async () => {
    try {
      await runWhere();
    } catch (e) {
      fail(e);
    }
  });

program
  .command('run <model> [message...]')
  .description("Chat with a model once — doesn't change your active model")
  .option(urlOption.flags, urlOption.description)
  .option('--docker', 'remote Ollama')
  .action(async (model: string, messageParts: string[], opts) => {
    try {
      const chatOpts = { model, ollamaUrl: opts.ollamaUrl, remote: opts.docker };
      const message = (messageParts ?? []).join(' ').trim();
      if (!message) {
        await runChatRepl(chatOpts);
        return;
      }
      console.log('');
      const { text, metrics } = await runOneShot(message, chatOpts);
      console.log(`${text}\n`);
      const footer = formatChatMetrics(metrics);
      if (footer) console.log(`\x1b[2m  ⎯ ${footer} · ${model}\x1b[0m\n`);
    } catch (e) {
      showPartial(e);
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
    console.log(`  Storage:  ${ollamaModelsPath()}`);
    console.log(`  Catalog:  ${loadCatalog().length} models · ${catalogProvenance()}\n`);
    console.log('  Run `oi` to chat · `oi use <model>` to switch\n');
  });

program.parse();
