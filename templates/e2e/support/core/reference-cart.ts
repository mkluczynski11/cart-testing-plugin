// In-memory reference cart implementing CartDriver, with defect switches.
// Its step semantics come from ledger.ts (checkAction/applyAction); its prices from the rules file.
import type { DefectId } from './defects';
import { applyAction, type QtyState } from './ledger';
import { cents, floorToCents, formatCents, fromDecimal, roundToCents, sum, times, ZERO } from './money';
import { applyRules, type PricingModule } from './pricing';
import type { CartDriver, CartLine, CartView, Displayed, Money, ProductFacts, SummaryRow } from './types';
import { LocatorError, PreconditionError } from './verdicts';

export type CatalogItem = { name: string; price: string; inStock: boolean; attrs: Record<string, string> };

/**
 * Five stub products in listing order: one out of stock, two with co2_rating B.
 * Prices are chosen so that a 5% discount yields fractions of a cent.
 */
export const REFERENCE_CATALOG: readonly CatalogItem[] = [
  { name: 'Bolt Cutters', price: '48.41', inStock: false, attrs: { co2_rating: 'E' } },
  { name: 'Claw Hammer', price: '14.15', inStock: true, attrs: { co2_rating: 'D' } },
  { name: 'Combination Pliers', price: '12.01', inStock: true, attrs: { co2_rating: 'C' } },
  { name: 'Wood Saw', price: '13.97', inStock: true, attrs: { co2_rating: 'B' } },
  { name: 'Eco Screwdriver', price: '7.33', inStock: true, attrs: { co2_rating: 'B' } },
];

export const EMPTY_MESSAGE = 'Your shopping cart is empty';

function displayed(c: bigint): Displayed {
  return { value: cents(c), rawText: formatCents(c) };
}

function row(label: string, c: bigint): SummaryRow {
  return { label, ...displayed(c) };
}

export class ReferenceCart implements CartDriver {
  private lines: QtyState = new Map();
  private staleTotal: bigint | undefined;
  private readonly catalog: readonly CatalogItem[];
  private readonly pricing: PricingModule;
  readonly defect: DefectId | undefined;

  constructor(opts: { pricing: PricingModule; defect?: DefectId; catalog?: readonly CatalogItem[] }) {
    this.pricing = opts.pricing;
    this.defect = opts.defect;
    this.catalog = opts.catalog ?? REFERENCE_CATALOG;
  }

  async *candidates(): AsyncIterable<string> {
    for (const item of this.catalog) yield item.name;
  }

  private item(name: string): CatalogItem {
    const item = this.catalog.find((i) => i.name === name);
    if (!item) throw new PreconditionError(`the catalog has no product named "${name}"`);
    return item;
  }

  async productFacts(name: string): Promise<ProductFacts> {
    const item = this.item(name);
    return { name: item.name, unitPrice: fromDecimal(item.price), inStock: item.inStock, attrs: { ...item.attrs } };
  }

  async addProduct(name: string, qty: number): Promise<void> {
    const item = this.item(name);
    if (!item.inStock) throw new PreconditionError(`"${name}" is out of stock`);
    this.staleTotal = undefined;
    if (this.defect === 'add-replaces-quantity' && this.lines.has(name)) {
      this.lines = new Map(this.lines).set(name, qty);
      return;
    }
    this.lines = applyAction(this.lines, { do: 'add', key: name, qty });
  }

  async setQuantity(name: string, qty: number): Promise<void> {
    this.requireLine(name);
    if (this.defect === 'total-stale-after-setqty') this.staleTotal ??= this.displayedTotalCents();
    else this.staleTotal = undefined;
    if (this.defect === 'setqty-ignored') return;
    this.lines = applyAction(this.lines, { do: 'setQty', key: name, qty });
  }

  async remove(name: string): Promise<void> {
    this.requireLine(name);
    if (this.defect === 'total-stale-after-remove') this.staleTotal ??= this.displayedTotalCents();
    else this.staleTotal = undefined;
    if (this.defect === 'remove-ignored') return;
    let target = name;
    if (this.defect === 'remove-wrong-line') {
      const names = [...this.lines.keys()];
      const i = names.indexOf(name);
      target = names[i + 1] ?? names[i - 1] ?? name;
    }
    this.lines = applyAction(this.lines, { do: 'remove', key: target });
  }

  private requireLine(name: string): void {
    if (!this.lines.has(name)) throw new LocatorError(`LOCATOR_FAIL: the cart has no line "${name}"`);
  }

  private unitPrice(name: string): Money {
    return fromDecimal(this.item(name).price);
  }

  private priced(qtyOf: (qty: number) => number) {
    const entries = [...this.lines];
    const subtotal = entries.length ? sum(entries.map(([n, q]) => times(this.unitPrice(n), qtyOf(q)))) : ZERO;
    const groups = entries.map(([n, q]) => ({ qty: qtyOf(q), attrs: this.item(n).attrs }));
    return { subtotal, ...applyRules(this.pricing.rules, subtotal, groups) };
  }

  /** The total the cart would display right now, defects included (without the stale switch). */
  private displayedTotalCents(): bigint {
    if (this.lines.size === 0) return 0n;
    const correct = this.priced((q) => q);
    if (this.defect === 'total-ignores-quantity') return roundToCents(this.priced(() => 1).total);
    if (this.defect === 'discount-not-applied') return roundToCents(correct.subtotal);
    if (this.defect === 'total-truncated') return floorToCents(correct.total);
    return roundToCents(correct.total);
  }

  async readCart(): Promise<CartView> {
    const totalCents = this.staleTotal ?? this.displayedTotalCents();
    if (this.lines.size === 0) {
      return { empty: true, emptyMessage: EMPTY_MESSAGE, total: row('Total', totalCents) };
    }
    const lines: CartLine[] = [...this.lines].map(([name, qty]) => {
      const unit = this.unitPrice(name);
      const unitCents = roundToCents(unit);
      const lineCents = this.defect === 'line-total-wrong' ? unitCents : roundToCents(times(unit, qty));
      return { name, qty, unitPrice: displayed(unitCents), lineTotal: displayed(lineCents) };
    });
    const priced = this.priced((q) => q);
    const adjustments: SummaryRow[] = priced.adjustments.map((a) => {
      const rule = this.pricing.rules.find((r) => r.id === a.id);
      const c = roundToCents(a.amount);
      const absText = formatCents(c < 0n ? -c : c);
      return { label: rule?.id === 'eco-discount' ? 'Eco discount (5%)' : a.id, value: cents(c), rawText: `${c < 0n ? '- ' : ''}${absText}` };
    });
    const subtotal = row('Subtotal', roundToCents(priced.subtotal));
    const total = this.defect === 'driver-reads-subtotal' ? subtotal : row('Total', totalCents);
    return { empty: false, lines, adjustments, subtotal, total };
  }
}
