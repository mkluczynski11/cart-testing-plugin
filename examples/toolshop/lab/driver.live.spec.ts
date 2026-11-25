// Live lab for the Toolshop CartDriver. Runs against https://practicesoftwaretesting.com.
// Records evidence under docs/evidence/driver-lab/. Asserts structure, never amounts.
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDriver } from '../app/toolshop.driver';
import { rules, summary } from '../app/toolshop.pricing';
import type { CartDriver, CartView, Displayed } from '../support/core/types';

const EVIDENCE = path.resolve(__dirname, '../../../docs/evidence/driver-lab');
const DRIVER_OPTIONS = { actionMs: 10_000, baseURL: 'https://practicesoftwaretesting.com' };
const POLL_MS = 5_000;

// ---------- helpers (lab only: the driver itself computes nothing) ----------

const json = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x), 2) + '\n';

async function save(page: Page, info: TestInfo, name: string, data: unknown) {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, `${name}.json`), json(data));
  await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true });
  fs.appendFileSync(
    path.join(EVIDENCE, 'runs.jsonl'),
    JSON.stringify({ at: new Date().toISOString(), test: info.title, repeat: info.repeatEachIndex, name, data }, (_k, x) =>
      typeof x === 'bigint' ? x.toString() : x) + '\n',
  );
}

type Expected = [name: string, qty: number][];
const linesOf = (v: CartView): Expected =>
  v.empty ? [] : v.lines.map((l) => [l.name, l.qty] as [string, number]).sort(([a], [b]) => a.localeCompare(b));
const sameLines = (v: CartView, want: Expected) =>
  JSON.stringify(linesOf(v)) === JSON.stringify([...want].sort(([a], [b]) => a.localeCompare(b)));

/** Polls readCart() until `done` holds or `ms` elapse. Returns the last view either way. */
async function poll(d: CartDriver, done: (v: CartView) => boolean, ms = POLL_MS) {
  const t0 = performance.now();
  let reads = 0;
  for (;;) {
    const view = await d.readCart();
    reads++;
    const elapsed = Math.round(performance.now() - t0);
    if (done(view)) return { view, elapsed, reads, settled: true };
    if (elapsed > ms) return { view, elapsed, reads, settled: false };
  }
}

/** First `n` in-stock candidates in listing order (stops paging as soon as it has them). */
async function firstInStock(d: CartDriver, n: number) {
  const picked: string[] = [];
  for await (const name of d.candidates()) {
    if ((await d.productFacts(name)).inStock) picked.push(name);
    if (picked.length === n) break;
  }
  expect(picked).toHaveLength(n);
  return picked;
}

function allAmounts(v: CartView): Displayed[] {
  if (v.empty) return v.total ? [v.total] : [];
  return [
    ...v.lines.flatMap((l) => [l.unitPrice, l.lineTotal]),
    ...v.adjustments, ...(v.subtotal ? [v.subtotal] : []), v.total,
  ];
}

function expectParsed(v: CartView) {
  for (const a of allAmounts(v)) {
    expect(typeof a.value.numerator, a.rawText).toBe('bigint');
    expect(a.value.denominator > 0n, a.rawText).toBe(true);
  }
}

const describe = (v: CartView) =>
  v.empty
    ? `EMPTY "${v.emptyMessage}"`
    : [
        ...v.lines.map((l) => `${l.name} x${l.qty} @ ${l.unitPrice.rawText} = ${l.lineTotal.rawText}`),
        ...(v.subtotal ? [`${v.subtotal.label}: ${v.subtotal.rawText}`] : []),
        ...v.adjustments.map((a) => `${a.label}: ${a.rawText}`),
        `${v.total.label}: ${v.total.rawText}`,
      ].join(' | ');

