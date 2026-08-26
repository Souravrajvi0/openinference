import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { loadConfig, configDir } from './config';
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
  session_id: string;
  todos: TodoItem[];
  plan_mode: boolean;
};

export type JsonSchema = {
  type: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: string[];
};

export type HarnessToolDef = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
  };
};

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export type TodoItem = {
  id: string;
  content: string;
  status: TodoStatus;
};

export type AskUserQuestion = {
  id: string;
  question: string;
  header?: string;
  options?: { label: string; description?: string }[];
};

export type HarnessMode = 'standard' | 'minimal';

export type HarnessLiveState = {
  planMode: boolean;
  todos: TodoItem[];
  sessionId?: string;
};

export type PlanReview = { approved: boolean; feedback?: string };

export type HarnessOptions = {
  goal: string;
  workspace?: string;
  model?: string;
  ollamaUrl?: string;
  remote?: boolean;
  maxSteps?: number;
  /** Tool names to allow. Default: all built-in tools. */
  allowedTools?: string[];
  /** Skip confirmation for mutating tools. */
  yes?: boolean;
  /** DeepSeek-style plan mode: explore, present a plan, wait for approval. */
  plan?: boolean;
  mode?: HarnessMode;
  /** Continue the last append-only session. */
  resume?: boolean;
  /** Shared todos / plan / session across REPL turns. */
  live?: HarnessLiveState;
  onStep?: (step: HarnessStep) => void;
  /** Return false to block a tool that needs approval. */
  onApprove?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
  onAskUser?: (questions: AskUserQuestion[]) => Promise<string>;
  onPlanReview?: (plan: string) => Promise<PlanReview>;
};

export type ToolContext = {
  workspace: string;
  planMode: boolean;
  setPlanMode: (active: boolean) => void;
  todos: TodoItem[];
  setTodos: (todos: TodoItem[]) => void;
  yes?: boolean;
  onAskUser?: HarnessOptions['onAskUser'];
  onPlanReview?: HarnessOptions['onPlanReview'];
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

export const DEFAULT_MAX_STEPS = 12;
export const MAX_STEPS_CAP = 24;
const READ_LIMIT = 100_000;
const WRITE_LIMIT = 200_000;
const SEARCH_HITS = 40;
const SEARCH_FILE_LIMIT = 1_000_000;
const CMD_OUTPUT_LIMIT = 16_384;
const CMD_TIMEOUT_MS = 30_000;
const FETCH_LIMIT = 24_000;
const SKILL_LIMIT = 8_000;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.ollama', '.openinference']);
const SKILL_FILES = ['AGENTS.md', 'SKILL.md', '.oi/SKILL.md', 'CLAUDE.md'];

const MUTATING_TOOLS = new Set(['write_file', 'str_replace', 'run_command']);
const PLAN_BLOCKED = new Set(['write_file', 'str_replace']);

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
      description: 'Read a UTF-8 text file from the workspace. Optional offset/limit are 1-based line numbers.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to the workspace' },
          offset: { type: 'string', description: 'First line to show (1-based). Optional.' },
          limit: { type: 'string', description: 'Max lines to show. Optional.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a UTF-8 text file. Prefer str_replace for existing files.',
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
      name: 'str_replace',
      description:
        'Replace exactly one unique occurrence of old_string with new_string in a file. If the string is missing or appears more than once, the edit is rejected — include more context to make it unique.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to the workspace' },
          old_string: { type: 'string', description: 'Exact text to find (must occur once)' },
          new_string: { type: 'string', description: 'Replacement text' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glob',
      description: 'Find files matching a glob (e.g. "**/*.ts", "src/**/*.json"). Returns paths, not directories.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern' },
          path: { type: 'string', description: 'Directory to search (default: workspace root)' },
        },
        required: ['pattern'],
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
      description: 'Run a shell command in the workspace (or workdir). Output is truncated. Use for tests, git, builds.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run' },
          workdir: { type: 'string', description: 'Optional working directory relative to the workspace' },
          description: { type: 'string', description: 'Short 5-10 word summary shown in the log' },
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
  {
    type: 'function',
    function: {
      name: 'todo_write',
      description:
        'Replace the session todo list. Use for multi-step work. status: pending | in_progress | completed. Several in_progress items are allowed.',
      parameters: {
        type: 'object',
        properties: {
          todos: {
            type: 'string',
            description: 'JSON array of {id, content, status: pending|in_progress|completed}',
          },
        },
        required: ['todos'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user_question',
      description: 'Pause and ask the user a question (choice or free text) before continuing.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The question to ask' },
          options: {
            type: 'string',
            description: 'Optional JSON array of {label, description} choices',
          },
        },
        required: ['question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'exit_plan_mode',
      description:
        'Present a complete markdown plan (must start with a # heading) for user review. On approval, leave plan mode and start executing.',
      parameters: {
        type: 'object',
        properties: {
          plan: { type: 'string', description: 'Full markdown plan starting with a # heading' },
        },
        required: ['plan'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch an http(s) URL and return text. Use for docs, not for untrusted file:// URLs.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'http or https URL' },
        },
        required: ['url'],
      },
    },
  },
];

