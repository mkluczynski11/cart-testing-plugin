// Unit tests of the intent review as the harness sees it (report D request 2, design 8.5 and 10.7): the `intent`
// subcommand, the hash in verification.json, doctor on a stale review; and browserAllowedOrigins (request 4).
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { files, loadConfig } from '../support/core/config';
import { doctor } from '../support/harness/doctor';
import { intentCommand } from '../support/harness/intent';
import { run } from '../support/harness/run';
import { prepare, workspace } from '../support/harness/selftest';

const REF = 'cart-total-add-change-remove';
const confirmed = (root: string) => (JSON.parse(fs.readFileSync(files.example(root, REF), 'utf8')) as { confirmed: { scenarioSha256: string } }).confirmed.scenarioSha256;
const review = (root: string, sha: string, verdict = 'INTENT_OK') => fs.writeFileSync(path.join(root, 'specs', `${REF}.intent.md`), `---\nscenario: ${REF}\nscenario_sha256: ${sha}\nverdict: ${verdict}\n---\n`);

test('intent: no review is SPEC_INVALID with state missing, and the confirmed hash is printed', () => {
  const root = workspace('unit-intent-missing', [REF]);
  prepare(root, REF);
  const r = intentCommand(root, REF);
  expect({ verdict: r.verdict, state: r.lines.at(-1), hash: r.lines.some((l) => l.includes(confirmed(root))) }).toEqual({ verdict: 'SPEC_INVALID', state: 'state: missing', hash: true });
});

test('intent: a review of another scenario hash is stale', () => {
  const root = workspace('unit-intent-stale', [REF]);
  prepare(root, REF);
  review(root, 'a'.repeat(64));
  expect(intentCommand(root, REF).lines.at(-1)).toBe('state: stale');
});

test('intent: a current INTENT_OK review is PASS', () => {
  const root = workspace('unit-intent-ok', [REF]);
  prepare(root, REF);
  review(root, confirmed(root));
  expect(intentCommand(root, REF).verdict).toBe('PASS');
});

test('verification.json records the scenario hash for which a current INTENT_OK review exists', async () => {
  const root = workspace('unit-intent-record', [REF]);
  prepare(root, REF);
  review(root, confirmed(root));
  const r = await run(root, REF, { dry: true });
  const v = JSON.parse(fs.readFileSync(path.join(files.runs(root, REF), r.data?.runId as string, 'verification.json'), 'utf8')) as { intentSha256?: string | null };
  expect(v.intentSha256).toBe(confirmed(root));
});

test('doctor reports a stale intent review of a verified scenario as VERIFICATION_STALE', () => {
  const root = workspace('unit-intent-doctor', [REF]);
  prepare(root, REF);
  review(root, 'b'.repeat(64));
  fs.mkdirSync(files.reports(root, REF), { recursive: true });
  fs.writeFileSync(path.join(files.reports(root, REF), 'verification.json'), JSON.stringify({ testSha256: '', driverSha256: null, rulesSha256: '' }));
  expect(doctor(root, false).lines.some((l) => /^VERIFICATION_STALE: .*intent review/.test(l))).toBe(true);
});

test('qa.config.json keeps browserAllowedOrigins, empty by default', () => {
  const root = workspace('unit-origins', [], { browserAllowedOrigins: ['https://api.shop.example'] });
  const bare = workspace('unit-origins-bare', []);
  expect([loadConfig(root).browserAllowedOrigins, loadConfig(bare).browserAllowedOrigins]).toEqual([['https://api.shop.example'], []]);
});
