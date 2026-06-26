import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireScope } from '../plugins/auth';
import { query } from '../db/client';
import { writeAudit } from '../services/audit';
import { callLLM } from '../services/llm';
import { config } from '../config';
import type { Message } from '@sentinelai/shared';

// ── Assertion types ───────────────────────────────────────────────────────────

type AssertionDef =
  | { type: 'contains';     value: string }
  | { type: 'not_contains'; value: string }
  | { type: 'regex';        pattern: string; flags?: string }
  | { type: 'llm_judge';    prompt: string; model?: string; provider?: string };

type AssertionResult = {
  type: string;
  passed: boolean;
  detail?: string;
};

async function runAssertions(output: string, assertions: AssertionDef[]): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];

  for (const a of assertions) {
    if (a.type === 'contains') {
      results.push({
        type: 'contains',
        passed: output.toLowerCase().includes(a.value.toLowerCase()),
        detail: `Expected output to contain: "${a.value}"`,
      });
    } else if (a.type === 'not_contains') {
      results.push({
        type: 'not_contains',
        passed: !output.toLowerCase().includes(a.value.toLowerCase()),
        detail: `Expected output NOT to contain: "${a.value}"`,
      });
    } else if (a.type === 'regex') {
      try {
        const re = new RegExp(a.pattern, a.flags ?? '');
        results.push({
          type: 'regex',
          passed: re.test(output),
          detail: `Expected output to match regex: /${a.pattern}/${a.flags ?? ''}`,
        });
      } catch (err) {
        results.push({ type: 'regex', passed: false, detail: `Invalid regex: ${(err as Error).message}` });
      }
    } else if (a.type === 'llm_judge') {
      try {
        const judgeMessages: Message[] = [
          { role: 'user', content: `${a.prompt}\n\nOutput to evaluate:\n${output}\n\nAnswer ONLY "yes" or "no".` },
        ];
        const judgeResult = await callLLM(
          (a.provider as Parameters<typeof callLLM>[0]) ?? config.DEFAULT_PROVIDER,
          a.model ?? config.DEFAULT_MODEL,
          judgeMessages
        );
        const passed = judgeResult.content.trim().toLowerCase().startsWith('yes');
        results.push({ type: 'llm_judge', passed, detail: a.prompt });
      } catch (err) {
        results.push({ type: 'llm_judge', passed: false, detail: `Judge error: ${(err as Error).message}` });
      }
    }
  }

  return results;
}

// ── Route ─────────────────────────────────────────────────────────────────────

