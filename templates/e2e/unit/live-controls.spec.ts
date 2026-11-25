// Unit tests of support/core/live-controls.ts: bindings and the exact price raise of drift-price (design 10.6).
import { expect, test } from '@playwright/test';
import { bindingOf, raiseAt } from '../support/core/live-controls';
import { EUR, USD } from './helpers';

test('drift-price raises a JSON number by exactly one cent', () => {
  const body = { lines: [{ item: { price: 17.25 } }] };
  raiseAt(body, 'lines.0.item.price', USD);
  expect(body.lines[0].item.price).toBe(17.26);
});
test('drift-price raises a decimal string and keeps it a string', () => {
  const body = { items: [{ price: '24.99' }] };
  raiseAt(body, 'items.0.price', EUR);
  expect(body.items[0].price).toBe('25.00');
});
test('drift-price reports a path with no price', () => expect(raiseAt({ items: [] }, 'items.0.price', USD)).toBe(false));
test('a network control without a binding is not bound', () => expect(bindingOf('lost-update', {})).toBeNull());
test('drift-price needs a pricePath in the cart binding', () => expect(bindingOf('drift-price', { cart: { method: 'GET', urlPattern: '**/cart' } })).toBeNull());
