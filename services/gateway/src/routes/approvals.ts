import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireScope } from '../plugins/auth';
import { query } from '../db/client';
import { writeAudit } from '../services/audit';

const approvalsRoute: FastifyPluginAsync = async (fastify) => {
  // ── Approvals ──────────────────────────────────────────────────────────────

  // GET /v1/admin/approvals?status=pending|approved|rejected|all
  fastify.get<{ Querystring: { status?: string; limit?: string; offset?: string } }>(
    '/admin/approvals',
    async (request, reply) => {
      requireScope(request, 'pro');

      const status  = request.query.status ?? 'pending';
      const limit   = Math.min(parseInt(request.query.limit  ?? '50'), 200);
      const offset  = parseInt(request.query.offset ?? '0');

      // Expire stale pending rows before fetching
      await query(
        `UPDATE agent_approvals SET status = 'expired'
         WHERE tenant_id = $1 AND status = 'pending' AND expires_at < NOW()`,
        [request.tenantId]
      );

      const result = await query(
        `SELECT aa.id, aa.agent_id, aa.trace_id, aa.step_index, aa.tool_name,
                aa.tool_input, aa.goal, aa.status, aa.reviewer_note,
                aa.expires_at, aa.created_at, aa.resolved_at,
                a.name AS agent_name
         FROM agent_approvals aa
         LEFT JOIN agents a ON a.id = aa.agent_id
         WHERE aa.tenant_id = $1
           AND ($2 = 'all' OR aa.status = $2)
         ORDER BY aa.created_at DESC
         LIMIT $3 OFFSET $4`,
        [request.tenantId, status, limit, offset]
      );

      const countResult = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM agent_approvals
         WHERE tenant_id = $1 AND ($2 = 'all' OR status = $2)`,
        [request.tenantId, status]
      );

      return reply.send({
        data: result.rows,
        total: parseInt(countResult.rows[0]?.count ?? '0'),
        limit,
        offset,
      });
    }
  );

  // GET /v1/admin/approvals/:id
  fastify.get<{ Params: { id: string } }>('/admin/approvals/:id', async (request, reply) => {
    requireScope(request, 'pro');

    const result = await query(
      `SELECT aa.*, a.name AS agent_name
       FROM agent_approvals aa
       LEFT JOIN agents a ON a.id = aa.agent_id
       WHERE aa.id = $1 AND aa.tenant_id = $2`,
      [request.params.id, request.tenantId]
    );

    if (result.rows.length === 0) return reply.status(404).send({ error: 'Approval not found' });
    return reply.send(result.rows[0]);
  });

  // POST /v1/admin/approvals/:id/approve
  fastify.post<{ Params: { id: string } }>('/admin/approvals/:id/approve', async (request, reply) => {
    requireScope(request, 'pro');

    const schema = z.object({ note: z.string().max(1000).optional() });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const result = await query(
      `UPDATE agent_approvals
       SET status = 'approved', reviewer_note = $3, resolved_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
       RETURNING id, status, resolved_at`,
      [request.params.id, request.tenantId, body.data.note ?? null]
    );

    if (result.rows.length === 0) {
      return reply.status(409).send({ error: 'Approval not found or already resolved' });
    }

    writeAudit({ tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.apiKeyId, action: 'approval.approved', resource_id: request.params.id, details: { note: body.data.note } });
    return reply.send(result.rows[0]);
  });

  // POST /v1/admin/approvals/:id/reject
  fastify.post<{ Params: { id: string } }>('/admin/approvals/:id/reject', async (request, reply) => {
    requireScope(request, 'pro');

    const schema = z.object({ reason: z.string().min(1).max(1000) });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const result = await query(
      `UPDATE agent_approvals
       SET status = 'rejected', reviewer_note = $3, resolved_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
       RETURNING id, status, resolved_at`,
      [request.params.id, request.tenantId, body.data.reason]
    );

    if (result.rows.length === 0) {
      return reply.status(409).send({ error: 'Approval not found or already resolved' });
    }

    writeAudit({ tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.apiKeyId, action: 'approval.rejected', resource_id: request.params.id, details: { reason: body.data.reason } });
    return reply.send(result.rows[0]);
  });

  // ── Approval Policies ──────────────────────────────────────────────────────

  // GET /v1/admin/approval-policies
  fastify.get('/admin/approval-policies', async (request, reply) => {
    requireScope(request, 'pro');
    const result = await query(
      `SELECT id, tool_pattern, require_approval, notif_webhook, created_at
       FROM approval_policies WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [request.tenantId]
    );
    return reply.send({ data: result.rows });
  });

  // POST /v1/admin/approval-policies
  fastify.post('/admin/approval-policies', async (request, reply) => {
    requireScope(request, 'pro');

    const schema = z.object({
      tool_pattern:     z.string().min(1).max(255),
      require_approval: z.boolean().default(true),
      notif_webhook:    z.string().url().optional().nullable(),
    });

    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const result = await query<{ id: string }>(
      `INSERT INTO approval_policies (tenant_id, tool_pattern, require_approval, notif_webhook)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [request.tenantId, body.data.tool_pattern, body.data.require_approval, body.data.notif_webhook ?? null]
    );

    writeAudit({ tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.apiKeyId, action: 'approval_policy.created', resource_id: result.rows[0]!.id, details: { tool_pattern: body.data.tool_pattern } });
    return reply.status(201).send({ id: result.rows[0]!.id, ...body.data });
  });

  // DELETE /v1/admin/approval-policies/:id
  fastify.delete<{ Params: { id: string } }>('/admin/approval-policies/:id', async (request, reply) => {
    requireScope(request, 'pro');

    const result = await query(
      `DELETE FROM approval_policies WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [request.params.id, request.tenantId]
    );

    if (result.rows.length === 0) return reply.status(404).send({ error: 'Policy not found' });
    return reply.status(204).send();
  });
};

export default approvalsRoute;
