// Rules file of the control page (app `control`): the same 10% rule its server computes in plain code.
// Implements design 9.2 for order N, 6.7; the oracle's rule code is checked against the server's.
import type { PricingRule, PurchaseConstraint, SummaryLabels } from '../../core/pricing';

const PAGE = { source: 'tester', ref: 'support/harness/control-app/server.ts', live: 'confirmed' } as const;

export const summary: SummaryLabels = { total: { label: /^summe$/i }, subtotal: { label: /^zwischensumme$/i }, provenance: PAGE };

export const rules: PricingRule[] = [
  { id: 'rabatt', label: /^rabatt$/i, when: { subtotalAtLeast: '50.00' }, amount: { percentOf: 'subtotal', rate: '10' }, provenance: PAGE },
];

export const constraints: PurchaseConstraint[] = [{ id: 'line-max', maxQty: 99, provenance: PAGE }];
