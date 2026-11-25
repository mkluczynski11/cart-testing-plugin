// qa-harness run <slug> [--dry]: gates G0–G2 dry, or G0–G3 with a live run, in a new run directory.
// Implements design 6.1 (run, classification order), 10 (gates), 10.5 (results) and 8.5 (run evidence).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { files } from '../core/config';
import { deriveDefects } from '../core/operators';
import { fileHash, freezeMessage } from '../core/scenario';
import type { Verdict } from '../core/verdicts';
import { classify } from '../core/classification';
import { loadScenario, rel, type CommandResult, type Loaded } from './common';
import { admitAdditional } from './defects';
import { exampleProducts, gateG0, gateG1, gateG2, judgedByTest, type DefectRow, type Product } from './gates';
import { admitRepair, closeAttempt, type RepairTarget } from './attempts';
import { buildReport, type Verification } from './report';
import { addOrder } from '../core/example';
import { decimalText, parseAmount } from '../core/money';
import type { RunRecord } from '../core/classification';
import { runPlaywright } from './playwright-runner';
import { createRunDir, withLock } from './run-dir';
import { intentOkHash } from './intent';

/** One line per checkpoint of a repeat: expected, displayed raw text and result. */
export function checkpointLines(run: RunRecord, n = 0): string[] {
  const r = run.repeats[n];
  if (!r) return [];
  return r.checkpoints.map((c) => {
    const shown = c.displayed && 'total' in c.displayed && c.displayed.total ? `"${c.displayed.total.rawText}" in row "${c.displayed.total.label}"` : 'no total shown';
    return `${c.step.padEnd(4)} ${c.action.padEnd(38)} expected ${c.expected.composition.split(' = ')[0].padEnd(9)} displayed ${shown}  ${c.result}`;
  });
}

