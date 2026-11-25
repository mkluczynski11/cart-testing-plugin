// Unit tests of support/core/validator.ts: each rule V1–V8 of design 8.1 is broken once, and holds.
import { expect, test } from '@playwright/test';
import { validateScenario, type RuleId } from '../support/core/validator';
import { dataOf, REFERENCE, STEPS, yaml } from './helpers';

const rulesOf = (patch: Record<string, string>) => {
  const r = validateScenario(dataOf(yaml(patch)), 'ref', REFERENCE.constraints);
  return r.ok ? [] : r.violations.map((v) => v.rule);
};

test('the reference scenario is valid', () => expect(rulesOf({})).toEqual([]));

const broken: Array<[RuleId, string, Record<string, string>]> = [
  ['V1', 'an unknown step kind', { steps: STEPS('{ id: S1, do: applyCoupon, product: A, qty: 1, cart_after: { A: 1 } }') }],
  ['V1', 'an id that differs from the file name', { id: 'other' }],
  ['V1', 'a missing price_source', { price_source: '' }],
  ['V1', 'an unknown precondition', { preconditions: '[logged-in]' }],
  ['V1', 'a where filter that is not a list', { products: '\n  A: { pick: first-available, where: { energy_class: A } }\n  B: { pick: next-available, distinct_from: [A] }' }],
  ['V2', 'a step on an undeclared product', { steps: STEPS('{ id: S1, do: add, product: C, qty: 1, cart_after: { C: 1 } }', '{ id: S2, do: add, product: A, qty: 1, cart_after: { C: 1, A: 1 } }', '{ id: S3, do: add, product: B, qty: 1, cart_after: { C: 1, A: 1, B: 1 } }') }],
  ['V2', 'a declared product no step uses', { products: '\n  A: { pick: first-available }\n  B: { pick: next-available, distinct_from: [A] }\n  C: { pick: by-name, name: "Saw" }' }],
  ['V3', 'two by-name picks of one name', { products: '\n  A: { pick: by-name, name: "Saw" }\n  B: { pick: by-name, name: "saw" }' }],
  ['V3', 'an unnamed pick that does not exclude an earlier one', { products: '\n  A: { pick: first-available }\n  B: { pick: first-available }' }],
  ['V4', 'remove before add', { steps: STEPS('{ id: S1, do: add, product: A, qty: 1, cart_after: { A: 1 } }', '{ id: S2, do: remove, product: B, cart_after: { A: 1 } }', '{ id: S3, do: add, product: B, qty: 1, cart_after: { A: 1, B: 1 } }') }],
  ['V5', 'setQty to the current quantity', { steps: STEPS('{ id: S1, do: add, product: A, qty: 1, cart_after: { A: 1 } }', '{ id: S2, do: setQty, product: A, qty: 1, cart_after: { A: 1 } }', '{ id: S3, do: add, product: B, qty: 1, cart_after: { A: 1, B: 1 } }') }],
  ['V6', 'cart_after that disagrees with the step', { steps: STEPS('{ id: S1, do: add, product: A, qty: 1, cart_after: { A: 2 } }', '{ id: S2, do: add, product: B, qty: 1, cart_after: { A: 1, B: 1 } }') }],
  ['V7', 'no checkpoint after the last step', { check: '[S2]' }],
  ['V7', 'a checkpoint on a missing step', { check: '[S9, S4]' }],
  ['V8', 'a state above the purchase limit', { steps: STEPS('{ id: S1, do: add, product: A, qty: 60, cart_after: { A: 60 } }', '{ id: S2, do: add, product: A, qty: 60, cart_after: { A: 120 } }', '{ id: S3, do: add, product: B, qty: 1, cart_after: { A: 120, B: 1 } }') }],
];

for (const [rule, what, patch] of broken) {
  test(`${what} breaks ${rule}`, () => expect(rulesOf(patch)).toContain(rule));
}

test('a later unnamed pick need not exclude a by-name product', () => {
  expect(rulesOf({ products: '\n  A: { pick: by-name, name: "Green Lamp" }\n  B: { pick: first-available }' })).toEqual([]);
});

test('the V6 message gives the state the ledger computed', () => {
  const r = validateScenario(dataOf(yaml(broken[11][2])), 'ref', REFERENCE.constraints);
  expect(r.ok ? '' : r.violations[0].message).toContain('write cart_after: { A: 1 }');
});
