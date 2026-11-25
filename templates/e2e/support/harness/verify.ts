// qa-harness verify <slug>: gates G0–G4 in a new run directory; G4 runs the live controls one by one.
// Implements design 10.6 (controls, four facts, scope), 6.3 (CONTROL_MISSED routing) and order N, 6.6.
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CheckpointRecord } from '../core/checkpoint';
import type { RunRecord } from '../core/classification';
import { bindingOf, CONTROLS, type ControlName, type SkewState } from '../core/live-controls';
import { fromDecimal, sub, formatMoney, compare } from '../core/money';
import { freezeMessage } from '../core/scenario';
import { routeFor, type Verdict } from '../core/verdicts';
import { loadScenario, rel, type CommandResult, type Loaded } from './common';
import { judgedByTest } from './gates';
import { inspectDriver } from './need';
import { runPlaywright } from './playwright-runner';
import type { Verification } from './report';
import { finishRun, gatesUpToG3, writeVerification } from './run';
import { createRunDir } from './run-dir';

type ControlFacts = NonNullable<Verification['controls']>[number] & { evidence?: string };

const total = (c: CheckpointRecord) => (c.displayed && 'total' in c.displayed && c.displayed.total ? c.displayed.total : undefined);

/** The first checkpoint at or after the first step of a kind. */
function firstCheckpointAfter(loaded: Loaded, kind: string, judged: string[]): string | null {
  const steps = loaded.scenario.steps;
  const from = steps.findIndex((s) => s.do === kind);
  if (from < 0) return null;
  return steps.slice(from).map((s) => s.id).find((id) => judged.includes(id)) ?? null;
}

/** Judge one control run into its four facts and a result (10.6). */
export function judgeControl(loaded: Loaded, name: ControlName, run: RunRecord, judged: string[]): ControlFacts {
  const rep = run.repeats[0];
  const cps = rep?.checkpoints ?? [];
  const firstRed = cps.find((c) => c.result === 'fail')?.step ?? (rep && rep.result === 'fail' ? `(action failure: ${rep.error?.message.split('\n')[0]})` : null);
  const fmt = loaded.fmt;
  if (name === 'skew-total') {
    const states = cps.map((c) => c.control as SkewState | undefined);
    const activated = states.some((s) => s?.activated);
    const last = [...states].reverse().find((s) => s?.activated);
    const withTotal = cps.filter((c) => total(c));
    const offByCent = (c: CheckpointRecord) => {
      const t = total(c);
      if (!t?.value) return false;
      return c.result === 'fail' && compare(sub(fromDecimal(t.value, fmt.currency), fromDecimal(c.expected.total, fmt.currency)), fromDecimal('0.01', fmt.currency)) === 0;
    };
    const caught = activated && withTotal.length > 0 && withTotal.every(offByCent);
    const evidence = !activated ? 'not-activated' : caught ? undefined : cps.every((c) => c.result === 'pass') ? 'active-shown-green' : 'active-not-shown';
    return {
      control: name, result: caught ? 'caught' : 'missed', activated, evidence,
      target: last ? `row "${last.label}": ${last.rowHtml}` : 'no row with the total label and exactly one amount',
      shownAtRead: last ? `the driver read ${withTotal.map((c) => `"${total(c)?.rawText}" at ${c.step}`).join(', ')}` : null,
      reactedAt: firstRed, expected: `every checkpoint with a total red by exactly +${formatMoney(fromDecimal('0.01', fmt.currency), fmt)}`,
    };
  }
  const expectedAt = name === 'drift-price' ? judged[0] ?? null : firstCheckpointAfter(loaded, name === 'lost-update' ? 'setQty' : 'remove', judged);
  const log = rep?.control;
  const activated = name === 'drift-price' ? (log?.raised ?? 0) > 0 : (log?.intercepted.length ?? 0) > 0;
  const at = cps.find((c) => c.step === expectedAt);
  const caught = activated && firstRed === expectedAt;
  const evidence = caught ? undefined : !activated ? 'not-activated' : cps.every((c) => c.result === 'pass') ? 'active-shown-green' : 'active-not-shown';
  return {
    control: name, result: caught ? 'caught' : 'missed', activated, evidence,
    target: log?.binding
      ? `${log.binding}: ${log.intercepted.length} request(s) intercepted${name === 'drift-price' ? `, the first line's price raised in ${log.raised}` : ''}${log.intercepted[0] ? `, first ${log.intercepted[0]}` : ''}`
      : 'no binding',
    shownAtRead: at && total(at) ? `total "${total(at)?.rawText}" at ${at.step}, expected ${at.expected.composition.split(' = ')[0]}` : null,
    reactedAt: firstRed, expected: `first red at ${expectedAt}`,
  };
}