const regressionRoute: FastifyPluginAsync = async (fastify) => {
  // ── Suites ────────────────────────────────────────────────────────────────

  fastify.get('/admin/test-suites', async (request, reply) => {
    requireScope(request, 'pro');
    const result = await query(
      `SELECT ts.id, ts.name, ts.description, ts.created_at, ts.updated_at,
              COUNT(tc.id)::int AS case_count,
              (SELECT COUNT(*)::int FROM test_runs tr WHERE tr.suite_id = ts.id) AS run_count
       FROM test_suites ts
       LEFT JOIN test_cases tc ON tc.suite_id = ts.id
       WHERE ts.tenant_id = $1
       GROUP BY ts.id
       ORDER BY ts.created_at DESC`,
      [request.tenantId]
    );
    return reply.send({ data: result.rows });
  });

  fastify.post('/admin/test-suites', async (request, reply) => {
    requireScope(request, 'pro');
    const schema = z.object({
      name:        z.string().min(1).max(255),
      description: z.string().max(2000).optional(),
    });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const result = await query<{ id: string; name: string; description: string | null; created_at: string }>(
      `INSERT INTO test_suites (tenant_id, name, description)
       VALUES ($1,$2,$3) RETURNING id, name, description, created_at`,
      [request.tenantId, body.data.name, body.data.description ?? null]
    );
    writeAudit({ tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.apiKeyId, action: 'test_suite.created', resource_id: result.rows[0]!.id, details: { name: body.data.name } });
    return reply.status(201).send(result.rows[0]);
  });

  fastify.patch<{ Params: { id: string } }>('/admin/test-suites/:id', async (request, reply) => {
    requireScope(request, 'pro');
    const schema = z.object({
      name:        z.string().min(1).max(255).optional(),
      description: z.string().max(2000).optional().nullable(),
    });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const result = await query(
      `UPDATE test_suites
       SET name = COALESCE($3, name),
           description = COALESCE($4, description),
           updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, name, description, updated_at`,
      [request.params.id, request.tenantId, body.data.name ?? null, body.data.description ?? null]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Suite not found' });
    return reply.send(result.rows[0]);
  });

  fastify.delete<{ Params: { id: string } }>('/admin/test-suites/:id', async (request, reply) => {
    requireScope(request, 'pro');
    const result = await query(
      `DELETE FROM test_suites WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [request.params.id, request.tenantId]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Suite not found' });
    return reply.status(204).send();
  });

  // ── Cases ─────────────────────────────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>('/admin/test-suites/:id/cases', async (request, reply) => {
    requireScope(request, 'pro');
    const result = await query(
      `SELECT id, name, input_messages, expected_output, assertions, tags, created_at
       FROM test_cases
       WHERE suite_id = $1 AND tenant_id = $2
       ORDER BY created_at ASC`,
      [request.params.id, request.tenantId]
    );
    return reply.send({ data: result.rows });
  });

  fastify.post<{ Params: { id: string } }>('/admin/test-suites/:id/cases', async (request, reply) => {
    requireScope(request, 'pro');

    // Verify suite belongs to tenant
    const suiteCheck = await query(
      `SELECT id FROM test_suites WHERE id = $1 AND tenant_id = $2`,
      [request.params.id, request.tenantId]
    );
    if (suiteCheck.rows.length === 0) return reply.status(404).send({ error: 'Suite not found' });

    const schema = z.object({
      name:            z.string().min(1).max(255),
      input_messages:  z.array(z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string() })).min(1),
      expected_output: z.string().max(4000).optional().nullable(),
      assertions:      z.array(z.record(z.unknown())).default([]),
      tags:            z.array(z.string()).default([]),
    });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const result = await query(
      `INSERT INTO test_cases (suite_id, tenant_id, name, input_messages, expected_output, assertions, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, name, input_messages, expected_output, assertions, tags, created_at`,
      [
        request.params.id, request.tenantId, body.data.name,
        JSON.stringify(body.data.input_messages),
        body.data.expected_output ?? null,
        JSON.stringify(body.data.assertions),
        body.data.tags,
      ]
    );
    return reply.status(201).send(result.rows[0]);
  });

  fastify.delete<{ Params: { id: string } }>('/admin/test-cases/:id', async (request, reply) => {
    requireScope(request, 'pro');
    const result = await query(
      `DELETE FROM test_cases WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [request.params.id, request.tenantId]
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Case not found' });
    return reply.status(204).send();
  });

  // ── Runs ──────────────────────────────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>('/admin/test-suites/:id/runs', async (request, reply) => {
    requireScope(request, 'pro');
    const result = await query(
      `SELECT id, model, provider, status, total_cases, passed, failed, error_count, started_at, completed_at
       FROM test_runs
       WHERE suite_id = $1 AND tenant_id = $2
       ORDER BY started_at DESC
       LIMIT 50`,
      [request.params.id, request.tenantId]
    );
    return reply.send({ data: result.rows });
  });

  fastify.get<{ Params: { id: string } }>('/admin/test-runs/:id', async (request, reply) => {
    requireScope(request, 'pro');

    const runResult = await query(
      `SELECT tr.id, tr.suite_id, tr.model, tr.provider, tr.status,
              tr.total_cases, tr.passed, tr.failed, tr.error_count,
              tr.started_at, tr.completed_at,
              ts.name AS suite_name
       FROM test_runs tr
       JOIN test_suites ts ON ts.id = tr.suite_id
       WHERE tr.id = $1 AND tr.tenant_id = $2`,
      [request.params.id, request.tenantId]
    );
    if (runResult.rows.length === 0) return reply.status(404).send({ error: 'Run not found' });

    const resultsResult = await query(
      `SELECT trs.id, trs.case_id, trs.status, trs.actual_output, trs.latency_ms,
              trs.assertion_results, trs.error,
              tc.name AS case_name, tc.input_messages, tc.expected_output
       FROM test_results trs
       JOIN test_cases tc ON tc.id = trs.case_id
       WHERE trs.run_id = $1
       ORDER BY trs.created_at ASC`,
      [request.params.id]
    );

    return reply.send({ run: runResult.rows[0], results: resultsResult.rows });
  });

  // POST /admin/test-suites/:id/run — execute suite inline
  fastify.post<{
    Params: { id: string };
    Body: { model?: string; provider?: string };
  }>('/admin/test-suites/:id/run', async (request, reply) => {
    requireScope(request, 'pro');

    const body = z.object({
      model:    z.string().optional(),
      provider: z.string().optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    // Load all cases
    const casesResult = await query<{
      id: string; name: string; input_messages: Message[]; expected_output: string | null; assertions: AssertionDef[];
    }>(
      `SELECT id, name, input_messages, expected_output, assertions
       FROM test_cases WHERE suite_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`,
      [request.params.id, request.tenantId]
    );

    if (casesResult.rows.length === 0) {
      return reply.status(422).send({ error: 'Suite has no test cases' });
    }

    const runModel    = body.data.model    ?? config.DEFAULT_MODEL;
    const runProvider = (body.data.provider ?? config.DEFAULT_PROVIDER) as Parameters<typeof callLLM>[0];

    // Create the run row
    const runInsert = await query<{ id: string }>(
      `INSERT INTO test_runs (suite_id, tenant_id, model, provider, status, total_cases)
       VALUES ($1,$2,$3,$4,'running',$5) RETURNING id`,
      [request.params.id, request.tenantId, runModel, runProvider, casesResult.rows.length]
    );
    const runId = runInsert.rows[0]!.id;

    let passed = 0;
    let failed = 0;
    let errorCount = 0;

    for (const tc of casesResult.rows) {
      const start = Date.now();
      let status: 'passed' | 'failed' | 'error' = 'passed';
      let actualOutput = '';
      let assertionResults: AssertionResult[] = [];
      let errorMsg: string | null = null;

      try {
        const llmResult = await callLLM(runProvider, runModel, tc.input_messages);
        actualOutput = llmResult.content;

        if (tc.assertions && tc.assertions.length > 0) {
          assertionResults = await runAssertions(actualOutput, tc.assertions);
          const allPassed = assertionResults.every((r) => r.passed);
          status = allPassed ? 'passed' : 'failed';
        }
      } catch (err) {
        status = 'error';
        errorMsg = (err as Error).message;
        errorCount++;
      }

      if (status === 'passed') passed++;
      else if (status === 'failed') failed++;

      await query(
        `INSERT INTO test_results (run_id, case_id, tenant_id, status, actual_output, latency_ms, assertion_results, error)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [runId, tc.id, request.tenantId, status, actualOutput, Date.now() - start, JSON.stringify(assertionResults), errorMsg]
      );
    }

    // Finalize run
    const finalRun = await query(
      `UPDATE test_runs
       SET status = 'completed', passed = $2, failed = $3, error_count = $4, completed_at = NOW()
       WHERE id = $1
       RETURNING id, model, provider, status, total_cases, passed, failed, error_count, started_at, completed_at`,
      [runId, passed, failed, errorCount]
    );

    writeAudit({ tenant_id: request.tenantId, actor_type: 'admin', actor_id: request.apiKeyId, action: 'test_run.completed', resource_id: runId, details: { suite_id: request.params.id, passed, failed, error_count: errorCount } });
    return reply.send(finalRun.rows[0]);
  });
};

export default regressionRoute;
