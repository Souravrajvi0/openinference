import { queryAsSystem } from '../db/client';
import { config } from '../config';
import { encryptSecret, decryptSecret } from './secrets';

// Providers whose keys can be managed from the dashboard. Ollama is excluded
// (self-hosted, no key). Dashboard-stored keys override the env fallback.
export const KEY_PROVIDERS = ['openai', 'anthropic', 'groq', 'mistral', 'cerebras', 'gemini'] as const;
export type KeyProvider = (typeof KEY_PROVIDERS)[number];

export function isKeyProvider(value: string): value is KeyProvider {
  return (KEY_PROVIDERS as readonly string[]).includes(value);
}

function envKey(provider: KeyProvider): string | null {
  switch (provider) {
    case 'openai': return config.OPENAI_API_KEY ?? null;
    case 'anthropic': return config.ANTHROPIC_API_KEY ?? null;
    case 'groq': return config.GROQ_API_KEY ?? null;
    case 'mistral': return config.MISTRAL_API_KEY ?? null;
    case 'cerebras': return config.CEREBRAS_API_KEY ?? null;
    case 'gemini': return config.GEMINI_API_KEY ?? null;
  }
}

// Short-lived cache of DB overrides so the hot path doesn't hit Postgres on
// every LLM call. Writes invalidate immediately on this instance; other
// instances converge within the TTL.
const CACHE_TTL_MS = 30_000;
const dbKeyCache = new Map<KeyProvider, { value: string | null; expires: number }>();

async function dbKey(provider: KeyProvider): Promise<string | null> {
  const cached = dbKeyCache.get(provider);
  if (cached && cached.expires > Date.now()) return cached.value;

  const result = await queryAsSystem<{ key_encrypted: string }>(
    'SELECT key_encrypted FROM provider_keys WHERE provider = $1',
    [provider]
  );
  const value = decryptSecret(result.rows[0]?.key_encrypted ?? null);
  dbKeyCache.set(provider, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

export function invalidateProviderKeyCache(provider?: KeyProvider): void {
  if (provider) dbKeyCache.delete(provider);
  else dbKeyCache.clear();
}

/** Resolve the API key for a provider: dashboard-stored key first, env fallback. */
export async function getProviderApiKey(provider: string): Promise<string | null> {
  if (!isKeyProvider(provider)) return null;
  return (await dbKey(provider)) ?? envKey(provider);
}

function mask(key: string | null): string | null {
  if (!key) return null;
  return key.length > 10 ? `${key.slice(0, 4)}…${key.slice(-4)}` : '••••••••';
}

export interface ProviderKeyStatus {
  provider: KeyProvider;
  source: 'dashboard' | 'env' | 'none';
  masked: string | null;
  updated_at: string | null;
}

export async function listProviderKeys(): Promise<ProviderKeyStatus[]> {
  const result = await queryAsSystem<{ provider: string; key_encrypted: string; updated_at: string }>(
    'SELECT provider, key_encrypted, updated_at FROM provider_keys'
  );
  const byProvider = new Map(result.rows.map((r) => [r.provider, r]));

  return KEY_PROVIDERS.map((provider) => {
    const row = byProvider.get(provider);
    if (row) {
      return {
        provider,
        source: 'dashboard' as const,
        masked: mask(decryptSecret(row.key_encrypted)),
        updated_at: row.updated_at,
      };
    }
    const fromEnv = envKey(provider);
    return {
      provider,
      source: fromEnv ? ('env' as const) : ('none' as const),
      masked: mask(fromEnv),
      updated_at: null,
    };
  });
}

export async function setProviderKey(provider: KeyProvider, apiKey: string, updatedBy: string | null): Promise<void> {
  await queryAsSystem(
    `INSERT INTO provider_keys (provider, key_encrypted, updated_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (provider) DO UPDATE
       SET key_encrypted = EXCLUDED.key_encrypted,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
    [provider, encryptSecret(apiKey), updatedBy]
  );
  invalidateProviderKeyCache(provider);
}

export async function deleteProviderKey(provider: KeyProvider): Promise<boolean> {
  const result = await queryAsSystem(
    'DELETE FROM provider_keys WHERE provider = $1 RETURNING provider',
    [provider]
  );
  invalidateProviderKeyCache(provider);
  return result.rows.length > 0;
}
