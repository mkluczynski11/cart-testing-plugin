// The example: stub products and the totals the rules give on them, for the tester to approve.
// Implements design 8.2 and order N, section 6.1 (stub names and prices, attribute search, gaps).
import { describeState, describeStep, type ConfirmedHashes, type Scenario } from './scenario';
import { applyAction, price, type LedgerSnapshot, type QtyState } from './ledger';
import { decimalText, formatMoney, fromDecimal, times, type AmountFormat } from './money';
import { describeRule, ruleAttrs, type PricingModule } from './pricing';
import type { CatalogItem } from './reference-cart';

export type Stub = { name: string; price: string; attrs: Record<string, string> };

export type ExampleRow = {
  step: string;
  action: string;
  cart: string;
  subtotal: string;
  adjustments: Record<string, string>;
  total: string;
  totalExact: string;
  checkpoint: boolean;
};

export type ExampleFile = {
  scenario: string;
  currency: string;
  note: string;
  stub: Record<string, Stub>;
  rules: string[];
  expected: ExampleRow[];
  gaps: string[];
  confirmed?: ConfirmedHashes;
};

/** Aliases in the order of their first add: the order the reference catalog lists the stubs in. */
export function addOrder(s: Scenario): string[] {
  return [...new Set(s.steps.filter((x) => x.do === 'add').map((x) => x.product))];
}

/** Attributes a rule or a where filter mentions, with the values that match them. */
function mentionedAttrs(s: Scenario, pricing: PricingModule): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const note = (k: string, values: string[]) => out.set(k, [...new Set([...(out.get(k) ?? []), ...values])]);
  for (const r of pricing.rules) {
    const where = 'shareOfUnits' in r.when ? r.when.shareOfUnits.where : 'hasUnits' in r.when ? r.when.hasUnits.where : {};
    for (const k of ruleAttrs(r)) note(k, where[k]);
  }
  for (const a of s.aliases) {
    const p = s.products[a];
    if (p.pick !== 'by-name' && p.where) for (const [k, v] of Object.entries(p.where)) note(k, v);
  }
  return out;
}

/** A value outside every list: the first letter not mentioned, else "none". */
function nonMatching(values: string[]): string {
  if (values.every((v) => /^[A-Z]$/.test(v))) {
    for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!values.includes(c)) return c;
  }
  return 'none';
}

/** Subsets of `items` in the fixed search order: one item (first, second, …), then two, …, then none. */
function subsets<T>(items: T[]): T[][] {
  const out: T[][] = [];
  const pick = (start: number, size: number, acc: T[]) => {
    if (acc.length === size) { out.push(acc); return; }
    for (let i = start; i < items.length; i++) pick(i + 1, size, [...acc, items[i]]);
  };
  for (let size = 1; size <= items.length; size++) pick(0, size, []);
  out.push([]);
  return out;
}

function cartesian<T>(lists: T[][]): T[][] {
  return lists.reduce<T[][]>((acc, list) => acc.flatMap((a) => list.map((x) => [...a, x])), [[]]);
}

/** Simulate the scenario on stubs: the ledger snapshot after every step. */
export function simulateStubs(s: Scenario, stubs: Record<string, Stub>, pricing: PricingModule, fmt: AmountFormat): LedgerSnapshot[] {
  let state: QtyState = new Map();
  return s.steps.map((step) => {
    state = applyAction(state, { do: step.do, key: step.product, qty: step.qty });
    const lines = [...state].map(([alias, qty]) => {
      const unitPrice = fromDecimal(stubs[alias].price, fmt.currency);
      return { name: stubs[alias].name, qty, unitPrice, lineTotal: times(unitPrice, qty), attrs: stubs[alias].attrs };
    });
    return price(lines, pricing.rules, fmt.currency);
  });
}

