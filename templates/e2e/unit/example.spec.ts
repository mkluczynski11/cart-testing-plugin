// Unit tests of support/core/example.ts: stubs, the attribute search and scenario gaps (order N, 6.1).
// The reference rules file is the selftest app `reference` (support/harness/fixtures).
import { expect, test } from '@playwright/test';
import { buildExample, buildStubs, stubCatalog } from '../support/core/example';
import { NO_RULES, REFERENCE, scenario, STEPS, USD } from './helpers';

test('stubs are named by alias and priced 10, 20, … in declaration order', () => {
  const { stubs } = buildStubs(scenario({}), REFERENCE, USD);
  expect([stubs.A.name, stubs.A.price, stubs.B.name, stubs.B.price]).toEqual(['Product A', '10.00', 'Product B', '20.00']);
});
test('a by-name stub keeps the scenario\'s name', () => {
  const { stubs } = buildStubs(scenario({ products: '\n  A: { pick: by-name, name: "Green Lamp" }\n  B: { pick: first-available }' }), REFERENCE, USD);
  expect(stubs.A.name).toBe('Green Lamp');
});
test('the search gives the first alias the matching value and the rest a non-matching one', () => {
  const { stubs } = buildStubs(scenario({}), REFERENCE, USD);
  expect([stubs.A.attrs.energy_class, stubs.B.attrs.energy_class]).toEqual(['A', 'C']);
});
test('the reference example reproduces the totals of design 8.2', () => {
  expect(buildExample(scenario({}), REFERENCE, USD).expected.map((r) => r.total)).toEqual(['9.50', '30.00', '47.50', '28.50']);
});
test('a where filter pins its alias to a matching value', () => {
  const s = scenario({ products: '\n  A: { pick: first-available }\n  B: { pick: next-available, distinct_from: [A], where: { energy_class: [B] } }' });
  expect(buildStubs(s, REFERENCE, USD).stubs.B.attrs.energy_class).toBe('B');
});
test('a rule that cannot change state in the scenario is a gap, not an error', () => {
  const s = scenario({ products: '\n  A: { pick: first-available }', steps: STEPS('{ id: S1, do: add, product: A, qty: 1, cart_after: { A: 1 } }', '{ id: S2, do: setQty, product: A, qty: 2, cart_after: { A: 2 } }') });
  expect(buildStubs(s, REFERENCE, USD).gaps).toEqual(['rule green-discount is always in force in this scenario']);
});
test('without rules there are no attributes and no gaps', () => expect(buildStubs(scenario({}), NO_RULES, USD)).toMatchObject({ gaps: [], stubs: { A: { attrs: {} } } }));
test('the reference catalog lists the stubs in the order of their first add', () => {
  const s = scenario({});
  expect(stubCatalog(s, buildExample(s, REFERENCE, USD)).map((c) => c.name)).toEqual(['Product A', 'Product B']);
});
