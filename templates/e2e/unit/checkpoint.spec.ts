import { expect, test } from '@playwright/test';
import * as reference from '../app/reference.pricing';
import type { CheckpointRecord } from '../support/core/checkpoint';
import type { DefectId } from '../support/core/defects';
import { cents } from '../support/core/money';
import { ReferenceCart, REFERENCE_CATALOG } from '../support/core/reference-cart';
import { parseScenarioText, type Scenario } from '../support/core/scenario';
import { selectProduct, Shopper } from '../support/core/shopper';
import type { CartDriver, CartView } from '../support/core/types';
import { validateScenario } from '../support/core/validator';
import { PreconditionError, QaError } from '../support/core/verdicts';

function scenario(yaml: string): Scenario {
  const r = validateScenario(parseScenarioText(`---\n${yaml}\n---\n`).data);
  if (!r.ok) throw new Error(JSON.stringify(r.violations));
  return r.scenario;
}

const REF = scenario(`
id: ref
title: T
app: toolshop
status: draft
request: r
products:
  A: { pick: first-available }
  B: { pick: next-available, distinct_from: [A] }
steps:
  - { id: S1, do: add,    product: A, qty: 1, cart_after: { A: 1 } }
  - { id: S2, do: add,    product: B, qty: 1, cart_after: { A: 1, B: 1 } }
  - { id: S3, do: setQty, product: A, qty: 3, cart_after: { A: 3, B: 1 } }
  - { id: S4, do: remove, product: B,         cart_after: { A: 3 } }
check: each-step`);

/** A driver that delegates to a cart, with some methods overridden. */
function wrap(cart: CartDriver, overrides: Partial<CartDriver>): CartDriver {
  return {
    candidates: () => cart.candidates(),
    productFacts: (n) => cart.productFacts(n),
    addProduct: (n, q) => cart.addProduct(n, q),
    setQuantity: (n, q) => cart.setQuantity(n, q),
    remove: (n) => cart.remove(n),
    readCart: () => cart.readCart(),
    ...overrides,
  };
}

/** Run the reference scenario the way the compiled test does; return the records and the error, if any. */
async function runRef(driver: CartDriver, settleMs = 0) {
  const records: CheckpointRecord[] = [];
  const s = new Shopper({ driver, pricing: reference, scenario: REF, reserved: [], pickLimit: 30, settleMs, attach: async (r) => { records.push(r); } });
  try {
    const a = await s.add({ pick: 'first-available', needQty: 3 }, 1);
    await s.checkTotal('S1');
    const b = await s.add({ pick: 'next-available', distinctFrom: [a] }, 1);
    await s.checkTotal('S2');
    await s.setQuantity(a, 3);
    await s.checkTotal('S3');
    await s.remove(b);
    await s.checkTotal('S4');
    return { records, error: undefined as QaError | undefined };
  } catch (e) {
    return { records, error: e as QaError };
  }
}

test('healthy reference cart: every checkpoint green and attached', async () => {
  const { records, error } = await runRef(new ReferenceCart({ pricing: reference }));
  expect(error).toBeUndefined();
  expect(records.map((r) => [r.step, r.result.status])).toEqual([['S1', 'green'], ['S2', 'green'], ['S3', 'green'], ['S4', 'green']]);
  expect(records[2].action).toBe('setQty A=3');
  expect(records[2].expected.total).toBe('$54.46');
});

test('mismatch message has the fixed format', async () => {
  const { error, records } = await runRef(new ReferenceCart({ pricing: reference, defect: 'total-stale-after-setqty' }));
  expect(error?.verdict).toBe('ORACLE_MISMATCH');
  expect(error?.message).toBe([
    'ORACLE_MISMATCH at S3 (setQty A=3)',
    '  field: total (row "Total")',
    '  expected: $54.46 = 3 × $14.15 + 1 × $12.01',
    '  displayed: $26.16 (raw "$26.16")',
  ].join('\n'));
  expect(records.at(-1)?.result.status).toBe('red');
});

