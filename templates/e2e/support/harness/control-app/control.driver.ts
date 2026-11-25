// CartDriver for the control page (app `control`), the selftest's second application.
// Implements design 8.3 for order N, 6.7. selftest copies it to <root>/app/ and points the core imports there.
import type { Page, Response } from '@playwright/test';
import { amountFormat, parseAmount } from '../../core/money';
import type { CartDriver, CartView, Displayed, DriverOptions, SummaryRow } from '../../core/types';
import { InfraError, LocatorError, PreconditionError } from '../../core/verdicts';

const EUR = amountFormat('de-DE', 'EUR');

type Snapshot = {
  emptyMessage: string | null;
  lines: Array<{ name: string; qty: string; unitPrice: string; lineTotal: string }>;
  rows: Array<{ label: string; role: string; rawText: string }>;
};

/** Runs in the browser: one read of the cart list and the summary groups. */
function snapshot(): Snapshot {
  const text = (root: Element, qa: string) => (root.querySelector(`[data-qa="${qa}"]`)?.textContent ?? '').trim();
  const empty = document.querySelector('[data-qa="cart-empty"]') as HTMLElement | null;
  return {
    emptyMessage: empty && !empty.hidden ? (empty.textContent ?? '').trim() : null,
    lines: Array.from(document.querySelectorAll('[data-qa="cart-line"]')).map((li) => ({
      name: text(li, 'line-name'),
      qty: (li.querySelector('[data-qa="line-qty"]') as HTMLInputElement | null)?.value ?? '',
      unitPrice: text(li, 'line-price'),
      lineTotal: text(li, 'line-total'),
    })),
    rows: Array.from(document.querySelectorAll('[data-qa="summary-row"]')).map((row) => ({
      label: (row.querySelector('dt')?.textContent ?? '').trim(),
      role: row.querySelector('dd')?.getAttribute('data-qa') ?? '',
      rawText: (row.querySelector('dd')?.textContent ?? '').trim(),
    })),
  };
}

export function displayed(rawText: string): Displayed {
  const value = parseAmount(rawText, EUR);
  if (!value) throw new LocatorError(`readCart: "${rawText}" is not an amount in EUR.`);
  return { value, rawText };
}

/** The cart view from one snapshot; every summary amount keeps the label of its own group. */
export function viewOf(s: Snapshot): CartView {
  const row = (r: Snapshot['rows'][number]): SummaryRow => ({ ...displayed(r.rawText), label: r.label });
  const total = s.rows.find((r) => r.role === 'total');
  if (!total) throw new LocatorError('readCart: the summary has no total group.');
  if (s.emptyMessage !== null) return { empty: true, emptyMessage: s.emptyMessage, total: row(total) };
  const subtotal = s.rows.find((r) => r.role === 'subtotal');
  return {
    empty: false,
    lines: s.lines.map((l) => ({ name: l.name, qty: Number(l.qty), unitPrice: displayed(l.unitPrice), lineTotal: displayed(l.lineTotal) })),
    adjustments: s.rows.filter((r) => r.role === 'adjustment').map(row),
    ...(subtotal ? { subtotal: row(subtotal) } : {}),
    total: row(total),
  };
}

