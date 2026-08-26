import fs from 'node:fs';
import path from 'node:path';

import { loadConfig } from '../config';
import { ensureHostOllamaRunning, pingOllama, resolveOllamaUrl } from '../ollama';
import { makeIgnore } from './paths';
import { parseArgs, parseTextToolCall } from './parse';
import { loadProjectConfig, loadSkills, findProjectDir } from './project';
import {
  appendJsonl,
  latestSessionId,
  loadJsonl,
  newSessionId,
  sessionDir,
  summarizeSession,
} from './session';
import { parseTodos } from './todos';
import { executeHarnessTool, HARNESS_TOOLS, HARNESS_TOOL_NAMES } from './tools';
import {
  COMPACT_CHARS,
  COMPACT_KEEP,
  DEFAULT_MAX_STEPS,
  EXPLORE_MAX_STEPS,
  EXPLORE_TOOL_NAMES,
  MAX_STEPS_CAP,
  MINIMAL_TOOL_NAMES,
  MUTATING_TOOLS,
  type HarnessOptions,
  type HarnessResult,
  type HarnessStep,
  type HarnessToolDef,
  type ParsedCall,
  type ToolContext,
} from './types';

type OllamaToolCall = {
  id?: string;
  function: { name: string; arguments?: unknown };
};

type OllamaMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  thinking?: string;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
};

function systemPrompt(workspace: string, planMode: boolean, skills: string, nested: boolean): string {
  const lines = [
    'You are OpenInference, a local coding agent on the user\'s machine.',
    `Workspace: ${path.resolve(workspace)}`,
    '',
    'Use tools. Do not guess file contents. Paths are relative to the workspace.',
    'Prefer glob + read_file + search to explore. Prefer str_replace over write_file for edits.',
    'Use todo_write for multi-step work and keep it current.',
    'Ask with ask_user_question when a choice is blocking.',
    'Use explore for a short read-only survey when the tree is unfamiliar.',
    'When you have enough to answer, reply in plain text with no tool call.',
  ];
  if (nested) {
    lines.push('', 'This is a read-only explore pass. Do not edit files or run shell commands.');
  }
  if (planMode) {
    lines.push(
      '',
      'PLAN MODE is active. Explore and design first. Do not edit files.',
      'When the plan is ready, call exit_plan_mode with a complete markdown plan starting with a # heading.',
    );
  }
  if (skills) {
    lines.push('', 'Project instructions:', skills);
  }
  lines.push(
    '',
    'If native tool calling is unavailable, emit exactly one block:',
    '<tool_call>',
    '{"name": "TOOL_NAME", "arguments": { }}',
    '</tool_call>',
  );
  return lines.join('\n');
}

