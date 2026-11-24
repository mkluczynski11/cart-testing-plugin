// qa-harness selftest: unit tests plus end-to-end cases built from support/harness/fixtures/.
// Each case runs in its own workspace under reports/selftest/runs/<case>/ (gitignored) whose
// support/ and app/ are symlinks to the real ones, so compiled tests keep their fixed import path.
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { formatCents, parseDisplayed, roundToCents } from '../core/money';
import { packageRoot, paths } from '../core/scenario';
import type { Verdict } from '../core/verdicts';
import { compile, confirm, example, loadValid, type CommandResult } from './commands';
import { gates, runScenarioTest, simulateCartViews, type DefectRow } from './gates';

const FIXTURES = path.join(__dirname, 'fixtures');
const REF = 'cart-total-add-change-remove';

class CaseFailure extends Error {}

function check(cond: unknown, message: string): asserts cond {
  if (!cond) throw new CaseFailure(message);
}

function expectVerdict(r: CommandResult, want: Verdict, what: string): void {
  check(r.verdict === want, `${what}: expected ${want}, got ${r.verdict}: ${r.lines.slice(0, 3).join(' | ')}`);
}

function workspace(name: string, slugs: string[]): string {
  const root = path.join(packageRoot(), 'reports', 'selftest', 'runs', name);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, 'specs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  fs.symlinkSync(path.join(packageRoot(), 'support'), path.join(root, 'support'), 'dir');
  fs.symlinkSync(path.join(packageRoot(), 'app'), path.join(root, 'app'), 'dir');
  for (const slug of slugs) fs.copyFileSync(path.join(FIXTURES, `${slug}.md`), paths.scenario(root, slug));
  return root;
}

/** example + confirm + compile; returns the compiled text. */
function prepare(root: string, slug: string): string {
  expectVerdict(example(root, slug), 'PASS', `example ${slug}`);
  expectVerdict(confirm(root, slug), 'PASS', `confirm ${slug}`);
  expectVerdict(compile(root, slug), 'PASS', `compile ${slug}`);
  return fs.readFileSync(paths.test(root, slug), 'utf8');
}

const row = (r: CommandResult, defect: string) => ((r.data?.rows ?? []) as DefectRow[]).find((x) => x.defect === defect);

type Case = { id: number; title: string; run: () => Promise<string> };

