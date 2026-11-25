// qa-harness report <slug> [--promote <runId>]: report.md of a run, and the atomic promotion of a run's files.
// Implements design 8.5 (promotion), 11.2 (readback), 11.4 (the test document) and order N, 6.5.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CheckpointRecord } from '../core/checkpoint';
import type { RunRecord } from '../core/classification';
import { files, formatOf, loadConfig, packageRoot } from '../core/config';
import { describeRule, type PricingModule } from '../core/pricing';
import { readScenarioFile } from '../core/scenario';
import type { Verdict } from '../core/verdicts';
import { loadPricing, rel, type CommandResult } from './common';
import { withLock } from './run-dir';

/** What verification.json holds (design 8.5); written by run and verify. */
export type Verification = {
  runId: string;
  slug: string;
  scenarioSha256: string;
  rulesSha256: string;
  testSha256: string;
  driverSha256: string | null;
  testOrigin: 'compiled' | 'edited';
  gates: Record<string, unknown>;
  defects: Array<{ defect: string; result: string; expected: string | null; firstRed: string | null; hint?: string }>;
  livePass?: { defects: Array<{ defect: string; result: string }>; products: string };
  controls?: Array<{ control: string; result: string; activated: boolean | null; target: string; shownAtRead: string | null; reactedAt: string | null; expected: string; note?: string }>;
  gaps: string[];
  verdict: Verdict;
};

const readJson = <T>(file: string): T | undefined => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) as T : undefined);

const total = (c: CheckpointRecord) => (c.displayed && 'total' in c.displayed && c.displayed.total ? c.displayed.total : undefined);

/** The rerun command, verbatim from the root of the repository that holds the package (11.2). */
export function rerunCommand(root: string, slug: string): string {
  const pkg = packageRoot();
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: pkg, encoding: 'utf8' });
  const from = top.status === 0 ? path.relative(top.stdout.trim(), pkg) || '.' : pkg;
  const base = `cd ${from} && npm run qa -- run ${slug}`;
  return root === pkg ? base : `${base} --root ${path.relative(pkg, root)}`;
}

/** A control's target for a table cell: the row label without its DOM fragment, the request without ids. */
function readableTarget(target: string): string {
  return target.replace(/: <[\s\S]*$/, ' (its DOM fragment is in verification.json)').replace(/, first [A-Z]+ \S+$/, '').replace(/\|/g, '\\|');
}

/** Does the run tell the total apart from the subtotal and from a single line? (10.6, scope of the evidence) */
function scopeLine(cps: CheckpointRecord[]): string {
  const rows = [...new Set(cps.map((c) => total(c)?.label).filter(Boolean))].map((r) => `"${r}"`).join(', ') || 'none';
  const apart = cps.filter((c) => {
    const t = total(c)?.value;
    const lines = c.displayed && !c.displayed.empty && 'lines' in c.displayed ? c.displayed.lines.map((l) => l.lineTotal.value) : [];
    return t !== undefined && t !== c.expected.subtotal && !lines.includes(t);
  }).map((c) => c.step);
  return apart.length
    ? `The total was read from the row ${rows}. At ${apart.join(', ')} it differed from the subtotal and from every line total, so a driver reading another field would have failed there.`
    : `The total was read from the row ${rows}. In this run it always equalled the subtotal or a line total, so the live run alone cannot tell those fields apart; only the label-based control skew-total shows that the driver reads the total.`;
}

