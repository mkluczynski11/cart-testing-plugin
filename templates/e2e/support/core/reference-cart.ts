// The reference cart: an in-memory CartDriver with one switchable defect.
// Implements design 10.1–10.2 and the defect effects of order N, section 6.2. Its step semantics come
// from ledger.ts; its prices from the app's own rules file, so G1 can compare with the example exactly.
import { applyAction, checkAction, type QtyState } from './ledger';
import { cents, formatCents, fromDecimal, roundToCents, sum, times, truncToCents, zero, type AmountFormat } from './money';
import { applyRules, type PricingModule, type RuleTweak } from './pricing';
import type { Defect, DefectWhen } from './operators';
import type { StepKind } from './scenario';
import type { CartDriver, CartLine, CartView, Money, ProductFacts, SummaryRow } from './types';
import { LocatorError, PreconditionError } from './verdicts';

export type CatalogItem = { name: string; price: string; inStock: boolean; attrs: Record<string, string> };

export type ReferenceOptions = {
  catalog: CatalogItem[];
  pricing: PricingModule;
  fmt: AmountFormat;
  defect?: Defect;
  emptyTotal?: boolean;       // the empty cart shows a zero total row
};

export const EMPTY_MESSAGE = 'The cart is empty.';

/** A literal text a label pattern accepts, e.g. /^total\b/i -> "total". */
export function sampleLabel(re: RegExp): string {
  const text = re.source.replace(/^\^/, '').replace(/\$$/, '').replace(/\\b/g, '').replace(/\\(.)/g, '$1');
  if (!re.test(text)) throw new Error(`label pattern ${re} is not a plain text; the reference cart cannot display a row for it.`);
  return text;
}

type LastOp = { kind: StepKind; direction: 'increase' | 'decrease' };

type Priced = { lines: Array<{ name: string; qty: number; unit: Money; lineTotal: Money }>; subtotal: Money; adjustments: Array<{ id: string; amount: Money }>; total: Money };

export class ReferenceCart implements CartDriver {
  readonly controls = {};
  readonly provides: { attrs: string[] };
  private lines: QtyState = new Map();
  private before: QtyState = new Map();
  private last: LastOp | undefined;

  constructor(private readonly o: ReferenceOptions) {
    this.provides = { attrs: [...new Set(o.catalog.flatMap((i) => Object.keys(i.attrs)))] };
  }

  async *candidates(): AsyncIterable<string> {
    for (const item of this.o.catalog) yield item.name;
  }

  private item(name: string): CatalogItem {
    const item = this.o.catalog.find((i) => i.name === name);
    if (!item) throw new PreconditionError(`The catalog has no product named "${name}".`, `no product "${name}"`);
    return item;
  }

  async productFacts(name: string): Promise<ProductFacts> {
    const item = this.item(name);
    return { name: item.name, unitPrice: fromDecimal(item.price, this.o.fmt.currency), inStock: item.inStock, attrs: { ...item.attrs } };
  }

  private matches(when: DefectWhen | undefined, op: LastOp | undefined): boolean {
    if (!when) return true;
    if (!op) return false;
    return (!when.afterStep || when.afterStep === op.kind) && (!when.direction || when.direction === op.direction);
  }

  /** A step-level defect applies to this operation. */
  private hits(kind: StepKind, op: LastOp, operator: 'no-effect' | 'wrong-target'): boolean {
    const d = this.o.defect;
    return !!d && d.operator === operator && 'step' in d.target && d.target.step === kind && this.matches(d.when, op);
  }

  private change(kind: StepKind, name: string, qty?: number): void {
    const current = this.lines.get(name);
    if (kind !== 'add' && current === undefined) throw new LocatorError(`The reference cart has no line "${name}" to ${kind === 'remove' ? 'remove' : 'change'}.`);
    const direction = kind === 'add' || (kind === 'setQty' && (qty as number) > (current as number)) ? 'increase' : 'decrease';
    const op: LastOp = { kind, direction };
    let key = name;
    if (this.hits(kind, op, 'wrong-target')) {
      const names = [...this.lines.keys()];
      key = names[(names.indexOf(name) + 1) % names.length];
    }
    const action = { do: kind, key, qty };
    this.before = this.lines;
    this.last = op;
    if (this.hits(kind, op, 'no-effect') || checkAction(this.lines, action)) return;
    this.lines = applyAction(this.lines, action);
  }

  async addProduct(name: string, qty: number): Promise<void> {
    if (!this.item(name).inStock) throw new PreconditionError(`"${name}" is out of stock.`, 'Out of stock');
    this.change('add', name, qty);
  }