const CASES: Case[] = [
  {
    id: 1, title: 'reference scenario: example, confirm, compile x2, gates',
    run: async () => {
      const root = workspace('01-reference', [REF]);
      const ex = example(root, REF);
      expectVerdict(ex, 'PASS', 'example');
      check(ex.lines[0].includes('STUB'), 'example output does not say that prices are stubs');
      check(fs.existsSync(paths.example(root, REF)), 'example.json not written');
      expectVerdict(confirm(root, REF), 'PASS', 'confirm');
      check(/^status: confirmed/m.test(fs.readFileSync(paths.scenario(root, REF), 'utf8')), 'status not confirmed');
      expectVerdict(compile(root, REF), 'PASS', 'compile #1');
      const first = fs.readFileSync(paths.test(root, REF), 'utf8');
      fs.rmSync(paths.test(root, REF));
      expectVerdict(compile(root, REF), 'PASS', 'compile #2');
      check(fs.readFileSync(paths.test(root, REF), 'utf8') === first, 'second compile differs');
      const committed = paths.test(packageRoot(), REF);
      if (fs.existsSync(committed)) check(fs.readFileSync(committed, 'utf8') === first, 'committed test differs from a fresh compile');
      const g = await gates(root, REF);
      expectVerdict(g, 'GATES_OK', 'gates');
      const rows = g.data?.rows as DefectRow[];
      check(!rows.some((r) => r.result === 'missed'), 'a defect is missed');
      // A scenario changed after the freeze: compile and gates refuse.
      const spec = paths.scenario(root, REF);
      fs.writeFileSync(spec, fs.readFileSync(spec, 'utf8').replace('qty: 3, cart_after: { A: 3, B: 1 }', 'qty: 4, cart_after: { A: 4, B: 1 }').replace('cart_after: { A: 3 } }', 'cart_after: { A: 4 } }'));
      const c2 = compile(root, REF);
      expectVerdict(c2, 'SPEC_INVALID', 'compile after a change');
      check(c2.lines.join(' ').includes('re-confirm'), 'compile does not ask to re-confirm');
      expectVerdict(await gates(root, REF), 'SPEC_INVALID', 'gates after a change');
      return `GATES_OK; changed scenario refused; ${rows.filter((r) => r.result.startsWith('detected')).length} detected, ${rows.filter((r) => r.result === 'not-applicable').length} n/a`;
    },
  },
  {
    id: 2, title: 'swapped objects: setQty on B, remove A',
    run: async () => {
      const root = workspace('02-swapped', ['swapped-objects']);
      prepare(root, 'swapped-objects');
      const g = await gates(root, 'swapped-objects');
      expectVerdict(g, 'GATES_OK', 'gates');
      return 'GATES_OK';
    },
  },
  {
    id: 3, title: 'two adds of 2 units: state 4, needQty 4, add-replaces-quantity detected',
    run: async () => {
      const root = workspace('03-add-twice', ['add-twice']);
      const ex = example(root, 'add-twice');
      expectVerdict(ex, 'PASS', 'example');
      const last = (ex.data?.expected as Array<{ cart: Record<string, number> }>).at(-1);
      check(last?.cart.A === 4, `final state is ${JSON.stringify(last?.cart)}, expected A=4`);
      expectVerdict(confirm(root, 'add-twice'), 'PASS', 'confirm');
      expectVerdict(compile(root, 'add-twice'), 'PASS', 'compile');
      check(fs.readFileSync(paths.test(root, 'add-twice'), 'utf8').includes('needQty: 4'), 'compiled test lacks needQty: 4');
      const g = await gates(root, 'add-twice');
      const r = row(g, 'add-replaces-quantity');
      check(r?.result === 'detected', `add-replaces-quantity is ${r?.result}`);
      return `final A=4, needQty 4, add-replaces-quantity detected at ${r?.failedAt}; gates ${g.verdict}`;
    },
  },
  {
    id: 4, title: 'same request written wrongly (S2 state 2): SPEC_INVALID V4',
    run: async () => {
      const root = workspace('04-add-twice-wrong', ['add-twice-wrong']);
      const r = example(root, 'add-twice-wrong');
      expectVerdict(r, 'SPEC_INVALID', 'example');
      check(r.lines.some((l) => l.startsWith('V4 S2:')), `no V4 S2 line: ${r.lines.join(' | ')}`);
      return r.lines.find((l) => l.startsWith('V4')) ?? '';
    },
  },
  {
    id: 5, title: 'step with no state change: SPEC_INVALID V5',
    run: async () => {
      const root = workspace('05-no-change', ['no-change']);
      const r = example(root, 'no-change');
      expectVerdict(r, 'SPEC_INVALID', 'example');
      check(r.lines.some((l) => l.startsWith('V5')), `no V5 line: ${r.lines.join(' | ')}`);
      return r.lines.find((l) => l.startsWith('V5')) ?? '';
    },
  },
  {
    id: 6, title: 'eco discount on both sides of the 50% threshold',
    run: async () => {
      const root = workspace('06-eco-threshold', ['eco-threshold']);
      prepare(root, 'eco-threshold');
      const loaded = loadValid(root, 'eco-threshold');
      check(loaded.ok, 'scenario invalid');
      const views = await simulateCartViews(loaded.scenario);
      const adj = views.map((v) => (v.empty ? 0 : v.adjustments.length));
      // S1 1/1 units rated B: above; S2 exactly 1/2: not above; S3 2/3: above; S4 2/5: below.
      check(JSON.stringify(adj) === '[1,0,1,0]', `discount rows per step ${JSON.stringify(adj)}, expected [1,0,1,0]`);
      const g = await gates(root, 'eco-threshold');
      for (const d of ['discount-not-applied', 'total-truncated']) {
        const r = row(g, d);
        check(r?.result === 'detected', `${d} is ${r?.result}`);
      }
      return `discount at S1 (1/1) and S3 (2/3), not at S2 (exactly 1/2) or S4 (2/5); discount-not-applied and total-truncated detected; gates ${g.verdict}`;
    },
  },
  {
    id: 7, title: 'checkpoint after S3 removed by hand: FILE_CONFLICT, DEFECT_MISSED',
    run: async () => {
      const root = workspace('07-hand-edited', [REF]);
      const text = prepare(root, REF);
      const edited = text.replace("  await shopper.checkTotal('S3');\n", '');
      check(edited !== text, 'could not remove the S3 checkpoint');
      fs.writeFileSync(paths.test(root, REF), edited);
      expectVerdict(compile(root, REF), 'FILE_CONFLICT', 'compile');
      check(fs.readFileSync(paths.test(root, REF), 'utf8') === edited, 'compile wrote over the hand-edited file');
      const g = await gates(root, REF);
      expectVerdict(g, 'DEFECT_MISSED', 'gates');
      const missed = ((g.data?.rows ?? []) as DefectRow[]).filter((r) => r.result === 'missed').map((r) => r.defect);
      check(missed.includes('total-stale-after-setqty'), `missed list ${missed.join(', ')}`);
      check(g.lines.some((l) => l.includes('Missed: ') && l.includes('total-stale-after-setqty')), 'output does not name the missed defect');
      check(g.lines.some((l) => l.includes('hand-edited')), 'G0 does not mark the test hand-edited');
      return `missed: ${missed.join(', ')}`;
    },
  },
  {
    id: 8, title: 'driver-reads-subtotal: red with LOCATOR_FAIL (scenario with a discount)',
    run: async () => {
      const root = workspace('08-reads-subtotal', ['eco-threshold']);
      prepare(root, 'eco-threshold');
      const o = await runScenarioTest(root, 'eco-threshold', 'driver-reads-subtotal');
      check(o.status === 'failed' && o.verdict === 'LOCATOR_FAIL', `got ${o.status} ${o.verdict}: ${o.message?.slice(0, 200)}`);
      return (o.message ?? '').split('\n')[0];
    },
  },
  {
    id: 9, title: 'removing the only line: green checkpoint on the empty cart',
    run: async () => {
      const root = workspace('09-remove-only-line', ['remove-only-line']);
      prepare(root, 'remove-only-line');
      const o = await runScenarioTest(root, 'remove-only-line');
      check(o.status === 'passed', `test is ${o.status}: ${o.message?.slice(0, 200)}`);
      const cps = o.attachments.filter((a) => a.name === 'checkpoint').map((a) => JSON.parse(a.body));
      const last = cps.at(-1);
      check(last?.step === 'S2' && last.displayed?.empty === true && last.result?.status === 'green', `last checkpoint ${JSON.stringify(last?.result)}`);
      return `${cps.length} checkpoints green; S2 shows an empty cart`;
    },
  },
  {
    id: 10, title: 'money parser: all formats',
    run: async () => {
      const cases = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'money-formats.json'), 'utf8')) as Array<{ raw: string; cents: number | null }>;
      for (const c of cases) {
        const m = parseDisplayed(c.raw);
        const got = m ? Number(roundToCents(m)) : null;
        check(got === c.cents, `${JSON.stringify(c.raw)} parsed as ${got === null ? 'null' : formatCents(BigInt(got))}, expected ${c.cents}`);
      }
      return `${cases.length} formats`;
    },
  },
];

