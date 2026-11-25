// qa-harness report <slug> [--promote <runId>]: report.md of a run, and the atomic promotion of a run's files.
// Implements design 8.5 (promotion), 11.2 (readback), 11.4 (the test document) and order N, 6.5.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CheckpointRecord } from '../core/checkpoint';
import type { RunRecord } from '../core/classification';
import { files, formatOf, loadConfig, packageRoot } from '../core/config';
import { formatMoney, fromDecimal } from '../core/money';
import { describeRule, describeSource, type PricingModule } from '../core/pricing';
import { fileHash, readScenarioFile } from '../core/scenario';
import type { Verdict } from '../core/verdicts';
import { loadPricing, rel, type CommandResult } from './common';
import { readAttempts } from './attempts';
import { intentReview, runReviewVerdict } from './intent';
import { withLock } from './run-dir';

/** One defect's result in one G2 pass, as gateG2 records it (design 10.5). */
export type DefectEntry = { defect: string; origin?: string; operator?: string; why?: string; result: string; expected: string | null; firstRed: string | null; hint?: string };

/** What verification.json holds (design 8.5); written by run and verify. */
export type Verification = {
  runId: string;
  slug: string;
  scenarioSha256: string;
  rulesSha256: string;
  testSha256: string;
  driverSha256: string | null;
  testOrigin: 'compiled' | 'edited';
  intentSha256?: string | null;  // the scenario hash for which a current INTENT_OK review exists (8.5), else null
  gates: Record<string, unknown>;
  defects: DefectEntry[];
  livePass?: { defects: DefectEntry[]; products: string };
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

/** The intent review row of the verification table: its verdict and file, or why it does not count. */
function intentCell(root: string, slug: string, repo: (p: string) => string): string {
  const intent = intentReview(root, slug);
  const file = `\`${repo(path.relative(root, path.join(root, intent.file.replace(/^e2e\//, ''))))}\``;
  if (intent.state === 'current') return `${intent.verdict}, ${file}, for the confirmed scenario`;
  if (intent.state === 'stale') return `STALE: ${file} (${intent.verdict}) reviews scenario ${intent.reviewed?.slice(0, 12)}…, the confirmed one is ${intent.confirmed?.slice(0, 12)}…`;
  if (intent.state === 'unreadable') return `does not count: ${file} has no scenario_sha256 or verdict line`;
  return `not available (${file} ${intent.state === 'missing' ? 'does not exist' : 'needs a confirmed scenario'}; test-verifier writes it)`;
}

/** The table of every defect of the run, both G2 passes, read from verification.json (10.2–10.5, 11.4). */
function defectTable(ver: Verification | undefined): string[] {
  const stub = ver?.defects ?? [];
  if (!stub.length) return ['No defect was run: verification.json has no G2 result.'];
  const live = new Map((ver?.livePass?.defects ?? []).map((d) => [d.defect, d]));
  const cell = (s: string | undefined | null) => (s ?? '—').replace(/\|/g, '\\|');
  const out = [
    `Every defect the test was checked against. Stub prices: the approved example. Live prices: ${ver?.livePass ? `the products of this run (${cell(ver.livePass.products)})` : 'not run (no live run reached G2 again)'}.`, '',
    '| Defect | Origin | What it plants | Stub prices | First red | Live prices | First red |', '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const d of stub) {
    const l = live.get(d.defect);
    out.push(`| ${cell(d.defect)} | ${cell(d.origin)} | ${cell(d.why)} | ${d.result} | ${cell(d.firstRed)} | ${l?.result ?? 'not run'} | ${cell(l?.firstRed)} |`);
  }
  return out;
}

/** "<d> of <n> detected at the right step, <k> not applicable" for one G2 pass. */
function defectCount(rows: DefectEntry[] | undefined, none: string): string {
  if (!rows?.length) return none;
  const applicable = rows.filter((d) => d.result !== 'not-applicable');
  return `${applicable.filter((d) => d.result === 'detected').length} of ${applicable.length} detected at the right step, ${rows.length - applicable.length} not applicable`;
}

export type ReportOptions = { asEvidence?: boolean };

/** The driver operations a scenario uses: the ones `qa-harness need` checks (design 9.1). */
export function scenarioActions(steps: Array<{ do: string }>, priceSource?: string): string[] {
  const kinds = new Set(steps.map((x) => x.do));
  return ['candidates', 'productFacts', 'readCart', ...(kinds.has('add') ? ['addProduct'] : []), ...(kinds.has('setQty') ? ['setQuantity'] : []),
    ...(kinds.has('remove') ? ['remove'] : []), ...(priceSource === 'api' ? ['apiPrice'] : [])];
}

/** The starter pack record that setup writes: the sha256 of every file it installed from the plugin. */
export const starterPackFile = (root: string) => path.join(root, 'app', 'starter-pack.json');

/** Where the driver came from and whether this flow changed it, from the run records and setup's record (order G). */
function driverOrigin(root: string, slug: string, app: string, runDir: string, ver: Verification | undefined): { origin: string; change: string } {
  const name = path.basename(files.driver(root, app));
  const runs = files.runs(root, slug);
  const id = path.basename(runDir);
  const earlier = (fs.existsSync(runs) ? fs.readdirSync(runs) : []).filter((d) => d <= id).sort()
    .map((d) => ({ id: d, ver: readJson<Verification>(path.join(runs, d, 'verification.json')) })).filter((r) => r.ver);
  const first = earlier[0];
  const firstSha = first?.ver?.driverSha256 ?? null;
  const nowSha = ver?.driverSha256 ?? (fs.existsSync(files.driver(root, app)) ? fileHash(files.driver(root, app)) : null);
  const pack = readJson<{ app: string; files: Record<string, string> }>(starterPackFile(root))?.files?.[name];
  if (!nowSha) return { origin: 'no driver exists yet', change: '`qa-harness need` names what it must provide.' };
  let origin = firstSha === null && first && first.id !== id ? 'built in this flow: the first run of this scenario found no driver'
    : pack && pack === (firstSha ?? nowSha) ? `the plugin's starter pack for ${app}, as setup installed it`
    : pack ? `the plugin's starter pack for ${app}, changed before this flow`
    : "written before this flow; it is not a file of the plugin's starter pack";
  const repairs = readAttempts(root, slug).filter((a) => a.target === 'driver' && a.runId && a.runId <= id);
  if (repairs.length) origin += `; repaired in this flow (${repairs.map((a) => `repair attempt ${a.attempt}, run \`${a.runId}\`, ${a.verdict}`).join('; ')})`;
  const change = !first || firstSha === nowSha
    ? `This flow did not change it (sha256 ${nowSha.slice(0, 12)}…).`
    : `This flow changed it: sha256 ${firstSha ? `${firstSha.slice(0, 12)}…` : 'none (no driver)'} at run \`${first.id}\`, ${nowSha.slice(0, 12)}… at this run.`;
  return { origin, change };
}

