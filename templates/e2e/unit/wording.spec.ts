// Unit tests of the words the tester reads in the confirmation (design 11.1, order G stage 1): products, rules,
// shares and the source of each rule, as `qa-harness example` prints them.
import { expect, test } from '@playwright/test';
import { describeRule, describeShare, describeSources, type PricingRule, type Provenance } from '../support/core/pricing';
import { example } from '../support/harness/example';
import { workspace } from '../support/harness/selftest';
import { GREEN } from './helpers';

const OBSERVED: Provenance = { source: 'observed', ref: 'docs/facts.md#h1; cart.component.ts @abc1234', live: 'confirmed' };
const usd = (d: string) => `$${d}`;

test('a share of one half, one third or one quarter is a fraction in words, any other share a percentage', () => {
  expect(['0.5', '0.50', '0.25', '0.6', '0.125', '0.3333'].map(describeShare))
    .toEqual(['half', 'half', 'a quarter', '60%', '12.5%', '33.33%']);
});

test('the first rule of a share reads "5% off when more than half of the units have …"', () => {
  expect(describeRule(GREEN)).toBe('green-discount: 5% off when more than half of the units have energy_class A or B');
});

test('a later rule names what its percentage is taken of; amounts are money', () => {
  const fixed: PricingRule = { id: 'big-cart', label: /big/i, when: { subtotalAtLeast: '50.00' }, amount: { fixed: '5.00' }, provenance: OBSERVED };
  const one: PricingRule = { id: 'one-a', label: /a/i, when: { hasUnits: { where: { k: ['A'] }, atLeast: 1 } }, amount: { percentOf: 'subtotal', rate: '10' }, provenance: OBSERVED };
  const two: PricingRule = { ...one, id: 'two-a', when: { hasUnits: { where: { k: ['A'] }, atLeast: 2 } }, amount: { percentOf: 'running', rate: '10' } };
  expect([describeRule(fixed, 0, usd), describeRule(one, 1, usd), describeRule(two, 2, usd)]).toEqual([
    'big-cart: $5.00 off when the subtotal is at least $50.00',
    'one-a: 10% of the subtotal off when at least 1 unit has k A',
    'two-a: 10% off the amount after the rules before it when at least 2 units have k A',
  ]);
});

test('the source of a rule is said without the file it was found in', () => {
  const code: Provenance = { source: 'code', ref: 'CartService.php @abc1234', live: 'unconfirmed' };
  expect(describeSources([{ ...GREEN, provenance: OBSERVED }])).toBe('observed on the live site, confirmed');
  expect(describeSources([{ ...GREEN, provenance: OBSERVED }, { ...GREEN, id: 'x', provenance: code }]))
    .toBe('green-discount observed on the live site, confirmed; x read in the application\'s code, not confirmed on the live site');
});

test('example prints a product as "A = Product A, $10.00, energy_class A" and one Source line without a path', () => {
  const root = workspace('unit-wording', ['cart-total-add-change-remove']);
  const lines = example(root, 'cart-total-add-change-remove', false).lines;
  expect(lines[0]).toContain('A = Product A, $10.00, energy_class A; B = Product B, $20.00, energy_class C.');
  expect(lines.filter((l) => /^Rules: |^Source: /.test(l))).toEqual([
    'Rules: green-discount: 5% off when more than half of the units have energy_class A or B.',
    'Source: stated by the tester, not confirmed on the live site.',
  ]);
});
