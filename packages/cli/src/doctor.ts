import { loadConfig } from './config';
import { detectHardware, formatHardware, type HardwareProfile } from './hardware';
import {
  classifyCrash,
  getOllamaVersion,
  listModelTags,
  listRunningModels,
  measureGenerate,
  pingOllama,
  isOllamaInstalled,
  resolveOllamaUrl,
  type RunningModel,
} from './ollama';

// ── colors ──────────────────────────────────────────────
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

type Status = 'ok' | 'warn' | 'fail' | 'info' | 'skip';

type Check = {
  id: string;
  label: string;
  status: Status;
  value: string;
  /** Actionable remediation, shown indented under the line. */
  fix?: string;
};

export type DoctorReport = {
  ok: boolean;
  ollamaUrl: string;
  checks: Check[];
};

const GLYPH: Record<Status, string> = {
  ok: `${GREEN}✓${RESET}`,
  warn: `${YELLOW}⚠${RESET}`,
  fail: `${RED}✕${RESET}`,
  info: `${DIM}·${RESET}`,
  skip: `${DIM}·${RESET}`,
};

function bytesToGb(bytes: number): number {
  return Math.round((bytes / 1024 ** 3) * 10) / 10;
}

/** Which installed model to exercise: the active one, else the first installed. */
async function pickProbeModel(base: string): Promise<string | null> {
  const active = loadConfig()?.model;
  const tags = await listModelTags(base).catch((): string[] => []);
  if (active && (tags.includes(active) || tags.includes(`${active}:latest`))) return active;
  return tags[0] ?? null;
}

function gpuResidencyCheck(hw: HardwareProfile, running: RunningModel | undefined): Check {
  // No usable GPU → CPU is expected, not a problem.
  if (!hw.gpuUsable) {
    const why = hw.hasGpu
      ? `${hw.gpuName ?? 'GPU'} has only ${hw.vramGb} GB VRAM — too small, using CPU (expected)`
      : 'No GPU detected — using CPU (expected)';
    return { id: 'gpu', label: 'GPU usage', status: 'info', value: why };
  }

  const gpu = hw.gpuName ?? 'GPU';

  if (!running) {
    return {
      id: 'gpu',
      label: 'GPU usage',
      status: 'skip',
      value: 'no model loaded — could not check GPU offload',
    };
  }

  if (running.sizeVram === 0) {
    return {
      id: 'gpu',
      label: 'GPU usage',
      status: 'warn',
      value: `Model is running on CPU — your ${gpu} is idle`,
      fix:
        'Ollama did not offload to the GPU. Update your GPU driver and confirm ' +
        'CUDA/ROCm is installed, then restart Ollama. On Linux, ensure Ollama was ' +
        'installed with GPU support. Re-run `oi doctor` to confirm.',
    };
  }

  if (running.sizeVram < running.size) {
    const inVram = Math.round((running.sizeVram / running.size) * 100);
    return {
      id: 'gpu',
      label: 'GPU usage',
      status: 'warn',
      value: `Partial offload — only ${inVram}% in VRAM, rest spilling to RAM (slower)`,
      fix:
        `The model is larger than your ${hw.vramGb} GB of VRAM, so it splits between ` +
        'GPU and CPU. Pick a smaller model or a lighter quant for full-GPU speed.',
    };
  }

  return {
    id: 'gpu',
    label: 'GPU usage',
    status: 'ok',
    value: `Fully on ${gpu} (${bytesToGb(running.sizeVram)} GB in VRAM)`,
  };
}