/** A step not run, in the words the checkpoints use, with the alias for the product. */
const actionWords = (s: { do: string; product: string; qty?: number }) => (s.do === 'add' ? `add ${s.product}, ${s.qty} unit${s.qty === 1 ? '' : 's'}`
  : s.do === 'setQty' ? `set quantity of ${s.product} to ${s.qty}` : `remove ${s.product}`);

const PRECONDITIONS: Record<string, string> = { 'empty-cart': 'empty cart', guest: 'guest', 'no-geolocation': 'no geolocation' };

/** The heading of the form: the verdict and what it means for the tester (design 11.2, 11.3). */
function headline(verdict: Verdict, live: boolean, g4: unknown, review: string | undefined, asEvidence: boolean): { title: string; status: string } {
  if (asEvidence) return { title: 'evidence of a mismatch, not a verified test', status: 'not verified (promoted with --as-evidence)' };
  if (verdict === 'PASS') {
    if (!live) return { title: 'dry gates only, not run live', status: 'not verified (dry run)' };
    if (g4 === 'PASS' && review === 'VERIFIED') return { title: 'test verified', status: 'verified' };
    if (g4 === 'PASS') return { title: 'live controls caught, report review not available', status: 'not verified (no report review)' };
    return { title: 'live run only, not verified', status: 'not verified (live controls not run)' };
  }
  const words: Partial<Record<Verdict, string>> = {
    ORACLE_MISMATCH: 'amounts differ', UNMODELED_ADJUSTMENT: 'an adjustment no rule describes',
    INFRA_FAIL: 'could not be executed', PRECONDITION_FAIL: 'could not be executed',
  };
  return { title: words[verdict] ?? 'no verified test', status: 'not verified' };
}

