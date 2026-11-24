// Exact money arithmetic on bigint rationals. No floating point anywhere.
// Rounding happens only in `formatMoney` and `matchesDisplayed`.
import type { CurrencyCode, Money } from './types';

const USD: CurrencyCode = 'USD';

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

export function money(numerator: bigint, denominator: bigint = 1n, currency: CurrencyCode = USD): Money {
  if (denominator === 0n) throw new Error('money: zero denominator');
  if (denominator < 0n) { numerator = -numerator; denominator = -denominator; }
  const g = gcd(numerator, denominator) || 1n;
  return { numerator: numerator / g, denominator: denominator / g, currency };
}

export const ZERO: Money = money(0n);

export function cents(c: number | bigint): Money {
  return money(BigInt(c), 100n);
}

function sameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new Error(`money: currency mismatch ${a.currency} vs ${b.currency}`);
}

export function add(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return money(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator, a.currency);
}

export function sub(a: Money, b: Money): Money {
  return add(a, neg(b));
}

export function neg(a: Money): Money {
  return money(-a.numerator, a.denominator, a.currency);
}

export function abs(a: Money): Money {
  return a.numerator < 0n ? neg(a) : a;
}

/** Multiply by an integer quantity. */
export function times(a: Money, qty: number | bigint): Money {
  return money(a.numerator * BigInt(qty), a.denominator, a.currency);
}

/** Multiply by an exact ratio p/q (e.g. a rate). */
export function scale(a: Money, ratio: { p: bigint; q: bigint }): Money {
  return money(a.numerator * ratio.p, a.denominator * ratio.q, a.currency);
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

/** Parse a plain decimal string such as "0.5", "5" or "-12.75" into an exact ratio. */
export function parseRatio(text: string): { p: bigint; q: bigint } {
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) throw new Error(`not a decimal number: "${text}"`);
  const frac = m[3] ?? '';
  const q = 10n ** BigInt(frac.length);
  let p = BigInt(m[2]) * q + (frac ? BigInt(frac) : 0n);
  if (m[1]) p = -p;
  const g = gcd(p, q) || 1n;
  return { p: p / g, q: q / g };
}

/** Parse a decimal string ("10.00") into Money. */
export function fromDecimal(text: string, currency: CurrencyCode = USD): Money {
  const { p, q } = parseRatio(text);
  return money(p, q, currency);
}

const SPACES = /[\s    ]/g;
const MINUS = /[−‒–—]/g;

/**
 * Parse an amount as a cart displays it: "$14.15", "$1,234.50", "- $0.71", "-$0.71", "$-0.71",
 * with ordinary or non-breaking spaces. Returns null when the text is not a USD amount.
 */
export function parseDisplayed(raw: string, currency: CurrencyCode = USD): Money | null {
  const text = raw.replace(SPACES, '').replace(MINUS, '-');
  const m = /^(-)?\$(-)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) return null;
  if (m[1] && m[2]) return null;
  const whole = BigInt(m[3].replace(/,/g, ''));
  const fracText = (m[4] ?? '').padEnd(2, '0');
  let c = whole * 100n + BigInt(fracText || '0');
  if (m[1] || m[2]) c = -c;
  return money(c, 100n, currency);
}

/** Round to whole cents, half away from zero. */
export function roundToCents(a: Money): bigint {
  const n = a.numerator * 100n;
  const d = a.denominator;
  const negative = n < 0n;
  const absN = negative ? -n : n;
  const q = absN / d;
  const r = absN % d;
  const rounded = r * 2n >= d ? q + 1n : q;
  return negative ? -rounded : rounded;
}

/** Truncate toward negative infinity to whole cents. */
export function floorToCents(a: Money): bigint {
  const n = a.numerator * 100n;
  const d = a.denominator;
  const q = n / d;
  return n % d !== 0n && n < 0n ? q - 1n : q;
}

export function formatCents(c: bigint): string {
  const negative = c < 0n;
  const absC = negative ? -c : c;
  const whole = (absC / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = (absC % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}$${whole}.${frac}`;
}

/** Format for messages: "$54.46", "-$0.71". */
export function formatMoney(a: Money): string {
  return formatCents(roundToCents(a));
}

/** Exact value as text, for evidence: "5446/100". */
export function exactText(a: Money): string {
  return a.denominator === 1n ? `${a.numerator}` : `${a.numerator}/${a.denominator}`;
}

/** A displayed amount matches the exact expected value when |expected - displayed| <= 0.5 cent. */
export function matchesDisplayed(expected: Money, displayed: Money): boolean {
  const diff = abs(sub(expected, displayed));
  return compare(diff, money(1n, 200n, expected.currency)) <= 0;
}

export function sum(items: Money[]): Money {
  return items.reduce((acc, m) => add(acc, m), ZERO);
}
