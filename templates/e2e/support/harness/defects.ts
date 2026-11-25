// qa-harness defects list|check <slug>: the default defects and the admission of additional ones.
// Implements design 10.3, 10.4 (format, admission check), R12 (declarative, at most 8) and order N, 6.2.
import * as fs from 'node:fs';
import { files } from '../core/config';
import { deriveDefects, OPERATORS, type Defect, type DefectTarget, type Operator } from '../core/operators';
import type { StepKind } from '../core/scenario';
import { loadScenario, rel, type CommandResult, type Loaded } from './common';
import { exampleProducts, simulate } from './gates';

export const ADDITIONAL_LIMIT = 8;

export type Admission = { admitted: Defect[]; rejected: Array<{ id: string; reason: string }> };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Why an entry's shape or target is unacceptable, or null. */
function shapeProblem(e: Record<string, unknown>, loaded: Loaded, taken: Set<string>): string | null {
  const kinds = new Set(loaded.scenario.steps.map((s) => s.do));
  if (typeof e.id !== 'string' || !/^[a-z0-9][a-z0-9:-]*$/.test(e.id)) return 'the id must be lower-case letters, digits and dashes';
  if (taken.has(e.id)) return `the id ${e.id} is already used`;
  if (e.origin !== 'tester' && e.origin !== 'generated') return 'origin must be tester or generated';
  if (!OPERATORS.includes(e.operator as Operator)) return `operator ${String(e.operator)} does not exist; use one of ${OPERATORS.join(', ')}`;
  if (typeof e.why !== 'string' || !e.why.trim()) return 'why must say in one sentence what the defect breaks';
  const t = e.target;
  if (!isObject(t)) return 'target must be { value }, { adjustment } or { step }';
  if ('value' in t && !['total', 'subtotal', 'lineTotal'].includes(String(t.value))) return `target value ${String(t.value)} is not total, subtotal or lineTotal`;
  if ('adjustment' in t && !loaded.pricing.rules.some((r) => r.id === t.adjustment)) return `target adjustment ${String(t.adjustment)} is not a rule of the rules file`;
  if ('step' in t && !kinds.has(t.step as StepKind)) return `target step ${String(t.step)} does not occur in the scenario`;
  if (!('value' in t) && !('adjustment' in t) && !('step' in t)) return 'target must be { value }, { adjustment } or { step }';
  if (e.when !== undefined) {
    if (!isObject(e.when)) return 'when must be { afterStep, direction }';
    if (e.when.afterStep !== undefined && !kinds.has(e.when.afterStep as StepKind)) return `when.afterStep ${String(e.when.afterStep)} does not occur in the scenario`;
    if (e.when.direction !== undefined && e.when.direction !== 'increase' && e.when.direction !== 'decrease') return 'when.direction must be increase or decrease';
  }
  return null;
}

/** Admit or reject the entries of specs/<slug>.defects.json (10.4). */
export async function admitAdditional(loaded: Loaded): Promise<Admission> {
  const file = files.defects(loaded.root, loaded.slug);
  if (!fs.existsSync(file)) return { admitted: [], rejected: [] };
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  const entries = Array.isArray(raw) ? raw : [];
  const products = exampleProducts(loaded);
  const defaults = deriveDefects(loaded.scenario, loaded.pricing.rules);
  // A defect that changes nothing at any checkpoint is admitted as a scenario gap; only applicable ones can be twins.
  const healthy = checkpointViews(loaded, await simulate(loaded, products));
  const known: Array<{ id: string; views: string }> = [];
  for (const d of defaults) {
    const views = checkpointViews(loaded, await simulate(loaded, products, d));
    if (views !== healthy) known.push({ id: d.id, views });
  }
  const taken = new Set(defaults.map((d) => d.id));
  const out: Admission = { admitted: [], rejected: [] };
  for (const e of entries) {
    const id = isObject(e) && typeof e.id === 'string' ? e.id : '(no id)';
    const problem = !isObject(e) ? 'the entry is not an object' : out.admitted.length >= ADDITIONAL_LIMIT ? `more than ${ADDITIONAL_LIMIT} additional defects (R12)` : shapeProblem(e, loaded, taken);
    if (problem) { out.rejected.push({ id, reason: problem }); continue; }
    const d = e as unknown as Defect;
    const defect: Defect = { id: d.id, origin: d.origin, operator: d.operator, target: d.target as DefectTarget, ...(d.when ? { when: d.when } : {}), why: d.why };
    const views = checkpointViews(loaded, await simulate(loaded, products, defect));
    const twin = views !== healthy && known.find((k) => k.views === views);
    if (twin) { out.rejected.push({ id, reason: `it behaves like ${twin.id} at every checkpoint` }); continue; }
    if (views !== healthy) known.push({ id: defect.id, views });
    taken.add(defect.id);
    out.admitted.push(defect);
  }
  return out;
}

function checkpointViews(loaded: Loaded, views: string[]): string {
  return JSON.stringify(loaded.scenario.steps.map((s, i) => (loaded.scenario.checkpoints.includes(s.id) ? views[i] : null)));
}

export async function defectsCommand(root: string, slug: string, mode: 'list' | 'check'): Promise<CommandResult> {
  const got = loadScenario(root, slug);
  if (!got.ok) return got.result;
  const loaded = got.loaded;
  if (!loaded.example) return { verdict: 'SPEC_INVALID', lines: [`specs/${slug}.example.json does not exist; run qa-harness example ${slug} first.`] };
  const admission = await admitAdditional(loaded);
  if (mode === 'list') {
    const defaults = deriveDefects(loaded.scenario, loaded.pricing.rules);
    return {
      verdict: 'PASS',
      lines: [`${defaults.length} default defects of ${slug}, derived from its steps and ${loaded.pricing.rules.length} rule(s):`,
        ...defaults.map((d) => `  ${d.id.padEnd(24)} ${d.operator.padEnd(13)} ${d.why}`),
        ...admission.admitted.map((d) => `  ${d.id.padEnd(24)} ${d.operator.padEnd(13)} ${d.why} (${d.origin})`)],
      data: { defaults, additional: admission.admitted },
    };
  }
  const file = rel(root, files.defects(root, slug));
  if (!admission.admitted.length && !admission.rejected.length) return { verdict: 'PASS', lines: [`${file} does not exist or is empty; only the default defects apply.`] };
  return {
    verdict: admission.rejected.length ? 'SPEC_INVALID' : 'PASS',
    lines: [`${file}: ${admission.admitted.length} admitted, ${admission.rejected.length} rejected.`,
      ...admission.admitted.map((d) => `  admitted ${d.id} (${d.origin}, ${d.operator})`),
      ...admission.rejected.map((r) => `  rejected ${r.id}: ${r.reason}`),
      ...(admission.rejected.length ? ['Fix or remove the rejected entries; a concern no operator expresses goes into the report as an uncovered risk.'] : [])],
    data: { admission },
  };
}
