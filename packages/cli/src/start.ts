import { loadConfig } from './config';
import { runChatRepl } from './chat-repl';
import { runSetup, type SetupOptions } from './setup';

export type StartOptions = SetupOptions & {
  /** Re-run setup even if config exists */
  force?: boolean;
  /** After setup, open chat (default true) */
  chat?: boolean;
};

/**
 * The beginner path: one command — auto-pick model, install, download, chat.
 * If already set up, jumps straight to chat.
 */
export async function runStart(opts: StartOptions = {}): Promise<void> {
  const existing = loadConfig();
  const openChat = opts.chat !== false;

  if (existing && !opts.force && !opts.model) {
    console.log('\n  OpenInference — local AI\n');
    console.log(`  Using ${existing.modelName} on this computer.\n`);
    if (openChat) await runChatRepl({ ollamaUrl: opts.ollamaUrl, remote: opts.docker });
    return;
  }

  await runSetup({
    ...opts,
    yes: !opts.choose && !opts.model,
    quick: !opts.choose,
    choose: opts.choose,
  });

  if (openChat) {
    console.log('  You can chat now — type a question below.\n');
    await runChatRepl({ ollamaUrl: opts.ollamaUrl, remote: opts.docker });
  }
}