/** Build the stubs: names, prices in declaration order, and attributes found by the search of 6.1. */
export function buildStubs(s: Scenario, pricing: PricingModule, fmt: AmountFormat): { stubs: Record<string, Stub>; gaps: string[] } {
  const base: Record<string, Stub> = {};
  s.aliases.forEach((a, i) => {
    const p = s.products[a];
    base[a] = { name: p.pick === 'by-name' ? p.name : `Product ${a}`, price: `${(i + 1) * 10}.00`, attrs: {} };
  });
  const attrs = [...mentionedAttrs(s, pricing)];
  const options = attrs.map(([key, values]) => {
    const pinned = s.aliases.filter((a) => { const p = s.products[a]; return p.pick !== 'by-name' && p.where?.[key]; });
    const free = s.aliases.filter((a) => !pinned.includes(a));
    return subsets(free).map((matching) => ({ key, values, matching: [...pinned, ...matching] }));
  });
  const assign = (choice: Array<{ key: string; values: string[]; matching: string[] }>): Record<string, Stub> => {
    const stubs: Record<string, Stub> = {};
    for (const a of s.aliases) {
      const attrsOf: Record<string, string> = {};
      for (const c of choice) {
        const p = s.products[a];
        const own = p.pick !== 'by-name' ? p.where?.[c.key]?.[0] : undefined;
        attrsOf[c.key] = c.matching.includes(a) ? own ?? c.values[0] : nonMatching(c.values);
      }
      stubs[a] = { ...base[a], attrs: attrsOf };
    }
    return stubs;
  };
  const checkpoints = new Set(s.checkpoints);
  const inForce = (stubs: Record<string, Stub>) => {
    const snaps = simulateStubs(s, stubs, pricing, fmt).filter((_, i) => checkpoints.has(s.steps[i].id));
    return pricing.rules.map((r) => snaps.map((snap) => snap.adjustments.some((x) => x.id === r.id)));
  };
  const choices = cartesian(options);
  for (const choice of choices) {
    const stubs = assign(choice);
    if (inForce(stubs).every((flags) => flags.includes(true) && flags.includes(false))) return { stubs, gaps: [] };
  }
  const stubs = assign(choices[0]);
  const gaps = inForce(stubs).flatMap((flags, i) => {
    const id = pricing.rules[i].id;
    if (!flags.includes(false)) return [`rule ${id} is always in force in this scenario`];
    if (!flags.includes(true)) return [`rule ${id} is never in force in this scenario`];
    return [];
  });
  return { stubs, gaps };
}

/** The example of design 8.2 for a valid scenario. */
export function buildExample(s: Scenario, pricing: PricingModule, fmt: AmountFormat): ExampleFile {
  const { stubs, gaps } = buildStubs(s, pricing, fmt);
  const snaps = simulateStubs(s, stubs, pricing, fmt);
  let state: Record<string, number> = {};
  const expected = s.steps.map((step, i) => {
    state = step.cartAfter;
    const snap = snaps[i];
    return {
      step: step.id,
      action: describeStep(step),
      cart: describeState(state),
      subtotal: decimalText(snap.subtotal),
      adjustments: Object.fromEntries(snap.adjustments.map((a) => [a.id, decimalText(a.amount)])),
      total: decimalText(snap.total),
      totalExact: `${snap.total.numerator}/${snap.total.denominator}`,
      checkpoint: s.checkpoints.includes(step.id),
    };
  });
  return {
    scenario: s.id,
    currency: fmt.currency,
    note: 'Stub products and prices, not the application\'s: they show how the rules behave. Real prices are read during the live run.',
    stub: stubs,
    rules: pricing.rules.map((r, i) => describeRule(r, i, (d) => formatMoney(fromDecimal(d, fmt.currency), fmt))),
    expected,
    gaps,
  };
}

/** The reference cart's catalog for a scenario: the stubs, in the order of their first add, all in stock. */
export function stubCatalog(s: Scenario, ex: ExampleFile): CatalogItem[] {
  return addOrder(s).map((a) => ({ name: ex.stub[a].name, price: ex.stub[a].price, inStock: true, attrs: ex.stub[a].attrs }));
}
