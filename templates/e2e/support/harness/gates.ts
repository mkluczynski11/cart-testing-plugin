// The dry gates on the reference cart: G1 (healthy cart conforms to the example) and G2 (defects).
// Implements design 10 (G1, G2), 10.2 (how a defect is used) and 10.5 (applicability and results).
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CheckpointRecord } from '../core/checkpoint';
import { inspectTestFile } from '../core/compiler';
import { files } from '../core/config';
import { stubCatalog, type ExampleFile } from '../core/example';
import type { DrySetup } from '../core/fixtures';
import { gapHint, type Defect } from '../core/operators';
import { ReferenceCart, type CatalogItem } from '../core/reference-cart';
import type { Verdict } from '../core/verdicts';
import { classify } from '../core/classification';
import type { Loaded } from './common';
import { lintRoot, testCheckpoints } from './lint';
import type { RunRecord } from '../core/classification';
import { runPlaywright } from './playwright-runner';

export type GateOutcome = { verdict: Verdict; lines: string[] };

/** The checkpoints the test file itself judges: hand edits change them, compilation never does. */
export function judgedByTest(loaded: Loaded): string[] {
  return testCheckpoints(fs.readFileSync(files.test(loaded.root, loaded.slug), 'utf8'));
}

/** Run the compiled test once on the reference cart with a dry setup written into `dir`. */
export function dryRun(loaded: Loaded, dir: string, setup: DrySetup): Promise<RunRecord> {
  fs.mkdirSync(dir, { recursive: true });
  const setupFile = path.join(dir, 'dry-setup.json');
  fs.writeFileSync(setupFile, JSON.stringify(setup, null, 2));
  return runPlaywright({ root: loaded.root, project: 'dry', slug: loaded.slug, runDir: dir, env: { QA_DRY: setupFile }, timeoutMs: 120_000 });
}

/** The catalog of the dry gates: the approved example's stubs. */
export function exampleCatalog(loaded: Loaded): CatalogItem[] {
  return stubCatalog(loaded.scenario, loaded.example as ExampleFile);
}

/** Names of the products at a checkpoint, mapped back to aliases through the stubs. */
function aliasState(c: CheckpointRecord, ex: ExampleFile): Record<string, number> {
  const alias = new Map(Object.entries(ex.stub).map(([a, s]) => [s.name, a]));
  return Object.fromEntries(c.ledger.map((l) => [alias.get(l.name) ?? l.name, l.qty]));
}

/** G1: green on the healthy reference cart; the ledger trace equals cart_after; totals equal the example. */
export async function gateG1(loaded: Loaded, dir: string, emptyTotal = false): Promise<GateOutcome & { run: RunRecord }> {
  const ex = loaded.example as ExampleFile;
  const run = await dryRun(loaded, dir, { catalog: exampleCatalog(loaded), emptyTotal });
  const c = classify(run, judgedByTest(loaded));
  if (c.verdict !== 'PASS') {
    const why = run.repeats[0]?.error?.message.split('\n').slice(0, 3).join(' | ') ?? c.reason;
    return { run, verdict: c.verdict, lines: [`G1 red on the healthy reference cart: ${why}`] };
  }
  for (const cp of run.repeats[0].checkpoints) {
    const step = loaded.scenario.steps.find((s) => s.id === cp.step);
    const row = ex.expected.find((r) => r.step === cp.step);
    const state = aliasState(cp, ex);
    if (!step || JSON.stringify(state) !== JSON.stringify(step.cartAfter)) {
      return { run, verdict: 'CONFORMANCE_FAIL', lines: [`G1 at ${cp.step} the ledger holds ${JSON.stringify(state)}, the scenario says cart_after ${JSON.stringify(step?.cartAfter)}; recompile the test or fix the scenario.`] };
    }
    if (!row || row.totalExact !== cp.expected.totalExact) {
      return { run, verdict: 'CONFORMANCE_FAIL', lines: [`G1 at ${cp.step} the test expects ${cp.expected.total}, the approved example says ${row?.total}; the rules changed after confirmation or the test was edited.`] };
    }
  }
  return { run, verdict: 'PASS', lines: [`G1 ok: green on the healthy reference cart; ledger trace equals cart_after; totals equal the approved example`] };
}

// ---- G2 ------------------------------------------------------------------------------------------

export type Product = { alias: string; item: CatalogItem };

/** The example's stubs as products, in the order of their first add. */
export function exampleProducts(loaded: Loaded): Product[] {
  const ex = loaded.example as ExampleFile;
  return exampleCatalog(loaded).map((item) => ({ alias: Object.keys(ex.stub).find((a) => ex.stub[a].name === item.name) as string, item }));
}

/** Perform the scenario on a reference cart and return the serialized view after every step. */
export async function simulate(loaded: Loaded, products: Product[], defect?: Defect, emptyTotal = false): Promise<string[]> {
  const cart = new ReferenceCart({ catalog: products.map((p) => p.item), pricing: loaded.pricing, fmt: loaded.fmt, defect, emptyTotal });
  const nameOf = new Map(products.map((p) => [p.alias, p.item.name]));
  const views: string[] = [];
  for (const step of loaded.scenario.steps) {
    const name = nameOf.get(step.product) as string;
    try {
      if (step.do === 'add') await cart.addProduct(name, step.qty as number);
      else if (step.do === 'setQty') await cart.setQuantity(name, step.qty as number);
      else await cart.remove(name);
      views.push(JSON.stringify(await cart.readCart(), (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)));
    } catch (e) {
      views.push(`(the step failed: ${(e as Error).message})`);
    }
  }
  return views;
}