/** Boxes of the visible toast and of the cart elements a shopper interacts with or reads. */
async function toastOverlap(page: Page) {
  const toast = page.getByRole('alert').first();
  const toastBox = (await toast.isVisible()) ? await toast.boundingBox() : null;
  const targets = page.getByTestId(/^(product-quantity|product-price|line-price|product-title|cart-.*)$/)
    .or(page.getByRole('row').filter({ has: page.getByTestId('product-title') }).locator('a'));
  const boxes = [];
  for (const t of await targets.all()) {
    const box = await t.boundingBox();
    if (box) boxes.push({ testId: (await t.getAttribute('data-test')) ?? 'remove-button', box });
  }
  const overlaps = toastBox
    ? boxes.filter(({ box: b }) =>
        b.x < toastBox.x + toastBox.width && toastBox.x < b.x + b.width &&
        b.y < toastBox.y + toastBox.height && toastBox.y < b.y + b.height).map((b) => b.testId)
    : [];
  return { toastText: toastBox ? (await toast.innerText()).trim() : null, toastBox, overlaps };
}

const dataTestInventory = (page: Page) =>
  page.evaluate(() => [...new Set(Array.from(document.querySelectorAll('[data-test]'))
    .map((e) => e.getAttribute('data-test')!.replace(/[0-9A-Z]{26}$/, '<id>')))]);

// ---------- tests ----------

test('1. reference sequence S1–S4 on the first two in-stock products', async ({ page }, info) => {
  const d = createDriver(page, DRIVER_OPTIONS);
  const [A, B] = await firstInStock(d, 2);

  // H3 evidence: the product page of A.
  const factsA = await d.productFacts(A);
  await save(page, info, 'H3-product-page', { facts: factsA, dataTest: await dataTestInventory(page) });

  const steps: { n: number; label: string; act: () => Promise<void>; want: Expected }[] = [
    { n: 1, label: `add ${A} 1`, act: () => d.addProduct(A, 1), want: [[A, 1]] },
    { n: 2, label: `add ${B} 1`, act: () => d.addProduct(B, 1), want: [[A, 1], [B, 1]] },
    { n: 3, label: `set ${A} 3`, act: () => d.setQuantity(A, 3), want: [[A, 3], [B, 1]] },
    { n: 4, label: `remove ${B}`, act: () => d.remove(B), want: [[A, 3]] },
  ];
  let previousTotal: string | undefined;
  const h5 = [];
  for (const s of steps) {
    await s.act();
    const toast = await toastOverlap(page); // on the product page (add) or the cart page (set, remove)
    // Lines and quantities first; then, within the same budget, wait for the total to change from
    // the previous step, because the quantity input shows the typed value before the refetch.
    const r = await poll(d, (v) => sameLines(v, s.want) && !v.empty && v.total.rawText !== previousTotal);
    const view = r.view;
    console.log(`S${s.n} (${s.label}) settled=${r.settled} ${r.elapsed}ms: ${describe(view)}`);
    expect(linesOf(view), `S${s.n} lines`).toEqual([...s.want].sort(([a], [b]) => a.localeCompare(b)));
    expectParsed(view);
    expect(view.empty).toBe(false);
    if (!view.empty) {
      expect(view.total.label).toMatch(summary.total.label);
      previousTotal = view.total.rawText;
    }
    h5.push({ step: `S${s.n}`, action: s.label, url: new URL(page.url()).pathname, ...toast,
      afterSettle: await toastOverlap(page) });
    await save(page, info, `S${s.n}`, { step: s.label, settled: r.settled, elapsedMs: r.elapsed, view });
    if (s.n === 2) fs.writeFileSync(path.join(EVIDENCE, 'H3-cart.json'), json({ dataTest: await dataTestInventory(page) }));
  }
  fs.writeFileSync(path.join(EVIDENCE, 'H5-toasts.json'), json(h5));
});

test('2. removing the only line gives the empty variant', async ({ page }, info) => {
  const d = createDriver(page, DRIVER_OPTIONS);
  const [A] = await firstInStock(d, 1);
  await d.addProduct(A, 1);
  expect(sameLines((await poll(d, (v) => sameLines(v, [[A, 1]]))).view, [[A, 1]])).toBe(true);
  await d.remove(A);
  const r = await poll(d, (v) => v.empty);
  console.log(`H4 settled=${r.settled} ${r.elapsed}ms: ${describe(r.view)}`);
  const dom = await page.evaluate(() => ({
    tables: document.querySelectorAll('table').length,
    cartTotalElements: document.querySelectorAll('[data-test="cart-total"]').length,
  }));
  await save(page, info, 'H4-empty', { view: r.view, dom });
  expect(r.view.empty).toBe(true);
});