/**
 * report.md (design 11.2, 11.4; order G): the readback form first — the verdict, the test case, every step with
 * expected and actual apart, what backs the verdict, the gaps, the rules, the page driver, the files and the rerun
 * lines — then the details: every defect, every live control, the scope and how to read a failure. On a red run
 * the failing step comes directly under the verdict. The readback is this file from its "## " line to the end of
 * "Run it again", copied verbatim.
 */
export function buildReport(root: string, slug: string, runDir: string, screens: string, opts: ReportOptions = {}): string {
  const run = readJson<RunRecord>(path.join(runDir, 'run.json'));
  const ver = readJson<Verification>(path.join(runDir, 'verification.json'));
  const config = loadConfig(root);
  const fmt = formatOf(config);
  const money = (d: string) => formatMoney(fromDecimal(d, fmt.currency), fmt);
  const pricing: PricingModule = loadPricing(root, config.app);
  const scenario = readScenarioFile(root, slug).data as { title: string; request: string; preconditions?: string[]; price_source?: string; steps: Array<{ id: string; do: string; product: string; qty?: number }> };
  const aliases = [...new Set(scenario.steps.filter((s) => s.do === 'add').map((s) => s.product))];
  const verdict = ver?.verdict ?? run?.verdict ?? 'NO_TESTS_RUN';
  const live = ver ? ver.gates.G3 !== undefined : run?.meta.mode === 'live' && (run?.repeats.length ?? 0) > 0;
  const repeats = live ? run?.repeats ?? [] : [];
  const passCount = repeats.filter((r) => r.result === 'pass').length;
  const shown = repeats.find((r) => r.result === 'fail') ?? repeats[0];
  const cps = shown?.checkpoints ?? [];
  const review = runReviewVerdict(runDir);
  const head = headline(verdict, live, ver?.gates.G4, review, !!opts.asEvidence);
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' });
  const repo = (p: string) => (top.status === 0 ? path.relative(top.stdout.trim(), path.join(root, p)) : path.join(path.basename(root), p));
  const code = (p: string) => `\`${repo(p)}${p.endsWith('/') ? '/' : ''}\``;
  const shot = (file: string) => (screens ? path.join('reports', slug, screens, file) : path.relative(root, path.join(runDir, file)));
  const reportFile = screens ? path.join('reports', slug, 'report.md') : path.relative(root, path.join(runDir, 'report.md'));
  const cpIds = (run?.meta as { checkpoints?: string[] } | undefined)?.checkpoints ?? scenario.steps.map((s) => s.id);
  const total = (c: CheckpointRecord) => (c.displayed && 'total' in c.displayed && c.displayed.total ? c.displayed.total : undefined);
  const expectedCell = (c: CheckpointRecord) => {
    const [exp, comp] = c.expected.composition.split(' = ');
    return comp && comp.includes('−') ? `${exp} = ${comp.replace(/^subtotal /, '')}` : exp;
  };
  const out: string[] = [];
  if (opts.asEvidence) out.push(`**Evidence of a mismatch, not a verified test:** run \`${path.basename(runDir)}\` ended ${verdict} and was promoted with --as-evidence (design 8.5).`, '');
  out.push(`# ${scenario.title}`, '', `## ${verdict} · ${head.title}`, '');

  // On a red run: the failing step and its evidence first.
  const failedCp = cps.find((c) => c.result !== 'pass');
  const failure = repeats.find((r) => r.error)?.error;
  if (verdict !== 'PASS' && (failedCp || failure)) {
    out.push('### Failing step', '');
    if (failedCp) {
      const t = total(failedCp);
      out.push(`${failedCp.step}, ${failedCp.action}: expected ${failedCp.expected.composition}; displayed ${t ? `"${t.rawText}" in the row "${t.label}"` : 'no total'}; ${failedCp.verdict ?? 'red'} at layer ${failedCp.layer ?? '—'}${failedCp.screenshot ? `; screenshot ${code(shot(failedCp.screenshot))}` : ''}.`);
    }
    if (failure) {
      out.push('', '```text', failure.message, '```', '');
      out.push(`Failed at ${failure.step ?? 'the start (before the first step)'}${failure.url ? ` on ${failure.url}` : ''}${failure.rawTotal ? `; the last total shown was "${failure.rawTotal}"` : ''}${failure.rawText ? `; the application said: "${failure.rawText}"` : ''}.`);
    }
    out.push('');
  }

  // The test case.
  const products = new Map(repeats.flatMap((r) => r.checkpoints).flatMap((c) => c.ledger).map((l) => [l.name, l]));
  const example = readJson<{ stub: Record<string, { name: string; price: string; attrs: Record<string, string> }> }>(files.example(root, slug));
  const attrs = (a: Record<string, string>) => Object.entries(a).map(([k, v]) => `${k} ${v}`);
  const testData = products.size
    ? `${[...products.values()].map((p, i) => [`${aliases[i] ?? '—'} = ${p.name}`, p.unitPrice, ...attrs(p.attrs)].join(', ')).join(' · ')} (read from the product pages in this run)`
    : example ? `${aliases.map((a) => [`${a} = ${example.stub[a]?.name}`, money(example.stub[a]?.price ?? '0'), ...attrs(example.stub[a]?.attrs ?? {})].join(', ')).join(' · ')} (stub products of the example; no live run)`
    : 'no product was chosen';
  const idTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(path.basename(runDir));  // a run id starts with its UTC start
  const when = run?.meta.timestamp ? `${run.meta.timestamp.slice(0, 10)} ${run.meta.timestamp.slice(11, 16)} UTC`
    : idTime ? `${idTime[1]}-${idTime[2]}-${idTime[3]} ${idTime[4]}:${idTime[5]} UTC` : '—';
  const browser = run?.meta.browser ? run.meta.browser[0].toUpperCase() + run.meta.browser.slice(1) : 'Chromium';
  out.push('| | |', '| --- | --- |');
  out.push(`| Test | ${code(path.join('tests', `${slug}.spec.ts`))} |`);
  out.push(`| Objective | ${scenario.request.replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|')} |`);
  out.push(`| Status | ${verdict}${live ? `, ${passCount} of ${repeats.length} repeats` : ''} · ${head.status} |`);
  out.push(`| Environment | ${run?.meta.baseURL ?? config.baseURL} · ${browser} · ${run?.meta.locale ?? config.locale} · ${when} · run \`${path.basename(runDir)}\` |`);
  out.push(`| Preconditions | ${(scenario.preconditions ?? []).map((p) => PRECONDITIONS[p] ?? p).join(', ') || 'none'} |`);
  out.push(`| Test data | ${testData} |`);

  // Every step: expected and actual apart, a status and evidence per step.
  out.push('', '### Steps', '', '| # | Shopper\'s action | Expected total | Actual (as displayed) | Status | Evidence |', '| --- | --- | --- | --- | --- | --- |');
  for (const id of cpIds) {
    const c = cps.find((x) => x.step === id);
    const step = scenario.steps.find((s) => s.id === id);
    if (!c) { out.push(`| ${id} | ${step ? actionWords(step) : '—'} | — | — | not run | — |`); continue; }
    const t = total(c);
    out.push(`| ${c.step} | ${c.action} | ${expectedCell(c)} | ${t ? `"${t.rawText}"` : 'no total shown'} | ${c.result === 'pass' ? 'pass' : 'fail'} | ${c.screenshot ? code(shot(c.screenshot)) : '—'} |`);
  }
  if (live && repeats.length > 1) out.push('', `Repeat ${shown?.n ?? 1} of ${repeats.length} is shown; every repeat is in \`run.json\`.`);

  // What backs the verdict.
  const g = ver?.gates ?? {};
  const controls = ver?.controls ?? [];
  const liveControls = controls.length ? `${controls.filter((c) => c.result === 'caught').length} of ${controls.length} caught`
    : !live ? 'not run (dry run)' : verdict !== 'PASS' ? 'not run (the live run is red)' : 'not run (`qa-harness verify` runs them after a green live run)';
  out.push('', '### Verification of the test', '', '| Check | Result |', '| --- | --- |');
  out.push(`| Intent review | ${intentCell(root, slug, repo)} |`);
  out.push(`| Static check, reference cart | ${g.dry ?? 'not run'} (gates G0, G1) |`);
  out.push(`| Defects on stub prices | ${defectCount(ver?.defects, 'not run')} |`);
  out.push(`| Defects on the prices of this run | ${defectCount(ver?.livePass?.defects, live ? 'not run (no green live run)' : 'not run (dry run)')} |`);
  out.push(`| Live run | ${live ? `${passCount} of ${repeats.length} repeats passed; the test is ${ver?.testOrigin === 'edited' ? 'EDITED BY HAND' : 'the untouched compilation of the confirmed scenario'}` : 'not run (dry run)'} |`);
  out.push(`| Live controls | ${liveControls} |`);
  out.push(`| Report review | ${review ? `${review}, \`review.md\` of this run` : 'not available (test-verifier writes `review.md` after `qa-harness verify`)'} |`);

  // Scenario gaps of the pass the counts come from.
  const gapRows = (ver?.livePass?.defects ?? ver?.defects ?? []).filter((d) => d.result === 'not-applicable');
  out.push('', '### Not covered by this scenario', '', ...(gapRows.length ? gapRows.map((d) => `- ${d.defect}: ${d.hint ?? 'no hint recorded'}`) : ['Nothing.']));

  // The rules, worded as in the confirmation.
  out.push('', '### Pricing rules', '');
  if (!pricing.rules.length) out.push('None: the rules file has no pricing rule.');
  pricing.rules.forEach((r, i) => {
    const inForce = cps.filter((c) => c.expected.adjustments.some((a) => a.rule === r.id)).map((c) => c.step);
    out.push(`- ${describeRule(r, i, money)} · source: ${describeSource(r.provenance)} · ${!cps.length ? 'no live step was run' : inForce.length ? `in force at ${inForce.join(', ')} in this run` : 'not in force in this run'}.`);
  });

  // The page driver.
  const driverFile = path.join('app', `${config.app}.driver.ts`);
  const d = driverOrigin(root, slug, config.app, runDir, ver);
  const rows = [...new Set(cps.map((c) => total(c)?.label).filter(Boolean))].map((r) => `"${r}"`).join(', ');
  out.push('', '### Page driver', '');
  out.push(`${code(driverFile)}: ${d.origin}. ${d.change} Operations this scenario used: ${scenarioActions(scenario.steps, scenario.price_source).join(', ')}. ${rows ? `The total was read from the row ${rows}.` : 'No total was read in this run.'}`);
  out.push('', 'The page driver is the one file that knows the shop\'s pages: the test calls it to find products, add them, change quantities, remove them and read the cart, so the test holds no locator.');

  // Files and how to run it again.
  out.push('', '### Files', '', '| File | Content |', '| --- | --- |');
  out.push(`| ${code(path.join('tests', `${slug}.spec.ts`))} | the test |`);
  out.push(`| ${code(path.join('specs', `${slug}.md`))} | the confirmed scenario |`);
  out.push(`| ${code(path.join('specs', `${slug}.intent.md`))} | the intent review |`);
  out.push(`| ${code(reportFile)} | the full report, every defect and control |`);
  out.push(`| ${code(screens ? path.join('reports', slug, 'screens/') : path.relative(root, runDir) + '/')} | one screenshot per step |`);
  out.push(`| ${code(driverFile)}, \`.pricing.ts\`, \`.map.md\` | page driver, pricing rules, locator evidence |`);
  const rerun = rerunCommand(root, slug);
  const plain = rerun.replace(/npm run qa -- run \S+( --root (\S+))?$/, (_m, _r, dir: string | undefined) => `npx playwright test ${dir ? `${dir}/` : ''}tests/${slug}.spec.ts`);
  out.push('', '### Run it again', '', `\`${rerun}\` (${config.repeat} repeat${config.repeat === 1 ? '' : 's'}, with the report)`, `\`${plain}\` (plain Playwright)`);

  // The details.
  out.push('', '### Defects', '', ...defectTable(ver));
  if (controls.length) {
    out.push('', '### Live controls', '', '| Control | Result | Activated | Element or request changed | Shown at the read | First red | Expected |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const c of controls) out.push(`| ${c.control} | ${c.result} | ${c.activated === null ? '—' : c.activated ? 'yes' : 'no'} | ${readableTarget(c.target)} | ${c.shownAtRead ?? '—'} | ${c.reactedAt ?? '—'} | ${c.expected}${c.note ? ` (${c.note})` : ''} |`);
  }
  if (cps.length) {
    out.push('', '### Scope', '', scopeLine(cps));
    out.push('', '### Rows read', '', '| # | Expected, how it is made up | Row read |', '| --- | --- | --- |');
    for (const c of cps) out.push(`| ${c.step} | ${c.expected.composition} | ${total(c)?.label ? `"${total(c)?.label}"` : '—'} |`);
  }
  out.push('', '### Reading a failure', '');
  out.push('A red checkpoint names the step, the action, the expected amount with how it is made up, the raw text the page displayed and the row it came from, the difference, and the first layer that disagreed (state, labels, lines, unit price, line total, adjustments, subtotal, total). `ORACLE_MISMATCH` means the amounts differ: an application bug or a missing rule. `UNMODELED_ADJUSTMENT` means the cart shows an adjustment no rule describes. `LOCATOR_FAIL` means the driver did not find an element, got no acknowledgment, or read a field with another label. `INFRA_FAIL` means the environment failed. The full data is in `run.json` and `verification.json`; the Playwright HTML report of the run stays outside the repo in `runs/<runId>/html/`.');
  out.push('', `Amounts are in ${fmt.currency}; expected amounts are exact values rounded to the cent, displayed amounts are the page's own text. Total row label ${pricing.summary.total.label}, subtotal row label ${pricing.summary.subtotal.label} · source: ${describeSource(pricing.summary.provenance)}.`);
  return out.join('\n') + '\n';
}

