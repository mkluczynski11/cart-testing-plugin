// Pricing rules are data, not functions. The vocabulary is closed:
//   condition: shareOfUnits   amount: percentOf 'running'
// A percentOf amount is a deduction (discount) of `rate` percent of the running value.
import { add, neg, parseRatio, scale } from './money';
import type { Money } from './types';

export type AttrFilter = Record<string, string[]>;

export type RuleCondition = {
  shareOfUnits: { where: AttrFilter; above: string };
};

export type RuleAmount = { percentOf: 'running'; rate: string };

export type PricingRule = {
  id: string;
  label: RegExp;
  when: RuleCondition;
  amount: RuleAmount;
};

export type PurchaseConstraint = { id: string; maxQty: number; match?: { name: string } };

export type SummaryLabels = {
  total: { label: RegExp };
  subtotal: { label: RegExp };
};

export type PricingModule = {
  summary: SummaryLabels;
  rules: PricingRule[];
  constraints: PurchaseConstraint[];
};

/** One priced line as the rules see it. */
export type PricedUnitGroup = { qty: number; attrs: Record<string, string> };

export type AppliedAdjustment = { id: string; amount: Money }; // amount is signed: a discount is negative

function matchesFilter(attrs: Record<string, string>, where: AttrFilter): boolean {
  return Object.entries(where).every(([key, values]) => values.includes(attrs[key] ?? ''));
}

/** shareOfUnits: units (not lines) matching `where` divided by all units is strictly above `above`. */
export function conditionHolds(cond: RuleCondition, groups: PricedUnitGroup[]): boolean {
  const { where, above } = cond.shareOfUnits;
  const total = groups.reduce((n, g) => n + g.qty, 0);
  if (total === 0) return false;
  const matching = groups.filter((g) => matchesFilter(g.attrs, where)).reduce((n, g) => n + g.qty, 0);
  const t = parseRatio(above);
  // matching / total > p / q  <=>  matching * q > p * total
  return BigInt(matching) * t.q > t.p * BigInt(total);
}

/** Apply rules in file order on exact values. Returns the adjustments in force and the final value. */
export function applyRules(
  rules: PricingRule[],
  subtotal: Money,
  groups: PricedUnitGroup[],
): { adjustments: AppliedAdjustment[]; total: Money } {
  let running = subtotal;
  const adjustments: AppliedAdjustment[] = [];
  for (const rule of rules) {
    if (!conditionHolds(rule.when, groups)) continue;
    const r = parseRatio(rule.amount.rate);
    const amount = neg(scale(running, { p: r.p, q: r.q * 100n }));
    adjustments.push({ id: rule.id, amount });
    running = add(running, amount);
  }
  return { adjustments, total: running };
}

/** The tightest purchase constraint for a product, or undefined. */
export function maxQtyFor(constraints: PurchaseConstraint[], name: string): number | undefined {
  let max: number | undefined;
  for (const c of constraints) {
    if (c.match && c.match.name !== name) continue;
    max = max === undefined ? c.maxQty : Math.min(max, c.maxQty);
  }
  return max;
}

/** The global limit (constraints without `match`), used by the validator. */
export function globalMaxQty(constraints: PurchaseConstraint[]): number | undefined {
  const global = constraints.filter((c) => !c.match);
  return global.length ? Math.min(...global.map((c) => c.maxQty)) : undefined;
}

export const NO_RULES: PricingModule = {
  summary: { total: { label: /^total\b/i }, subtotal: { label: /^subtotal\b/i } },
  rules: [],
  constraints: [{ id: 'line-max', maxQty: 99 }],
};
