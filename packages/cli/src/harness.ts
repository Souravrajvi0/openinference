import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { loadConfig } from './config';
import { ensureHostOllamaRunning, pingOllama, resolveOllamaUrl } from './ollama';

/** Same step shape as the gateway agent (`@sentinelai/shared` AgentStep). */
export type HarnessStepType = 'thought' | 'tool_call' | 'tool_result' | 'answer';

export type HarnessStep = {
  step: number;
  type: HarnessStepType;
  content: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_output?: unknown;
  latency_ms?: number;
};

export type HarnessResult = {
  answer: string;
  steps: HarnessStep[];
  model: string;
  workspace: string;
  steps_used: number;
};

export type HarnessToolDef = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string }>;
      required?: string[];
    };
  };
};

export type HarnessOptions = {
  goal: string;
  workspace?: string;
  model?: string;
  ollamaUrl?: string;
  remote?: boolean;
  maxSteps?: number;
  /** Tool names to allow. Default: all built-in tools. */
  allowedTools?: string[];
  /** Skip confirmation for write_file / run_command. */
  yes?: boolean;
  onStep?: (step: HarnessStep) => void;
  /** Return false to block a tool that needs approval. */
  onApprove?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
};

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

export const DEFAULT_MAX_STEPS = 8;
export const MAX_STEPS_CAP = 20;
const READ_LIMIT = 100_000;
const WRITE_LIMIT = 200_000;
const SEARCH_HITS = 40;
const SEARCH_FILE_LIMIT = 1_000_000;
const CMD_OUTPUT_LIMIT = 16_384;
const CMD_TIMEOUT_MS = 30_000;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.ollama', '.openinference']);

const APPROVAL_TOOLS = new Set(['write_file', 'run_command']);

export const HARNESS_TOOLS: HarnessToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List files and folders in a directory (relative to the workspace).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path relative to the workspace (default ".")' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a UTF-8 text file from the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to the workspace' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a UTF-8 text file in the workspace. Parent folders are created as needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to the workspace' },
          content: { type: 'string', description: 'Full file contents to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search',
      description: 'Search workspace files for a regex or literal string. Skips node_modules, .git, and build folders.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex or literal text to find' },
          path: { type: 'string', description: 'Folder to search (default: workspace root)' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a shell command in the workspace directory. Output is truncated. Use for tests, git, builds.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run' },
        },
        required: ['command'],
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

export const HARNESS_TOOL_NAMES = HARNESS_TOOLS.map((t) => t.function.name);

/** Resolve a user path inside the workspace. Rejects `..` and absolute escapes. */
export function resolveWorkspacePath(workspace: string, userPath: string): string {
  const root = path.resolve(workspace);
  const raw = (userPath || '.').replace(/\\/g, '/');
  const target = path.resolve(root, raw);
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes workspace: ${userPath}`);
  }
  return target;
}

export function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function asString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

/** Same calculator as the gateway agent. */
export function executeCalculate(expression: string): string {
  const safe = /^[\d\s\+\-\*\/%\(\)\.]+$/.test(
    expression.replace(/Math\.(sqrt|pow|abs|ceil|floor|round|min|max|log|PI)\b/g, '0'),
  );
  if (!safe) return 'Invalid expression — only basic math operators and Math.* functions allowed.';
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${expression})`)();
    return String(result);
  } catch {
    return 'Could not evaluate expression.';
  }
}

type ParsedCall = { name: string; arguments: Record<string, unknown> };

/** Text fallback for models that ignore native Ollama tools (Qwen / Hermes / JSON). */
export function parseTextToolCall(content: string): ParsedCall | null {
  if (!content.trim()) return null;

  const xml = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i.exec(content);
  if (xml?.[1]) {
    const inner = xml[1].trim();
    const json = tryParseToolJson(inner);
    if (json) return json;
    const qwen = parseQwenFunction(inner) ?? parseQwenFunction(content);
    if (qwen) return qwen;
  }

  const fence = /```(?:tool|json)\s*([\s\S]*?)```/i.exec(content);
  if (fence?.[1]) {
    const json = tryParseToolJson(fence[1].trim());
    if (json) return json;
  }

  const qwen = parseQwenFunction(content);
  if (qwen) return qwen;

  const trimmed = content.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return tryParseToolJson(trimmed);
  }

  return null;
}

