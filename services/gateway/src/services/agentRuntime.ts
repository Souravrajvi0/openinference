import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { config } from '../config';
import { estimateCost } from './llm';
import { getProviderApiKey } from './providerKeys';
import { mcpAuthHeaders } from './mcpAuth';
import { query } from '../db/client';
import { searchDocuments } from './retrieval';
import type { AgentStep } from '@sentinelai/shared';

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'retrieve_documents',
      description: 'Search indexed company documents for relevant information. Use this when the user asks about internal knowledge, policies, or any topic that might be in the document store.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: 'Evaluate a simple mathematical expression. Input must be a safe JS math expression.',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'e.g. "2 * (3 + 4)" or "Math.sqrt(144)"' },
        },
        required: ['expression'],
      },
    },
  },
];

// ── Tool executors ────────────────────────────────────────────────────────────

async function executeRetrieve(
  args: { query: string; top_k?: number | string },
  tenantId: string,
): Promise<string> {
  try {
    const topK = parseInt(String(args.top_k ?? 3));
    const hits = await searchDocuments(tenantId, args.query, { top_k: topK, hybrid: true });
    if (hits.length === 0) return 'No relevant documents found.';

    return hits
      .map((h, i) => `[${i + 1}] (${h.citation.document_title ?? 'Untitled'}, score: ${h.citation.score.toFixed(3)})\n${h.content}`)
      .join('\n\n');
  } catch {
    return 'Document retrieval unavailable.';
  }
}

