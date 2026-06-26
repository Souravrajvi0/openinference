import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireScope } from '../plugins/auth';
import { query } from '../db/client';
import { writeAudit } from '../services/audit';
import { encryptSecret } from '../services/secrets';
import { mcpAuthHeaders } from '../services/mcpAuth';
import { checkMcpRateLimit } from '../services/mcpRateLimit';

// ── Pattern matching (same logic as agentRuntime) ─────────────────────────────

function matchesPattern(toolName: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('_*')) return toolName.startsWith(pattern.slice(0, -1));
  if (pattern.endsWith('.*')) return toolName.startsWith(pattern.slice(0, -2));
  return toolName === pattern;
}

// ── Route ─────────────────────────────────────────────────────────────────────

const mcpRoute: FastifyPluginAsync = async (fastify) => {
  // ── Servers ───────────────────────────────────────────────────────────────

  fastify.get('/admin/mcp-servers', async (request, reply) => {
    requireScope(request, 'pro');
    const result = await query(
      `SELECT s.id, s.name, s.url, s.description, s.auth_type, s.is_active, s.created_at,
              COUNT(p.id)::int AS policy_count,
              COUNT(l.id)::int AS call_count
       FROM mcp_servers s
       LEFT JOIN mcp_policies p ON p.server_id = s.id
       LEFT JOIN mcp_call_logs l ON l.server_id = s.id
         AND l.created_at >= date_trunc('month', NOW())
       WHERE s.tenant_id = $1
       GROUP BY s.id
       ORDER BY s.created_at DESC`,
      [request.tenantId]
    );
    return reply.send({ data: result.rows });
  });

  fastify.post('/admin/mcp-servers', async (request, reply) => {
    requireScope(request, 'pro');

    const schema = z.object({
      name:        z.string().min(1).max(255),
      url:         z.string().url(),
      description: z.string().max(1000).optional().nullable(),
      auth_type:   z.enum(['none', 'bearer', 'api_key']).default('none'),
      auth_header: z.string().optional().nullable(),
      auth_value:  z.string().optional().nullable(),
    });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const encryptedAuth = encryptSecret(body.data.auth_value);

    const result = await query<{ id: string }>(
      `INSERT INTO mcp_servers (tenant_id, name, url, description, auth_type, auth_header, auth_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [request.tenantId, body.data.name, body.data.url, body.data.description ?? null,
       body.data.auth_type, body.data.auth_header ?? null, encryptedAuth]
    );

    writeAudit({ tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.apiKeyId, action: 'mcp_server.created', resource_id: result.rows[0]!.id, details: { name: body.data.name, url: body.data.url } });
    const { auth_value: _omit, ...safe } = body.data;
    return reply.status(201).send({ id: result.rows[0]!.id, ...safe, auth_value_set: !!body.data.auth_value });
  });

  fastify.patch<{ Params: { id: string } }>('/admin/mcp-servers/:id', async (request, reply) => {
    requireScope(request, 'pro');

    const schema = z.object({
      name:        z.string().min(1).max(255).optional(),
      url:         z.string().url().optional(),
      description: z.string().max(1000).optional().nullable(),
      auth_type:   z.enum(['none', 'bearer', 'api_key']).optional(),
      auth_header: z.string().optional().nullable(),
      auth_value:  z.string().optional().nullable(),
      is_active:   z.boolean().optional(),
    });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const authValueForDb = body.data.auth_value !== undefined && body.data.auth_value !== null
      ? encryptSecret(body.data.auth_value)
      : body.data.auth_value ?? null;

    const result = await query(
      `UPDATE mcp_servers
       SET name        = COALESCE($3, name),
           url         = COALESCE($4, url),
           description = COALESCE($5, description),
           auth_type   = COALESCE($6, auth_type),
           auth_header = COALESCE($7, auth_header),
           auth_value  = COALESCE($8, auth_value),
           is_active   = COALESCE($9, is_active),
           updated_at  = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, name, url, is_active`,
      [request.params.id, request.tenantId,
       body.data.name ?? null, body.data.url ?? null, body.data.description ?? null,
       body.data.auth_type ?? null, body.data.auth_header ?? null, authValueForDb,
       body.data.is_active ?? null]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Server not found' });
    return reply.send(result.rows[0]);
  });

  fastify.delete<{ Params: { id: string } }>('/admin/mcp-servers/:id', async (request, reply) => {
    requireScope(request, 'pro');
    const result = await query(
      `DELETE FROM mcp_servers WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [request.params.id, request.tenantId]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Server not found' });
    return reply.status(204).send();
  });

  // ── Policies ──────────────────────────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>('/admin/mcp-servers/:id/policies', async (request, reply) => {
    requireScope(request, 'pro');
    const result = await query(
      `SELECT id, tool_pattern, action, rate_limit, created_at
       FROM mcp_policies WHERE server_id = $1 AND tenant_id = $2
       ORDER BY created_at ASC`,
      [request.params.id, request.tenantId]
    );
    return reply.send({ data: result.rows });
  });

  fastify.post<{ Params: { id: string } }>('/admin/mcp-servers/:id/policies', async (request, reply) => {
    requireScope(request, 'pro');

    const schema = z.object({
      tool_pattern: z.string().min(1).max(255).default('*'),
      action:       z.enum(['allow', 'deny']).default('allow'),
      rate_limit:   z.number().int().positive().optional().nullable(),
    });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const serverCheck = await query(
      `SELECT id FROM mcp_servers WHERE id = $1 AND tenant_id = $2`,
      [request.params.id, request.tenantId]
    );
    if (serverCheck.rows.length === 0) return reply.status(404).send({ error: 'Server not found' });

    const result = await query<{ id: string }>(
      `INSERT INTO mcp_policies (tenant_id, server_id, tool_pattern, action, rate_limit)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [request.tenantId, request.params.id, body.data.tool_pattern, body.data.action, body.data.rate_limit ?? null]
    );
    return reply.status(201).send({ id: result.rows[0]!.id, ...body.data });
  });

  fastify.delete<{ Params: { id: string; policyId: string } }>(
    '/admin/mcp-servers/:id/policies/:policyId',
    async (request, reply) => {
      requireScope(request, 'pro');
      const result = await query(
        `DELETE FROM mcp_policies WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [request.params.policyId, request.tenantId]
      );
      if (result.rows.length === 0) return reply.status(404).send({ error: 'Policy not found' });
      return reply.status(204).send();
    }
  );

  // ── Call logs ─────────────────────────────────────────────────────────────

  fastify.get<{ Querystring: { server_id?: string; status?: string; limit?: string } }>(
    '/admin/mcp-logs',
    async (request, reply) => {
      requireScope(request, 'pro');
      const limit  = Math.min(parseInt(request.query.limit ?? '100'), 500);
      const result = await query(
        `SELECT l.id, l.server_id, l.tool_name, l.status, l.latency_ms, l.error,
                l.created_at, s.name AS server_name
         FROM mcp_call_logs l
         JOIN mcp_servers s ON s.id = l.server_id
         WHERE l.tenant_id = $1
           AND ($2::uuid IS NULL OR l.server_id = $2::uuid)
           AND ($3::text IS NULL OR l.status = $3)
         ORDER BY l.created_at DESC
         LIMIT $4`,
        [request.tenantId, request.query.server_id ?? null, request.query.status ?? null, limit]
      );
      return reply.send({ data: result.rows });
    }
  );

  // ── Proxy: POST /v1/mcp/call ──────────────────────────────────────────────

  fastify.post<{
    Body: { server_id: string; tool_name: string; input?: Record<string, unknown>; agent_id?: string };
  }>('/mcp/call', async (request, reply) => {
    requireScope(request, 'agent');

    const schema = z.object({
      server_id: z.string().uuid(),
      tool_name: z.string().min(1),
      input:     z.record(z.unknown()).default({}),
      agent_id:  z.string().uuid().optional(),
    });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    // Load server
    const serverResult = await query<{
      id: string; url: string; auth_type: string; auth_header: string | null; auth_value: string | null; is_active: boolean;
    }>(
      `SELECT id, url, auth_type, auth_header, auth_value, is_active
       FROM mcp_servers WHERE id = $1 AND tenant_id = $2`,
      [body.data.server_id, request.tenantId]
    );
    if (serverResult.rows.length === 0) return reply.status(404).send({ error: 'MCP server not found' });
    const server = serverResult.rows[0]!;
    if (!server.is_active) return reply.status(403).send({ error: 'MCP server is disabled' });

    // Load policies for this server
    const policiesResult = await query<{ tool_pattern: string; action: string; rate_limit: number | null }>(
      `SELECT tool_pattern, action, rate_limit FROM mcp_policies
       WHERE server_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`,
      [body.data.server_id, request.tenantId]
    );

    // Evaluate: last matching policy wins; default allow if no policies
    let effectiveAction = 'allow';
    let effectiveRateLimit: number | null = null;
    for (const p of policiesResult.rows) {
      if (matchesPattern(body.data.tool_name, p.tool_pattern)) {
        effectiveAction = p.action;
        effectiveRateLimit = p.rate_limit;
      }
    }

    if (effectiveAction === 'deny') {
      await query(
        `INSERT INTO mcp_call_logs (tenant_id, server_id, agent_id, tool_name, input, status, error)
         VALUES ($1,$2,$3,$4,$5,'denied','Policy denied this tool call')`,
        [request.tenantId, body.data.server_id, body.data.agent_id ?? null, body.data.tool_name, JSON.stringify(body.data.input)]
      );
      return reply.status(403).send({ error: 'Tool call denied by policy' });
    }

    if (effectiveRateLimit !== null && !(await checkMcpRateLimit(body.data.server_id, effectiveRateLimit))) {
      return reply.status(429).send({ error: 'Rate limit exceeded for this MCP server' });
    }

    // Execute the call (JSON-RPC 2.0)
    const start = Date.now();
    let output: string | null = null;
    let callStatus = 'success';
    let errorMsg: string | null = null;

    try {
      const res = await fetch(server.url, {
        method: 'POST',
        headers: mcpAuthHeaders(server),
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: body.data.tool_name, arguments: body.data.input },
          id: 1,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      const json = await res.json() as { result?: { content?: { text?: string }[] }; error?: { message?: string } };
      if (json.error) {
        callStatus = 'error';
        errorMsg = json.error.message ?? 'MCP server returned an error';
      } else {
        output = json.result?.content?.map((c) => c.text ?? '').join('\n') ?? JSON.stringify(json.result);
      }
    } catch (err) {
      callStatus = 'error';
      errorMsg = (err as Error).message;
    }

    const latencyMs = Date.now() - start;

    await query(
      `INSERT INTO mcp_call_logs (tenant_id, server_id, agent_id, tool_name, input, output, status, latency_ms, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [request.tenantId, body.data.server_id, body.data.agent_id ?? null, body.data.tool_name,
       JSON.stringify(body.data.input), output, callStatus, latencyMs, errorMsg]
    );

    if (callStatus === 'error') {
      return reply.status(502).send({ error: errorMsg });
    }

    return reply.send({ output, latency_ms: latencyMs });
  });
};

export default mcpRoute;
