// Unit tests of the classification of a failed driver call (design 6.1 and 6.3; report V F4, report D request 6):
// a locator timeout or a call over its time limit is LOCATOR_FAIL, an unknown exception UNDETERMINED, the environment
// INFRA_FAIL; each failure record names the step and the driver method. The driver is the reference cart with one
// method replaced.
import { errors, expect, test } from '@playwright/test';
import { buildExample, stubCatalog } from '../support/core/example';
import { ReferenceCart } from '../support/core/reference-cart';
import { Shopper, type FailureRecord } from '../support/core/shopper';
import type { CartDriver } from '../support/core/types';
import { InfraError } from '../support/core/verdicts';
import { REFERENCE, scenario, USD } from './helpers';

type Broken = Partial<Pick<CartDriver, 'addProduct' | 'setQuantity' | 'remove' | 'readCart'>>;

/** Run the reference steps against a driver with `broken` methods; the first failure record, reduced to what is judged. */
async function firstFailure(broken: Broken, actionMs = 1000): Promise<{ kind: string; step: string | null; method: boolean }> {
  const s = scenario({});
  const cart = new ReferenceCart({ catalog: stubCatalog(s, buildExample(s, REFERENCE, USD)), pricing: REFERENCE, fmt: USD });
  const driver: CartDriver = Object.assign(Object.create(Object.getPrototypeOf(cart)), cart, broken);
  const failures: FailureRecord[] = [];
  const shopper = new Shopper({
    driver, pricing: REFERENCE, fmt: USD, rulesFile: 'app/reference.pricing.ts', reserved: [], pickLimit: 30, settleMs: 0, priceSource: 'ui',
    actionMs, steps: ['S1', 'S2', 'S3', 'S4'],
    checkpoints: ['S1', 'S2', 'S3', 'S4'], step: (_t, body) => body(), record: async () => undefined, fail: async (f) => { failures.push(f); },
  });
  try {
    const a = await shopper.add({ pick: 'first-available' }, 1);
    await shopper.checkTotal('S1');
    const b = await shopper.add({ pick: 'next-available', distinctFrom: [a] }, 1);
    await shopper.checkTotal('S2');
    await shopper.setQuantity(a, 3);
    await shopper.checkTotal('S3');
    await shopper.remove(b);
    await shopper.checkTotal('S4');
  } catch {
    // the failure record is what is judged
  }
  const f = failures[0];
  const name = Object.keys(broken)[0];
  return { kind: f?.kind ?? 'none', step: f?.step ?? null, method: !!f && f.message.includes(name) };
}

test('a plain exception in a driver action is UNDETERMINED, naming the step and the method', async () => {
  const addProduct = async () => { throw new Error('driver bug: cannot read properties of undefined'); };
  expect(await firstFailure({ addProduct })).toEqual({ kind: 'UNDETERMINED', step: 'S1', method: true });
});

test("Playwright's own timeout on a locator inside an action is LOCATOR_FAIL, naming the step and the method", async () => {
  const setQuantity = async () => { throw new errors.TimeoutError('locator.fill: Timeout 5000ms exceeded.'); };
  expect(await firstFailure({ setQuantity })).toEqual({ kind: 'LOCATOR_FAIL', step: 'S3', method: true });
});

test('a read that never returns is LOCATOR_FAIL at its checkpoint, naming readCart', async () => {
  test.setTimeout(5000);
  const readCart = () => new Promise<never>(() => undefined);
  expect(await firstFailure({ readCart }, 50)).toEqual({ kind: 'LOCATOR_FAIL', step: 'S1', method: true });
});

test('an action that never returns is LOCATOR_FAIL, naming the step and the method', async () => {
  test.setTimeout(5000);
  const remove = () => new Promise<never>(() => undefined);
  expect(await firstFailure({ remove }, 50)).toEqual({ kind: 'LOCATOR_FAIL', step: 'S4', method: true });
});

test("the driver's own InfraError stays INFRA_FAIL", async () => {
  const addProduct = async () => { throw new InfraError('addProduct: the application answered HTTP 503.'); };
  expect(await firstFailure({ addProduct })).toEqual({ kind: 'INFRA_FAIL', step: 'S1', method: true });
});

test('a network error inside a driver call stays INFRA_FAIL', async () => {
  const addProduct = async () => { throw new Error('page.goto: net::ERR_CONNECTION_REFUSED at https://shop.example/'); };
  expect(await firstFailure({ addProduct })).toEqual({ kind: 'INFRA_FAIL', step: 'S1', method: true });
});
