import readline from 'node:readline';

import { formatChatMetrics, GenerationError, streamChatTurn, type ChatOptions, type ChatResult } from './chat';
import { LiveMeter } from './meter';

function ask(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

/**
 * One chat turn with the live token meter (spinner · rising token count ·
 * tok/s · elapsed), revealing the reply when done. Shared by `oi chat "msg"`,
 * `oi run <model> "msg"`, the chat REPL, and the shell's /run.
 */
export async function runOneShot(message: string, opts: ChatOptions = {}): Promise<ChatResult> {
  const meter = new LiveMeter();
  meter.start();
  try {
    return await streamChatTurn([{ role: 'user', content: message }], () => meter.bump(), opts);
  } finally {
    meter.stop();
  }
}

export async function runChatRepl(opts: ChatOptions = {}): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('  Ask anything. Type /quit to exit.\n');

  try {
    while (true) {
      const line = (await ask(rl, 'you › ')).trim();
      if (!line || line === '/quit' || line === '/exit') break;

      try {
        console.log('');
        const { text, metrics } = await runOneShot(line, opts);
        console.log(`ai › ${text}`);
        const footer = formatChatMetrics(metrics);
        if (footer && !opts.quiet) console.log(`\x1b[2m  ⎯ ${footer}\x1b[0m`);
        console.log('');
      } catch (e) {
        if (e instanceof GenerationError && e.partial) {
          console.log(`ai › ${e.partial}`);
          console.log('\x1b[2m  ⎯ generation stopped early\x1b[0m');
        }
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`  (error: ${msg})\n`);
      }
    }
  } finally {
    rl.close();
  }
}
