// Rules file of the selftest's reference app: one discount on a share of units, as order A's selftest used it.
// Implements design 9.2 for the app `reference` that selftest workspaces test (10.8).
import type { PricingRule, PurchaseConstraint, SummaryLabels } from '../../core/pricing';

const FIXTURE = { source: 'tester', ref: 'selftest fixture', live: 'unconfirmed' } as const;

export const summary: SummaryLabels = { total: { label: /^total\b/i }, subtotal: { label: /^subtotal\b/i }, provenance: FIXTURE };

export const rules: PricingRule[] = [
  {
    id: 'green-discount',
    label: /green/i,
    when: { shareOfUnits: { where: { energy_class: ['A', 'B'] }, above: '0.5' } },
    amount: { percentOf: 'running', rate: '5' },
    provenance: FIXTURE,
  },
];

export const constraints: PurchaseConstraint[] = [{ id: 'line-max', maxQty: 99, provenance: FIXTURE }];
