import fs from 'node:fs';
import path from 'node:path';

/** Single source of truth: read version from the package's own package.json. */
function readVersion(): string {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const VERSION = readVersion();
