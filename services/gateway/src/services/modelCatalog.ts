import { config } from '../config';
import { getProviderApiKey, KEY_PROVIDERS, type KeyProvider } from './providerKeys';

// Live model discovery: asks each configured provider what models its key can
// actually reach, plus the local Ollama instance for self-hosted models.
// Results are cached in memory so the admin UI doesn't hammer provider APIs.

export interface ProviderModelList {
  provider: KeyProvider | 'ollama';
  configured: boolean;
  models: string[];
  error?: string;
}

const CACHE_TTL_MS = 5 * 60_000;
let cache: { data: ProviderModelList[]; expires: number } | null = null;

// Non-chat artifacts the OpenAI-compatible /models endpoints mix in.
const NON_CHAT = /embed|whisper|tts|dall-e|moderation|audio|realtime|transcribe|speech|guard|rerank|ocr/i;

async function fetchJson(url: string, headers: Record<string, string>): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// All providers except Anthropic expose an OpenAI-compatible GET /models.
const MODELS_URLS: Record<Exclude<KeyProvider, 'anthropic'>, string> = {
  openai: 'https://api.openai.com/v1/models',
  groq: 'https://api.groq.com/openai/v1/models',
  mistral: 'https://api.mistral.ai/v1/models',
  cerebras: 'https://api.cerebras.ai/v1/models',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/models',
};

async function listCloudModels(provider: KeyProvider): Promise<ProviderModelList> {
  const apiKey = await getProviderApiKey(provider);
  if (!apiKey) return { provider, configured: false, models: [] };

  try {
    let ids: string[];
    if (provider === 'anthropic') {
      const json = await fetchJson('https://api.anthropic.com/v1/models?limit=100', {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      });
      ids = (json.data ?? []).map((m: { id: string }) => m.id);
    } else {
      const json = await fetchJson(MODELS_URLS[provider], { authorization: `Bearer ${apiKey}` });
      // Gemini's OpenAI-compat endpoint prefixes ids with "models/"
      ids = (json.data ?? []).map((m: { id: string }) => m.id.replace(/^models\//, ''));
    }
    const models = ids.filter((id) => !NON_CHAT.test(id)).sort();
    return { provider, configured: true, models };
  } catch (err) {
    return { provider, configured: true, models: [], error: (err as Error).message };
  }
}

async function listOllamaModels(): Promise<ProviderModelList> {
  if (!config.OLLAMA_URL) return { provider: 'ollama', configured: false, models: [] };
  try {
    const json = await fetchJson(`${config.OLLAMA_URL.replace(/\/$/, '')}/api/tags`, {});
    const models = ((json.models ?? []) as Array<{ name: string }>).map((m) => m.name).sort();
    return { provider: 'ollama', configured: true, models };
  } catch (err) {
    return { provider: 'ollama', configured: true, models: [], error: (err as Error).message };
  }
}

export async function listAvailableModels(forceRefresh = false): Promise<ProviderModelList[]> {
  if (!forceRefresh && cache && cache.expires > Date.now()) return cache.data;

  const results = await Promise.all([
    listOllamaModels(),
    ...KEY_PROVIDERS.map((p) => listCloudModels(p)),
  ]);

  // Don't cache a round where every configured provider errored (e.g. no network).
  const anySuccess = results.some((r) => r.configured && !r.error);
  if (anySuccess) cache = { data: results, expires: Date.now() + CACHE_TTL_MS };

  return results;
}

/** Drop the cache (e.g. after a provider key changes). */
export function invalidateModelCatalogCache(): void {
  cache = null;
}
