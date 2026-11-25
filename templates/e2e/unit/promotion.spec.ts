// Unit tests of support/harness/report.ts: which runs may be promoted (design 8.5, report V B1 and F6), and what
// report.md says about the reviews (report D, request 3). One scratch root; run directories are written by hand.
import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { files } from '../support/core/config';
import { report, type Verification } from '../support/harness/report';
import { prepare, workspace } from '../support/harness/selftest';

const SLUG = 'cart-total-add-change-remove';
let root = '';

/** A run directory with a verification.json (unless `over` is null) and a run.json (unless `runJson` is false). */
function fakeRun(id: string, over: Partial<Verification> | null, runJson = true): string {
  const dir = path.join(files.runs(root, SLUG), id);
  fs.mkdirSync(dir, { recursive: true });
  const base: Verification = { runId: id, slug: SLUG, scenarioSha256: '', rulesSha256: '', testSha256: '', driverSha256: null, testOrigin: 'compiled', gates: {}, defects: [], gaps: [], verdict: 'PASS' };
  if (over) fs.writeFileSync(path.join(dir, 'verification.json'), JSON.stringify({ ...base, ...over }, null, 2));
  if (runJson) fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify({ meta: { runId: id, mode: 'live' }, verdict: over?.verdict ?? 'PASS', repeats: [], errors: [] }));
  return dir;
}

/** The hash of the tracked set in reports/<slug>/: every file with its relative path. */
function trackedHash(): string {
  const dir = files.reports(root, SLUG);
  const h = createHash('sha256');
  const walk = (d: string) => {
    for (const f of fs.readdirSync(d).sort()) {
      const p = path.join(d, f);
      if (f === 'runs' || f === 'attempts.json') continue;
      if (fs.statSync(p).isDirectory()) walk(p);
      else h.update(`${path.relative(dir, p)}\n`).update(fs.readFileSync(p));
    }
  };
  walk(dir);
  return h.digest('hex');
}

const VERIFIED = { gates: { dry: 'PASS', G3: 'PASS', G2live: 'PASS', G4: 'PASS' }, verdict: 'PASS' } as const;
const MISMATCH = { gates: { dry: 'PASS', G3: 'ORACLE_MISMATCH' }, verdict: 'ORACLE_MISMATCH' } as const;

test.beforeAll(async () => {
  root = workspace('unit-promotion', [SLUG]);
  prepare(root, SLUG);
  const good = fakeRun('20990101T000000Z-good', VERIFIED);
  fs.writeFileSync(path.join(good, 'review.md'), `---\nscenario: ${SLUG}\nrun: 20990101T000000Z-good\nverdict: VERIFIED\n---\n`);
  await report(root, SLUG, '20990101T000000Z-good');
});

/** Try to promote a run; the result's verdict and whether the tracked set kept every byte. */
async function attempt(id: string, asEvidence = false): Promise<{ verdict: string; unchanged: boolean }> {
  const before = trackedHash();
  const r = await report(root, SLUG, id, asEvidence);
  return { verdict: r.verdict, unchanged: trackedHash() === before };
}

test('promotion: a dry run that passed is refused with NO_TESTS_RUN and the set kept', async () => {
  fakeRun('20990101T000010Z-dry', { gates: { dry: 'PASS' }, verdict: 'PASS' }, false);
  expect(await attempt('20990101T000010Z-dry')).toEqual({ verdict: 'NO_TESTS_RUN', unchanged: true });
});

test('promotion: a dry run that ended DEFECT_LATE is refused with DEFECT_LATE', async () => {
  fakeRun('20990101T000001Z-late', { gates: { dry: 'DEFECT_LATE' }, verdict: 'DEFECT_LATE' }, false);
  expect(await attempt('20990101T000001Z-late')).toEqual({ verdict: 'DEFECT_LATE', unchanged: true });
});

test('promotion: a run without verification.json is refused with NO_TESTS_RUN', async () => {
  fakeRun('20990101T000002Z-nover', null);
  expect(await attempt('20990101T000002Z-nover')).toEqual({ verdict: 'NO_TESTS_RUN', unchanged: true });
});

