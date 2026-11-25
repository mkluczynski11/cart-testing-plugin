// Unit tests of support/core/operators.ts and reference-cart.ts: derived defects (design 10.3) and their effects.
// The reference cart runs the reference scenario on the example stubs.
import { expect, test } from '@playwright/test';
import { buildExample, stubCatalog } from '../support/core/example';
import { deriveDefects, type Defect } from '../support/core/operators';
import { ReferenceCart, sampleLabel } from '../support/core/reference-cart';
import type { CartView } from '../support/core/types';
import { REFERENCE, scenario, USD } from './helpers';

const s = scenario({});
const catalog = stubCatalog(s, buildExample(s, REFERENCE, USD));
const defect = (id: string): Defect => {
  const d = deriveDefects(s, REFERENCE.rules).find((x) => x.id === id);
  if (!d) throw new Error(`no defect ${id}`);
  return d;
};
const total = (v: CartView) => v.empty ? v.total?.rawText : v.total.rawText;

async function play(d?: Defect): Promise<CartView[]> {
  const cart = new ReferenceCart({ catalog, pricing: REFERENCE, fmt: USD, defect: d });
  const views: CartView[] = [];
  await cart.addProduct('Product A', 1); views.push(await cart.readCart());
  await cart.addProduct('Product B', 1); views.push(await cart.readCart());
  await cart.setQuantity('Product A', 3); views.push(await cart.readCart());
  await cart.remove('Product B'); views.push(await cart.readCart());
  return views;
}

test('the reference scenario with one rule derives the thirteen defects of design 10.1', () => {
  expect(deriveDefects(s, REFERENCE.rules).map((d) => d.id)).toEqual([
    'lost-add', 'lost-qty', 'lost-remove', 'qty-wrong-line', 'remove-wrong-line', 'stale-total', 'total-off-by-cent',
    'line-ignores-qty', 'rule-never', 'rule-always', 'rule-wrong-rate', 'rule-boundary', 'round-down',
  ]);
});
test('with two rules the rule defects carry the rule id', () => {
  const two = [...REFERENCE.rules, { ...REFERENCE.rules[0], id: 'other' }];
  expect(deriveDefects(s, two).filter((d) => d.operator === 'rule-never').map((d) => d.id)).toEqual(['rule-never:green-discount', 'rule-never:other']);
});
test('the healthy reference cart shows the totals of the example', async () => expect((await play()).map(total)).toEqual(['$9.50', '$30.00', '$47.50', '$28.50']));
test('lost-qty leaves the quantity unchanged', async () => expect(total((await play(defect('lost-qty')))[2])).toBe('$30.00'));
test('qty-wrong-line changes the next line', async () => {
  const v = (await play(defect('qty-wrong-line')))[2];
  expect(v.empty ? [] : v.lines.map((l) => l.qty)).toEqual([1, 3]);
});
test('stale-total shows the total from before the last change', async () => expect(total((await play(defect('stale-total')))[2])).toBe('$30.00'));
test('total-off-by-cent adds one cent', async () => expect(total((await play(defect('total-off-by-cent')))[0])).toBe('$9.51'));
test('rule-boundary applies the rule exactly at its threshold', async () => expect(total((await play(defect('rule-boundary')))[1])).toBe('$28.50'));
test('a label pattern yields a literal row text', () => expect(sampleLabel(/^total\b/i)).toBe('total'));
