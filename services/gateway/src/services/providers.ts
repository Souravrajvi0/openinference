import { queryAsSystem, query } from '../db/client';
import { encryptSecret, decryptSecret } from './secrets';
import { config } from '../config';

export type ProviderKind = 'openai_compat' | 'anthropic' | 'ollama';

export interface ProviderRow {
  id: string;
  slug: string;
  name: string;
  kind: ProviderKind;
  base_url: string | null;
  is_builtin: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const CACHE_TTL_MS = 30_000;
let providerCache: { bySlug: Map<string, ProviderRow>; expires: number } | null = null;

export function invalidateProviderRegistryCache(): void {
  providerCache = null;
}

async function loadProviders(): Promise<Map<string, ProviderRow>> {
  if (providerCache && providerCache.expires > Date.now()) return providerCache.bySlug;
  const result = await queryAsSystem<ProviderRow>(
    `SELECT id, slug, name, kind, base_url, is_builtin, is_active, created_at, updated_at
     FROM providers WHERE is_active = TRUE ORDER BY is_builtin DESC, name ASC`
  );
  const bySlug = new Map(result.rows.map((r) => [r.slug, r]));
  providerCache = { bySlug, expires: Date.now() + CACHE_TTL_MS };
  return bySlug;
}

export async function listProviders(includeInactive = false): Promise<ProviderRow[]> {
  if (includeInactive) {
    const result = await queryAsSystem<ProviderRow>(
      `SELECT id, slug, name, kind, base_url, is_builtin, is_active, created_at, updated_at
       FROM providers ORDER BY is_builtin DESC, name ASC`
    );
    return result.rows;
  }
  return [...(await loadProviders()).values()];
}

export async function getProviderBySlug(slug: string): Promise<ProviderRow | null> {
  const map = await loadProviders();
  const cached = map.get(slug);
  if (cached) return cached;
  // May be inactive — look up directly for admin
  const result = await queryAsSystem<ProviderRow>(
    `SELECT id, slug, name, kind, base_url, is_builtin, is_active, created_at, updated_at
     FROM providers WHERE slug = $1`,
    [slug]
  );
  return result.rows[0] ?? null;
}

/** Chat / models base URL for a provider slug (builtins + custom openai_compat). */
export async function resolveProviderBaseUrl(slug: string): Promise<string | null> {
  if (slug === 'ollama') {
    if (!config.OLLAMA_URL) return null;
    return `${config.OLLAMA_URL.replace(/\/$/, '')}/v1`;
  }
  const row = await getProviderBySlug(slug);
  if (!row || !row.is_active) return null;
  if (row.kind === 'anthropic') return null;
  return row.base_url?.replace(/\/$/, '') ?? null;
}

/** Models list URL for OpenAI-compat providers. */
export async function resolveModelsUrl(slug: string): Promise<string | null> {
  if (slug === 'ollama') {
    if (!config.OLLAMA_URL) return null;
    return `${config.OLLAMA_URL.replace(/\/$/, '')}/api/tags`;
  }
  if (slug === 'anthropic') return 'https://api.anthropic.com/v1/models?limit=100';
  if (slug === 'gemini') {
    return 'https://generativelanguage.googleapis.com/v1beta/openai/models';
  }
  const base = await resolveProviderBaseUrl(slug);
  if (!base) return null;
  return `${base}/models`;
}

const SLUG_RE = /^[a-z][a-z0-9_-]{1,62}$/;

export async function createProvider(input: {
  slug: string;
  name: string;
  kind: ProviderKind;
  base_url?: string | null;
}): Promise<ProviderRow> {
  const slug = input.slug.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) throw new Error('Invalid slug (2–63 chars, lowercase alphanumeric/_/-)');
  if (input.kind === 'openai_compat') {
    if (!input.base_url?.trim()) throw new Error('base_url is required for openai_compat providers');
    try {
      const u = new URL(input.base_url.trim());
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad protocol');
    } catch {
      throw new Error('base_url must be a valid http(s) URL');
    }
  }
  if (input.kind !== 'openai_compat' && !['openai', 'anthropic', 'ollama', 'groq', 'mistral', 'cerebras', 'gemini'].includes(slug)) {
    // Custom providers must be openai_compat
    throw new Error('Custom providers must use kind=openai_compat');
  }

