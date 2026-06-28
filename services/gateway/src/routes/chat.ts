import { randomUUID } from 'crypto';
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Queue } from 'bullmq';
import { requireScope } from '../plugins/auth';
import { checkGuardrails } from '../services/guardrails';
import { bullmqConnection } from '../services/queueConnection';
import { routeRequest, getAbRoute, getFallbackRoute, estimateTokens } from '../services/router';
import { callLLM, streamLLM, estimateCost } from '../services/llm';
import { planAllowsModel, tierForModel } from '../services/plans';
import { startSpan, endSpan, flushSpans } from '../services/tracer';
import { query } from '../db/client';
import { searchDocuments } from '../services/retrieval';
import { checkSemanticCache, storeInSemanticCache } from '../services/semanticCache';
import { checkSpendLimits } from '../services/budget';
import { writeAudit } from '../services/audit';
import { loadSession, saveSession } from '../services/conversationMemory';
import { QUEUES, type EvalJobData, type Citation } from '@sentinelai/shared';
import { config } from '../config';
import {
  llmRequestsTotal,
  llmLatencySeconds,
  llmTokensTotal,
  llmCostUsdTotal,
  guardrailsTriggeredTotal,
} from '../services/metricsRegistry';

const PROVIDERS = ['openai', 'anthropic', 'groq', 'mistral', 'cerebras', 'gemini', 'ollama'] as const;

const bodySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string().min(1),
  })).min(1),
  model: z.string().optional(),
  provider: z.enum(PROVIDERS).optional(),
  stream: z.boolean().optional().default(false),
  session_id: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
  rag: z.object({
    enabled: z.boolean(),
    top_k: z.number().int().min(1).max(20).optional(),
  }).optional(),
});

