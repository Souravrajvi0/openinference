import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { Message } from '@sentinelai/shared';
import { getProviderApiKey } from './providerKeys';
import { getProviderBySlug, resolveProviderBaseUrl } from './providers';
import {
  assertCircuitClosed,
  recordProviderFailure,
  recordProviderSuccess,
} from './circuitBreaker';
import { createThinkStripper, stripThinking } from './stripThinking';

/** Any registry slug (builtins + custom openai_compat). */
export type ExtendedProvider = string;

// All providers except Anthropic use the OpenAI-compatible SDK with a custom baseURL.
// Tenant traffic: org key only. Bootstrap (no tenant): platform keys / env.
async function openaiCompatClient(provider: ExtendedProvider): Promise<OpenAI> {
  if (provider === 'anthropic') throw new Error('Anthropic is not OpenAI-compatible');

  const baseURL = await resolveProviderBaseUrl(provider);
  if (!baseURL) {
    throw new Error(`No base URL configured for provider ${provider}`);
  }

  if (provider === 'ollama') {
    return new OpenAI({ apiKey: 'ollama', baseURL });
  }

  const apiKey = await getProviderApiKey(provider);
  if (!apiKey) {
    throw new Error(`No API key configured for ${provider} (set it in Admin → Org Providers)`);
  }
  return new OpenAI({ apiKey, baseURL });
}

let _anthropic: { apiKey: string; client: Anthropic } | null = null;
async function anthropicClient(): Promise<Anthropic> {
  const apiKey = await getProviderApiKey('anthropic');
  if (!apiKey) throw new Error('No API key configured for anthropic (set it in Admin → Org Providers)');
  if (!_anthropic || _anthropic.apiKey !== apiKey) {
    _anthropic = { apiKey, client: new Anthropic({ apiKey }) };
  }
  return _anthropic.client;
}

async function isAnthropicProvider(provider: string): Promise<boolean> {
  if (provider === 'anthropic') return true;
  const row = await getProviderBySlug(provider);
  return row?.kind === 'anthropic';
}

export interface LLMResult {
  content: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  ttfb_ms?: number;
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr!: Error;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err as Error;
      if (attempt < maxAttempts - 1) {
        const delay = Math.min(100 * Math.pow(2, attempt) + Math.random() * 50, 2000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

export async function callLLM(
  provider: ExtendedProvider,
  model: string,
  messages: Message[],
  systemPrompt?: string
): Promise<LLMResult> {
  await assertCircuitClosed(provider);
  const start = Date.now();

  try {
    let result: LLMResult;

    if (await isAnthropicProvider(provider)) {
      const client = await anthropicClient();
      const anthropicMessages = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      const systemMsg = systemPrompt ?? messages.find((m) => m.role === 'system')?.content;

      const res = await withRetry(() => client.messages.create({
        model,
        max_tokens: 4096,
        system: systemMsg,
        messages: anthropicMessages,
      }));

      const block = res.content[0];
      if (!block || block.type !== 'text') throw new Error('Empty response from Anthropic');

      result = {
        content: stripThinking(block.text),
        prompt_tokens: res.usage.input_tokens,
        completion_tokens: res.usage.output_tokens,
        total_tokens: res.usage.input_tokens + res.usage.output_tokens,
        ttfb_ms: Date.now() - start,
      };
    } else {
      const client = await openaiCompatClient(provider);
      const allMessages: OpenAI.ChatCompletionMessageParam[] = [];
      if (systemPrompt) allMessages.push({ role: 'system', content: systemPrompt });
      allMessages.push(...messages.map((m) => ({ role: m.role, content: m.content })));

      const res = await withRetry(() => client.chat.completions.create({ model, messages: allMessages }));
      const choice = res.choices[0];
      if (!choice?.message?.content) throw new Error(`Empty response from ${provider}`);

      result = {
        content: stripThinking(choice.message.content),
        prompt_tokens: res.usage?.prompt_tokens ?? 0,
        completion_tokens: res.usage?.completion_tokens ?? 0,
        total_tokens: res.usage?.total_tokens ?? 0,
        ttfb_ms: Date.now() - start,
      };
    }

    await recordProviderSuccess(provider);
    return result;
  } catch (err) {
    await recordProviderFailure(provider);
    throw err;
  }
}

// Cost per 1M tokens (prompt / completion) — free tier providers show $0
const COST_TABLE: Record<string, [number, number]> = {
  'llama-3.3-70b-versatile':    [0, 0],
  'llama-3.1-8b-instant':       [0, 0],
  'mistral-large-latest':       [2.00, 6.00],
  'mistral-small-latest':       [0.10, 0.30],
  'claude-3-5-sonnet-20241022': [3.00, 15.00],
  'claude-haiku-4-5-20251001':  [0.25, 1.25],
  'gemini-2.0-flash':           [0.10, 0.40],
  'gemini-1.5-flash':           [0.075, 0.30],
  'gemini-1.5-pro':             [1.25, 5.00],
  // Self-hosted via Ollama — no per-token cloud cost (plan-based billing handled separately)
  'gemma3:1b':                  [0, 0],
  'gemma3:4b':                  [0, 0],
  'qwen2.5:0.5b':               [0, 0],
};

export type StreamEvent =
  | { type: 'delta'; content: string }
  | { type: 'done'; prompt_tokens: number; completion_tokens: number };

export async function* streamLLM(
  provider: ExtendedProvider,
  model: string,
  messages: Message[],
): AsyncGenerator<StreamEvent> {
  await assertCircuitClosed(provider);
  const strip = createThinkStripper();
  try {
    if (await isAnthropicProvider(provider)) {
      const client = await anthropicClient();
      const anthropicMessages = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      const systemMsg = messages.find((m) => m.role === 'system')?.content;

      const stream = client.messages.stream({
        model,
        max_tokens: 4096,
        ...(systemMsg ? { system: systemMsg } : {}),
        messages: anthropicMessages,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const cleaned = strip.push(event.delta.text);
          if (cleaned) yield { type: 'delta', content: cleaned };
        }
      }
      const tail = strip.flush();
      if (tail) yield { type: 'delta', content: tail };
      const msg = await stream.finalMessage();
      yield { type: 'done', prompt_tokens: msg.usage.input_tokens, completion_tokens: msg.usage.output_tokens };
    } else {
      const client = await openaiCompatClient(provider);
      const allMessages: OpenAI.ChatCompletionMessageParam[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const streamRes = await client.chat.completions.create({
        model,
        messages: allMessages,
        stream: true,
        stream_options: { include_usage: true },
      });

      let promptTokens = 0;
      let completionTokens = 0;

      for await (const chunk of streamRes) {
        const delta = chunk.choices[0]?.delta?.content ?? '';
        if (delta) {
          const cleaned = strip.push(delta);
          if (cleaned) yield { type: 'delta', content: cleaned };
        }
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens ?? 0;
          completionTokens = chunk.usage.completion_tokens ?? 0;
        }
      }

      const tail = strip.flush();
      if (tail) yield { type: 'delta', content: tail };
      yield { type: 'done', prompt_tokens: promptTokens, completion_tokens: completionTokens };
    }
    await recordProviderSuccess(provider);
  } catch (err) {
    await recordProviderFailure(provider);
    throw err;
  }
}

export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const entry = COST_TABLE[model];
  if (!entry) return 0;
  return (
    (promptTokens / 1_000_000) * entry[0] +
    (completionTokens / 1_000_000) * entry[1]
  );
}
