import readline from 'node:readline';

import { runChat, type ChatOptions } from './chat';

function ask(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

export async function runChatRepl(opts: ChatOptions = {}): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('  Ask anything. Type /quit to exit.\n');

  try {
    while (true) {
      const line = (await ask(rl, 'you › ')).trim();
      if (!line || line === '/quit' || line === '/exit') break;

      try {
        process.stdout.write('\n  …\n\n');
        const reply = await runChat(line, opts);
        console.log(`ai › ${reply}\n`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`  (error: ${msg})\n`);
      }
    }
  } finally {
    rl.close();
  }
}
