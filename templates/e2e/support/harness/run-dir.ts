// Run directories reports/<slug>/runs/<runId>/ and the per-scenario lock.
// Implements design 8.5 (one directory per run, exclusive creation) and order N, section 6.5.
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { files } from '../core/config';
import { ConditionError } from '../core/verdicts';

/** A run id: the UTC timestamp YYYYMMDDTHHMMSSZ and four hex characters. */
export function newRunId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `${stamp}-${randomBytes(2).toString('hex')}`;
}

/** Create a new run directory exclusively; on a collision another suffix is drawn. */
export function createRunDir(root: string, slug: string): { runId: string; dir: string } {
  const runs = files.runs(root, slug);
  fs.mkdirSync(runs, { recursive: true });
  for (;;) {
    const runId = newRunId();
    const dir = path.join(runs, runId);
    try {
      fs.mkdirSync(dir);
      return { runId, dir };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
}

const STALE_MS = 10 * 60_000;

/** Hold reports/<slug>/.lock while `fn` runs; a lock older than 10 minutes is stale and replaced. */
export async function withLock<T>(root: string, slug: string, fn: () => Promise<T> | T): Promise<T> {
  const dir = files.reports(root, slug);
  fs.mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, '.lock');
  try {
    fs.writeFileSync(lock, `${process.pid}\n`, { flag: 'wx' });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    if (Date.now() - fs.statSync(lock).mtimeMs < STALE_MS) {
      throw new ConditionError(`Another run of ${slug} holds ${path.relative(root, lock)} (pid ${fs.readFileSync(lock, 'utf8').trim() || 'unknown'}); wait for it to finish and run the command again, or delete the file if no run is active.`, 'INFRA_FAIL');
    }
    fs.writeFileSync(lock, `${process.pid}\n`);
  }
  try {
    return await fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}
