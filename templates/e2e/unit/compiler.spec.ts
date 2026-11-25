import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { compileScenario, inspectTestFile } from '../support/core/compiler';
import { parseScenarioText, scenarioHash, setStatusLine } from '../support/core/scenario';
import { validateScenario } from '../support/core/validator';

// The selftest fixture is the draft copy of specs/cart-total-add-change-remove.md.
const specFile = path.join(__dirname, '..', 'support', 'harness', 'fixtures', 'cart-total-add-change-remove.md');
const text = fs.readFileSync(specFile, 'utf8');

function scenarioOf(t: string) {
  const f = parseScenarioText(t);
  const r = validateScenario(f.data, 'cart-total-add-change-remove');
  if (!r.ok) throw new Error(JSON.stringify(r.violations));
  return { scenario: r.scenario, hash: scenarioHash(f.data) };
}

test('compiles the reference scenario to the contract pattern', () => {
  const { scenario, hash } = scenarioOf(text);
  const out = compileScenario(scenario, hash);
  expect(out).toContain(`// scenario: cart-total-add-change-remove · sha256:${hash}`);
  expect(out).toContain(`  const a = await shopper.add({ pick: 'first-available', needQty: 3 }, 1);
  await shopper.checkTotal('S1');
  const b = await shopper.add({ pick: 'next-available', distinctFrom: [a] }, 1);
  await shopper.checkTotal('S2');
  await shopper.setQuantity(a, 3);
  await shopper.checkTotal('S3');
  await shopper.remove(b);
  await shopper.checkTotal('S4');
});
`);
  expect(out).toContain(`test.use({ scenario: 'cart-total-add-change-remove', reserved: [] });`);
  expect(compileScenario(scenario, hash)).toBe(out); // deterministic
  expect(inspectTestFile(out)).toEqual({ generated: true, untouched: true, scenarioId: 'cart-total-add-change-remove', scenarioHash: hash });
});

test('a hand edit is detected by the body hash', () => {
  const { scenario, hash } = scenarioOf(text);
  const out = compileScenario(scenario, hash).replace("  await shopper.checkTotal('S3');\n", '');
  expect(inspectTestFile(out).untouched).toBe(false);
  expect(inspectTestFile('test("x")').generated).toBe(false);
});

test('the hash ignores status; confirm changes only the status line', () => {
  const confirmed = setStatusLine(text, 'confirmed');
  const before = text.split('\n');
  const after = confirmed.split('\n');
  expect(after.length).toBe(before.length);
  const changed = after.filter((l, i) => l !== before[i]);
  expect(changed).toEqual(['status: confirmed            # draft | confirmed']);
  expect(scenarioHash(parseScenarioText(confirmed).data)).toBe(scenarioHash(parseScenarioText(text).data));
  expect(scenarioHash(parseScenarioText(text.replace('qty: 3', 'qty: 4')).data)).not.toBe(scenarioHash(parseScenarioText(text).data));
});

test('second add of an alias, reserved by-name picks, checkpoints only where check says', () => {
  const t = `---
id: x
title: It's a test
app: toolshop
status: draft
request: "Add a saw twice, then something else."
products:
  A: { pick: by-name, name: "Wood Saw" }
  B: { pick: first-available }
steps:
  - { id: S1, do: add, product: A, qty: 2, cart_after: { A: 2 } }
  - { id: S2, do: add, product: A, qty: 2, cart_after: { A: 4 } }
  - { id: S3, do: add, product: B, qty: 1, cart_after: { A: 4, B: 1 } }
check: [S2]
---
`;
  const f = parseScenarioText(t);
  const r = validateScenario(f.data, 'x');
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  const out = compileScenario(r.scenario, scenarioHash(f.data));
  expect(out).toContain(`test.use({ scenario: 'x', reserved: ['Wood Saw'] });`);
  expect(out).toContain(`test('It\\'s a test', async ({ shopper }) => {`);
  expect(out).toContain(`  const a = await shopper.add({ pick: 'by-name', name: 'Wood Saw' }, 2);
  await shopper.add(a, 2);
  await shopper.checkTotal('S2');
  const b = await shopper.add({ pick: 'first-available' }, 1);
});`);
});