/** The first checkpoint at which the healthy and the faulty cart differ, or null (10.5). */
export function expectedPlace(loaded: Loaded, healthy: string[], faulty: string[]): string | null {
  const steps = loaded.scenario.steps;
  for (let i = 0; i < steps.length; i++) {
    if (loaded.scenario.checkpoints.includes(steps[i].id) && healthy[i] !== faulty[i]) return steps[i].id;
  }
  return null;
}

export type DefectResult = 'detected' | 'detected-late' | 'missed' | 'not-applicable';
export type DefectRow = { defect: string; origin: string; operator: string; result: DefectResult; expected: string | null; firstRed: string | null; hint?: string; note?: string };

async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

/** G2: every applicable defect gives its first red checkpoint where the simulation says it should. */
export async function gateG2(loaded: Loaded, dir: string, products: Product[], defects: Defect[], emptyTotal = false): Promise<GateOutcome & { rows: DefectRow[] }> {
  const healthy = await simulate(loaded, products, undefined, emptyTotal);
  const places = await Promise.all(defects.map(async (d) => expectedPlace(loaded, healthy, await simulate(loaded, products, d, emptyTotal))));
  const steps = loaded.scenario.steps.map((s) => s.id);
  const catalog = products.map((p) => p.item);
  const rows = await pool(defects.map((d, i) => ({ d, expected: places[i] })), 6, async ({ d, expected }): Promise<DefectRow> => {
    const base = { defect: d.id, origin: d.origin, operator: d.operator, expected };
    if (!expected) return { ...base, result: 'not-applicable', firstRed: null, hint: gapHint(d, loaded.scenario) };
    const run = await dryRun(loaded, path.join(dir, d.id.replace(/[^a-z0-9-]/gi, '_')), { catalog, defect: d, emptyTotal });
    const records = run.repeats[0]?.checkpoints ?? [];
    const red = records.find((c) => c.result === 'fail')?.step ?? null;
    if (!red) {
      const failed = run.repeats[0] && run.repeats[0].status !== 'passed';
      return failed
        ? { ...base, result: 'detected', firstRed: null, note: `red by an action failure: ${run.repeats[0].error?.message.split('\n')[0] ?? run.repeats[0].status}` }
        : { ...base, result: 'missed', firstRed: null };
    }
    return { ...base, result: steps.indexOf(red) > steps.indexOf(expected) ? 'detected-late' : 'detected', firstRed: red };
  });
  const count = (r: DefectResult) => rows.filter((x) => x.result === r).length;
  const lines = [`G2 ${rows.length} defects: ${count('detected')} detected where expected, ${count('detected-late')} late, ${count('missed')} missed, ${count('not-applicable')} not applicable`];
  for (const r of rows.filter((x) => x.result === 'missed' || x.result === 'detected-late')) {
    lines.push(`   ${r.defect} ${r.result}: expected red at ${r.expected}, first red at ${r.firstRed ?? "no checkpoint"}${r.result === "detected-late" ? `: the test has no checkpoint after ${r.expected}; recompile it from the scenario` : ""}`);
  }
  const verdict: Verdict = count('missed') ? 'DEFECT_MISSED' : count('detected-late') ? 'DEFECT_LATE' : 'PASS';
  return { verdict, lines, rows };
}

// ---- G0 ------------------------------------------------------------------------------------------

/** G0: the test exists and was compiled from the current scenario; no forbidden pattern in the test or the drivers. */
export function gateG0(loaded: Loaded): GateOutcome & { handEdited: boolean } {
  const testFile = files.test(loaded.root, loaded.slug);
  if (!fs.existsSync(testFile)) return { verdict: 'FILE_CONFLICT', handEdited: false, lines: [`G0 tests/${loaded.slug}.spec.ts does not exist; run qa-harness compile ${loaded.slug}.`] };
  const info = inspectTestFile(fs.readFileSync(testFile, 'utf8'));
  if (info.generated && info.scenarioSha256 !== loaded.scenarioSha256) {
    return { verdict: 'FILE_CONFLICT', handEdited: false, lines: [`G0 the test was compiled from another version of the scenario; run qa-harness compile ${loaded.slug}.`] };
  }
  const violations = lintRoot(loaded.root, testFile, new URL(loaded.config.baseURL).origin);
  if (violations.length) {
    return { verdict: 'LINT_FAIL', handEdited: !info.untouched, lines: [`G0 ${violations.length} forbidden pattern(s); fix them in the file named, or recompile the test:`,
      ...violations.slice(0, 8).map((v) => `   ${v.file}:${v.line} ${v.rule}`)] };
  }
  const handEdited = !info.untouched;
  return { verdict: 'PASS', handEdited, lines: [`G0 ok: no forbidden pattern; the test is ${handEdited ? 'EDITED BY HAND after compilation' : 'the untouched compilation of the confirmed scenario'}`] };
}