function tryParseToolJson(raw: string): ParsedCall | null {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (typeof obj.name !== 'string' || !obj.name) return null;
    const args = obj.arguments ?? obj.parameters ?? obj.input;
    return { name: obj.name, arguments: parseArgs(args) };
  } catch {
    return null;
  }
}

function parseQwenFunction(content: string): ParsedCall | null {
  const fn = /<function=([^\s>]+)>([\s\S]*?)<\/function>/i.exec(content);
  if (!fn) return null;
  const args: Record<string, unknown> = {};
  const paramRe = /<parameter=([^\s>]+)>([\s\S]*?)<\/parameter>/gi;
  let m: RegExpExecArray | null;
  while ((m = paramRe.exec(fn[2] ?? ''))) {
    args[m[1]!] = m[2]!.trim();
  }
  return { name: fn[1]!, arguments: args };
}

function listDir(dir: string): string {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  if (entries.length === 0) return '(empty directory)';
  const rows = entries
    .slice(0, 200)
    .map((e) => `${e.isDirectory() ? 'dir ' : 'file'}  ${e.name}`);
  const extra = entries.length > 200 ? `\n… +${entries.length - 200} more` : '';
  return rows.join('\n') + extra;
}

function readWorkspaceFile(file: string): string {
  const st = fs.statSync(file);
  if (st.isDirectory()) return `Not a file: ${file} is a directory. Use list_dir.`;
  if (st.size > READ_LIMIT) {
    const buf = fs.readFileSync(file, { encoding: 'utf8' }).slice(0, READ_LIMIT);
    return buf + `\n\n… truncated (${st.size} bytes). Read a smaller file or a section.`;
  }
  const buf = fs.readFileSync(file);
  if (buf.includes(0)) return 'Binary file — not shown.';
  return buf.toString('utf8');
}

function writeWorkspaceFile(file: string, content: string): string {
  if (content.length > WRITE_LIMIT) {
    return `Content too large (${content.length} chars). Max ${WRITE_LIMIT}.`;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  return `Wrote ${content.length} chars to ${file}`;
}

function searchWorkspace(root: string, start: string, pattern: string): string {
  let re: RegExp;
  try {
    re = new RegExp(pattern, 'i');
  } catch {
    re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const hits: string[] = [];
  const walk = (dir: string) => {
    if (hits.length >= SEARCH_HITS) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (hits.length >= SEARCH_HITS) return;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(path.join(dir, e.name));
        continue;
      }
      if (!e.isFile()) continue;
      const file = path.join(dir, e.name);
      let st: fs.Stats;
      try {
        st = fs.statSync(file);
      } catch {
        continue;
      }
      if (st.size > SEARCH_FILE_LIMIT) continue;
      let text: string;
      try {
        const buf = fs.readFileSync(file);
        if (buf.includes(0)) continue;
        text = buf.toString('utf8');
      } catch {
        continue;
      }
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (hits.length >= SEARCH_HITS) return;
        if (re.test(lines[i]!)) {
          const rel = path.relative(root, file);
          hits.push(`${rel}:${i + 1}: ${lines[i]!.trim().slice(0, 200)}`);
        }
      }
    }
  };

  walk(start);
  if (hits.length === 0) return 'No matches.';
  const more = hits.length >= SEARCH_HITS ? `\n… stopped at ${SEARCH_HITS} hits` : '';
  return hits.join('\n') + more;
}

function runCommand(command: string, cwd: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
    });
    let out = '';
    let err = '';
    let killed = false;
    const take = (chunk: Buffer, which: 'out' | 'err') => {
      const s = chunk.toString('utf8');
      if (which === 'out') out += s;
      else err += s;
      if (out.length + err.length > CMD_OUTPUT_LIMIT && !killed) {
        killed = true;
        child.kill('SIGKILL');
      }
    };
    child.stdout?.on('data', (b: Buffer) => take(b, 'out'));
    child.stderr?.on('data', (b: Buffer) => take(b, 'err'));
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, CMD_TIMEOUT_MS);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve(`Failed to run: ${e.message}`);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const body = [out.trim(), err.trim()].filter(Boolean).join('\n') || '(no output)';
      const clipped = body.length > CMD_OUTPUT_LIMIT ? body.slice(0, CMD_OUTPUT_LIMIT) + '\n… truncated' : body;
      const reason = killed ? 'killed (timeout or output limit)' : `exit ${code ?? '?'}`;
      resolve(`${clipped}\n(${reason})`);
    });
  });
}