export async function verify(root: string, slug: string): Promise<CommandResult> {
  const got = loadScenario(root, slug);
  if (!got.ok) return got.result;
  const loaded = got.loaded;
  if (loaded.freeze !== 'frozen') return { verdict: 'SCENARIO_CHANGED', lines: [freezeMessage(loaded.freeze, slug)] };
  const { runId, dir } = createRunDir(root, slug);
  const head = `Verify ${runId} of ${slug}: gates G0–G4`;
  const upTo3 = await gatesUpToG3(loaded, dir, false);
  if (upTo3.verdict !== 'PASS') {
    return { verdict: upTo3.verdict, lines: [head, ...upTo3.lines, 'G4 not run: the live controls need a green G3.', `Evidence: ${rel(root, dir)}/`], data: { runId } };
  }
  const judged = judgedByTest(loaded);
  const kinds = new Set(loaded.scenario.steps.map((s) => s.do));
  const driverControls = inspectDriver(root, loaded.config.app);
  const controls: ControlFacts[] = [];
  for (const name of CONTROLS) {
    const kind = name === 'lost-update' ? 'setQty' : name === 'lost-remove' ? 'remove' : undefined;
    if (kind && !kinds.has(kind)) { controls.push({ control: name, result: 'not-applicable', activated: null, target: '—', shownAtRead: null, reactedAt: null, expected: `no ${kind} step in the scenario` }); continue; }
    if (name !== 'skew-total' && (typeof driverControls === 'string' || !bindingOf(name, driverControls.controls))) {
      controls.push({ control: name, result: 'not-bound', activated: null, target: 'no request binding in the driver', shownAtRead: null, reactedAt: null, expected: 'lower coverage', note: 'not bound: lower coverage' });
      continue;
    }
    const runDir = path.join(dir, 'G4', name);
    const testTimeoutMs = loaded.config.timeouts.testMs + judged.length * loaded.config.timeouts.settleMs;
    const rec = await runPlaywright({ root, project: 'live', slug, runDir, repeat: 1, testTimeoutMs, env: { QA_CONTROL: name }, timeoutMs: testTimeoutMs + 60_000 });
    controls.push(judgeControl(loaded, name, rec, judged));
  }
  const missed = controls.filter((c) => c.result === 'missed');
  const verdict: Verdict = missed.length ? 'CONTROL_MISSED' : 'PASS';
  const lines = [head, ...upTo3.lines.filter((l) => /^G[0-3]/.test(l))];
  lines.push(`G4 live controls: ${controls.filter((c) => c.result === 'caught').length} caught, ${missed.length} missed, ${controls.filter((c) => c.result === 'not-applicable').length} not applicable, ${controls.filter((c) => c.result === 'not-bound').length} not bound`);
  for (const c of controls) lines.push(`   ${c.control.padEnd(12)} ${c.result.padEnd(14)} activated ${c.activated === null ? '—' : c.activated ? 'yes' : 'no'}; first red ${c.reactedAt ?? 'none'}; expected ${c.expected}`);
  for (const m of missed) lines.push(`   ${m.control}: ${routeFor('CONTROL_MISSED', m.evidence ?? '')}`);
  const verification = JSON.parse(fs.readFileSync(path.join(dir, 'verification.json'), 'utf8')) as Verification;
  writeVerification(loaded, dir, { ...verification.gates, G4: verdict }, { verdict: 'PASS', lines: [], rows: verification.defects as never, gaps: verification.gaps, handEdited: verification.testOrigin === 'edited' }, verdict, { ...(verification.livePass ? { livePass: verification.livePass } : {}), controls });
  finishRun(loaded, dir, verdict);
  return { verdict, lines: [...lines, `Evidence: ${rel(root, dir)}/`], data: { runId, controls } };
}
