import { spawn, spawnSync } from 'node:child_process';
import { loadConfig } from './config';

const DEFAULT_URL = 'http://127.0.0.1:11434';

/** Resolve Ollama API base: CLI flag → OLLAMA_URL env → saved config → localhost. */
export function resolveOllamaUrl(cliUrl?: string): string {
  const cfg = loadConfig();
  return (cliUrl ?? process.env.OLLAMA_URL ?? cfg?.ollamaUrl ?? DEFAULT_URL).replace(/\/$/, '');
}

export function isOllamaInstalled(): boolean {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(cmd, ['ollama'], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 && Boolean(r.stdout?.trim());
}

export async function pingOllama(baseUrl?: string): Promise<boolean> {
  const url = resolveOllamaUrl(baseUrl);
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

export function installOllama(): void {
  console.log('\n  Setting up local inference…\n');

  if (process.platform === 'win32') {
    const winget = spawnSync(
      'winget',
      [
        'install',
        '--id',
        'Ollama.Ollama',
        '-e',
        '--accept-source-agreements',
        '--accept-package-agreements',
      ],
      { stdio: 'inherit', windowsHide: false },
    );
    if (winget.status !== 0) {
      throw new Error(
        'Could not set up local inference automatically. Run `oi` again or see openinference.tech/cli for help.',
      );
    }
    return;
  }

  if (process.platform === 'linux' || process.platform === 'darwin') {
    const sh = spawnSync('sh', ['-c', 'curl -fsSL https://ollama.com/install.sh | sh'], {
      stdio: 'inherit',
    });
    if (sh.status !== 0) {
      throw new Error(
        'Could not set up local inference automatically. Run `oi` again or see openinference.tech/cli for help.',
      );
    }
    return;
  }

  throw new Error('Automatic local inference setup supports Windows, macOS, and Linux.');
}

function spawnDetached(command: string, args: string[]): void {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

/** Start local `ollama serve` when using host CLI mode. */
export async function ensureHostOllamaRunning(baseUrl: string): Promise<void> {
  if (await pingOllama(baseUrl)) return;

  // Check BEFORE announcing a start we can't perform.
  if (!isOllamaInstalled()) {
    throw new Error(
      'The inference engine (Ollama) is not installed on this machine. ' +
        'Run `oi setup` to install it, or get it from ollama.com/download.',
    );
  }

  console.log('Starting local inference…');
  spawnDetached('ollama', ['serve']);

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (await pingOllama(baseUrl)) {
      console.log('Ready.\n');
      return;
    }
    await sleep(1500);
  }

  throw new Error(
    'Local inference did not start within 45s. Check what is wrong with `oi doctor`.',
  );
}

/**
 * Map a raw Ollama/network error to an honest, actionable message (f2: never
 * show a misleading error). Pass the model tag when the call involved one so
 * "model not found" can point at the install command.
 */
export function friendlyOllamaError(raw: string, model?: string): string {
  if (model && /not found|no such model|pull the model/i.test(raw)) {
    return `Model "${model}" is not installed. Install it first: oi install ${model}`;
  }
  const crash = classifyCrash(raw);
  if (crash) return model ? `Model "${model}" — ${crash}` : crash;
  if (/fetch failed|econnrefused|socket hang up|und_err|network/i.test(raw)) {
    return 'Can’t reach local inference. See what’s wrong: oi doctor';
  }
  return raw;
}

/** Docker / remote mode — Ollama must already be reachable over HTTP. */
export async function ensureRemoteOllama(baseUrl: string): Promise<void> {
  if (await pingOllama(baseUrl)) {
    console.log(`  Connected.\n`);
    return;
  }
  throw new Error(
    `Cannot reach the inference host at ${baseUrl}. Check the URL and that the service is running.`,
  );
}

export function pullModelHost(modelId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\nPulling ${modelId}… (this may take a few minutes)\n`);
    const child = spawn('ollama', ['pull', modelId], { stdio: 'inherit', windowsHide: false });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ollama pull failed (exit ${code})`));
    });
  });
}

type PullEvent = { status?: string; completed?: number; total?: number; digest?: string };

