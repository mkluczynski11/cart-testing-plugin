// qa-harness selftest: the harness's own test, one row per area of design 10.8.
// Every case works in its own workspace under reports/selftest/runs/<case>/, whose support/ is a symlink
// to this package, so compiled tests keep their fixed import path. No live application is used.
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { reservedNames } from '../core/compiler';
import { files, packageRoot } from '../core/config';
import { amountFormat, parseAmount, roundToCents } from '../core/money';
import { ReferenceCart } from '../core/reference-cart';
import { selectProduct } from '../core/selection';
import type { CurrencyCode } from '../core/types';
import { classify } from '../core/classification';
import type { CommandResult, Loaded } from './common';
import { loadScenario } from './common';
import { compile } from './compile';
import { example } from './example';
import { dryRun, exampleCatalog, exampleProducts, gateG1, gateG2 } from './gates';
import { manifestChanges } from './manifest';
import { run } from './run';
import { startControlApp } from './control-app/server';
import { verify } from './verify';
import { deriveDefects } from '../core/operators';
import { fileHash } from '../core/scenario';
import { doctor } from './doctor';
import { report } from './report';

export const FIXTURES = path.join(__dirname, 'fixtures');
const REF = 'cart-total-add-change-remove';

class RowFailure extends Error {}

export function check(cond: unknown, message: string): asserts cond {
  if (!cond) throw new RowFailure(message);
}

export function expectVerdict(r: CommandResult, want: string, what: string): void {
  check(r.verdict === want, `${what}: expected ${want}, got ${r.verdict}: ${r.lines.slice(0, 2).join(' | ')}`);
}

/** A fresh e2e root for one case, with the reference app's rules and the given fixture scenarios. */
export function workspace(name: string, slugs: string[], config: Record<string, unknown> = {}): string {
  const root = path.join(packageRoot(), 'reports', 'selftest', 'runs', name);
  fs.rmSync(root, { recursive: true, force: true });
  for (const d of ['specs', 'tests', 'app']) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.symlinkSync(path.join(packageRoot(), 'support'), path.join(root, 'support'), 'dir');
  fs.copyFileSync(path.join(FIXTURES, 'reference.pricing.ts'), files.pricing(root, 'reference'));
  const base = { app: 'reference', baseURL: 'http://127.0.0.1:9', testIdAttribute: 'data-testid', locale: 'en-US', currency: 'USD', repeat: 1 };
  fs.writeFileSync(path.join(root, 'qa.config.json'), JSON.stringify({ ...base, ...config }, null, 2));
  for (const slug of slugs) fs.copyFileSync(path.join(FIXTURES, `${slug}.md`), files.scenario(root, slug));
  return root;
}

/** Write a scenario into a workspace from a fixture with text replacements. */
export function variant(root: string, from: string, slug: string, edits: Array<[string | RegExp, string]>): void {
  let text = fs.readFileSync(path.join(FIXTURES, `${from}.md`), 'utf8').replace(`id: ${from}`, `id: ${slug}`);
  for (const [a, b] of edits) {
    const next = text.replace(a, b);
    if (next === text) throw new Error(`selftest fixture edit did not apply: ${String(a)}`);
    text = next;
  }
  fs.writeFileSync(files.scenario(root, slug), text);
}

/** example --confirm and compile; returns the compiled text. */
export function prepare(root: string, slug: string): string {
  expectVerdict(example(root, slug, true), 'PASS', `example ${slug} --confirm`);
  expectVerdict(compile(root, slug, false), 'PASS', `compile ${slug}`);
  return fs.readFileSync(files.test(root, slug), 'utf8');
}

export type Row = { area: string; run: () => Promise<string> };

const CONTROL_APP = path.join(__dirname, 'control-app');

