// Exact money: fractions of bigints with a currency, the amount parser and the display format.
// Implements design 9.3 (representation, parsing by locale and currency, tolerance, rounding).
// Floating point is never used for an amount; Intl only reports a locale's separators.
import type { CurrencyCode, Money } from './types';

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

export function money(numerator: bigint, denominator: bigint = 1n, currency: CurrencyCode = 'USD'): Money {
  if (denominator === 0n) throw new Error('money: zero denominator');
  if (denominator < 0n) { numerator = -numerator; denominator = -denominator; }
  const g = gcd(numerator, denominator) || 1n;
  return { numerator: numerator / g, denominator: denominator / g, currency };
}

export function zero(currency: CurrencyCode): Money {
  return money(0n, 1n, currency);
}

export function cents(c: bigint, currency: CurrencyCode): Money {
  return money(c, 100n, currency);
}

function sameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new Error(`money: an operation on two currencies (${a.currency} and ${b.currency})`);
}

export function add(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return money(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator, a.currency);
}

export function neg(a: Money): Money {
  return money(-a.numerator, a.denominator, a.currency);
}

export function sub(a: Money, b: Money): Money {
  return add(a, neg(b));
}

export function abs(a: Money): Money {
  return a.numerator < 0n ? neg(a) : a;
}

/** Multiply by an integer quantity. */
export function times(a: Money, qty: number | bigint): Money {
  return money(a.numerator * BigInt(qty), a.denominator, a.currency);
}

export type Ratio = { p: bigint; q: bigint };

/** Multiply by an exact ratio p/q. */
export function scale(a: Money, r: Ratio): Money {
  return money(a.numerator * r.p, a.denominator * r.q, a.currency);
}

export function compare(a: Money, b: Money): number {
  sameCurrency(a, b);
  const l = a.numerator * b.denominator;
  const r = b.numerator * a.denominator;
  return l < r ? -1 : l > r ? 1 : 0;
}

export function equals(a: Money, b: Money): boolean {
  return compare(a, b) === 0;
}

export function isZero(a: Money): boolean {
  return a.numerator === 0n;
}

export function sum(items: Money[], currency: CurrencyCode): Money {
  return items.reduce((acc, m) => add(acc, m), zero(currency));
}

/** Parse a plain decimal such as "0.5", "5" or "12.75" into an exact ratio. */
export function parseRatio(text: string): Ratio {
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) throw new Error(`not a decimal number: "${text}"`);
  const frac = m[3] ?? '';
  const q = 10n ** BigInt(frac.length);
  let p = BigInt(m[2]) * q + (frac ? BigInt(frac) : 0n);
  if (m[1]) p = -p;
  const g = gcd(p, q) || 1n;
  return { p: p / g, q: q / g };
}

/** Parse a plain decimal ("10.00") into Money. */
export function fromDecimal(text: string, currency: CurrencyCode): Money {
  const { p, q } = parseRatio(text);
  return money(p, q, currency);
}

/** Round to whole cents, half away from zero. */
export function roundToCents(a: Money): bigint {
  const n = a.numerator * 100n;
  const d = a.denominator;
  const negative = n < 0n;
  const absN = negative ? -n : n;
  const q = absN / d;
  const rounded = (absN % d) * 2n >= d ? q + 1n : q;
  return negative ? -rounded : rounded;
}

/** Truncate toward zero to whole cents. */
export function truncToCents(a: Money): bigint {
  return (a.numerator * 100n) / a.denominator;
}

/** The exact value as a plain decimal rounded to cents: "47.50", "-0.61". */
export function decimalText(a: Money): string {
  const c = roundToCents(a);
  const negative = c < 0n;
  const absC = negative ? -c : c;
  return `${negative ? '-' : ''}${absC / 100n}.${(absC % 100n).toString().padStart(2, '0')}`;
}

/** The exact value as a fraction, for evidence: "5446/100" reduced to "2723/50". */
export function exactText(a: Money): string {
  return a.denominator === 1n ? `${a.numerator}` : `${a.numerator}/${a.denominator}`;
}