function executeCalculate(args: { expression: string }): string {
  const safe = /^[\d\s\+\-\*\/%\(\)\.]+$/.test(args.expression.replace(/Math\.(sqrt|pow|abs|ceil|floor|round|min|max|log|PI)\b/g, '0'));
  if (!safe) return 'Invalid expression — only basic math operators and Math.* functions allowed.';
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${args.expression})`)();
    return String(result);
  } catch {
    return 'Could not evaluate expression.';
  }
}

// ── MCP server type ───────────────────────────────────────────────────────────

type McpServer = {
  id: string;
  name: string;
  url: string;
  auth_type: string;
  auth_header: string | null;
  auth_value: string | null;
};

type McpPolicy = { tool_pattern: string; action: string; rate_limit: number | null };

function mcpToolName(serverName: string): string {
  return `mcp__${serverName.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

async function executeMcpTool(
  server: McpServer,
  toolName: string,
  toolInput: Record<string, unknown>,
  tenantId: string,
  agentId: string | undefined,
): Promise<string> {
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
        params: { name: toolName, arguments: toolInput },
        id: 1,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const json = await res.json() as { result?: { content?: { text?: string }[] }; error?: { message?: string } };
    if (json.error) {
      callStatus = 'error';
      errorMsg = json.error.message ?? 'MCP server error';
    } else {
      output = json.result?.content?.map((c) => c.text ?? '').join('\n') ?? JSON.stringify(json.result);
    }
  } catch (err) {
    callStatus = 'error';
    errorMsg = (err as Error).message;
  }

  query(
    `INSERT INTO mcp_call_logs (tenant_id, server_id, agent_id, tool_name, input, output, status, latency_ms, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [tenantId, server.id, agentId ?? null, toolName, JSON.stringify(toolInput), output, callStatus, Date.now() - start, errorMsg]
  ).catch(() => {});

  if (callStatus === 'error') throw new Error(errorMsg ?? 'MCP call failed');
  return output ?? '';
}

// ── Approval helpers ──────────────────────────────────────────────────────────

type ApprovalPolicy = { tool_pattern: string; require_approval: boolean };

function matchesPattern(toolName: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) return toolName.startsWith(pattern.slice(0, -2));
  if (pattern.endsWith('_*')) return toolName.startsWith(pattern.slice(0, -1));
  return toolName === pattern;
}

// ── Agent runtime ─────────────────────────────────────────────────────────────

export interface AgentRunOptions {
  goal: string;
  model: string;
  maxSteps: number;
  tenantId: string;
  onStep?: (step: AgentStep) => void;
  systemPrompt?: string;
  allowedTools?: string[];
  agentId?: string;
  traceId?: string;
}

export interface AgentRunResult {
  answer: string;
  steps: AgentStep[];
  total_tokens: number;
  total_cost_usd: number;
  approval_required?: boolean;
  approval_id?: string;
  approval_tool?: string;
}

export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const groq = new OpenAI({
    apiKey: (await getProviderApiKey('groq')) ?? undefined,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const steps: AgentStep[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  const baseTools = opts.allowedTools && opts.allowedTools.length > 0
    ? TOOLS.filter((t) => opts.allowedTools!.includes(t.function.name))
    : TOOLS;

  // Load active MCP servers and build tool definitions for each (fail open)
  const mcpServers: McpServer[] = [];
  const mcpPoliciesByServer = new Map<string, McpPolicy[]>();
  try {
    const serverResult = await query<McpServer>(
      `SELECT id, name, url, auth_type, auth_header, auth_value
       FROM mcp_servers WHERE tenant_id = $1 AND is_active = TRUE`,
      [opts.tenantId]
    );
    for (const srv of serverResult.rows) {
      mcpServers.push(srv);
      const polResult = await query<McpPolicy>(
        `SELECT tool_pattern, action, rate_limit FROM mcp_policies WHERE server_id = $1 AND tenant_id = $2`,
        [srv.id, opts.tenantId]
      );
      mcpPoliciesByServer.set(srv.id, polResult.rows);
    }
  } catch { /* no MCP servers */ }

  const mcpTools: OpenAI.ChatCompletionTool[] = mcpServers.map((srv) => ({
    type: 'function' as const,
    function: {
      name: mcpToolName(srv.name),
      description: `Call a tool on the "${srv.name}" MCP server. Provide the tool_name and its arguments.`,
      parameters: {
        type: 'object',
        properties: {
          tool_name: { type: 'string', description: 'The tool to invoke on this MCP server' },
          arguments:  { type: 'object', description: 'Input arguments for the tool', additionalProperties: true },
        },
        required: ['tool_name'],
      },
    },
  }));

  const activeTools = [...baseTools, ...mcpTools];

  // Load approval policies once before the loop (fail open on DB error)
  let approvalPolicies: ApprovalPolicy[] = [];
  try {
    const polResult = await query<ApprovalPolicy>(
      `SELECT tool_pattern, require_approval FROM approval_policies WHERE tenant_id = $1`,
      [opts.tenantId]
    );
    approvalPolicies = polResult.rows;
  } catch { /* no policies */ }

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: opts.systemPrompt ??
        'You are a helpful AI agent. Use the available tools when needed to answer the user\'s question accurately. Think step by step.',
    },
    { role: 'user', content: opts.goal },
  ];

  for (let step = 0; step < opts.maxSteps; step++) {
    const start = Date.now();

    const response = await groq.chat.completions.create({
      model: opts.model,
      messages,
      tools: activeTools.length > 0 ? activeTools : undefined,
      tool_choice: activeTools.length > 0 ? 'auto' : undefined,
    });

    const msg = response.choices[0]?.message;
    if (!msg) break;

    totalPromptTokens += response.usage?.prompt_tokens ?? 0;
    totalCompletionTokens += response.usage?.completion_tokens ?? 0;
    messages.push(msg);

    // ── Tool call ──────────────────────────────────────────────────────────
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const call of msg.tool_calls) {
        const args = JSON.parse(call.function.arguments ?? '{}');
        const toolStart = Date.now();

        // ── Approval check ──────────────────────────────────────────────────
        const policy = approvalPolicies.find((p) => matchesPattern(call.function.name, p.tool_pattern));
        if (policy?.require_approval) {
          const approvalId = randomUUID();
          const traceId = opts.traceId ?? randomUUID();

          const approvalStep: AgentStep = {
            step,
            type: 'tool_call',
            content: `Tool "${call.function.name}" requires human approval before execution`,
            tool_name: call.function.name,
            tool_input: args,
            latency_ms: Date.now() - toolStart,
          };
          steps.push(approvalStep);
          opts.onStep?.(approvalStep);

          // Write the pending approval row (best-effort)
          await query(
            `INSERT INTO agent_approvals
               (id, tenant_id, agent_id, trace_id, step_index, tool_name, tool_input, goal)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [approvalId, opts.tenantId, opts.agentId ?? null, traceId, step,
             call.function.name, JSON.stringify(args), opts.goal.slice(0, 2000)]
          ).catch(() => {});

          const costUsd = estimateCost(opts.model, totalPromptTokens, totalCompletionTokens);
          return {
            answer: `Agent paused — tool "${call.function.name}" requires approval (ID: ${approvalId}). Approve or reject in the Approvals inbox.`,
            steps,
            total_tokens: totalPromptTokens + totalCompletionTokens,
            total_cost_usd: costUsd,
            approval_required: true,
            approval_id: approvalId,
            approval_tool: call.function.name,
          };
        }

        const toolCallStep: AgentStep = {
          step,
          type: 'tool_call',
          content: `Calling ${call.function.name}`,
          tool_name: call.function.name,
          tool_input: args,
        };
        steps.push(toolCallStep);
        opts.onStep?.(toolCallStep);

        let toolResult: string;
        if (call.function.name === 'retrieve_documents') {
          toolResult = await executeRetrieve(args, opts.tenantId);
        } else if (call.function.name === 'calculate') {
          toolResult = executeCalculate(args);
        } else if (call.function.name.startsWith('mcp__')) {
          const srv = mcpServers.find((s) => mcpToolName(s.name) === call.function.name);
          if (!srv) {
            toolResult = `MCP server not found for tool: ${call.function.name}`;
          } else {
            // Evaluate policies for this server (last matching rule wins)
            const policies = mcpPoliciesByServer.get(srv.id) ?? [];
            const toolNameArg = String(args.tool_name ?? '');
            let allowed = true;
            for (const pol of policies) {
              if (matchesPattern(toolNameArg, pol.tool_pattern)) {
                allowed = pol.action !== 'block';
              }
            }
            if (!allowed) {
              toolResult = `Tool "${toolNameArg}" is blocked by MCP policy on server "${srv.name}".`;
            } else {
              try {
                toolResult = await executeMcpTool(
                  srv,
                  toolNameArg,
                  (args.arguments as Record<string, unknown>) ?? {},
                  opts.tenantId,
                  opts.agentId,
                );
              } catch (err) {
                toolResult = `MCP call failed: ${(err as Error).message}`;
              }
            }
          }
        } else {
          toolResult = `Unknown tool: ${call.function.name}`;
        }

        const toolResultStep: AgentStep = {
          step,
          type: 'tool_result',
          content: toolResult,
          tool_name: call.function.name,
          tool_output: toolResult,
          latency_ms: Date.now() - toolStart,
        };
        steps.push(toolResultStep);
        opts.onStep?.(toolResultStep);

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: toolResult,
        });
      }
      continue;
    }

    // ── Final answer ───────────────────────────────────────────────────────
    const answer = msg.content ?? '';
    const answerStep: AgentStep = { step, type: 'answer', content: answer, latency_ms: Date.now() - start };
    steps.push(answerStep);
    opts.onStep?.(answerStep);

    const costUsd = estimateCost(opts.model, totalPromptTokens, totalCompletionTokens);
    return { answer, steps, total_tokens: totalPromptTokens + totalCompletionTokens, total_cost_usd: costUsd };
  }

  const costUsd = estimateCost(opts.model, totalPromptTokens, totalCompletionTokens);
  return {
    answer: 'Agent reached maximum steps without a final answer.',
    steps,
    total_tokens: totalPromptTokens + totalCompletionTokens,
    total_cost_usd: costUsd,
  };
}
