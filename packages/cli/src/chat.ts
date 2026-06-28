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

export type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

/**
 * Stream a chat turn. Sends the full message history for context and invokes
 * `onToken` for each chunk as it arrives. Returns the complete assistant reply.
 */
export async function streamChatTurn(
  messages: ChatMessage[],
  onToken: (chunk: string) => void,
  opts: ChatOptions = {},
): Promise<string> {
  const cfg = loadConfig();
  const model = opts.model ?? cfg?.model;
  const base = resolveOllamaUrl(opts.ollamaUrl);

  if (!model) {
    throw new Error('No model configured. Run /setup');
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
    body: JSON.stringify({ model, messages, stream: true }),
    signal: AbortSignal.timeout(600_000),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`Chat failed (${res.status}): ${text || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop() ?? '';

    for (const line of parts) {
      if (!line.trim()) continue;
      let ev: { message?: { content?: string }; error?: string };
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.error) throw new Error(ev.error);
      const chunk = ev.message?.content;
      if (chunk) {
        full += chunk;
        onToken(chunk);
      }
    }
  }

  return full.trim();
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
