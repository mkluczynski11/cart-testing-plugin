// The dry gates on the reference cart: G1 (healthy cart conforms to the example) and G2 (defects).
// Implements design 10 (G1, G2), 10.2 (how a defect is used) and 10.5 (applicability and results).
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CheckpointRecord } from '../core/checkpoint';
import { stubCatalog, type ExampleFile } from '../core/example';
import type { DrySetup } from '../core/fixtures';
import type { CatalogItem } from '../core/reference-cart';
import type { Verdict } from '../core/verdicts';
import { classify } from './classify';
import type { Loaded } from './common';
import { runPlaywright, type PlaywrightRun } from './playwright-runner';

export type GateOutcome = { verdict: Verdict; lines: string[] };

/** Run the compiled test once on the reference cart with a dry setup written into `dir`. */
export function dryRun(loaded: Loaded, dir: string, setup: DrySetup): Promise<PlaywrightRun> {
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
export async function gateG1(loaded: Loaded, dir: string): Promise<GateOutcome & { run: PlaywrightRun }> {
  const ex = loaded.example as ExampleFile;
  const run = await dryRun(loaded, dir, { catalog: exampleCatalog(loaded) });
  const c = classify(run, loaded.scenario.checkpoints);
  if (c.verdict !== 'PASS') {
    const why = run.repeats[0]?.failure?.message.split('\n').slice(0, 3).join(' | ') ?? c.reason;
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
