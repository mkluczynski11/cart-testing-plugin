// Unit tests of support/core/money.ts: exact amounts, the locale parser and the tolerance (design 9.3).
import { expect, test } from '@playwright/test';
import { add, cents, formatCents, fromDecimal, money, parseAmount, roundToCents, truncToCents, withinHalfCent } from '../support/core/money';
import { EUR, USD } from './helpers';

const c = (raw: string, fmt = USD, symbol: 'required' | 'optional' = 'required') => {
  const m = parseAmount(raw, fmt, { symbol });
  return m ? roundToCents(m) : null;
};

test('a dollar amount with cents parses to whole cents', () => expect(c('$14.15')).toBe(1415n));
test('a grouped dollar amount parses', () => expect(c('$1,234.50')).toBe(123450n));
test('a discount written "- $0.61" parses as negative', () => expect(c('- $0.61')).toBe(-61n));
test('a minus after the symbol parses as negative', () => expect(c('$-0.61')).toBe(-61n));
test('non-breaking spaces are ignored', () => expect(c('$ 14.15')).toBe(1415n));
test('a bare number is rejected when the symbol is required', () => expect(c('14.15')).toBeNull());
test('a bare number is accepted when the symbol is optional', () => expect(c('14.15', USD, 'optional')).toBe(1415n));
test('a foreign currency is not an amount in USD', () => expect(c('€5.00')).toBeNull());
test('a label is not an amount', () => expect(c('Total')).toBeNull());
test('a German euro amount parses with its own separators', () => expect(c('1.234,50 €', EUR)).toBe(123450n));
test('a dot-decimal amount is rejected in the German format', () => expect(c('12.01 €', EUR)).toBeNull());
test('a German euro amount is formatted with the symbol after the number', () => expect(formatCents(123450n, EUR)).toBe('1.234,50 €'));
test('a negative dollar amount is formatted with a leading minus', () => expect(formatCents(-61n, USD)).toBe('-$0.61'));
test('the exact half-cent tie is within tolerance', () => expect(withinHalfCent(money(1n, 200n, 'USD'), cents(0n, 'USD'))).toBe(true));
test('more than half a cent is outside tolerance', () => expect(withinHalfCent(money(51n, 10000n, 'USD'), cents(0n, 'USD'))).toBe(false));
test('rounding goes half away from zero', () => expect(roundToCents(money(-1n, 200n, 'USD'))).toBe(-1n));
test('truncation goes toward zero', () => expect(truncToCents(fromDecimal('11.579', 'USD'))).toBe(1157n));
test('an operation on two currencies is an error', () => expect(() => add(cents(1n, 'USD'), cents(1n, 'EUR'))).toThrow(/two currencies/));
