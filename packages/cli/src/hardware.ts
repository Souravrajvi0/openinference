import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** Minimum VRAM (GB) for a GPU to actually help run models. Below this,
 *  Ollama falls back to CPU, so a tiny GPU shouldn't change the budget. */
const MIN_USEFUL_VRAM_GB = 4;

export type HardwareProfile = {
  ramGb: number;
  cpuCores: number;
  vramGb: number;
  /** A GPU is physically present (any VRAM). Used for display. */
  hasGpu: boolean;
  /** The GPU has enough VRAM to offload models. Used for all sizing decisions. */
  gpuUsable: boolean;
  gpuName: string | null;
  platform: NodeJS.Platform;
  osLabel: string;
  diskFreeGb: number;
  /** Usable memory budget for model weights (GB). */
  budgetGb: number;
  /** ISO timestamp of when the (cached) GPU/CPU/RAM scan was taken. */
  scannedAt: string;
  /** True when the stable hardware came from cache rather than a fresh probe. */
  fromCache: boolean;
};

function roundGb(bytes: number): number {
  return Math.round((bytes / 1024 ** 3) * 10) / 10;
}

function detectVram(): { vramGb: number; name: string | null } {
  try {
    const r = spawnSync('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });
    if (r.status !== 0 || !r.stdout?.trim()) return { vramGb: 0, name: null };
    const line = r.stdout.trim().split('\n')[0] ?? '';
    const comma = line.lastIndexOf(',');
    if (comma === -1) return { vramGb: 0, name: null };
    const name = line.slice(0, comma).trim();
    const mb = parseInt(line.slice(comma + 1).trim(), 10);
    if (Number.isNaN(mb)) return { vramGb: 0, name };
    return { vramGb: Math.round((mb / 1024) * 10) / 10, name };
  } catch {
    return { vramGb: 0, name: null };
  }
}

export function detectDiskFreeGb(): number {
  const home = os.homedir();

  if (process.platform === 'win32') {
    const drive = path.parse(home).root || 'C:\\';
    const ps = spawnSync(
      'powershell',
      ['-NoProfile', '-Command', `(Get-PSDrive -Name '${drive.replace(':\\', '')}').Free`],
      { encoding: 'utf8', timeout: 8000, windowsHide: true },
    );
    if (ps.status === 0 && ps.stdout?.trim()) {
      const bytes = parseInt(ps.stdout.trim(), 10);
      if (!Number.isNaN(bytes)) return roundGb(bytes);
    }
  }

  try {
    const st = fs.statfsSync(home);
    return roundGb(st.bfree * st.bsize);
  } catch {
    return 0;
  }
}

function osLabel(): string {
  const type = os.type();
  const rel = os.release();
  if (type === 'Windows_NT') return `Windows ${rel}`;
  if (type === 'Darwin') return `macOS ${rel}`;
  return `${type} ${rel}`;
}

function memoryBudgetGb(ramGb: number, gpuUsable: boolean, vramGb: number): number {
  // Scale OS reserve for small cloud VMs (e.g. AWS 4 GB → reports ~3.7 GB)
  const headroom = ramGb <= 4 ? 1.2 : ramGb <= 6 ? 2 : ramGb <= 8 ? 2.5 : 4;
  const ramBudget = Math.max(0.35, ramGb - headroom);

  // A usable GPU can only *raise* the ceiling (full offload up to VRAM).
  // It must never drop below what the CPU alone could run.
  if (gpuUsable && vramGb > 0) {
    const vramBudget = Math.max(0, vramGb - 0.5);
    return Math.max(vramBudget, ramBudget);
  }
  return ramBudget;
}

// ── scan cache ──────────────────────────────────────────
// RAM/CPU/GPU almost never change, but probing the GPU (`nvidia-smi`, up to a
// 5s timeout) is slow. Cache the stable parts keyed by an instant RAM+CPU
// fingerprint; if the machine changes, the fingerprint misses and we re-probe.
// Disk is always read fresh (it changes constantly).
type HwCache = { fingerprint: string; vramGb: number; gpuName: string | null; scannedAt: string };

function hwCachePath(): string {
  return path.join(os.homedir(), '.openinference', 'hardware.json');
}

function loadHwCache(): HwCache | null {
  try {
    return JSON.parse(fs.readFileSync(hwCachePath(), 'utf8')) as HwCache;
  } catch {
    return null;
  }
}

function saveHwCache(c: HwCache): void {
  try {
    fs.mkdirSync(path.dirname(hwCachePath()), { recursive: true });
    fs.writeFileSync(hwCachePath(), JSON.stringify(c, null, 2) + '\n', 'utf8');
  } catch {
    /* cache is best-effort */
  }
}

export function detectHardware(opts: { fresh?: boolean } = {}): HardwareProfile {
  const ramGb = roundGb(os.totalmem());
  const cpuCores = os.cpus().length;
  const fingerprint = `${ramGb}|${cpuCores}`;

  let vramGb: number;
  let name: string | null;
  let scannedAt: string;
  let fromCache = false;

  const cached = opts.fresh ? null : loadHwCache();
  if (cached && cached.fingerprint === fingerprint) {
    vramGb = cached.vramGb;
    name = cached.gpuName;
    scannedAt = cached.scannedAt;
    fromCache = true;
  } else {
    const g = detectVram();
    vramGb = g.vramGb;
    name = g.name;
    scannedAt = new Date().toISOString();
    saveHwCache({ fingerprint, vramGb, gpuName: name, scannedAt });
  }

  const hasGpu = vramGb > 0;
  const gpuUsable = vramGb >= MIN_USEFUL_VRAM_GB;
  const diskFreeGb = detectDiskFreeGb();
  const budgetGb = memoryBudgetGb(ramGb, gpuUsable, vramGb);

  return {
    ramGb,
    cpuCores,
    vramGb,
    hasGpu,
    gpuUsable,
    gpuName: name,
    platform: process.platform,
    osLabel: osLabel(),
    diskFreeGb,
    budgetGb: Math.round(budgetGb * 10) / 10,
    scannedAt,
    fromCache,
  };
}

export function formatHardware(hw: HardwareProfile): string {
  let gpu: string;
  if (!hw.hasGpu) gpu = 'CPU inference';
  else if (hw.gpuUsable) gpu = `${hw.gpuName ?? 'GPU'} (${hw.vramGb} GB VRAM)`;
  else gpu = `${hw.gpuName ?? 'GPU'} (${hw.vramGb} GB — too small, using CPU)`;
  return `${hw.ramGb} GB RAM · ${hw.cpuCores} cores · ${gpu}`;
}

export function ollamaModelsPath(): string {
  return path.join(os.homedir(), '.ollama', 'models');
}

/** ≤4 GB RAM, CPU-only — only sub-1B models are realistic. */
export function isTinyVm(hw: HardwareProfile): boolean {
  return !hw.gpuUsable && hw.ramGb < 4;
}

/** ≤6 GB RAM, CPU-only — cap around 1B class. */
export function isSmallVm(hw: HardwareProfile): boolean {
  return !hw.gpuUsable && hw.ramGb < 6;
}

/** Model fits if download size + reserve fits on disk. Tighter reserve on small disks. */
export function fitsDisk(modelSizeMb: number, diskFreeGb: number): boolean {
  if (diskFreeGb <= 0) return true;
  const reserveGb = diskFreeGb < 15 ? 0.8 : 2;
  const needGb = modelSizeMb / 1024 + reserveGb;
  return diskFreeGb >= needGb;
}
