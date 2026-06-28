import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export type UseCaseId = import('./use-cases').UseCaseId;

export type SavedConfig = {
  ollamaUrl: string;
  model: string;
  modelName: string;
  useCase?: UseCaseId;
  setupAt: string;
};

export function configDir(): string {
  return path.join(os.homedir(), '.openinference');
}

export function configPath(): string {
  return path.join(configDir(), 'config.json');
}

export function saveConfig(cfg: SavedConfig): void {
  fs.mkdirSync(configDir(), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

export function loadConfig(): SavedConfig | null {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    return JSON.parse(raw) as SavedConfig;
  } catch {
    return null;
  }
}

export function setActiveModel(modelId: string, modelName: string): void {
  const cfg = loadConfig();
  if (!cfg) throw new Error('Not set up yet. Run: oi');
  saveConfig({ ...cfg, model: modelId, modelName });
}

/** Remove the saved config entirely (e.g. the active model was deleted). */
export function clearConfig(): void {
  try {
    fs.rmSync(configPath());
  } catch {
    /* nothing to clear */
  }
}

// ── crashed-model memory ────────────────────────────────
// Models that pulled fine but failed the smoke test on THIS machine. We stop
// recommending them so the wizard can't loop on the same broken pick.
function crashedPath(): string {
  return path.join(configDir(), 'crashed.json');
}

export function loadCrashedModels(): string[] {
  try {
    const arr = JSON.parse(fs.readFileSync(crashedPath(), 'utf8')) as unknown;
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveCrashedModels(ids: string[]): void {
  try {
    fs.mkdirSync(configDir(), { recursive: true });
    fs.writeFileSync(crashedPath(), JSON.stringify(ids, null, 2) + '\n', 'utf8');
  } catch {
    /* crash memory is best-effort */
  }
}

export function recordCrashedModel(id: string): void {
  const set = new Set(loadCrashedModels());
  if (set.has(id)) return;
  set.add(id);
  saveCrashedModels([...set]);
}

/** Forget a crash — call when a model later verifies successfully. */
export function clearCrashedModel(id: string): void {
  const set = new Set(loadCrashedModels());
  if (!set.delete(id)) return;
  saveCrashedModels([...set]);
}
