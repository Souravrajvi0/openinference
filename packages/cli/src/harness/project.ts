import fs from 'node:fs';
import path from 'node:path';

import { SKILL_FILES, SKILL_LIMIT, type ProjectConfig } from './types';

export const DEFAULT_OIIGNORE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.ollama',
  '.openinference',
  '.oi/checkpoints.jsonl',
  '*.min.js',
].join('\n') + '\n';

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  mode: 'standard',
  maxSteps: 12,
  plan: false,
};

export const DEFAULT_AGENTS_MD = `# AGENTS.md

Instructions for the OpenInference coding agent (\`oi agent\`).

- Prefer \`str_replace\` over rewriting whole files.
- Keep changes small and local to the request.
- Use \`todo_write\` for multi-step work.
- Run tests after edits when they exist.
`;

export function findProjectDir(start: string): string {
  let dir = path.resolve(start);
  for (let i = 0; i < 16; i++) {
    if (fs.existsSync(path.join(dir, '.oi', 'config.json')) || fs.existsSync(path.join(dir, 'oi.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(start);
}

function readJsonObject(file: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return raw as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseProjectConfig(raw: Record<string, unknown>): ProjectConfig {
  const mode = raw.mode === 'minimal' ? 'minimal' : raw.mode === 'standard' ? 'standard' : undefined;
  const maxSteps =
    typeof raw.maxSteps === 'number'
      ? raw.maxSteps
      : typeof raw.max_steps === 'number'
        ? raw.max_steps
        : undefined;
  const plan = typeof raw.plan === 'boolean' ? raw.plan : undefined;
  const model = typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : undefined;
  const ignore = Array.isArray(raw.ignore)
    ? raw.ignore.filter((x): x is string => typeof x === 'string' && Boolean(x.trim()))
    : undefined;
  return { mode, maxSteps, plan, model, ignore };
}

export function loadProjectConfig(workspace: string): ProjectConfig {
  const root = findProjectDir(workspace);
  const fromOi = readJsonObject(path.join(root, '.oi', 'config.json'));
  const fromRoot = readJsonObject(path.join(root, 'oi.json'));
  const merged = { ...(fromRoot ?? {}), ...(fromOi ?? {}) };
  if (Object.keys(merged).length === 0) return {};
  return parseProjectConfig(merged);
}

export function loadSkills(workspace: string, extraRoots: string[] = []): string {
  const chunks: string[] = [];
  let used = 0;
  const seen = new Set<string>();
  const roots = [workspace, ...extraRoots];
  for (const root of roots) {
    for (const rel of SKILL_FILES) {
      if (used >= SKILL_LIMIT) break;
      const file = path.join(root, rel);
      const key = path.resolve(file);
      if (seen.has(key)) continue;
      seen.add(key);
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
  }
  return chunks.join('\n\n');
}

export function initProject(
  workspace: string,
  opts: { force?: boolean } = {},
): { created: string[]; skipped: string[] } {
  const root = path.resolve(workspace);
  const created: string[] = [];
  const skipped: string[] = [];
  const write = (rel: string, contents: string) => {
    const full = path.join(root, rel);
    if (fs.existsSync(full) && !opts.force) {
      skipped.push(rel);
      return;
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents, 'utf8');
    created.push(rel);
  };

  write('.oi/config.json', JSON.stringify(DEFAULT_PROJECT_CONFIG, null, 2) + '\n');
  write('.oiignore', DEFAULT_OIIGNORE);
  write('AGENTS.md', DEFAULT_AGENTS_MD);
  return { created, skipped };
}
