import { randomBytes, createHash } from 'crypto';
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireScope } from '../plugins/auth';
import { requireOrgRole } from '../services/orgAuth';
import { query, queryAsSystem } from '../db/client';
import { PLANS } from '../services/plans';
import { getCacheStats } from '../services/semanticCache';
import { checkBudget, getPlatformBudget, setPlatformBudget } from '../services/budget';
import { writeAudit } from '../services/audit';
import { checkGuardrails } from '../services/guardrails';
import { isKeyProvider, listProviderKeys, setProviderKey, deleteProviderKey } from '../services/providerKeys';
import { listAvailableModels, invalidateModelCatalogCache } from '../services/modelCatalog';
import {
  listProviders,
  createProvider,
  updateProvider,
  listOrgProviders,
  setOrgProviderEnabled,
  setOrgProviderKey,
  deleteOrgProviderKey,
  invalidateProviderRegistryCache,
  invalidateTenantProviderCache,
} from '../services/providers';

const adminRoute: FastifyPluginAsync = async (fastify) => {
  // ── API Key Management ─────────────────────────────────────────────────

  // POST /v1/admin/keys — create a new API key (raw key returned once)
  fastify.post('/admin/keys', async (request, reply) => {
    requireScope(request, 'admin');
    requireOrgRole(request, 'admin');

    const schema = z.object({
      name: z.string().min(1).max(255),
      scopes: z.array(z.enum(['chat', 'retrieve', 'agent', 'inference', 'pro', 'admin'])).min(1),
      rate_limit_rpm: z.number().int().min(1).max(10000).default(60),
      expires_at: z.string().datetime().optional(),
      // Omitted/null = key may use any model the tenant's plan allows.
      allowed_models: z.array(z.string().min(1).max(255)).min(1).max(100).optional(),
    });

    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const rawKey = randomBytes(32).toString('hex');
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const result = await query<{ id: string }>(
      `INSERT INTO api_keys (tenant_id, key_hash, name, scopes, rate_limit_rpm, expires_at, allowed_models)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [request.tenantId, keyHash, body.data.name, body.data.scopes,
       body.data.rate_limit_rpm, body.data.expires_at ?? null, body.data.allowed_models ?? null]
    );

    writeAudit({ tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.apiKeyId, action: 'key.created', resource_type: 'api_key', resource_id: result.rows[0]!.id, details: { name: body.data.name, scopes: body.data.scopes, allowed_models: body.data.allowed_models ?? null } });

    return reply.status(201).send({ id: result.rows[0]!.id, key: rawKey, name: body.data.name, scopes: body.data.scopes, allowed_models: body.data.allowed_models ?? null });
  });

  // GET /v1/admin/keys — list API keys
  fastify.get('/admin/keys', async (request, reply) => {
    // Pro's Budgets page lists keys to show per-key budgets; creating/revoking
    // keys below stays admin-only.
    requireScope(request, 'pro');

    const result = await query(
      `SELECT id, name, scopes, rate_limit_rpm, allowed_models, is_active, last_used_at, expires_at, created_at
       FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [request.tenantId]
    );

    return reply.send({ data: result.rows });
  });

  // DELETE /v1/admin/keys/:id — revoke API key
  fastify.delete<{ Params: { id: string } }>('/admin/keys/:id', async (request, reply) => {
    requireScope(request, 'admin');
    requireOrgRole(request, 'admin');

    const result = await query(
      `UPDATE api_keys SET is_active = FALSE WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [request.params.id, request.tenantId]
    );

    if (result.rows.length === 0) return reply.status(404).send({ error: 'Key not found' });

    writeAudit({ tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.apiKeyId, action: 'key.revoked', resource_type: 'api_key', resource_id: request.params.id });

    return reply.status(204).send();
  });

  // ── Provider Keys (upstream LLM credentials) ───────────────────────────
  // Global gateway secrets — platform admins only (org admins are not enough).
  // Stored AES-256-GCM encrypted; dashboard values override env vars.

  // GET /v1/admin/provider-keys — list providers with key status (masked)
  fastify.get('/admin/provider-keys', async (request, reply) => {
    requireScope(request, 'admin');
    if (!request.isPlatformAdmin) return reply.status(403).send({ error: 'Platform admin required' });

    return reply.send({ data: await listProviderKeys() });
  });

  // PUT /v1/admin/provider-keys/:provider — set or replace a provider key
  fastify.put<{ Params: { provider: string } }>('/admin/provider-keys/:provider', async (request, reply) => {
    requireScope(request, 'admin');
    if (!request.isPlatformAdmin) return reply.status(403).send({ error: 'Platform admin required' });

    const { provider } = request.params;
    if (!isKeyProvider(provider)) return reply.status(400).send({ error: `Unknown provider: ${provider}` });

    const schema = z.object({ api_key: z.string().min(8).max(512) });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    await setProviderKey(provider, body.data.api_key.trim(), request.userId);
    invalidateModelCatalogCache();

    writeAudit({ tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.userId, action: 'provider_key.set', resource_type: 'provider_key', resource_id: provider });

    return reply.status(204).send();
  });

  // DELETE /v1/admin/provider-keys/:provider — remove dashboard override (env fallback resumes)
  fastify.delete<{ Params: { provider: string } }>('/admin/provider-keys/:provider', async (request, reply) => {
    requireScope(request, 'admin');
    if (!request.isPlatformAdmin) return reply.status(403).send({ error: 'Platform admin required' });

    const { provider } = request.params;
    if (!isKeyProvider(provider)) return reply.status(400).send({ error: `Unknown provider: ${provider}` });

    const removed = await deleteProviderKey(provider);
    if (!removed) return reply.status(404).send({ error: 'No dashboard key stored for this provider' });
    invalidateModelCatalogCache();

    writeAudit({ tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.userId, action: 'provider_key.removed', resource_type: 'provider_key', resource_id: provider });

    return reply.status(204).send();
  });

  // ── Platform provider registry ─────────────────────────────────────────

  fastify.get('/admin/providers', async (request, reply) => {
    requireScope(request, 'admin');
    if (!request.isPlatformAdmin) return reply.status(403).send({ error: 'Platform admin required' });
    return reply.send({ data: await listProviders(true) });
  });

  fastify.post('/admin/providers', async (request, reply) => {
    requireScope(request, 'admin');
    if (!request.isPlatformAdmin) return reply.status(403).send({ error: 'Platform admin required' });

    const schema = z.object({
      slug: z.string().min(2).max(63),
      name: z.string().min(1).max(120),
      kind: z.enum(['openai_compat']).default('openai_compat'),
      base_url: z.string().url(),
    });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    try {
      const created = await createProvider(body.data);
      invalidateModelCatalogCache();
      writeAudit({
        tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.userId,
        action: 'provider.created', resource_type: 'provider', resource_id: created.id,
        details: { slug: created.slug, base_url: created.base_url },
      });
      return reply.status(201).send(created);
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  fastify.patch<{ Params: { slug: string } }>('/admin/providers/:slug', async (request, reply) => {
    requireScope(request, 'admin');
    if (!request.isPlatformAdmin) return reply.status(403).send({ error: 'Platform admin required' });

    const schema = z.object({
      name: z.string().min(1).max(120).optional(),
      base_url: z.string().url().optional(),
      is_active: z.boolean().optional(),
    });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    try {
      const updated = await updateProvider(request.params.slug, body.data);
      if (!updated) return reply.status(404).send({ error: 'Provider not found' });
      invalidateProviderRegistryCache();
      invalidateModelCatalogCache();
      writeAudit({
        tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.userId,
        action: 'provider.updated', resource_type: 'provider', resource_id: updated.id,
        details: body.data,
      });
      return reply.send(updated);
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // ── Org providers (enable + org-owned keys) ────────────────────────────

  fastify.get('/admin/org/providers', async (request, reply) => {
    requireScope(request, 'admin');
    requireOrgRole(request, 'admin');
    return reply.send({ data: await listOrgProviders(request.tenantId) });
  });

  fastify.put<{ Params: { slug: string } }>('/admin/org/providers/:slug', async (request, reply) => {
    requireScope(request, 'admin');
    requireOrgRole(request, 'admin');

    const schema = z.object({
      enabled: z.boolean().optional(),
      use_platform_key: z.boolean().optional(),
    }).refine((d) => d.enabled !== undefined || d.use_platform_key !== undefined, {
      message: 'enabled or use_platform_key required',
    });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    try {
      // Load current enabled if only toggling use_platform_key
      let enabled = body.data.enabled;
      if (enabled === undefined) {
        const current = await listOrgProviders(request.tenantId);
        const row = current.find((p) => p.slug === request.params.slug);
        enabled = row?.enabled ?? true;
      }
      const ok = await setOrgProviderEnabled(
        request.tenantId,
        request.params.slug,
        enabled,
        body.data.use_platform_key
      );
      if (!ok) return reply.status(404).send({ error: 'Provider not found' });
      invalidateModelCatalogCache();
      writeAudit({
        tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.userId ?? request.apiKeyId,
        action: 'tenant_provider.updated', resource_type: 'provider', resource_id: request.params.slug,
        details: body.data,
      });
      return reply.status(204).send();
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  fastify.put<{ Params: { slug: string } }>('/admin/org/provider-keys/:slug', async (request, reply) => {
    requireScope(request, 'admin');
    requireOrgRole(request, 'admin');

    const schema = z.object({ api_key: z.string().min(8).max(512) });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    try {
      const ok = await setOrgProviderKey(
        request.tenantId,
        request.params.slug,
        body.data.api_key.trim(),
        request.userId
      );
      if (!ok) return reply.status(404).send({ error: 'Provider not found' });
      invalidateTenantProviderCache(request.tenantId, request.params.slug);
      invalidateModelCatalogCache();
      writeAudit({
        tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.userId ?? request.apiKeyId,
        action: 'tenant_provider_key.set', resource_type: 'provider', resource_id: request.params.slug,
      });
      return reply.status(204).send();
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  fastify.delete<{ Params: { slug: string } }>('/admin/org/provider-keys/:slug', async (request, reply) => {
    requireScope(request, 'admin');
    requireOrgRole(request, 'admin');

    const removed = await deleteOrgProviderKey(request.tenantId, request.params.slug);
    if (!removed) return reply.status(404).send({ error: 'No org key stored for this provider' });
    invalidateModelCatalogCache();
    writeAudit({
      tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.userId ?? request.apiKeyId,
      action: 'tenant_provider_key.removed', resource_type: 'provider', resource_id: request.params.slug,
    });
    return reply.status(204).send();
  });

  // ── Platform budget ────────────────────────────────────────────────────

  fastify.get('/admin/platform-budget', async (request, reply) => {
    requireScope(request, 'admin');
    if (!request.isPlatformAdmin) return reply.status(403).send({ error: 'Platform admin required' });
    const status = await getPlatformBudget();
    if (!status) return reply.status(404).send({ error: 'No platform budget configured' });
    return reply.send(status);
  });

  fastify.put('/admin/platform-budget', async (request, reply) => {
    requireScope(request, 'admin');
    if (!request.isPlatformAdmin) return reply.status(403).send({ error: 'Platform admin required' });

    const schema = z.object({
      monthly_budget_usd: z.number().positive(),
      alert_threshold_pct: z.number().int().min(1).max(100).default(80),
    });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const status = await setPlatformBudget(body.data.monthly_budget_usd, body.data.alert_threshold_pct);
    writeAudit({
      tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.userId,
      action: 'platform_budget.set', resource_type: 'platform_budget', resource_id: '1',
      details: body.data,
    });
    return reply.send(status);
  });

  // ── Live model discovery ────────────────────────────────────────────────

  // GET /v1/admin/models — what each provider's key can actually reach right
  // now: Ollama's local tags for self-hosted, each cloud provider's /models
  // API otherwise. Cached ~5 min; ?refresh=1 forces a re-fetch.
  fastify.get<{ Querystring: { refresh?: string } }>('/admin/models', async (request, reply) => {
    requireScope(request, 'admin');

    return reply.send({ data: await listAvailableModels(request.query.refresh === '1', request.tenantId) });
  });

  // ── Tenants (plan management) ───────────────────────────────────────────
  // Cross-tenant visibility — platform admins only, like provider keys.

  // GET /v1/admin/tenants — list all tenants with plan + usage summary
  fastify.get('/admin/tenants', async (request, reply) => {
    requireScope(request, 'admin');
    if (!request.isPlatformAdmin) return reply.status(403).send({ error: 'Platform admin required' });

    const result = await queryAsSystem(
      `SELECT t.id, t.name, t.slug, t.plan, t.created_at,
              (SELECT COUNT(*)::int FROM api_keys k
                WHERE k.tenant_id = t.id AND k.is_active = TRUE) AS active_keys,
              (SELECT COUNT(*)::int FROM llm_requests r
                WHERE r.tenant_id = t.id AND r.created_at >= date_trunc('month', NOW())) AS month_requests,
              COALESCE((SELECT SUM(r.cost_usd) FROM llm_requests r
                WHERE r.tenant_id = t.id AND r.created_at >= date_trunc('month', NOW())), 0) AS month_spend_usd
       FROM tenants t
       ORDER BY t.created_at ASC`
    );

    return reply.send({ data: result.rows, plans: Object.keys(PLANS) });
  });

  // PUT /v1/admin/tenants/:id/plan — change a tenant's plan tier
  fastify.put<{ Params: { id: string } }>('/admin/tenants/:id/plan', async (request, reply) => {
    requireScope(request, 'admin');
    if (!request.isPlatformAdmin) return reply.status(403).send({ error: 'Platform admin required' });

    const schema = z.object({ plan: z.string() });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const { plan } = body.data;
    if (!(plan in PLANS)) {
      return reply.status(400).send({ error: `Unknown plan: ${plan}`, valid_plans: Object.keys(PLANS) });
    }

    const result = await queryAsSystem<{ id: string; plan: string }>(
      `UPDATE tenants t SET plan = $2, updated_at = NOW()
       FROM (SELECT id, plan FROM tenants WHERE id = $1) old
       WHERE t.id = old.id
       RETURNING t.id, old.plan`,
      [request.params.id, plan]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Tenant not found' });

    writeAudit({ tenant_id: request.params.id, actor_type: 'admin', actor_id: request.userId, action: 'tenant.plan_changed', resource_type: 'tenant', resource_id: request.params.id, details: { from: result.rows[0]!.plan, to: plan } });

    return reply.status(204).send();
  });

  // ── Budget Management ──────────────────────────────────────────────────

  // POST /v1/admin/budget — set or update monthly budget
  fastify.post('/admin/budget', async (request, reply) => {
    requireScope(request, 'pro');
    requireOrgRole(request, 'admin');

    const schema = z.object({
      monthly_budget_usd: z.number().positive(),
      alert_threshold_pct: z.number().int().min(1).max(100).default(80),
      alert_webhook_url: z.string().url().optional().nullable(),
    });

    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    await query(
      `INSERT INTO tenant_budgets (tenant_id, monthly_budget_usd, alert_threshold_pct, alert_webhook_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id) DO UPDATE
         SET monthly_budget_usd = EXCLUDED.monthly_budget_usd,
             alert_threshold_pct = EXCLUDED.alert_threshold_pct,
             alert_webhook_url = EXCLUDED.alert_webhook_url,
             updated_at = NOW()`,
      [request.tenantId, body.data.monthly_budget_usd, body.data.alert_threshold_pct, body.data.alert_webhook_url ?? null]
    );

    const status = await checkBudget(request.tenantId);
    return reply.status(200).send(status);
  });

  // GET /v1/admin/budget — get budget status
  fastify.get('/admin/budget', async (request, reply) => {
    requireScope(request, 'pro');
    const status = await checkBudget(request.tenantId);
    if (!status) return reply.status(404).send({ error: 'No budget configured' });
    return reply.send(status);
  });

  // ── A/B Experiments ────────────────────────────────────────────────────

  // POST /v1/admin/experiments — create experiment
  fastify.post('/admin/experiments', async (request, reply) => {
    requireScope(request, 'admin');
    requireOrgRole(request, 'admin');

    const schema = z.object({
      name: z.string().min(1).max(100),
      traffic_split: z.number().int().min(1).max(99).default(50),
      control_provider: z.enum(['openai', 'anthropic', 'groq', 'mistral', 'cerebras']),
      control_model: z.string().min(1),
      variant_provider: z.enum(['openai', 'anthropic', 'groq', 'mistral', 'cerebras']),
      variant_model: z.string().min(1),
    });

    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const result = await query<{ id: string }>(
      `INSERT INTO ab_experiments
         (tenant_id, name, traffic_split, control_provider, control_model, variant_provider, variant_model)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id`,
      [request.tenantId, body.data.name, body.data.traffic_split,
       body.data.control_provider, body.data.control_model,
       body.data.variant_provider, body.data.variant_model]
    );

    writeAudit({ tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.apiKeyId, action: 'experiment.created', resource_id: result.rows[0]!.id, details: body.data });

    return reply.status(201).send({ id: result.rows[0]!.id, ...body.data, is_active: true });
  });

  // GET /v1/admin/experiments — list experiments
  fastify.get('/admin/experiments', async (request, reply) => {
    requireScope(request, 'admin');
    requireOrgRole(request, 'admin');

    const result = await query(
      `SELECT id, name, is_active, traffic_split,
              control_provider, control_model, variant_provider, variant_model, created_at
       FROM ab_experiments WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [request.tenantId]
    );

    return reply.send({ data: result.rows });
  });

  // PATCH /v1/admin/experiments/:id — stop or update experiment
  fastify.patch<{ Params: { id: string } }>('/admin/experiments/:id', async (request, reply) => {
    requireScope(request, 'admin');
    requireOrgRole(request, 'admin');

    const schema = z.object({ is_active: z.boolean(), traffic_split: z.number().int().min(1).max(99).optional() });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const result = await query(
      `UPDATE ab_experiments
       SET is_active = $3,
           traffic_split = COALESCE($4, traffic_split)
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, name, is_active, traffic_split`,
      [request.params.id, request.tenantId, body.data.is_active, body.data.traffic_split ?? null]
    );

    if (result.rows.length === 0) return reply.status(404).send({ error: 'Experiment not found' });

    if (!body.data.is_active) {
      writeAudit({ tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.apiKeyId, action: 'experiment.stopped', resource_id: request.params.id });
    }

    return reply.send(result.rows[0]);
  });

  // ── Inference / Benchmarking ──────────────────────────────────────────

  // GET /v1/admin/inference/models — Ollama running + available models
  fastify.get('/admin/inference/models', async (request, reply) => {
    requireScope(request, 'inference');

    const ollamaUrl = process.env.OLLAMA_URL || 'http://ollama:11434';

    const [psRes, tagsRes] = await Promise.allSettled([
      fetch(`${ollamaUrl}/api/ps`).then((r) => r.json()),
      fetch(`${ollamaUrl}/api/tags`).then((r) => r.json()),
    ]);

    return reply.send({
      running: psRes.status === 'fulfilled' ? (psRes.value as any).models ?? [] : [],
      available: tagsRes.status === 'fulfilled' ? (tagsRes.value as any).models ?? [] : [],
    });
  });

  // GET /v1/admin/inference/stats — per-model perf from real request history
  fastify.get('/admin/inference/stats', async (request, reply) => {
    requireScope(request, 'inference');

    const result = await query(
      `SELECT
         routed_model AS model,
         routed_provider AS provider,
         COUNT(*) AS requests,
         ROUND(AVG(total_tokens::float / NULLIF(latency_ms, 0) * 1000)::numeric, 1) AS avg_tokens_per_sec,
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms)::int AS p50_ms,
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::int AS p95_ms,
         PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms)::int AS p99_ms,
         ROUND(AVG(ttfb_ms))::int AS avg_ttfb_ms,
         ROUND(AVG(total_tokens))::int AS avg_tokens
       FROM llm_requests
       WHERE tenant_id = $1
         AND status = 'success'
         AND latency_ms > 0
         AND total_tokens > 0
       GROUP BY routed_model, routed_provider
       ORDER BY requests DESC`,
      [request.tenantId]
    );

    return reply.send({ data: result.rows });
  });

  // POST /v1/admin/inference/pull — stream Ollama model pull progress
  fastify.post<{ Body: { model: string } }>('/admin/inference/pull', async (request, reply) => {
    requireScope(request, 'admin');
    requireOrgRole(request, 'admin');

    const { model } = request.body as { model: string };
    if (!model?.trim()) return reply.status(400).send({ error: 'model is required' });

    const ollamaUrl = process.env.OLLAMA_URL || 'http://ollama:11434';

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    try {
      const res = await fetch(`${ollamaUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model.trim(), stream: true }),
      });

      if (!res.ok || !res.body) {
        reply.raw.write(`data: ${JSON.stringify({ error: `Ollama returned ${res.status}` })}\n\n`);
        reply.raw.end();
        return;
      }

      const reader = (res.body as any).getReader();
      const dec = new TextDecoder();
      let buf = '';

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          reply.raw.write(`data: ${line}\n\n`);
        }
      }
    } catch (err) {
      reply.raw.write(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`);
    }

    reply.raw.write('data: [DONE]\n\n');
    reply.raw.end();
  });

  // POST /v1/admin/inference/benchmark — stream live benchmark results
  fastify.post<{ Body: { model: string; provider: string; runs?: number } }>(
    '/admin/inference/benchmark',
    async (request, reply) => {
      requireScope(request, 'admin');
    requireOrgRole(request, 'admin');

      const { model, provider, runs = 5 } = request.body as { model: string; provider: string; runs?: number };
      const n = Math.min(Math.max(1, runs), 10);

      const TEST_PROMPTS = [
        'What is 2 + 2? Answer in one sentence.',
        'Name three primary colors.',
        'What is the capital of France?',
        'Write a haiku about software.',
        'List two programming languages.',
        'What is the boiling point of water in Celsius?',
        'Name the first planet in our solar system.',
        'What does HTTP stand for?',
        'How many days are in a week?',
        'What color is the sky on a clear day?',
      ];

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const { streamLLM } = await import('../services/llm');

      for (let i = 0; i < n; i++) {
        const prompt = TEST_PROMPTS[i % TEST_PROMPTS.length]!;
        const start = Date.now();
        let ttfb = 0;
        let firstToken = true;
        let completionTokens = 0;

        try {
          for await (const event of streamLLM(provider as any, model, [{ role: 'user', content: prompt }])) {
            if (event.type === 'delta') {
              if (firstToken) { ttfb = Date.now() - start; firstToken = false; }
            } else {
              completionTokens = event.completion_tokens;
            }
          }
        } catch (err) {
          reply.raw.write(`data: ${JSON.stringify({ run: i + 1, error: (err as Error).message })}\n\n`);
          continue;
        }

        const latency = Date.now() - start;
        reply.raw.write(`data: ${JSON.stringify({
          run: i + 1,
          prompt,
          ttfb_ms: ttfb,
          latency_ms: latency,
          completion_tokens: completionTokens,
          tokens_per_sec: completionTokens > 0 ? Math.round(completionTokens / (latency / 1000)) : 0,
        })}\n\n`);
      }

      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();
    }
  );

  // ── Eval Results ──────────────────────────────────────────────────────

  // GET /v1/admin/evals — recent eval results with request context
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>('/admin/evals', async (request, reply) => {
    requireScope(request, 'admin');
    requireOrgRole(request, 'admin');
    const limit = Math.min(parseInt(request.query.limit ?? '50'), 200);
    const offset = parseInt(request.query.offset ?? '0');

    const [rows, summary] = await Promise.all([
      query(
        `SELECT e.id, e.request_id, e.faithfulness_score, e.relevance_score,
                e.coherence_score, e.hallucination_detected, e.regression_detected,
                e.eval_model, e.eval_latency_ms, e.created_at,
                r.routed_model, r.routed_provider
         FROM eval_results e
         JOIN llm_requests r ON r.id = e.request_id
         WHERE e.tenant_id = $1
         ORDER BY e.created_at DESC
         LIMIT $2 OFFSET $3`,
        [request.tenantId, limit, offset]
      ),
      query(
        `SELECT AVG(faithfulness_score)::numeric(4,3) AS avg_faithfulness,
                AVG(relevance_score)::numeric(4,3) AS avg_relevance,
                AVG(coherence_score)::numeric(4,3) AS avg_coherence,
                COUNT(*) FILTER (WHERE hallucination_detected) AS hallucinations,
                COUNT(*) AS total
         FROM eval_results WHERE tenant_id = $1`,
        [request.tenantId]
      ),
    ]);

    return reply.send({ data: rows.rows, summary: summary.rows[0], limit, offset });
  });

  // ── Semantic Cache ─────────────────────────────────────────────────────

  // ── Guardrail Policies ─────────────────────────────────────────────────────

  // GET /v1/admin/guardrail-policies — list all policies
  fastify.get('/admin/guardrail-policies', async (request, reply) => {
    requireScope(request, 'pro');
    const result = await query(
      `SELECT id, name, type, action, priority, is_active, config, created_at, updated_at
       FROM guardrail_policies WHERE tenant_id = $1 ORDER BY priority ASC, created_at ASC`,
      [request.tenantId]
    );
    return reply.send({ data: result.rows });
  });

  // POST /v1/admin/guardrail-policies — create policy
  fastify.post('/admin/guardrail-policies', async (request, reply) => {
    requireScope(request, 'pro');
    requireOrgRole(request, 'admin');
    const schema = z.object({
      name: z.string().min(1).max(255),
      type: z.enum(['regex', 'keyword', 'llm_classifier']),
      action: z.enum(['block', 'flag', 'redact']).default('block'),
      priority: z.number().int().min(1).max(1000).default(100),
      config: z.record(z.unknown()),
    });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const result = await query<{ id: string }>(
      `INSERT INTO guardrail_policies (tenant_id, name, type, action, priority, config)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [request.tenantId, body.data.name, body.data.type, body.data.action,
       body.data.priority, JSON.stringify(body.data.config)]
    );

    writeAudit({ tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.apiKeyId, action: 'guardrail_policy.created', resource_id: result.rows[0]!.id, details: { name: body.data.name, type: body.data.type } });
    return reply.status(201).send({ id: result.rows[0]!.id, ...body.data, is_active: true });
  });

  // PATCH /v1/admin/guardrail-policies/:id — update / toggle
  fastify.patch<{ Params: { id: string } }>('/admin/guardrail-policies/:id', async (request, reply) => {
    requireScope(request, 'pro');
    requireOrgRole(request, 'admin');
    const schema = z.object({
      name:      z.string().min(1).max(255).optional(),
      is_active: z.boolean().optional(),
      priority:  z.number().int().min(1).max(1000).optional(),
      action:    z.enum(['block', 'flag', 'redact']).optional(),
      config:    z.record(z.unknown()).optional(),
    });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const result = await query(
      `UPDATE guardrail_policies
       SET name      = COALESCE($3, name),
           is_active = COALESCE($4, is_active),
           priority  = COALESCE($5, priority),
           action    = COALESCE($6::varchar, action),
           config    = COALESCE($7::jsonb, config),
           updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, name, type, action, priority, is_active, config`,
      [request.params.id, request.tenantId,
       body.data.name ?? null, body.data.is_active ?? null, body.data.priority ?? null,
       body.data.action ?? null, body.data.config ? JSON.stringify(body.data.config) : null]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Policy not found' });
    return reply.send(result.rows[0]);
  });

  // DELETE /v1/admin/guardrail-policies/:id — remove policy
  fastify.delete<{ Params: { id: string } }>('/admin/guardrail-policies/:id', async (request, reply) => {
    requireScope(request, 'pro');
    requireOrgRole(request, 'admin');
    const result = await query(
      `DELETE FROM guardrail_policies WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [request.params.id, request.tenantId]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Policy not found' });
    writeAudit({ tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.apiKeyId, action: 'guardrail_policy.deleted', resource_id: request.params.id });
    return reply.status(204).send();
  });

  // POST /v1/admin/guardrail-policies/test — run text through all active policies
  fastify.post('/admin/guardrail-policies/test', async (request, reply) => {
    requireScope(request, 'pro');
    const schema = z.object({ text: z.string().min(1).max(5000) });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });
    const result = await checkGuardrails([{ role: 'user', content: body.data.text }], request.tenantId);
    return reply.send(result);
  });

  // GET /v1/admin/cache/stats — cache statistics
  fastify.get('/admin/cache/stats', async (request, reply) => {
    requireScope(request, 'admin');
    requireOrgRole(request, 'admin');
    const stats = await getCacheStats(request.tenantId);
    return reply.send(stats);
  });

  // DELETE /v1/admin/cache — clear all cached entries for this tenant
  fastify.delete('/admin/cache', async (request, reply) => {
    requireScope(request, 'admin');
    requireOrgRole(request, 'admin');
    const result = await query(
      `DELETE FROM semantic_cache WHERE tenant_id = $1 RETURNING id`,
      [request.tenantId]
    );
    return reply.send({ deleted: result.rows.length });
  });
};

export default adminRoute;
