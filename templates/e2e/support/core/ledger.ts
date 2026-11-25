// The ledger: the cart state and the expected amounts computed from product facts and pricing rules.
// Implements the step semantics table of design 8.1 (one definition shared by the validator, the
// ledger and the reference cart) and the expected side of the oracle (section 9).
import { formatMoney, sum, times, zero, type AmountFormat } from './money';
import { applyRules, type AppliedAdjustment, type PricingRule } from './pricing';
import type { StepKind } from './scenario';
import type { Money, ProductFacts } from './types';

export type QtyState = Map<string, number>; // insertion order = line order

export type Action = { do: StepKind; key: string; qty?: number };

/** The rule an action breaks: V4 a step condition, V5 a step that changes nothing. */
export type ActionViolation = { rule: 'V4' | 'V5'; reason: string };

/** The condition of the step semantics table. Null when the action is allowed. */
export function checkAction(state: QtyState, a: Action): ActionViolation | null {
  const current = state.get(a.key);
  const positive = Number.isInteger(a.qty) && (a.qty as number) >= 1;
  switch (a.do) {
    case 'add':
      return positive ? null : { rule: 'V4', reason: `add needs a quantity of at least 1` };
    case 'setQty':
      if (current === undefined) return { rule: 'V4', reason: `setQty needs ${a.key} to be in the cart` };
      if (!positive) return { rule: 'V4', reason: `setQty needs a quantity of at least 1; use remove to take a product out` };
      if (a.qty === current) return { rule: 'V5', reason: `setQty ${a.key} to ${a.qty} does not change the cart, which already holds ${current}` };
      return null;
    case 'remove':
      return current === undefined ? { rule: 'V4', reason: `remove needs ${a.key} to be in the cart` } : null;
  }
}

/** Apply an action that passed `checkAction`. Returns a new state. */
export function applyAction(state: QtyState, a: Action): QtyState {
  const next = new Map(state);
  if (a.do === 'add') next.set(a.key, (next.get(a.key) ?? 0) + (a.qty as number));
  else if (a.do === 'setQty') next.set(a.key, a.qty as number);
  else next.delete(a.key);
  return next;
}

export function sameState(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}

export type LedgerLine = { name: string; qty: number; unitPrice: Money; lineTotal: Money; attrs: Record<string, string> };

export type LedgerSnapshot = {
  lines: LedgerLine[];
  subtotal: Money;
  adjustments: AppliedAdjustment[];
  total: Money;
};

/** Price a list of lines with the rules: subtotal, adjustments in force, total. */
export function price(lines: LedgerLine[], rules: PricingRule[], currency: Money['currency']): LedgerSnapshot {
  const subtotal = sum(lines.map((l) => l.lineTotal), currency);
  const { adjustments, total } = applyRules(rules, subtotal, lines.map((l) => ({ qty: l.qty, attrs: l.attrs })));
  return { lines, subtotal, adjustments, total };
}

/** "subtotal $50.00 − green-discount $2.50", the composition of an expected total (9.1). */
export function composition(snap: LedgerSnapshot, fmt: AmountFormat): string {
  if (!snap.lines.length) return 'empty cart';
  const parts = [`subtotal ${formatMoney(snap.subtotal, fmt)}`, ...snap.adjustments.map((a) => `− ${a.id} ${formatMoney(a.amount, fmt)}`)];
  return parts.join(' ');
}

/** The expected cart: product facts bound at the first add, quantities by product name. */
export class Ledger {
  private state: QtyState = new Map();
  private readonly facts = new Map<string, ProductFacts>();

  constructor(private readonly rules: PricingRule[], private readonly currency: Money['currency']) {}

  /** Record a product's facts; the unit price is fixed at the first add (8.1). */
  bind(facts: ProductFacts): void {
    if (!this.facts.has(facts.name)) this.facts.set(facts.name, facts);
  }

  isBound(name: string): boolean {
    return this.facts.has(name);
  }

  apply(a: Action): void {
    const v = checkAction(this.state, a);
    if (v) throw new Error(`ledger: ${v.rule} ${v.reason}`);
    this.state = applyAction(this.state, a);
  }

  snapshot(): LedgerSnapshot {
    const lines = [...this.state].map(([name, qty]) => {
      const f = this.facts.get(name);
      if (!f) throw new Error(`ledger: product "${name}" was added without its facts`);
      return { name, qty, unitPrice: f.unitPrice, lineTotal: times(f.unitPrice, qty), attrs: f.attrs };
    });
    return lines.length ? price(lines, this.rules, this.currency)
      : { lines, subtotal: zero(this.currency), adjustments: [], total: zero(this.currency) };
  }
}
