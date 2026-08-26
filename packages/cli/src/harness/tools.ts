import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { maybeCheckpoint } from './checkpoint';
import {
  asInt,
  asString,
  asUnknownList,
  applyStrReplace,
  executeCalculate,
  miniDiff,
} from './parse';
import { globToRegExp, resolveWorkspacePath } from './paths';
import { formatTodos, parseTodos } from './todos';
import {
  CMD_OUTPUT_LIMIT,
  CMD_TIMEOUT_MS,
  FETCH_LIMIT,
  MINIMAL_TOOL_NAMES,
  PLAN_BLOCKED,
  READ_LIMIT,
  SEARCH_FILE_LIMIT,
  SEARCH_HITS,
  SKIP_DIRS,
  WRITE_LIMIT,
  type HarnessToolDef,
  type ToolContext,
} from './types';

export { MINIMAL_TOOL_NAMES };

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
      description: 'Search workspace files for a regex or literal string. Skips ignored folders (.oiignore, node_modules, .git).',
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
  {
    type: 'function',
    function: {
      name: 'explore',
      description:
        'Spawn a short read-only sub-agent to survey the repo (list/read/glob/search). Use when you need a map before editing.',
      parameters: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'What to find or summarize' },
        },
        required: ['goal'],
      },
    },
  },
];

export const HARNESS_TOOL_NAMES = HARNESS_TOOLS.map((t) => t.function.name);

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
  maybeCheckpoint(workspace, 'write_file', file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  const rel = path.relative(workspace, file) || path.basename(file);
  return `Wrote ${content.length} chars to ${rel}`;
}

function searchWorkspace(
  root: string,
  start: string,
  pattern: string,
  ignore: NonNullable<ToolContext['ignore']>,
): string {
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
      const full = path.join(dir, e.name);
      const rel = path.relative(root, full).replace(/\\/g, '/');
      if (e.isDirectory()) {
        if (ignore(rel, e.name, true)) continue;
        walk(full);
        continue;
      }
      if (!e.isFile()) continue;
      if (ignore(rel, e.name, false)) continue;
      let st: fs.Stats;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (st.size > SEARCH_FILE_LIMIT) continue;
      let text: string;
      try {
        const buf = fs.readFileSync(full);
        if (buf.includes(0)) continue;
        text = buf.toString('utf8');
      } catch {
        continue;
      }
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (hits.length >= SEARCH_HITS) return;
        if (re.test(lines[i]!)) {
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

function globWorkspace(
  root: string,
  start: string,
  pattern: string,
  ignore: NonNullable<ToolContext['ignore']>,
): string {
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
      const rel = path.relative(root, full).replace(/\\/g, '/');
      if (e.isDirectory()) {
        if (ignore(rel, e.name, true)) continue;
        walk(full);
        continue;
      }
      if (!e.isFile()) continue;
      if (ignore(rel, e.name, false)) continue;
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

function defaultIgnore(_rel: string, name: string, _isDir: boolean): boolean {
  return SKIP_DIRS.has(name);
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
  const ignore = ctx.ignore ?? defaultIgnore;
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
        maybeCheckpoint(workspace, 'str_replace', file);
        fs.writeFileSync(file, result.text, 'utf8');
        const rel = path.relative(workspace, file) || path.basename(file);
        return miniDiff(rel, oldStr, newStr);
      }
      case 'glob': {
        const pattern = asString(args, 'pattern');
        if (!pattern) return 'Missing pattern.';
        const start = resolveWorkspacePath(workspace, asString(args, 'path') || '.');
        if (!fs.existsSync(start)) return `Not found: ${asString(args, 'path') || '.'}`;
        return globWorkspace(workspace, start, pattern, ignore);
      }
      case 'search': {
        const pattern = asString(args, 'pattern');
        if (!pattern) return 'Missing pattern.';
        const start = resolveWorkspacePath(workspace, asString(args, 'path') || '.');
        if (!fs.existsSync(start)) return `Not found: ${asString(args, 'path') || '.'}`;
        return searchWorkspace(workspace, start, pattern, ignore);
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
      case 'explore': {
        const goal = asString(args, 'goal') || asString(args, 'prompt');
        if (!goal) return 'Missing goal.';
        if (!ctx.runExplore) return 'Explore is only available during a live agent run.';
        return ctx.runExplore(goal);
      }
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
