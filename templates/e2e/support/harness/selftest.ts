// qa-harness selftest: the harness's own test, one row per area of design 10.8.
// Every case works in its own workspace under reports/selftest/runs/<case>/, whose support/ is a symlink
// to this package, so compiled tests keep their fixed import path. No live application is used.
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { reservedNames } from '../core/compiler';
import { files, packageRoot } from '../core/config';
import { amountFormat, parseAmount, roundToCents } from '../core/money';
import { ReferenceCart } from '../core/reference-cart';
import { selectProduct } from '../core/selection';
import type { CurrencyCode } from '../core/types';
import type { CommandResult } from './common';
import { loadScenario } from './common';
import { compile } from './compile';
import { example } from './example';

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