export const HARNESS_TOOL_NAMES = HARNESS_TOOLS.map((t) => t.function.name);
export const MINIMAL_TOOL_NAMES = ['read_file', 'str_replace', 'run_command', 'todo_write', 'exit_plan_mode'];

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

function asInt(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function asUnknownList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
}

/** Glob → regex. `*.ts` also matches nested paths. */
export function globToRegExp(pattern: string): RegExp {
  const pat = pattern.replace(/\\/g, '/');
  const full = pat.includes('/') || pat.startsWith('**') ? pat : `**/${pat}`;
  let i = 0;
  let re = '^';
  while (i < full.length) {
    if (full.startsWith('**/', i)) {
      re += '(?:.*/)?';
      i += 3;
      continue;
    }
    if (full.startsWith('**', i)) {
      re += '.*';
      i += 2;
      continue;
    }
    const c = full[i]!;
    if (c === '*') {
      re += '[^/]*';
      i += 1;
      continue;
    }
    if (c === '?') {
      re += '[^/]';
      i += 1;
      continue;
    }
    if ('\\.[]{}()+^$|'.includes(c)) re += `\\${c}`;
    else re += c;
    i += 1;
  }
  re += '$';
  return new RegExp(re, 'i');
}

export function matchGlob(relPath: string, pattern: string): boolean {
  return globToRegExp(pattern).test(relPath.replace(/\\/g, '/'));
}

export function applyStrReplace(
  text: string,
  oldStr: string,
  newStr: string,
): { ok: true; text: string } | { ok: false; error: string } {
  if (!oldStr) return { ok: false, error: 'old_string is required.' };
  const parts = text.split(oldStr);
  if (parts.length === 1) return { ok: false, error: 'old_string not found — read the file and copy the exact text.' };
  if (parts.length > 2) {
    return {
      ok: false,
      error: `old_string found ${parts.length - 1} times — include more surrounding lines so it is unique.`,
    };
  }
  return { ok: true, text: parts[0] + newStr + parts[1] };
}

export function formatTodos(todos: TodoItem[]): string {
  if (todos.length === 0) return '(no todos)';
  const icon: Record<TodoStatus, string> = { pending: '☐', in_progress: '▶', completed: '✓' };
  return todos.map((t) => `${icon[t.status] ?? '☐'} ${t.content}`).join('\n');
}

export function parseTodos(raw: unknown): TodoItem[] {
  const list = asUnknownList(raw);
  const out: TodoItem[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const content = String(rec.content ?? rec.title ?? rec.text ?? '').trim();
    if (!content) continue;
    const rawStatus = String(rec.status ?? 'pending').toLowerCase().replace(/-/g, '_');
    const status: TodoStatus =
      rawStatus === 'completed' || rawStatus === 'done'
        ? 'completed'
        : rawStatus === 'in_progress' || rawStatus === 'inprogress'
          ? 'in_progress'
          : 'pending';
    out.push({ id: String(rec.id ?? String(i + 1)), content, status });
  }
  return out;
}

export function sessionDir(): string {
  return path.join(configDir(), 'sessions');
}

export function newSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function appendJsonl(file: string, event: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n');
}

export function loadJsonl(file: string): Record<string, unknown>[] {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  } catch {
    return [];
  }
}

