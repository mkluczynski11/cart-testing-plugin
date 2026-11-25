// Unit tests of support/core/compiler.ts: the file shape of design 8.4 and the compile contract of 6.1.
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { compileBody, compileScenario, inspectTestFile, needQty } from '../support/core/compiler';
import { scenarioHash } from '../support/core/scenario';
import { dataOf, scenario, STEPS, yaml } from './helpers';

const FIXTURES = path.join(__dirname, '..', 'support', 'harness', 'fixtures');
const golden = () => fs.readFileSync(path.join(FIXTURES, 'golden', 'reference.spec.txt'), 'utf8');
const reference = () => ({ s: scenario({}), hash: scenarioHash(dataOf(yaml({}))) });

test('the reference scenario compiles to the golden file byte for byte', () => {
  const { s } = reference();
  expect(compileBody(s)).toBe(golden());
});
test('two compilations give the same bytes', () => {
  const { s, hash } = reference();
  expect(compileScenario(s, hash)).toBe(compileScenario(s, hash));
});
test('needQty is the largest state of the product, not the largest step argument', () => {
  const s = scenario({ products: '\n  A: { pick: first-available }', steps: STEPS('{ id: S1, do: add, product: A, qty: 2, cart_after: { A: 2 } }', '{ id: S2, do: add, product: A, qty: 2, cart_after: { A: 4 } }') });
  expect(needQty(s, 'A')).toBe(4);
});
test('a by-name product is reserved in test.use', () => {
  const s = scenario({ products: '\n  A: { pick: by-name, name: "Green Lamp" }\n  B: { pick: first-available }' });
  expect(compileBody(s)).toContain("reserved: ['Green Lamp']");
});
test('a where filter becomes a filter of the pick', () => {
  const s = scenario({ products: '\n  A: { pick: first-available, where: { energy_class: [A, B] } }\n  B: { pick: next-available, distinct_from: [A] }' });
  expect(compileBody(s)).toContain("filters: { needQty: 3, where: { energy_class: ['A', 'B'] } }");
});
test('a compiled file is recognised as untouched', () => {
  const { s, hash } = reference();
  expect(inspectTestFile(compileScenario(s, hash)).untouched).toBe(true);
});
test('a hand edit is recognised by the body hash', () => {
  const { s, hash } = reference();
  expect(inspectTestFile(compileScenario(s, hash).replace("  await shopper.checkTotal('S3');\n", '')).untouched).toBe(false);
});
test('the checkpoints follow the check field', () => {
  const s = scenario({ check: '[S2, S4]' });
  expect(compileBody(s).match(/checkTotal/g)?.length).toBe(2);
});
