import { randomUUID } from 'crypto';
import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireScope } from '../plugins/auth';
import { checkGuardrails } from '../services/guardrails';
import { getFallbackRoute } from '../services/router';
import { callLLM, streamLLM, estimateCost, type ExtendedProvider } from '../services/llm';
import { planAllowsModel, tierForModel } from '../services/plans';
import { startSpan, endSpan, flushSpans } from '../services/tracer';
import { query } from '../db/client';
import { checkSpendLimits } from '../services/budget';
import { writeAudit } from '../services/audit';
import { assertProviderUsable, getProviderBySlug } from '../services/providers';
import { listAvailableModels } from '../services/modelCatalog';
import { Queue } from 'bullmq';
import { bullmqConnection } from '../services/queueConnection';
import { QUEUES, type EvalJobData, type Message } from '@sentinelai/shared';
import {
  llmRequestsTotal,
  llmLatencySeconds,
  llmTokensTotal,
  llmCostUsdTotal,
  guardrailsTriggeredTotal,
} from '../services/metricsRegistry';

// OpenAI-compatible surface: POST /v1/chat/completions and GET /v1/models.
// Lets any OpenAI SDK/tool use the gateway by swapping base URL + API key.
// Same enforcement as /v1/chat: guardrails, budgets, plan tiers, per-key
// model allowlists, tracing, metrics, evals.

// OpenAI content can be a string or an array of typed parts; we keep the text.
const contentSchema = z.union([
  z.string(),
  z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough())
    .transform((parts) => parts.map((p) => p.text ?? '').join('')),
]);

const bodySchema = z.object({
  model: z.string().min(1),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: contentSchema,
  })).min(1),
  stream: z.boolean().optional().default(false),
  stream_options: z.object({ include_usage: z.boolean().optional() }).optional(),
  n: z.number().int().optional(),
  tools: z.array(z.unknown()).optional(),
  user: z.string().optional(),
}).passthrough(); // temperature, max_tokens, etc. are accepted and ignored

function oaiError(reply: FastifyReply, status: number, message: string, type = 'invalid_request_error', code: string | null = null) {
  return reply.status(status).send({ error: { message, type, param: null, code } });
}

/**
 * Resolve "provider/model" or a bare model id to a provider.
 * "openinference/…" is the branded alias for self-hosted (Ollama) models.
 */
export async function resolveRoute(requested: string): Promise<{ provider: ExtendedProvider; model: string } | null> {
  const slash = requested.indexOf('/');
  if (slash > 0) {
    const prefix = requested.slice(0, slash);
    const rest = requested.slice(slash + 1);
    if (prefix === 'openinference') return { provider: 'ollama', model: rest };

    const registered = await getProviderBySlug(prefix);
    if (registered?.is_active) return { provider: prefix, model: rest };

    // Unknown prefix (vendor tags not in our provider set) — try the live catalog
    // only. Do NOT heuristic-guess (e.g. "qwen/qwen3.6-27b" must not become Groq).
    try {
      const catalog = await listAvailableModels();
      const bareHit = catalog.find((p) => p.configured && !p.error && p.models.includes(rest));
      if (bareHit) return { provider: bareHit.provider, model: rest };
      const fullHit = catalog.find((p) => p.configured && !p.error && p.models.includes(requested));
      if (fullHit) return { provider: fullHit.provider, model: requested };
    } catch { /* fall through */ }

    return null;
  }

  // Bare model id — first ask the live catalog which configured provider serves it
  try {
    const catalog = await listAvailableModels();
    const hit = catalog.find((p) => p.configured && !p.error && p.models.includes(requested));
    if (hit) return { provider: hit.provider, model: requested };
  } catch { /* fall through to heuristics */ }

  // Heuristics for models the catalog didn't confirm
  if (/^(gpt-|o[0-9])/.test(requested)) return { provider: 'openai', model: requested };
  if (requested.startsWith('claude')) return { provider: 'anthropic', model: requested };
  if (requested.startsWith('gemini')) return { provider: 'gemini', model: requested };
  if (/^(mistral|ministral|pixtral|codestral|magistral|open-m)/.test(requested)) return { provider: 'mistral', model: requested };
  if (/^(llama|meta-llama|mixtral|deepseek-r1-distill|qwen)/.test(requested)) return { provider: 'groq', model: requested };
  if (requested.includes(':')) return { provider: 'ollama', model: requested };
  return null;
}