export async function liveGate(loaded: Loaded, runDir: string): Promise<{ run: RunRecord; verdict: Verdict; lines: string[] }> {
  const { config } = loaded;
  const repeat = config.repeat;
  const run = await runPlaywright({ root: loaded.root, project: 'live', slug: loaded.slug, runDir, repeat, timeoutMs: repeat * config.timeouts.testMs + 60_000 });
  const c = classify(run, judgedByTest(loaded));
  const pass = c.perRepeat.filter((v) => v === 'PASS').length;
  const lines = [`G3 live, ${repeat} repeat(s) on ${config.baseURL}: ${pass}/${c.perRepeat.length} pass; ${c.reason}`];
  const seen = new Map((run.repeats[0]?.checkpoints ?? []).flatMap((cp) => cp.ledger).map((p) => [p.name, p]));
  const products = [...seen.values()];
  if (products.length) lines.push(`   products: ${products.map((p) => `${p.name} (${p.unitPrice}${Object.keys(p.attrs).length ? `, ${Object.entries(p.attrs).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''})`).join(' · ')}`);
  lines.push(...checkpointLines(run).map((l) => `   ${l}`));
  const failure = run.repeats.find((r) => r.error)?.error;
  if (failure) lines.push(...failure.message.split('\n').slice(0, 6).map((l) => `   ${l}`));
  return { run, verdict: c.verdict, lines };
}

/** The probe of the application address before the browser starts (6.1, point 1). Null when it answers. */
export async function probeAddress(baseURL: string, probeMs: number): Promise<string | null> {
  try {
    const res = await fetch(baseURL, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(probeMs) });
    return res.status >= 500 ? `${baseURL} answered HTTP ${res.status}; retry later or check the application.` : null;
  } catch (e) {
    const cause = (e as { cause?: { code?: string } }).cause?.code ?? (e as Error).name;
    return `${baseURL} did not answer within ${probeMs} ms (${cause}); check baseURL in qa.config.json and the network.`;
  }
}

export type DryGates = { verdict: Verdict; lines: string[]; rows: DefectRow[]; gaps: string[]; handEdited: boolean };

/** G0, G1 and G2 on the example's stubs. */
export async function dryGates(loaded: Loaded, dir: string): Promise<DryGates> {
  const g0 = gateG0(loaded);
  if (g0.verdict !== 'PASS') return { ...g0, rows: [], gaps: [] };
  const g1 = await gateG1(loaded, path.join(dir, 'dry', 'g1'));
  const lines = [...g0.lines, ...g1.lines];
  if (g1.verdict !== 'PASS') return { verdict: g1.verdict, lines, rows: [], gaps: [], handEdited: g0.handEdited };
  const admission = await admitAdditional(loaded);
  const defects = [...deriveDefects(loaded.scenario, loaded.pricing.rules), ...admission.admitted];
  const g2 = await gateG2(loaded, path.join(dir, 'dry', 'g2'), exampleProducts(loaded), defects);
  const gaps = [...(loaded.example?.gaps ?? []), ...g2.rows.filter((r) => r.result === 'not-applicable').map((r) => `${r.defect} is not applicable: ${r.hint}`)];
  lines.push(...g2.lines);
  for (const r of admission.rejected) lines.push(`   additional defect ${r.id} rejected: ${r.reason}`);
  return { verdict: g2.verdict, lines, rows: g2.rows, gaps, handEdited: g0.handEdited };
}

/** The verification record of a run (design 8.5): hashes, gate results, defects, controls, gaps, the verdict. */
export function writeVerification(loaded: Loaded, dir: string, gates: Record<string, unknown>, dry: DryGates, verdict: Verdict, extra: Partial<Verification> = {}): void {
  const driver = files.driver(loaded.root, loaded.config.app);
  const record: Verification = {
    runId: path.basename(dir),
    slug: loaded.slug,
    scenarioSha256: loaded.scenarioSha256,
    rulesSha256: loaded.rulesSha256,
    testSha256: fileHash(files.test(loaded.root, loaded.slug)),
    driverSha256: fs.existsSync(driver) ? fileHash(driver) : null,
    testOrigin: dry.handEdited ? 'edited' : 'compiled',
    intentSha256: intentOkHash(loaded.root, loaded.slug),
    gates,
    defects: dry.rows,
    gaps: dry.gaps,
    verdict,
    ...extra,
  };
  fs.writeFileSync(path.join(dir, 'verification.json'), JSON.stringify(record, null, 2) + '\n');
}

/** The products of a live run as reference-cart products, in the order of their first add. */
export function liveProducts(loaded: Loaded, rec: RunRecord): Product[] | undefined {
  const seen = new Map((rec.repeats[0]?.checkpoints ?? []).flatMap((c) => c.ledger).map((l) => [l.name, l]));
  const order = addOrder(loaded.scenario);
  if (seen.size !== order.length) return undefined;
  return [...seen.values()].map((l, i) => {
    const price = parseAmount(l.unitPrice, loaded.fmt);
    return { alias: order[i], item: { name: l.name, price: price ? decimalText(price) : '0.00', inStock: true, attrs: l.attrs } };
  });
}

/** Finish a run directory: the final verdict in run.json and verification.json, and report.md. */
export function finishRun(loaded: Loaded, dir: string, verdict: Verdict): void {
  const runFile = path.join(dir, 'run.json');
  if (fs.existsSync(runFile)) {
    const rec = JSON.parse(fs.readFileSync(runFile, 'utf8')) as RunRecord;
    fs.writeFileSync(runFile, JSON.stringify({ ...rec, verdict }, null, 2) + '\n');
  }
  fs.writeFileSync(path.join(dir, 'report.md'), buildReport(loaded.root, loaded.slug, dir, ''));
}

export type RunOptions = { dry: boolean; repair?: RepairTarget };

export async function run(root: string, slug: string, opts: RunOptions): Promise<CommandResult> {
  const { dry, repair } = opts;
  const got = loadScenario(root, slug);
  if (!got.ok) return got.result;
  const loaded = got.loaded;
  if (loaded.freeze !== 'frozen') return { verdict: 'SCENARIO_CHANGED', lines: [freezeMessage(loaded.freeze, slug)] };
  let attempt: number | undefined;
  if (repair === 'driver' && dry) {
    return { verdict: 'SPEC_INVALID', lines: [`--repair driver needs a live run: a dry run (G0–G2 on the reference cart) never calls the driver, so it cannot show a repair. Run qa-harness run ${slug} --repair driver without --dry.`] };
  }
  if (repair) {
    const admitted = await withLock(root, slug, () => admitRepair(root, slug, loaded.config.app, repair));
    if (!admitted.ok) return { verdict: admitted.verdict, lines: [admitted.line] };
    attempt = admitted.attempt.attempt;
  }
  const { runId, dir } = createRunDir(root, slug);
  const result = await gatesUpToG3(loaded, dir, dry);
  if (attempt !== undefined) await withLock(root, slug, () => closeAttempt(root, slug, attempt as number, runId, result.verdict));
  return { ...result, lines: [`Run ${runId} of ${slug}${dry ? ' (dry: gates G0–G2 on the reference cart)' : ''}${attempt ? `, repair attempt ${attempt}` : ''}`, ...result.lines, `Evidence: ${rel(root, dir)}/`], data: { ...result.data, runId } };
}

/** G0–G2 dry, then the probe and G3 live, then G2 again on the products of the live run. */
export async function gatesUpToG3(loaded: Loaded, dir: string, dry: boolean): Promise<CommandResult & { live?: RunRecord; dryGates: DryGates }> {
  const lines: string[] = [];
  const d = await dryGates(loaded, dir);
  lines.push(...d.lines);
  const gates: Record<string, unknown> = { dry: d.verdict };
  if (d.verdict !== 'PASS' || dry) {
    writeVerification(loaded, dir, gates, d, d.verdict);
    lines.push(...d.gaps.slice(0, 4).map((g) => `Scenario gap: ${g}`));
    return { verdict: d.verdict, lines, data: { rows: d.rows }, dryGates: d };
  }
  const probe = await probeAddress(loaded.config.baseURL, loaded.config.timeouts.probeMs);
  if (probe) {
    gates.G3 = 'INFRA_FAIL';
    writeVerification(loaded, dir, gates, d, 'INFRA_FAIL');
    finishRun(loaded, dir, 'INFRA_FAIL');
    return { verdict: 'INFRA_FAIL', lines: [...lines, `G3 not started: ${probe}`], dryGates: d };
  }
  const g3 = await liveGate(loaded, dir);
  gates.G3 = g3.verdict;
  lines.push(...g3.lines);
  let verdict = g3.verdict;
  let livePass: Verification['livePass'];
  const products = verdict === 'PASS' ? liveProducts(loaded, g3.run) : undefined;
  if (products) {
    const defects = [...deriveDefects(loaded.scenario, loaded.pricing.rules), ...(await admitAdditional(loaded)).admitted];
    const g2 = await gateG2(loaded, path.join(dir, 'dry', 'g2-live'), products, defects);
    livePass = { defects: g2.rows, products: products.map((p) => `${p.alias} = ${p.item.name} ${p.item.price}`).join(', ') };
    gates.G2live = g2.verdict;
    lines.push(`G2 again on the products of this run: ${g2.lines[0].replace(/^G2 /, '')}`);
    if (g2.verdict !== 'PASS') verdict = g2.verdict;
  }
  const gaps = livePass ? [...(loaded.example?.gaps ?? []), ...livePass.defects.filter((r) => r.result === 'not-applicable').map((r) => `${r.defect} is not applicable with the products of this run: ${(r as DefectRow).hint}`)] : d.gaps;
  writeVerification(loaded, dir, gates, { ...d, gaps }, verdict, livePass ? { livePass } : {});
  finishRun(loaded, dir, verdict);
  return { verdict, lines, live: g3.run, dryGates: d };
}
