// Summary labels, pricing rules and purchase constraints of the Toolshop cart, as data.
// Implements design 9.2 for the app `toolshop`; evidence in docs/toolshop-facts.md (H1, H6).
import type { PricingRule, PurchaseConstraint, SummaryLabels } from '../support/core/pricing';

export const summary: SummaryLabels = {
  total: { label: /^total\b/i },
  subtotal: { label: /^subtotal\b/i },
  provenance: { source: 'observed', ref: 'docs/toolshop-facts.md#h6, 2026-11-25', live: 'confirmed' },
};

export const rules: PricingRule[] = [
  {
    id: 'eco-discount',
    label: /eco/i,
    when: { shareOfUnits: { where: { co2_rating: ['A', 'B'] }, above: '0.5' } },
    amount: { percentOf: 'running', rate: '5' },
    provenance: { source: 'observed', ref: 'docs/toolshop-facts.md#h1, 2026-11-25; cart.component.ts @ae7caec', live: 'confirmed' },
  },
];

export const constraints: PurchaseConstraint[] = [
  { id: 'line-max', maxQty: 99, provenance: { source: 'code', ref: 'cart.component.ts @ae7caec', live: 'unconfirmed' } },
  { id: 'single-unit', match: { name: 'Thor Hammer' }, maxQty: 1, provenance: { source: 'code', ref: 'CartService.php @ae7caec', live: 'unconfirmed' } },
];
