// Dry gates G0-G2 on the reference cart, and the Playwright runner they use.
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as referencePricing from '../../app/reference.pricing';
import { evidenceReplacer } from '../core/checkpoint';
import { inspectTestFile, needQty, reservedNames } from '../core/compiler';
import { ALL_DEFECTS, type DefectId } from '../core/defects';
import type { PricingModule } from '../core/pricing';
import { ReferenceCart } from '../core/reference-cart';
import { freezeMessage, freezeState, packageRoot, paths, scenarioHash, type Scenario } from '../core/scenario';
import { selectProduct } from '../core/shopper';
import type { CartView, ProductPick } from '../core/types';
import { classifyFailure, type Verdict } from '../core/verdicts';
import { loadValid, type CommandResult } from './commands';

// ---- Playwright runner -------------------------------------------------------------------------

export type RunOutcome = {
  status: 'passed' | 'failed' | 'error';
  verdict?: Verdict; // failure verdict
  step?: string; // failing checkpoint
  message?: string;
  attachments: Array<{ name: string; body: string }>;
};

const ANSI = /\u001b\[[0-9;]*m/g;

function collectTests(suite: any, out: any[] = []): any[] {
  for (const spec of suite.specs ?? []) for (const t of spec.tests ?? []) out.push(t);
  for (const child of suite.suites ?? []) collectTests(child, out);
  return out;
}

/** Run one compiled test on the reference cart in a separate Playwright process. */
export function runScenarioTest(root: string, slug: string, defect?: DefectId): Promise<RunOutcome> {
  const pkg = packageRoot();
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-run-'));
  const cli = require.resolve('@playwright/test/cli', { paths: [pkg] });
  const fileFilter = `${slug}\\.spec\\.ts$`;
  const args = [cli, 'test', '--config', path.join(pkg, 'playwright.config.ts'), '--project', 'scenarios',
    '--reporter', 'json', '--output', outDir, '--workers', '1', fileFilter];
  const env = { ...process.env, QA_DRIVER: 'reference', QA_ROOT: root, QA_DEFECT: defect ?? '', FORCE_COLOR: '0' };
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: pkg, env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', () => {
      fs.rmSync(outDir, { recursive: true, force: true });
      let report: any;
      try {
        report = JSON.parse(stdout.slice(stdout.indexOf('{')));
      } catch {
        resolve({ status: 'error', verdict: 'INFRA_FAIL', message: `no JSON report from Playwright: ${(stderr || stdout).slice(0, 400)}`, attachments: [] });
        return;
      }
      const tests = collectTests(report);
      if (tests.length !== 1) {
        const errs = (report.errors ?? []).map((e: any) => String(e.message ?? '').replace(ANSI, '')).join(' | ');
        resolve({ status: 'error', verdict: 'INFRA_FAIL', message: `expected 1 test, found ${tests.length}. ${errs}`.slice(0, 400), attachments: [] });
        return;
      }
      const result = tests[0].results?.[tests[0].results.length - 1] ?? {};
      const attachments = (result.attachments ?? [])
        .filter((a: any) => a.body)
        .map((a: any) => ({ name: a.name, body: Buffer.from(a.body, 'base64').toString('utf8') }));
      if (result.status === 'passed') { resolve({ status: 'passed', attachments }); return; }
      const message = String(result.errors?.[0]?.message ?? result.error?.message ?? result.status ?? 'unknown failure').replace(ANSI, '');
      const { verdict, step } = classifyFailure(message);
      resolve({ status: 'failed', verdict, step, message, attachments });
    });
  });
}

async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---- simulation --------------------------------------------------------------------------------

/** Perform the scenario on a reference cart and return the serialized view after every step. */
export async function simulateViews(s: Scenario, defect?: DefectId, pricing: PricingModule = referencePricing): Promise<string[]> {
  const cart = new ReferenceCart({ pricing, defect });
  const names = new Map<string, string>();
  const reserved = reservedNames(s);
  const views: string[] = [];
  let broken = false;
  for (const step of s.steps) {
    if (broken) { views.push('(not reached)'); continue; }
    try {
      if (step.do === 'add') {
        if (!names.has(step.product)) {
          const p = s.products[step.product];
          const pick: ProductPick = p.pick === 'by-name'
            ? { pick: 'by-name', name: p.name }
            : p.pick === 'first-available'
              ? { pick: 'first-available', needQty: needQty(s, step.product) }
              : { pick: 'next-available', distinctFrom: p.distinctFrom.map((a) => ({ name: names.get(a) as string })), needQty: needQty(s, step.product) };
          const facts = await selectProduct(cart, pick, { reserved: p.pick === 'by-name' ? [] : reserved, pickLimit: 30, constraints: pricing.constraints });
          names.set(step.product, facts.name);
        }
        await cart.addProduct(names.get(step.product) as string, step.qty as number);
      } else if (step.do === 'setQty') {
        await cart.setQuantity(names.get(step.product) as string, step.qty as number);
      } else {
        await cart.remove(names.get(step.product) as string);
      }
      views.push(JSON.stringify(await cart.readCart(), evidenceReplacer));
    } catch (e) {
      views.push(`(error: ${(e as Error).message})`);
      broken = true;
    }
  }
  return views;
}

export async function simulateCartViews(s: Scenario, defect?: DefectId): Promise<CartView[]> {
  return (await simulateViews(s, defect)).map((v) => JSON.parse(v) as CartView);
}