/** What `report` prints (design 11.2): the heading, the steps, and where the readback form is; at most 12 lines. */
export function readback(root: string, slug: string, runDir: string, reportFile: string): string[] {
  const text = fs.existsSync(reportFile) ? fs.readFileSync(reportFile, 'utf8') : '';
  const heading = text.split('\n').find((l) => l.startsWith('## ')) ?? '## (no report)';
  const status = text.split('\n').find((l) => l.startsWith('| Status | '))?.replace(/^\| Status \| (.*) \|$/, '$1');
  const steps = text.split('\n').filter((l) => /^\| S\d+ \|/.test(l)).slice(0, 8).map((l) => l.split('|').slice(1, 6).map((c) => c.trim()).join(' · '));
  return [heading, ...(status ? [`Status: ${status}`] : []), ...steps,
    `Readback: ${path.relative(root, reportFile)}, from "${heading}" to the end of "Run it again".`, `Rerun: ${rerunCommand(root, slug)}`];
}

/** The newest run directory of a scenario. */
export function latestRun(root: string, slug: string): string | undefined {
  const runs = files.runs(root, slug);
  if (!fs.existsSync(runs)) return undefined;
  const ids = fs.readdirSync(runs).filter((d) => fs.existsSync(path.join(runs, d, 'run.json')) || fs.existsSync(path.join(runs, d, 'verification.json'))).sort();
  return ids.length ? path.join(runs, ids[ids.length - 1]) : undefined;
}