export function latestSessionId(dir = sessionDir()): string | null {
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => ({ id: f.slice(0, -6), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return files[0]?.id ?? null;
  } catch {
    return null;
  }
}

export function summarizeSession(events: Record<string, unknown>[]): string {
  const start = events.find((e) => e.type === 'start');
  const lastTodo = [...events].reverse().find((e) => e.type === 'todo');
  const lastAnswer = [...events].reverse().find((e) => e.type === 'answer');
  const lines = ['Continuing previous session.'];
  if (start?.goal) lines.push(`Previous goal: ${String(start.goal).slice(0, 500)}`);
  if (Array.isArray(lastTodo?.todos)) {
    lines.push('Todos:');
    lines.push(formatTodos(parseTodos(lastTodo.todos)));
  }
  if (lastAnswer?.content) lines.push(`Last answer: ${String(lastAnswer.content).slice(0, 800)}`);
  return lines.join('\n');
}

function loadSkills(workspace: string): string {
  const chunks: string[] = [];
  let used = 0;
  for (const rel of SKILL_FILES) {
    if (used >= SKILL_LIMIT) break;
    const file = path.join(workspace, rel);
    try {
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
      const text = fs.readFileSync(file, 'utf8').slice(0, SKILL_LIMIT - used);
      if (!text.trim()) continue;
      chunks.push(`# ${rel}\n${text.trim()}`);
      used += text.length;
    } catch {
      /* skip unreadable skill files */
    }
  }
  return chunks.join('\n\n');
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

function readWorkspaceFile(file: string, offset?: number, limit?: number): string {
  const st = fs.statSync(file);
  if (st.isDirectory()) return `Not a file: ${file} is a directory. Use list_dir or glob.`;
  if (st.size > READ_LIMIT && offset == null) {
    const buf = fs.readFileSync(file, { encoding: 'utf8' }).slice(0, READ_LIMIT);
    return buf + `\n\n… truncated (${st.size} bytes). Pass offset/limit to read a slice.`;
  }
  const buf = fs.readFileSync(file);
  if (buf.includes(0)) return 'Binary file — not shown.';
  const text = buf.toString('utf8');
  if (offset == null && limit == null) return text;
  const lines = text.split(/\r?\n/);
  const start = Math.max(1, offset ?? 1);
  const end = limit != null ? start + Math.max(0, limit) - 1 : lines.length;
  const slice = lines.slice(start - 1, end);
  return slice.map((line, i) => `${String(start + i).padStart(4)}| ${line}`).join('\n');
}

function writeWorkspaceFile(file: string, content: string, workspace: string): string {
  if (content.length > WRITE_LIMIT) {
    return `Content too large (${content.length} chars). Max ${WRITE_LIMIT}.`;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  const rel = path.relative(workspace, file) || path.basename(file);
  return `Wrote ${content.length} chars to ${rel}`;
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

function globWorkspace(root: string, start: string, pattern: string): string {
  const re = globToRegExp(pattern);
  const hits: { rel: string; mtime: number }[] = [];
  const walk = (dir: string) => {
    if (hits.length >= 200) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (hits.length >= 200) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(full);
        continue;
      }
      if (!e.isFile()) continue;
      const rel = path.relative(root, full).replace(/\\/g, '/');
      if (re.test(rel)) {
        try {
          hits.push({ rel, mtime: fs.statSync(full).mtimeMs });
        } catch {
          hits.push({ rel, mtime: 0 });
        }
      }
    }
  };
  walk(start);
  if (hits.length === 0) return 'No files matched.';
  hits.sort((a, b) => b.mtime - a.mtime);
  const shown = hits.slice(0, 100);
  const extra = hits.length > 100 ? `\n… +${hits.length - 100} more` : '';
  return shown.map((h) => h.rel).join('\n') + extra;
}

async function webFetch(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) return 'Only http(s) URLs are allowed.';
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'openinference-cli' },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    });
    const raw = await res.text();
    const text = raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const body = text.slice(0, FETCH_LIMIT);
    const more = text.length > FETCH_LIMIT ? '\n… truncated' : '';
    return `HTTP ${res.status} ${url}\n${body}${more}`;
  } catch (e) {
    return `Fetch failed: ${e instanceof Error ? e.message : String(e)}`;
  }
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

function ctxFrom(workspaceOrCtx: string | ToolContext): ToolContext {
  if (typeof workspaceOrCtx !== 'string') return workspaceOrCtx;
  return {
    workspace: workspaceOrCtx,
    planMode: false,
    setPlanMode() {},
    todos: [],
    setTodos() {},
  };
}

