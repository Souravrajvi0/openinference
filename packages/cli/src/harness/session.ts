import fs from 'node:fs';
import path from 'node:path';

import { configDir } from '../config';
import { formatTodos, parseTodos } from './todos';
import type { SessionSummary } from './types';

export function sessionDir(): string {
  return path.join(configDir(), 'sessions');
}

export function sessionPath(id: string, dir = sessionDir()): string {
  return path.join(dir, `${id}.jsonl`);
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
  const rows = listSessionSummaries(1, dir);
  return rows[0]?.id ?? null;
}

export function listSessionSummaries(limit = 12, dir = sessionDir()): SessionSummary[] {
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => {
        const id = f.slice(0, -6);
        const full = path.join(dir, f);
        const st = fs.statSync(full);
        const events = loadJsonl(full);
        const start = events.find((e) => e.type === 'start');
        return {
          id,
          mtime: st.mtimeMs,
          goal: String(start?.goal ?? ''),
          model: start?.model ? String(start.model) : undefined,
        };
      })
      .sort((a, b) => b.mtime - a.mtime);
    return limit > 0 ? files.slice(0, limit) : files;
  } catch {
    return [];
  }
}

export function resolveSessionId(id?: string, dir = sessionDir()): string | null {
  const trimmed = id?.trim();
  if (trimmed) {
    if (fs.existsSync(sessionPath(trimmed, dir))) return trimmed;
    const hits = listSessionSummaries(0, dir).filter((s) => s.id.startsWith(trimmed) || s.id.includes(trimmed));
    return hits[0]?.id ?? null;
  }
  return latestSessionId(dir);
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

export function formatSessionReplay(events: Record<string, unknown>[]): string {
  if (events.length === 0) return '(empty session)';
  const lines: string[] = [];
  for (const e of events) {
    const type = String(e.type ?? '');
    if (type === 'start') {
      lines.push(`session start  ${String(e.goal ?? '').slice(0, 200)}`);
      if (e.model) lines.push(`  model ${String(e.model)}`);
      continue;
    }
    if (type === 'tool_call') {
      lines.push(`⚙ ${String(e.tool_name ?? 'tool')}  ${String(e.content ?? '').slice(0, 120)}`);
      continue;
    }
    if (type === 'tool_result') {
      const preview = String(e.content ?? '')
        .split('\n')
        .slice(0, 4)
        .join('\n');
      lines.push(`↩ ${preview}`);
      continue;
    }
    if (type === 'thought') {
      lines.push(`◎ ${String(e.content ?? '').slice(0, 160)}`);
      continue;
    }
    if (type === 'answer') {
      lines.push(`✓ ${String(e.content ?? '')}`);
      continue;
    }
    if (type === 'todo') {
      lines.push('todos:');
      lines.push(formatTodos(parseTodos(e.todos)));
    }
  }
  return lines.join('\n');
}
