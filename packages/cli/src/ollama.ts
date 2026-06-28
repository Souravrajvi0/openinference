import { spawn, spawnSync } from 'node:child_process';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';

export function ollamaBaseUrl(): string {
  return OLLAMA_URL.replace(/\/$/, '');
}

export function isOllamaInstalled(): boolean {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(cmd, ['ollama'], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 && Boolean(r.stdout?.trim());
}

export async function pingOllama(): Promise<boolean> {
  try {
    const res = await fetch(`${ollamaBaseUrl()}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export function installOllama(): void {
  console.log('\nInstalling Ollama…\n');

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
        'Could not install Ollama automatically. Install from https://ollama.com/download/windows then run `oi setup` again.',
      );
    }
    return;
  }

  if (process.platform === 'linux') {
    const sh = spawnSync('sh', ['-c', 'curl -fsSL https://ollama.com/install.sh | sh'], {
      stdio: 'inherit',
    });
    if (sh.status !== 0) {
      throw new Error(
        'Could not install Ollama automatically. Run: curl -fsSL https://ollama.com/install.sh | sh',
      );
    }
    return;
  }

  throw new Error('Automatic Ollama install supports Linux and Windows only. Install from https://ollama.com');
}

function spawnDetached(command: string, args: string[]): void {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

export async function ensureOllamaRunning(): Promise<void> {
  if (await pingOllama()) return;

  console.log('Starting Ollama…');
  if (!isOllamaInstalled()) {
    throw new Error('Ollama is not installed.');
  }

  spawnDetached('ollama', ['serve']);

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (await pingOllama()) {
      console.log('Ollama is running.\n');
      return;
    }
    await sleep(1500);
  }

  if (process.platform === 'win32') {
    throw new Error(
      'Ollama did not start in time. Open the Ollama app from the Start menu, then run `oi setup` again.',
    );
  }
  throw new Error('Ollama did not start in time. Try: ollama serve');
}

export function pullModel(modelId: string): Promise<void> {
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

export async function verifyModel(modelId: string): Promise<void> {
  console.log('\nVerifying model…');
  const res = await fetch(`${ollamaBaseUrl()}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modelId,
      prompt: 'Say OK',
      stream: false,
      options: { num_predict: 8 },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Model verification failed: ${res.status} ${text}`);
  }

  const body = (await res.json()) as { response?: string };
  console.log(`Smoke test passed${body.response ? `: "${body.response.trim().slice(0, 40)}"` : ''}.\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
