import fs from 'node:fs';
import path from 'node:path';

import { resolveWorkspacePath } from './paths';
import { appendJsonl, loadJsonl, newSessionId } from './session';
import { WRITE_LIMIT, type Checkpoint, type FileSnapshot } from './types';

export function checkpointLog(workspace: string): string {
  return path.join(path.resolve(workspace), '.oi', 'checkpoints.jsonl');
}

export function snapshotFile(workspace: string, absFile: string): FileSnapshot {
  const rel = path.relative(path.resolve(workspace), absFile).replace(/\\/g, '/') || path.basename(absFile);
  if (!fs.existsSync(absFile)) return { path: rel, previous: null };
  const buf = fs.readFileSync(absFile);
  if (buf.includes(0)) throw new Error('Binary file — not snapshotted.');
  const text = buf.toString('utf8');
  if (text.length > WRITE_LIMIT) throw new Error('File too large to snapshot.');
  return { path: rel, previous: text };
}

export function pushCheckpoint(workspace: string, tool: string, files: FileSnapshot[]): Checkpoint {
  const checkpoint: Checkpoint = {
    id: newSessionId(),
    ts: new Date().toISOString(),
    tool,
    files,
  };
  appendJsonl(checkpointLog(workspace), { type: 'checkpoint', ...checkpoint });
  return checkpoint;
}

export function listCheckpoints(workspace: string): Checkpoint[] {
  const events = loadJsonl(checkpointLog(workspace));
  const undone = new Set(
    events.filter((e) => e.type === 'undo').map((e) => String(e.checkpoint_id ?? '')),
  );
  return events
    .filter((e) => e.type === 'checkpoint' && !undone.has(String(e.id ?? '')))
    .map((e) => ({
      id: String(e.id ?? ''),
      ts: String(e.ts ?? ''),
      tool: String(e.tool ?? ''),
      files: Array.isArray(e.files) ? (e.files as FileSnapshot[]) : [],
    }));
}

export function undoLast(workspace: string): string {
  const checkpoints = listCheckpoints(workspace);
  const last = checkpoints[checkpoints.length - 1];
  if (!last) return 'Nothing to undo.';
  const restored: string[] = [];
  for (const file of last.files) {
    const abs = resolveWorkspacePath(workspace, file.path);
    if (file.previous == null) {
      if (fs.existsSync(abs)) fs.rmSync(abs);
      restored.push(`removed ${file.path}`);
    } else {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, file.previous, 'utf8');
      restored.push(file.path);
    }
  }
  appendJsonl(checkpointLog(workspace), { type: 'undo', checkpoint_id: last.id });
  return `Undid ${last.tool} (${last.id}): ${restored.join(', ')}`;
}

export function maybeCheckpoint(workspace: string, tool: string, absFile: string): void {
  try {
    const snap = snapshotFile(workspace, absFile);
    pushCheckpoint(workspace, tool, [snap]);
  } catch {
    /* checkpoints are best-effort */
  }
}
