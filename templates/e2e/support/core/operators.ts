// Defect operators and the defects they derive from a scenario's steps and the pricing rules.
// Implements design 10.3 and 10.4 with the ids and effects of order N, section 6.2.
import { hasRate, hasThreshold, type PricingRule } from './pricing';
import type { Scenario, StepKind } from './scenario';

export const OPERATORS = [
  'no-effect', 'wrong-target', 'stale-value', 'skew-value', 'ignore-factor',
  'rule-never', 'rule-always', 'rule-rate', 'rule-boundary', 'round-mode',
] as const;

export type Operator = (typeof OPERATORS)[number];

export type DefectTarget =
  | { value: 'total' | 'subtotal' | 'lineTotal' }
  | { adjustment: string }
  | { step: StepKind };

/** Limits a defect to the moments after a step of a kind, and optionally a direction of the quantity. */
export type DefectWhen = { afterStep?: StepKind; direction?: 'increase' | 'decrease' };

export type DefectOrigin = 'default' | 'tester' | 'generated';

export type Defect = { id: string; origin: DefectOrigin; operator: Operator; target: DefectTarget; when?: DefectWhen; why?: string };

const STEP_DEFECT: Record<StepKind, string> = { add: 'lost-add', setQty: 'lost-qty', remove: 'lost-remove' };
const WRONG_LINE: Partial<Record<StepKind, string>> = { setQty: 'qty-wrong-line', remove: 'remove-wrong-line' };

/** Kinds of step the scenario performs while the cart holds two or more lines. */
function multiLineKinds(s: Scenario): Set<StepKind> {
  const kinds = new Set<StepKind>();
  let lines = new Set<string>();
  for (const step of s.steps) {
    if (lines.size >= 2) kinds.add(step.do);
    lines = new Set(Object.keys(step.cartAfter));
  }
  return kinds;
}

/** The default defects of a scenario: operators applied to its steps and to the rules (10.3). */
export function deriveDefects(s: Scenario, rules: PricingRule[]): Defect[] {
  const out: Defect[] = [];
  const add = (id: string, operator: Operator, target: DefectTarget, why: string) => out.push({ id, origin: 'default', operator, target, why });
  const kinds = new Set(s.steps.map((x) => x.do));
  for (const kind of ['add', 'setQty', 'remove'] as StepKind[]) {
    if (kinds.has(kind)) add(STEP_DEFECT[kind], 'no-effect', { step: kind }, `${kind} is acknowledged and changes nothing`);
  }
  const multi = multiLineKinds(s);
  for (const kind of ['setQty', 'remove'] as StepKind[]) {
    const id = WRONG_LINE[kind];
    if (id && multi.has(kind)) add(id, 'wrong-target', { step: kind }, `${kind} hits the next line in cart order`);
  }
  add('stale-total', 'stale-value', { value: 'total' }, 'the total shown is the one from before the last change');
  add('total-off-by-cent', 'skew-value', { value: 'total' }, 'the total is one cent too high');
  add('line-ignores-qty', 'ignore-factor', { value: 'lineTotal' }, 'the line total is the unit price, whatever the quantity');
  const suffix = (base: string, rule: PricingRule) => (rules.length === 1 ? base : `${base}:${rule.id}`);
  for (const rule of rules) {
    add(suffix('rule-never', rule), 'rule-never', { adjustment: rule.id }, `rule ${rule.id} is never applied`);
    add(suffix('rule-always', rule), 'rule-always', { adjustment: rule.id }, `rule ${rule.id} is always applied`);
    if (hasRate(rule)) add(suffix('rule-wrong-rate', rule), 'rule-rate', { adjustment: rule.id }, `rule ${rule.id} is applied at twice its rate`);
    if (hasThreshold(rule)) add(suffix('rule-boundary', rule), 'rule-boundary', { adjustment: rule.id }, `the threshold of rule ${rule.id} is shifted by its boundary`);
  }
  add('round-down', 'round-mode', { value: 'total' }, 'the total and the adjustments are truncated at the cent instead of rounded');
  return out;
}

/** The scenario gap hint for a defect that no checkpoint of the scenario can see (10.5). */
export function gapHint(d: Defect, s: Scenario): string {
  const lastStep = s.checkpoints.length < s.steps.length ? ` Checkpoints exist only after ${s.checkpoints.join(', ')}; check: each-step would judge every step.` : '';
  switch (d.operator) {
    case 'no-effect': return `Add a checkpoint right after a ${'step' in d.target ? d.target.step : 'step'} step.${lastStep}`;
    case 'wrong-target': return `Perform ${'step' in d.target ? d.target.step : 'the step'} while the cart holds two lines with different quantities or prices.${lastStep}`;
    case 'stale-value': return `Add a checkpoint after a step that changes the ${'value' in d.target ? d.target.value : 'value'}.${lastStep}`;
    case 'skew-value': return `Add a checkpoint where the ${'value' in d.target ? d.target.value : 'value'} is displayed.${lastStep}`;
    case 'ignore-factor': return `Give a product a quantity above 1 before a checkpoint.${lastStep}`;
    case 'rule-never': return `Add a step at which rule ${'adjustment' in d.target ? d.target.adjustment : ''} is in force.${lastStep}`;
    case 'rule-always': return `Add a step at which rule ${'adjustment' in d.target ? d.target.adjustment : ''} is not in force, e.g. a product that does not meet its condition.${lastStep}`;
    case 'rule-rate': return `Add a step at which rule ${'adjustment' in d.target ? d.target.adjustment : ''} is in force.${lastStep}`;
    case 'rule-boundary': return `Add a step at which the cart sits exactly at the threshold of rule ${'adjustment' in d.target ? d.target.adjustment : ''}.${lastStep}`;
    case 'round-mode': return `No amount at a checkpoint has a fraction of a cent above one half; other products or quantities would expose truncation.${lastStep}`;
  }
}
