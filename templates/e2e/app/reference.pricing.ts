// Pricing rules of the in-memory reference cart. Data only.
import type { PricingRule, PurchaseConstraint } from '../support/core/pricing';

export const summary = { total: { label: /^total\b/i }, subtotal: { label: /^subtotal\b/i } };

export const rules: PricingRule[] = [
  { id: 'eco-discount', label: /eco/i,
    when: { shareOfUnits: { where: { co2_rating: ['A', 'B'] }, above: '0.5' } },
    amount: { percentOf: 'running', rate: '5' } },
];

export const constraints: PurchaseConstraint[] = [ { id: 'line-max', maxQty: 99 } ];
