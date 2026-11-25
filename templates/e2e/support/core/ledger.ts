// The ledger: cart state (key -> quantity) and the expected prices computed from product facts and rules.
// `checkAction` and `applyAction` are the single definition of the step semantics, shared by the
// validator, the ledger and the reference cart.
import { formatMoney, sum, times, ZERO } from './money';
import { applyRules, type AppliedAdjustment, type PricingModule } from './pricing';
import type { StepKind } from './scenario';
import type { Money, ProductFacts } from './types';

export const MIN_QTY = 1;
export const MAX_QTY = 99;

export type QtyState = Map<string, number>; // insertion order = line order

export type Action = { do: StepKind; key: string; qty?: number };

export type ActionViolation = { rule: 'V5' | 'V6'; reason: string };

/** Check the condition from the step semantics table. Null when the action is allowed. */
export function checkAction(state: QtyState, a: Action): ActionViolation | null {
  const current = state.get(a.key);
  const qtyOk = (q: number | undefined) => Number.isInteger(q) && (q as number) >= MIN_QTY && (q as number) <= MAX_QTY;
  switch (a.do) {
    case 'add':
      if (!qtyOk(a.qty)) return { rule: 'V6', reason: `add needs qty between ${MIN_QTY} and ${MAX_QTY}` };
      return null;
    case 'setQty':
      if (current === undefined) return { rule: 'V6', reason: `setQty needs ${a.key} to be in the cart` };
      if (!qtyOk(a.qty)) return { rule: 'V6', reason: `setQty needs qty between ${MIN_QTY} and ${MAX_QTY}` };
      if (a.qty === current) return { rule: 'V5', reason: `setQty ${a.key} to ${a.qty} does not change the cart (it already holds ${current})` };
      return null;
    case 'remove':
      if (current === undefined) return { rule: 'V6', reason: `remove needs ${a.key} to be in the cart` };
      if (a.qty !== undefined) return { rule: 'V6', reason: 'remove takes no qty' };
      return null;
  }
}

/** Apply an action that passed `checkAction`. Returns a new state. */
export function applyAction(state: QtyState, a: Action): QtyState {
  const next = new Map(state);
  switch (a.do) {
    case 'add': next.set(a.key, (next.get(a.key) ?? 0) + (a.qty as number)); break;
    case 'setQty': next.set(a.key, a.qty as number); break;
    case 'remove': next.delete(a.key); break;
  }
  return next;
}

export function stateToObject(state: QtyState): Record<string, number> {
  return Object.fromEntries(state);
}

export function sameState(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}

export function describeState(state: Record<string, number>): string {
  const entries = Object.entries(state);
  return entries.length ? entries.map(([k, q]) => `${k}×${q}`).join(', ') : '(empty)';
}

// ---- priced ledger -----------------------------------------------------------------------------

export type LedgerLine = { alias: string; name: string; qty: number; unitPrice: Money; lineTotal: Money };

export type LedgerSnapshot = {
  state: Record<string, number>;
  lines: LedgerLine[];
  subtotal: Money;
  adjustments: AppliedAdjustment[];
  total: Money;
  composition: string; // e.g. "3 × $14.15 + 1 × $12.01 - $2.73 (eco-discount)"
};

export class Ledger {
  private state: QtyState = new Map();
  private facts = new Map<string, ProductFacts>();

  constructor(private readonly pricing: PricingModule) {}

  /** Record the facts of the product an alias resolved to. A unit price is fixed at the first add. */
  bind(alias: string, facts: ProductFacts): void {
    if (!this.facts.has(alias)) this.facts.set(alias, facts);
  }

  isBound(alias: string): boolean {
    return this.facts.has(alias);
  }

  factsOf(alias: string): ProductFacts {
    const f = this.facts.get(alias);
    if (!f) throw new Error(`ledger: alias ${alias} is not bound to a product`);
    return f;
  }

  aliasOfName(name: string): string | undefined {
    for (const [alias, f] of this.facts) if (f.name === name) return alias;
    return undefined;
  }

  apply(a: Action): void {
    const v = checkAction(this.state, a);
    if (v) throw new Error(`ledger: ${v.rule} ${v.reason}`);
    this.state = applyAction(this.state, a);
  }

  quantities(): Record<string, number> {
    return stateToObject(this.state);
  }

  snapshot(): LedgerSnapshot {
    const lines: LedgerLine[] = [...this.state].map(([alias, qty]) => {
      const f = this.factsOf(alias);
      return { alias, name: f.name, qty, unitPrice: f.unitPrice, lineTotal: times(f.unitPrice, qty) };
    });
    const subtotal = lines.length ? sum(lines.map((l) => l.lineTotal)) : ZERO;
    const groups = lines.map((l) => ({ qty: l.qty, attrs: this.factsOf(l.alias).attrs }));
    const { adjustments, total } = applyRules(this.pricing.rules, subtotal, groups);
    return { state: this.quantities(), lines, subtotal, adjustments, total, composition: composition(lines, adjustments) };
  }
}

export function composition(lines: LedgerLine[], adjustments: AppliedAdjustment[]): string {
  if (!lines.length) return '$0.00 (empty cart)';
  let text = lines.map((l) => `${l.qty} × ${formatMoney(l.unitPrice)}`).join(' + ');
  for (const a of adjustments) {
    const negative = a.amount.numerator < 0n;
    const absText = formatMoney(negative ? { ...a.amount, numerator: -a.amount.numerator } : a.amount);
    text += ` ${negative ? '-' : '+'} ${absText} (${a.id})`;
  }
  return text;
}