  const result = await queryAsSystem<ProviderRow>(
    `INSERT INTO providers (slug, name, kind, base_url, is_builtin, is_active)
     VALUES ($1, $2, $3, $4, FALSE, TRUE)
     RETURNING id, slug, name, kind, base_url, is_builtin, is_active, created_at, updated_at`,
    [
      slug,
      input.name.trim(),
      input.kind,
      input.kind === 'openai_compat' ? input.base_url!.trim().replace(/\/$/, '') : null,
    ]
  );
  invalidateProviderRegistryCache();
  return result.rows[0]!;
}

export async function updateProvider(
  slug: string,
  patch: { name?: string; base_url?: string | null; is_active?: boolean }
): Promise<ProviderRow | null> {
  const existing = await getProviderBySlug(slug);
  if (!existing) return null;

  let baseUrl = existing.base_url;
  if (patch.base_url !== undefined) {
    if (existing.is_builtin && existing.kind !== 'openai_compat') {
      throw new Error('Cannot change base_url on this built-in provider');
    }
    if (existing.kind === 'openai_compat' && patch.base_url) {
      try {
        const u = new URL(patch.base_url.trim());
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad');
        baseUrl = patch.base_url.trim().replace(/\/$/, '');
      } catch {
        throw new Error('base_url must be a valid http(s) URL');
      }
    }
  }

  const result = await queryAsSystem<ProviderRow>(
    `UPDATE providers
     SET name = COALESCE($2, name),
         base_url = $3,
         is_active = COALESCE($4, is_active),
         updated_at = NOW()
     WHERE slug = $1
     RETURNING id, slug, name, kind, base_url, is_builtin, is_active, created_at, updated_at`,
    [slug, patch.name?.trim() ?? null, baseUrl, patch.is_active ?? null]
  );
  invalidateProviderRegistryCache();
  return result.rows[0] ?? null;
}

// ── Org enablement + keys ────────────────────────────────────────────────

export interface OrgProviderStatus {
  slug: string;
  name: string;
  kind: ProviderKind;
  base_url: string | null;
  is_builtin: boolean;
  enabled: boolean;
  has_key: boolean;
  masked_key: string | null;
  needs_key: boolean;
  /** Org opted to use gateway default / env key instead of pasting their own. */
  use_platform_key: boolean;
  /** Platform has a dashboard or env key available for this provider. */
  platform_key_available: boolean;
  usable: boolean;
}

function mask(key: string | null): string | null {
  if (!key) return null;
  return key.length > 10 ? `${key.slice(0, 4)}…${key.slice(-4)}` : '••••••••';
}

async function platformKeyFor(slug: string): Promise<string | null> {
  // Dynamic import avoids circular dependency with providerKeys.ts
  const { getBootstrapProviderApiKey } = await import('./providerKeys');
  return getBootstrapProviderApiKey(slug);
}

/** Once per minute per tenant: turn on providers that already have a gateway key. */
const wiredAt = new Map<string, number>();
const WIRE_TTL_MS = 60_000;

/**
 * Auto-connect Org Providers to gateway default keys so users don't have to
 * manually re-enable Groq/OpenAI after setting them under Providers.
 * Never overrides an intentional Off, and never wipes an org's own key.
 */
export async function ensureOrgProviderDefaults(tenantId: string): Promise<void> {
  const now = Date.now();
  const prev = wiredAt.get(tenantId);
  if (prev && now - prev < WIRE_TTL_MS) return;
  wiredAt.set(tenantId, now);

  const providers = await listProviders(false);
  for (const p of providers) {
    if (p.kind === 'ollama') {
      if (!config.OLLAMA_URL) continue;
      await queryAsSystem(
        `INSERT INTO tenant_providers (tenant_id, provider_id, enabled, use_platform_key)
         VALUES ($1, $2, TRUE, FALSE)
         ON CONFLICT (tenant_id, provider_id) DO NOTHING`,
        [tenantId, p.id]
      );
      continue;
    }

    const pk = await platformKeyFor(p.slug);
    if (!pk) continue;

    await queryAsSystem(
      `INSERT INTO tenant_providers (tenant_id, provider_id, enabled, use_platform_key)
       VALUES ($1, $2, TRUE, TRUE)
       ON CONFLICT (tenant_id, provider_id) DO NOTHING`,
      [tenantId, p.id]
    );

    // Heal: enabled but missing org key and platform key not opted in yet
    await queryAsSystem(
      `UPDATE tenant_providers tp
       SET use_platform_key = TRUE, updated_at = NOW()
       WHERE tp.tenant_id = $1
         AND tp.provider_id = $2
         AND tp.enabled = TRUE
         AND tp.use_platform_key = FALSE
         AND NOT EXISTS (
           SELECT 1 FROM tenant_provider_keys tpk
           WHERE tpk.tenant_id = tp.tenant_id AND tpk.provider_id = tp.provider_id
         )`,
      [tenantId, p.id]
    );
  }
  invalidateTenantProviderCache(tenantId);
}

