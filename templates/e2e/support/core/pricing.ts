// Business rules as data and their evaluation on exact values: design 9.2 (vocabulary, provenance,
// constraints) and the rule order of 9.3. Rules only reduce the total in v1: every amount is a deduction;
// a surcharge cannot be written in this vocabulary and is a candidate for extending the plugin, not a negative rate.
import { compare, fromDecimal, parseRatio, scale, sub, type Ratio } from './money';
import type { Money } from './types';

export type AttrFilter = Record<string, string[]>;

export type Provenance = {
  source: 'code' | 'tester' | 'observed';
  ref: string;
  live: 'confirmed' | 'unconfirmed';
};

/**
 * When a rule is in force:
 * - always: in every non-empty cart;
 * - shareOfUnits: units matching `where` divided by all units is strictly above `above` (a decimal ratio);
 * - hasUnits: at least `atLeast` units match `where`;
 * - subtotalAtLeast: the subtotal is at least the amount.
 */
export type RuleCondition =
  | { always: true }
  | { shareOfUnits: { where: AttrFilter; above: string } }
  | { hasUnits: { where: AttrFilter; atLeast: number } }
  | { subtotalAtLeast: string };

/** How much a rule deducts: a percentage of the subtotal, of the running value, or a fixed amount. */
export type RuleAmount = { percentOf: 'subtotal' | 'running'; rate: string } | { fixed: string };

export type PricingRule = {
  id: string;
  label: RegExp;          // label of the adjustment row in the cart
  when: RuleCondition;
  amount: RuleAmount;
  provenance: Provenance;
};

export type PurchaseConstraint = { id: string; maxQty: number; match?: { name: string }; provenance: Provenance };

export type SummaryLabels = {
  total: { label: RegExp };
  subtotal: { label: RegExp };
  provenance: Provenance;
};

/** The shape of app/<app>.pricing.ts. */
export type PricingModule = { summary: SummaryLabels; rules: PricingRule[]; constraints: PurchaseConstraint[] };

/** A change to one rule, used by the rule operators of design 10.3. */
export type RuleTweak = { rule: string; kind: 'never' | 'always' | 'double-rate' | 'boundary' };

/** The units of one cart line as the rules see them. */
export type PricedGroup = { qty: number; attrs: Record<string, string> };

/** An adjustment in force: `amount` is the positive deduction. */
export type AppliedAdjustment = { id: string; amount: Money };

export function matchesFilter(attrs: Record<string, string>, where: AttrFilter): boolean {
  return Object.entries(where).every(([key, values]) => values.includes(attrs[key] ?? ''));
}

function units(groups: PricedGroup[], where?: AttrFilter): number {
  return groups.filter((g) => !where || matchesFilter(g.attrs, where)).reduce((n, g) => n + g.qty, 0);
}

/** Is the condition met? `boundary` moves the threshold: "above" becomes "at or above" and the reverse. */
export function conditionHolds(cond: RuleCondition, groups: PricedGroup[], subtotal: Money, boundary = false): boolean {
  const all = units(groups);
  if (all === 0) return false;
  if ('always' in cond) return true;
  if ('shareOfUnits' in cond) {
    const t: Ratio = parseRatio(cond.shareOfUnits.above);
    const left = BigInt(units(groups, cond.shareOfUnits.where)) * t.q;
    const right = t.p * BigInt(all);
    return boundary ? left >= right : left > right;
  }
  if ('hasUnits' in cond) {
    const n = units(groups, cond.hasUnits.where);
    return boundary ? n > cond.hasUnits.atLeast : n >= cond.hasUnits.atLeast;
  }
  const c = compare(subtotal, fromDecimal(cond.subtotalAtLeast, subtotal.currency));
  return boundary ? c > 0 : c >= 0;
}

function deduction(rule: PricingRule, subtotal: Money, running: Money, doubleRate: boolean): Money {
  if ('fixed' in rule.amount) return fromDecimal(rule.amount.fixed, subtotal.currency);
  const r = parseRatio(rule.amount.rate);
  const rate = { p: doubleRate ? r.p * 2n : r.p, q: r.q * 100n };
  return scale(rule.amount.percentOf === 'subtotal' ? subtotal : running, rate);
}

/** Apply the rules in file order on exact values (9.3). Returns the adjustments in force and the total. */
export function applyRules(
  rules: PricingRule[],
  subtotal: Money,
  groups: PricedGroup[],
  tweak?: RuleTweak,
): { adjustments: AppliedAdjustment[]; total: Money } {
  let running = subtotal;
  const adjustments: AppliedAdjustment[] = [];
  for (const rule of rules) {
    const t = tweak?.rule === rule.id ? tweak.kind : undefined;
    const inForce = t === 'never' ? false
      : t === 'always' ? units(groups) > 0
      : conditionHolds(rule.when, groups, subtotal, t === 'boundary');
    if (!inForce) continue;
    const amount = deduction(rule, subtotal, running, t === 'double-rate');
    adjustments.push({ id: rule.id, amount });
    running = sub(running, amount);
  }
  return { adjustments, total: running };
}

