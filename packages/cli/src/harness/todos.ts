import { asUnknownList } from './parse';
import type { TodoItem, TodoStatus } from './types';

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
