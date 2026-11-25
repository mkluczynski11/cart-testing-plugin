// Unit tests of the readback form in report.md (design 11.2, 11.4; order G stage 2): the verdict first, the test case,
// every step with expected and actual apart, what backs the verdict, the page driver, the files and the rerun lines.
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { files } from '../support/core/config';
import { fileHash } from '../support/core/scenario';
import { buildReport, type Verification } from '../support/harness/report';
import { run } from '../support/harness/run';
import { prepare, workspace } from '../support/harness/selftest';

const SLUG = 'cart-total-add-change-remove';
const DRIVER = 'export function createDriver() { return {}; }\n';

type Cp = { step: string; action: string; total: string; comp: string; raw: string; result: 'pass' | 'fail' };
function checkpoint(c: Cp): Record<string, unknown> {
  return {
    step: c.step, action: c.action,
    ledger: [{ name: 'Steel Kettle', qty: 1, unitPrice: '$12.01', attrs: { energy_class: 'D' } }, { name: 'Paper Lamp', qty: 1, unitPrice: '$12.18', attrs: { energy_class: 'B' } }],
    expected: { empty: false, subtotal: c.total, adjustments: c.comp.includes('−') ? [{ rule: 'green-discount', amount: '0.61' }] : [], total: c.total, composition: `$${c.total} = ${c.comp}` },
    displayed: { empty: false, lines: [], total: { label: 'Total', value: c.raw.replace('$', ''), rawText: c.raw } },
    result: c.result, screenshot: `${c.step}.png`, ...(c.result === 'fail' ? { verdict: 'ORACLE_MISMATCH', layer: 'total' } : {}),
  };
}

const S1: Cp = { step: 'S1', action: 'add Steel Kettle, 1 unit', total: '12.01', comp: 'subtotal $12.01', raw: '$12.01', result: 'pass' };
const S2: Cp = { step: 'S2', action: 'add Paper Lamp, 1 unit', total: '23.58', comp: 'subtotal $24.19 − green-discount $0.61', raw: '$23.58', result: 'pass' };

/** A run directory with run.json, verification.json and, when given, review.md. */
function runDir(root: string, id: string, opts: { cps: Cp[]; verdict: string; gates: Record<string, string>; driverSha?: string | null; review?: string; error?: string }): string {
  const dir = path.join(files.runs(root, SLUG), id);
  fs.mkdirSync(dir, { recursive: true });
  const failed = opts.cps.some((c) => c.result === 'fail');
  const meta = { runId: id, slug: SLUG, timestamp: '2026-11-25T12:00:00Z', baseURL: 'https://shop.example', browser: 'chromium', locale: 'en-US', mode: 'live', checkpoints: ['S1', 'S2', 'S3', 'S4'] };
  const repeat = { n: 1, result: failed ? 'fail' : 'pass', status: 'passed', error: opts.error ? { message: opts.error, step: 'S2', rawTotal: '$24.19' } : null, checkpoints: opts.cps.map(checkpoint) };
  const repeats = failed ? [repeat] : [repeat, { ...repeat, n: 2 }, { ...repeat, n: 3 }];
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify({ meta, verdict: opts.verdict, repeats, errors: [] }));
  const row = (defect: string, result: string, hint?: string) => ({ defect, origin: 'default', why: `${defect} planted.`, result, expected: 'S2', firstRed: result === 'detected' ? 'S2' : null, hint });
  const ver = {
    runId: id, slug: SLUG, scenarioSha256: '', rulesSha256: '', testSha256: '', driverSha256: opts.driverSha === undefined ? null : opts.driverSha, testOrigin: 'compiled',
    gates: opts.gates, defects: [row('lost-add', 'detected'), row('round-down', 'not-applicable', 'Use other prices.')],
    ...(opts.gates.G4 ? {
      livePass: { defects: [row('lost-add', 'detected'), row('rule-boundary', 'not-applicable', 'Add a step at the threshold of rule green-discount.')], products: 'A = Steel Kettle 12.01' },
      controls: ['skew-total', 'drift-price', 'stale-cart', 'lost-remove'].map((control) => ({ control, result: 'caught', activated: true, target: 'row', shownAtRead: null, reactedAt: 'S1', expected: 'red' })),
    } : {}),
    gaps: [], verdict: opts.verdict,
  };
  fs.writeFileSync(path.join(dir, 'verification.json'), JSON.stringify(ver));
  if (opts.review) fs.writeFileSync(path.join(dir, 'review.md'), `---\nverdict: ${opts.review}\n---\n`);
  return dir;
}

