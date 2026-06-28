import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export type HardwareProfile = {
  ramGb: number;
  cpuCores: number;
  vramGb: number;
  hasGpu: boolean;
  gpuName: string | null;
  platform: NodeJS.Platform;
  osLabel: string;
  diskFreeGb: number;
  /** Usable memory budget for model weights (GB). */
  budgetGb: number;
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

function detectDiskFreeGb(): number {
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

function memoryBudgetGb(ramGb: number, hasGpu: boolean, vramGb: number): number {
  // Scale OS reserve for small cloud VMs (e.g. AWS 4 GB → reports ~3.7 GB)
  const headroom = ramGb <= 4 ? 1.2 : ramGb <= 6 ? 2 : ramGb <= 8 ? 2.5 : 4;
  const ramBudget = Math.max(0.35, ramGb - headroom);

  if (hasGpu && vramGb > 0) {
    const vramBudget = Math.max(0, vramGb - 0.5);
    return Math.max(vramBudget, ramBudget * 0.6);
  }
  return ramBudget;
}

export function detectHardware(): HardwareProfile {
  const ramGb = roundGb(os.totalmem());
  const cpuCores = os.cpus().length;
  const { vramGb, name } = detectVram();
  const hasGpu = vramGb > 0;
  const diskFreeGb = detectDiskFreeGb();
  const budgetGb = memoryBudgetGb(ramGb, hasGpu, vramGb);

  return {
    ramGb,
    cpuCores,
    vramGb,
    hasGpu,
    gpuName: name,
    platform: process.platform,
    osLabel: osLabel(),
    diskFreeGb,
    budgetGb: Math.round(budgetGb * 10) / 10,
  };
}

export function formatHardware(hw: HardwareProfile): string {
  const gpu = hw.hasGpu
    ? `${hw.gpuName ?? 'GPU'} (${hw.vramGb} GB VRAM)`
    : 'CPU inference';
  return `${hw.ramGb} GB RAM · ${hw.cpuCores} cores · ${gpu}`;
}

export function ollamaModelsPath(): string {
  return path.join(os.homedir(), '.ollama', 'models');
}

/** Model fits if download size + reserve fits on disk. Tighter reserve on small disks. */
export function fitsDisk(modelSizeMb: number, diskFreeGb: number): boolean {
  if (diskFreeGb <= 0) return true;
  const reserveGb = diskFreeGb < 15 ? 0.8 : 2;
  const needGb = modelSizeMb / 1024 + reserveGb;
  return diskFreeGb >= needGb;
}