const chatRoute: FastifyPluginAsync = async (_fastify) => {
  const evalQueue = new Queue(QUEUES.EVAL, { connection: bullmqConnection() });

  _fastify.post('/chat', async (request, reply) => {
    requireScope(request, 'chat');

    const body = bodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const { messages, model, provider, stream, session_id, metadata, rag } = body.data;
    const traceId = randomUUID();
    const requestId = randomUUID();
    const spans = [];

    // ── 1. Guardrails ─────────────────────────────────────────────────────
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
           (id, tenant_id, api_key_id, trace_id, session_id, mode, status,
            guardrail_triggered, guardrail_action, guardrail_reasons, routed_provider, routed_model)
         VALUES ($1,$2,$3,$4,$5,'chat','filtered',TRUE,$6,$7,$8,$9)`,
        [requestId, request.tenantId, request.apiKeyId, traceId, session_id ?? null,
         guardrailResult.action, guardrailResult.reasons,
         config.DEFAULT_PROVIDER, config.DEFAULT_MODEL]
      );
      flushSpans(spans, request.tenantId, requestId);
      writeAudit({ tenant_id: request.tenantId, actor_type: 'api_key', actor_id: request.apiKeyId, action: 'request.filtered', resource_id: requestId, details: { reasons: guardrailResult.reasons } });
      return reply.status(400).send({ error: 'Request blocked by content policy', reasons: guardrailResult.reasons, trace_id: traceId });
    }

    const safeMessages = guardrailResult.sanitized_messages ?? messages;

    // ── 1b. Budget check (tenant + API key) ───────────────────────────────
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

    // ── 1c. Semantic cache check (non-streaming, non-RAG, no session) ────────
    const userQuery = safeMessages[safeMessages.length - 1]?.content ?? '';
    if (!rag?.enabled && !stream && !session_id) {
      const cacheHit = await checkSemanticCache(request.tenantId, userQuery);
      if (cacheHit) {
        writeAudit({ tenant_id: request.tenantId, actor_type: 'api_key', actor_id: request.apiKeyId, action: 'cache.hit', resource_id: cacheHit.cache_id });
        return reply.send({
          id: requestId, trace_id: traceId, content: cacheHit.response_text,
          model: cacheHit.model, provider: cacheHit.provider,
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
          latency_ms: 0, cached: true,
        });
      }
    }

    // ── 2. Model routing ──────────────────────────────────────────────────
    const routeSpan = startSpan(traceId, 'gateway.routing', { parentId: guardrailSpan.id });
    let routeDecision = routeRequest({
      requested_provider: provider,
      requested_model: model,
      estimated_tokens: estimateTokens(safeMessages.map((m) => m.content).join(' ')),
    });

    // A/B experiment override (only when caller didn't pin a provider)
    if (!provider && !model) {
      const abRoute = await getAbRoute(request.tenantId);
      if (abRoute) routeDecision = abRoute;
    }

    endSpan(routeSpan, 'ok');
    spans.push(routeSpan);

    // ── 2a. Plan tier gating ──────────────────────────────────────────────
    // The tenant's plan governs which model tiers its keys may reach.
    if (!planAllowsModel(request.plan, routeDecision.model)) {
      // No llm_requests row exists for a gated request, so omit requestId
      // (spans record with a null request_id rather than violating the FK).
      flushSpans(spans, request.tenantId);
      return reply.status(403).send({
        error: `Your plan (${request.plan}) cannot access model ${routeDecision.model} (tier: ${tierForModel(routeDecision.model)})`,
        trace_id: traceId,
      });
    }

    // ── 2b. Session memory + context guard ────────────────────────────────
    let sessionData: Awaited<ReturnType<typeof loadSession>> | null = null;
    let activeMessages = safeMessages;

    if (session_id) {
      const memSpan = startSpan(traceId, 'gateway.session_memory', { parentId: routeSpan.id });
      try {
        const newUserMsg = safeMessages[safeMessages.length - 1]!;
        sessionData = await loadSession(request.tenantId, session_id, newUserMsg, routeDecision.model);
        activeMessages = sessionData.llmMessages;
        endSpan(memSpan, 'ok', sessionData.was_summarized ? 'context_compressed' : undefined);
      } catch (err) {
        endSpan(memSpan, 'error', (err as Error).message);
        _fastify.log.warn({ err }, 'Session load failed, falling back to stateless');
      }
      spans.push(memSpan);
    }

    // ── 2c. RAG context retrieval ─────────────────────────────────────────
    let contextMessages = activeMessages as typeof activeMessages;
    let retrievedChunks: Citation[] = [];

    if (rag?.enabled) {
      const userQuery = activeMessages[activeMessages.length - 1]?.content ?? '';
      const ragSpan = startSpan(traceId, 'retrieval.search', { parentId: routeSpan.id });
      try {
        if (config.MISTRAL_API_KEY) {
          const hits = await searchDocuments(request.tenantId, userQuery, {
            top_k: rag.top_k ?? 5,
            hybrid: true,
          });
          retrievedChunks = hits.map((h) => h.citation);
        }
        endSpan(ragSpan, 'ok');
      } catch (err) {
        endSpan(ragSpan, 'error', (err as Error).message);
        _fastify.log.warn({ err }, 'RAG retrieval failed, continuing without context');
      }
      spans.push(ragSpan);

      if (retrievedChunks.length > 0) {
        const context = retrievedChunks
          .map((c, i) => `[${i + 1}] (${c.document_title ?? 'Untitled'}, score: ${c.score.toFixed(3)})\n${c.content_preview}`)
          .join('\n\n');
        contextMessages = [
          { role: 'system', content: `Answer using the following retrieved context:\n\n${context}` },
          ...safeMessages,
        ];
      }
    }

    // ── 3a. Streaming path ────────────────────────────────────────────────
    if (stream) {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Trace-Id': traceId,
      });

      const start = Date.now();
      let fullContent = '';
      let promptTokens = 0;
      let completionTokens = 0;
      let usedProvider = routeDecision.provider;
      let usedModel = routeDecision.model;
      let streamFailed = false;

      const pumpStream = async (provider: typeof routeDecision.provider, model: string) => {
        for await (const event of streamLLM(provider, model, contextMessages)) {
          if (event.type === 'delta') {
            fullContent += event.content;
            reply.raw.write(`data: ${JSON.stringify({ content: event.content, trace_id: traceId })}\n\n`);
          } else {
            promptTokens = event.prompt_tokens;
            completionTokens = event.completion_tokens;
          }
        }
      };

      try {
        await pumpStream(routeDecision.provider, routeDecision.model);
      } catch (primaryErr) {
        const fallback = getFallbackRoute();
        if (fallback) {
          try {
            fullContent = '';
            promptTokens = 0;
            completionTokens = 0;
            usedProvider = fallback.provider;
            usedModel = fallback.model;
            _fastify.log.warn({ primaryErr }, 'Primary stream failed, trying fallback');
            await pumpStream(fallback.provider, fallback.model);
          } catch (fallbackErr) {
            streamFailed = true;
            reply.raw.write(`data: ${JSON.stringify({ error: (fallbackErr as Error).message, trace_id: traceId })}\n\n`);
          }
        } else {
          streamFailed = true;
          reply.raw.write(`data: ${JSON.stringify({ error: (primaryErr as Error).message, trace_id: traceId })}\n\n`);
        }
      }

      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();

      if (streamFailed) {
        flushSpans(spans, request.tenantId, requestId);
        return;
      }

      const latencyMs = Date.now() - start;
      const costUsd = estimateCost(usedModel, promptTokens, completionTokens);
      const streamMode = rag?.enabled ? 'rag' : 'chat';

      // Emit metrics
      llmRequestsTotal.inc({ provider: usedProvider, model: usedModel, status: 'success' });
      llmLatencySeconds.observe({ provider: usedProvider, model: usedModel }, latencyMs / 1000);
      llmTokensTotal.inc({ provider: usedProvider, model: usedModel, type: 'prompt' }, promptTokens);
      llmTokensTotal.inc({ provider: usedProvider, model: usedModel, type: 'completion' }, completionTokens);
      llmCostUsdTotal.inc({ provider: usedProvider, model: usedModel }, costUsd);

      // Persist async
      query(
        `INSERT INTO llm_requests
           (id, tenant_id, api_key_id, trace_id, session_id, mode, status,
            prompt_preview, response_preview, routed_provider, routed_model,
            prompt_tokens, completion_tokens, total_tokens, cost_usd, latency_ms, http_status, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,'success',$7,$8,$9,$10,$11,$12,$13,$14,$15,200,$16)`,
        [requestId, request.tenantId, request.apiKeyId, traceId, session_id ?? null,
         streamMode,
         safeMessages[safeMessages.length - 1]?.content.slice(0, 500), fullContent.slice(0, 500),
         usedProvider, usedModel,
         promptTokens, completionTokens, promptTokens + completionTokens,
         costUsd, latencyMs, JSON.stringify(metadata ?? {})]
      ).catch(() => {});

      evalQueue.add('eval', {
        request_id: requestId,
        tenant_id: request.tenantId,
        prompt: activeMessages[activeMessages.length - 1]?.content ?? '',
        response: fullContent,
        retrieved_chunks: retrievedChunks.length > 0 ? retrievedChunks : undefined,
        mode: rag?.enabled ? 'rag' : 'chat',
      } as EvalJobData, { removeOnComplete: 100, removeOnFail: 50 }).catch(() => {});

      if (session_id && sessionData) {
        saveSession(request.tenantId, session_id, sessionData.freshMessages, fullContent, sessionData.summary).catch(() => {});
      }

      flushSpans(spans, request.tenantId, requestId);
      return;
    }

    // ── 3b. Non-streaming path ─────────────────────────────────────────────
    const llmSpan = startSpan(traceId, 'llm.completion', {
      parentId: routeSpan.id,
      attributes: { provider: routeDecision.provider, model: routeDecision.model },
    });

    const start = Date.now();
    let llmResult;
    let usedRoute = routeDecision;
    let fallbackUsed = false;

    try {
      llmResult = await callLLM(routeDecision.provider, routeDecision.model, contextMessages);
    } catch (primaryErr) {
      const fallback = getFallbackRoute();
      if (!fallback) throw primaryErr;
      _fastify.log.warn({ primaryErr }, 'Primary LLM failed, trying fallback');
      llmResult = await callLLM(fallback.provider, fallback.model, contextMessages);
      usedRoute = fallback;
      fallbackUsed = true;
    }

    const latencyMs = Date.now() - start;
    endSpan(llmSpan, 'ok');
    spans.push(llmSpan);

    const costUsd = estimateCost(usedRoute.model, llmResult.prompt_tokens, llmResult.completion_tokens);
    const requestMode = rag?.enabled ? 'rag' : 'chat';

    // Emit metrics
    llmRequestsTotal.inc({ provider: usedRoute.provider, model: usedRoute.model, status: 'success' });
    llmLatencySeconds.observe({ provider: usedRoute.provider, model: usedRoute.model }, latencyMs / 1000);
    llmTokensTotal.inc({ provider: usedRoute.provider, model: usedRoute.model, type: 'prompt' }, llmResult.prompt_tokens);
    llmTokensTotal.inc({ provider: usedRoute.provider, model: usedRoute.model, type: 'completion' }, llmResult.completion_tokens);
    llmCostUsdTotal.inc({ provider: usedRoute.provider, model: usedRoute.model }, costUsd);

    await query(
      `INSERT INTO llm_requests
         (id, tenant_id, api_key_id, trace_id, session_id, mode, status,
          prompt_preview, response_preview, requested_model, routed_provider,
          routed_model, fallback_used, prompt_tokens, completion_tokens,
          total_tokens, cost_usd, latency_ms, ttfb_ms,
          guardrail_triggered, guardrail_action, guardrail_reasons, http_status, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,'success',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,200,$21)`,
      [requestId, request.tenantId, request.apiKeyId, traceId, session_id ?? null, requestMode,
       safeMessages[safeMessages.length - 1]?.content.slice(0, 500), llmResult.content.slice(0, 500),
       model ?? null, usedRoute.provider, usedRoute.model, fallbackUsed,
       llmResult.prompt_tokens, llmResult.completion_tokens, llmResult.total_tokens,
       costUsd, latencyMs, llmResult.ttfb_ms ?? null,
       guardrailResult.reasons.length > 0, guardrailResult.action ?? null, guardrailResult.reasons,
       JSON.stringify(metadata ?? {})]
    );

    flushSpans(spans, request.tenantId, requestId);

    evalQueue.add('eval', {
      request_id: requestId, tenant_id: request.tenantId,
      prompt: activeMessages[activeMessages.length - 1]?.content ?? '',
      response: llmResult.content,
      retrieved_chunks: retrievedChunks.length > 0 ? retrievedChunks : undefined,
      mode: rag?.enabled ? 'rag' : 'chat',
    } as EvalJobData, { removeOnComplete: 100, removeOnFail: 50 }).catch(() => {});

    writeAudit({ tenant_id: request.tenantId, actor_type: 'api_key', actor_id: request.apiKeyId, action: 'request.created', resource_id: requestId, details: { provider: usedRoute.provider, model: usedRoute.model, cost_usd: costUsd, ab_variant: routeDecision.ab_variant } });

    // Persist session memory (async)
    if (session_id && sessionData) {
      saveSession(request.tenantId, session_id, sessionData.freshMessages, llmResult.content, sessionData.summary).catch(() => {});
    }

    // Store in semantic cache (non-RAG, no session, async)
    if (!rag?.enabled && !session_id) {
      storeInSemanticCache(request.tenantId, userQuery, llmResult.content, usedRoute.model, usedRoute.provider).catch(() => {});
    }

    return reply.send({
      id: requestId, trace_id: traceId, content: llmResult.content,
      model: usedRoute.model, provider: usedRoute.provider,
      usage: { prompt_tokens: llmResult.prompt_tokens, completion_tokens: llmResult.completion_tokens, total_tokens: llmResult.total_tokens, cost_usd: costUsd },
      latency_ms: latencyMs,
      ...(session_id ? { session_id, session_turn: (sessionData?.turn_count ?? 0) + 1, context_compressed: sessionData?.was_summarized ?? false } : {}),
      ...(routeDecision.ab_variant ? { ab_variant: routeDecision.ab_variant, ab_experiment_id: routeDecision.ab_experiment_id } : {}),
    });
  });
};

export default chatRoute;