export async function listOrgProviders(tenantId: string): Promise<OrgProviderStatus[]> {
  await ensureOrgProviderDefaults(tenantId);
  const providers = await listProviders(false);
  const enabledResult = await queryAsSystem<{
    provider_id: string;
    enabled: boolean;
    use_platform_key: boolean;
  }>(
    `SELECT provider_id, enabled, use_platform_key FROM tenant_providers WHERE tenant_id = $1`,
    [tenantId]
  );
  const keysResult = await queryAsSystem<{ provider_id: string; key_encrypted: string }>(
    `SELECT provider_id, key_encrypted FROM tenant_provider_keys WHERE tenant_id = $1`,
    [tenantId]
  );
  const enabledMap = new Map(enabledResult.rows.map((r) => [r.provider_id, r]));
  const keysMap = new Map(keysResult.rows.map((r) => [r.provider_id, r.key_encrypted]));

  return Promise.all(providers.map(async (p) => {
    const row = enabledMap.get(p.id);
    const enabled = row?.enabled ?? false;
    const use_platform_key = row?.use_platform_key ?? false;
    const enc = keysMap.get(p.id) ?? null;
    const decrypted = decryptSecret(enc);
    const needs_key = p.kind !== 'ollama';
    const has_key = !needs_key || !!decrypted;
    const platformKey = needs_key ? await platformKeyFor(p.slug) : null;
    const platform_key_available = !!platformKey;
    const usable =
      enabled &&
      (!needs_key || has_key || (use_platform_key && platform_key_available));
    return {
      slug: p.slug,
      name: p.name,
      kind: p.kind,
      base_url: p.base_url,
      is_builtin: p.is_builtin,
      enabled,
      has_key,
      masked_key: mask(decrypted) ?? (use_platform_key && platformKey ? mask(platformKey) : null),
      needs_key,
      use_platform_key,
      platform_key_available,
      usable,
    };
  }));
}

export async function setOrgProviderEnabled(
  tenantId: string,
  slug: string,
  enabled: boolean,
  usePlatformKey?: boolean
): Promise<boolean> {
  const provider = await getProviderBySlug(slug);
  if (!provider || !provider.is_active) return false;

  if (usePlatformKey === true) {
    const pk = await platformKeyFor(slug);
    if (!pk && provider.kind !== 'ollama') {
      throw new Error(`No platform/default key available for ${slug}`);
    }
  }

  await query(
    `INSERT INTO tenant_providers (tenant_id, provider_id, enabled, use_platform_key)
     VALUES ($1, $2, $3, COALESCE($4, FALSE))
     ON CONFLICT (tenant_id, provider_id) DO UPDATE
       SET enabled = EXCLUDED.enabled,
           use_platform_key = CASE
             WHEN $4::boolean IS NULL THEN tenant_providers.use_platform_key
             ELSE EXCLUDED.use_platform_key
           END,
           updated_at = NOW()`,
    [tenantId, provider.id, enabled, usePlatformKey ?? null]
  );
  invalidateTenantProviderCache(tenantId, slug);
  return true;
}