export async function executeHarnessTool(
  name: string,
  args: Record<string, unknown>,
  workspaceOrCtx: string | ToolContext,
): Promise<string> {
  const ctx = ctxFrom(workspaceOrCtx);
  const workspace = ctx.workspace;
  try {
    if (ctx.planMode && PLAN_BLOCKED.has(name)) {
      return 'Plan mode is active — do not edit files yet. Explore, then call exit_plan_mode with a markdown plan.';
    }

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
        return readWorkspaceFile(file, asInt(args, 'offset'), asInt(args, 'limit'));
      }
      case 'write_file': {
        const file = resolveWorkspacePath(workspace, asString(args, 'path'));
        return writeWorkspaceFile(file, asString(args, 'content'), workspace);
      }
      case 'str_replace': {
        const file = resolveWorkspacePath(workspace, asString(args, 'path'));
        if (!fs.existsSync(file)) return `Not found: ${asString(args, 'path')}`;
        const buf = fs.readFileSync(file);
        if (buf.includes(0)) return 'Binary file — not edited.';
        const oldStr = asString(args, 'old_string') || asString(args, 'old_str');
        const newStr = asString(args, 'new_string') || asString(args, 'new_str');
        const result = applyStrReplace(buf.toString('utf8'), oldStr, newStr);
        if (!result.ok) return result.error;
        fs.writeFileSync(file, result.text, 'utf8');
        const rel = path.relative(workspace, file) || path.basename(file);
        return `Replaced 1 occurrence in ${rel}`;
      }
      case 'glob': {
        const pattern = asString(args, 'pattern');
        if (!pattern) return 'Missing pattern.';
        const start = resolveWorkspacePath(workspace, asString(args, 'path') || '.');
        if (!fs.existsSync(start)) return `Not found: ${asString(args, 'path') || '.'}`;
        return globWorkspace(workspace, start, pattern);
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
        const workdir = asString(args, 'workdir') || asString(args, 'cwd');
        const cwd = workdir ? resolveWorkspacePath(workspace, workdir) : path.resolve(workspace);
        return runCommand(cmd, cwd);
      }
      case 'calculate':
        return executeCalculate(asString(args, 'expression'));
      case 'todo_write': {
        const todos = parseTodos(args.todos ?? args);
        ctx.setTodos(todos);
        return formatTodos(todos);
      }
      case 'ask_user_question': {
        const question = asString(args, 'question');
        if (!question) return 'Missing question.';
        const options = asUnknownList(args.options).flatMap((o) => {
          if (typeof o === 'string') return [{ label: o }];
          if (o && typeof o === 'object' && !Array.isArray(o)) {
            const rec = o as Record<string, unknown>;
            const label = String(rec.label ?? rec.value ?? '').trim();
            return label ? [{ label, description: rec.description ? String(rec.description) : undefined }] : [];
          }
          return [];
        });
        if (!ctx.onAskUser) return 'No interactive user available. Pick a reasonable default and continue.';
        return ctx.onAskUser([{ id: 'q1', question, options: options.length ? options : undefined }]);
      }
      case 'exit_plan_mode': {
        if (!ctx.planMode) return 'Plan mode is not active.';
        const plan = asString(args, 'plan').trim();
        if (!plan.startsWith('#')) return 'Plan must be markdown starting with a # heading that names it.';
        const review = ctx.onPlanReview
          ? await ctx.onPlanReview(plan)
          : { approved: Boolean(ctx.yes), feedback: ctx.yes ? undefined : 'No reviewer; pass --yes or use an interactive session.' };
        if (review.approved) {
          ctx.setPlanMode(false);
          return `Plan approved. Carry it out from the next step.\n\n${plan}`;
        }
        return `Keep planning. Feedback: ${review.feedback || 'Revise the plan and call exit_plan_mode again.'}`;
      }
      case 'web_fetch':
        return webFetch(asString(args, 'url'));
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

function systemPrompt(workspace: string, planMode: boolean, skills: string): string {
  const lines = [
    'You are OpenInference, a local coding agent on the user\'s machine.',
    `Workspace: ${path.resolve(workspace)}`,
    '',
    'Use tools. Do not guess file contents. Paths are relative to the workspace.',
    'Prefer glob + read_file + search to explore. Prefer str_replace over write_file for edits.',
    'Use todo_write for multi-step work and keep it current.',
    'Ask with ask_user_question when a choice is blocking.',
    'When you have enough to answer, reply in plain text with no tool call.',
  ];
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

/**
 * Tool loop — same shape as gateway `runAgent`: model → tool_calls → execute → repeat,
 * until a final answer or max steps. Talks to local Ollama instead of Groq.
 * Plan mode, todos, and an append-only session log follow DeepSeek Harness UX.
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

  const live = opts.live ?? { planMode: Boolean(opts.plan), todos: [], sessionId: newSessionId() };
  if (!live.sessionId) live.sessionId = newSessionId();
  if (opts.plan) live.planMode = true;

  let resumeNote = '';
  if (opts.resume) {
    const id = live.sessionId && fs.existsSync(path.join(sessionDir(), `${live.sessionId}.jsonl`))
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

  const pool = opts.mode === 'minimal' ? MINIMAL_TOOL_NAMES : HARNESS_TOOL_NAMES;
  const allowed = new Set(opts.allowedTools?.length ? opts.allowedTools.filter((n) => pool.includes(n)) : pool);
  if (live.planMode) allowed.add('exit_plan_mode');
  const tools = HARNESS_TOOLS.filter((t) => allowed.has(t.function.name));
  const skills = loadSkills(workspace);
  const sessionFile = path.join(sessionDir(), `${live.sessionId}.jsonl`);

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
    mode: opts.mode ?? 'standard',
  });

  const steps: HarnessStep[] = [];
  const userGoal = resumeNote ? `${resumeNote}\n\nNew request:\n${opts.goal}` : opts.goal;
  const messages: OllamaMessage[] = [
    { role: 'system', content: systemPrompt(workspace, live.planMode, skills) },
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
  };

  for (let step = 0; step < maxSteps; step++) {
    const start = Date.now();
    messages[0] = { role: 'system', content: systemPrompt(workspace, live.planMode, skills) };
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
