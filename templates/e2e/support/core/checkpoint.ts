// One checkpoint: poll the cart until it agrees with the ledger or settleMs elapses, judge the last
// read layer by layer, and describe a mismatch in the fixed message format.
// Implements design 9.1 (layers, polling, message), 9.3 (parsing, tolerance, sign) and 8.5 (raw text).
import { composition, type LedgerSnapshot } from './ledger';
import { abs, compare, decimalText, formatMoney, isZero, parseAmount, sub, withinHalfCent, type AmountFormat } from './money';
import type { PricingModule } from './pricing';
import type { CartDriver, CartView, Money, SummaryRow } from './types';

export type Layer = 'state' | 'labels' | 'lines' | 'unit price' | 'line total' | 'adjustments' | 'subtotal' | 'total';
export type FindingVerdict = 'ORACLE_MISMATCH' | 'UNMODELED_ADJUSTMENT' | 'LOCATOR_FAIL';

/** One failed assertion: `subject` names the field, `displayed` quotes the page. */
export type Finding = {
  layer: Layer;
  verdict: FindingVerdict;
  subject: string;
  expected: string;
  displayed: string;
  diff?: string;
  detail: string;
};

export type CheckContext = { pricing: PricingModule; fmt: AmountFormat; rulesFile: string };

const quoted = (r: { rawText: string; label?: string }) => `"${r.rawText}"${r.label !== undefined ? ` in row "${r.label}"` : ''}`;

function signedDiff(displayed: Money, expected: Money, fmt: AmountFormat): string {
  const d = sub(displayed, expected);
  return `${d.numerator < 0n ? '−' : '+'}${formatMoney(abs(d), fmt)}`;
}

