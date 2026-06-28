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
