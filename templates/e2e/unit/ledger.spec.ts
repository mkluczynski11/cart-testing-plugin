import { expect, test } from '@playwright/test';
import * as reference from '../app/reference.pricing';
import { Ledger } from '../support/core/ledger';
import { cents, formatMoney, fromDecimal, money } from '../support/core/money';
import { applyRules, conditionHolds, maxQtyFor, NO_RULES } from '../support/core/pricing';
import type { ProductFacts } from '../support/core/types';

const facts = (name: string, price: string, co2 = 'D'): ProductFacts =>
  ({ name, unitPrice: fromDecimal(price), inStock: true, attrs: { co2_rating: co2 } });

test('ledger: lines, subtotal, total and composition without rules', () => {
  const l = new Ledger(NO_RULES);
  l.bind('A', facts('Claw Hammer', '14.15'));
  l.bind('B', facts('Combination Pliers', '12.01'));
  l.apply({ do: 'add', key: 'A', qty: 1 });
  l.apply({ do: 'add', key: 'B', qty: 1 });
  l.apply({ do: 'setQty', key: 'A', qty: 3 });
  const s = l.snapshot();
  expect(s.state).toEqual({ A: 3, B: 1 });
  expect(formatMoney(s.total)).toBe('$54.46');
  expect(s.composition).toBe('3 × $14.15 + 1 × $12.01');
  l.apply({ do: 'remove', key: 'B' });
  expect(formatMoney(l.snapshot().total)).toBe('$42.45');
});

test('ledger: an invalid action is refused (same semantics as the validator)', () => {
  const l = new Ledger(NO_RULES);
  l.bind('A', facts('Claw Hammer', '14.15'));
  expect(() => l.apply({ do: 'remove', key: 'A' })).toThrow(/V6/);
  l.apply({ do: 'add', key: 'A', qty: 2 });
  expect(() => l.apply({ do: 'setQty', key: 'A', qty: 2 })).toThrow(/V5/);
});

test('shareOfUnits counts units, not lines, and is strictly above the threshold', () => {
  const cond = reference.rules[0].when;
  const B = { co2_rating: 'B' };
  const D = { co2_rating: 'D' };
  expect(conditionHolds(cond, [{ qty: 1, attrs: B }, { qty: 1, attrs: D }])).toBe(false); // exactly 0.5
  expect(conditionHolds(cond, [{ qty: 2, attrs: B }, { qty: 1, attrs: D }])).toBe(true); // 2/3
  expect(conditionHolds(cond, [{ qty: 1, attrs: B }, { qty: 2, attrs: D }])).toBe(false); // 1 line of 2, 1/3 units
  expect(conditionHolds(cond, [])).toBe(false);
});

test('percentOf running: 5% of the running value, exact', () => {
  const r = applyRules(reference.rules, cents(4209), [{ qty: 2, attrs: { co2_rating: 'B' } }, { qty: 1, attrs: { co2_rating: 'D' } }]);
  expect(r.adjustments).toHaveLength(1);
  expect(r.adjustments[0].amount).toEqual(money(-4209n, 2000n)); // -$2.1045
  expect(r.total).toEqual(money(79971n, 2000n)); // $39.9855
});

test('ledger with the eco rule: discount on both sides of the threshold', () => {
  const l = new Ledger(reference);
  l.bind('A', facts('Wood Saw', '13.97', 'B'));
  l.bind('B', facts('Claw Hammer', '14.15', 'D'));
  l.apply({ do: 'add', key: 'A', qty: 1 });
  l.apply({ do: 'add', key: 'B', qty: 1 });
  expect(l.snapshot().adjustments).toEqual([]);
  l.apply({ do: 'setQty', key: 'A', qty: 2 });
  const s = l.snapshot();
  expect(s.adjustments.map((a) => a.id)).toEqual(['eco-discount']);
  expect(formatMoney(s.total)).toBe('$39.99');
  expect(s.composition).toBe('2 × $13.97 + 1 × $14.15 - $2.10 (eco-discount)');
});

test('constraints: the tightest limit applies; match narrows to one product', () => {
  const cs = [{ id: 'line-max', maxQty: 99 }, { id: 'single', maxQty: 1, match: { name: 'Thor Hammer' } }];
  expect(maxQtyFor(cs, 'Thor Hammer')).toBe(1);
  expect(maxQtyFor(cs, 'Wood Saw')).toBe(99);
});