/** Judge a cart view against the ledger. An empty list means the checkpoint is green. */
export function judge(view: CartView, snap: LedgerSnapshot, ctx: CheckContext): Finding[] {
  const { pricing, fmt } = ctx;
  const out: Finding[] = [];
  const parse = (raw: string) => parseAmount(raw, fmt);
  const notAmount = (subject: string, r: { rawText: string; label?: string }): Finding => ({
    layer: 'labels', verdict: 'LOCATOR_FAIL', subject, expected: `an amount in ${fmt.currency}`, displayed: quoted(r),
    detail: `the text read for the ${subject} is not an amount in ${fmt.currency}`,
  });
  const labelFinding = (subject: 'total' | 'subtotal', row: SummaryRow): Finding => ({
    layer: 'labels', verdict: 'LOCATOR_FAIL', subject: `${subject} label`,
    expected: `a row labelled ${pricing.summary[subject].label}`, displayed: quoted(row),
    detail: `the ${subject} was read from a row whose label does not match ${ctx.rulesFile}`,
  });

  // State: the cart is empty if and only if the ledger is empty; a total in an empty cart is zero.
  if (snap.lines.length === 0 || view.empty) {
    if (snap.lines.length > 0 && view.empty) {
      return [{ layer: 'state', verdict: 'ORACLE_MISMATCH', subject: 'cart', expected: snap.lines.map((l) => `${l.name} × ${l.qty}`).join(', '),
        displayed: `an empty cart ("${view.emptyMessage}")`, detail: 'the cart is empty, the ledger is not' }];
    }
    if (!view.empty) {
      return [{ layer: 'state', verdict: 'ORACLE_MISMATCH', subject: 'cart', expected: 'an empty cart',
        displayed: view.lines.map((l) => `${l.name} × ${l.qty}`).join(', '), detail: 'the ledger is empty, the cart is not' }];
    }
    if (!view.total) return [];
    if (!pricing.summary.total.label.test(view.total.label)) return [labelFinding('total', view.total)];
    const total = parse(view.total.rawText);
    if (!total) return [notAmount('total', view.total)];
    return isZero(total) ? [] : [{ layer: 'state', verdict: 'ORACLE_MISMATCH', subject: 'total', expected: `${formatMoney(snap.total, fmt)} = empty cart`,
      displayed: quoted(view.total), diff: signedDiff(total, snap.total, fmt), detail: 'a total shown in an empty cart must be zero' }];
  }

  // Field labels, and every text read must be an amount: a read error comes before any amount.
  if (!pricing.summary.total.label.test(view.total.label)) return [labelFinding('total', view.total)];
  if (view.subtotal && !pricing.summary.subtotal.label.test(view.subtotal.label)) return [labelFinding('subtotal', view.subtotal)];
  const reads: Array<[string, { rawText: string; label?: string }]> = [
    ...view.lines.flatMap((l): Array<[string, { rawText: string }]> => [[`unit price of "${l.name}"`, l.unitPrice], [`line total of "${l.name}"`, l.lineTotal]]),
    ...view.adjustments.map((a): [string, SummaryRow] => [`adjustment "${a.label}"`, a]),
    ...(view.subtotal ? [['subtotal', view.subtotal] as [string, SummaryRow]] : []),
    ['total', view.total],
  ];
  for (const [subject, r] of reads) if (!parse(r.rawText)) return [notAmount(subject, r)];
  const value = (raw: string) => parse(raw) as Money;

  // Lines: names and quantities agree with the ledger.
  for (const exp of snap.lines) {
    const got = view.lines.filter((l) => l.name === exp.name);
    if (got.length !== 1 || got[0].qty !== exp.qty) {
      out.push({ layer: 'lines', verdict: 'ORACLE_MISMATCH', subject: `line "${exp.name}"`, expected: `quantity ${exp.qty}`,
        displayed: got.length === 0 ? 'no such line' : got.length > 1 ? `${got.length} lines` : `quantity ${got[0].qty}`,
        detail: `the line of "${exp.name}" does not show quantity ${exp.qty}` });
    }
  }
  for (const l of view.lines) {
    if (!snap.lines.some((e) => e.name === l.name)) {
      out.push({ layer: 'lines', verdict: 'ORACLE_MISMATCH', subject: `line "${l.name}"`, expected: 'no such line',
        displayed: `quantity ${l.qty}`, detail: `the cart shows "${l.name}", which the ledger does not hold` });
    }
  }

  // Unit price and line total of every line the cart shows once.
  for (const exp of snap.lines) {
    const got = view.lines.filter((l) => l.name === exp.name);
    if (got.length !== 1) continue;
    const unit = value(got[0].unitPrice.rawText);
    if (compare(unit, exp.unitPrice) !== 0) {
      out.push({ layer: 'unit price', verdict: 'ORACLE_MISMATCH', subject: `unit price of "${exp.name}"`,
        expected: `${formatMoney(exp.unitPrice, fmt)} (read at the add)`, displayed: quoted(got[0].unitPrice),
        diff: signedDiff(unit, exp.unitPrice, fmt), detail: `the cart's unit price differs from the price read when "${exp.name}" was added` });
    }
    const line = value(got[0].lineTotal.rawText);
    if (compare(line, exp.lineTotal) !== 0) {
      out.push({ layer: 'line total', verdict: 'ORACLE_MISMATCH', subject: `line total of "${exp.name}"`,
        expected: `${formatMoney(exp.lineTotal, fmt)} = ${exp.qty} × ${formatMoney(exp.unitPrice, fmt)}`, displayed: quoted(got[0].lineTotal),
        diff: signedDiff(line, exp.lineTotal, fmt), detail: `the line total of "${exp.name}" is not price × quantity` });
    }
  }

  // Adjustments: every row has a rule and agrees with it; every rule in force has a row.
  const shown = new Set<string>();
  for (const row of view.adjustments) {
    const rule = pricing.rules.find((r) => r.label.test(row.label));
    if (!rule) {
      out.push({ layer: 'adjustments', verdict: 'UNMODELED_ADJUSTMENT', subject: `adjustment "${row.label}"`,
        expected: 'no adjustment row: no rule matches this label', displayed: quoted(row),
        detail: `row "${row.label}" has no rule in ${ctx.rulesFile}` });
      continue;
    }
    shown.add(rule.id);
    const exp = snap.adjustments.find((a) => a.id === rule.id);
    const got = value(row.rawText);
    if (!exp) {
      out.push({ layer: 'adjustments', verdict: 'ORACLE_MISMATCH', subject: `adjustment ${rule.id}`, expected: `no row: rule ${rule.id} is not in force`,
        displayed: quoted(row), detail: `rule ${rule.id} is not in force, but row "${row.label}" is displayed` });
    } else if (!withinHalfCent(exp.amount, abs(got))) {
      out.push({ layer: 'adjustments', verdict: 'ORACLE_MISMATCH', subject: `adjustment ${rule.id}`, expected: `${formatMoney(exp.amount, fmt)} (rule ${rule.id})`,
        displayed: quoted(row), diff: signedDiff(abs(got), exp.amount, fmt), detail: `row "${row.label}" does not agree with rule ${rule.id}` });
    }
  }
  for (const exp of snap.adjustments) {
    if (!shown.has(exp.id)) {
      out.push({ layer: 'adjustments', verdict: 'ORACLE_MISMATCH', subject: `adjustment ${exp.id}`, expected: `${formatMoney(exp.amount, fmt)} (rule ${exp.id})`,
        displayed: 'no row', detail: `rule ${exp.id} applies, no row displayed` });
    }
  }

  // Subtotal, if displayed: the sum of the line totals.
  if (view.subtotal) {
    const got = value(view.subtotal.rawText);
    if (compare(got, snap.subtotal) !== 0) {
      out.push({ layer: 'subtotal', verdict: 'ORACLE_MISMATCH', subject: 'subtotal', expected: `${formatMoney(snap.subtotal, fmt)} = the sum of the line totals`,
        displayed: quoted(view.subtotal), diff: signedDiff(got, snap.subtotal, fmt), detail: 'the subtotal is not the sum of the line totals' });
    }
  }

  // Total: subtotal minus adjustments, within half a cent of the exact value.
  const total = value(view.total.rawText);
  if (!withinHalfCent(snap.total, total)) {
    out.push({ layer: 'total', verdict: 'ORACLE_MISMATCH', subject: 'total', expected: `${formatMoney(snap.total, fmt)} = ${composition(snap, fmt)}`,
      displayed: quoted(view.total), diff: signedDiff(total, snap.total, fmt), detail: 'the total is not the subtotal minus the adjustments' });
  }
  return out;
}

