// Unit tests of support/core/checkpoint.ts: every layer of design 9.1 judged both ways, and the message.
// Each test names one layer, a green or a red case, and asserts one thing.
import { expect, test } from '@playwright/test';
import { checkpointVerdict, displayedRecord, formatMismatch, judge, pollCart, type CheckContext } from '../support/core/checkpoint';
import { Ledger } from '../support/core/ledger';
import { fromDecimal } from '../support/core/money';
import type { CartDriver, CartView, SummaryRow } from '../support/core/types';
import { GREEN, REFERENCE, USD } from './helpers';

const ctx: CheckContext = { pricing: REFERENCE, fmt: USD, rulesFile: 'app/reference.pricing.ts' };
const usd = (d: string) => fromDecimal(d, 'USD');
const row = (label: string, rawText: string): SummaryRow => ({ label, rawText, value: usd('0') });
const amount = (rawText: string) => ({ rawText, value: usd('0') });

/** Ledger: Lamp (class A) ×1 at $10.00 and Kettle (class C) ×1 at $20.00 — no discount; or Lamp ×3 with it. */
function snap(lampQty = 1, kettle = true) {
  const l = new Ledger([GREEN], 'USD');
  l.bind({ name: 'Lamp', unitPrice: usd('10.00'), inStock: true, attrs: { energy_class: 'A' } });
  l.bind({ name: 'Kettle', unitPrice: usd('20.00'), inStock: true, attrs: { energy_class: 'C' } });
  l.apply({ do: 'add', key: 'Lamp', qty: lampQty });
  if (kettle) l.apply({ do: 'add', key: 'Kettle', qty: 1 });
  return l.snapshot();
}

const KETTLE = { name: 'Kettle', qty: 1, unitPrice: amount('$20.00'), lineTotal: amount('$20.00') };
const lamp = (qty: number, unit: string, line: string) => ({ name: 'Lamp', qty, unitPrice: amount(unit), lineTotal: amount(line) });

function view(over: Partial<Extract<CartView, { empty: false }>> = {}): CartView {
  return {
    empty: false,
    lines: [lamp(1, '$10.00', '$10.00'), KETTLE],
    adjustments: [],
    total: row('Total', '$30.00'),
    ...over,
  };
}
const discounted = (over: Partial<Extract<CartView, { empty: false }>> = {}) => view({
  lines: [lamp(3, '$10.00', '$30.00'), KETTLE],
  adjustments: [row('Green discount (5%)', '- $2.50')], subtotal: row('Subtotal', '$50.00'), total: row('Total', '$47.50'), ...over,
});
const layers = (v: CartView, s = snap()) => judge(v, s, ctx).map((f) => f.layer);

test('a cart that agrees with the ledger is green', () => expect(judge(view(), snap(), ctx)).toEqual([]));
test('a cart with a rule in force that agrees is green', () => expect(judge(discounted(), snap(3), ctx)).toEqual([]));

test('state: an empty cart when the ledger holds lines is red', () => expect(layers({ empty: true, emptyMessage: 'empty' })).toEqual(['state']));
test('state: an empty cart with an empty ledger is green', () => expect(judge({ empty: true, emptyMessage: 'empty' }, new Ledger([], 'USD').snapshot(), ctx)).toEqual([]));
test('state: a non-zero total in an empty cart is red', () => expect(judge({ empty: true, emptyMessage: 'empty', total: row('Total', '$1.00') }, new Ledger([], 'USD').snapshot(), ctx).map((f) => f.layer)).toEqual(['state']));
test('labels: a total read from the subtotal row is a read error', () => expect(judge(view({ total: row('Subtotal', '$30.00') }), snap(), ctx)[0].verdict).toBe('LOCATOR_FAIL'));
test('labels: a total that is not an amount is a read error', () => expect(judge(view({ total: row('Total', 'n/a') }), snap(), ctx)[0].verdict).toBe('LOCATOR_FAIL'));
test('lines: a wrong quantity is red', () => expect(layers(view({ lines: [lamp(2, '$10.00', '$20.00'), KETTLE] }))).toContain('lines'));
test('lines: an extra line is red', () => expect(layers(view({ lines: [lamp(1, '$10.00', '$10.00'), KETTLE, { name: 'Cup', qty: 1, unitPrice: amount('$1.00'), lineTotal: amount('$1.00') }] }))).toContain('lines'));
test('unit price: a price other than the one read at the add is red', () => expect(layers(view({ lines: [lamp(1, '$11.00', '$10.00'), KETTLE] }))).toEqual(['unit price']));
test('line total: price times quantity is compared exactly', () => expect(layers(view({ lines: [lamp(1, '$10.00', '$10.01'), KETTLE] }))).toEqual(['line total']));
test('adjustments: a row with no rule is an unmodeled adjustment', () => expect(judge(view({ adjustments: [row('Loyalty bonus', '- $1.00')] }), snap(), ctx)[0].verdict).toBe('UNMODELED_ADJUSTMENT'));
test('adjustments: a rule in force without its row is red', () => expect(layers(discounted({ adjustments: [] }), snap(3))).toContain('adjustments'));
test('adjustments: an amount is compared by absolute value', () => expect(judge(discounted({ adjustments: [row('Green discount', '$2.50')] }), snap(3), ctx)).toEqual([]));
test('adjustments: a wrong amount is red', () => expect(layers(discounted({ adjustments: [row('Green discount', '- $2.60')], total: row('Total', '$47.50') }), snap(3))).toEqual(['adjustments']));
test('subtotal: a subtotal other than the sum of lines is red', () => expect(layers(discounted({ subtotal: row('Subtotal', '$49.00') }), snap(3))).toEqual(['subtotal']));
test('total: a total one cent off is red', () => expect(layers(view({ total: row('Total', '$30.01') }))).toEqual(['total']));
test('total: the total checks the direction of a discount', () => expect(layers(discounted({ total: row('Total', '$52.50') }), snap(3))).toEqual(['total']));

