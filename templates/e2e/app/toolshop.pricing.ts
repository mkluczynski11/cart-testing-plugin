// Summary rows and pricing rules of the live Toolshop cart, as observed in a browser.
// Data only. Evidence: docs/toolshop-facts.md.

export const summary = {
  total:    { label: /^total\b/i },
  subtotal: { label: /^subtotal\b/i },
  provenance: { source: 'live', date: '2026-11-25', ref: 'docs/toolshop-facts.md#h6' },
};

export const rules = [
  { id: 'eco-discount', label: /eco/i,
    when: { shareOfUnits: { where: { co2_rating: ['A', 'B'] }, above: '0.5' } },
    amount: { percentOf: 'running', rate: '5' },
    provenance: { source: 'live', date: '2026-11-25', ref: 'docs/toolshop-facts.md#h1' } },
];

export const constraints = [
  { id: 'line-max', maxQty: 99, provenance: { source: 'code', ref: 'cart.component.ts @ae7caec' } },
  { id: 'single-unit', match: { name: 'Thor Hammer' }, maxQty: 1, provenance: { source: 'code', ref: 'ae7caec' } },
];
