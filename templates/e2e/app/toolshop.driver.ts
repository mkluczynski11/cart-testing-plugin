// CartDriver for Toolshop (https://practicesoftwaretesting.com).
//
// UI only: every action and read goes through the page as a shopper would. The driver makes no
// decisions and computes nothing; it performs an action, waits for the application's
// acknowledgment, and returns what the page displays. Evidence: docs/toolshop-facts.md.
//
// Requires the Playwright option `testIdAttribute: 'data-test'`.
import type { Locator, Page, Response } from '@playwright/test';
import type { CartDriver, CartLine, CartView, Displayed, ProductFacts, SummaryRow } from '../support/core/types';
import { parseMoney } from './toolshop.money-temp'; // TEMPORARY until support/core/money.ts

export type ToolshopDriverConfig = {
  /** Timeout for one action's acknowledgment and for each locator. Default 10000. */
  actionMs?: number;
};

const TOAST = {
  added: 'Product added to shopping cart.',
  updated: 'Product quantity updated.',
  deleted: 'Product deleted.',
};
const EMPTY_CART_TEXT = /the cart is empty/i;

export function createDriver(page: Page, config: ToolshopDriverConfig = {}): CartDriver {
  const actionMs = config.actionMs ?? 10_000;

  // ---------- error classification ----------

  const isTimeout = (e: unknown) => e instanceof Error && e.name === 'TimeoutError';
  const isLocatorError = (e: unknown) =>
    isTimeout(e) || (e instanceof Error && /strict mode violation/i.test(e.message));
  const firstLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0];

  /** Runs one locator interaction; a locator that finds nothing becomes a `LOCATOR:` error. */
  async function onLocator<T>(action: string, locator: Locator, fn: (l: Locator) => Promise<T>): Promise<T> {
    try {
      return await fn(locator);
    } catch (e) {
      if (isLocatorError(e)) throw new Error(`LOCATOR: ${action}: ${locator} (${firstLine(e)})`, { cause: e });
      throw e;
    }
  }

  async function navigate(action: string, path: string): Promise<void> {
    let response: Response | null;
    try {
      response = await page.goto(path, { timeout: actionMs });
    } catch (e) {
      throw new Error(`INFRA: ${action}: navigation to ${path} failed (${firstLine(e)})`, { cause: e });
    }
    if (response && !response.ok()) {
      throw new Error(`INFRA: ${action}: navigation to ${path} returned HTTP ${response.status()}`);
    }
  }

  /**
   * Performs `act` and resolves when the application acknowledged it: the action's own response
   * arrived with a success status AND the matching toast is visible. It does not wait for the
   * cart to show the result.
   */
  async function acknowledged(
    action: string,
    request: { method: string; path: RegExp },
    toastText: string,
    act: () => Promise<void>,
  ): Promise<void> {
    const responsePromise = page.waitForResponse(
      (r) => r.request().method() === request.method && request.path.test(new URL(r.url()).pathname),
      { timeout: actionMs },
    );
    responsePromise.catch(() => undefined); // handled below; avoids an unhandled rejection if `act` throws
    await act();
    let response: Response;
    try {
      response = await responsePromise;
    } catch (e) {
      throw new Error(`INFRA: ${action}: no ${request.method} ${request.path} response within ${actionMs} ms (${firstLine(e)})`, { cause: e });
    }
    if (!response.ok()) {
      const alertText = await page.getByRole('alert').allInnerTexts().catch(() => []);
      throw new Error(`REFUSED: ${action}: ${request.method} ${new URL(response.url()).pathname} returned HTTP ${response.status()}; alerts: ${JSON.stringify(alertText)}`);
    }
    const toast = page.getByRole('alert').filter({ hasText: toastText });
    await onLocator(`${action} acknowledgment`, toast, (l) => l.first().waitFor({ state: 'visible', timeout: actionMs }));
  }

  // ---------- pages ----------

  const productCards = () => page.getByTestId(/^product-[0-9A-Z]{26}$/);
  const cardByName = (name: string) =>
    productCards().filter({ has: page.getByTestId('product-name').filter({ hasText: exactText(name) }) });

  /** Opens a product page the way a shopper does: search for the name, click the matching card. */
  async function openProduct(action: string, name: string): Promise<void> {
    await navigate(action, '/');
    // The initial listing must be rendered first: a late listing response overwrites search results.
    await onLocator(action, productCards().first(), (l) => l.waitFor({ timeout: actionMs }));
    await onLocator(action, page.getByTestId('search-query'), (l) => l.fill(name, { timeout: actionMs }));
    const searched = page.waitForResponse((r) => new URL(r.url()).pathname === '/products/search', { timeout: actionMs });
    searched.catch(() => undefined);
    await onLocator(action, page.getByTestId('search-submit'), (l) => l.click({ timeout: actionMs }));
    await searched.catch((e) => {
      throw new Error(`INFRA: ${action}: no /products/search response within ${actionMs} ms (${firstLine(e)})`, { cause: e });
    });
    await onLocator(action, cardByName(name), (l) => l.click({ timeout: actionMs }));
    const heading = page.getByRole('heading', { level: 1 }).and(page.getByTestId('product-name'));
    await onLocator(action, heading.filter({ hasText: name }), (l) => l.waitFor({ timeout: actionMs }));
  }

  async function onCartPage(action: string): Promise<void> {
    if (new URL(page.url(), 'http://x').pathname !== '/checkout') await navigate(action, '/checkout');
  }

  const cartLineRow = (name: string) =>
    page.getByRole('row').filter({ has: page.getByTestId('product-title').filter({ hasText: exactText(name) }) });

  // ---------- driver ----------

  return {
    async *candidates() {
      const action = 'candidates';
      for (let pageNo = 1; ; pageNo++) {
        // Re-enter the listing on every page: the caller may have navigated away in between.
        await navigate(action, '/');
        await onLocator(action, productCards().first(), (l) => l.waitFor({ timeout: actionMs }));
        for (let p = 2; p <= pageNo; p++) {
          const button = page.getByRole('button', { name: `Page-${p}`, exact: true });
          if ((await button.count()) === 0) return; // no further page in the listing
          const firstCardBefore = await onLocator(action, productCards().first(), (l) => l.getAttribute('data-test', { timeout: actionMs }));
          await onLocator(action, button, (l) => l.click({ timeout: actionMs }));
          await onLocator(action, page.getByTestId(firstCardBefore!), (l) => l.waitFor({ state: 'detached', timeout: actionMs }));
          await onLocator(action, productCards().first(), (l) => l.waitFor({ timeout: actionMs }));
        }
        const names = await productCards().getByTestId('product-name').allInnerTexts();
        for (const name of names) yield name.trim();
      }
    },

    async productFacts(name) {
      const action = `productFacts(${JSON.stringify(name)})`;
      await openProduct(action, name);
      const heading = page.getByRole('heading', { level: 1 }).and(page.getByTestId('product-name'));
      // The heading also holds badges such as "ECO"; the name is its own text, without child elements.
      const shownName = await onLocator(action, heading, (l) =>
        l.evaluate((el) => Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').trim()));
      const priceText = await onLocator(action, page.getByTestId('unit-price'), (l) => l.innerText({ timeout: actionMs }));
      const inStock = !(await page.getByTestId('out-of-stock').isVisible());
      const attrs: Record<string, string> = {};
      const badge = page.getByTestId('co2-rating-badge');
      if ((await badge.count()) > 0) {
        // DEVIATION: the badge shows all letters A–E; only the CSS class `active` marks the rating.
        const active = badge.locator('.active');
        attrs.co2_rating = (await onLocator(action, active, (l) => l.innerText({ timeout: actionMs }))).trim();
      }
      const facts: ProductFacts = { name: shownName, unitPrice: parseMoney(priceText), inStock, attrs };
      return facts;
    },

    async addProduct(name, qty) {
      const action = `addProduct(${JSON.stringify(name)}, ${qty})`;
      await openProduct(action, name);
      await onLocator(action, page.getByTestId('quantity'), (l) => l.fill(String(qty), { timeout: actionMs }));
      await acknowledged(action, { method: 'POST', path: /^\/carts\/[^/]+$/ }, TOAST.added, () =>
        onLocator(action, page.getByTestId('add-to-cart'), (l) => l.click({ timeout: actionMs })));
    },

    async setQuantity(name, qty) {
      const action = `setQuantity(${JSON.stringify(name)}, ${qty})`;
      await onCartPage(action);
      const input = cartLineRow(name).getByTestId('product-quantity');
      await onLocator(action, input, (l) => l.fill(String(qty), { timeout: actionMs }));
      // The application reacts to `change`, which a shopper triggers by leaving the field.
      await acknowledged(action, { method: 'PUT', path: /^\/carts\/[^/]+\/product\/quantity$/ }, TOAST.updated, () =>
        onLocator(action, input, (l) => l.press('Tab', { timeout: actionMs })));
    },

    async remove(name) {
      const action = `remove(${JSON.stringify(name)})`;
      await onCartPage(action);
      // The remove button has no test attribute and no accessible name: it is the only link-styled
      // element in the product's row.
      const button = cartLineRow(name).locator('a');
      await acknowledged(action, { method: 'DELETE', path: /^\/carts\/[^/]+\/product\/[^/]+$/ }, TOAST.deleted, () =>
        onLocator(action, button, (l) => l.click({ timeout: actionMs })));
    },

    async readCart() {
      const action = 'readCart';
      await onCartPage(action);
      const emptyMessage = page.getByText(EMPTY_CART_TEXT);
      const total = page.getByTestId('cart-total');
      await onLocator(action, total.or(emptyMessage), (l) => l.first().waitFor({ timeout: actionMs }));

      // One atomic read of the page, so a re-render (e.g. the last line being removed) cannot tear
      // the variant decision from the lines or the lines from the summary.
      const snap = await page.evaluate(snapshotCart, EMPTY_CART_TEXT.source);
      if (snap.problems.length > 0) {
        throw new Error(`LOCATOR: ${action}: ${snap.problems.join('; ')} (expected ${total} in a table row, or ${emptyMessage})`);
      }
      const totalRead = snap.summary.find((r) => r.testId === 'cart-total');

      if (snap.emptyMessage !== null) {
        const view: CartView = { empty: true, emptyMessage: snap.emptyMessage };
        if (totalRead) view.total = { ...displayed(totalRead.rawText), label: totalRead.label };
        return view;
      }

      const lines: CartLine[] = snap.lines.map((l) => ({
        name: l.name,
        qty: Number(l.qty),
        unitPrice: displayed(l.unitPrice),
        lineTotal: displayed(l.lineTotal),
      }));
      const adjustments: SummaryRow[] = [];
      let subtotal: SummaryRow | undefined;
      let totalRow: SummaryRow | undefined;
      for (const row of snap.summary) {
        const value: SummaryRow = { ...displayed(row.rawText), label: row.label };
        if (row.testId === 'cart-total') totalRow = value;
        else if (row.testId === 'cart-subtotal') subtotal = value;
        else adjustments.push(value);
      }
      if (!totalRow) throw new Error(`LOCATOR: ${action}: ${total} not found in the cart table`);
      const view: CartView = { empty: false, lines, adjustments, total: totalRow };
      if (subtotal) view.subtotal = subtotal;
      return view;
    },
  };
}

// ---------- helpers ----------

function displayed(rawText: string): Displayed {
  return { value: parseMoney(rawText), rawText };
}

/** Exact visible text, tolerant of surrounding (non-breaking) whitespace. */
function exactText(text: string): RegExp {
  return new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

// The functions below run in the browser. They only read the rendered DOM, by `data-test`.

type CartSnapshot = {
  /** The empty-cart message if it is shown, otherwise null. */
  emptyMessage: string | null;
  lines: { name: string; qty: string; unitPrice: string; lineTotal: string }[];
  summary: { testId: string; rawText: string; label: string }[];
  problems: string[];
};

function snapshotCart(emptyPattern: string): CartSnapshot {
  const problems: string[] = [];
  const own = (el: Element) => Array.from(el.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').trim();
  const visible = (el: Element) => (el as HTMLElement).checkVisibility?.() ?? true;

  const emptyRe = new RegExp(emptyPattern, 'i');
  const emptyEl = Array.from(document.body.querySelectorAll('*'))
    .find((el) => el.children.length === 0 && emptyRe.test(el.textContent ?? '') && visible(el));
  const emptyMessage = emptyEl ? (emptyEl.textContent ?? '').trim() : null;

  // Summary amounts: every cart-* amount of the cart table (the header cart counter is outside it).
  const totalEl = document.querySelector('[data-test="cart-total"]');
  const table = totalEl?.closest('table') ?? null;
  if (!emptyEl && !totalEl) problems.push('neither the cart total nor the empty-cart message is shown');
  if (totalEl && !table) problems.push('[data-test="cart-total"] is not inside a table');
  const amounts = table ? Array.from(table.querySelectorAll('[data-test^="cart-"]')) : [];
  const summary = amounts.map((el) => {
    const testId = el.getAttribute('data-test')!;
    const row = el.closest('tr');
    const rawText = (el.textContent ?? '').trim();
    // The label is read from the same row as the amount: the row's other cells.
    const label = row
      ? Array.from(row.cells)
          .filter((cell) => cell !== el && !cell.contains(el))
          .map((cell) => (cell as HTMLElement).innerText.trim())
          .filter(Boolean)
          .join(' ')
      : '';
    if (!label) problems.push(`no readable label in the row of [data-test="${testId}"]`);
    return { testId, rawText, label };
  });

  const text = (root: Element, testId: string, where: string): string => {
    const el = root.querySelector(`[data-test="${testId}"]`);
    if (!el) { problems.push(`[data-test="${testId}"] missing in ${where}`); return ''; }
    return (el.textContent ?? '').trim();
  };
  const lines = !table ? [] : Array.from(table.querySelectorAll('tr'))
    .filter((tr) => tr.querySelector('[data-test="product-title"]'))
    .map((tr, i) => {
      // The title may hold badges; the name is its own text, without child elements.
      const name = own(tr.querySelector('[data-test="product-title"]')!);
      const input = tr.querySelector('[data-test="product-quantity"]') as HTMLInputElement | null;
      if (!input) problems.push(`[data-test="product-quantity"] missing in line ${i + 1}`);
      return {
        name,
        qty: input?.value ?? '',
        unitPrice: text(tr, 'product-price', `line ${i + 1}`),
        lineTotal: text(tr, 'line-price', `line ${i + 1}`),
      };
    });
  return { emptyMessage, lines, summary, problems };
}
