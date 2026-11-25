// Shared types of the library: the application driver contract and product selection.
// Implements design 8.3 (CartDriver, ProductFacts, CartView, ProductPick) and the bindings of 10.6.
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
