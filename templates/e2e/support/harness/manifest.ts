// The integrity manifest support/core/MANIFEST.json: SHA-256 of every file of support/core and support/harness.
// Implements R4 and order N, section 6.4.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { packageRoot } from '../core/config';
import { sha256 } from '../core/scenario';

export const MANIFEST = () => path.join(packageRoot(), 'support', 'core', 'MANIFEST.json');

function listFiles(dir: string, base: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return listFiles(full, base);
    return e.name === 'MANIFEST.json' ? [] : [path.relative(base, full).split(path.sep).join('/')];
  });
}

/** Hashes of the library and the harness as they are on disk now. */
export function currentHashes(): Record<string, string> {
  const base = packageRoot();
  const out: Record<string, string> = {};
  for (const sub of ['support/core', 'support/harness']) {
    for (const f of listFiles(path.join(base, sub), base).sort()) out[f] = sha256(fs.readFileSync(path.join(base, f)));
  }
  return out;
}

export function writeManifest(): number {
  const hashes = currentHashes();
  fs.writeFileSync(MANIFEST(), JSON.stringify(hashes, null, 2) + '\n');
  return Object.keys(hashes).length;
}

/** Files added, removed or changed since the manifest was written. */
export function manifestChanges(): string[] {
  if (!fs.existsSync(MANIFEST())) return ['support/core/MANIFEST.json is missing'];
  const recorded = JSON.parse(fs.readFileSync(MANIFEST(), 'utf8')) as Record<string, string>;
  const now = currentHashes();
  const names = [...new Set([...Object.keys(recorded), ...Object.keys(now)])].sort();
  return names.filter((n) => recorded[n] !== now[n]).map((n) => (!recorded[n] ? `${n} (added)` : !now[n] ? `${n} (removed)` : `${n} (changed)`));
}
