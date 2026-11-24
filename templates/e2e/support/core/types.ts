export type CurrencyCode = 'USD';
export type Money = { numerator: bigint; denominator: bigint; currency: CurrencyCode }; // exact
export type Displayed = { value: Money; rawText: string };
export type SummaryRow = Displayed & { label: string }; // label of the row the amount was read from

export type ProductFacts = {
  name: string; unitPrice: Money; inStock: boolean; attrs: Record<string, string>;
};
export type CartLine = { name: string; qty: number; unitPrice: Displayed; lineTotal: Displayed };
export type CartView =
  | { empty: true; emptyMessage: string; total?: SummaryRow }
  | { empty: false; lines: CartLine[]; adjustments: SummaryRow[]; subtotal?: SummaryRow; total: SummaryRow };

export interface CartDriver {
  candidates(): AsyncIterable<string>;                    // product names in listing order
  productFacts(name: string): Promise<ProductFacts>;
  addProduct(name: string, qty: number): Promise<void>;   // resolves when the app acknowledged the action
  setQuantity(name: string, qty: number): Promise<void>;
  remove(name: string): Promise<void>;
  readCart(): Promise<CartView>;
}

export type ProductRef = { name: string };
export type ProductPick =
  | { pick: 'first-available'; needQty?: number }
  | { pick: 'next-available'; distinctFrom: ProductRef[]; needQty?: number }
  | { pick: 'by-name'; name: string };
