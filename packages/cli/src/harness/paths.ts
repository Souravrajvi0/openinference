import fs from 'node:fs';
import path from 'node:path';

import { SKIP_DIRS } from './types';

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

export function loadIgnorePatterns(workspace: string, extra: string[] = []): string[] {
  const patterns = [...extra];
  const file = path.join(workspace, '.oiignore');
  try {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        patterns.push(trimmed);
      }
    }
  } catch {
    /* ignore file is optional */
  }
  return patterns;
}

function matchIgnorePattern(rel: string, name: string, isDir: boolean, pattern: string): boolean {
  let pat = pattern.replace(/\\/g, '/').replace(/^\.\//, '');
  let dirOnly = false;
  if (pat.endsWith('/')) {
    dirOnly = true;
    pat = pat.slice(0, -1);
  }
  if (dirOnly && !isDir) return false;
  if (!pat.includes('*') && !pat.includes('?')) {
    if (name === pat) return true;
    if (rel === pat || rel.startsWith(`${pat}/`)) return true;
    return rel.split('/').includes(pat);
  }
  if (matchGlob(rel, pat) || matchGlob(name, pat)) return true;
  if (!pat.includes('/')) return matchGlob(rel, `**/${pat}`);
  return false;
}

export function isIgnored(rel: string, name: string, isDir: boolean, patterns: string[] = []): boolean {
  if (SKIP_DIRS.has(name)) return true;
  const posix = rel.replace(/\\/g, '/');
  for (const p of patterns) {
    if (matchIgnorePattern(posix, name, isDir, p)) return true;
  }
  return false;
}

export function makeIgnore(workspace: string, extra: string[] = []): (rel: string, name: string, isDir: boolean) => boolean {
  const patterns = loadIgnorePatterns(workspace, extra);
  return (rel, name, isDir) => isIgnored(rel, name, isDir, patterns);
}
