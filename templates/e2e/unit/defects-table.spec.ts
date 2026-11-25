// Unit tests of the defects the tester sees (design 10.2–10.5, 11.1, 11.4; order E, stage 1): the table of every defect
// in report.md, read from verification.json; the `why` that G2 records; the line of `defects check` before "Confirm?".
import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { files } from '../support/core/config';
import { deriveDefects } from '../support/core/operators';
import { loadScenario } from '../support/harness/common';
import { defectsCommand } from '../support/harness/defects';
import { exampleProducts, expectedPlace, gateG2, simulate } from '../support/harness/gates';
import { buildReport, type Verification } from '../support/harness/report';
import { prepare, workspace } from '../support/harness/selftest';

const SLUG = 'cart-total-add-change-remove';
let root = '';

test.beforeAll(() => {
  root = workspace('unit-defects-table', [SLUG]);
  prepare(root, SLUG);
});

const row = (defect: string, origin: string, why: string, result: string, firstRed: string | null) =>
  ({ defect, origin, operator: 'no-effect', why, result, expected: firstRed ?? 'S2', firstRed });

test('report.md lists every defect with origin, why, and result and first red of both passes', () => {
  const id = '20990101T000000Z-tabl';
  const dir = path.join(files.runs(root, SLUG), id);
  fs.mkdirSync(dir, { recursive: true });
  const stub = [
    row('lost-add', 'default', 'The add is acknowledged and changes nothing.', 'detected', 'S1'),
    row('risk-stale-decrease', 'tester', 'The total does not refresh after a decrease.', 'detected-late', 'S4'),
    row('gen-skew-subtotal', 'generated', 'The subtotal is one cent high.', 'missed', null),
    row('round-down', 'default', 'Amounts are truncated at the cent.', 'not-applicable', null),
  ];
  const live = [
    row('lost-add', 'default', 'The add is acknowledged and changes nothing.', 'detected', 'S1'),
    row('risk-stale-decrease', 'tester', 'The total does not refresh after a decrease.', 'detected', 'S3'),
    row('gen-skew-subtotal', 'generated', 'The subtotal is one cent high.', 'not-applicable', null),
    row('round-down', 'default', 'Amounts are truncated at the cent.', 'missed', null),
  ];
  const ver = { runId: id, slug: SLUG, scenarioSha256: '', rulesSha256: '', testSha256: '', driverSha256: null, testOrigin: 'compiled', gates: { dry: 'PASS', G3: 'PASS' }, defects: stub, livePass: { defects: live, products: 'A = Steel Kettle $12.01' }, gaps: [], verdict: 'PASS' } as unknown as Verification;
  fs.writeFileSync(path.join(dir, 'verification.json'), JSON.stringify(ver, null, 2));
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify({ meta: { runId: id, mode: 'live' }, verdict: 'PASS', repeats: [], errors: [] }));
  const text = buildReport(root, SLUG, dir, 'screens/');
  const cells = (defect: string) => text.split('\n').find((l) => l.startsWith(`| ${defect} |`))?.split('|').slice(1, -1).map((c) => c.trim());
  expect(text).toMatch(/^### Defects$/m);
  expect(cells('lost-add')).toEqual(['lost-add', 'default', 'The add is acknowledged and changes nothing.', 'detected', 'S1', 'detected', 'S1']);
  expect(cells('risk-stale-decrease')).toEqual(['risk-stale-decrease', 'tester', 'The total does not refresh after a decrease.', 'detected-late', 'S4', 'detected', 'S3']);
  expect(cells('gen-skew-subtotal')).toEqual(['gen-skew-subtotal', 'generated', 'The subtotal is one cent high.', 'missed', '—', 'not-applicable', '—']);
  expect(cells('round-down')).toEqual(['round-down', 'default', 'Amounts are truncated at the cent.', 'not-applicable', '—', 'missed', '—']);
});

test('G2 records the why of each defect in its row', async () => {
  const got = loadScenario(root, SLUG);
  if (!got.ok) throw new Error(got.result.lines.join('\n'));
  const loaded = got.loaded;
  const products = exampleProducts(loaded);
  const healthy = await simulate(loaded, products);
  const defaults = deriveDefects(loaded.scenario, loaded.pricing.rules);
  const gaps = [];
  for (const d of defaults) if (!expectedPlace(loaded, healthy, await simulate(loaded, products, d))) gaps.push(d);
  expect(gaps.length).toBeGreaterThan(0);
  const g2 = await gateG2(loaded, path.join(root, 'g2-why'), products, gaps.slice(0, 1));
  expect(g2.rows.map((r) => ({ result: r.result, why: (r as { why?: string }).why }))).toEqual([{ result: 'not-applicable', why: gaps[0].why }]);
});

test('defects check prints the number of defects by origin and where the full list will be, before any file exists', async () => {
  const r = await defectsCommand(root, SLUG, 'check');
  const n = deriveDefects(loadOrThrow().scenario, loadOrThrow().pricing.rules).length;
  expect(r.verdict).toBe('PASS');
  expect(r.lines[0]).toBe(`The test will be checked against ${n} defects: ${n} default, 0 tester, 0 generated; the full list will be in ${path.relative(spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim(), path.join(fs.realpathSync(root), 'reports', SLUG, 'report.md'))}.`);
});

test('defects check names a tester defect, and with --extended the generated defects still to come', async () => {
  fs.writeFileSync(files.defects(root, SLUG), JSON.stringify([{ id: 'risk-total-after-decrease', origin: 'tester', operator: 'stale-value', target: { value: 'total' }, when: { afterStep: 'setQty', direction: 'decrease' }, why: 'The total does not refresh after a decrease.' }], null, 2));
  try {
    const n = deriveDefects(loadOrThrow().scenario, loadOrThrow().pricing.rules).length;
    const plain = await defectsCommand(root, SLUG, 'check');
    expect(plain.lines[0]).toMatch(new RegExp(`^The test will be checked against ${n + 1} defects: ${n} default, 1 tester \\(risk-total-after-decrease\\), 0 generated; the full list will be in `));
    const extended = await defectsCommand(root, SLUG, 'check', { extended: true });
    expect(extended.lines[0]).toMatch(new RegExp(`^The test will be checked against ${n + 1} defects: ${n} default, 1 tester \\(risk-total-after-decrease\\), 0 generated, plus at most 8 generated defects that qa:defect-designer designs after the intent review; the full list will be in `));
  } finally {
    fs.rmSync(files.defects(root, SLUG));
  }
});

function loadOrThrow() {
  const got = loadScenario(root, SLUG);
  if (!got.ok) throw new Error(got.result.lines.join('\n'));
  return got.loaded;
}
