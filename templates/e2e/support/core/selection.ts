// Product selection: which product an alias resolves to, decided by the library from product facts.
// Implements design 8.3 "Product selection" (candidates in listing order, filters, reserved names).
import { matchesFilter, maxQtyFor, type PurchaseConstraint } from './pricing';
import type { CartDriver, ProductFacts, ProductPick } from './types';
import { PreconditionError } from './verdicts';

export type SelectOptions = { reserved: string[]; pickLimit: number; constraints: PurchaseConstraint[] };

/** Why a candidate is dropped, or null when it qualifies. */
export function dropReason(facts: ProductFacts, needQty: number, where: Record<string, string[]> | undefined, constraints: PurchaseConstraint[]): string | null {
  if (!facts.inStock) return 'out of stock';
  const max = maxQtyFor(constraints, facts.name);
  if (max !== undefined && max < needQty) return `a purchase limit of ${max} is below the ${needQty} unit(s) the scenario needs`;
  if (where && !matchesFilter(facts.attrs, where)) return `its attributes ${JSON.stringify(facts.attrs)} do not satisfy ${JSON.stringify(where)}`;
  return null;
}

/** Resolve a pick to a product. The library never substitutes another product for a named one. */
export async function selectProduct(driver: CartDriver, pick: ProductPick, opts: SelectOptions): Promise<ProductFacts> {
  if (pick.pick === 'by-name') {
    const facts = await driver.productFacts(pick.name);
    const reason = dropReason(facts, 1, undefined, opts.constraints);
    if (reason) throw new PreconditionError(`"${pick.name}" is named by the scenario but cannot be used: ${reason}. Choose another product or wait until it is available.`);
    return facts;
  }
  const needQty = pick.filters?.needQty ?? 1;
  const excluded = new Set([...opts.reserved, ...(pick.pick === 'next-available' ? pick.distinctFrom.map((r) => r.name) : [])]);
  let seen = 0;
  for await (const name of driver.candidates()) {
    if (seen >= opts.pickLimit) break;
    seen++;
    if (excluded.has(name)) continue;
    const facts = await driver.productFacts(name);
    if (!dropReason(facts, needQty, pick.filters?.where, opts.constraints)) return facts;
  }
  const wanted = [`in stock`, `allows ${needQty} unit(s)`, ...(pick.filters?.where ? [`has ${JSON.stringify(pick.filters.where)}`] : []), 'is not excluded'];
  throw new PreconditionError(`No product among the first ${opts.pickLimit} candidates is ${wanted.join(', ')} (${pick.pick}). Raise pickLimit in qa.config.json or relax the scenario's filters.`);
}