test('an unmodeled adjustment outranks the total mismatch it causes', () => {
  expect(checkpointVerdict(judge(view({ adjustments: [row('Loyalty bonus', '- $1.00')], total: row('Total', '$29.00') }), snap(), ctx))).toBe('UNMODELED_ADJUSTMENT');
});

test('the mismatch message has the fixed format of design 9.1', () => {
  const findings = judge(discounted({ adjustments: [], subtotal: undefined, total: row('Total', '$50.00') }), snap(3), ctx);
  expect(formatMismatch('S3', 'set quantity of Lamp to 3', findings).split('\n').slice(0, 6)).toEqual([
    'S3 · total mismatch',
    '  action:    set quantity of Lamp to 3',
    '  expected:  $47.50 = subtotal $50.00 − green-discount $2.50',
    '  displayed: "$50.00" in row "Total"',
    '  diff:      +$2.50',
    '  layer:     adjustments · rule green-discount applies, no row displayed',
  ]);
});

// The poll of design 9.1 (report V, survivor #10) and the raw text of 8.5 (survivor #19).
test('poll: a first read that disagrees and a second that agrees is green after two reads', async () => {
  let n = 0;
  const driver = { readCart: async () => (n++ === 0 ? view({ total: row('Total', '$29.00') }) : view()) } as unknown as CartDriver;
  const r = await pollCart(driver, snap(), ctx, 1000);
  expect({ red: r.findings.length > 0, reads: r.reads }).toEqual({ red: false, reads: 2 });
});
test('poll: a cart that never agrees is red, and only after settleMs', async () => {
  const driver = { readCart: async () => view({ total: row('Total', '$29.00') }) } as unknown as CartDriver;
  const r = await pollCart(driver, snap(), ctx, 50);
  expect({ red: r.findings.length > 0, waited: r.elapsedMs >= 50 }).toEqual({ red: true, waited: true });
});
test('the displayed record keeps the raw text byte for byte', () => {
  const rec = displayedRecord(discounted({ adjustments: [row('Green discount (5%)', '- $2.50')], total: row('Total', 'USD 47.50') }), USD) as { adjustments: Array<{ rawText: string }>; total: { rawText: string } };
  expect([rec.adjustments[0].rawText, rec.total.rawText]).toEqual(['- $2.50', 'USD 47.50']);
});

// Report V F8 and report D request 7: messages a tester can follow without the code.
test('an amount mismatch names the raw text of the row in its cause line', () => {
  const findings = judge(discounted({ adjustments: [row('Green discount (5%)', '- $2.60')], total: row('Total', '$47.40') }), snap(3), ctx);
  expect(formatMismatch('S1', 'add Lamp, 3 units', findings).split('\n').find((l) => l.startsWith('  layer:'))).toContain('"- $2.60"');
});
test('an unmodeled adjustment whose rows add up does not say the total is not the subtotal minus the adjustments', () => {
  const findings = judge(view({ adjustments: [row('Loyalty bonus', '- $1.00')], subtotal: row('Subtotal', '$30.00'), total: row('Total', '$29.00') }), snap(), ctx);
  expect(formatMismatch('S1', 'add Lamp, 1 unit', findings)).not.toContain('not the subtotal minus the adjustments');
});
test('a total that is not an amount is reported in the total layer, not labels', () => expect(judge(view({ total: row('Total', 'gratis') }), snap(), ctx)[0].layer).toBe('total'));