export function hasRate(rule: PricingRule): boolean {
  return 'percentOf' in rule.amount;
}

export function hasThreshold(rule: PricingRule): boolean {
  return !('always' in rule.when);
}

/** Attributes a rule's condition reads. */
export function ruleAttrs(rule: PricingRule): string[] {
  if ('shareOfUnits' in rule.when) return Object.keys(rule.when.shareOfUnits.where);
  if ('hasUnits' in rule.when) return Object.keys(rule.when.hasUnits.where);
  return [];
}

/** The tightest purchase constraint for a product name, or undefined. */
export function maxQtyFor(constraints: PurchaseConstraint[], name: string): number | undefined {
  const limits = constraints.filter((c) => !c.match || c.match.name === name).map((c) => c.maxQty);
  return limits.length ? Math.min(...limits) : undefined;
}

/** A share in words (design 11.1): one half, one third, one quarter as a fraction, any other as a percentage. */
export function describeShare(above: string): string {
  const r = parseRatio(above);
  if (r.p * 2n === r.q) return 'half';
  if (r.p * 3n === r.q) return 'a third';
  if (r.p * 4n === r.q) return 'a quarter';
  const [whole, frac = ''] = above.split('.');
  const digits = whole + frac.padEnd(2, '0');
  const int = digits.slice(0, whole.length + 2).replace(/^0+(?=\d)/, '');
  const rest = digits.slice(whole.length + 2).replace(/0+$/, '');
  return `${int}${rest ? `.${rest}` : ''}%`;
}

/**
 * The rule text a person reads in the confirmation and the report. `index` is the rule's place in the file: the first
 * rule's running value is the subtotal, so its percentage needs no base; `money` formats an amount of the rules file.
 */
export function describeRule(rule: PricingRule, index = 0, money: (decimal: string) => string = (d) => d): string {
  const amount = 'fixed' in rule.amount ? `${money(rule.amount.fixed)} off`
    : index === 0 ? `${rule.amount.rate}% off`
    : rule.amount.percentOf === 'subtotal' ? `${rule.amount.rate}% of the subtotal off`
    : `${rule.amount.rate}% off the amount after the rules before it`;
  const where = (f: AttrFilter) => Object.entries(f).map(([k, v]) => `${k} ${v.join(' or ')}`).join(' and ');
  const when = 'always' in rule.when ? 'always'
    : 'shareOfUnits' in rule.when ? `when more than ${describeShare(rule.when.shareOfUnits.above)} of the units have ${where(rule.when.shareOfUnits.where)}`
    : 'hasUnits' in rule.when ? `when at least ${rule.when.hasUnits.atLeast} ${rule.when.hasUnits.atLeast === 1 ? 'unit has' : 'units have'} ${where(rule.when.hasUnits.where)}`
    : `when the subtotal is at least ${money(rule.when.subtotalAtLeast)}`;
  return `${rule.id}: ${amount} ${when}`;
}

/** Where a rule comes from, in words, without the file reference (that stays in the rules file). */
export function describeSource(p: Provenance): string {
  const from = p.source === 'observed' ? 'observed on the live site' : p.source === 'code' ? 'read in the application\'s code' : 'stated by the tester';
  const live = p.live === 'unconfirmed' ? 'not confirmed on the live site' : p.source === 'observed' ? 'confirmed' : 'confirmed on the live site';
  return `${from}, ${live}`;
}

