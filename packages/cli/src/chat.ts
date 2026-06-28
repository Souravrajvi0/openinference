import { loadConfig } from './config';
import {
  ensureHostOllamaRunning,
  listModelTags,
  pingOllama,
  resolveOllamaUrl,
} from './ollama';

export type ChatOptions = {
  model?: string;
  ollamaUrl?: string;
  /** Skip trying to start local `ollama serve` (use with --docker / remote URL). */
  remote?: boolean;
};

export async function runChat(message: string, opts: ChatOptions = {}): Promise<string> {
  const cfg = loadConfig();
  const model = opts.model ?? cfg?.model;
  const base = resolveOllamaUrl(opts.ollamaUrl);

  if (!model) {
    throw new Error('No model configured. Run: oi setup');
  }

  if (!(await pingOllama(base))) {
    if (opts.remote || base !== 'http://127.0.0.1:11434') {
      throw new Error(`Ollama not reachable at ${base}. Check --ollama-url or OLLAMA_URL.`);
    }
    await ensureHostOllamaRunning(base);
  }

  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: message }],
      stream: false,
    }),
    signal: AbortSignal.timeout(300_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Chat failed (${res.status}): ${text || res.statusText}`);
  }

  const body = (await res.json()) as { message?: { content?: string } };
  const content = body.message?.content?.trim();
  if (!content) throw new Error('Empty response from Ollama');
  return content;
}

export async function listInstalledModels(ollamaUrl?: string): Promise<string[]> {
  const base = resolveOllamaUrl(ollamaUrl);

  if (!(await pingOllama(base))) {
    throw new Error(
      `Ollama not reachable at ${base}. Set --ollama-url or OLLAMA_URL (e.g. http://ollama:11434 on Docker).`,
    );
  }

  return listModelTags(base);
}
