// Repair attempts of one scenario in reports/<slug>/attempts.json (outside the repo).
// Implements R9 and order N, 6.5: a retry needs a changed file; the third attempt is refused.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { files } from '../core/config';
import { fileHash } from '../core/scenario';
import type { Verdict } from '../core/verdicts';

export type RepairTarget = 'driver' | 'test';
export type Attempt = { attempt: number; runId: string | null; verdict: Verdict | null; target: RepairTarget; artifactShaBefore: string; reason: string };

export const ATTEMPT_LIMIT = 2;

const fileOf = (root: string, slug: string, app: string, target: RepairTarget) => (target === 'driver' ? files.driver(root, app) : files.test(root, slug));
const attemptsFile = (root: string, slug: string) => path.join(files.reports(root, slug), 'attempts.json');

export function readAttempts(root: string, slug: string): Attempt[] {
  const f = attemptsFile(root, slug);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) as Attempt[] : [];
}

/** Admit a repair run, or say why not: RETRY_REFUSED for an unchanged file, LIMIT_REACHED after the limit. Call under the lock. */
export function admitRepair(root: string, slug: string, app: string, target: RepairTarget): { ok: true; attempt: Attempt } | { ok: false; verdict: Verdict; line: string } {
  const all = readAttempts(root, slug);
  if (all.length >= ATTEMPT_LIMIT) {
    const last = all[all.length - 1];
    return { ok: false, verdict: 'LIMIT_REACHED', line: `${all.length} repair attempts of ${slug} are recorded, the limit; the last ended ${last.verdict} (run ${last.runId}). Hand the matter to the tester.` };
  }
  const sha = fileHash(fileOf(root, slug, app, target));
  const previous = [...all].reverse().find((a) => a.target === target);
  if (previous && previous.artifactShaBefore === sha) {
    return { ok: false, verdict: 'RETRY_REFUSED', line: `The ${target} is unchanged since repair attempt ${previous.attempt} (sha256 ${sha.slice(0, 12)}…); change the premise before another run.` };
  }
  const attempt: Attempt = { attempt: all.length + 1, runId: null, verdict: null, target, artifactShaBefore: sha, reason: `repair of the ${target}` };
  fs.mkdirSync(files.reports(root, slug), { recursive: true });
  fs.writeFileSync(attemptsFile(root, slug), JSON.stringify([...all, attempt], null, 2) + '\n');
  return { ok: true, attempt };
}

/** Record how an admitted attempt ended. Call under the lock. */
export function closeAttempt(root: string, slug: string, attempt: number, runId: string, verdict: Verdict): void {
  const all = readAttempts(root, slug).map((a) => (a.attempt === attempt ? { ...a, runId, verdict } : a));
  fs.writeFileSync(attemptsFile(root, slug), JSON.stringify(all, null, 2) + '\n');
}