function runUnitTests(): Promise<{ ok: boolean; summary: string }> {
  const pkg = packageRoot();
  const cli = require.resolve('@playwright/test/cli', { paths: [pkg] });
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, 'test', '--config', path.join(pkg, 'playwright.config.ts'), '--project', 'unit', '--reporter', 'line'], {
      cwd: pkg, env: { ...process.env, FORCE_COLOR: '0', QA_ROOT: '' },
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => {
      const summary = out.split('\n').filter((l) => /^\s*\d+ (passed|failed|flaky|skipped)/.test(l)).map((l) => l.trim()).join(', ');
      resolve({ ok: code === 0, summary: summary || out.slice(-300) });
    });
  });
}

export async function selftest(): Promise<CommandResult> {
  const started = Date.now();
  fs.rmSync(path.join(packageRoot(), 'reports', 'selftest', 'runs'), { recursive: true, force: true });
  const lines: string[] = [];
  const unit = await runUnitTests();
  lines.push(`unit  ${unit.ok ? 'PASS' : 'FAIL'}  ${unit.summary}`);
  let failed = unit.ok ? 0 : 1;
  for (const c of CASES) {
    const t0 = Date.now();
    try {
      const detail = await c.run();
      lines.push(`${String(c.id).padStart(2)}  PASS  ${c.title} (${((Date.now() - t0) / 1000).toFixed(1)}s): ${detail}`);
    } catch (e) {
      failed++;
      const msg = e instanceof CaseFailure ? e.message : `internal error: ${(e as Error)?.stack ?? e}`;
      lines.push(`${String(c.id).padStart(2)}  FAIL  ${c.title}: ${msg}`);
    }
  }
  lines.push(`${CASES.length - (unit.ok ? failed : failed - 1)}/${CASES.length} cases passed, unit tests ${unit.ok ? 'passed' : 'FAILED'}; ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return { verdict: failed ? 'INFRA_FAIL' : 'PASS', lines };
}
