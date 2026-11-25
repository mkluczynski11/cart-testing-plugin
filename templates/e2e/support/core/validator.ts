// Scenario validation, rules V1–V8 with the numbering and meaning of design 8.1.
// Every violation becomes verdict SPEC_INVALID with the list of broken rules.
import { applyAction, checkAction, sameState, type QtyState } from './ledger';
import { maxQtyFor, type AttrFilter, type PurchaseConstraint } from './pricing';
import {
  describeState, describeStep, PRECONDITIONS,
  type Alias, type CheckSpec, type Precondition, type PriceSource, type Scenario, type ScenarioPick, type Step, type StepKind,
} from './scenario';

export type RuleId = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7' | 'V8';
export type Violation = { rule: RuleId; step?: string; message: string };
export type ValidationResult = { ok: true; scenario: Scenario } | { ok: false; violations: Violation[] };

const STEP_KINDS: StepKind[] = ['add', 'setQty', 'remove'];
const ALIAS = /^[A-Z][A-Z0-9_]*$/;
const STEP_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;
// Aliases become lower-case variable names in the compiled test.
const RESERVED = new Set(['as', 'do', 'if', 'in', 'of', 'for', 'let', 'new', 'try', 'var', 'case', 'else', 'enum',
  'null', 'this', 'true', 'void', 'with', 'await', 'break', 'catch', 'class', 'const', 'false', 'super', 'throw',
  'while', 'yield', 'test', 'shopper']);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

function readWhere(raw: unknown): AttrFilter | null {
  if (!isObject(raw) || Object.keys(raw).length === 0) return null;
  const out: AttrFilter = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!Array.isArray(v) || v.length === 0) return null;
    out[k] = v.map(String);
  }
  return out;
}

