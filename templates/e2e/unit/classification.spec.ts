// Unit tests of support/core/classification.ts: the classification order of design 6.1.
import { expect, test } from '@playwright/test';
import type { CheckpointRecord } from '../support/core/checkpoint';
import { classify, type RepeatRecord } from '../support/core/classification';

const cp = (step: string, result: 'pass' | 'fail', verdict?: string) => ({ step, result, verdict } as unknown as CheckpointRecord);
const rep = (over: Partial<RepeatRecord>): RepeatRecord => ({ n: 1, result: 'pass', status: 'passed', error: null, checkpoints: [cp('S1', 'pass'), cp('S2', 'pass')], durationMs: 1, ...over });
const ok = rep({});
const red = rep({ result: 'fail', status: 'failed', checkpoints: [cp('S1', 'fail', 'ORACLE_MISMATCH'), cp('S2', 'pass')] });
const infra = rep({ result: 'fail', status: 'failed', error: { step: null, kind: 'INFRA_FAIL', message: 'x', rawTotal: null }, checkpoints: [] });
const expected = ['S1', 'S2'];

test('every repeat green with every checkpoint is PASS', () => expect(classify({ repeats: [ok, ok, ok], errors: [] }, expected).verdict).toBe('PASS'));
test('an environment failure in any repeat outranks the rest', () => expect(classify({ repeats: [red, infra, ok], errors: [] }, expected).verdict).toBe('INFRA_FAIL'));
test('the same failure in every repeat is that failure', () => expect(classify({ repeats: [red, red, red], errors: [] }, expected).verdict).toBe('ORACLE_MISMATCH'));
test('different results across repeats are FLAKY', () => expect(classify({ repeats: [ok, red, ok], errors: [] }, expected).verdict).toBe('FLAKY'));
test('FLAKY carries the class of the failed repeats as evidence', () => expect(classify({ repeats: [ok, red, ok], errors: [] }, expected).evidence).toBe('amount'));
test('zero executed tests is NO_TESTS_RUN', () => expect(classify({ repeats: [], errors: ['Error: No tests found'] }, expected).verdict).toBe('NO_TESTS_RUN'));
test('a missing checkpoint without an error is NO_TESTS_RUN', () => expect(classify({ repeats: [rep({ checkpoints: [cp('S1', 'pass')] })], errors: [] }, expected).verdict).toBe('NO_TESTS_RUN'));
test('a load error of the test file is INFRA_FAIL', () => expect(classify({ repeats: [], errors: ['SyntaxError: Unexpected token'] }, expected).verdict).toBe('INFRA_FAIL'));
