#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from './config';
import { runSetup } from './setup';
import { runStart } from './start';
import { runRecommend } from './recommend-run';
import { runChat, listInstalledModels } from './chat';
import { runChatRepl } from './chat-repl';

const program = new Command();

function fail(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`\n  Error: ${msg}\n`);
  process.exit(1);
}

const urlOption = {
  flags: '--ollama-url <url>',
  description: 'AI runtime URL (default: $OLLAMA_URL, saved config, or localhost)',
};

const dockerOption = {
  flags: '--docker',
  description: 'server/Docker: use remote runtime over HTTP (no local install)',
};

program
  .name('oi')
  .description('OpenInference — one command to run open-source AI on your computer')
  .version('0.3.0');

program
  .command('start', { isDefault: true })
  .description('One command: set up the best model, then chat (default)')
  .option('-m, --model <id>', 'use a specific model tag')
  .option('--choose', 'pick from 5 recommendations instead of auto-select')
  .option('--force', 'run setup again even if already configured')
  .option('--no-chat', 'setup only, do not open chat after')
  .option('--skip-install', 'do not install local runtime if missing')
  .option(dockerOption.flags, dockerOption.description)
  .option(urlOption.flags, urlOption.description)
  .action(async (opts) => {
    try {
      await runStart({
        model: opts.model,
        choose: opts.choose,
        force: opts.force,
        chat: opts.chat,
        skipInstall: opts.skipInstall,
        docker: opts.docker,
        ollamaUrl: opts.ollamaUrl,
      });
    } catch (e) {
      fail(e);
    }
  });

program
  .command('setup')
  .description('Same as oi start (use --choose to pick a model manually)')
  .option('-m, --model <id>', 'use a specific model tag')
  .option('--choose', 'pick from 5 recommendations')
  .option('--skip-install', 'do not install local runtime if missing')
  .option(dockerOption.flags, dockerOption.description)
  .option(urlOption.flags, urlOption.description)
  .action(async (opts) => {
    try {
      await runStart({
        model: opts.model,
        choose: opts.choose,
        chat: false,
        skipInstall: opts.skipInstall,
        docker: opts.docker,
        ollamaUrl: opts.ollamaUrl,
      });
    } catch (e) {
      fail(e);
    }
  });

program
  .command('recommend')
  .description('Preview model picks without installing')
  .option('-n, --limit <n>', 'number of recommendations', '5')
  .option('--all', 'full catalog, not just verified tags')
  .action((opts: { limit: string; all?: boolean }) => {
    try {
      const n = Math.min(Math.max(parseInt(opts.limit, 10) || 5, 1), 20);
      runRecommend({ limit: n, all: opts.all });
    } catch (e) {
      fail(e);
    }
  });

program
  .command('chat [message]')
  .description('Chat with your local model (no message = interactive)')
  .option('-m, --model <id>', 'override model')
  .option(urlOption.flags, urlOption.description)
  .option('--docker', 'remote runtime; do not start local serve')
  .action(async (message: string | undefined, opts) => {
    try {
      const chatOpts = {
        model: opts.model,
        ollamaUrl: opts.ollamaUrl,
        remote: opts.docker,
      };
      if (!message?.trim()) {
        if (!loadConfig() && !opts.model) {
          console.log('\n  Not set up yet. Running setup first…\n');
          await runStart({ chat: false, ollamaUrl: opts.ollamaUrl, docker: opts.docker });
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
  .command('models')
  .description('List downloaded models')
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
      console.log('');
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
    console.log(`  Model:  ${cfg.modelName}`);
    console.log(`  Since:  ${new Date(cfg.setupAt).toLocaleDateString()}\n`);
    console.log('  Run `oi` to chat again.\n');
  });

program.parse();
