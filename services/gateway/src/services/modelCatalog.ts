import { tenantStore } from '../db/tenantContext';
import { getProviderApiKey } from './providerKeys';
import {
  listProviders,
  listOrgProviders,
  resolveModelsUrl,
  type ProviderRow,
} from './providers';

// Live model discovery for providers the caller can actually use.
// With a tenant context: only enabled+keyed org providers.
// Without: all active platform providers that have a bootstrap key (or ollama).

export interface ProviderModelList {
  provider: string;
  configured: boolean;
  models: string[];
  error?: string;
}

const CACHE_TTL_MS = 5 * 60_000;
const cacheByScope = new Map<string, { data: ProviderModelList[]; expires: number }>();

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

async function listProviderModels(
  provider: ProviderRow,
  tenantId: string | null,
): Promise<ProviderModelList> {
  const slug = provider.slug;

  if (provider.kind === 'ollama') {
    const url = await resolveModelsUrl(slug);
    if (!url) return { provider: slug, configured: false, models: [] };
    try {
      const json = await fetchJson(url, {});
      const models = ((json.models ?? []) as Array<{ name: string }>).map((m) => m.name).sort();
      return { provider: slug, configured: true, models };
    } catch (err) {
      return { provider: slug, configured: true, models: [], error: (err as Error).message };
    }
  }

  const apiKey = await getProviderApiKey(slug, tenantId);
  if (!apiKey) return { provider: slug, configured: false, models: [] };

  try {
    let ids: string[];
    if (provider.kind === 'anthropic') {
      const json = await fetchJson('https://api.anthropic.com/v1/models?limit=100', {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      });
      ids = (json.data ?? []).map((m: { id: string }) => m.id);
    } else {
      const url = await resolveModelsUrl(slug);
      if (!url) return { provider: slug, configured: false, models: [] };
      const json = await fetchJson(url, { authorization: `Bearer ${apiKey}` });
      ids = (json.data ?? []).map((m: { id: string }) => m.id.replace(/^models\//, ''));
    }
    const models = ids.filter((id) => !NON_CHAT.test(id)).sort();
    return { provider: slug, configured: true, models };
  } catch (err) {
    return { provider: slug, configured: true, models: [], error: (err as Error).message };
  }
}

export async function listAvailableModels(
  forceRefresh = false,
  tenantId?: string | null,
): Promise<ProviderModelList[]> {
  const tid = tenantId ?? tenantStore.getStore() ?? null;
  const scope = tid ?? '__platform__';

  if (!forceRefresh) {
    const cached = cacheByScope.get(scope);
    if (cached && cached.expires > Date.now()) return cached.data;
  }

  let providers: ProviderRow[];
  if (tid) {
    const org = await listOrgProviders(tid);
    const usable = new Set(org.filter((o) => o.usable).map((o) => o.slug));
    providers = (await listProviders(false)).filter((p) => usable.has(p.slug));
  } else {
    providers = await listProviders(false);
  }

  const results = await Promise.all(providers.map((p) => listProviderModels(p, tid)));

  const anySuccess = results.some((r) => r.configured && !r.error);
  if (anySuccess) {
    cacheByScope.set(scope, { data: results, expires: Date.now() + CACHE_TTL_MS });
  }

  return results;
}

export function invalidateModelCatalogCache(): void {
  cacheByScope.clear();
}