test('3. eco case: a cart with only Wood Saw', async ({ page }, info) => {
  const d = createDriver(page, DRIVER_OPTIONS);
  const facts = await d.productFacts('Wood Saw');
  await d.addProduct('Wood Saw', 1);
  const r = await poll(d, (v) => sameLines(v, [['Wood Saw', 1]]));
  console.log(`ECO facts=${JSON.stringify(facts.attrs)} ${facts.inStock ? 'in stock' : 'OUT OF STOCK'}: ${describe(r.view)}`);
  await save(page, info, 'H1-eco-wood-saw', { facts, settled: r.settled, view: r.view });
  expect(sameLines(r.view, [['Wood Saw', 1]])).toBe(true);
  expectParsed(r.view);
  if (!r.view.empty) {
    expect(r.view.total.label).toMatch(summary.total.label);
    if (r.view.subtotal) expect(r.view.subtotal.label).toMatch(summary.subtotal.label);
    for (const a of r.view.adjustments) expect(rules.some((rule) => rule.label.test(a.label)), a.label).toBe(true);
  }
});

test('4. adding the same product twice', async ({ page }, info) => {
  const d = createDriver(page, DRIVER_OPTIONS);
  const [A] = await firstInStock(d, 1);
  await d.addProduct(A, 1);
  await poll(d, (v) => sameLines(v, [[A, 1]]));
  await d.addProduct(A, 1);
  const r = await poll(d, (v) => !v.empty && v.lines.some((l) => l.name === A && l.qty !== 1));
  console.log(`REPEAT-ADD settled=${r.settled}: ${describe(r.view)}`);
  await save(page, info, 'repeat-add', { settled: r.settled, view: r.view });
  expect(r.view.empty).toBe(false);
});

test('5. a product that does not exist fails with LOCATOR:', async ({ page }) => {
  const d = createDriver(page, DRIVER_OPTIONS);
  const err = await d.addProduct('No Such Product 7f3c', 1).then(() => null, (e: Error) => e);
  console.log(`LOST-LOCATOR: ${err?.message.split('\n')[0]}`);
  expect(err?.message).toMatch(/^LOCATOR:/);
});

test('6. settle time after quantity change and removal', async ({ page }, info) => {
  const d = createDriver(page, DRIVER_OPTIONS);
  const [A, B] = await firstInStock(d, 2);
  await d.addProduct(A, 1);
  await poll(d, (v) => sameLines(v, [[A, 1]]));
  const SETTLE_LIMIT = 10_000; // measure beyond the 5 s budget so slow samples are still seen
  const quantity: number[] = [];
  const removal: number[] = [];
  const raw = [];

  for (let i = 0; i < 5; i++) {
    const qty = i % 2 === 0 ? 2 : 3;
    const before = await d.readCart();
    const beforeLine = before.empty ? undefined : before.lines.find((l) => l.name === A)?.lineTotal.rawText;
    await d.setQuantity(A, qty);
    const r = await poll(d, (v) => !v.empty && v.lines.some((l) => l.name === A && l.qty === qty && l.lineTotal.rawText !== beforeLine), SETTLE_LIMIT);
    raw.push({ kind: 'quantity', i, qty, ...r, view: undefined });
    expect(r.settled, `quantity sample ${i}`).toBe(true);
    quantity.push(r.elapsed);
  }
  for (let i = 0; i < 5; i++) {
    await d.addProduct(B, 1);
    await poll(d, (v) => !v.empty && v.lines.some((l) => l.name === B));
    await d.remove(B);
    const r = await poll(d, (v) => !v.empty && !v.lines.some((l) => l.name === B), SETTLE_LIMIT);
    raw.push({ kind: 'removal', i, ...r, view: undefined });
    expect(r.settled, `removal sample ${i}`).toBe(true);
    removal.push(r.elapsed);
  }
  const stats = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return { min: s[0], median: s[Math.floor(s.length / 2)], max: s[s.length - 1], samples: xs };
  };
  const result = { quantity: stats(quantity), removal: stats(removal), raw };
  console.log(`SETTLE quantity=${JSON.stringify(result.quantity)} removal=${JSON.stringify(result.removal)}`);
  await save(page, info, 'settle', result);
});