/** Copy a control-app source into a root's app/, pointing its core imports at <root>/support/core. */
function installAppFile(root: string, source: string, target: string, transform: (s: string) => string = (s) => s): void {
  const text = fs.readFileSync(path.join(CONTROL_APP, source), 'utf8').replace(/'\.\.\/\.\.\/core\//g, "'../support/core/");
  fs.writeFileSync(path.join(root, 'app', target), transform(text));
}

/** The wrong driver as one file: the correct driver renamed, then the wrapper that reads the subtotal as the total. */
function wrongDriver(correct: string): string {
  const wrapper = fs.readFileSync(path.join(CONTROL_APP, 'control-wrong.driver.ts'), 'utf8')
    .split('\n').filter((l) => !l.startsWith('import ')).join('\n')
    .replace('createCorrect(', 'createCorrectDriver(');
  return correct.replace('export function createDriver(', 'function createCorrectDriver(') + '\n' + wrapper;
}

/** A root for the control page at `url`, with the correct or the wrong driver and its own config. */
function controlRoot(name: string, url: string, wrong: boolean): string {
  const root = path.join(packageRoot(), 'reports', 'selftest', 'runs', name);
  fs.rmSync(root, { recursive: true, force: true });
  for (const d of ['specs', 'tests', 'app']) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.symlinkSync(path.join(packageRoot(), 'support'), path.join(root, 'support'), 'dir');
  installAppFile(root, 'control.pricing.ts', 'control.pricing.ts');
  installAppFile(root, 'control.driver.ts', 'control.driver.ts', wrong ? wrongDriver : undefined);
  for (const slug of ['control-equal', 'control-discount']) fs.copyFileSync(path.join(CONTROL_APP, `${slug}.md`), files.scenario(root, slug));
  const config = { app: 'control', baseURL: url, testIdAttribute: 'data-qa', locale: 'de-DE', currency: 'EUR', repeat: 1, pickLimit: 10,
    timeouts: { probeMs: 2000, actionMs: 5000, settleMs: 1000, testMs: 60000 } };
  fs.writeFileSync(path.join(root, 'qa.config.json'), JSON.stringify(config, null, 2));
  return root;
}

type Facts = Array<{ control: string; result: string; evidence?: string }>;

export const CONTROL_PAGE: Row = {
  area: 'control page',
  run: async () => {
    const app = await startControlApp();
    try {
      const good = controlRoot('control-correct', app.url, false);
      prepare(good, 'control-equal');
      const v = await verify(good, 'control-equal');
      const facts = (v.data?.controls ?? []) as Facts;
      check(v.verdict === 'PASS' && facts.every((c) => c.result === 'caught'), `the correct driver: ${v.verdict}; ${facts.map((c) => `${c.control} ${c.result}`).join(', ')} | ${v.lines.slice(1, 4).join(' | ')}`);
      const bad = controlRoot('control-wrong', app.url, true);
      prepare(bad, 'control-equal');
      prepare(bad, 'control-discount');
      const w = await verify(bad, 'control-equal');
      const skew = ((w.data?.controls ?? []) as Facts).find((c) => c.control === 'skew-total');
      check(w.verdict === 'CONTROL_MISSED' && skew?.evidence === 'active-shown-green', `the wrong driver with equal values: ${w.verdict}, skew-total ${skew?.result} (${skew?.evidence}) | ${w.lines.slice(1, 5).join(' | ')}`);
      const d = await run(bad, 'control-discount', { dry: false });
      const rec = JSON.parse(fs.readFileSync(path.join(files.runs(bad, 'control-discount'), d.data?.runId as string, 'run.json'), 'utf8')) as { repeats: Array<{ checkpoints: Array<{ layer?: string }> }> };
      check(d.verdict === 'LOCATOR_FAIL' && rec.repeats[0]?.checkpoints[0]?.layer === 'labels', `the wrong driver with a discount: ${d.verdict}, layer ${rec.repeats[0]?.checkpoints[0]?.layer}`);
      const broken = controlRoot('control-broken', app.url, false);
      const driverFile = files.driver(broken, 'control');
      const source = fs.readFileSync(driverFile, 'utf8');
      check(source.includes("lineRow(name).getByTestId('line-qty')"), 'selftest fixture edit did not apply: line-qty in setQuantity');
      fs.writeFileSync(driverFile, source.replace("lineRow(name).getByTestId('line-qty')", "lineRow(name).getByTestId('line-quantity')"));
      prepare(broken, 'control-equal');
      const m = await run(broken, 'control-equal', { dry: false });
      const err = (JSON.parse(fs.readFileSync(path.join(files.runs(broken, 'control-equal'), m.data?.runId as string, 'run.json'), 'utf8')) as { repeats: Array<{ error: { step: string | null; message: string } | null }> }).repeats[0]?.error;
      check(m.verdict === 'LOCATOR_FAIL' && err?.step === 'S3' && err.message.includes('setQuantity'), `a missing element in an unwrapped action: ${m.verdict} at ${err?.step}: ${err?.message.split('\n')[0]}`);
      return 'correct driver passes G3 and G4 (4/4 controls); wrong driver passes G3 on equal values, G4 CONTROL_MISSED "control active, test green"; with a discount LOCATOR_FAIL at the label layer; a missing element in setQuantity LOCATOR_FAIL at S3';
    } finally {
      await app.stop();
    }
  },
};

/** Load a workspace scenario or fail the row. */
function loadedOf(root: string, slug: string): Loaded {
  if (!fs.existsSync(files.example(root, slug))) prepare(root, slug);
  const got = loadScenario(root, slug);
  check(got.ok, `scenario ${slug} does not load`);
  return got.loaded;
}

const STEP = (...l: string[]) => l.join('\n');

const ROWS: Row[] = [
  {
    area: 'money',
    run: async () => {
      const cases = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'money-formats.json'), 'utf8')) as Array<{ locale: string; currency: CurrencyCode; raw: string; cents: number | null }>;
      for (const c of cases) {
        const m = parseAmount(c.raw, amountFormat(c.locale, c.currency));
        const got = m ? Number(roundToCents(m)) : null;
        check(got === c.cents, `${JSON.stringify(c.raw)} in ${c.locale} ${c.currency} parsed as ${got}, expected ${c.cents}`);
      }
      return `${cases.length} formats in 2 locales, foreign currency and non-amounts rejected`;
    },
  },
  {
    area: 'validator',
    run: async () => {
      const root = workspace('validator', []);
      const breaks: Array<[string, Array<[string | RegExp, string]>]> = [
        ['V1', [['do: remove', 'do: applyCoupon']]],
        ['V2', [['product: B,         cart_after', 'product: C,         cart_after']]],
        ['V3', [['B: { pick: next-available, distinct_from: [A] }', 'B: { pick: first-available }']]],
        ['V4', [[STEP('  - { id: S3, do: setQty, product: A, qty: 3, cart_after: { A: 3, B: 1 } }', '  - { id: S4, do: remove, product: B,         cart_after: { A: 3 } }'),
          STEP('  - { id: S3, do: remove, product: B,         cart_after: { A: 1 } }', '  - { id: S4, do: setQty, product: B, qty: 3, cart_after: { A: 1, B: 3 } }')]]],
        ['V5', [['do: setQty, product: A, qty: 3, cart_after: { A: 3, B: 1 }', 'do: setQty, product: A, qty: 1, cart_after: { A: 1, B: 1 }'], ['cart_after: { A: 3 } }', 'cart_after: { A: 1 } }']]],
        ['V6', [['cart_after: { A: 3 } }', 'cart_after: { A: 3, B: 1 } }']]],
        ['V7', [['check: each-step', 'check: [S2]']]],
        ['V8', [['qty: 3, cart_after: { A: 3, B: 1 }', 'qty: 300, cart_after: { A: 300, B: 1 }'], ['cart_after: { A: 3 } }', 'cart_after: { A: 300 } }']]],
      ];
      for (const [rule, edits] of breaks) {
        const slug = `breaks-${rule.toLowerCase()}`;
        variant(root, REF, slug, edits);
        const r = example(root, slug, false);
        expectVerdict(r, 'SPEC_INVALID', slug);
        check(r.lines.slice(1).some((l) => l.startsWith(rule)), `${slug} does not report ${rule}: ${r.lines.slice(1, 3).join(' | ')}`);
      }
      return 'each of V1–V8 gives SPEC_INVALID naming that rule';
    },
  },
  {
    area: 'compiler',
    run: async () => {
      const root = workspace('compiler', [REF]);
      const first = prepare(root, REF);
      const golden = fs.readFileSync(path.join(FIXTURES, 'golden', 'reference.spec.txt'), 'utf8').replace("test('reference'", "test('Cart total stays correct after add, quantity change and remove'");
      check(first.endsWith(golden), 'the compiled reference test differs from the golden file');
      fs.rmSync(files.test(root, REF));
      expectVerdict(compile(root, REF, false), 'PASS', 'second compile');
      check(fs.readFileSync(files.test(root, REF), 'utf8') === first, 'two compilations differ');
      const edited = first.replace("  await shopper.checkTotal('S3');\n", '');
      fs.writeFileSync(files.test(root, REF), edited);
      expectVerdict(compile(root, REF, false), 'FILE_CONFLICT', 'compile over a hand edit');
      check(fs.readFileSync(files.test(root, REF), 'utf8') === edited, 'compile wrote over the hand edit');
      return 'golden file byte for byte; two compilations equal; a hand edit gives FILE_CONFLICT';
    },
  },
  {
    area: 'product selection',
    run: async () => {
      const root = workspace('selection', ['add-twice']);
      check(prepare(root, 'add-twice').includes('needQty: 4'), 'add A 2 and add A 2 does not compile to needQty: 4');
      variant(root, REF, 'named-later', [['B: { pick: next-available, distinct_from: [A] }', 'B: { pick: by-name, name: "Green Lamp" }']]);
      const got = loadScenario(root, 'named-later');
      check(got.ok, 'the scenario with a later by-name product is invalid');
      const s = got.loaded.scenario;
      const item = (name: string) => ({ name, price: '10.00', inStock: true, attrs: {} });
      const cart = new ReferenceCart({ catalog: [item('Green Lamp'), item('Product A')], pricing: got.loaded.pricing, fmt: got.loaded.fmt });
      const picked = await selectProduct(cart, { pick: 'first-available' }, { reserved: reservedNames(s), pickLimit: 30, constraints: [] });
      check(picked.name === 'Product A', `the unnamed pick selected "${picked.name}", which the scenario names later`);
      return 'needQty 4 for two adds of 2; an unnamed pick skips "Green Lamp", named by a later alias';
    },
  },
  {
    area: 'reference cart',
    run: async () => {
      const root = workspace('reference-cart', [REF, 'swapped-objects', 'green-threshold']);
      const notes: string[] = [];
      // Applicable and detected default defects per fixture scenario (report V F10): a regression that makes
      // defects not applicable keeps G2 green, so the numbers are asserted, not only printed.
      const want: Record<string, { applicable: number; detected: number; total: number }> = {
        [REF]: { applicable: 12, detected: 12, total: 13 }, 'swapped-objects': { applicable: 12, detected: 12, total: 13 }, 'green-threshold': { applicable: 10, detected: 10, total: 11 },
      };
      for (const slug of Object.keys(want)) {
        prepare(root, slug);
        const r = await run(root, slug, { dry: true });
        expectVerdict(r, 'PASS', `run ${slug} --dry`);
        const rows = r.data?.rows as Array<{ result: string }>;
        const got = { applicable: rows.filter((x) => x.result !== 'not-applicable').length, detected: rows.filter((x) => x.result === 'detected').length, total: rows.length };
        check(JSON.stringify(got) === JSON.stringify(want[slug]), `${slug}: ${got.detected} detected of ${got.applicable} applicable (${got.total} defects); expected ${want[slug].detected} of ${want[slug].applicable} (${want[slug].total})`);
        notes.push(`${slug} ${got.detected}/${got.total}`);
      }
      return `healthy carts green; every applicable default defect red where expected (${notes.join(', ')})`;
    },
  },
  {
    area: 'equal prices',
    run: async () => {
      const loaded = loadedOf(workspace('equal-prices', [REF]), REF);
      const products = exampleProducts(loaded).map((p) => ({ ...p, item: { ...p.item, price: '10.00' } }));
      const defects = deriveDefects(loaded.scenario, loaded.pricing.rules).filter((d) => d.operator === 'wrong-target');
      const g2 = await gateG2(loaded, path.join(loaded.root, 'g2'), products, defects);
      check(g2.rows.length === 2 && g2.rows.every((r) => r.result === 'detected'), `wrong-target defects with equal prices: ${g2.rows.map((r) => `${r.defect} ${r.result}`).join(', ')}`);
      return 'all stubs at $10.00: qty-wrong-line and remove-wrong-line still detected, so lines are compared';
    },
  },
  {
    area: 'empty cart',
    run: async () => {
      const loaded = loadedOf(workspace('empty-cart', ['remove-only-line']), 'remove-only-line');
      for (const emptyTotal of [false, true]) {
        const g1 = await gateG1(loaded, path.join(loaded.root, `g1-${emptyTotal}`), emptyTotal);
        expectVerdict({ verdict: g1.verdict, lines: g1.lines }, 'PASS', `G1 with ${emptyTotal ? 'a zero total' : 'no total element'} in the empty cart`);
      }
      const lostRemove = deriveDefects(loaded.scenario, loaded.pricing.rules).filter((d) => d.id === 'lost-remove');
      const g2 = await gateG2(loaded, path.join(loaded.root, 'g2'), exampleProducts(loaded), lostRemove);
      check(g2.rows[0]?.result === 'detected', `lost-remove is ${g2.rows[0]?.result}`);
      return 'green with a zero total and without a total element; lost-remove red at S2';
    },
  },
  {
    area: 'classification',
    run: async () => {
      const root = workspace('classification', [REF, 'green-threshold']);
      prepare(root, REF);
      prepare(root, 'green-threshold');
      expectVerdict(await run(root, REF, { dry: false }), 'INFRA_FAIL', 'a live run against an unreachable address');
      const green = loadedOf(root, 'green-threshold');
      const outOfStock = exampleCatalog(green).map((c, i) => (i === 0 ? { ...c, inStock: false } : c));
      const pre = classify(await dryRun(green, path.join(root, 'pre'), { catalog: outOfStock }), green.scenario.checkpoints);
      check(pre.verdict === 'PRECONDITION_FAIL', `a by-name product out of stock gave ${pre.verdict}`);
      fs.writeFileSync(files.test(root, 'empty'), "import { test } from '../support/core/fixtures';\n");
      fs.copyFileSync(files.scenario(root, REF), files.scenario(root, 'empty'));
      const ref = loadedOf(root, REF);
      const none = classify(await dryRun({ ...ref, slug: 'empty' }, path.join(root, 'none'), { catalog: exampleCatalog(ref) }), ref.scenario.checkpoints);
      check(none.verdict === 'NO_TESTS_RUN', `zero tests gave ${none.verdict}`);
      const lostAdd = deriveDefects(ref.scenario, ref.pricing.rules).find((d) => d.id === 'lost-add');
      const after = classify(await dryRun(ref, path.join(root, 'after'), { catalog: exampleCatalog(ref), defect: lostAdd }), ref.scenario.checkpoints);
      check(after.verdict === 'ORACLE_MISMATCH', `an action failure after a red checkpoint gave ${after.verdict}`);
      return 'unreachable address INFRA_FAIL; PreconditionError PRECONDITION_FAIL; zero tests NO_TESTS_RUN; action failure after a red checkpoint ORACLE_MISMATCH';
    },
  },
  CONTROL_PAGE,
  {
    area: 'parallelism',
    run: async () => {
      const root = workspace('parallelism', [REF]);
      prepare(root, REF);
      const [a, b] = await Promise.all([run(root, REF, { dry: true }), run(root, REF, { dry: true })]);
      const ids = [a.data?.runId, b.data?.runId] as string[];
      check(a.verdict === 'PASS' && b.verdict === 'PASS', `parallel dry runs ended ${a.verdict} and ${b.verdict}`);
      check(ids[0] !== ids[1], 'two runs got the same run directory');
      for (const id of ids) {
        const v = JSON.parse(fs.readFileSync(path.join(files.runs(root, REF), id, 'verification.json'), 'utf8')) as { runId: string };
        check(v.runId === id, `run directory ${id} holds the evidence of ${v.runId}`);
      }
      return `two runs at once: ${ids.join(' and ')}, each with its own evidence`;
    },
  },
  {
    area: 'guarantees',
    run: async () => {
      const root = workspace('guarantees', [REF]);
      const compiled = prepare(root, REF);
      const testFile = files.test(root, REF);
      // R7: a verification record of the current files, then one byte more in the driver.
      const driverFile = files.driver(root, 'reference');
      fs.writeFileSync(driverFile, '// a stand-in driver: only its hash matters to this check\n');
      fs.mkdirSync(files.reports(root, REF), { recursive: true });
      const verified = { testSha256: fileHash(testFile), driverSha256: fileHash(driverFile), rulesSha256: fileHash(files.pricing(root, 'reference')) };
      fs.writeFileSync(path.join(files.reports(root, REF), 'verification.json'), JSON.stringify(verified));
      check(!doctor(root, false).lines.some((l) => l.startsWith('VERIFICATION_STALE')), 'doctor calls unchanged verified files stale');
      fs.appendFileSync(driverFile, ' ');
      const stale = doctor(root, false).lines.find((l) => l.startsWith('VERIFICATION_STALE'));
      check(stale?.includes('the driver'), `a driver changed after verification: ${stale ?? 'no VERIFICATION_STALE line'}`);
      // R6: the rules file changed after confirmation.
      const rulesFile = files.pricing(root, 'reference');
      const rules = fs.readFileSync(rulesFile, 'utf8');
      fs.appendFileSync(rulesFile, '// changed after confirmation\n');
      const changed = await run(root, REF, { dry: true });
      check(changed.verdict === 'SCENARIO_CHANGED' && changed.lines.join(' ').includes('rules file'), `a run after the rules file changed: ${changed.verdict}: ${changed.lines[0]}`);
      fs.writeFileSync(rulesFile, rules);
      // G1: the approved example's total differs from the compiled test's.
      const exFile = files.example(root, REF);
      const exText = fs.readFileSync(exFile, 'utf8');
      const ex = JSON.parse(exText) as { expected: Array<{ step: string; totalExact: string }> };
      ex.expected[1].totalExact = `${ex.expected[1].totalExact}1`;
      fs.writeFileSync(exFile, JSON.stringify(ex, null, 2));
      expectVerdict(await run(root, REF, { dry: true }), 'CONFORMANCE_FAIL', 'an approved example whose S2 total differs from the test');
      fs.writeFileSync(exFile, exText);
      // 10.5 and R9: a test without its S3 checkpoint detects late; repairs need a changed file and stop at the limit.
      fs.writeFileSync(testFile, compiled.replace("  await shopper.checkTotal('S3');\n", ''));
      expectVerdict(await run(root, REF, { dry: true, repair: 'test' }), 'DEFECT_LATE', 'repair 1: a test without the S3 checkpoint');
      expectVerdict(await run(root, REF, { dry: true, repair: 'test' }), 'RETRY_REFUSED', 'a repair with the test unchanged');
      fs.appendFileSync(testFile, '// repair 2\n');
      expectVerdict(await run(root, REF, { dry: true, repair: 'test' }), 'DEFECT_LATE', 'repair 2 with a changed test');
      fs.appendFileSync(testFile, '// repair 3\n');
      expectVerdict(await run(root, REF, { dry: true, repair: 'test' }), 'LIMIT_REACHED', 'a third repair');
      fs.writeFileSync(testFile, compiled);
      // The lock: a promotion of a verified run while another run holds the lock changes nothing.
      const id = '20990101T000000Z-lock';
      const runDir = path.join(files.runs(root, REF), id);
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, 'verification.json'), JSON.stringify({ runId: id, slug: REF, gates: { dry: 'PASS', G3: 'PASS', G4: 'PASS' }, defects: [], gaps: [], verdict: 'PASS' }));
      fs.writeFileSync(path.join(files.reports(root, REF), '.lock'), '1\n');
      const held = await report(root, REF, id).catch((e: Error & { verdict?: string }) => ({ verdict: e.verdict ?? 'error', lines: [e.message] }));
      check(held.verdict === 'INFRA_FAIL' && !fs.existsSync(path.join(files.reports(root, REF), 'report.md')), `a promotion under a held lock: ${held.verdict}: ${held.lines[0]}`);
      // R4: doctor of a scratch copy of this package with one changed line in support/core.
      const pkg = path.join(packageRoot(), 'reports', 'selftest', 'runs', 'guarantees-pkg');
      fs.rmSync(pkg, { recursive: true, force: true });
      fs.cpSync(path.join(packageRoot(), 'support'), path.join(pkg, 'support'), { recursive: true });
      fs.copyFileSync(path.join(packageRoot(), 'package.json'), path.join(pkg, 'package.json'));
      fs.symlinkSync(path.join(packageRoot(), 'node_modules'), path.join(pkg, 'node_modules'), 'dir');
      fs.appendFileSync(path.join(pkg, 'support', 'core', 'money.ts'), '// changed\n');
      const env: NodeJS.ProcessEnv = { ...process.env };
      delete env.QA_ROOT;
      const out = spawnSync(process.execPath, [path.join(packageRoot(), 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(pkg, 'support', 'harness', 'cli.ts'), '--root', root, 'doctor'], { encoding: 'utf8', env, timeout: 60_000 }).stdout ?? '';
      check(/^HARNESS_MODIFIED: .*support\/core\/money\.ts/m.test(out), `doctor with a changed support/core file: ${out.split('\n').slice(0, 2).join(' | ')}`);
      return 'VERIFICATION_STALE, SCENARIO_CHANGED, CONFORMANCE_FAIL, DEFECT_LATE, RETRY_REFUSED, LIMIT_REACHED, a held lock and HARNESS_MODIFIED each where expected';
    },
  },
  {
    area: 'integrity',
    run: async () => {
      const changes = manifestChanges();
      check(changes.length === 0, `the library differs from support/core/MANIFEST.json: ${changes.slice(0, 3).join(', ')}`);
      return 'support/core and support/harness match support/core/MANIFEST.json';
    },
  },
];

