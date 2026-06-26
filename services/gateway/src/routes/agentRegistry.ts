import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireScope } from '../plugins/auth';
import { query } from '../db/client';
import { writeAudit } from '../services/audit';

const agentRegistryRoute: FastifyPluginAsync = async (fastify) => {
  // GET /v1/admin/agents — list with last-run summary
  fastify.get('/admin/agents', async (request, reply) => {
    requireScope(request, 'pro');

    const result = await query(
      `SELECT
         a.id, a.name, a.description, a.allowed_tools, a.allowed_models,
         a.max_steps, a.monthly_budget_usd, a.is_active,
         a.system_prompt, a.metadata, a.created_at, a.updated_at,
         COUNT(r.id)::int                                          AS total_runs,
         MAX(r.started_at)                                        AS last_run_at,
         ROUND(AVG(r.cost_usd)::numeric, 8)                      AS avg_cost_usd,
         ROUND(AVG(r.steps_used)::numeric, 1)                    AS avg_steps,
         ROUND(SUM(CASE
           WHEN DATE_TRUNC('month', r.started_at) = DATE_TRUNC('month', NOW())
           THEN COALESCE(r.cost_usd, 0) ELSE 0 END)::numeric, 8) AS spend_this_month
       FROM agents a
       LEFT JOIN agent_runs r ON r.agent_id = a.id
       WHERE a.tenant_id = $1
       GROUP BY a.id
       ORDER BY a.created_at DESC`,
      [request.tenantId]
    );

    return reply.send({ data: result.rows });
  });

  // POST /v1/admin/agents — create agent
  fastify.post('/admin/agents', async (request, reply) => {
    requireScope(request, 'pro');

    const schema = z.object({
      name:               z.string().min(1).max(255),
      description:        z.string().max(1000).optional(),
      allowed_tools:      z.array(z.string()).default([]),
      allowed_models:     z.array(z.string()).default([]),
      max_steps:          z.number().int().min(1).max(20).default(5),
      monthly_budget_usd: z.number().positive().optional().nullable(),
      system_prompt:      z.string().max(10000).optional().nullable(),
      metadata:           z.record(z.unknown()).default({}),
    });

    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const result = await query<{ id: string }>(
      `INSERT INTO agents
         (tenant_id, name, description, allowed_tools, allowed_models,
          max_steps, monthly_budget_usd, system_prompt, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [request.tenantId, body.data.name, body.data.description ?? null,
       body.data.allowed_tools, body.data.allowed_models,
       body.data.max_steps, body.data.monthly_budget_usd ?? null,
       body.data.system_prompt ?? null, JSON.stringify(body.data.metadata)]
    );

    writeAudit({ tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.apiKeyId, action: 'agent.created', resource_id: result.rows[0]!.id, details: { name: body.data.name } });
    return reply.status(201).send({ id: result.rows[0]!.id, ...body.data, is_active: true });
  });

  // GET /v1/admin/agents/:id — detail
  fastify.get<{ Params: { id: string } }>('/admin/agents/:id', async (request, reply) => {
    requireScope(request, 'pro');

    const result = await query(
      `SELECT id, name, description, allowed_tools, allowed_models, max_steps,
              monthly_budget_usd, system_prompt, is_active, metadata, created_at, updated_at
       FROM agents WHERE id = $1 AND tenant_id = $2`,
      [request.params.id, request.tenantId]
    );

    if (result.rows.length === 0) return reply.status(404).send({ error: 'Agent not found' });
    return reply.send(result.rows[0]);
  });

  // PATCH /v1/admin/agents/:id — update
  fastify.patch<{ Params: { id: string } }>('/admin/agents/:id', async (request, reply) => {
    requireScope(request, 'pro');

    const schema = z.object({
      name:               z.string().min(1).max(255).optional(),
      description:        z.string().max(1000).nullable().optional(),
      allowed_tools:      z.array(z.string()).optional(),
      allowed_models:     z.array(z.string()).optional(),
      max_steps:          z.number().int().min(1).max(20).optional(),
      monthly_budget_usd: z.number().positive().nullable().optional(),
      system_prompt:      z.string().max(10000).nullable().optional(),
      is_active:          z.boolean().optional(),
    });

    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const result = await query(
      `UPDATE agents SET
         name               = COALESCE($3, name),
         description        = COALESCE($4, description),
         allowed_tools      = COALESCE($5, allowed_tools),
         allowed_models     = COALESCE($6, allowed_models),
         max_steps          = COALESCE($7, max_steps),
         monthly_budget_usd = COALESCE($8, monthly_budget_usd),
         system_prompt      = COALESCE($9, system_prompt),
         is_active          = COALESCE($10, is_active),
         updated_at         = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, name, description, allowed_tools, allowed_models, max_steps,
                 monthly_budget_usd, system_prompt, is_active, updated_at`,
      [request.params.id, request.tenantId,
       body.data.name ?? null, body.data.description ?? null,
       body.data.allowed_tools ?? null, body.data.allowed_models ?? null,
       body.data.max_steps ?? null, body.data.monthly_budget_usd ?? null,
       body.data.system_prompt ?? null, body.data.is_active ?? null]
    );

    if (result.rows.length === 0) return reply.status(404).send({ error: 'Agent not found' });
    return reply.send(result.rows[0]);
  });

  // DELETE /v1/admin/agents/:id — deactivate (soft delete)
  fastify.delete<{ Params: { id: string } }>('/admin/agents/:id', async (request, reply) => {
    requireScope(request, 'pro');

    const result = await query(
      `UPDATE agents SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [request.params.id, request.tenantId]
    );

    if (result.rows.length === 0) return reply.status(404).send({ error: 'Agent not found' });
    writeAudit({ tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.apiKeyId, action: 'agent.deactivated', resource_id: request.params.id });
    return reply.status(204).send();
  });

  // GET /v1/admin/agents/:id/runs — paginated run history
  fastify.get<{ Params: { id: string }; Querystring: { limit?: string; offset?: string } }>(
    '/admin/agents/:id/runs',
    async (request, reply) => {
      requireScope(request, 'pro');

      const limit  = Math.min(parseInt(request.query.limit  ?? '50'), 200);
      const offset = parseInt(request.query.offset ?? '0');

      const [runs, total] = await Promise.all([
        query(
          `SELECT r.id, r.goal, r.status, r.steps_used, r.total_tokens,
                  r.cost_usd, r.started_at, r.completed_at
           FROM agent_runs r
           WHERE r.agent_id = $1 AND r.tenant_id = $2
           ORDER BY r.started_at DESC
           LIMIT $3 OFFSET $4`,
          [request.params.id, request.tenantId, limit, offset]
        ),
        query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM agent_runs WHERE agent_id = $1 AND tenant_id = $2`,
          [request.params.id, request.tenantId]
        ),
      ]);

      return reply.send({ data: runs.rows, total: parseInt(total.rows[0]?.count ?? '0'), limit, offset });
    }
  );

  // GET /v1/admin/agents/:id/stats — aggregate stats
  fastify.get<{ Params: { id: string } }>('/admin/agents/:id/stats', async (request, reply) => {
    requireScope(request, 'pro');

    const result = await query(
      `SELECT
         COUNT(*)::int                                                       AS total_runs,
         COUNT(*) FILTER (WHERE status = 'completed')::int                  AS completed_runs,
         COUNT(*) FILTER (WHERE status = 'failed')::int                     AS failed_runs,
         ROUND(AVG(steps_used)::numeric, 2)                                 AS avg_steps,
         ROUND(AVG(cost_usd)::numeric, 8)                                   AS avg_cost_usd,
         ROUND(SUM(CASE
           WHEN DATE_TRUNC('month', started_at) = DATE_TRUNC('month', NOW())
           THEN COALESCE(cost_usd, 0) ELSE 0 END)::numeric, 6)             AS spend_this_month,
         ROUND(SUM(COALESCE(cost_usd, 0))::numeric, 6)                     AS spend_total
       FROM agent_runs
       WHERE agent_id = $1 AND tenant_id = $2`,
      [request.params.id, request.tenantId]
    );

    return reply.send(result.rows[0] ?? {});
  });
};

export default agentRegistryRoute;