/** Validate front-matter data. `constraints` come from the app's rules file (V8). */
export function validateScenario(data: unknown, slug: string, constraints: PurchaseConstraint[]): ValidationResult {
  const out: Violation[] = [];
  const v = (rule: RuleId, message: string, step?: string) => out.push({ rule, step, message });

  // ---- V1: schema ----
  if (!isObject(data)) {
    v('V1', 'The front matter must be a YAML mapping with id, title, app, status, request, products, steps, check, preconditions and price_source.');
    return { ok: false, violations: out };
  }
  const known = ['id', 'title', 'app', 'status', 'request', 'products', 'steps', 'check', 'preconditions', 'price_source'];
  const unknown = Object.keys(data).filter((k) => !known.includes(k));
  if (unknown.length) v('V1', `Unknown field(s) ${unknown.join(', ')}; the grammar is closed, remove them.`);
  for (const f of ['id', 'title', 'app', 'request']) if (!isText(data[f])) v('V1', `Field "${f}" is required; write it as non-empty text.`);
  if (isText(data.id) && data.id !== slug) v('V1', `Field "id" is "${data.id}" but the file is specs/${slug}.md; make the id equal to the file name.`);
  if (data.status !== 'draft' && data.status !== 'confirmed') v('V1', 'Field "status" must be draft or confirmed.');
  if (data.price_source !== 'ui' && data.price_source !== 'api') v('V1', 'Field "price_source" must be ui or api.');
  const preconditions: Precondition[] = [];
  if (!Array.isArray(data.preconditions)) v('V1', `Field "preconditions" is required; list some of ${PRECONDITIONS.join(', ')}.`);
  else for (const p of data.preconditions) {
    if (PRECONDITIONS.includes(p as Precondition)) preconditions.push(p as Precondition);
    else v('V1', `Precondition "${String(p)}" is unknown; use ${PRECONDITIONS.join(', ')}.`);
  }

  const products: Record<Alias, ScenarioPick> = {};
  const aliases: Alias[] = [];
  if (!isObject(data.products) || Object.keys(data.products).length === 0) {
    v('V1', 'Field "products" is required; declare at least one alias, e.g. A: { pick: first-available }.');
  } else {
    for (const [alias, raw] of Object.entries(data.products)) {
      if (!ALIAS.test(alias) || RESERVED.has(alias.toLowerCase())) { v('V1', `Product alias "${alias}" is not allowed; use upper-case letters and digits such as A, B or P2.`); continue; }
      if (!isObject(raw) || !['first-available', 'next-available', 'by-name'].includes(String(raw.pick))) { v('V1', `Product ${alias} needs pick: first-available, next-available or by-name.`); continue; }
      const allowed = raw.pick === 'by-name' ? ['pick', 'name'] : raw.pick === 'next-available' ? ['pick', 'distinct_from', 'where'] : ['pick', 'where'];
      const extra = Object.keys(raw).filter((k) => !allowed.includes(k));
      if (extra.length) { v('V1', `Product ${alias} (${raw.pick}) does not take ${extra.join(', ')}; remove it.`); continue; }
      const where = raw.where === undefined ? undefined : readWhere(raw.where);
      if (where === null) { v('V1', `Product ${alias} has a where filter that is not a mapping of attribute to a list of values, e.g. { energy_class: [A, B] }.`); continue; }
      if (raw.pick === 'by-name') {
        if (!isText(raw.name)) { v('V1', `Product ${alias} with by-name needs name: "<product name>".`); continue; }
        products[alias] = { pick: 'by-name', name: raw.name };
      } else if (raw.pick === 'next-available') {
        const df = raw.distinct_from;
        if (!Array.isArray(df) || df.length === 0 || !df.every((x) => typeof x === 'string')) { v('V1', `Product ${alias} with next-available needs distinct_from: a list of earlier aliases.`); continue; }
        products[alias] = { pick: 'next-available', distinctFrom: df as string[], ...(where ? { where } : {}) };
      } else {
        products[alias] = { pick: 'first-available', ...(where ? { where } : {}) };
      }
      aliases.push(alias);
    }
  }

  const steps: Step[] = [];
  const stepIds = new Set<string>();
  if (!Array.isArray(data.steps) || data.steps.length === 0) v('V1', 'Field "steps" is required; list at least one step.');
  else data.steps.forEach((raw, i) => {
    if (!isObject(raw)) { v('V1', `Step #${i + 1} must be a mapping with id, do, product and cart_after.`); return; }
    const id = raw.id;
    if (typeof id !== 'string' || !STEP_ID.test(id)) { v('V1', `Step #${i + 1} needs an id such as S${i + 1}.`); return; }
    if (stepIds.has(id)) { v('V1', `Step id ${id} is used twice; give every step a unique id.`, id); return; }
    stepIds.add(id);
    const extra = Object.keys(raw).filter((k) => !['id', 'do', 'product', 'qty', 'cart_after'].includes(k));
    if (extra.length) { v('V1', `Step ${id} has unknown field(s) ${extra.join(', ')}; remove them.`, id); return; }
    if (!STEP_KINDS.includes(raw.do as StepKind)) { v('V1', `Step ${id} has do: ${String(raw.do)}; use add, setQty or remove.`, id); return; }
    if (typeof raw.product !== 'string') { v('V1', `Step ${id} needs product: <alias>.`, id); return; }
    if (raw.do === 'remove' && raw.qty !== undefined) { v('V1', `Step ${id}: remove takes no qty; delete it.`, id); return; }
    if (raw.do !== 'remove' && !Number.isInteger(raw.qty)) { v('V1', `Step ${id} (${raw.do}) needs qty as a whole number.`, id); return; }
    if (!isObject(raw.cart_after)) { v('V1', `Step ${id} needs cart_after: the cart after the step, e.g. { A: 1 } or {}.`, id); return; }
    const cartAfter: Record<string, number> = {};
    for (const [k, q] of Object.entries(raw.cart_after)) {
      if (!Number.isInteger(q) || (q as number) < 1) { v('V1', `Step ${id} cart_after ${k}: ${String(q)} must be a whole number of at least 1; leave out products that are not in the cart.`, id); return; }
      cartAfter[k] = q as number;
    }
    steps.push({ id, do: raw.do as StepKind, product: raw.product, qty: raw.qty as number | undefined, cartAfter });
  });

  let check: CheckSpec | undefined;
  if (data.check === 'each-step' || data.check === 'last-step') check = data.check;
  else if (Array.isArray(data.check) && data.check.every((x) => typeof x === 'string')) check = data.check as string[];
  else v('V1', 'Field "check" must be each-step, last-step or a list of step ids such as [S2, S4].');
  if (out.length) return { ok: false, violations: out };

  // ---- V2: references ----
  const declared = new Set(aliases);
  const used = new Set(steps.map((s) => s.product));
  for (const s of steps) {
    if (!declared.has(s.product)) v('V2', `Step ${s.id} uses product ${s.product}, which is not declared; declare it under products or fix the alias.`, s.id);
    for (const k of Object.keys(s.cartAfter)) if (!declared.has(k)) v('V2', `Step ${s.id} cart_after names ${k}, which is not declared; use declared aliases only.`, s.id);
  }
  for (const a of aliases) if (!used.has(a)) v('V2', `Product ${a} is declared but no step uses it; remove it or add a step for it.`);
  if (out.length) return { ok: false, violations: out };

  // ---- V3: different products ----
  const addOrder = [...new Set(steps.filter((s) => s.do === 'add').map((s) => s.product))];
  const byName = new Map<string, string>();
  for (const a of aliases) {
    const p = products[a];
    if (p.pick === 'by-name') {
      const key = p.name.trim().toLowerCase();
      const other = byName.get(key);
      if (other) v('V3', `Products ${other} and ${a} both pick by-name "${p.name}"; use one alias for one product.`);
      else byName.set(key, a);
      continue;
    }
    const before = addOrder.slice(0, Math.max(0, addOrder.indexOf(a)));
    const listed = p.pick === 'next-available' ? p.distinctFrom : [];
    for (const d of listed) {
      if (!declared.has(d) || d === a || !before.includes(d)) v('V3', `Product ${a} lists ${d} in distinct_from, but ${d} is not a product added before ${a}; list only earlier aliases.`);
    }
    const missing = before.filter((d) => products[d]?.pick !== 'by-name' && !listed.includes(d));
    if (missing.length) {
      v('V3', p.pick === 'first-available'
        ? `Product ${a} is first-available but ${missing.join(', ')} is added before it; use next-available with distinct_from: [${missing.join(', ')}].`
        : `Product ${a} must list every earlier unnamed alias in distinct_from; add ${missing.join(', ')}.`);
    }
  }
  if (out.length) return { ok: false, violations: out };

  // ---- V4, V5, V6, V8: walk the steps through the step semantics ----
  let state: QtyState = new Map();
  for (const s of steps) {
    const action = { do: s.do, key: s.product, qty: s.qty };
    const bad = checkAction(state, action);
    if (bad) {
      v(bad.rule, `Step ${s.id} (${describeStep(s)}): ${bad.reason}; ${bad.rule === 'V5' ? 'remove the step or change it so the cart changes' : 'fix the step so its condition holds'}.`, s.id);
      continue;
    }
    state = applyAction(state, action);
    const computed = Object.fromEntries(state);
    if (!sameState(computed, s.cartAfter)) {
      v('V6', `Step ${s.id} (${describeStep(s)}) says cart_after ${describeState(s.cartAfter)}, but the cart then holds ${describeState(computed)}; write cart_after: ${inline(computed)}.`, s.id);
    }
    for (const [alias, q] of state) {
      const p = products[alias];
      const limit = maxQtyFor(constraints.filter((c) => !c.match || p?.pick === 'by-name'), p?.pick === 'by-name' ? p.name : '');
      if (limit !== undefined && q > limit) v('V8', `Step ${s.id} brings ${alias} to ${q}, above the purchase limit of ${limit} in the rules file; lower the quantities.`, s.id);
    }
  }

  // ---- V7: checkpoints ----
  let checkpoints: string[] = [];
  const last = steps[steps.length - 1]?.id;
  if (check === 'each-step') checkpoints = steps.map((s) => s.id);
  else if (check === 'last-step') checkpoints = last ? [last] : [];
  else if (Array.isArray(check)) {
    for (const c of check) if (!stepIds.has(c)) v('V7', `check names step ${c}, which does not exist; name existing step ids.`);
    checkpoints = steps.filter((s) => check.includes(s.id)).map((s) => s.id);
    if (last && !checkpoints.includes(last)) v('V7', `check has no checkpoint after the last step ${last}; add ${last} to the list.`);
  }
  if (out.length) return { ok: false, violations: out };

  return {
    ok: true,
    scenario: {
      id: data.id as string, title: data.title as string, app: data.app as string,
      status: data.status as 'draft' | 'confirmed', request: data.request as string,
      products, aliases, steps, check: check as CheckSpec, checkpoints, preconditions,
      priceSource: data.price_source as PriceSource,
    },
  };
}

function inline(state: Record<string, number>): string {
  const e = Object.entries(state);
  return e.length ? `{ ${e.map(([k, q]) => `${k}: ${q}`).join(', ')} }` : '{}';
}

export function formatViolations(violations: Violation[]): string[] {
  return violations.map((x) => `${x.rule}${x.step ? ` ${x.step}` : ''}: ${x.message}`);
}