  async setQuantity(name: string, qty: number): Promise<void> {
    this.change('setQty', name, qty);
  }

  async remove(name: string): Promise<void> {
    this.change('remove', name);
  }

  private price(state: QtyState, opts: { tweak?: RuleTweak; ignoreQty?: boolean } = {}): Priced {
    const currency = this.o.fmt.currency;
    const lines = [...state].map(([name, qty]) => {
      const unit = fromDecimal(this.item(name).price, currency);
      return { name, qty, unit, lineTotal: times(unit, opts.ignoreQty ? 1 : qty) };
    });
    const subtotal = sum(lines.map((l) => l.lineTotal), currency);
    const groups = [...state].map(([name, qty]) => ({ qty, attrs: this.item(name).attrs }));
    return { lines, subtotal, ...applyRules(this.o.pricing.rules, subtotal, groups, opts.tweak) };
  }

  private tweak(d: Defect): RuleTweak | undefined {
    if (!('adjustment' in d.target)) return undefined;
    const kind = ({ 'rule-never': 'never', 'rule-always': 'always', 'rule-rate': 'double-rate', 'rule-boundary': 'boundary' } as const)[d.operator as 'rule-never'];
    return kind ? { rule: d.target.adjustment, kind } : undefined;
  }

  async readCart(): Promise<CartView> {
    const d = this.o.defect && this.matches(this.o.defect.when, this.last) ? this.o.defect : undefined;
    const fmt = this.o.fmt;
    const tweak = d && this.tweak(d);
    const now = this.price(this.lines, { tweak });
    const stale = d?.operator === 'stale-value' ? this.price(this.before) : undefined;
    const target = d && ('value' in d.target ? d.target.value : 'adjustment' in d.target ? d.target.adjustment : undefined);
    const roundDown = d?.operator === 'round-mode';
    const shown = (m: Money, field: string, truncate = false): bigint => {
      const c = truncate ? truncToCents(m) : roundToCents(m);
      return d?.operator === 'skew-value' && target === field ? c + 1n : c;
    };
    const text = (c: bigint) => formatCents(c, fmt);

    if (this.lines.size === 0) {
      const total = stale && target === 'total' ? stale.total : zero(fmt.currency);
      return { empty: true, emptyMessage: EMPTY_MESSAGE, ...(this.o.emptyTotal ? { total: this.row(this.o.pricing.summary.total.label, shown(total, 'total')) } : {}) };
    }
    const lines: CartLine[] = now.lines.map((l) => {
      const old = stale && target === 'lineTotal' ? stale.lines.find((x) => x.name === l.name)?.lineTotal ?? l.lineTotal : l.lineTotal;
      const lineTotal = d?.operator === 'ignore-factor' && target === 'lineTotal' ? l.unit : old;
      const unitC = roundToCents(l.unit);
      return { name: l.name, qty: l.qty, unitPrice: { value: cents(unitC, fmt.currency), rawText: text(unitC) }, lineTotal: { value: cents(shown(lineTotal, 'lineTotal'), fmt.currency), rawText: text(shown(lineTotal, 'lineTotal')) } };
    });
    const adjustments: SummaryRow[] = now.adjustments.map((a) => {
      const rule = this.o.pricing.rules.find((r) => r.id === a.id);
      const amount = stale && target === a.id ? stale.adjustments.find((x) => x.id === a.id)?.amount ?? a.amount : a.amount;
      const c = -shown(amount, a.id, roundDown);
      return { label: rule ? sampleLabel(rule.label) : a.id, value: cents(c, fmt.currency), rawText: text(c) };
    });
    const subtotalC = shown(stale && target === 'subtotal' ? stale.subtotal : now.subtotal, 'subtotal');
    const totalSource = stale && target === 'total' ? stale.total
      : d?.operator === 'ignore-factor' && target === 'total' ? this.price(this.lines, { ignoreQty: true }).total
      : now.total;
    const view: CartView = { empty: false, lines, adjustments, total: this.row(this.o.pricing.summary.total.label, shown(totalSource, 'total', roundDown)) };
    if (adjustments.length) view.subtotal = this.row(this.o.pricing.summary.subtotal.label, subtotalC);
    return view;
  }

  private row(label: RegExp, c: bigint): SummaryRow {
    return { label: sampleLabel(label), value: cents(c, this.o.fmt.currency), rawText: formatCents(c, this.o.fmt) };
  }
}