const TRACKED = ['report.md', 'run.json', 'verification.json', 'review.md'];

const EVIDENCE_VERDICTS: ReadonlySet<Verdict> = new Set<Verdict>(['ORACLE_MISMATCH', 'UNMODELED_ADJUSTMENT']);

/**
 * May this run go into the repo? (design 8.5) Only a live run whose verification.json is PASS through G4; with
 * --as-evidence also a live run that ended ORACLE_MISMATCH or UNMODELED_ADJUSTMENT. A refusal carries the run's own
 * verdict when that is not PASS, and NO_TESTS_RUN when there is no verified live run (dry, no G4, no record).
 */
export function promotionRefusal(root: string, slug: string, runId: string, asEvidence: boolean): CommandResult | undefined {
  const runDir = path.join(files.runs(root, slug), runId);
  const ver = readJson<Verification>(path.join(runDir, 'verification.json'));
  const run = readJson<RunRecord>(path.join(runDir, 'run.json'));
  const own = (v: Verdict | null | undefined): Verdict => (v && v !== 'PASS' ? v : 'NO_TESTS_RUN');
  const refuse = (verdict: Verdict, why: string): CommandResult => ({ verdict, lines: [`Run ${runId} of ${slug} was not promoted: ${why}`, `The tracked files in ${rel(root, files.reports(root, slug))}/ are unchanged.`] });
  if (!ver) {
    return refuse(own(run?.verdict), fs.existsSync(runDir)
      ? 'it has no verification.json, so nothing says it was verified; run qa-harness verify and promote that run.'
      : `there is no such run directory under ${rel(root, files.runs(root, slug))}/; name one that qa-harness verify created.`);
  }
  const live = ver.gates.G3 !== undefined;
  if (asEvidence) {
    if (live && EVIDENCE_VERDICTS.has(ver.verdict)) return undefined;
    return refuse(own(ver.verdict), `--as-evidence admits only a live run that ended ORACLE_MISMATCH or UNMODELED_ADJUSTMENT; this ${live ? 'live' : 'dry'} run ended ${ver.verdict}.`);
  }
  if (ver.verdict !== 'PASS') {
    return refuse(ver.verdict, `it ended ${ver.verdict}; only a live run verified through G4 is promoted.${live && EVIDENCE_VERDICTS.has(ver.verdict) ? ' To keep this amount mismatch as evidence, the tester adds --as-evidence.' : ''}`);
  }
  if (!live) return refuse('NO_TESTS_RUN', `it is a dry run (gates G0–G2 on the reference cart); only a live run verified through G4 is promoted.`);
  if (ver.gates.G4 !== 'PASS') return refuse('NO_TESTS_RUN', `its live controls G4 did not run; run qa-harness verify ${slug} and promote the run it creates.`);
  return undefined;
}