export function createDriver(page: Page, options: DriverOptions): CartDriver {
  const { actionMs } = options;
  const productRow = (name: string) => page.getByTestId('product').filter({ has: page.getByTestId('product-name').getByText(name, { exact: true }) });
  const lineRow = (name: string) => page.getByTestId('cart-line').filter({ has: page.getByTestId('line-name').getByText(name, { exact: true }) });
  const status = () => page.getByTestId('status');

  async function home(action: string): Promise<void> {
    if (!page.url().startsWith(options.baseURL)) {
      let response: Response | null;
      try {
        response = await page.goto('/', { timeout: actionMs });
      } catch (e) {
        throw new InfraError(`${action}: the control page did not load (${(e as Error).message.split('\n')[0]}).`);
      }
      if (!response?.ok()) throw new InfraError(`${action}: the control page answered HTTP ${response?.status()}.`);
    }
    try {
      await page.getByTestId('summary').getByTestId('total').waitFor({ timeout: actionMs });
      await page.getByTestId('product').first().waitFor({ timeout: actionMs });
    } catch {
      throw new LocatorError(`${action}: the product list or the summary total did not appear within ${actionMs} ms.`);
    }
  }

  /** Perform `act`; resolve on the action's 2xx response and a new status message matching `message`. */
  async function acknowledged(action: string, method: string, path: RegExp, message: RegExp, act: () => Promise<void>): Promise<void> {
    const before = (await status().textContent()) ?? '';
    const response = page.waitForResponse((r) => r.request().method() === method && path.test(new URL(r.url()).pathname), { timeout: actionMs });
    response.catch(() => undefined);
    await act();
    let r: Response;
    try {
      r = await response;
    } catch {
      throw new LocatorError(`${action}: no ${method} response within ${actionMs} ms, so the page did not acknowledge the action.`);
    }
    if (r.status() >= 500) throw new InfraError(`${action}: ${method} ${new URL(r.url()).pathname} answered HTTP ${r.status()}.`);
    const changed = page.waitForFunction(([was]) => {
      const now = document.querySelector('[data-qa="status"]')?.textContent ?? '';
      return now !== was && now.length > 0;
    }, [before], { timeout: actionMs });
    await changed.catch(() => { throw new LocatorError(`${action}: the status region did not change within ${actionMs} ms.`); });
    const text = (await status().textContent()) ?? '';
    if (!r.ok()) throw new PreconditionError(`${action} was refused by the application (HTTP ${r.status()}).`, text);
    if (!message.test(text)) throw new LocatorError(`${action}: the status says "${text}", not the expected acknowledgment.`);
  }

  return {
    provides: { attrs: [] },
    controls: {
      setQuantity: { method: 'PUT', urlPattern: '**/api/cart/items/*' },
      remove: { method: 'DELETE', urlPattern: '**/api/cart/items/*' },
      cart: { method: 'GET', urlPattern: '**/api/cart', pricePath: 'items.0.price' },
    },

    async *candidates() {
      await home('candidates');
      for (const name of await page.getByTestId('product-name').allTextContents()) yield name.trim();
    },

    async productFacts(name) {
      const action = `productFacts(${JSON.stringify(name)})`;
      await home(action);
      const row = productRow(name);
      if ((await row.count()) !== 1) throw new PreconditionError(`${action}: the shop lists ${await row.count()} products named "${name}".`, name);
      const priceText = ((await row.getByTestId('product-price').textContent()) ?? '').trim();
      const unitPrice = parseAmount(priceText, EUR);
      if (!unitPrice) throw new LocatorError(`${action}: the price "${priceText}" is not an amount in EUR.`);
      const stock = ((await row.getByTestId('product-stock').textContent()) ?? '').trim();
      return { name, unitPrice, inStock: stock !== 'nicht vorrätig', attrs: {} };
    },

    async addProduct(name, qty) {
      const action = `addProduct(${JSON.stringify(name)}, ${qty})`;
      await home(action);
      const row = productRow(name);
      await row.getByTestId('product-qty').fill(String(qty), { timeout: actionMs });
      await acknowledged(action, 'POST', /^\/api\/cart\/items$/, /^Hinzugefügt/, () => row.getByTestId('product-add').click({ timeout: actionMs }));
    },

    async setQuantity(name, qty) {
      const action = `setQuantity(${JSON.stringify(name)}, ${qty})`;
      await home(action);
      const input = lineRow(name).getByTestId('line-qty');
      await input.fill(String(qty), { timeout: actionMs });
      await acknowledged(action, 'PUT', /^\/api\/cart\/items\/[a-z0-9]+$/, /^Menge geändert/, () => input.press('Tab', { timeout: actionMs }));
    },

    async remove(name) {
      const action = `remove(${JSON.stringify(name)})`;
      await home(action);
      await acknowledged(action, 'DELETE', /^\/api\/cart\/items\/[a-z0-9]+$/, /^Entfernt/, () => lineRow(name).getByTestId('line-remove').click({ timeout: actionMs }));
    },

    async readCart() {
      await home('readCart');
      return viewOf(await page.evaluate(snapshot));
    },
  };
}