const RANK: Record<FindingVerdict, number> = { LOCATOR_FAIL: 0, UNMODELED_ADJUSTMENT: 1, ORACLE_MISMATCH: 2 };

/** The verdict of a red checkpoint: a read error first, then an unmodeled adjustment, then a mismatch. */
export function checkpointVerdict(findings: Finding[]): FindingVerdict {
  return [...findings].sort((a, b) => RANK[a.verdict] - RANK[b.verdict])[0].verdict;
}

/** The fixed mismatch message of design 9.1. */
export function formatMismatch(stepId: string, action: string, findings: Finding[]): string {
  const verdict = checkpointVerdict(findings);
  const ofVerdict = findings.filter((f) => f.verdict === verdict);
  const head = verdict === 'ORACLE_MISMATCH' ? (ofVerdict.find((f) => f.layer === 'total') ?? ofVerdict[0]) : ofVerdict[0];
  const cause = findings[0];
  const title = verdict === 'UNMODELED_ADJUSTMENT' ? 'unmodeled adjustment' : verdict === 'LOCATOR_FAIL' ? `${head.subject} read error` : `${head.subject} mismatch`;
  const lines = [
    `${stepId} · ${title}`,
    `  action:    ${action}`,
    `  expected:  ${head.expected}`,
    `  displayed: ${head.displayed}`,
    ...(head.diff ? [`  diff:      ${head.diff}`] : []),
    `  layer:     ${cause.layer} · ${cause.detail}`,
  ];
  if (findings.length > 1) lines.push(`  also:      ${findings.filter((f) => f !== head && f !== cause).map((f) => `${f.layer}: ${f.detail}`).join('; ') || 'nothing else'}`);
  return lines.join('\n');
}

// ---- evidence ------------------------------------------------------------------------------------

/** The expected side of a checkpoint record (8.5): plain decimals rounded to cents. */
export function expectedRecord(snap: LedgerSnapshot, fmt: AmountFormat) {
  return {
    empty: snap.lines.length === 0,
    subtotal: decimalText(snap.subtotal),
    adjustments: snap.adjustments.map((a) => ({ rule: a.id, amount: decimalText(a.amount) })),
    total: decimalText(snap.total),
    totalExact: `${snap.total.numerator}/${snap.total.denominator}`,
    currency: fmt.currency,
    composition: `${formatMoney(snap.total, fmt)} = ${composition(snap, fmt)}`,
  };
}

/** The displayed side of a checkpoint record: every amount with its raw text, unnormalized. */
export function displayedRecord(view: CartView, fmt: AmountFormat) {
  const amount = (r: { rawText: string; label?: string }) => {
    const v = parseAmount(r.rawText, fmt);
    return { ...(r.label !== undefined ? { label: r.label } : {}), value: v ? decimalText(v) : null, rawText: r.rawText };
  };
  if (view.empty) return { empty: true, emptyMessage: view.emptyMessage, ...(view.total ? { total: amount(view.total) } : {}) };
  return {
    empty: false,
    lines: view.lines.map((l) => ({ name: l.name, qty: l.qty, unitPrice: amount(l.unitPrice), lineTotal: amount(l.lineTotal) })),
    ...(view.subtotal ? { subtotal: amount(view.subtotal) } : {}),
    adjustments: view.adjustments.map(amount),
    total: amount(view.total),
  };
}

export type CheckpointRecord = {
  step: string;
  action: string;
  ledger: Array<{ name: string; qty: number; unitPrice: string; attrs: Record<string, string> }>;
  expected: ReturnType<typeof expectedRecord>;
  displayed: ReturnType<typeof displayedRecord> | null;
  result: 'pass' | 'fail';
  verdict?: string;
  layer?: Layer;
  message?: string;
  reads: number;
  elapsedMs: number;
  screenshot?: string;
  control?: unknown;
};

export type ReadOutcome = { view: CartView | null; findings: Finding[]; readError?: unknown; reads: number; elapsedMs: number };

/**
 * Read the cart until it agrees with the ledger or settleMs elapses, then return the last read.
 * Reads follow each other directly: there is no fixed wait, the driver's read is the pace.
 */
export async function pollCart(driver: CartDriver, snap: LedgerSnapshot, ctx: CheckContext, settleMs: number): Promise<ReadOutcome> {
  const started = Date.now();
  let reads = 0;
  for (;;) {
    reads++;
    let outcome: ReadOutcome;
    try {
      const view = await driver.readCart();
      outcome = { view, findings: judge(view, snap, ctx), reads, elapsedMs: 0 };
    } catch (e) {
      outcome = { view: null, findings: [], readError: e, reads, elapsedMs: 0 };
    }
    const elapsedMs = Date.now() - started;
    if ((!outcome.readError && outcome.findings.length === 0) || elapsedMs >= settleMs) return { ...outcome, elapsedMs };
  }
}