/** The "Source:" text of the confirmation: one rule without its id, several rules each with theirs. */
export function describeSources(rules: PricingRule[]): string {
  return rules.length === 1 ? describeSource(rules[0].provenance) : rules.map((r) => `${r.id} ${describeSource(r.provenance)}`).join('; ');
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const DECIMAL = /^\d+(\.\d+)?$/;

function unknownKeys(obj: Record<string, unknown>, allowed: string[], where: string): string[] {
  return Object.keys(obj).filter((k) => !allowed.includes(k)).map((k) => `${where}: unknown key "${k}"; allowed are ${allowed.join(', ')}`);
}

function provenanceProblems(p: unknown, where: string): string[] {
  if (!isObj(p)) return [`${where}: provenance is missing`];
  const out = unknownKeys(p, ['source', 'ref', 'live'], `${where} provenance`);
  if (!['code', 'tester', 'observed'].includes(p.source as string)) out.push(`${where}: provenance.source must be code, tester or observed`);
  if (!isStr(p.ref)) out.push(`${where}: provenance.ref must name the source`);
  if (!['confirmed', 'unconfirmed'].includes(p.live as string)) out.push(`${where}: provenance.live must be confirmed or unconfirmed`);
  return out;
}

const filterOk = (w: unknown) => isObj(w) && Object.values(w).every((v) => Array.isArray(v) && v.every(isStr));

function conditionProblems(when: unknown, where: string): string[] {
  const KEYS = ['always', 'shareOfUnits', 'hasUnits', 'subtotalAtLeast'];
  if (!isObj(when)) return [`${where}: when is missing; use one of ${KEYS.join(', ')}`];
  const keys = Object.keys(when);
  const unknown = keys.filter((k) => !KEYS.includes(k));
  if (unknown.length) return [`${where}: unknown condition key "${unknown[0]}" in when; the vocabulary of design 9.2 is ${KEYS.join(', ')}`];
  if (keys.length !== 1) return [`${where}: when holds ${keys.length} conditions; write exactly one of ${KEYS.join(', ')}`];
  const c = when[keys[0]];
  if (keys[0] === 'always') return c === true ? [] : [`${where}: when.always must be true`];
  if (keys[0] === 'subtotalAtLeast') return isStr(c) && DECIMAL.test(c) ? [] : [`${where}: when.subtotalAtLeast must be a decimal string such as "50.00"`];
  if (!isObj(c)) return [`${where}: when.${keys[0]} must be an object`];
  if (keys[0] === 'shareOfUnits') {
    return [...unknownKeys(c, ['where', 'above'], `${where} when.shareOfUnits`), ...(filterOk(c.where) ? [] : [`${where}: when.shareOfUnits.where must map attributes to lists of values`]),
      ...(isStr(c.above) && DECIMAL.test(c.above) ? [] : [`${where}: when.shareOfUnits.above must be a decimal ratio such as "0.5"`])];
  }
  return [...unknownKeys(c, ['where', 'atLeast'], `${where} when.hasUnits`), ...(filterOk(c.where) ? [] : [`${where}: when.hasUnits.where must map attributes to lists of values`]),
    ...(Number.isInteger(c.atLeast) && (c.atLeast as number) >= 1 ? [] : [`${where}: when.hasUnits.atLeast must be a whole number of at least 1`])];
}

function amountProblems(amount: unknown, where: string): string[] {
  if (!isObj(amount)) return [`${where}: amount is missing; use { percentOf, rate } or { fixed }`];
  if ('fixed' in amount) return [...unknownKeys(amount, ['fixed'], `${where} amount`), ...(isStr(amount.fixed) && DECIMAL.test(amount.fixed) ? [] : [`${where}: amount.fixed must be a decimal string`])];
  return [...unknownKeys(amount, ['percentOf', 'rate'], `${where} amount`),
    ...(['subtotal', 'running'].includes(amount.percentOf as string) ? [] : [`${where}: amount.percentOf must be subtotal or running`]),
    ...(isStr(amount.rate) && DECIMAL.test(amount.rate) ? [] : [`${where}: amount.rate must be a decimal string such as "5"`])];
}

/** Everything in a loaded rules file that is outside the vocabulary of design 9.2; empty when the file is usable. */
export function rulesProblems(module: unknown): string[] {
  if (!isObj(module)) return ['the file exports nothing'];
  const out: string[] = [];
  const summary = module.summary;
  if (!isObj(summary) || !isObj(summary.total) || !(summary.total.label instanceof RegExp) || !isObj(summary.subtotal) || !(summary.subtotal.label instanceof RegExp)) {
    out.push('summary must give total.label and subtotal.label as regular expressions');
  } else out.push(...provenanceProblems(summary.provenance, 'summary'));
  if (!Array.isArray(module.rules)) out.push('rules must be an array (it may be empty)');
  else {
    module.rules.forEach((r: unknown, i: number) => {
      const where = `rule ${isObj(r) && isStr(r.id) ? r.id : `#${i + 1}`}`;
      if (!isObj(r)) { out.push(`${where}: not an object`); return; }
      out.push(...unknownKeys(r, ['id', 'label', 'when', 'amount', 'provenance'], where));
      if (!isStr(r.id)) out.push(`${where}: id is missing`);
      if (!(r.label instanceof RegExp)) out.push(`${where}: label must be a regular expression`);
      out.push(...conditionProblems(r.when, where), ...amountProblems(r.amount, where), ...provenanceProblems(r.provenance, where));
    });
  }
  if (!Array.isArray(module.constraints)) out.push('constraints must be an array (it may be empty)');
  else {
    module.constraints.forEach((c: unknown, i: number) => {
      const where = `constraint ${isObj(c) && isStr(c.id) ? c.id : `#${i + 1}`}`;
      if (!isObj(c)) { out.push(`${where}: not an object`); return; }
      out.push(...unknownKeys(c, ['id', 'maxQty', 'match', 'provenance'], where));
      if (!Number.isInteger(c.maxQty) || (c.maxQty as number) < 1) out.push(`${where}: maxQty must be a whole number of at least 1`);
      if (c.match !== undefined && !(isObj(c.match) && isStr(c.match.name))) out.push(`${where}: match must be { name }`);
      out.push(...provenanceProblems(c.provenance, where));
    });
  }
  return out;
}