const expectations: Array<[DefectId, string | null, string]> = [
  ['total-ignores-quantity', 'S3', 'ORACLE_MISMATCH'],
  ['total-stale-after-setqty', 'S3', 'ORACLE_MISMATCH'],
  ['total-stale-after-remove', 'S4', 'ORACLE_MISMATCH'],
  ['setqty-ignored', 'S3', 'ORACLE_MISMATCH'],
  ['remove-ignored', 'S4', 'ORACLE_MISMATCH'],
  ['remove-wrong-line', 'S4', 'ORACLE_MISMATCH'],
  ['add-replaces-quantity', null, 'PASS'],
  ['line-total-wrong', 'S3', 'ORACLE_MISMATCH'],
  ['discount-not-applied', null, 'PASS'],
  ['total-truncated', null, 'PASS'],
  ['driver-reads-subtotal', 'S1', 'LOCATOR_FAIL'],
];
for (const [defect, step, verdict] of expectations) {
  test(`defect ${defect} on the reference scenario: ${verdict}${step ? ' at ' + step : ''}`, async () => {
    const { error } = await runRef(new ReferenceCart({ pricing: reference, defect }));
    if (!step) expect(error).toBeUndefined();
    else {
      expect(error?.verdict).toBe(verdict);
      expect(error?.message).toContain(` at ${step} `);
    }
  });
}

test('an adjustment with no rule is UNMODELED_ADJUSTMENT', async () => {
  const cart = new ReferenceCart({ pricing: reference });
  const driver = wrap(cart, {
    readCart: async (): Promise<CartView> => {
      const v = await cart.readCart();
      return v.empty ? v : { ...v, adjustments: [...v.adjustments, { label: 'Coupon SAVE1', value: cents(-100), rawText: '-$1.00' }] };
    },
  });
  const { error } = await runRef(driver);
  expect(error?.verdict).toBe('UNMODELED_ADJUSTMENT');
  expect(error?.message).toMatch(/^UNMODELED_ADJUSTMENT at S1 /);
});

test('the read is retried until it settles', async () => {
  const laggy = () => {
    const cart = new ReferenceCart({ pricing: reference });
    let lagUntil = 0;
    return wrap(cart, {
      addProduct: async (n: string, q: number) => { lagUntil = Date.now() + 250; await cart.addProduct(n, q); },
      readCart: async (): Promise<CartView> => (Date.now() < lagUntil ? { empty: true, emptyMessage: 'loading' } : cart.readCart()),
    });
  };
  const fast = await runRef(laggy(), 0);
  expect(fast.error?.verdict).toBe('ORACLE_MISMATCH');
  const settled = await runRef(laggy(), 1000);
  expect(settled.error).toBeUndefined();
  expect(settled.records[0].reads).toBeGreaterThan(1);
});

test('selection skips out-of-stock, reserved, distinctFrom and too-tight constraints; respects pickLimit', async () => {
  const cart = new ReferenceCart({ pricing: reference });
  const opts = { reserved: [], pickLimit: 30, constraints: reference.constraints };
  expect(REFERENCE_CATALOG[0].inStock).toBe(false);
  expect((await selectProduct(cart, { pick: 'first-available' }, opts)).name).toBe('Claw Hammer');
  expect((await selectProduct(cart, { pick: 'first-available' }, { ...opts, reserved: ['Claw Hammer'] })).name).toBe('Combination Pliers');
  expect((await selectProduct(cart, { pick: 'next-available', distinctFrom: [{ name: 'Claw Hammer' }, { name: 'Combination Pliers' }] }, opts)).name).toBe('Wood Saw');
  const tight = [{ id: 'one', maxQty: 1, match: { name: 'Claw Hammer' } }];
  expect((await selectProduct(cart, { pick: 'first-available', needQty: 2 }, { ...opts, constraints: tight })).name).toBe('Combination Pliers');
  await expect(selectProduct(cart, { pick: 'first-available' }, { ...opts, pickLimit: 1 })).rejects.toBeInstanceOf(PreconditionError);
  await expect(selectProduct(cart, { pick: 'by-name', name: 'Bolt Cutters' }, opts)).rejects.toBeInstanceOf(PreconditionError);
});

test('empty cart after removing the only line is a green checkpoint', async () => {
  const s1 = scenario(`
id: e
title: T
app: toolshop
status: draft
request: r
products: { A: { pick: first-available } }
steps:
  - { id: S1, do: add,    product: A, qty: 1, cart_after: { A: 1 } }
  - { id: S2, do: remove, product: A,         cart_after: {} }
check: each-step`);
  const records: CheckpointRecord[] = [];
  const s = new Shopper({ driver: new ReferenceCart({ pricing: reference }), pricing: reference, scenario: s1, reserved: [], pickLimit: 30, settleMs: 0, attach: async (r) => { records.push(r); } });
  const a = await s.add({ pick: 'first-available' }, 1);
  await s.checkTotal('S1');
  await s.remove(a);
  await s.checkTotal('S2');
  expect(records[1].displayed).toMatchObject({ empty: true });
  expect(records[1].result.status).toBe('green');
});