/** Run the full-stack health check. Pure data — rendering is separate. */
export async function collectDoctorReport(opts: { ollamaUrl?: string } = {}): Promise<DoctorReport> {
  const base = resolveOllamaUrl(opts.ollamaUrl);
  const hw = detectHardware();
  const checks: Check[] = [];

  // 1. Runtime reachable
  const reachable = await pingOllama(base);
  if (reachable) {
    const version = await getOllamaVersion(base);
    checks.push({
      id: 'runtime',
      label: 'Runtime',
      status: 'ok',
      value: `${version ? `Ollama ${version}` : 'reachable'}  ·  ${base}`,
    });
  } else {
    const installed = isOllamaInstalled();
    checks.push({
      id: 'runtime',
      label: 'Runtime',
      status: 'fail',
      value: installed ? `Not running  ·  ${base}` : `Not installed  ·  ${base}`,
      fix: installed
        ? 'Start it with `ollama serve` (or just run `oi`), then re-run `oi doctor`. ' +
          'If it IS running, the URL/port above is wrong — check $OLLAMA_URL (common on WSL).'
        : 'Local inference is not set up. Run `oi` to install and configure it.',
    });
  }

  // 2. Hardware (always)
  checks.push({
    id: 'hardware',
    label: 'Hardware',
    status: 'ok',
    value: formatHardware(hw),
  });

  // Model-dependent checks only make sense when the runtime is up.
  if (reachable) {
    const model = await pickProbeModel(base);

    if (!model) {
      checks.push({
        id: 'model',
        label: 'Active model',
        status: 'warn',
        value: 'No models installed',
        fix: 'Install one: `oi install <model>` or run `oi` for the setup wizard.',
      });
    } else {
      // 3. Smoke test + real numbers (also loads the model for the GPU check)
      let running: RunningModel | undefined;
      try {
        const m = await measureGenerate(base, model);
        checks.push({
          id: 'model',
          label: 'Active model',
          status: 'ok',
          value: `${model}  ·  responded`,
        });

        // 4. GPU actually in use (model is now loaded)
        const runningModels = await listRunningModels(base);
        running = runningModels.find((r) => r.name === model || r.name === `${model}:latest`);
        checks.push(gpuResidencyCheck(hw, running));

        // 5. Speed
        const tps = m.tokensPerSec;
        const ttft = m.ttftMs;
        const parts: string[] = [];
        if (tps != null) parts.push(`${tps} tok/s`);
        if (ttft != null) parts.push(`TTFT ${(ttft / 1000).toFixed(1)}s`);
        const slow = tps != null && tps < 5;
        checks.push({
          id: 'speed',
          label: 'Speed',
          status: slow ? 'warn' : 'ok',
          value: parts.length ? parts.join(' · ') + (slow ? ' — may feel slow' : '') : 'measured',
          fix: slow
            ? hw.gpuUsable
              ? 'Slower than expected for a GPU — check the GPU usage line above.'
              : 'CPU inference is limited. A smaller model will feel faster: `oi recommend`.'
            : undefined,
        });
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        const crash = classifyCrash(raw);
        checks.push({
          id: 'model',
          label: 'Active model',
          status: 'fail',
          value: `${model} — smoke test failed`,
          fix: crash ?? `Ollama returned: ${raw.slice(0, 160)}`,
        });
      }
    }
  } else {
    checks.push({ id: 'model', label: 'Active model', status: 'skip', value: 'runtime not reachable' });
    checks.push({ id: 'gpu', label: 'GPU usage', status: 'skip', value: 'runtime not reachable' });
    checks.push({ id: 'speed', label: 'Speed', status: 'skip', value: 'runtime not reachable' });
  }

  // 6. Disk headroom
  const disk = hw.diskFreeGb;
  if (disk <= 0) {
    checks.push({ id: 'disk', label: 'Disk', status: 'info', value: 'could not read free space' });
  } else {
    checks.push({
      id: 'disk',
      label: 'Disk',
      status: disk < 5 ? 'warn' : 'ok',
      value: `${disk} GB free${disk < 5 ? ' — low' : ''}`,
      fix: disk < 5 ? 'Free space or remove a model: `oi remove <model>`.' : undefined,
    });
  }

  const ok = !checks.some((c) => c.status === 'fail');
  return { ok, ollamaUrl: base, checks };
}

function render(report: DoctorReport): void {
  console.log('');
  console.log(`  ${BOLD}oi doctor${RESET}`);
  console.log('');
  const labelW = Math.max(...report.checks.map((c) => c.label.length)) + 1;
  for (const c of report.checks) {
    const label = c.label.padEnd(labelW);
    console.log(`  ${GLYPH[c.status]} ${label}  ${c.value}`);
    if (c.fix) {
      // Indent the fix under the value column.
      const pad = ' '.repeat(labelW + 5);
      for (const line of wrap(c.fix, 72)) console.log(`${pad}${DIM}${line}${RESET}`);
    }
  }
  console.log('');
  if (report.ok) {
    const warns = report.checks.filter((c) => c.status === 'warn').length;
    if (warns) console.log(`  ${YELLOW}${warns} warning${warns === 1 ? '' : 's'}${RESET} — see fixes above.\n`);
    else console.log(`  ${GREEN}All good.${RESET}\n`);
  } else {
    console.log(`  ${RED}Some checks failed${RESET} — see fixes above.\n`);
  }
}

/** Naive word-wrap for the indented fix lines. */
function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur.length + w.length + 1 > width) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function runDoctor(opts: { ollamaUrl?: string; json?: boolean } = {}): Promise<void> {
  const report = await collectDoctorReport(opts);
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    render(report);
  }
  if (!report.ok) process.exitCode = 1;
}
