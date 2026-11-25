// qa-harness need <slug>: the actions, product attributes and request bindings the driver is missing.
// Implements design 6.1 (need), 8.3 (provides, needQty/where) and 10.6 (bindings, lower coverage).
import * as fs from 'node:fs';
import { files } from '../core/config';
import { ruleAttrs } from '../core/pricing';
import type { CartDriver, DriverFactory } from '../core/types';
import { loadScenario, rel, type CommandResult } from './common';

/** A page that must not be touched while the driver is only being inspected. */
const UNTOUCHABLE_PAGE = new Proxy({}, { get: (_t, key) => { throw new Error(`the driver touched page.${String(key)} while it was created; create it without using the page`); } });

/** Create the app's driver without a browser, to read its methods, `provides` and `controls`. */
export function inspectDriver(root: string, app: string): CartDriver | string {
  const file = files.driver(root, app);
  if (!fs.existsSync(file)) return `${rel(root, file)} does not exist`;
  try {
    // A dynamic require: the driver is found by the app name in qa.config.json.
    const mod = require(file) as { createDriver?: DriverFactory };
    if (typeof mod.createDriver !== 'function') return `${rel(root, file)} does not export createDriver`;
    return mod.createDriver(UNTOUCHABLE_PAGE as never, { actionMs: 1000, baseURL: '' });
  } catch (e) {
    return `${rel(root, file)} cannot be loaded: ${(e as Error).message}`;
  }
}

export function need(root: string, slug: string): CommandResult {
  const got = loadScenario(root, slug);
  if (!got.ok) return got.result;
  const { scenario: s, pricing, config } = got.loaded;
  const driver = inspectDriver(root, config.app);
  if (typeof driver === 'string') return { verdict: 'LINT_FAIL', lines: [`The driver of ${config.app} is not usable: ${driver}.`] };
  const kinds = new Set(s.steps.map((x) => x.do));
  const actions = ['candidates', 'productFacts', 'readCart', ...(kinds.has('add') ? ['addProduct'] : []), ...(kinds.has('setQty') ? ['setQuantity'] : []),
    ...(kinds.has('remove') ? ['remove'] : []), ...(s.priceSource === 'api' ? ['apiPrice'] : [])];
  const missingActions = actions.filter((a) => typeof (driver as unknown as Record<string, unknown>)[a] !== 'function');
  const wanted = new Set([...pricing.rules.flatMap(ruleAttrs), ...s.aliases.flatMap((a) => { const p = s.products[a]; return p.pick !== 'by-name' && p.where ? Object.keys(p.where) : []; })]);
  const missingAttrs = [...wanted].filter((a) => !(driver.provides?.attrs ?? []).includes(a));
  const bindings: Array<[string, boolean]> = [['setQuantity', kinds.has('setQty')], ['remove', kinds.has('remove')], ['cart', true]];
  const missingBindings = bindings.filter(([k, used]) => used && !driver.controls?.[k as keyof CartDriver['controls']]).map(([k]) => k);
  const noPricePath = driver.controls?.cart && !driver.controls.cart.pricePath;
  const lines = [
    missingActions.length ? `Missing actions: ${missingActions.join(', ')}; app-mapper adds them to ${rel(root, files.driver(root, config.app))}.` : `Actions: all ${actions.length} the scenario needs are present.`,
    missingAttrs.length ? `Missing attributes: ${missingAttrs.join(', ')}; the rules or the where filters read them, so the driver must list them in provides.attrs.` : `Attributes: ${[...wanted].join(', ') || 'none needed'}${wanted.size ? ' provided' : ''}.`,
    missingBindings.length ? `Missing request bindings: ${missingBindings.join(', ')}; the matching live controls will be reported as lower coverage.` : 'Request bindings: present for every live control the scenario can use.',
    ...(noPricePath ? ['The cart binding has no pricePath; drift-price will be reported as not bound (lower coverage).'] : []),
  ];
  return { verdict: missingActions.length || missingAttrs.length ? 'LINT_FAIL' : 'PASS', lines, data: { missingActions, missingAttrs, missingBindings } };
}
