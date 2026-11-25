// Helpers for the unit tests: scenarios from YAML text, the reference rules and amount formats.
import { amountFormat } from '../support/core/money';
import type { PricingModule, PricingRule } from '../support/core/pricing';
import { parseScenarioText, type Scenario } from '../support/core/scenario';
import { validateScenario } from '../support/core/validator';
import * as reference from '../support/harness/fixtures/reference.pricing';

export const USD = amountFormat('en-US', 'USD');
export const EUR = amountFormat('de-DE', 'EUR');
export const REFERENCE: PricingModule = reference;
export const NO_RULES: PricingModule = { ...reference, rules: [] };
export const GREEN: PricingRule = reference.rules[0];

/** Scenario front matter with the reference steps; `patch` replaces whole fields, '' drops one. */
export function yaml(patch: Record<string, string> = {}): string {
  const fields: Record<string, string> = {
    id: 'ref', title: 'reference', app: 'reference', status: 'draft', request: '"Add two products, change one, remove the other."',
    products: '\n  A: { pick: first-available }\n  B: { pick: next-available, distinct_from: [A] }',
    steps: '\n  - { id: S1, do: add, product: A, qty: 1, cart_after: { A: 1 } }\n  - { id: S2, do: add, product: B, qty: 1, cart_after: { A: 1, B: 1 } }\n  - { id: S3, do: setQty, product: A, qty: 3, cart_after: { A: 3, B: 1 } }\n  - { id: S4, do: remove, product: B, cart_after: { A: 3 } }',
    check: 'each-step', preconditions: '[empty-cart, guest, no-geolocation]', price_source: 'ui', ...patch,
  };
  return `---\n${Object.entries(fields).filter(([, v]) => v !== '').map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n`;
}

export function dataOf(text: string): unknown {
  return parseScenarioText(text).data;
}

export function scenario(patch: Record<string, string> = {}, pricing: PricingModule = REFERENCE): Scenario {
  const r = validateScenario(dataOf(yaml(patch)), 'ref', pricing.constraints);
  if (!r.ok) throw new Error(r.violations.map((v) => `${v.rule}: ${v.message}`).join('\n'));
  return r.scenario;
}

export const STEPS = (...lines: string[]) => '\n' + lines.map((l) => `  - ${l}`).join('\n');