/** A displayed amount matches the exact value when |exact − displayed| ≤ half a cent (9.3). */
export function withinHalfCent(exact: Money, displayed: Money): boolean {
  return compare(abs(sub(exact, displayed)), money(1n, 200n, exact.currency)) <= 0;
}

// ---- display format ----------------------------------------------------------------------------

/** How a locale writes an amount in a currency: symbol, its side, separators. */
export type AmountFormat = {
  locale: string;
  currency: CurrencyCode;
  symbol: string;
  symbolFirst: boolean;
  decimal: string;
  group: string;
};

const formats = new Map<string, AmountFormat>();

/** The format of `currency` in `locale`, as Intl reports it. */
export function amountFormat(locale: string, currency: CurrencyCode): AmountFormat {
  const key = `${locale}|${currency}`;
  const known = formats.get(key);
  if (known) return known;
  // A bigint sample: Intl reports the separators; no amount passes through a float.
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(1234567n);
  const symbolAt = parts.findIndex((p) => p.type === 'currency');
  const integerAt = parts.findIndex((p) => p.type === 'integer');
  const fmt: AmountFormat = {
    locale,
    currency,
    symbol: parts[symbolAt]?.value ?? currency,
    symbolFirst: symbolAt < integerAt,
    decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
    group: parts.find((p) => p.type === 'group')?.value ?? ',',
  };
  formats.set(key, fmt);
  return fmt;
}

const SPACES = /[\s   ]/g;
const MINUS = /[−‒–—]/g;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Parse an amount as a page displays it, in the given format: "$1,234.50", "- $0.61", "-$0.61",
 * "1.234,50 €". With `symbol: 'optional'` a bare number such as "14.15" is accepted too.
 * Returns null for text that is not an amount in that currency.
 */
export function parseAmount(raw: string, fmt: AmountFormat, opts: { symbol: 'required' | 'optional' } = { symbol: 'required' }): Money | null {
  let t = raw.replace(SPACES, '').replace(MINUS, '-');
  let negative = false;
  let hasSymbol = false;
  if (t.startsWith('-')) { negative = true; t = t.slice(1); }
  const symbol = fmt.symbol.replace(SPACES, '');
  if (fmt.symbolFirst && t.startsWith(symbol)) {
    hasSymbol = true;
    t = t.slice(symbol.length);
    if (!negative && t.startsWith('-')) { negative = true; t = t.slice(1); }
  } else if (!fmt.symbolFirst && t.endsWith(symbol)) {
    hasSymbol = true;
    t = t.slice(0, -symbol.length);
  }
  if (!hasSymbol && opts.symbol === 'required') return null;
  const g = escapeRe(fmt.group.replace(SPACES, '') || ' ');
  const d = escapeRe(fmt.decimal);
  const m = new RegExp(`^(\\d{1,3}(?:${g}\\d{3})+|\\d+)(?:${d}(\\d{1,2}))?$`).exec(t);
  if (!m) return null;
  const whole = BigInt(m[1].split(fmt.group.replace(SPACES, '') || ' ').join(''));
  const c = whole * 100n + BigInt((m[2] ?? '').padEnd(2, '0'));
  return cents(negative ? -c : c, fmt.currency);
}

/** Format whole cents the way the locale writes them, e.g. "$1,234.50", "-$0.61", "1.234,50 €". */
export function formatCents(c: bigint, fmt: AmountFormat): string {
  const negative = c < 0n;
  const absC = negative ? -c : c;
  const whole = (absC / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, fmt.group);
  const number = `${whole}${fmt.decimal}${(absC % 100n).toString().padStart(2, '0')}`;
  const body = fmt.symbolFirst ? `${fmt.symbol}${number}` : `${number} ${fmt.symbol}`;
  return `${negative ? '-' : ''}${body}`;
}

/** Format an exact amount rounded to cents, for messages and reports. */
export function formatMoney(a: Money, fmt: AmountFormat): string {
  return formatCents(roundToCents(a), fmt);
}