/** Pull via Ollama HTTP API (for Docker / VM where `ollama` CLI is not on PATH). */
export async function pullModelRemote(baseUrl: string, modelId: string): Promise<void> {
  const url = resolveOllamaUrl(baseUrl);
  console.log(`\nPulling ${modelId} via ${url}… (this may take a few minutes)\n`);

  const res = await fetch(`${url}/api/pull`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: modelId, stream: true }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`Pull failed (${res.status}): ${text || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastLine = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop() ?? '';

    for (const line of parts) {
      if (!line.trim()) continue;
      let ev: PullEvent;
      try {
        ev = JSON.parse(line) as PullEvent;
      } catch {
        continue;
      }
      if (ev.status === 'downloading' && ev.total && ev.completed != null) {
        const pct = Math.round((ev.completed / ev.total) * 100);
        lastLine = `  downloading ${pct}%`;
        process.stdout.write(`\r${lastLine}`);
      } else if (ev.status && ev.status !== lastLine) {
        if (lastLine.startsWith('\r')) process.stdout.write('\n');
        lastLine = ev.status;
        const short =
          ev.status.length > 72 ? ev.status.slice(0, 69) + '…' : ev.status;
        console.log(`  ${short}`);
      }
    }
  }

  if (lastLine.startsWith('downloading')) process.stdout.write('\n');
  console.log('');
}

export function isInferenceCrashError(msg: string): boolean {
  return /segmentation fault|process has terminated|out of memory|oom|cuda/i.test(msg);
}

/**
 * Turn a raw Ollama crash payload into an honest, specific message — instead of
 * always blaming RAM. An OOM-kill (SIGKILL) and a segfault (SIGSEGV) have very
 * different causes and fixes.
 */
export function classifyCrash(text: string): string | null {
  const t = text.toLowerCase();
  if (/signal: killed|out of memory|\boom\b|cannot allocate|bad_alloc/.test(t)) {
    return (
      'Model crashed — the system ran out of memory (OOM-killed). ' +
      'Pick a smaller model (e.g. smollm2:135m) or use a machine with more RAM.'
    );
  }
  if (/cuda|rocm|hip error|gpu/.test(t)) {
    return (
      'Model crashed on the GPU. Update your GPU driver, or run a smaller model on CPU.'
    );
  }
  if (/segmentation fault|sigsegv|core dumped|process has terminated/.test(t)) {
    return (
      'Model crashed (segmentation fault). This is often low memory, but a segfault ' +
      'can also mean a CPU-compatibility issue or a corrupt/partial download. ' +
      'Try re-pulling the model, or pick a smaller one (e.g. smollm2:135m).'
    );
  }
  return null;
}

export async function verifyModel(baseUrl: string, modelId: string): Promise<void> {
  const url = resolveOllamaUrl(baseUrl);
  console.log('Verifying model…');
  const res = await fetch(`${url}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modelId,
      prompt: 'Say OK',
      stream: false,
      options: { num_predict: 8 },
    }),
    signal: AbortSignal.timeout(300_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const crash = classifyCrash(text);
    if (crash) throw new Error(`Model "${modelId}" — ${crash}`);
    throw new Error(`Model verification failed: ${res.status} ${text}`);
  }

  const body = (await res.json()) as { response?: string };
  console.log(`Smoke test passed${body.response ? `: "${body.response.trim().slice(0, 40)}"` : ''}.\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function listModelTags(ollamaUrl?: string): Promise<string[]> {
  const base = resolveOllamaUrl(ollamaUrl);
  const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Could not list models (${res.status})`);
  const body = (await res.json()) as { models?: { name: string }[] };
  return (body.models ?? []).map((m) => m.name).sort();
}

/** Bytes a model occupies on disk, or null if it isn't installed / can't be read. */
export async function modelSizeBytes(baseUrl: string, modelId: string): Promise<number | null> {
  const base = resolveOllamaUrl(baseUrl);
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { models?: { name: string; size?: number }[] };
    const hit = (body.models ?? []).find(
      (m) => m.name === modelId || m.name === `${modelId}:latest`,
    );
    return hit?.size ?? null;
  } catch {
    return null;
  }
}

/** Ollama release string (e.g. "0.5.1"), or null if unreachable. */
export async function getOllamaVersion(baseUrl?: string): Promise<string | null> {
  const base = resolveOllamaUrl(baseUrl);
  try {
    const res = await fetch(`${base}/api/version`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: string };
    return body.version ?? null;
  } catch {
    return null;
  }
}

export type RunningModel = {
  name: string;
  /** Total memory the model occupies (bytes). */
  size: number;
  /** Portion of `size` resident in VRAM (bytes). 0 = fully on CPU. */
  sizeVram: number;
  paramSize?: string;
  quant?: string;
};

/** Models currently loaded in memory (via `/api/ps`). Empty if none/unreachable. */
export async function listRunningModels(baseUrl?: string): Promise<RunningModel[]> {
  const base = resolveOllamaUrl(baseUrl);
  try {
    const res = await fetch(`${base}/api/ps`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      models?: {
        name: string;
        size?: number;
        size_vram?: number;
        details?: { parameter_size?: string; quantization_level?: string };
      }[];
    };
    return (body.models ?? []).map((m) => ({
      name: m.name,
      size: m.size ?? 0,
      sizeVram: m.size_vram ?? 0,
      paramSize: m.details?.parameter_size,
      quant: m.details?.quantization_level,
    }));
  } catch {
    return [];
  }
}

export type GenerateMetrics = {
  response: string;
  /** Generation throughput (tokens/sec), or null if Ollama didn't report it. */
  tokensPerSec: number | null;
  /** Time to first token (ms): model load + prompt eval, or null. */
  ttftMs: number | null;
};

/**
 * Run one non-streamed generation and pull Ollama's own timing metrics from the
 * response (`eval_count`/`eval_duration` → tok/s, `load`+`prompt_eval` → TTFT).
 * Throws with the raw payload on failure so callers can `classifyCrash()`.
 */
export async function measureGenerate(
  baseUrl: string,
  modelId: string,
  prompt = 'Say OK.',
): Promise<GenerateMetrics> {
  const url = resolveOllamaUrl(baseUrl);
  const res = await fetch(`${url}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modelId,
      prompt,
      stream: false,
      options: { num_predict: 48 },
    }),
    signal: AbortSignal.timeout(300_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as {
    response?: string;
    eval_count?: number;
    eval_duration?: number;
    load_duration?: number;
    prompt_eval_duration?: number;
  };

  const tokensPerSec =
    body.eval_count && body.eval_duration
      ? Math.round((body.eval_count / (body.eval_duration / 1e9)) * 10) / 10
      : null;
  const ttftMs =
    body.load_duration != null || body.prompt_eval_duration != null
      ? Math.round(((body.load_duration ?? 0) + (body.prompt_eval_duration ?? 0)) / 1e6)
      : null;

  return { response: (body.response ?? '').trim(), tokensPerSec, ttftMs };
}

/** Delete a model via the Ollama HTTP API (works for local CLI and remote/Docker). */
export async function deleteModel(baseUrl: string, modelId: string): Promise<void> {
  const base = resolveOllamaUrl(baseUrl);
  const res = await fetch(`${base}/api/delete`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: modelId }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Could not delete ${modelId} (${res.status}): ${text || res.statusText}`);
  }
}
