// Unit tests of support/core/ledger.ts: the step semantics table of design 8.1 and the priced ledger.
import { expect, test } from '@playwright/test';
import { applyAction, checkAction, Ledger, type QtyState } from '../support/core/ledger';
import { decimalText, fromDecimal } from '../support/core/money';
import { GREEN } from './helpers';

const state = (o: Record<string, number>): QtyState => new Map(Object.entries(o));

test('add of a new product creates a line', () => expect(Object.fromEntries(applyAction(state({}), { do: 'add', key: 'A', qty: 2 }))).toEqual({ A: 2 }));
test('add of a product in the cart grows its quantity', () => expect(Object.fromEntries(applyAction(state({ A: 2 }), { do: 'add', key: 'A', qty: 2 }))).toEqual({ A: 4 }));
test('setQty sets the quantity', () => expect(Object.fromEntries(applyAction(state({ A: 1 }), { do: 'setQty', key: 'A', qty: 3 }))).toEqual({ A: 3 }));
test('remove deletes the line', () => expect(Object.fromEntries(applyAction(state({ A: 1, B: 1 }), { do: 'remove', key: 'B' }))).toEqual({ A: 1 }));
test('setQty of a product not in the cart breaks V4', () => expect(checkAction(state({}), { do: 'setQty', key: 'A', qty: 1 })?.rule).toBe('V4'));
test('setQty to zero breaks V4', () => expect(checkAction(state({ A: 1 }), { do: 'setQty', key: 'A', qty: 0 })?.rule).toBe('V4'));
test('setQty to the current quantity breaks V5', () => expect(checkAction(state({ A: 1 }), { do: 'setQty', key: 'A', qty: 1 })?.rule).toBe('V5'));
test('remove of a product not in the cart breaks V4', () => expect(checkAction(state({}), { do: 'remove', key: 'A' })?.rule).toBe('V4'));

test('the ledger total applies the rules to the bound prices', () => {
  const ledger = new Ledger([GREEN], 'USD');
  ledger.bind({ name: 'Green Lamp', unitPrice: fromDecimal('13.98', 'USD'), inStock: true, attrs: { energy_class: 'B' } });
  ledger.apply({ do: 'add', key: 'Green Lamp', qty: 1 });
  expect(decimalText(ledger.snapshot().total)).toBe('13.28');
});

test('a unit price is fixed at the first add', () => {
  const ledger = new Ledger([], 'USD');
  ledger.bind({ name: 'P', unitPrice: fromDecimal('1.00', 'USD'), inStock: true, attrs: {} });
  ledger.bind({ name: 'P', unitPrice: fromDecimal('9.00', 'USD'), inStock: true, attrs: {} });
  ledger.apply({ do: 'add', key: 'P', qty: 2 });
  expect(decimalText(ledger.snapshot().total)).toBe('2.00');
});
