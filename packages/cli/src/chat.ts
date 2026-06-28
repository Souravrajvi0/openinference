import { loadConfig } from './config';
import { ensureOllamaRunning, ollamaBaseUrl, pingOllama } from './ollama';

export type ChatOptions = {
  model?: string;
  url?: string;
};

export async function runChat(message: string, opts: ChatOptions = {}): Promise<string> {
  const cfg = loadConfig();
  const model = opts.model ?? cfg?.model;
  const base = (opts.url ?? cfg?.ollamaUrl ?? ollamaBaseUrl()).replace(/\/$/, '');

  if (!model) {
    throw new Error('No model configured. Run: oi setup');
  }

  if (!(await pingOllama())) {
    await ensureOllamaRunning();
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

export async function listInstalledModels(): Promise<string[]> {
  const cfg = loadConfig();
  const base = (cfg?.ollamaUrl ?? ollamaBaseUrl()).replace(/\/$/, '');

  if (!(await pingOllama())) {
    throw new Error('Ollama is not running. Run: oi setup');
  }

  const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Could not list models (${res.status})`);

  const body = (await res.json()) as { models?: { name: string }[] };
  return (body.models ?? []).map((m) => m.name).sort();
}
