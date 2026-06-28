#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from './config';
import { runSetup } from './setup';
import { runRecommend } from './recommend-run';
import { runChat, listInstalledModels } from './chat';

const program = new Command();

function fail(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`\n  Error: ${msg}\n`);
  process.exit(1);
}

program
  .name('oi')
  .description('OpenInference CLI — local model setup and gateway tools')
  .version('0.1.0');

program
  .command('setup', { isDefault: true })
  .description('Detect hardware, show 5 picks, install Ollama, pull your model (default command)')
  .option('-y, --yes', 'skip prompt and use the top recommendation')
  .option('-m, --model <id>', 'skip prompt and use a specific Ollama model tag')
  .option('--skip-install', 'do not attempt to install Ollama (must already be on PATH)')
  .action(async (opts: { yes?: boolean; model?: string; skipInstall?: boolean }) => {
    try {
      await runSetup({
        yes: opts.yes,
        model: opts.model,
        skipInstall: opts.skipInstall,
      });
    } catch (e) {
      fail(e);
    }
  });

program
  .command('recommend')
  .description('Show top model picks for this machine without installing')
  .option('-n, --limit <n>', 'number of recommendations', '5')
  .option('--all', 'include full catalog, not just verified Ollama tags')
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
  .description('Chat with your local Ollama model from setup')
  .option('-m, --model <id>', 'override model tag')
  .action(async (message: string | undefined, opts: { model?: string }) => {
    try {
      const text = message?.trim() || 'Hello! Reply in one short sentence.';
      const reply = await runChat(text, { model: opts.model });
      console.log(`\n${reply}\n`);
    } catch (e) {
      fail(e);
    }
  });

program
  .command('models')
  .description('List models installed in local Ollama')
  .action(async () => {
    try {
      const names = await listInstalledModels();
      if (names.length === 0) {
        console.log('\n  No models installed. Run: oi setup\n');
        return;
      }
      console.log('\n  Installed in Ollama:\n');
      names.forEach((n) => console.log(`    ${n}`));
      console.log('');
    } catch (e) {
      fail(e);
    }
  });

program
  .command('status')
  .description('Show saved local setup from ~/.openinference/config.json')
  .action(() => {
    const cfg = loadConfig();
    if (!cfg) {
      console.log('\n  No setup found. Run: oi setup\n');
      return;
    }
    console.log('\n  OpenInference local config\n');
    console.log(`  Model:  ${cfg.modelName} (${cfg.model})`);
    console.log(`  Ollama: ${cfg.ollamaUrl}`);
    console.log(`  Since:  ${cfg.setupAt}\n`);
    console.log('  Commands:');
    console.log('    oi chat "your question"');
    console.log('    oi recommend');
    console.log('    oi models\n');
  });

program.parse();
