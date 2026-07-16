import {
  ensureHostOllamaRunning,
  getOllamaVersion,
  listModelTags,
  pingOllama,
  resolveOllamaUrl,
} from './ollama';

// The runtime seam (f1 §7 / f3 Phase 0). All model execution goes through this
// interface so the endpoint (and later the rest of the CLI) never calls a backend
// directly — a second backend (llama.cpp, vLLM) becomes a new impl, not a rewrite.

export type ChatMsg = {
  role: string;
  content: string;
  /** Base64-encoded images accepted by Ollama's chat API. */
  images?: string[];
};

export type RuntimeChatOptions = {
  /** Context window to request — the reliability fix for silent truncation. */
  numCtx?: number;
  /** How long to keep the model warm after the call (e.g. "30m"). */
  keepAlive?: string;
};

export type ChatFinal = {
  content: string;
  promptTokens: number | null;
  completionTokens: number | null;
};

export interface Runtime {
  readonly name: string;
  ensureRunning(baseUrl: string): Promise<void>;
  listModels(baseUrl?: string): Promise<string[]>;
  version(baseUrl?: string): Promise<string | null>;
  /** Stream a chat; `onDelta` fires per token. Resolves with full text + usage. */
  chat(
    baseUrl: string,
    model: string,
    messages: ChatMsg[],
    opts: RuntimeChatOptions,
    onDelta: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<ChatFinal>;
}

type OllamaChatEvent = {
  message?: { content?: string };
  error?: string;
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
};

export class OllamaRuntime implements Runtime {
  readonly name = 'ollama';

  async ensureRunning(baseUrl: string): Promise<void> {
    if (!(await pingOllama(baseUrl))) await ensureHostOllamaRunning(baseUrl);
  }

  listModels(baseUrl?: string): Promise<string[]> {
    return listModelTags(baseUrl);
  }

  version(baseUrl?: string): Promise<string | null> {
    return getOllamaVersion(baseUrl);
  }

  async chat(
    baseUrl: string,
    model: string,
    messages: ChatMsg[],
    opts: RuntimeChatOptions,
    onDelta: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<ChatFinal> {
    const url = resolveOllamaUrl(baseUrl);
    const options: Record<string, number> = {};
    if (opts.numCtx) options.num_ctx = opts.numCtx;

    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options,
        ...(opts.keepAlive ? { keep_alive: opts.keepAlive } : {}),
      }),
      signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `${res.status} ${res.statusText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    let promptTokens: number | null = null;
    let completionTokens: number | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      for (const line of parts) {
        if (!line.trim()) continue;
        let ev: OllamaChatEvent;
        try {
          ev = JSON.parse(line) as OllamaChatEvent;
        } catch {
          continue;
        }
        if (ev.error) throw new Error(ev.error);
        const chunk = ev.message?.content;
        if (chunk) {
          full += chunk;
          onDelta(chunk);
        }
        if (ev.done) {
          promptTokens = ev.prompt_eval_count ?? null;
          completionTokens = ev.eval_count ?? null;
        }
      }
    }

    return { content: full, promptTokens, completionTokens };
  }
}

/** The active backend. Swap/select here when a second runtime lands (f4). */
export const runtime: Runtime = new OllamaRuntime();