export async function setOrgProviderKey(
  tenantId: string,
  slug: string,
  apiKey: string,
  updatedBy: string | null
): Promise<boolean> {
  const provider = await getProviderBySlug(slug);
  if (!provider || !provider.is_active) return false;
  if (provider.kind === 'ollama') throw new Error('Ollama does not use an API key');
  await query(
    `INSERT INTO tenant_provider_keys (tenant_id, provider_id, key_encrypted, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, provider_id) DO UPDATE
       SET key_encrypted = EXCLUDED.key_encrypted,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
    [tenantId, provider.id, encryptSecret(apiKey), updatedBy]
  );
  // Ensure a row exists so enabling is intentional but setting a key implies interest
  await query(
    `INSERT INTO tenant_providers (tenant_id, provider_id, enabled)
     VALUES ($1, $2, TRUE)
     ON CONFLICT (tenant_id, provider_id) DO NOTHING`,
    [tenantId, provider.id]
  );
  invalidateTenantProviderCache(tenantId, slug);
  return true;
}

export async function deleteOrgProviderKey(tenantId: string, slug: string): Promise<boolean> {
  const provider = await getProviderBySlug(slug);
  if (!provider) return false;
  const result = await query(
    `DELETE FROM tenant_provider_keys WHERE tenant_id = $1 AND provider_id = $2 RETURNING provider_id`,
    [tenantId, provider.id]
  );
  invalidateTenantProviderCache(tenantId, slug);
  return result.rows.length > 0;
}

// ── Hot-path resolve ─────────────────────────────────────────────────────

const tenantKeyCache = new Map<string, { value: string | null; enabled: boolean; expires: number }>();

export function invalidateTenantProviderCache(tenantId?: string, slug?: string): void {
  if (!tenantId) {
    tenantKeyCache.clear();
    return;
  }
  if (slug) tenantKeyCache.delete(`${tenantId}:${slug}`);
  else {
    for (const k of tenantKeyCache.keys()) {
      if (k.startsWith(`${tenantId}:`)) tenantKeyCache.delete(k);
    }
  }
}

async function loadTenantProviderState(
  tenantId: string,
  slug: string
): Promise<{ enabled: boolean; apiKey: string | null }> {
  const cacheKey = `${tenantId}:${slug}`;
  const cached = tenantKeyCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return { enabled: cached.enabled, apiKey: cached.value };
  }

  const result = await queryAsSystem<{
    enabled: boolean | null;
    use_platform_key: boolean | null;
    key_encrypted: string | null;
    kind: ProviderKind;
    is_active: boolean;
  }>(
    `SELECT tp.enabled, tp.use_platform_key, tpk.key_encrypted, p.kind, p.is_active
     FROM providers p
     LEFT JOIN tenant_providers tp ON tp.provider_id = p.id AND tp.tenant_id = $1
     LEFT JOIN tenant_provider_keys tpk ON tpk.provider_id = p.id AND tpk.tenant_id = $1
     WHERE p.slug = $2`,
    [tenantId, slug]
  );
  const row = result.rows[0];
  if (!row || !row.is_active) {
    tenantKeyCache.set(cacheKey, { value: null, enabled: false, expires: Date.now() + CACHE_TTL_MS });
    return { enabled: false, apiKey: null };
  }
  const enabled = row.enabled === true;
  let apiKey: string | null = null;
  if (enabled) {
    if (row.kind === 'ollama') {
      apiKey = 'ollama';
    } else {
      apiKey = decryptSecret(row.key_encrypted);
      if (!apiKey && row.use_platform_key) {
        apiKey = await platformKeyFor(slug);
      }
    }
  }
  tenantKeyCache.set(cacheKey, { value: apiKey, enabled, expires: Date.now() + CACHE_TTL_MS });
  return { enabled, apiKey };
}

/** Tenant-scoped key when enabled + (org key or opted-in platform key). */
export async function getTenantProviderApiKey(tenantId: string, slug: string): Promise<string | null> {
  const state = await loadTenantProviderState(tenantId, slug);
  if (!state.enabled) return null;
  return state.apiKey;
}

export async function assertProviderUsable(
  tenantId: string,
  slug: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureOrgProviderDefaults(tenantId);
  const provider = await getProviderBySlug(slug);
  if (!provider || !provider.is_active) {
    return { ok: false, error: `Provider ${slug} is not available on this platform` };
  }
  const state = await loadTenantProviderState(tenantId, slug);
  if (!state.enabled) {
    return { ok: false, error: `Provider ${slug} is not enabled for this organization (Admin → Org Providers)` };
  }
  if (provider.kind !== 'ollama' && !state.apiKey) {
    return {
      ok: false,
      error: `No API key for ${slug}. In Admin → Org Providers: Set key, or turn on “Use platform key”.`,
    };
  }
  return { ok: true };
}