// ---- gates -------------------------------------------------------------------------------------

export type DefectResult = 'detected' | 'detected-late' | 'missed' | 'not-applicable' | 'error';
export type DefectRow = { defect: DefectId; result: DefectResult; firstDiff?: string; failedAt?: string; verdict?: Verdict; message?: string };

const CHECKPOINT_VERDICTS = new Set<Verdict>(['ORACLE_MISMATCH', 'UNMODELED_ADJUSTMENT', 'LOCATOR_FAIL']);

export async function gates(root: string, slug: string): Promise<CommandResult> {
  // G0: scenario valid and frozen; test exists and was compiled from the current scenario.
  const loaded = loadValid(root, slug);
  if (!loaded.ok) return loaded.result;
  const s = loaded.scenario;
  const state = freezeState(root, slug, loaded.data);
  if (state !== 'frozen') return { verdict: 'SPEC_INVALID', lines: [`G0 ${freezeMessage(state)}.`] };
  const testFile = paths.test(root, slug);
  if (!fs.existsSync(testFile)) return { verdict: 'FILE_CONFLICT', lines: [`G0 ${path.relative(root, testFile)} does not exist; run \`qa-harness compile ${slug}\`.`] };
  const info = inspectTestFile(fs.readFileSync(testFile, 'utf8'));
  if (info.generated && (info.scenarioId !== s.id || info.scenarioHash !== scenarioHash(loaded.data))) {
    return { verdict: 'FILE_CONFLICT', lines: [`G0 the test was compiled from another version of the scenario; run \`qa-harness compile ${slug}\`.`] };
  }
  const handEdited = !info.untouched;
  const lines: string[] = [`Gates for ${slug} (reference cart, ${ALL_DEFECTS.length} defects)`];
  lines.push(`G0 ok: scenario valid and frozen; test ${handEdited ? 'present, marked hand-edited' : 'compiled from the current scenario'}`);

  // G2 preparation: which defects change the views, and where first.
  const healthy = await simulateViews(s);
  const diffs = new Map<DefectId, string | undefined>();
  for (const d of ALL_DEFECTS) {
    const broken = await simulateViews(s, d);
    const i = broken.findIndex((v, k) => v !== healthy[k]);
    diffs.set(d, i < 0 ? undefined : s.steps[i].id);
  }
  const applicable = ALL_DEFECTS.filter((d) => diffs.get(d));

  // G1 and G2 runs, in parallel processes.
  const jobs: Array<DefectId | undefined> = [undefined, ...applicable];
  const limit = Math.max(2, Math.min(6, Math.floor(os.cpus().length / 2)));
  const outcomes = await pool(jobs, limit, (d) => runScenarioTest(root, slug, d));
  const g1 = outcomes[0];
  if (g1.status !== 'passed') {
    lines.push(`G1 red on the healthy reference cart: ${(g1.message ?? '').split('\n').slice(0, 4).join(' | ')}`);
    const verdict = g1.verdict ?? 'INFRA_FAIL';
    return { verdict, lines, data: { g1 } };
  }
  lines.push('G1 ok: green on the healthy reference cart');

  const stepIndex = (id?: string) => s.steps.findIndex((x) => x.id === id);
  const rows: DefectRow[] = ALL_DEFECTS.map((d) => {
    const firstDiff = diffs.get(d);
    if (!firstDiff) return { defect: d, result: 'not-applicable' };
    const o = outcomes[1 + applicable.indexOf(d)];
    if (o.status === 'passed') return { defect: d, result: 'missed', firstDiff };
    if (o.status === 'failed' && o.verdict && CHECKPOINT_VERDICTS.has(o.verdict) && o.step) {
      const late = stepIndex(o.step) > stepIndex(firstDiff);
      return { defect: d, result: late ? 'detected-late' : 'detected', firstDiff, failedAt: o.step, verdict: o.verdict };
    }
    return { defect: d, result: 'error', firstDiff, verdict: o.verdict ?? 'INFRA_FAIL', message: o.message };
  });

  lines.push(`G2 ${'defect'.padEnd(26)} ${'result'.padEnd(15)} ${'red at'.padEnd(7)} first diff`);
  for (const r of rows) {
    const extra = r.result === 'error' ? `  ${r.verdict}: ${(r.message ?? '').split('\n')[0].slice(0, 60)}` : r.verdict && r.verdict !== 'ORACLE_MISMATCH' ? `  (${r.verdict})` : '';
    lines.push(`   ${r.defect.padEnd(26)} ${r.result.padEnd(15)} ${(r.failedAt ?? '-').padEnd(7)} ${r.firstDiff ?? '-'}${extra}`);
  }
  const missed = rows.filter((r) => r.result === 'missed').map((r) => r.defect);
  const errors = rows.filter((r) => r.result === 'error');
  let verdict: Verdict = 'GATES_OK';
  if (missed.length) {
    verdict = 'DEFECT_MISSED';
    lines.push(`Missed: ${missed.join(', ')}`);
  } else if (errors.length) {
    verdict = errors[0].verdict ?? 'INFRA_FAIL';
    lines.push(`Runs that failed outside a checkpoint: ${errors.map((e) => e.defect).join(', ')}`);
  }
  return { verdict, lines, data: { rows, handEdited } };
}
