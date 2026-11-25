import { expect, test } from '@playwright/test';
import {
  add, cents, compare, floorToCents, formatMoney, fromDecimal, matchesDisplayed, money, parseDisplayed, parseRatio,
  roundToCents, times,
} from '../support/core/money';

const c = (m: ReturnType<typeof parseDisplayed>) => (m ? roundToCents(m) : null);

test.describe('money parser', () => {
  const cases: Array<[string, bigint]> = [
    ['$14.15', 1415n],
    ['$1,234.50', 123450n],
    ['- $0.71', -71n],
    ['-$0.71', -71n],
    ['- $0.71', -71n],
    ['$ 14.15', 1415n],
    [' $1,234.50 ', 123450n],
    ['$-0.71', -71n],
    ['−$0.71', -71n],
    ['$0.00', 0n],
    ['$7', 700n],
    ['$1,000,000.10', 100000010n],
  ];
  for (const [raw, want] of cases) {
    test(`parses ${JSON.stringify(raw)}`, () => {
      expect(c(parseDisplayed(raw))).toBe(want);
    });
  }
  for (const raw of ['14.15', '$1,23.45', '$', 'Total', '$14.155', '€14.15', '--$1.00', '-$-1.00']) {
    test(`rejects ${JSON.stringify(raw)}`, () => {
      expect(parseDisplayed(raw)).toBeNull();
    });
  }
});

test('formats for messages', () => {
  expect(formatMoney(cents(5446))).toBe('$54.46');
  expect(formatMoney(cents(-71))).toBe('-$0.71');
  expect(formatMoney(cents(123450))).toBe('$1,234.50');
  expect(formatMoney(money(399855n, 10000n))).toBe('$39.99'); // 39.9855 rounds up
});

test('arithmetic is exact rationals', () => {
  const a = fromDecimal('14.15');
  expect(compare(times(a, 3), cents(4245))).toBe(0);
  expect(compare(add(fromDecimal('0.1'), fromDecimal('0.2')), fromDecimal('0.3'))).toBe(0);
  expect(parseRatio('0.5')).toEqual({ p: 1n, q: 2n });
  expect(parseRatio('5')).toEqual({ p: 5n, q: 1n });
});

test('rounding: half away from zero; floor for truncation', () => {
  expect(roundToCents(money(3998_55n, 10000n))).toBe(3999n);
  expect(roundToCents(money(10050n, 10000n))).toBe(101n);
  expect(roundToCents(money(-10050n, 10000n))).toBe(-101n);
  expect(floorToCents(money(399855n, 10000n))).toBe(3998n);
});

test('comparison with a displayed amount tolerates at most half a cent', () => {
  const exact = money(399855n, 10000n); // $39.9855
  expect(matchesDisplayed(exact, cents(3999))).toBe(true); // 0.45 cent
  expect(matchesDisplayed(exact, cents(3998))).toBe(false); // 0.55 cent
  expect(matchesDisplayed(money(1005n, 1000n), cents(100))).toBe(true); // exactly 0.5 cent
  expect(matchesDisplayed(money(1005n, 1000n), cents(101))).toBe(true);
});
