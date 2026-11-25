// The intent review specs/<slug>.intent.md as the harness sees it: is it there, which scenario hash does it review,
// and with which verdict. Implements design 8.5 ("the hash of the scenario for which an intent review exists") and 10.7.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { files } from '../core/config';
import type { ExampleFile } from '../core/example';

export type IntentState = 'not-confirmed' | 'missing' | 'unreadable' | 'stale' | 'current';
export type IntentReview = { state: IntentState; confirmed?: string; reviewed?: string; verdict?: string; file: string };

export const intentFile = (root: string, slug: string) => path.join(root, 'specs', `${slug}.intent.md`);

/** The confirmed scenario hash of the example file, when the scenario is confirmed. */
export function confirmedHash(root: string, slug: string): string | undefined {
  const file = files.example(root, slug);
  if (!fs.existsSync(file)) return undefined;
  return (JSON.parse(fs.readFileSync(file, 'utf8')) as ExampleFile).confirmed?.scenarioSha256;
}

/** Read the two front-matter lines of the review and compare its hash with the confirmed scenario. */
export function intentReview(root: string, slug: string): IntentReview {
  const file = `specs/${slug}.intent.md`;
  const confirmed = confirmedHash(root, slug);
  if (!confirmed) return { state: 'not-confirmed', file };
  if (!fs.existsSync(intentFile(root, slug))) return { state: 'missing', confirmed, file };
  const text = fs.readFileSync(intentFile(root, slug), 'utf8');
  const reviewed = /^scenario_sha256:\s*([0-9a-f]{64})\s*$/m.exec(text)?.[1];
  const verdict = /^verdict:\s*([A-Z_]+)\s*$/m.exec(text)?.[1];
  if (!reviewed || !verdict) return { state: 'unreadable', confirmed, file };
  return { state: reviewed === confirmed ? 'current' : 'stale', confirmed, reviewed, verdict, file };
}

/** The verdict line of a run review (review.md in a run directory), when there is one. */
export function runReviewVerdict(runDir: string): string | undefined {
  const file = path.join(runDir, 'review.md');
  if (!fs.existsSync(file)) return undefined;
  return /^verdict:\s*([A-Z_]+)\s*$/m.exec(fs.readFileSync(file, 'utf8'))?.[1] ?? 'unreadable';
}