/** report.md: verdict, products, steps, evidence and its absence, scope, gaps, rules, rerun (11.2, 11.4). */
export function buildReport(root: string, slug: string, runDir: string, screens: string): string {
  const run = readJson<RunRecord>(path.join(runDir, 'run.json'));
  const ver = readJson<Verification>(path.join(runDir, 'verification.json'));
  const config = loadConfig(root);
  const fmt = formatOf(config);
  const pricing: PricingModule = loadPricing(root, config.app);
  const scenario = readScenarioFile(root, slug).data as { title: string; request: string; steps: Array<{ do: string; product: string }> };
  const aliases = [...new Set(scenario.steps.filter((s) => s.do === 'add').map((s) => s.product))];
  const verdict = ver?.verdict ?? run?.verdict ?? 'NO_TESTS_RUN';
  const repeats = run?.repeats ?? [];
  const passCount = repeats.filter((r) => r.result === 'pass').length;
  const shown = repeats.find((r) => r.result === 'fail') ?? repeats[0];
  const cps = shown?.checkpoints ?? [];
  const out: string[] = [];
  out.push(`# ${scenario.title}`, '');
  out.push(`**${verdict}${repeats.length ? ` ${passCount}/${repeats.length}` : ''}** · scenario \`${slug}\` · run \`${path.basename(runDir)}\`${run?.meta.timestamp ? ` · ${run.meta.timestamp}` : ''} · ${config.baseURL} · Chromium, ${config.locale}`, '');
  out.push(`The tester asked: "${scenario.request.replace(/\s+/g, ' ').trim()}"`, '');
  out.push('## Products', '');
  const products = new Map(repeats.flatMap((r) => r.checkpoints).flatMap((c) => c.ledger).map((l) => [l.name, l]));
  if (products.size) {
    out.push('| Alias | Product | Unit price (read at the add) | Attributes |', '| --- | --- | --- | --- |');
    [...products.values()].forEach((p, i) => out.push(`| ${aliases[i] ?? '—'} | ${p.name} | ${p.unitPrice} | ${Object.entries(p.attrs).map(([k, v]) => `${k} ${v}`).join(', ') || '—'} |`));
  } else out.push('No product was chosen in this run.');
  out.push('', `## Steps (repeat ${shown?.n ?? '—'} of ${repeats.length})`, '');
  if (cps.length) {
    out.push('| Step | Shopper\'s action | Expected | How it is made up | Displayed (raw text) | Row read | Result | Screenshot |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const c of cps) {
      const t = total(c);
      const [exp, comp] = c.expected.composition.split(' = ');
      out.push(`| ${c.step} | ${c.action} | ${exp} | ${comp ?? ''} | ${t ? `"${t.rawText}"` : 'no total shown'} | ${t?.label ? `"${t.label}"` : '—'} | ${c.result === 'pass' ? 'match' : `**${c.verdict}** (${c.layer})`} | ${c.screenshot ? `[${c.step}](${screens}${c.step}.png)` : '—'} |`);
    }
  } else out.push('No checkpoint was judged in this run.');
  const failure = repeats.find((r) => r.error)?.error;
  if (failure) {
    out.push('', '## What failed', '', '```text', failure.message, '```', '');
    out.push(`Failed at ${failure.step ?? 'the start (before the first step)'}${failure.url ? ` on ${failure.url}` : ''}${failure.rawTotal ? `; the last total shown was "${failure.rawTotal}"` : ''}${failure.rawText ? `; the application said: "${failure.rawText}"` : ''}.`);
  }
  out.push('', '## Evidence', '');
  const g = ver?.gates ?? {};
  const applicable = (ver?.defects ?? []).filter((d) => d.result !== 'not-applicable');
  const detected = applicable.filter((d) => d.result === 'detected');
  out.push(`- Static check G0, reference cart G1 and defects G2: ${g.dry ?? 'not run'}; defects ${detected.length}/${applicable.length} applicable, ${detected.length === applicable.length ? 'each detected at the expected checkpoint' : 'NOT all detected where expected'} (on the example's stub prices).`);
  if (ver?.livePass) out.push(`- G2 repeated on the products of this run (${ver.livePass.products}): ${ver.livePass.defects.filter((d) => d.result === 'detected').length}/${ver.livePass.defects.filter((d) => d.result !== 'not-applicable').length} applicable defects detected where expected.`);
  out.push(`- Live run G3: ${g.G3 ?? 'not run'}${repeats.length ? `, ${passCount}/${repeats.length} repeats passed` : ''}; the test is ${ver?.testOrigin === 'edited' ? 'EDITED BY HAND' : 'the untouched compilation of the confirmed scenario'}.`);
  if (ver?.controls?.length) {
    out.push(`- Live controls G4: ${g.G4 ?? 'not run'}.`, '', '| Control | Result | Activated | Element or request changed | Shown at the read | First red | Expected |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const c of ver.controls) out.push(`| ${c.control} | ${c.result} | ${c.activated === null ? '—' : c.activated ? 'yes' : 'no'} | ${readableTarget(c.target)} | ${c.shownAtRead ?? '—'} | ${c.reactedAt ?? '—'} | ${c.expected}${c.note ? ` (${c.note})` : ''} |`);
    out.push('');
  } else out.push('- **Not available:** live controls G4 were not run (`qa-harness verify` runs them after a green G3).');
  out.push('- **Not available:** the intent review and the report review are written by an agent, not by the harness; none is part of this run.');
  if (cps.length) out.push('', '## Scope', '', scopeLine(cps));
  out.push('', '## Scenario gaps', '');
  out.push(...((ver?.gaps ?? []).length ? (ver?.gaps ?? []).map((x) => `- ${x}`) : ['None: every default defect is applicable in this scenario.']));
  out.push('', '## Rules used', '');
  for (const r of pricing.rules) {
    const inForce = cps.filter((c) => c.expected.adjustments.some((a) => a.rule === r.id)).map((c) => c.step);
    out.push(`- ${describeRule(r)} · source: ${r.provenance.source} (${r.provenance.ref}) · live: ${r.provenance.live} · ${inForce.length ? `in force at ${inForce.join(', ')}` : 'not in force'} in this run.`);
  }
  out.push(`- Total row label ${pricing.summary.total.label}, subtotal row label ${pricing.summary.subtotal.label} · source: ${pricing.summary.provenance.source} (${pricing.summary.provenance.ref}).`);
  out.push('', '## How to rerun and how to read a failure', '');
  out.push(`Rerun: \`${rerunCommand(root, slug)}\``, '');
  out.push('A red checkpoint names the step, the action, the expected amount with how it is made up, the raw text the page displayed and the row it came from, the difference, and the first layer that disagreed (state, labels, lines, unit price, line total, adjustments, subtotal, total). `ORACLE_MISMATCH` means the amounts differ: an application bug or a missing rule. `UNMODELED_ADJUSTMENT` means the cart shows an adjustment no rule describes. `LOCATOR_FAIL` means the driver did not find an element, got no acknowledgment, or read a field with another label. `INFRA_FAIL` means the environment failed. The full data is in `run.json` and `verification.json`; the Playwright HTML report of the run stays outside the repo in `runs/<runId>/html/`.');
  out.push('', `Amounts are in ${fmt.currency}; expected amounts are exact values rounded to the cent, displayed amounts are the page's own text.`);
  return out.join('\n') + '\n';
}

/** The readback of design 11.2: at most 15 lines. */
export function readback(root: string, slug: string, runDir: string): string[] {
  const run = readJson<RunRecord>(path.join(runDir, 'run.json'));
  const ver = readJson<Verification>(path.join(runDir, 'verification.json'));
  const repeats = run?.repeats ?? [];
  const cps = (repeats.find((r) => r.result === 'fail') ?? repeats[0])?.checkpoints ?? [];
  const lines = [`${ver?.verdict ?? run?.verdict} ${repeats.filter((r) => r.result === 'pass').length}/${repeats.length} · run ${path.basename(runDir)}`];
  for (const c of cps.slice(0, 8)) {
    const t = total(c);
    lines.push(`${c.step.padEnd(4)} ${c.action.padEnd(38)} ${c.expected.composition.split(' = ')[0].padEnd(9)} ${t ? `"${t.rawText}"`.padEnd(10) : 'none'.padEnd(10)} ${c.result === 'pass' ? 'match' : c.verdict}`);
  }
  if (ver?.gaps.length) lines.push(`Scenario gaps: ${ver.gaps.length} (see report.md)`);
  lines.push(`Rerun: ${rerunCommand(root, slug)}`);
  return lines;
}

/** The newest run directory of a scenario. */
export function latestRun(root: string, slug: string): string | undefined {
  const runs = files.runs(root, slug);
  if (!fs.existsSync(runs)) return undefined;
  const ids = fs.readdirSync(runs).filter((d) => fs.existsSync(path.join(runs, d, 'run.json')) || fs.existsSync(path.join(runs, d, 'verification.json'))).sort();
  return ids.length ? path.join(runs, ids[ids.length - 1]) : undefined;
}

const TRACKED = ['report.md', 'run.json', 'verification.json', 'review.md'];

/** Replace the tracked set in reports/<slug>/ with the complete set of one run, never a mix (8.5, 6.5). */
export async function promote(root: string, slug: string, runId: string): Promise<string[]> {
  const runDir = path.join(files.runs(root, slug), runId);
  if (!fs.existsSync(path.join(runDir, 'run.json')) && !fs.existsSync(path.join(runDir, 'verification.json'))) {
    throw new Error(`run ${runId} of ${slug} has no run.json; name a run directory under ${rel(root, files.runs(root, slug))}/.`);
  }
  const target = files.reports(root, slug);
  return withLock(root, slug, () => {
    const staging = path.join(target, `.promote-${runId}`);
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(path.join(staging, 'screens'), { recursive: true });
    fs.writeFileSync(path.join(staging, 'report.md'), buildReport(root, slug, runDir, 'screens/'));
    for (const f of TRACKED.slice(1)) if (fs.existsSync(path.join(runDir, f))) fs.copyFileSync(path.join(runDir, f), path.join(staging, f));
    const shots = fs.readdirSync(runDir).filter((f) => f.endsWith('.png'));
    for (const f of shots) fs.copyFileSync(path.join(runDir, f), path.join(staging, 'screens', f));
    const old = path.join(target, `.previous-${runId}`);
    fs.rmSync(old, { recursive: true, force: true });
    fs.mkdirSync(old);
    for (const f of [...TRACKED, 'screens']) if (fs.existsSync(path.join(target, f))) fs.renameSync(path.join(target, f), path.join(old, f));
    for (const f of [...TRACKED, 'screens']) if (fs.existsSync(path.join(staging, f))) fs.renameSync(path.join(staging, f), path.join(target, f));
    fs.rmSync(old, { recursive: true, force: true });
    fs.rmSync(staging, { recursive: true, force: true });
    return [...TRACKED.filter((f) => fs.existsSync(path.join(target, f))), `screens/ (${shots.length})`];
  });
}

export async function report(root: string, slug: string, promoteId: string | undefined): Promise<CommandResult> {
  if (promoteId) {
    const placed = await promote(root, slug, promoteId);
    const lines = readback(root, slug, path.join(files.runs(root, slug), promoteId));
    return { verdict: 'PASS', lines: [...lines.slice(0, 11), `Promoted run ${promoteId} to ${rel(root, files.reports(root, slug))}/: ${placed.join(', ')}.`] };
  }
  const runDir = latestRun(root, slug);
  if (!runDir) return { verdict: 'NO_TESTS_RUN', lines: [`${slug} has no run yet; run qa-harness run ${slug} first.`] };
  fs.writeFileSync(path.join(runDir, 'report.md'), buildReport(root, slug, runDir, ''));
  return { verdict: 'PASS', lines: [...readback(root, slug, runDir), `Wrote ${rel(root, path.join(runDir, 'report.md'))}.`] };
}