async function ollamaChat(
  base: string,
  model: string,
  messages: OllamaMessage[],
  tools: HarnessToolDef[],
): Promise<OllamaMessage> {
  const payload: Record<string, unknown> = {
    model,
    messages,
    stream: false,
  };
  if (tools.length > 0) payload.tools = tools;

  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(600_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Chat failed (${res.status}): ${text || res.statusText}`);
  }

  const body = (await res.json()) as { message?: OllamaMessage; error?: string };
  if (body.error) throw new Error(body.error);
  if (!body.message) throw new Error('Empty response from model');
  return body.message;
}

function collectCalls(msg: OllamaMessage): ParsedCall[] {
  const native = msg.tool_calls ?? [];
  if (native.length > 0) {
    return native
      .filter((c) => c.function?.name)
      .map((c) => ({ name: c.function.name, arguments: parseArgs(c.function.arguments) }));
  }
  const parsed = parseTextToolCall(msg.content ?? '');
  return parsed ? [parsed] : [];
}

function looksTinyModel(model: string): boolean {
  return /(:|\/)(135m|360m|0\.5b|1b|1\.5b|1\.1b)\b/i.test(model) || /smollm|tinyllama|tinydolphin/i.test(model);
}

export function tinyModelWarning(model: string): string | null {
  if (!looksTinyModel(model)) return null;
  return `${model} is very small — tool use is unreliable. A 7B+ instruct model (e.g. qwen2.5:7b, llama3.1:8b) works much better.`;
}

export function compactMessages<T extends { role: string; content?: string }>(
  messages: T[],
  limit = COMPACT_CHARS,
  keep = COMPACT_KEEP,
): T[] {
  const size = messages.reduce((n, m) => n + (m.content?.length ?? 0), 0);
  if (size < limit) return messages;
  const keepFrom = Math.max(0, messages.length - 4);
  return messages.map((m, i) => {
    if (m.role !== 'tool' || i >= keepFrom) return m;
    const c = m.content ?? '';
    if (c.length <= keep) return m;
    return { ...m, content: c.slice(0, keep) + '\n… (compacted)' };
  });
}

/**
 * Tool loop — same shape as gateway `runAgent`: model → tool_calls → execute → repeat,
 * until a final answer or max steps. Talks to local Ollama instead of Groq.
 * Plan mode, todos, project config, and an append-only session log.
 */
export async function runHarness(opts: HarnessOptions): Promise<HarnessResult> {
  const cfg = loadConfig();
  const workspace = path.resolve(opts.workspace ?? process.cwd());
  const project = opts.nested ? {} : loadProjectConfig(workspace);
  const projectDir = opts.nested ? workspace : findProjectDir(workspace);
  const model = opts.model ?? project.model ?? cfg?.model;
  const base = resolveOllamaUrl(opts.ollamaUrl);
  const maxSteps = Math.min(Math.max(opts.maxSteps ?? project.maxSteps ?? DEFAULT_MAX_STEPS, 1), MAX_STEPS_CAP);
  const mode = opts.mode ?? project.mode ?? 'standard';

  if (!model) {
    throw new Error('No model configured. Run: oi');
  }

  if (!(await pingOllama(base))) {
    if (opts.remote || base !== 'http://127.0.0.1:11434') {
      throw new Error(`Ollama not reachable at ${base}. Check --ollama-url or OLLAMA_URL.`);
    }
    await ensureHostOllamaRunning(base);
  }

  const live = opts.live ?? {
    planMode: Boolean(opts.plan ?? project.plan),
    todos: [],
    sessionId: newSessionId(),
  };
  if (!live.sessionId) live.sessionId = newSessionId();
  if (opts.plan) live.planMode = true;

  let resumeNote = '';
  if (opts.resume) {
    const id =
      live.sessionId && fs.existsSync(path.join(sessionDir(), `${live.sessionId}.jsonl`))
        ? live.sessionId
        : latestSessionId();
    if (id) {
      live.sessionId = id;
      const events = loadJsonl(path.join(sessionDir(), `${id}.jsonl`));
      resumeNote = summarizeSession(events);
      const lastTodo = [...events].reverse().find((e) => e.type === 'todo');
      if (lastTodo?.todos) live.todos = parseTodos(lastTodo.todos);
    }
  }

  const pool = mode === 'minimal' ? MINIMAL_TOOL_NAMES : HARNESS_TOOL_NAMES;
  const allowed = new Set(opts.allowedTools?.length ? opts.allowedTools.filter((n) => pool.includes(n)) : pool);
  if (live.planMode) allowed.add('exit_plan_mode');
  if (opts.nested) allowed.delete('explore');
  const tools = HARNESS_TOOLS.filter((t) => allowed.has(t.function.name));
  const skills = loadSkills(workspace, projectDir === workspace ? [] : [projectDir]);
  const sessionFile = path.join(sessionDir(), `${live.sessionId}.jsonl`);
  const ignore = makeIgnore(workspace, project.ignore ?? []);

  const log = (event: Record<string, unknown>) => {
    try {
      appendJsonl(sessionFile, event);
    } catch {
      /* session log is best-effort */
    }
  };

  log({
    type: 'start',
    goal: opts.goal,
    model,
    workspace,
    plan_mode: live.planMode,
    mode,
    nested: Boolean(opts.nested),
  });

  const steps: HarnessStep[] = [];
  const userGoal = resumeNote ? `${resumeNote}\n\nNew request:\n${opts.goal}` : opts.goal;
  const messages: OllamaMessage[] = [
    { role: 'system', content: systemPrompt(workspace, live.planMode, skills, Boolean(opts.nested)) },
    { role: 'user', content: userGoal },
  ];

  const emit = (step: HarnessStep) => {
    steps.push(step);
    log({
      type: step.type,
      step: step.step,
      content: step.content,
      tool_name: step.tool_name,
      tool_input: step.tool_input,
      latency_ms: step.latency_ms,
    });
    opts.onStep?.(step);
  };

  const ctx: ToolContext = {
    workspace,
    get planMode() {
      return live.planMode;
    },
    setPlanMode(active) {
      live.planMode = active;
      log({ type: 'plan', active });
    },
    get todos() {
      return live.todos;
    },
    setTodos(todos) {
      live.todos = todos;
      log({ type: 'todo', todos });
    },
    yes: opts.yes,
    onAskUser: opts.onAskUser,
    onPlanReview: opts.onPlanReview,
    ignore,
    runExplore: opts.nested
      ? undefined
      : async (goal: string) => {
          const result = await runHarness({
            goal: `Read-only investigation. ${goal}\nSummarize what you found. Do not edit files.`,
            workspace,
            model,
            ollamaUrl: opts.ollamaUrl,
            remote: opts.remote,
            maxSteps: EXPLORE_MAX_STEPS,
            allowedTools: EXPLORE_TOOL_NAMES,
            yes: true,
            nested: true,
            live: { planMode: false, todos: [], sessionId: `${live.sessionId}-x-${newSessionId().slice(-6)}` },
          });
          const used = result.steps
            .filter((s) => s.type === 'tool_call')
            .map((s) => s.tool_name)
            .filter(Boolean);
          return `${result.answer}\n\n(explore used: ${used.join(', ') || 'no tools'})`;
        },
  };

  for (let step = 0; step < maxSteps; step++) {
    const start = Date.now();
    messages[0] = { role: 'system', content: systemPrompt(workspace, live.planMode, skills, Boolean(opts.nested)) };
    const packed = compactMessages(messages);
    const msg = await ollamaChat(base, model, packed, tools);
    messages.push({
      role: 'assistant',
      content: msg.content ?? '',
      tool_calls: msg.tool_calls,
    });

    const thinking = (msg.thinking ?? '').trim();
    if (thinking) {
      emit({ step, type: 'thought', content: thinking, latency_ms: Date.now() - start });
    }

    const calls = collectCalls(msg).filter((c) => c.name);
    if (calls.length > 0) {
      for (const call of calls) {
        const toolStart = Date.now();

        if (!allowed.has(call.name)) {
          const blocked = `Tool "${call.name}" is not enabled.`;
          emit({
            step,
            type: 'tool_call',
            content: `Blocked ${call.name}`,
            tool_name: call.name,
            tool_input: call.arguments,
            latency_ms: Date.now() - toolStart,
          });
          emit({
            step,
            type: 'tool_result',
            content: blocked,
            tool_name: call.name,
            tool_output: blocked,
            latency_ms: Date.now() - toolStart,
          });
          messages.push({ role: 'tool', tool_name: call.name, content: blocked });
          continue;
        }

        if (MUTATING_TOOLS.has(call.name) && !opts.yes && !ctx.planMode) {
          const ok = opts.onApprove ? await opts.onApprove(call.name, call.arguments) : false;
          if (!ok) {
            const denied = `User declined ${call.name}. Continue without it, or explain what you needed.`;
            emit({
              step,
              type: 'tool_call',
              content: `Skipped ${call.name} (not approved)`,
              tool_name: call.name,
              tool_input: call.arguments,
              latency_ms: Date.now() - toolStart,
            });
            emit({
              step,
              type: 'tool_result',
              content: denied,
              tool_name: call.name,
              tool_output: denied,
              latency_ms: Date.now() - toolStart,
            });
            messages.push({ role: 'tool', tool_name: call.name, content: denied });
            continue;
          }
        }

        emit({
          step,
          type: 'tool_call',
          content: `Calling ${call.name}`,
          tool_name: call.name,
          tool_input: call.arguments,
        });

        const output = await executeHarnessTool(call.name, call.arguments, ctx);

        emit({
          step,
          type: 'tool_result',
          content: output,
          tool_name: call.name,
          tool_output: output,
          latency_ms: Date.now() - toolStart,
        });

        messages.push({ role: 'tool', tool_name: call.name, content: output });
      }
      continue;
    }

    const answer = (msg.content ?? '').trim();
    emit({
      step,
      type: 'answer',
      content: answer,
      latency_ms: Date.now() - start,
    });

    return {
      answer: answer || '(empty response)',
      steps,
      model,
      workspace,
      steps_used: steps.length,
      session_id: live.sessionId!,
      todos: live.todos,
      plan_mode: live.planMode,
    };
  }

  const fallback = 'Agent reached maximum steps without a final answer.';
  emit({ step: maxSteps - 1, type: 'answer', content: fallback });
  return {
    answer: fallback,
    steps,
    model,
    workspace,
    steps_used: steps.length,
    session_id: live.sessionId!,
    todos: live.todos,
    plan_mode: live.planMode,
  };
}