function keyAllowsModel(allowed: string[] | null | undefined, requested: string, resolved: string): boolean {
  if (!allowed) return true;
  return allowed.includes(requested) || allowed.includes(resolved);
}

const openaiCompatRoute: FastifyPluginAsync = async (fastify) => {
  const evalQueue = new Queue(QUEUES.EVAL, { connection: bullmqConnection() });

  // ── GET /v1/models — OpenAI-shaped model list ─────────────────────────
  // Filtered to what THIS caller can actually use: the tenant's plan tier
  // and the key's allowed_models. Anything returned here will not 403.
  // ?refresh=1 bypasses the in-memory provider catalog cache.
  fastify.get<{ Querystring: { refresh?: string } }>('/models', async (request, reply) => {
    requireScope(request, 'chat');

    const catalog = await listAvailableModels(request.query.refresh === '1', request.tenantId);
    const seen = new Set<string>();
    const data: Array<{
      id: string;
      object: 'model';
      created: number;
      owned_by: string;
      tier: string;
    }> = [];

    for (const p of catalog) {
      if (!p.configured || p.error) continue;
      for (const m of p.models) {
        if (request.allowedModels && !request.allowedModels.includes(m)) continue;
        if (!request.allowedModels && !planAllowsModel(request.plan, m)) continue;
        if (seen.has(m)) continue;
        seen.add(m);
        data.push({
          id: m,
          object: 'model',
          created: 0,
          owned_by: p.provider === 'ollama' ? 'openinference' : p.provider,
          tier: tierForModel(m),
        });
      }
    }

    // Keys with an allowlist should still surface those ids even when a provider
    // isn't listing them right now (so the dropdown matches Admin → Keys).
    // Explicit allowlist is the admin's grant — don't hide them behind plan tiers.
    if (request.allowedModels) {
      for (const m of request.allowedModels) {
        if (seen.has(m)) continue;
        seen.add(m);
        data.push({
          id: m,
          object: 'model',
          created: 0,
          owned_by: 'allowlist',
          tier: tierForModel(m),
        });
      }
    }

    return reply.send({ object: 'list', data });
  });

  // ── POST /v1/chat/completions ─────────────────────────────────────────
  fastify.post('/chat/completions', async (request, reply) => {
    requireScope(request, 'chat');

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return oaiError(reply, 400, `${issue?.path.join('.') || 'body'}: ${issue?.message ?? 'invalid request'}`);
    }
    const body = parsed.data;

    if (body.n && body.n > 1) return oaiError(reply, 400, '`n` > 1 is not supported by this gateway');
    if (body.tools && body.tools.length > 0) return oaiError(reply, 400, 'Tool calling is not yet supported on /chat/completions; use /v1/agent for tool workflows');

    const route = await resolveRoute(body.model);
    if (!route) {
      return oaiError(reply, 404, `The model \`${body.model}\` does not exist or no provider is configured for it. Prefix with a provider (e.g. "groq/${body.model}") to route explicitly.`, 'invalid_request_error', 'model_not_found');
    }

    const messages = body.messages as Message[];
    const traceId = randomUUID();
    const requestId = randomUUID();
    const created = Math.floor(Date.now() / 1000);
    const completionId = `chatcmpl-${requestId}`;
    const spans = [];

    // ── Guardrails ──────────────────────────────────────────────────────
    const guardrailSpan = startSpan(traceId, 'gateway.guardrails');
    const guardrailResult = await checkGuardrails(messages, request.tenantId);
    endSpan(guardrailSpan, guardrailResult.passed ? 'ok' : 'error');
    spans.push(guardrailSpan);

    if (!guardrailResult.passed) {
      for (const reason of guardrailResult.reasons) {
        guardrailsTriggeredTotal.inc({ action: guardrailResult.action ?? 'blocked', reason });
      }
      await query(
        `INSERT INTO llm_requests
           (id, tenant_id, api_key_id, trace_id, mode, status,
            guardrail_triggered, guardrail_action, guardrail_reasons, routed_provider, routed_model)
         VALUES ($1,$2,$3,$4,'chat','filtered',TRUE,$5,$6,$7,$8)`,
        [requestId, request.tenantId, request.apiKeyId, traceId,
         guardrailResult.action, guardrailResult.reasons, route.provider, route.model]
      );
      flushSpans(spans, request.tenantId, requestId);
      writeAudit({ tenant_id: request.tenantId, actor_type: 'api_key', actor_id: request.apiKeyId, action: 'request.filtered', resource_id: requestId, details: { reasons: guardrailResult.reasons } });
      return oaiError(reply, 400, `Request blocked by content policy: ${guardrailResult.reasons.join(', ')}`, 'invalid_request_error', 'content_policy_violation');
    }

    const safeMessages = (guardrailResult.sanitized_messages ?? messages) as Message[];

    // ── Budget ──────────────────────────────────────────────────────────
    const spend = await checkSpendLimits(request.tenantId, request.apiKeyId);
    if (!spend.ok) {
      const msg =
        spend.level === 'platform' ? 'Platform monthly spend budget exceeded'
        : spend.level === 'key' ? 'API key monthly spend budget exceeded'
        : 'Monthly spend budget exceeded';
      return oaiError(reply, 429, msg, 'insufficient_quota', 'insufficient_quota');
    }

    // ── Plan tier + per-key model allowlist ─────────────────────────────
    // Restricted keys: allowlist is the grant (may include models outside plan tiers).
    // Unrestricted keys: plan tiers apply.
    if (request.allowedModels) {
      if (!keyAllowsModel(request.allowedModels, body.model, route.model)) {
        flushSpans(spans, request.tenantId);
        writeAudit({ tenant_id: request.tenantId, actor_type: 'api_key', actor_id: request.apiKeyId, action: 'request.filtered', details: { reason: 'model_not_allowed', model: route.model } });
        return oaiError(reply, 403, `This API key is not allowed to use model ${route.model}`, 'invalid_request_error', 'model_not_allowed');
      }
    } else if (!planAllowsModel(request.plan, route.model)) {
      flushSpans(spans, request.tenantId);
      return oaiError(reply, 403, `Your plan (${request.plan}) cannot access model ${route.model} (tier: ${tierForModel(route.model)})`, 'invalid_request_error', 'model_not_allowed');
    }

    const providerOk = await assertProviderUsable(request.tenantId, route.provider);
    if (!providerOk.ok) {
      flushSpans(spans, request.tenantId);
      return oaiError(reply, 403, providerOk.error, 'invalid_request_error', 'provider_not_enabled');
    }

    const persistRequest = (provider: string, model: string, content: string, promptTokens: number, completionTokens: number, costUsd: number, latencyMs: number, fallbackUsed: boolean) => {
      query(
        `INSERT INTO llm_requests
           (id, tenant_id, api_key_id, trace_id, mode, status,
            prompt_preview, response_preview, requested_model, routed_provider,
            routed_model, fallback_used, prompt_tokens, completion_tokens,
            total_tokens, cost_usd, latency_ms, http_status, metadata)
         VALUES ($1,$2,$3,$4,'chat','success',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,200,$16)`,
        [requestId, request.tenantId, request.apiKeyId, traceId,
         safeMessages[safeMessages.length - 1]?.content.slice(0, 500), content.slice(0, 500),
         body.model, provider, model, fallbackUsed,
         promptTokens, completionTokens, promptTokens + completionTokens,
         costUsd, latencyMs, JSON.stringify({ api: 'openai_compat', ...(body.user ? { end_user: body.user } : {}) })]
      ).catch(() => {});

      llmRequestsTotal.inc({ provider, model, status: 'success' });
      llmLatencySeconds.observe({ provider, model }, latencyMs / 1000);
      llmTokensTotal.inc({ provider, model, type: 'prompt' }, promptTokens);
      llmTokensTotal.inc({ provider, model, type: 'completion' }, completionTokens);
      llmCostUsdTotal.inc({ provider, model }, costUsd);

      evalQueue.add('eval', {
        request_id: requestId, tenant_id: request.tenantId,
        prompt: safeMessages[safeMessages.length - 1]?.content ?? '',
        response: content, mode: 'chat',
      } as EvalJobData, { removeOnComplete: 100, removeOnFail: 50 }).catch(() => {});

      writeAudit({ tenant_id: request.tenantId, actor_type: 'api_key', actor_id: request.apiKeyId, action: 'request.created', resource_id: requestId, details: { provider, model, cost_usd: costUsd, api: 'openai_compat' } });
    };

    // ── Streaming ───────────────────────────────────────────────────────
    if (body.stream) {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Trace-Id': traceId,
      });

      const chunk = (delta: Record<string, unknown>, finish: string | null, model: string) =>
        `data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;

      const start = Date.now();
      let fullContent = '';
      let promptTokens = 0;
      let completionTokens = 0;
      let usedProvider: ExtendedProvider = route.provider;
      let usedModel = route.model;
      let streamFailed = false;

      const pumpStream = async (provider: ExtendedProvider, model: string) => {
        for await (const event of streamLLM(provider, model, safeMessages)) {
          if (event.type === 'delta') {
            if (!fullContent) reply.raw.write(chunk({ role: 'assistant', content: '' }, null, model));
            fullContent += event.content;
            reply.raw.write(chunk({ content: event.content }, null, model));
          } else {
            promptTokens = event.prompt_tokens;
            completionTokens = event.completion_tokens;
          }
        }
      };

      try {
        await pumpStream(route.provider, route.model);
      } catch (primaryErr) {
        // A fallback model the key isn't allowed to use is failed, not served.
        const fallbackRoute = getFallbackRoute();
        const fallback = fallbackRoute && (!request.allowedModels || request.allowedModels.includes(fallbackRoute.model))
          ? fallbackRoute
          : null;
        if (fallback) {
          try {
            fullContent = '';
            promptTokens = 0;
            completionTokens = 0;
            usedProvider = fallback.provider;
            usedModel = fallback.model;
            fastify.log.warn({ primaryErr }, 'Primary stream failed, trying fallback');
            await pumpStream(fallback.provider, fallback.model);
          } catch (fallbackErr) {
            streamFailed = true;
            reply.raw.write(`data: ${JSON.stringify({ error: { message: (fallbackErr as Error).message, type: 'api_error', param: null, code: null } })}\n\n`);
          }
        } else {
          streamFailed = true;
          reply.raw.write(`data: ${JSON.stringify({ error: { message: (primaryErr as Error).message, type: 'api_error', param: null, code: null } })}\n\n`);
        }
      }

      if (!streamFailed) {
        reply.raw.write(chunk({}, 'stop', usedModel));
        if (body.stream_options?.include_usage) {
          reply.raw.write(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created, model: usedModel, choices: [], usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens } })}\n\n`);
        }
      }
      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();

      if (streamFailed) {
        flushSpans(spans, request.tenantId, requestId);
        return;
      }

      const latencyMs = Date.now() - start;
      persistRequest(usedProvider, usedModel, fullContent, promptTokens, completionTokens,
        estimateCost(usedModel, promptTokens, completionTokens), latencyMs, usedModel !== route.model);
      flushSpans(spans, request.tenantId, requestId);
      return;
    }

    // ── Non-streaming ───────────────────────────────────────────────────
    const llmSpan = startSpan(traceId, 'llm.completion', {
      parentId: guardrailSpan.id,
      attributes: { provider: route.provider, model: route.model },
    });

    const start = Date.now();
    let llmResult;
    let usedProvider: ExtendedProvider = route.provider;
    let usedModel = route.model;
    let fallbackUsed = false;

    try {
      try {
        llmResult = await callLLM(route.provider, route.model, safeMessages);
      } catch (primaryErr) {
        const fallback = getFallbackRoute();
        if (!fallback) throw primaryErr;
        // A fallback model the key isn't allowed to use is failed, not served.
        if (request.allowedModels && !request.allowedModels.includes(fallback.model)) throw primaryErr;
        fastify.log.warn({ primaryErr }, 'Primary LLM failed, trying fallback');
        llmResult = await callLLM(fallback.provider, fallback.model, safeMessages);
        usedProvider = fallback.provider;
        usedModel = fallback.model;
        fallbackUsed = true;
      }
    } catch (err) {
      endSpan(llmSpan, 'error', (err as Error).message);
      spans.push(llmSpan);
      flushSpans(spans, request.tenantId);
      return oaiError(reply, 502, (err as Error).message, 'api_error');
    }

    const latencyMs = Date.now() - start;
    endSpan(llmSpan, 'ok');
    spans.push(llmSpan);

    const costUsd = estimateCost(usedModel, llmResult.prompt_tokens, llmResult.completion_tokens);
    persistRequest(usedProvider, usedModel, llmResult.content, llmResult.prompt_tokens, llmResult.completion_tokens, costUsd, latencyMs, fallbackUsed);
    flushSpans(spans, request.tenantId, requestId);

    return reply.send({
      id: completionId,
      object: 'chat.completion',
      created,
      model: usedModel,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: llmResult.content },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: llmResult.prompt_tokens,
        completion_tokens: llmResult.completion_tokens,
        total_tokens: llmResult.total_tokens,
      },
    });
  });
};

export default openaiCompatRoute;
