// Live controls of gate G4: faults injected into the live page without using the driver's locators.
// Implements design 10.6 and order N, 6.6. skew-total finds the total row by its label from the rules file;
// the network controls use the driver's data-only request bindings.
import type { Page, Route } from '@playwright/test';
import { add, decimalText, fromDecimal, type AmountFormat } from './money';
import type { LiveControls } from './types';

export const CONTROLS = ['skew-total', 'drift-price', 'lost-update', 'lost-remove'] as const;
export type ControlName = (typeof CONTROLS)[number];

/** What skew-total leaves on window.__qaControl; the checkpoint copies it into its record. */
export type SkewState = { activated: boolean; label: string | null; rowHtml: string | null; shown: string[] };

/** What a network control recorded: the requests it answered or changed, and for drift-price how many it raised. */
export type NetworkLog = { control: ControlName; binding: string | null; intercepted: string[]; raised: number };

/** The binding a network control needs, or null when the driver has none (lower coverage). */
export function bindingOf(name: ControlName, controls: LiveControls): { method: string; urlPattern: string; pricePath?: string } | null {
  if (name === 'lost-update') return controls.setQuantity ?? null;
  if (name === 'lost-remove') return controls.remove ?? null;
  if (name === 'drift-price') return controls.cart?.pricePath ? controls.cart : null;
  return null;
}

type SkewArgs = { source: string; flags: string; symbol: string; decimal: string; group: string };

/** Runs in the page: keep the amount of the row labelled as the total one cent higher, after every render. */
function skewTotal(a: SkewArgs): void {
  const label = new RegExp(a.source, a.flags);
  const state: SkewState = { activated: false, label: null, rowHtml: null, shown: [] };
  (window as unknown as { __qaControl: SkewState }).__qaControl = state;
  const written = new WeakMap<Text, string>();
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const number = new RegExp(`\\d{1,3}(?:${esc(a.group)}\\d{3})+${esc(a.decimal)}\\d{2}|\\d+${esc(a.decimal)}\\d{2}`);
  const isAmount = (t: string) => t.includes(a.symbol) && number.test(t);
  const amountNodes = (row: Element): Text[] => {
    const out: Text[] = [];
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (isAmount((n as Text).data)) out.push(n as Text);
    return out;
  };
  const bump = (text: string): string => text.replace(number, (m) => {
    const digits = m.split(a.group).join('').split(a.decimal).join('');
    const cents = BigInt(digits) + 1n;
    const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, a.group);
    return `${whole}${a.decimal}${(cents % 100n).toString().padStart(2, '0')}`;
  });
  const apply = () => {
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (el.children.length > 0 || el.closest('th, thead') || !label.test((el.textContent ?? '').trim())) continue;
      const row = el.closest('tr') ?? el.closest('dl > div') ?? el.closest('li') ?? el.parentElement;
      if (!row) continue;
      const nodes = amountNodes(row);
      if (nodes.length !== 1) continue;
      const node = nodes[0];
      if (written.get(node) === node.data) return;
      node.data = bump(node.data);
      written.set(node, node.data);
      state.activated = true;
      state.label = (el.textContent ?? '').trim();
      state.rowHtml = row.outerHTML.slice(0, 300);
      state.shown.push(node.data.trim());
      return;
    }
  };
  new MutationObserver(apply).observe(document, { subtree: true, childList: true, characterData: true });
  document.addEventListener('DOMContentLoaded', apply);
}

/** Raise the price at a dotted path (e.g. cart_items.0.product.price) by one cent, exactly. */
export function raiseAt(body: unknown, pricePath: string, fmt: AmountFormat): boolean {
  const keys = pricePath.split('.');
  let node = body as Record<string, unknown> | undefined;
  for (const k of keys.slice(0, -1)) node = node?.[k] as Record<string, unknown> | undefined;
  const last = keys[keys.length - 1];
  const value = node?.[last];
  if (node === undefined || (typeof value !== 'number' && typeof value !== 'string')) return false;
  const raised = decimalText(add(fromDecimal(String(value), fmt.currency), fromDecimal('0.01', fmt.currency)));
  node[last] = typeof value === 'number' ? Number(raised) : raised;
  return true;
}

/** Install one control on a fresh page. Returns the log of a network control (null for skew-total). */
export async function installControl(page: Page, name: ControlName, opts: { controls: LiveControls; totalLabel: RegExp; fmt: AmountFormat }): Promise<NetworkLog> {
  const log: NetworkLog = { control: name, binding: null, intercepted: [], raised: 0 };
  if (name === 'skew-total') {
    const { source, flags } = opts.totalLabel;
    await page.addInitScript(skewTotal, { source, flags, symbol: opts.fmt.symbol, decimal: opts.fmt.decimal, group: opts.fmt.group });
    return log;
  }
  const binding = bindingOf(name, opts.controls);
  if (!binding) return log;
  log.binding = `${binding.method} ${binding.urlPattern}`;
  await page.route(binding.urlPattern, async (route: Route) => {
    const req = route.request();
    if (req.method() !== binding.method) return route.fallback();
    log.intercepted.push(`${req.method()} ${new URL(req.url()).pathname}`);
    if (name !== 'drift-price') {
      // A success that was never executed: the status and body shape of an acknowledged change.
      return req.method() === 'DELETE' ? route.fulfill({ status: 204, body: '' }) : route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    const response = await route.fetch();
    const json = await response.json() as unknown;
    if (raiseAt(json, binding.pricePath as string, opts.fmt)) log.raised++;
    return route.fulfill({ response, json });
  });
  return log;
}
