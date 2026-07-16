import { loadConfig } from './config';
import {
  ensureHostOllamaRunning,
  friendlyOllamaError,
  listModelTags,
  pingOllama,
  resolveOllamaUrl,
} from './ollama';

/** A generation that failed part-way. Carries whatever text arrived before the
 *  failure so callers can show it instead of discarding the user's wait. */
export class GenerationError extends Error {
  readonly partial: string;
  constructor(message: string, partial: string) {
    super(message);
    this.name = 'GenerationError';
    this.partial = partial;
  }
}

export type ChatOptions = {
  model?: string;
  ollamaUrl?: string;
  /** Skip trying to start local `ollama serve` (use with --docker / remote URL). */
  remote?: boolean;
  /** Suppress the per-reply tok/s footer. */
  quiet?: boolean;
};

/** Performance truth for one reply, straight from Ollama's own timing fields. */
export type ChatMetrics = {
  tokensPerSec: number | null;
  ttftMs: number | null;
};

export type ChatResult = { text: string; metrics: ChatMetrics };

type OllamaTiming = {
  eval_count?: number;
  eval_duration?: number;
  load_duration?: number;
  prompt_eval_duration?: number;
};

function metricsFrom(o: OllamaTiming): ChatMetrics {
  const tokensPerSec =
    o.eval_count && o.eval_duration
      ? Math.round((o.eval_count / (o.eval_duration / 1e9)) * 10) / 10
      : null;
  const ttftMs =
    o.load_duration != null || o.prompt_eval_duration != null
      ? Math.round(((o.load_duration ?? 0) + (o.prompt_eval_duration ?? 0)) / 1e6)
      : null;
  return { tokensPerSec, ttftMs };
}

/** "42 tok/s · 0.4s to first token", or null if Ollama reported no timings. */
export function formatChatMetrics(m: ChatMetrics): string | null {
  const parts: string[] = [];
  if (m.tokensPerSec != null) parts.push(`${m.tokensPerSec} tok/s`);
  if (m.ttftMs != null) parts.push(`${(m.ttftMs / 1000).toFixed(1)}s to first token`);
  return parts.length ? parts.join(' · ') : null;
}

export async function runChat(message: string, opts: ChatOptions = {}): Promise<ChatResult> {
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

  const body = (await res.json()) as { message?: { content?: string } } & OllamaTiming;
  const content = body.message?.content?.trim();
  if (!content) throw new Error('Empty response from Ollama');
  return { text: content, metrics: metricsFrom(body) };
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
): Promise<ChatResult> {
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
    throw new Error(friendlyOllamaError(text || `${res.status} ${res.statusText}`, model));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let metrics: ChatMetrics = { tokensPerSec: null, ttftMs: null };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';

      for (const line of parts) {
        if (!line.trim()) continue;
        let ev: { message?: { content?: string }; error?: string; done?: boolean } & OllamaTiming;
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
        // Ollama sends timing fields in the final `done` message.
        if (ev.done) metrics = metricsFrom(ev);
      }
    }
  } catch (e) {
    // Preserve whatever arrived before the failure — don't eat the user's wait.
    const raw = e instanceof Error ? e.message : String(e);
    throw new GenerationError(friendlyOllamaError(raw, model), full.trim());
  }

  return { text: full.trim(), metrics };
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
