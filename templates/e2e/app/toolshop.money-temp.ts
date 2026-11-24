// TEMPORARY: replace with support/core/money.ts from Order A once it is merged.
import type { Money } from '../support/core/types';

// Accepts the amount formats the Toolshop UI displays:
//   "$14.15", "$1,234.50", "- $0.71", "14.15" (product page, "$" outside the element),
//   with ordinary, non-breaking or narrow non-breaking spaces anywhere.
// A leading minus makes the value negative: "- $0.71" parses to -71/100.
// The result is exact: numerator / 10^(number of decimals), never reduced, never a float.
const AMOUNT = /^([-−])?\s*\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/;

export function parseMoney(rawText: string): Money {
  const text = rawText.replace(/[   ]/g, ' ').trim();
  const m = AMOUNT.exec(text);
  if (!m) throw new Error(`PARSE: not an amount: ${JSON.stringify(rawText)}`);
  const [, sign, whole, frac = ''] = m;
  const digits = BigInt(whole.replace(/,/g, '') + frac);
  return {
    numerator: sign ? -digits : digits,
    denominator: 10n ** BigInt(frac.length),
    currency: 'USD',
  };
}
