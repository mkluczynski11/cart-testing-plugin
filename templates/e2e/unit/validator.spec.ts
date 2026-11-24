import { expect, test } from '@playwright/test';
import { parse } from 'yaml';
import { validateScenario, type Violation } from '../support/core/validator';

const base = () => parse(`
id: s
title: T
app: toolshop
status: draft
request: "r"
products:
  A: { pick: first-available }
  B: { pick: next-available, distinct_from: [A] }
steps:
  - { id: S1, do: add,    product: A, qty: 1, cart_after: { A: 1 } }
  - { id: S2, do: add,    product: B, qty: 1, cart_after: { A: 1, B: 1 } }
  - { id: S3, do: setQty, product: A, qty: 3, cart_after: { A: 3, B: 1 } }
  - { id: S4, do: remove, product: B,         cart_after: { A: 3 } }
check: each-step
`);

function violations(data: unknown, slug = 's'): Violation[] {
  const r = validateScenario(data, slug);
  return r.ok ? [] : r.violations;
}
const rules = (vs: Violation[]) => vs.map((v) => `${v.rule}${v.step ? ':' + v.step : ''}`);

test('the reference scenario is valid and resolves checkpoints', () => {
  const r = validateScenario(base(), 's');
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.scenario.checkpoints).toEqual(['S1', 'S2', 'S3', 'S4']);
    expect(r.scenario.products.B).toEqual({ pick: 'next-available', distinctFrom: ['A'] });
  }
});

test('V1: missing field, unknown do, duplicate id, unknown check, id differs from file name', () => {
  const d = base();
  delete d.title;
  d.steps[1].do = 'applyCoupon';
  d.steps[2].id = 'S1';
  d.check = 'sometimes';
  const vs = violations(d, 'other');
  expect(rules(vs)).toEqual(expect.arrayContaining(['V1', 'V1:S1']));
  expect(vs.map((v) => v.message).join('\n')).toMatch(/title/);
  expect(vs.map((v) => v.message).join('\n')).toMatch(/applyCoupon/);
  expect(vs.map((v) => v.message).join('\n')).toMatch(/file name/);
  expect(vs.map((v) => v.message).join('\n')).toMatch(/each-step, last-step/);
});

test('V2: undeclared alias in a step, declared alias never used', () => {
  const d = base();
  d.steps[3].product = 'C';
  d.products.D = { pick: 'by-name', name: 'Wood Saw' };
  expect(rules(violations(d))).toEqual(expect.arrayContaining(['V2:S4', 'V2']));
});

test('V3: distinct_from points at undeclared alias; two by-name share a name', () => {
  const d = base();
  d.products.B.distinct_from = ['X'];
  expect(rules(violations(d))).toContain('V3');
  const e = base();
  e.products.A = { pick: 'by-name', name: 'Wood Saw' };
  e.products.B = { pick: 'by-name', name: 'wood saw' };
  expect(rules(violations(e))).toContain('V3');
});

test('V4: "add two more" written as state 2 instead of 4', () => {
  const d = parse(`
id: s
title: T
app: toolshop
status: draft
request: "Add two units of a product, then add two more."
products: { A: { pick: first-available } }
steps:
  - { id: S1, do: add, product: A, qty: 2, cart_after: { A: 2 } }
  - { id: S2, do: add, product: A, qty: 2, cart_after: { A: 2 } }
check: each-step
`);
  const vs = violations(d);
  expect(rules(vs)).toEqual(['V4:S2']);
  expect(vs[0].message).toContain('A: 4');
});

test('V5: setQty to the current quantity does not change state', () => {
  const d = base();
  d.steps[2].qty = 1;
  d.steps[2].cart_after = { A: 1, B: 1 };
  d.steps[3].cart_after = { A: 1 };
  expect(rules(violations(d))).toEqual(['V5:S3']);
});

test('V6: conditions of the semantics table', () => {
  const d = base();
  d.steps[0].qty = 0; // add needs 1..99
  expect(rules(violations(d))).toContain('V6:S1');
  const e = base();
  e.steps[3].qty = 1; // remove takes no qty
  expect(rules(violations(e))).toContain('V6:S4');
  const f = base();
  f.steps.unshift({ id: 'S0', do: 'remove', product: 'A', cart_after: {} }); // line must exist
  expect(rules(violations(f))).toContain('V6:S0');
  const g = base();
  g.steps[2].qty = 100;
  expect(rules(violations(g))).toContain('V6:S3');
});

test('V7: check names a missing step; empty check list', () => {
  const d = base();
  d.check = ['S2', 'S9'];
  expect(rules(violations(d))).toContain('V7');
  const e = base();
  e.check = [];
  expect(rules(violations(e))).toContain('V7');
  const f = base();
  f.check = 'last-step';
  const r = validateScenario(f, 's');
  expect(r.ok && r.scenario.checkpoints).toEqual(['S4']);
});

test('V8: the state counts, not the step argument', () => {
  const d = parse(`
id: s
title: T
app: toolshop
status: draft
request: "r"
products: { A: { pick: first-available } }
steps:
  - { id: S1, do: add, product: A, qty: 60, cart_after: { A: 60 } }
  - { id: S2, do: add, product: A, qty: 60, cart_after: { A: 120 } }
check: each-step
`);
  expect(rules(violations(d))).toEqual(['V8:S2']);
});