const headings = (text: string) => text.split('\n').filter((l) => /^#{2,3} /.test(l));
const cells = (text: string, first: string) => text.split('\n').find((l) => l.startsWith(`| ${first} |`))?.split('|').slice(1, -1).map((c) => c.trim());

test('report.md of a verified run follows the readback form, section by section', () => {
  const root = workspace('unit-readback-green', [SLUG]);
  fs.writeFileSync(files.driver(root, 'reference'), DRIVER);
  const dir = runDir(root, '20990101T000000Z-gree', { cps: [S1, S2], verdict: 'PASS', gates: { dry: 'PASS', G3: 'PASS', G4: 'PASS' }, driverSha: fileHash(files.driver(root, 'reference')), review: 'VERIFIED' });
  const text = buildReport(root, SLUG, dir, 'screens/');
  expect(headings(text).slice(0, 9)).toEqual(['## PASS · test verified', '### Steps', '### Verification of the test', '### Not covered by this scenario',
    '### Pricing rules', '### Page driver', '### Files', '### Run it again', '### Defects']);
  expect(['Test', 'Objective', 'Status', 'Environment', 'Preconditions', 'Test data'].map((k) => cells(text, k)?.[0])).toEqual(['Test', 'Objective', 'Status', 'Environment', 'Preconditions', 'Test data']);
  expect(cells(text, 'Status')?.[1]).toBe('PASS, 3 of 3 repeats · verified');
  expect(cells(text, 'Environment')?.[1]).toBe('https://shop.example · Chromium · en-US · 2026-11-25 12:00 UTC · run `20990101T000000Z-gree`');
  expect(cells(text, 'Preconditions')?.[1]).toBe('empty cart, guest, no geolocation');
  expect(cells(text, 'Test data')?.[1]).toBe('A = Steel Kettle, $12.01, energy_class D · B = Paper Lamp, $12.18, energy_class B (read from the product pages in this run)');
  expect(cells(text, 'S1')?.slice(0, 5)).toEqual(['S1', 'add Steel Kettle, 1 unit', '$12.01', '"$12.01"', 'pass']);
  expect(cells(text, 'S2')?.slice(2, 3)).toEqual(['$23.58 = $24.19 − green-discount $0.61']);
  expect(cells(text, 'S2')?.[5]).toMatch(/^`.*reports\/cart-total-add-change-remove\/screens\/S2\.png`$/);
  expect(cells(text, 'S3')?.slice(3, 6)).toEqual(['—', 'not run', '—']);
  expect(cells(text, 'Defects on stub prices')?.[1]).toBe('1 of 1 detected at the right step, 1 not applicable');
  expect(cells(text, 'Live controls')?.[1]).toBe('4 of 4 caught');
  expect(cells(text, 'Report review')?.[1]).toMatch(/^VERIFIED/);
  expect(text).toContain('- rule-boundary: Add a step at the threshold of rule green-discount.');
  fs.writeFileSync(path.join(root, 'report.md'), text);
  expect(text).toMatch(/npm run qa -- run cart-total-add-change-remove --root \S+` \(1 repeat, with the report\)/);
});

test('a red run puts the failing step and its evidence directly under the verdict', () => {
  const root = workspace('unit-readback-red', [SLUG]);
  const red = { ...S2, raw: '$24.19', result: 'fail' as const };
  const dir = runDir(root, '20990101T000000Z-redd', { cps: [S1, red], verdict: 'ORACLE_MISMATCH', gates: { dry: 'PASS', G3: 'FAIL' }, error: 'S2 total: expected $23.58, displayed "$24.19"' });
  const text = buildReport(root, SLUG, dir, '');
  const lines = headings(text);
  expect(lines.slice(0, 2)).toEqual(['## ORACLE_MISMATCH · amounts differ', '### Failing step']);
  const failing = text.slice(text.indexOf('### Failing step'), text.indexOf('| Test |'));
  expect(failing).toContain('S2 total: expected $23.58, displayed "$24.19"');
  expect(cells(text, 'S2')?.slice(3, 5)).toEqual(['"$24.19"', 'fail']);
  expect(cells(text, 'S4')?.[4]).toBe('not run');
  expect(cells(text, 'Live controls')?.[1]).toBe('not run (the live run is red)');
});

test('Page driver says where the driver came from and whether this flow changed it', () => {
  const root = workspace('unit-readback-driver', [SLUG]);
  fs.writeFileSync(files.driver(root, 'reference'), DRIVER);
  const sha = fileHash(files.driver(root, 'reference'));
  fs.writeFileSync(path.join(root, 'app', 'starter-pack.json'), JSON.stringify({ app: 'reference', files: { 'reference.driver.ts': sha } }));
  const first = runDir(root, '20990101T000000Z-aaaa', { cps: [S1], verdict: 'PASS', gates: { dry: 'PASS' }, driverSha: sha });
  const pack = buildReport(root, SLUG, first, '');
  const driverSection = (t: string) => t.slice(t.indexOf('### Page driver'), t.indexOf('### Files'));
  expect(driverSection(pack)).toContain("the plugin's starter pack for reference");
  expect(driverSection(pack)).toContain('This flow did not change it');
  expect(driverSection(pack)).toContain('candidates, productFacts, readCart, addProduct, setQuantity, remove');

  fs.rmSync(path.join(root, 'app', 'starter-pack.json'));
  fs.rmSync(first, { recursive: true });
  runDir(root, '20990101T000000Z-bbbb', { cps: [], verdict: 'PASS', gates: { dry: 'PASS' }, driverSha: null });
  fs.writeFileSync(files.driver(root, 'reference'), DRIVER + '// built\n');
  const built = runDir(root, '20990101T000000Z-cccc', { cps: [S1], verdict: 'PASS', gates: { dry: 'PASS', G3: 'PASS' }, driverSha: fileHash(files.driver(root, 'reference')) });
  expect(driverSection(buildReport(root, SLUG, built, ''))).toContain('built in this flow');
});

test('a dry run writes report.md in the same form: dry heading, every step not run, live rows not run', async () => {
  const root = workspace('unit-readback-dry', [SLUG]);
  prepare(root, SLUG);
  const r = await run(root, SLUG, { dry: true });
  const file = path.join(files.runs(root, SLUG), r.data?.runId as string, 'report.md');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  expect(headings(text)[0]).toBe('## PASS · dry gates only, not run live');
  expect([cells(text, 'S1')?.[4], cells(text, 'Live run')?.[1], cells(text, 'Live controls')?.[1]]).toEqual(['not run', 'not run (dry run)', 'not run (dry run)']);
  expect(cells(text, 'Test data')?.[1]).toMatch(/^A = Product A, \$10\.00, energy_class A · B = Product B, \$20\.00, energy_class C \(stub products/);
});
