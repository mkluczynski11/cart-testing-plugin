// The intent review specs/<slug>.intent.md as the harness sees it: is it there, which scenario hash does it review,
// and with which verdict. Implements design 8.5 ("the hash of the scenario for which an intent review exists") and 10.7.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { files } from '../core/config';
import type { ExampleFile } from '../core/example';
import type { CommandResult } from './common';

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

/**
 * qa-harness intent <slug>: is there an intent review for the scenario as confirmed? Prints the confirmed hash for
 * test-verifier to copy, and a last line "state: …". PASS only for a current INTENT_OK review (design 10.7, 3a).
 */
export function intentCommand(root: string, slug: string): CommandResult {
  const r = intentReview(root, slug);
  if (r.state === 'not-confirmed') {
    return { verdict: 'SPEC_INVALID', lines: [`Scenario ${slug} is not confirmed (no confirmed hash in specs/${slug}.example.json); the intent review comes after qa-harness example ${slug} --confirm.`, 'state: not-confirmed'] };
  }
  const head = `Scenario ${slug} is confirmed; scenario_sha256: ${r.confirmed}`;
  if (r.state === 'missing') return { verdict: 'SPEC_INVALID', lines: [head, `${r.file} does not exist; the test-verifier agent writes it (step 3a).`, 'state: missing'] };
  if (r.state === 'unreadable') return { verdict: 'SPEC_INVALID', lines: [head, `${r.file} has no "scenario_sha256: <64 hex>" or no "verdict: <VERDICT>" line in its front matter; it must be written again.`, 'state: unreadable'] };
  if (r.state === 'stale') return { verdict: 'SPEC_INVALID', lines: [head, `${r.file} reviews scenario ${r.reviewed?.slice(0, 12)}…, but the confirmed scenario is ${r.confirmed?.slice(0, 12)}…; the review is stale.`, 'state: stale'] };
  return { verdict: r.verdict === 'INTENT_OK' ? 'PASS' : 'SPEC_INVALID', lines: [head, `${r.file} reviews the confirmed scenario; its verdict is ${r.verdict}.`, `state: current ${r.verdict}`] };
}

/** The scenario hash for which a current INTENT_OK review exists, or null (recorded in verification.json, 8.5). */
export function intentOkHash(root: string, slug: string): string | null {
  const r = intentReview(root, slug);
  return r.state === 'current' && r.verdict === 'INTENT_OK' ? (r.reviewed ?? null) : null;
}