test('promotion: a green live run without G4 is refused with NO_TESTS_RUN', async () => {
  fakeRun('20990101T000003Z-nog4', { gates: { dry: 'PASS', G3: 'PASS', G2live: 'PASS' }, verdict: 'PASS' });
  expect(await attempt('20990101T000003Z-nog4')).toEqual({ verdict: 'NO_TESTS_RUN', unchanged: true });
});

test('promotion: a red live run is refused with its own verdict', async () => {
  fakeRun('20990101T000004Z-red', MISMATCH);
  expect(await attempt('20990101T000004Z-red')).toEqual({ verdict: 'ORACLE_MISMATCH', unchanged: true });
});

test('promotion: a run whose G4 missed a control is refused with CONTROL_MISSED', async () => {
  fakeRun('20990101T000005Z-miss', { gates: { dry: 'PASS', G3: 'PASS', G4: 'CONTROL_MISSED' }, verdict: 'CONTROL_MISSED' });
  expect(await attempt('20990101T000005Z-miss')).toEqual({ verdict: 'CONTROL_MISSED', unchanged: true });
});

test('promotion: --as-evidence does not admit a dry run', async () => {
  expect(await attempt('20990101T000001Z-late', true)).toEqual({ verdict: 'DEFECT_LATE', unchanged: true });
});

test('promotion: --as-evidence does not admit a live run that ended LOCATOR_FAIL', async () => {
  fakeRun('20990101T000006Z-loc', { gates: { dry: 'PASS', G3: 'LOCATOR_FAIL' }, verdict: 'LOCATOR_FAIL' });
  expect(await attempt('20990101T000006Z-loc', true)).toEqual({ verdict: 'LOCATOR_FAIL', unchanged: true });
});

test('promotion: --as-evidence puts an amount mismatch in the repo, says so in the first line and keeps the verdict', async () => {
  fakeRun('20990101T000007Z-evid', MISMATCH);
  const r = await report(root, SLUG, '20990101T000007Z-evid', true);
  const first = fs.readFileSync(path.join(files.reports(root, SLUG), 'report.md'), 'utf8').split('\n')[0];
  expect({ verdict: r.verdict, evidence: /evidence of a mismatch, not a verified test/i.test(first) }).toEqual({ verdict: 'ORACLE_MISMATCH', evidence: true });
});

test('promotion: a verified live run is promoted with PASS', async () => {
  fakeRun('20990101T000008Z-good2', VERIFIED);
  expect((await report(root, SLUG, '20990101T000008Z-good2')).verdict).toBe('PASS');
});

test('report.md of a promoted verified run names the intent review and the report review with their verdicts', async () => {
  const sha = (JSON.parse(fs.readFileSync(files.example(root, SLUG), 'utf8')) as { confirmed: { scenarioSha256: string } }).confirmed.scenarioSha256;
  fs.writeFileSync(path.join(root, 'specs', `${SLUG}.intent.md`), `---\nscenario: ${SLUG}\nscenario_sha256: ${sha}\nverdict: INTENT_OK\n---\n`);
  const dir = fakeRun('20990101T000009Z-rev', VERIFIED);
  fs.writeFileSync(path.join(dir, 'review.md'), `---\nscenario: ${SLUG}\nrun: 20990101T000009Z-rev\nverdict: VERIFIED\n---\n`);
  await report(root, SLUG, '20990101T000009Z-rev');
  const text = fs.readFileSync(path.join(files.reports(root, SLUG), 'report.md'), 'utf8');
  expect({ intent: /intent review[^\n]*INTENT_OK/i.test(text), review: /report review[^\n]*VERIFIED/i.test(text), none: /none is part of this run/.test(text) }).toEqual({ intent: true, review: true, none: false });
});

test('report without --promote ends with the verdict of the run it reports', async () => {
  fakeRun('20991231T235959Z-last', MISMATCH);
  expect((await report(root, SLUG, undefined)).verdict).toBe('ORACLE_MISMATCH');
});
