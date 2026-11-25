// CartDriver for Toolshop (https://practicesoftwaretesting.com), driven only through the UI.
// Implements design 8.3 (driver contract and rules) for the app `toolshop`; evidence in toolshop.map.md
// and docs/toolshop-facts.md. It performs actions, waits for the acknowledgment and reports what the page shows.
import type { Locator, Page, Response } from '@playwright/test';
import { amountFormat, parseAmount } from '../support/core/money';
import type { CartDriver, CartLine, CartView, Displayed, DriverOptions, ProductFacts, SummaryRow } from '../support/core/types';
import { InfraError, LocatorError, PreconditionError } from '../support/core/verdicts';

const TOAST = {
  added: 'Product added to shopping cart.',
  updated: 'Product quantity updated.',
  deleted: 'Product deleted.',
};
const EMPTY_CART_TEXT = /the cart is empty/i;
/** The empty message reported when the session never had a cart: the header shows no cart counter. */
const NO_CART = '(no cart: the header shows no cart counter)';

const USD = amountFormat('en-US', 'USD');

export function createDriver(page: Page, options: DriverOptions): CartDriver {
  const { actionMs } = options;

  // ---------- error classification ----------

  const isTimeout = (e: unknown) => e instanceof Error && e.name === 'TimeoutError';
  const isLocatorError = (e: unknown) =>
    isTimeout(e) || (e instanceof Error && /strict mode violation/i.test(e.message));
  const firstLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0];

  /** Runs one locator interaction; a locator that finds nothing becomes a LocatorError. */
  async function onLocator<T>(action: string, locator: Locator, fn: (l: Locator) => Promise<T>): Promise<T> {
    try {
      return await fn(locator);
    } catch (e) {
      if (isLocatorError(e)) throw new LocatorError(`${action}: ${locator} did not respond (${firstLine(e)}).`);
      throw e;
    }
  }

  async function navigate(action: string, path: string): Promise<void> {
    let response: Response | null;
    try {
      response = await page.goto(path, { timeout: actionMs });
    } catch (e) {
      throw new InfraError(`${action}: navigation to ${path} failed (${firstLine(e)}).`);
    }
    if (response && !response.ok()) {
      throw new InfraError(`${action}: navigation to ${path} returned HTTP ${response.status()}.`);
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
      throw new LocatorError(`${action}: no ${request.method} ${request.path} response within ${actionMs} ms, so the application did not acknowledge the action (${firstLine(e)}).`);
    }
    if (response.status() >= 500) {
      throw new InfraError(`${action}: ${request.method} ${new URL(response.url()).pathname} returned HTTP ${response.status()}.`);
    }
    if (!response.ok()) {
      const alertText = (await page.getByRole('alert').allInnerTexts().catch(() => [])).join(' ');
      throw new PreconditionError(`${action} was refused by the application: ${request.method} ${new URL(response.url()).pathname} returned HTTP ${response.status()}.`, alertText);
    }
    const toast = page.getByRole('alert').filter({ hasText: toastText });
    await onLocator(`${action} acknowledgment`, toast, (l) => l.first().waitFor({ state: 'visible', timeout: actionMs }));
  }

  // ---------- pages ----------

  const productCards = () => page.getByTestId(/^product-[0-9A-Z]{26}$/);
  const cardByName = (name: string) =>
    productCards().filter({ has: page.getByTestId('product-name').filter({ hasText: exactText(name) }) });

  /**
   * Opens the home page and waits for its product listing. The listing request (`QUERY /products`) must be
   * answered first: no answer is the environment (InfraError), an answer without cards is a locator problem.
   */
  async function openListing(action: string): Promise<void> {
    const listing = page.waitForResponse((r) => new URL(r.url()).pathname === '/products', { timeout: actionMs });
    listing.catch(() => undefined);
    await navigate(action, '/');
    const response = await listing.catch(() => {
      throw new InfraError(`${action}: the application's API did not answer the product listing within ${actionMs} ms.`);
    });
    if (response.status() >= 500) throw new InfraError(`${action}: the product listing answered HTTP ${response.status()}.`);
    await onLocator(action, productCards().first(), (l) => l.waitFor({ timeout: actionMs }));
  }

  /** Opens a product page the way a shopper does: search for the name, click the matching card. */
  async function openProduct(action: string, name: string): Promise<void> {
    // The initial listing must be rendered first: a late listing response overwrites search results.
    await openListing(action);
    await onLocator(action, page.getByTestId('search-query'), (l) => l.fill(name, { timeout: actionMs }));
    const searched = page.waitForResponse((r) => new URL(r.url()).pathname === '/products/search', { timeout: actionMs });
    searched.catch(() => undefined);
    await onLocator(action, page.getByTestId('search-submit'), (l) => l.click({ timeout: actionMs }));
    await searched.catch((e) => {
      throw new LocatorError(`${action}: no /products/search response within ${actionMs} ms (${firstLine(e)}).`);
    });
    await onLocator(action, cardByName(name), (l) => l.click({ timeout: actionMs }));
    const heading = page.getByRole('heading', { level: 1 }).and(page.getByTestId('product-name'));
    await onLocator(action, heading.filter({ hasText: name }), (l) => l.waitFor({ timeout: actionMs }));
  }

  /** The path of the page the browser shows; empty before the first navigation. */
  const currentPath = () => (page.url().startsWith('http') ? new URL(page.url()).pathname : '');

  async function onCartPage(action: string): Promise<void> {
    if (currentPath() !== '/checkout') await navigate(action, '/checkout');
  }

  const cartLineRow = (name: string) =>
    page.getByRole('row').filter({ has: page.getByTestId('product-title').filter({ hasText: exactText(name) }) });

  // ---------- driver ----------

  return {
    provides: { attrs: ['co2_rating'] },
    controls: {
      setQuantity: { method: 'PUT', urlPattern: '**/carts/*/product/quantity' },
      remove: { method: 'DELETE', urlPattern: '**/carts/*/product/*' },
      cart: { method: 'GET', urlPattern: '**/carts/*', pricePath: 'cart_items.0.product.price' },
    },

    async *candidates() {
      const action = 'candidates';
      for (let pageNo = 1; ; pageNo++) {
        // Re-enter the listing on every page: the caller may have navigated away in between.
        await openListing(action);
        for (let p = 2; p <= pageNo; p++) {
          const button = page.getByRole('button', { name: `Page-${p}`, exact: true });
          if ((await button.count()) === 0) return; // no further page in the listing
          const firstCardBefore = await onLocator(action, productCards().first(), (l) => l.getAttribute('data-test', { timeout: actionMs }));
          if (!firstCardBefore) throw new LocatorError(`${action}: the first product card has no data-test attribute.`);
          await onLocator(action, button, (l) => l.click({ timeout: actionMs }));
          await onLocator(action, page.getByTestId(firstCardBefore), (l) => l.waitFor({ state: 'detached', timeout: actionMs }));
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
        const active = badge.locator('.active'); // locator-exception: the badge shows all letters A–E and only the class `active` marks the rating (order N, decision 4)
        attrs.co2_rating = (await onLocator(action, active, (l) => l.innerText({ timeout: actionMs }))).trim();
      }
      // The product page shows the price without the currency symbol, which stands outside the element.
      const unitPrice = parseAmount(priceText, USD, { symbol: 'optional' });
      if (!unitPrice) throw new LocatorError(`${action}: the unit price "${priceText}" is not an amount in USD.`);
      const facts: ProductFacts = { name: shownName, unitPrice, inStock, attrs };
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
      // A session that never had a cart: /checkout then throws in the application ("cart_items" of null)
      // and may render nothing, so the header is read instead. No cart counter there means no cart.
      if (currentPath() !== '/checkout') {
        if (page.url() === 'about:blank') await navigate(action, '/');
        await onLocator(action, page.getByTestId('nav-home'), (l) => l.waitFor({ timeout: actionMs }));
        if (await page.getByTestId('nav-cart').count() === 0) return { empty: true, emptyMessage: NO_CART };
        await navigate(action, '/checkout');
      }
      const emptyMessage = page.getByText(EMPTY_CART_TEXT);
      const total = page.getByTestId('cart-total');
      await onLocator(action, total.or(emptyMessage), (l) => l.first().waitFor({ timeout: actionMs }));

      // One atomic read of the page, so a re-render (e.g. the last line being removed) cannot tear
      // the variant decision from the lines or the lines from the summary.
      const snap = await page.evaluate(snapshotCart, EMPTY_CART_TEXT.source);
      if (snap.problems.length > 0) {
        throw new LocatorError(`${action}: ${snap.problems.join('; ')} (expected ${total} in a table row, or ${emptyMessage}).`);
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
      if (!totalRow) throw new LocatorError(`${action}: ${total} was not found in the cart table.`);
      const view: CartView = { empty: false, lines, adjustments, total: totalRow };
      if (subtotal) view.subtotal = subtotal;
      return view;
    },
  };
}

// ---------- helpers ----------

/** The amount with its raw text; a text that is not an amount is a read error (design 9.3). */
function displayed(rawText: string): Displayed {
  const value = parseAmount(rawText, USD);
  if (!value) throw new LocatorError(`readCart: "${rawText}" is not an amount in USD.`);
  return { value, rawText };
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
    const testId = el.getAttribute('data-test') as string; // the selector matched on this attribute
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
      const name = own(tr.querySelector('[data-test="product-title"]') as Element); // the row was chosen for having it
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
