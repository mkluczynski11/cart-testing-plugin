// One checkpoint: read the cart, compare it with the ledger in layers, retry until settled.
import type { LedgerSnapshot } from './ledger';
import { abs, exactText, formatMoney, isZero, matchesDisplayed } from './money';
import type { PricingModule } from './pricing';
import type { CartDriver, CartView, Displayed, Money } from './types';
import { InfraError, LocatorError, OracleMismatch, QaError, UnmodeledAdjustment } from './verdicts';

export type FailureKind = 'ORACLE_MISMATCH' | 'UNMODELED_ADJUSTMENT' | 'LOCATOR_FAIL';

export type CheckFailure = {
  kind: FailureKind;
  layer: 'lines' | 'line-prices' | 'labels' | 'adjustments' | 'total' | 'empty-cart';
  field: string;
  expected: string;
  displayed: string;
};

const shown = (d: Displayed) => `${formatMoney(d.value)} (raw "${d.rawText}")`;

/** Compare a cart view with the ledger. Returns the first failing layer, or null when everything matches. */
export function compareView(view: CartView, snap: LedgerSnapshot, pricing: PricingModule): CheckFailure | null {
  const fail = (kind: FailureKind, layer: CheckFailure['layer'], field: string, expected: string, displayed: string): CheckFailure =>
    ({ kind, layer, field, expected, displayed });

  // 6. Empty cart (judged first when the ledger is empty).
  if (snap.lines.length === 0) {
    if (!view.empty) {
      return fail('ORACLE_MISMATCH', 'empty-cart', 'cart', 'empty cart',
        `${view.lines.length} line(s): ${view.lines.map((l) => `${l.name} × ${l.qty}`).join(', ')}`);
    }
    if (view.total) {
      if (!pricing.summary.total.label.test(view.total.label)) {
        return fail('LOCATOR_FAIL', 'labels', `total (row "${view.total.label}")`, `a row labelled ${pricing.summary.total.label}`, shown(view.total));
      }
      if (!isZero(view.total.value)) {
        return fail('ORACLE_MISMATCH', 'empty-cart', `total (row "${view.total.label}")`, '$0.00 = empty cart', shown(view.total));
      }
    }
    return null;
  }

  // 1. Lines: names and quantities.
  if (view.empty) {
    return fail('ORACLE_MISMATCH', 'lines', 'lines',
      snap.lines.map((l) => `${l.name} × ${l.qty}`).join(', '), `empty cart ("${view.emptyMessage}")`);
  }
  for (const exp of snap.lines) {
    const got = view.lines.filter((l) => l.name === exp.name);
    if (got.length === 0) return fail('ORACLE_MISMATCH', 'lines', `line "${exp.name}"`, `quantity ${exp.qty}`, 'no such line');
    if (got.length > 1) return fail('ORACLE_MISMATCH', 'lines', `line "${exp.name}"`, 'one line', `${got.length} lines`);
    if (got[0].qty !== exp.qty) return fail('ORACLE_MISMATCH', 'lines', `line "${exp.name}" quantity`, `${exp.qty}`, `${got[0].qty}`);
  }
  for (const l of view.lines) {
    if (!snap.lines.some((e) => e.name === l.name)) return fail('ORACLE_MISMATCH', 'lines', `line "${l.name}"`, 'no such line', `quantity ${l.qty}`);
  }

  // 2. Each line: unit price equals the product facts; line total = quantity × unit price.
  for (const exp of snap.lines) {
    const got = view.lines.find((l) => l.name === exp.name)!;
    if (!matchesDisplayed(exp.unitPrice, got.unitPrice.value)) {
      return fail('ORACLE_MISMATCH', 'line-prices', `line "${exp.name}" unit price`, `${formatMoney(exp.unitPrice)} (product page)`, shown(got.unitPrice));
    }
    if (!matchesDisplayed(exp.lineTotal, got.lineTotal.value)) {
      return fail('ORACLE_MISMATCH', 'line-prices', `line "${exp.name}" line total`,
        `${formatMoney(exp.lineTotal)} = ${exp.qty} × ${formatMoney(exp.unitPrice)}`, shown(got.lineTotal));
    }
  }

  // 3. Labels: a wrong label means the driver read the wrong row.
  if (!pricing.summary.total.label.test(view.total.label)) {
    return fail('LOCATOR_FAIL', 'labels', `total (row "${view.total.label}")`, `a row labelled ${pricing.summary.total.label}`, shown(view.total));
  }
  if (view.subtotal && !pricing.summary.subtotal.label.test(view.subtotal.label)) {
    return fail('LOCATOR_FAIL', 'labels', `subtotal (row "${view.subtotal.label}")`, `a row labelled ${pricing.summary.subtotal.label}`, shown(view.subtotal));
  }

  // 4. Adjustments: every displayed one has a rule and agrees with it; every expected one is displayed.
  const matched = new Set<string>();
  for (const adj of view.adjustments) {
    const rule = pricing.rules.find((r) => r.label.test(adj.label));
    if (!rule) {
      return fail('UNMODELED_ADJUSTMENT', 'adjustments', `adjustment (row "${adj.label}")`, 'no adjustment (no rule matches this label)', shown(adj));
    }
    const exp = snap.adjustments.find((a) => a.id === rule.id);
    if (!exp) {
      return fail('ORACLE_MISMATCH', 'adjustments', `adjustment ${rule.id} (row "${adj.label}")`, `no adjustment (rule ${rule.id} is not in force)`, shown(adj));
    }
    // Apps write the sign of a discount differently: compare absolute values; the total checks the direction.
    if (!matchesDisplayed(abs(exp.amount), abs(adj.value))) {
      return fail('ORACLE_MISMATCH', 'adjustments', `adjustment ${rule.id} (row "${adj.label}")`, `${formatMoney(exp.amount)} (rule ${rule.id})`, shown(adj));
    }
    matched.add(rule.id);
  }
  for (const exp of snap.adjustments) {
    if (!matched.has(exp.id)) {
      return fail('ORACLE_MISMATCH', 'adjustments', `adjustment ${exp.id}`, `${formatMoney(exp.amount)} (rule ${exp.id} is in force)`, 'no such row');
    }
  }

  // 5. Total.
  if (!matchesDisplayed(snap.total, view.total.value)) {
    return fail('ORACLE_MISMATCH', 'total', `total (row "${view.total.label}")`, `${formatMoney(snap.total)} = ${snap.composition}`, shown(view.total));
  }
  return null;
}