export async function executeHarnessTool(
  name: string,
  args: Record<string, unknown>,
  workspace: string,
): Promise<string> {
  try {
    switch (name) {
      case 'list_dir': {
        const dir = resolveWorkspacePath(workspace, asString(args, 'path') || '.');
        if (!fs.existsSync(dir)) return `Not found: ${asString(args, 'path') || '.'}`;
        if (!fs.statSync(dir).isDirectory()) return `Not a directory: ${asString(args, 'path')}`;
        return listDir(dir);
      }
      case 'read_file': {
        const file = resolveWorkspacePath(workspace, asString(args, 'path'));
        if (!fs.existsSync(file)) return `Not found: ${asString(args, 'path')}`;
        return readWorkspaceFile(file);
      }
      case 'write_file': {
        const file = resolveWorkspacePath(workspace, asString(args, 'path'));
        return writeWorkspaceFile(file, asString(args, 'content'));
      }
      case 'search': {
        const pattern = asString(args, 'pattern');
        if (!pattern) return 'Missing pattern.';
        const start = resolveWorkspacePath(workspace, asString(args, 'path') || '.');
        if (!fs.existsSync(start)) return `Not found: ${asString(args, 'path') || '.'}`;
        return searchWorkspace(workspace, start, pattern);
      }
      case 'run_command': {
        const cmd = asString(args, 'command').trim();
        if (!cmd) return 'Missing command.';
        return runCommand(cmd, path.resolve(workspace));
      }
      case 'calculate':
        return executeCalculate(asString(args, 'expression'));
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

function systemPrompt(workspace: string): string {
  return [
    'You are OpenInference, a local coding agent on the user\'s machine.',
    `Workspace: ${path.resolve(workspace)}`,
    '',
    'Use tools to inspect and change files. Do not guess file contents.',
    'Paths are relative to the workspace. Stay inside it.',
    'Prefer list_dir, read_file, and search before write_file or run_command.',
    'When you have enough to answer, reply in plain text with no tool call.',
    '',
    'If native tool calling is unavailable, emit exactly one block:',
    '<tool_call>',
    '{"name": "TOOL_NAME", "arguments": { }}',
    '</tool_call>',
  ].join('\n');
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

/**
 * Tool loop — same shape as gateway `runAgent`: model → tool_calls → execute → repeat,
 * until a final answer or max steps. Talks to local Ollama instead of Groq.
 */
export async function runHarness(opts: HarnessOptions): Promise<HarnessResult> {
  const cfg = loadConfig();
  const model = opts.model ?? cfg?.model;
  const workspace = path.resolve(opts.workspace ?? process.cwd());
  const base = resolveOllamaUrl(opts.ollamaUrl);
  const maxSteps = Math.min(Math.max(opts.maxSteps ?? DEFAULT_MAX_STEPS, 1), MAX_STEPS_CAP);

  if (!model) {
    throw new Error('No model configured. Run: oi');
  }

  if (!(await pingOllama(base))) {
    if (opts.remote || base !== 'http://127.0.0.1:11434') {
      throw new Error(`Ollama not reachable at ${base}. Check --ollama-url or OLLAMA_URL.`);
    }
    await ensureHostOllamaRunning(base);
  }

  const allowed = opts.allowedTools?.length
    ? new Set(opts.allowedTools)
    : new Set(HARNESS_TOOL_NAMES);
  const tools = HARNESS_TOOLS.filter((t) => allowed.has(t.function.name));

  const steps: HarnessStep[] = [];
  const messages: OllamaMessage[] = [
    { role: 'system', content: systemPrompt(workspace) },
    { role: 'user', content: opts.goal },
  ];

  const emit = (step: HarnessStep) => {
    steps.push(step);
    opts.onStep?.(step);
  };

  for (let step = 0; step < maxSteps; step++) {
    const start = Date.now();
    const msg = await ollamaChat(base, model, messages, tools);
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

        if (APPROVAL_TOOLS.has(call.name) && !opts.yes) {
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

        const output = await executeHarnessTool(call.name, call.arguments, workspace);

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
    };
  }

  const fallback = 'Agent reached maximum steps without a final answer.';
  emit({ step: maxSteps - 1, type: 'answer', content: fallback });
  return { answer: fallback, steps, model, workspace, steps_used: steps.length };
}
