// Scenario validation, rules V1-V8. Every violation becomes verdict SPEC_INVALID.
import { applyAction, checkAction, describeState, MAX_QTY, sameState, stateToObject, type QtyState } from './ledger';
import type { Alias, CheckSpec, Scenario, ScenarioPick, Step, StepKind } from './scenario';

export type RuleId = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7' | 'V8';
export type Violation = { rule: RuleId; step?: string; message: string };
export type ValidationResult = { ok: true; scenario: Scenario } | { ok: false; violations: Violation[] };

const STEP_KINDS: StepKind[] = ['add', 'setQty', 'remove'];
const PICKS = ['first-available', 'next-available', 'by-name'];
const ALIAS = /^[A-Z][A-Z0-9_]*$/;
const STEP_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;
// Aliases become lower-case variable names in the compiled test.
const RESERVED_WORDS = new Set([
  'as', 'do', 'if', 'in', 'of', 'for', 'let', 'new', 'try', 'var', 'case', 'else', 'enum', 'null', 'this',
  'true', 'void', 'with', 'await', 'break', 'catch', 'class', 'const', 'false', 'super', 'throw', 'while',
  'yield', 'delete', 'export', 'import', 'public', 'return', 'static', 'switch', 'typeof', 'default',
  'extends', 'finally', 'package', 'private', 'continue', 'debugger', 'function', 'arguments', 'interface',
  'protected', 'implements', 'instanceof', 'test', 'shopper',
]);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export function validateScenario(data: unknown, slug?: string): ValidationResult {
  const out: Violation[] = [];
  const v = (rule: RuleId, message: string, step?: string) => out.push({ rule, step, message });

  // ---- V1: schema ----
  if (!isObject(data)) {
    v('V1', 'The front matter must be a YAML mapping; write the fields id, title, app, status, request, products, steps and check.');
    return { ok: false, violations: out };
  }
  for (const f of ['id', 'title', 'app', 'request']) {
    if (!isNonEmptyString(data[f])) v('V1', `Field "${f}" is required; add it as a non-empty string.`);
  }
  if (isNonEmptyString(data.id) && slug !== undefined && data.id !== slug) {
    v('V1', `Field "id" is "${data.id}" but the file is specs/${slug}.md; make the id equal to the file name.`);
  }
  if (data.status !== 'draft' && data.status !== 'confirmed') v('V1', 'Field "status" must be draft or confirmed.');

  const products: Record<Alias, ScenarioPick> = {};
  const aliases: Alias[] = [];
  if (!isObject(data.products) || Object.keys(data.products).length === 0) {
    v('V1', 'Field "products" is required; declare at least one product alias, e.g. A: { pick: first-available }.');
  } else {
    for (const [alias, raw] of Object.entries(data.products)) {
      if (!ALIAS.test(alias) || RESERVED_WORDS.has(alias.toLowerCase())) {
        v('V1', `Product alias "${alias}" is not allowed; use upper-case letters and digits such as A, B or P2.`);
        continue;
      }
      if (!isObject(raw) || typeof raw.pick !== 'string' || !PICKS.includes(raw.pick)) {
        v('V1', `Product ${alias} needs pick: first-available, next-available or by-name.`);
        continue;
      }
      const extra = Object.keys(raw).filter((k) => !['pick', 'name', 'distinct_from'].includes(k));
      if (extra.length) { v('V1', `Product ${alias} has unknown field(s) ${extra.join(', ')}; remove them.`); continue; }
      if (raw.pick === 'first-available') {
        if (raw.name !== undefined || raw.distinct_from !== undefined) { v('V1', `Product ${alias} with first-available takes no name or distinct_from; remove them.`); continue; }
        products[alias] = { pick: 'first-available' };
      } else if (raw.pick === 'next-available') {
        const df = raw.distinct_from;
        if (!Array.isArray(df) || df.length === 0 || !df.every((x) => typeof x === 'string')) {
          v('V1', `Product ${alias} with next-available needs distinct_from: a list of earlier aliases.`);
          continue;
        }
        if (raw.name !== undefined) { v('V1', `Product ${alias} with next-available takes no name; remove it.`); continue; }
        products[alias] = { pick: 'next-available', distinctFrom: df as string[] };
      } else {
        if (!isNonEmptyString(raw.name)) { v('V1', `Product ${alias} with by-name needs name: "<product name>".`); continue; }
        if (raw.distinct_from !== undefined) { v('V1', `Product ${alias} with by-name takes no distinct_from; remove it.`); continue; }
        products[alias] = { pick: 'by-name', name: raw.name };
      }
      aliases.push(alias);
    }
  }

  const steps: Step[] = [];
  const stepIds = new Set<string>();
  if (!Array.isArray(data.steps) || data.steps.length === 0) {
    v('V1', 'Field "steps" is required; list at least one step.');
  } else {
    data.steps.forEach((raw, i) => {
      const where = `step #${i + 1}`;
      if (!isObject(raw)) { v('V1', `${where} must be a mapping with id, do, product and cart_after.`); return; }
      const id = raw.id;
      if (typeof id !== 'string' || !STEP_ID.test(id)) { v('V1', `${where} needs an id such as S${i + 1}.`); return; }
      if (stepIds.has(id)) { v('V1', `Step id ${id} is used twice; give every step a unique id.`, id); return; }
      stepIds.add(id);
      const extra = Object.keys(raw).filter((k) => !['id', 'do', 'product', 'qty', 'cart_after'].includes(k));
      if (extra.length) { v('V1', `Step ${id} has unknown field(s) ${extra.join(', ')}; remove them.`, id); return; }
      if (typeof raw.do !== 'string' || !STEP_KINDS.includes(raw.do as StepKind)) {
        v('V1', `Step ${id} has do: ${String(raw.do)}; use add, setQty or remove.`, id); return;
      }
      if (typeof raw.product !== 'string') { v('V1', `Step ${id} needs product: <alias>.`, id); return; }
      if (raw.qty !== undefined && !Number.isInteger(raw.qty)) { v('V1', `Step ${id} has a qty that is not a whole number; write an integer.`, id); return; }
      if (raw.do !== 'remove' && raw.qty === undefined) { v('V1', `Step ${id} (${raw.do}) needs qty.`, id); return; }
      if (!isObject(raw.cart_after)) { v('V1', `Step ${id} needs cart_after: the cart state after the step, e.g. { A: 1 } or {}.`, id); return; }
      const cartAfter: Record<string, number> = {};
      let bad = false;
      for (const [k, q] of Object.entries(raw.cart_after)) {
        if (!Number.isInteger(q) || (q as number) < 1) { v('V1', `Step ${id} cart_after ${k}: ${String(q)} must be a whole number of at least 1; omit products that are not in the cart.`, id); bad = true; }
        else cartAfter[k] = q as number;
      }
      if (bad) return;
      steps.push({ id, do: raw.do as StepKind, product: raw.product, qty: raw.qty as number | undefined, cartAfter });
    });
  }

  let check: CheckSpec | undefined;
  if (data.check === 'each-step' || data.check === 'last-step') check = data.check;
  else if (Array.isArray(data.check) && data.check.every((x) => typeof x === 'string')) check = data.check as string[];
  else v('V1', 'Field "check" must be each-step, last-step or a list of step ids such as [S2, S4].');

  if (out.length) return { ok: false, violations: out };

  // ---- V2: references ----
  const declared = new Set(aliases);
  const used = new Set<string>();
  for (const s of steps) {
    if (!declared.has(s.product)) v('V2', `Step ${s.id} uses product ${s.product}, which is not declared; declare it under products or fix the alias.`, s.id);
    used.add(s.product);
    for (const k of Object.keys(s.cartAfter)) {
      if (!declared.has(k)) v('V2', `Step ${s.id} cart_after names ${k}, which is not declared; use only declared aliases.`, s.id);
    }
  }
  for (const a of aliases) {
    if (!used.has(a)) v('V2', `Product ${a} is declared but no step uses it; remove it or add a step for it.`);
  }

  // ---- V3: distinct products ----
  const firstUse = new Map<string, number>();
  steps.forEach((s, i) => { if (!firstUse.has(s.product)) firstUse.set(s.product, i); });
  const byName = new Map<string, string>();
  for (const a of aliases) {
    const p = products[a];
    if (p.pick === 'next-available') {
      for (const d of p.distinctFrom) {
        if (!declared.has(d)) v('V3', `Product ${a} has distinct_from ${d}, which is not declared; list only declared aliases.`);
        else if (d === a) v('V3', `Product ${a} lists itself in distinct_from; list only other aliases.`);
        else if ((firstUse.get(d) ?? Infinity) > (firstUse.get(a) ?? Infinity)) {
          v('V3', `Product ${a} is distinct from ${d}, but ${d} is first added after ${a}; add ${d} first or reorder the picks.`);
        }
      }
    } else if (p.pick === 'by-name') {
      const key = p.name.trim().toLowerCase();
      const other = byName.get(key);
      if (other) v('V3', `Products ${other} and ${a} both pick by-name "${p.name}"; use one alias for one product.`);
      else byName.set(key, a);
    }
  }
  if (out.length) return { ok: false, violations: out };

  // ---- V4, V5, V6, V8: walk the steps through the ledger semantics ----
  let state: QtyState = new Map();
  for (const s of steps) {
    const action = { do: s.do, key: s.product, qty: s.qty };
    const bad = checkAction(state, action);
    if (bad) {
      const fix = bad.rule === 'V5'
        ? 'remove the step or change it so the cart changes'
        : 'fix the step so the condition holds';
      v(bad.rule, `Step ${s.id}: ${bad.reason}; ${fix}.`, s.id);
      continue; // the state stays as it was; later steps are judged against it
    }
    state = applyAction(state, action);
    const computed = stateToObject(state);
    if (!sameState(computed, s.cartAfter)) {
      v('V4', `Step ${s.id} (${describeStep(s)}) says cart_after ${describeState(s.cartAfter)} but the cart then holds ${describeState(computed)}; write cart_after: ${inlineState(computed)}.`, s.id);
    }
    for (const [k, q] of Object.entries(s.cartAfter)) {
      if (q > MAX_QTY) v('V8', `Step ${s.id} cart_after ${k}: ${q} exceeds the limit of ${MAX_QTY} per product; lower the quantities.`, s.id);
    }
    for (const [k, q] of state) {
      if (q > MAX_QTY && (s.cartAfter[k] ?? 0) <= MAX_QTY) {
        v('V8', `Step ${s.id} brings ${k} to ${q}, above the limit of ${MAX_QTY} per product; lower the quantities.`, s.id);
      }
    }
  }

  // ---- V7: checkpoints ----
  let checkpoints: string[] = [];
  if (check === 'each-step') checkpoints = steps.map((s) => s.id);
  else if (check === 'last-step') checkpoints = steps.length ? [steps[steps.length - 1].id] : [];
  else if (Array.isArray(check)) {
    for (const c of check) if (!stepIds.has(c)) v('V7', `check names step ${c}, which does not exist; name existing step ids.`);
    if (check.length === 0) v('V7', 'check is an empty list; name at least one step, or use each-step.');
    const wanted = new Set(check);
    checkpoints = steps.filter((s) => wanted.has(s.id)).map((s) => s.id);
  }

  if (out.length) return { ok: false, violations: out };
  return {
    ok: true,
    scenario: {
      id: data.id as string,
      title: data.title as string,
      app: data.app as string,
      status: data.status as 'draft' | 'confirmed',
      request: data.request as string,
      products,
      aliases,
      steps,
      check: check as CheckSpec,
      checkpoints,
    },
  };
}

export function describeStep(s: Pick<Step, 'do' | 'product' | 'qty'>): string {
  switch (s.do) {
    case 'add': return `add ${s.product}+${s.qty}`;
    case 'setQty': return `setQty ${s.product}=${s.qty}`;
    case 'remove': return `remove ${s.product}`;
  }
}

function inlineState(state: Record<string, number>): string {
  const e = Object.entries(state);
  return e.length ? `{ ${e.map(([k, q]) => `${k}: ${q}`).join(', ')} }` : '{}';
}

export function formatViolations(violations: Violation[]): string[] {
  return violations.map((x) => `${x.rule}${x.step ? ` ${x.step}` : ''}: ${x.message}`);
}