export function formatFailure(f: CheckFailure, stepId: string, action: string): string {
  return [
    `${f.kind} at ${stepId} (${action})`,
    `  field: ${f.field}`,
    `  expected: ${f.expected}`,
    `  displayed: ${f.displayed}`,
  ].join('\n');
}

export function failureError(f: CheckFailure, stepId: string, action: string): QaError {
  const msg = formatFailure(f, stepId, action);
  switch (f.kind) {
    case 'ORACLE_MISMATCH': return new OracleMismatch(msg);
    case 'UNMODELED_ADJUSTMENT': return new UnmodeledAdjustment(msg);
    case 'LOCATOR_FAIL': return new LocatorError(msg);
  }
}

// ---- evidence ----------------------------------------------------------------------------------

function moneyJson(m: Money) {
  return { text: formatMoney(m), exact: exactText(m) };
}

/** JSON replacer: Money -> { text, exact }; RegExp -> source text; bigint -> string. */
export function evidenceReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof RegExp) return value.toString();
  if (value && typeof value === 'object' && typeof (value as Money).numerator === 'bigint' && typeof (value as Money).denominator === 'bigint') {
    return moneyJson(value as Money);
  }
  return value;
}

export function expectedView(snap: LedgerSnapshot) {
  return {
    empty: snap.lines.length === 0,
    lines: snap.lines.map((l) => ({ name: l.name, qty: l.qty, unitPrice: formatMoney(l.unitPrice), lineTotal: formatMoney(l.lineTotal) })),
    subtotal: formatMoney(snap.subtotal),
    adjustments: snap.adjustments.map((a) => ({ id: a.id, amount: formatMoney(a.amount) })),
    total: formatMoney(snap.total),
    totalComposition: snap.composition,
  };
}

export type CheckpointRecord = {
  step: string;
  action: string;
  ledger: LedgerSnapshot;
  expected: ReturnType<typeof expectedView>;
  displayed: CartView | null;
  result: { status: 'green' } | { status: 'red'; verdict: string; layer?: string; field?: string; message: string };
  reads: number;
};

export type Attach = (record: CheckpointRecord) => Promise<void>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Read the cart until it matches the ledger or `settleMs` elapses (every 100 ms), then judge the last read.
 * Every checkpoint, green or red, is attached as evidence.
 */
export async function runCheckpoint(opts: {
  driver: CartDriver;
  pricing: PricingModule;
  snapshot: LedgerSnapshot;
  stepId: string;
  action: string;
  settleMs: number;
  attach: Attach;
}): Promise<void> {
  const { driver, pricing, snapshot, stepId, action, settleMs, attach } = opts;
  const started = Date.now();
  let reads = 0;
  let view: CartView | null = null;
  let failure: CheckFailure | null = null;
  let readError: unknown;
  for (;;) {
    reads++;
    try {
      view = await driver.readCart();
      readError = undefined;
      failure = compareView(view, snapshot, pricing);
    } catch (e) {
      readError = e;
    }
    if (!readError && !failure) break;
    if (Date.now() - started >= settleMs) break;
    await sleep(100);
  }

  let error: QaError | undefined;
  if (readError) {
    error = readError instanceof QaError ? readError : new InfraError(`reading the cart at ${stepId} failed: ${String((readError as Error)?.message ?? readError)}`);
  } else if (failure) {
    error = failureError(failure, stepId, action);
  }

  await attach({
    step: stepId,
    action,
    ledger: snapshot,
    expected: expectedView(snapshot),
    displayed: view,
    result: error
      ? { status: 'red', verdict: error.verdict, layer: failure?.layer, field: failure?.field, message: error.message }
      : { status: 'green' },
    reads,
  });
  if (error) throw error;
}
