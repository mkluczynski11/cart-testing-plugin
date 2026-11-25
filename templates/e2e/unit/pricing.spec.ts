// Unit tests of support/core/pricing.ts: the rule vocabulary of design 9.2 and the operator tweaks.
import { expect, test } from '@playwright/test';
import { decimalText, fromDecimal } from '../support/core/money';
import { applyRules, conditionHolds, type PricingRule } from '../support/core/pricing';
import { GREEN } from './helpers';

const usd = (d: string) => fromDecimal(d, 'USD');
const P = { source: 'tester', ref: 'unit', live: 'unconfirmed' } as const;
const rated = (qty: number, r: string) => ({ qty, attrs: { energy_class: r } });
const totalOf = (rules: PricingRule[], subtotal: string, groups = [rated(1, 'D')], tweak?: Parameters<typeof applyRules>[3]) =>
  decimalText(applyRules(rules, usd(subtotal), groups, tweak).total);

test('always is in force in a non-empty cart', () => expect(conditionHolds({ always: true }, [rated(1, 'D')], usd('1'))).toBe(true));
test('always is not in force in an empty cart', () => expect(conditionHolds({ always: true }, [], usd('0'))).toBe(false));
test('shareOfUnits is strictly above its threshold', () => expect(conditionHolds(GREEN.when, [rated(1, 'A'), rated(1, 'D')], usd('2'))).toBe(false));
test('shareOfUnits counts units, not lines', () => expect(conditionHolds(GREEN.when, [rated(3, 'A'), rated(1, 'D')], usd('2'))).toBe(true));
test('the boundary tweak makes shareOfUnits hold at its threshold', () => expect(conditionHolds(GREEN.when, [rated(1, 'A'), rated(1, 'D')], usd('2'), true)).toBe(true));
test('hasUnits holds at its count', () => expect(conditionHolds({ hasUnits: { where: { energy_class: ['A'] }, atLeast: 2 } }, [rated(2, 'A')], usd('1'))).toBe(true));
test('subtotalAtLeast holds at the amount', () => expect(conditionHolds({ subtotalAtLeast: '50.00' }, [rated(1, 'D')], usd('50'))).toBe(true));
test('the boundary tweak makes subtotalAtLeast strict', () => expect(conditionHolds({ subtotalAtLeast: '50.00' }, [rated(1, 'D')], usd('50'), true)).toBe(false));

const tenOff: PricingRule = { id: 'ten', label: /ten/i, when: { always: true }, amount: { percentOf: 'subtotal', rate: '10' }, provenance: P };
const tenRunning: PricingRule = { ...tenOff, id: 'ten-running', amount: { percentOf: 'running', rate: '10' } };
const fiveFixed: PricingRule = { ...tenOff, id: 'five', amount: { fixed: '5.00' } };

test('a percentage of the subtotal ignores earlier adjustments', () => expect(totalOf([fiveFixed, tenOff], '100')).toBe('85.00'));
test('a percentage of the running value follows earlier adjustments', () => expect(totalOf([fiveFixed, tenRunning], '100')).toBe('85.50'));
test('rules apply in file order on exact values', () => expect(applyRules([GREEN], usd('13.98'), [rated(1, 'B')]).total).toEqual(fromDecimal('13.281', 'USD')));
test('rule-never removes a rule in force', () => expect(totalOf([tenOff], '100', undefined, { rule: 'ten', kind: 'never' })).toBe('100.00'));
test('rule-always applies a rule not in force', () => expect(totalOf([GREEN], '100', [rated(1, 'D')], { rule: 'green-discount', kind: 'always' })).toBe('95.00'));
test('the doubled rate deducts twice the percentage', () => expect(totalOf([tenOff], '100', undefined, { rule: 'ten', kind: 'double-rate' })).toBe('80.00'));
