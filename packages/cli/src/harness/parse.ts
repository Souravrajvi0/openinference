import type { ParsedCall } from './types';

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

export function asString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

export function asInt(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export function asUnknownList(raw: unknown): unknown[] {
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

export function miniDiff(rel: string, oldStr: string, newStr: string): string {
  const minus = oldStr.split('\n').map((l) => `- ${l}`).join('\n');
  const plus = newStr.split('\n').map((l) => `+ ${l}`).join('\n');
  return `Replaced 1 occurrence in ${rel}\n--- ${rel}\n${minus}\n${plus}`;
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
