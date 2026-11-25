# contracts: the driver

The driver `app/<app>.driver.ts` is the only place with locators. It performs actions through the UI and returns what
the page displays; it makes no decisions. It exports `createDriver: DriverFactory`. The types below are quoted from
`support/core/types.ts`; `scripts/check-contracts.mjs` in the plugin fails when they differ.

<!-- types.ts:begin -->
```ts
import type { Page } from '@playwright/test';

export type CurrencyCode = 'USD' | 'EUR';

/** An exact amount: a fraction of integers with a currency. Never a float (9.3). */
export type Money = { numerator: bigint; denominator: bigint; currency: CurrencyCode };

/** An amount together with the text exactly as the page showed it. */
export type Displayed = { value: Money; rawText: string };

/** A summary amount with the label of the row it was read from. */
export type SummaryRow = Displayed & { label: string };

export type ProductFacts = {
  name: string;
  unitPrice: Money;   // the selling price in force, after promotion
  listPrice?: Money;  // the price before promotion, if the page shows it
  inStock: boolean;
  attrs: Record<string, string>;
};

export type CartLine = { name: string; qty: number; unitPrice: Displayed; lineTotal: Displayed };

export type CartView =
  | { empty: true; emptyMessage: string; total?: SummaryRow }
  | { empty: false; lines: CartLine[]; adjustments: SummaryRow[]; subtotal?: SummaryRow; total: SummaryRow };

/** A request the live controls intercept (10.6): data only, never code. */
export type RequestBinding = { method: string; urlPattern: string };

/** Request bindings for the network controls; `pricePath` points at a line's price in the cart response. */
export type LiveControls = {
  setQuantity?: RequestBinding;
  remove?: RequestBinding;
  cart?: RequestBinding & { pricePath?: string };
};

export interface CartDriver {
  candidates(): AsyncIterable<string>;                       // product names in listing order
  productFacts(name: string): Promise<ProductFacts>;         // product page
  addProduct(name: string, qty: number): Promise<void>;      // resolves on the application's acknowledgment
  setQuantity(name: string, qty: number): Promise<void>;
  remove(name: string): Promise<void>;
  readCart(): Promise<CartView>;                             // what the cart displays
  setAttribute?(key: string, value: string): Promise<void>;  // extension point, e.g. a coupon code
  apiPrice?(name: string): Promise<Money>;                   // only with price_source: api
  controls: LiveControls;                                    // request bindings for the live controls
  provides: { attrs: string[] };                             // product attributes the driver reads
}

/** What every app/<app>.driver.ts exports as `createDriver`. */
export type DriverOptions = { actionMs: number; baseURL: string };
export type DriverFactory = (page: Page, options: DriverOptions) => CartDriver;

export type ProductRef = { name: string };
export type ProductFilters = { needQty?: number; where?: Record<string, string[]> };
export type ProductPick =
  | { pick: 'first-available'; filters?: ProductFilters }
  | { pick: 'next-available'; distinctFrom: ProductRef[]; filters?: ProductFilters }
  | { pick: 'by-name'; name: string };
```
<!-- types.ts:end -->

## Driver rules

- **Acknowledgment, not result.** An action returns after the application's acknowledgment visible in the DOM (a
  notification, an updated counter), never after the expected cart state: the library polls the cart up to
  `settleMs` for that. A finished HTTP request may be an extra condition, never the only one. No fixed waits.
- **`readCart`** waits until the cart table or the empty-cart message is visible, then returns the matching variant of
  `CartView`. An empty cart is a state, not an error; if it shows a total, return it, otherwise leave `total` out.
- **Raw text.** Every amount comes with the exact text the page showed (`rawText`); the library parses it.
- **Summary rows.** Read a row's label and amount from one row element, never from two locators. The checkpoint
  compares the label with `summary` of the rules file.
- **Products.** `candidates()` yields names in listing order; `productFacts(name)` reads the selling price in force,
  availability and the attributes in `provides.attrs` from the product page; `addProduct(name, qty)` adds. Selection is
  done by the library, never by the driver.
- **Refusals.** A refusal by the application (a unit limit, out of stock) is `throw new PreconditionError('<verbatim
  message>')`. An element that is missing or never acknowledges is `LocatorError`; a request that gets no answer is
  `InfraError` (all from `../support/core/verdicts`).
- **Locators**, in this order: test attribute (`getByTestId`), role with name, label, a locator relative to the row
  that carries the product name. Positional CSS, CSS classes and XPath are forbidden; an unavoidable class needs a
  `// locator-exception: <reason>` comment on the same line.
- **Live control bindings.** `controls` names the requests of the quantity change, the removal and the cart read
  (`{ method, urlPattern }`, plus `pricePath` for the cart) as observed in the browser; `provides.attrs` lists the
  product attributes the driver reads.

## UI boundary (R13, checked by gate G0 and `qa-harness doctor`)

- Imports only from `@playwright/test` and `../support/core/…`.
- No `fetch`, `page.request` or `request.newContext`: everything goes through the page. The only exceptions are
  `apiPrice` with `price_source: api` and the request bindings above.
- No URL outside the application's origin; `goto` only to a path of the application or its origin.
- No action that finalizes an order; no step outside the catalog and the cart.

## Map: `app/<app>.map.md`

One section per action: the locator, why it was chosen, the completion signal, the network requests (method and URL
pattern), pitfalls observed, and the date. `app-mapper` reads it before opening the browser and updates it with every
change to the driver.
