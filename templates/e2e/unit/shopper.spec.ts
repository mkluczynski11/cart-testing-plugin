// Unit tests of support/core/shopper.ts and selection.ts: product selection (design 8.3) and soft checkpoints (9.1).
import { expect, test } from '@playwright/test';
import type { CheckpointRecord } from '../support/core/checkpoint';
import { buildExample, stubCatalog } from '../support/core/example';
import { fromDecimal } from '../support/core/money';
import { deriveDefects } from '../support/core/operators';
import { ReferenceCart, type CatalogItem } from '../support/core/reference-cart';
import { selectProduct } from '../support/core/selection';
import { Shopper, type FailureRecord } from '../support/core/shopper';
import { CheckpointError, PreconditionError } from '../support/core/verdicts';
import { REFERENCE, scenario, USD } from './helpers';

const item = (name: string, over: Partial<CatalogItem> = {}): CatalogItem => ({ name, price: '10.00', inStock: true, attrs: { energy_class: 'C' }, ...over });
const cartOf = (catalog: CatalogItem[]) => new ReferenceCart({ catalog, pricing: REFERENCE, fmt: USD });
const opts = { reserved: [], pickLimit: 30, constraints: REFERENCE.constraints };

test('selection skips a product out of stock', async () => {
  expect((await selectProduct(cartOf([item('Cup', { inStock: false }), item('Mug')]), { pick: 'first-available' }, opts)).name).toBe('Mug');
});
test('selection skips a product whose attributes miss the where filter', async () => {
  const pick = { pick: 'first-available' as const, filters: { where: { energy_class: ['A'] } } };
  expect((await selectProduct(cartOf([item('Cup'), item('Mug', { attrs: { energy_class: 'A' } })]), pick, opts)).name).toBe('Mug');
});
test('selection skips a product whose purchase limit is below needQty', async () => {
  const constraints = [{ id: 'one', maxQty: 1, match: { name: 'Cup' }, provenance: REFERENCE.summary.provenance }];
  expect((await selectProduct(cartOf([item('Cup'), item('Mug')]), { pick: 'first-available', filters: { needQty: 2 } }, { ...opts, constraints })).name).toBe('Mug');
});
test('selection skips the products of distinctFrom', async () => {
  expect((await selectProduct(cartOf([item('Cup'), item('Mug')]), { pick: 'next-available', distinctFrom: [{ name: 'Cup' }] }, opts)).name).toBe('Mug');
});
test('a by-name product out of stock is a precondition failure, never a substitute', async () => {
  await expect(selectProduct(cartOf([item('Cup', { inStock: false }), item('Mug')]), { pick: 'by-name', name: 'Cup' }, opts)).rejects.toBeInstanceOf(PreconditionError);
});

test('after a red checkpoint the shopper judges the rest and fails at the end with the first mismatch', async () => {
  const s = scenario({});
  const defect = deriveDefects(s, REFERENCE.rules).find((d) => d.id === 'lost-qty');
  const driver = new ReferenceCart({ catalog: stubCatalog(s, buildExample(s, REFERENCE, USD)), pricing: REFERENCE, fmt: USD, defect });
  const records: CheckpointRecord[] = [];
  const failures: FailureRecord[] = [];
  const shopper = new Shopper({
    driver, pricing: REFERENCE, fmt: USD, rulesFile: 'app/reference.pricing.ts', reserved: [], pickLimit: 30, settleMs: 0, priceSource: 'ui',
    checkpoints: ['S1', 'S2', 'S3', 'S4'], step: (_t, body) => body(), record: async (r) => { records.push(r); }, fail: async (f) => { failures.push(f); },
  });
  const a = await shopper.add({ pick: 'first-available', filters: { needQty: 3 } }, 1);
  await shopper.checkTotal('S1');
  const b = await shopper.add({ pick: 'next-available', distinctFrom: [a] }, 1);
  await shopper.checkTotal('S2');
  await shopper.setQuantity(a, 3);
  await shopper.checkTotal('S3');
  await shopper.remove(b);
  const end = await shopper.checkTotal('S4').catch((e: unknown) => e);
  expect([records.map((r) => r.result), (end as CheckpointError).step]).toEqual([['pass', 'pass', 'fail', 'fail'], 'S3']);
});

test('with price_source api the product page price is checked against the API price', async () => {
  const driver = cartOf([item('Cup')]);
  const withApi = Object.assign(driver, { apiPrice: async () => fromDecimal('11.00', 'USD') });
  const records: CheckpointRecord[] = [];
  const shopper = new Shopper({
    driver: withApi, pricing: REFERENCE, fmt: USD, rulesFile: 'r', reserved: [], pickLimit: 30, settleMs: 0, priceSource: 'api',
    checkpoints: ['S1'], step: (_t, body) => body(), record: async (r) => { records.push(r); }, fail: async () => undefined,
  });
  await shopper.add({ pick: 'first-available' }, 1);
  const err = await shopper.checkTotal('S1').catch((e: unknown) => e);
  expect(records[0]?.message ?? String(err)).toContain('the product page and the product API disagree on the price of "Cup"');
});
