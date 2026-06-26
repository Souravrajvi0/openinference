import { randomUUID } from 'crypto';
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireScope } from '../plugins/auth';
import { checkGuardrails } from '../services/guardrails';
import { checkSpendLimits } from '../services/budget';
import { planAllowsModel, tierForModel } from '../services/plans';
import { isModelAllowedForAgent, resolveAgentModel } from '../services/agentPolicy';
import { query } from '../db/client';
import { runAgent } from '../services/agentRuntime';
import { writeAudit } from '../services/audit';
import { config } from '../config';

const bodySchema = z.object({
  goal: z.string().min(1).max(2000),
  max_steps: z.number().int().min(1).max(10).default(5),
  model: z.string().optional(),
  session_id: z.string().uuid().optional(),
  stream: z.boolean().optional().default(false),
  agent_id: z.string().uuid().optional(),
});

type AgentRow = {
  id: string;
  system_prompt: string | null;
  allowed_tools: string[];
  allowed_models: string[];
  max_steps: number;
  monthly_budget_usd: string | null;
};

const agentRoute: FastifyPluginAsync = async (_fastify) => {
  _fastify.post('/agent', async (request, reply) => {
    requireScope(request, 'agent');

    const body = bodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const { goal, max_steps, model, session_id, stream, agent_id } = body.data;
    const traceId = randomUUID();
    const requestId = randomUUID();
    const start = Date.now();

    // ── Guardrails ─────────────────────────────────────────────────────────
    const guardrailResult = await checkGuardrails(
      [{ role: 'user', content: goal }],
      request.tenantId,
    );
    if (!guardrailResult.passed) {
      await query(
        `INSERT INTO llm_requests
           (id, tenant_id, api_key_id, trace_id, session_id, mode, status,
            guardrail_triggered, guardrail_action, guardrail_reasons, routed_provider, routed_model)
         VALUES ($1,$2,$3,$4,$5,'agent','filtered',TRUE,$6,$7,$8,$9)`,
        [requestId, request.tenantId, request.apiKeyId, traceId, session_id ?? null,
         guardrailResult.action, guardrailResult.reasons,
         config.DEFAULT_PROVIDER, config.DEFAULT_MODEL]
      );
      writeAudit({
        tenant_id: request.tenantId,
        actor_type: 'api_key',
        actor_id: request.apiKeyId,
        action: 'request.filtered',
        resource_id: requestId,
        details: { reasons: guardrailResult.reasons, mode: 'agent' },
      });
      return reply.status(400).send({
        error: 'Request blocked by content policy',
        reasons: guardrailResult.reasons,
        trace_id: traceId,
      });
    }

    const safeGoal = guardrailResult.sanitized_messages?.[0]?.content ?? goal;

    // ── Spend limits (tenant + API key) ────────────────────────────────────
    const spend = await checkSpendLimits(request.tenantId, request.apiKeyId);
    if (!spend.ok) {
      const label = spend.level === 'key' ? 'API key monthly spend budget exceeded' : 'Monthly spend budget exceeded';
      return reply.status(402).send({
        error: label,
        spent_usd: spend.status.spent_usd,
        budget_usd: spend.status.monthly_budget_usd,
        trace_id: traceId,
      });
    }

    // ── Agent registry lookup ──────────────────────────────────────────────
    let agentConfig: AgentRow | null = null;

    if (agent_id) {
      const agentResult = await query<AgentRow>(
        `SELECT id, system_prompt, allowed_tools, allowed_models, max_steps, monthly_budget_usd
         FROM agents WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE`,
        [agent_id, request.tenantId]
      );
      if (agentResult.rows.length === 0) {
        return reply.status(404).send({ error: 'Agent not found or inactive' });
      }
      agentConfig = agentResult.rows[0]!;

      if (agentConfig.monthly_budget_usd) {
        const spendResult = await query<{ spent: string }>(
          `SELECT COALESCE(SUM(cost_usd), 0)::text AS spent
           FROM agent_runs
           WHERE agent_id = $1
             AND DATE_TRUNC('month', started_at) = DATE_TRUNC('month', NOW())`,
          [agent_id]
        );
        const spentUsd = parseFloat(spendResult.rows[0]?.spent ?? '0');
        const budgetUsd = parseFloat(agentConfig.monthly_budget_usd);
        if (spentUsd >= budgetUsd) {
          return reply.status(402).send({
            error: 'Agent monthly budget exhausted',
            spent_usd: spentUsd,
            budget_usd: budgetUsd,
            trace_id: traceId,
          });
        }
      }
    }

    const effectiveModel = resolveAgentModel(model, agentConfig);

    if (!isModelAllowedForAgent(model, agentConfig)) {
      return reply.status(403).send({
        error: `Model ${model} is not allowed for agent ${agentConfig?.id}`,
        allowed_models: agentConfig?.allowed_models,
        trace_id: traceId,
      });
    }

    if (!planAllowsModel(request.plan, effectiveModel)) {
      return reply.status(403).send({
        error: `Your plan (${request.plan}) cannot access model ${effectiveModel} (tier: ${tierForModel(effectiveModel)})`,
        trace_id: traceId,
      });
    }

    const effectiveMaxSteps = agentConfig?.max_steps ?? max_steps;
    const systemPrompt = agentConfig?.system_prompt ?? undefined;
    const allowedTools = agentConfig?.allowed_tools?.length ? agentConfig.allowed_tools : undefined;

    const runOpts = {
      goal: safeGoal,
      model: effectiveModel,
      maxSteps: effectiveMaxSteps,
      tenantId: request.tenantId,
      systemPrompt,
      allowedTools,
      agentId: agent_id,
      traceId,
    };

    // ── Streaming path ─────────────────────────────────────────────────────
    if (stream) {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Trace-Id': traceId,
      });

      const result = await runAgent({
        ...runOpts,
        onStep: (step) => {
          reply.raw.write(`data: ${JSON.stringify({ type: 'step', step })}\n\n`);
        },
      }).catch((err: Error) => {
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: err.message, trace_id: traceId })}\n\n`);
        return null;
      });

      if (!result) {
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
        return;
      }

      if (result.approval_required) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'approval_required', approval_id: result.approval_id, tool_name: result.approval_tool })}\n\n`);
      }
      reply.raw.write(`data: ${JSON.stringify({ type: 'done', answer: result.answer, usage: { total_tokens: result.total_tokens, cost_usd: result.total_cost_usd } })}\n\n`);
      reply.raw.end();

      const latencyMs = Date.now() - start;
      const runStatus = result.approval_required ? 'pending_approval' : 'completed';
      query(
        `INSERT INTO llm_requests
           (id, tenant_id, api_key_id, trace_id, session_id, mode, status,
            prompt_preview, response_preview, routed_provider, routed_model,
            total_tokens, cost_usd, latency_ms, http_status, agent_id)
         VALUES ($1,$2,$3,$4,$5,'agent','success',$6,$7,$8,$9,$10,$11,$12,200,$13)`,
        [requestId, request.tenantId, request.apiKeyId, traceId, session_id ?? null,
         safeGoal.slice(0, 500), result.answer.slice(0, 500),
         config.DEFAULT_PROVIDER, effectiveModel,
         result.total_tokens, result.total_cost_usd, latencyMs, agent_id ?? null]
      ).then(() => {
        if (agentConfig) {
          return query(
            `INSERT INTO agent_runs
               (agent_id, request_id, tenant_id, goal, status, steps_used, total_tokens, cost_usd, completed_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
            [agentConfig.id, requestId, request.tenantId, safeGoal.slice(0, 2000),
             runStatus, result.steps.length, result.total_tokens, result.total_cost_usd]
          );
        }
      }).catch(() => {});

      writeAudit({ tenant_id: request.tenantId, actor_type: 'api_key', actor_id: request.apiKeyId, action: 'request.created', resource_id: requestId, details: { mode: 'agent', stream: true, steps: result.steps.length, agent_id: agent_id ?? null, approval_required: result.approval_required ?? false } });
      return;
    }

    // ── Non-streaming path ─────────────────────────────────────────────────
    const result = await runAgent(runOpts);

    const latencyMs = Date.now() - start;
    const runStatus = result.approval_required ? 'pending_approval' : 'completed';

    await query(
      `INSERT INTO llm_requests
         (id, tenant_id, api_key_id, trace_id, session_id, mode, status,
          prompt_preview, response_preview, routed_provider, routed_model,
          total_tokens, cost_usd, latency_ms, http_status, agent_id)
       VALUES ($1,$2,$3,$4,$5,'agent','success',$6,$7,$8,$9,$10,$11,$12,200,$13)`,
      [requestId, request.tenantId, request.apiKeyId, traceId, session_id ?? null,
       safeGoal.slice(0, 500), result.answer.slice(0, 500),
       config.DEFAULT_PROVIDER, effectiveModel,
       result.total_tokens, result.total_cost_usd, latencyMs, agent_id ?? null]
    );

    if (agentConfig) {
      await query(
        `INSERT INTO agent_runs
           (agent_id, request_id, tenant_id, goal, status, steps_used, total_tokens, cost_usd, completed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
        [agentConfig.id, requestId, request.tenantId, safeGoal.slice(0, 2000),
         runStatus, result.steps.length, result.total_tokens, result.total_cost_usd]
      ).catch(() => {});
    }

    writeAudit({ tenant_id: request.tenantId, actor_type: 'api_key', actor_id: request.apiKeyId, action: 'request.created', resource_id: requestId, details: { mode: 'agent', steps: result.steps.length, agent_id: agent_id ?? null, approval_required: result.approval_required ?? false } });

    return reply.send({
      id: requestId,
      trace_id: traceId,
      answer: result.answer,
      steps: result.steps,
      total_latency_ms: latencyMs,
      usage: {
        total_tokens: result.total_tokens,
        cost_usd: result.total_cost_usd,
      },
      ...(result.approval_required ? {
        approval_required: true,
        approval_id: result.approval_id,
        approval_tool: result.approval_tool,
      } : {}),
    });
  });
};

export default agentRoute;
