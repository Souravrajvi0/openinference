import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireScope } from '../plugins/auth';
import { requireOrgRole } from '../services/orgAuth';
import { query } from '../db/client';
import { checkBudget } from '../services/budget';
import { writeAudit } from '../services/audit';

const budgetsRoute: FastifyPluginAsync = async (fastify) => {
  // ── Tenant budget (reuse existing admin.ts endpoint but add DELETE) ────────

  fastify.delete('/admin/budget', async (request, reply) => {
    requireScope(request, 'pro');
    requireOrgRole(request, 'admin');
    await query(`DELETE FROM tenant_budgets WHERE tenant_id = $1`, [request.tenantId]);
    return reply.status(204).send();
  });

  // ── Budget summary: spend breakdown by key + agent ─────────────────────────

  fastify.get('/admin/budget/summary', async (request, reply) => {
    requireScope(request, 'pro');

    const [tenantStatus, keySpend, agentSpend] = await Promise.all([
      checkBudget(request.tenantId),

      query<{ api_key_id: string; key_name: string; spent_usd: string; monthly_budget_usd: string | null }>(
        `SELECT ak.id AS api_key_id,
                COALESCE(ak.name, 'Unnamed key') AS key_name,
                COALESCE(SUM(lr.cost_usd), 0)::text AS spent_usd,
                kb.monthly_budget_usd::text
         FROM api_keys ak
         LEFT JOIN llm_requests lr
           ON lr.api_key_id = ak.id
          AND lr.created_at >= date_trunc('month', NOW())
          AND lr.status = 'success'
         LEFT JOIN key_budgets kb ON kb.api_key_id = ak.id
         WHERE ak.tenant_id = $1 AND ak.is_active = TRUE
         GROUP BY ak.id, ak.name, kb.monthly_budget_usd
         ORDER BY spent_usd DESC`,
        [request.tenantId]
      ),

      query<{ agent_id: string; agent_name: string; spent_usd: string; monthly_budget_usd: string | null }>(
        `SELECT a.id AS agent_id, a.name AS agent_name,
                COALESCE(SUM(ar.cost_usd), 0)::text AS spent_usd,
                a.monthly_budget_usd::text
         FROM agents a
         LEFT JOIN agent_runs ar
           ON ar.agent_id = a.id
          AND ar.started_at >= date_trunc('month', NOW())
         WHERE a.tenant_id = $1 AND a.is_active = TRUE
         GROUP BY a.id, a.name, a.monthly_budget_usd
         ORDER BY spent_usd DESC`,
        [request.tenantId]
      ),
    ]);

    return reply.send({
      tenant: tenantStatus,
      by_key: keySpend.rows.map((r) => ({
        ...r,
        spent_usd: parseFloat(r.spent_usd),
        monthly_budget_usd: r.monthly_budget_usd ? parseFloat(r.monthly_budget_usd) : null,
        pct_used: r.monthly_budget_usd
          ? Math.round((parseFloat(r.spent_usd) / parseFloat(r.monthly_budget_usd)) * 100)
          : null,
      })),
      by_agent: agentSpend.rows.map((r) => ({
        ...r,
        spent_usd: parseFloat(r.spent_usd),
        monthly_budget_usd: r.monthly_budget_usd ? parseFloat(r.monthly_budget_usd) : null,
        pct_used: r.monthly_budget_usd
          ? Math.round((parseFloat(r.spent_usd) / parseFloat(r.monthly_budget_usd)) * 100)
          : null,
      })),
    });
  });

  // ── Per-key budgets ────────────────────────────────────────────────────────

  fastify.get('/admin/key-budgets', async (request, reply) => {
    requireScope(request, 'pro');
    const result = await query(
      `SELECT kb.api_key_id, kb.monthly_budget_usd, kb.alert_threshold_pct, kb.alert_webhook_url,
              kb.created_at, kb.updated_at,
              ak.name AS key_name,
              COALESCE((
                SELECT SUM(cost_usd) FROM llm_requests
                WHERE api_key_id = kb.api_key_id
                  AND created_at >= date_trunc('month', NOW())
                  AND status = 'success'
              ), 0)::text AS spent_usd
       FROM key_budgets kb
       JOIN api_keys ak ON ak.id = kb.api_key_id
       WHERE kb.tenant_id = $1
       ORDER BY kb.created_at DESC`,
      [request.tenantId]
    );
    return reply.send({ data: result.rows });
  });

  fastify.post('/admin/key-budgets', async (request, reply) => {
    requireScope(request, 'pro');
    requireOrgRole(request, 'admin');

    const schema = z.object({
      api_key_id:          z.string().uuid(),
      monthly_budget_usd:  z.number().positive(),
      alert_threshold_pct: z.number().int().min(1).max(100).default(80),
      alert_webhook_url:   z.string().url().optional().nullable(),
    });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    // Verify key belongs to tenant
    const keyCheck = await query(
      `SELECT id FROM api_keys WHERE id = $1 AND tenant_id = $2`,
      [body.data.api_key_id, request.tenantId]
    );
    if (keyCheck.rows.length === 0) return reply.status(404).send({ error: 'API key not found' });

    await query(
      `INSERT INTO key_budgets (api_key_id, tenant_id, monthly_budget_usd, alert_threshold_pct, alert_webhook_url)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (api_key_id) DO UPDATE
         SET monthly_budget_usd = EXCLUDED.monthly_budget_usd,
             alert_threshold_pct = EXCLUDED.alert_threshold_pct,
             alert_webhook_url = EXCLUDED.alert_webhook_url,
             updated_at = NOW()`,
      [body.data.api_key_id, request.tenantId, body.data.monthly_budget_usd, body.data.alert_threshold_pct, body.data.alert_webhook_url ?? null]
    );

    writeAudit({ tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.apiKeyId, action: 'key_budget.set', resource_id: body.data.api_key_id, details: { monthly_budget_usd: body.data.monthly_budget_usd } });
    return reply.status(200).send({ ok: true });
  });

  fastify.delete<{ Params: { keyId: string } }>('/admin/key-budgets/:keyId', async (request, reply) => {
    requireScope(request, 'pro');
    requireOrgRole(request, 'admin');
    await query(
      `DELETE FROM key_budgets WHERE api_key_id = $1 AND tenant_id = $2`,
      [request.params.keyId, request.tenantId]
    );
    return reply.status(204).send();
  });

  // ── Agent budget (quick patch — full CRUD lives in agentRegistry) ──────────

  fastify.patch<{ Params: { agentId: string } }>('/admin/agents/:agentId/budget', async (request, reply) => {
    requireScope(request, 'pro');
    requireOrgRole(request, 'admin');

    const schema = z.object({
      monthly_budget_usd: z.number().positive().nullable(),
    });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const result = await query(
      `UPDATE agents SET monthly_budget_usd = $3, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, name, monthly_budget_usd`,
      [request.params.agentId, request.tenantId, body.data.monthly_budget_usd]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Agent not found' });
    return reply.send(result.rows[0]);
  });
};

export default budgetsRoute;