/** Replace the tracked set in reports/<slug>/ with the complete set of one run, never a mix (8.5, 6.5). Call after promotionRefusal. */
export async function promote(root: string, slug: string, runId: string, opts: ReportOptions = {}): Promise<string[]> {
  const runDir = path.join(files.runs(root, slug), runId);
  const target = files.reports(root, slug);
  return withLock(root, slug, () => {
    const staging = path.join(target, `.promote-${runId}`);
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(path.join(staging, 'screens'), { recursive: true });
    fs.writeFileSync(path.join(staging, 'report.md'), buildReport(root, slug, runDir, 'screens/', opts));
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

/** The verdict of a run directory: verification.json first, then run.json. */
function runVerdict(runDir: string): Verdict {
  return readJson<Verification>(path.join(runDir, 'verification.json'))?.verdict ?? readJson<RunRecord>(path.join(runDir, 'run.json'))?.verdict ?? 'NO_TESTS_RUN';
}

export async function report(root: string, slug: string, promoteId: string | undefined, asEvidence = false): Promise<CommandResult> {
  if (promoteId) {
    const refusal = promotionRefusal(root, slug, promoteId, asEvidence);
    if (refusal) return refusal;
    const runDir = path.join(files.runs(root, slug), promoteId);
    const placed = await promote(root, slug, promoteId, { asEvidence });
    const lines = readback(root, slug, runDir, path.join(files.reports(root, slug), 'report.md'));
    const head = asEvidence ? [`Promoted as evidence of a mismatch, not a verified test (--as-evidence).`] : [];
    return { verdict: runVerdict(runDir), lines: [...head, ...lines.slice(0, 11 - head.length), `Promoted run ${promoteId} to ${rel(root, files.reports(root, slug))}/: ${placed.join(', ')}.`] };
  }
  const runDir = latestRun(root, slug);
  if (!runDir) return { verdict: 'NO_TESTS_RUN', lines: [`${slug} has no run yet; run qa-harness run ${slug} first.`] };
  fs.writeFileSync(path.join(runDir, 'report.md'), buildReport(root, slug, runDir, ''));
  return { verdict: runVerdict(runDir), lines: [...readback(root, slug, runDir, path.join(runDir, 'report.md')), `Wrote ${rel(root, path.join(runDir, 'report.md'))}.`] };
}