function runUnitTests(): Promise<{ ok: boolean; summary: string }> {
  const pkg = packageRoot();
  const cli = require.resolve('@playwright/test/cli', { paths: [pkg] });
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '0' };
    delete env.QA_ROOT;
    const child = spawn(process.execPath, [cli, 'test', '--config', path.join(pkg, 'playwright.config.ts'), '--project', 'unit', '--reporter', 'line'], { cwd: pkg, env });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => {
      const summary = out.split('\n').filter((l) => /^\s*\d+ (passed|failed|flaky)/.test(l)).map((l) => l.trim()).join(', ');
      resolve({ ok: code === 0, summary: summary || out.trim().split('\n').slice(-2).join(' ') });
    });
  });
}

export async function selftest(): Promise<CommandResult> {
  const started = Date.now();
  fs.rmSync(path.join(packageRoot(), 'reports', 'selftest', 'runs'), { recursive: true, force: true });
  const unit = await runUnitTests();
  const lines = [`${'unit tests'.padEnd(18)} ${unit.ok ? 'PASS' : 'FAIL'}  ${unit.summary}`];
  let failed = unit.ok ? 0 : 1;
  for (const row of ROWS) {
    try {
      lines.push(`${row.area.padEnd(18)} PASS  ${await row.run()}`);
    } catch (e) {
      failed++;
      lines.push(`${row.area.padEnd(18)} FAIL  ${e instanceof RowFailure ? e.message : `harness error: ${(e as Error)?.message ?? e}`}`);
    }
  }
  lines.push(`${ROWS.length + 1 - failed}/${ROWS.length + 1} rows passed in ${((Date.now() - started) / 1000).toFixed(1)} s.${failed ? ' Fix the failing rows before trusting any verdict of this harness.' : ''}`);
  return { verdict: failed ? 'INFRA_FAIL' : 'PASS', lines };
}
