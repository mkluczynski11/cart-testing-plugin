// Unit tests of the contract check: the shipped skill agrees with the library, and a changed type is caught.
// Covers order D stage 3 (`scripts/check-contracts.mjs`); run with `node --test scripts/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { compare, DEFAULTS } from './check-contracts.mjs';

const skill = fs.readFileSync(DEFAULTS.skill, 'utf8');
const types = fs.readFileSync(DEFAULTS.types, 'utf8');

test('the contracts skill quotes support/core/types.ts exactly', () => {
  assert.equal(compare(skill, types), undefined);
});

test('a changed field in the library is reported with its line', () => {
  const changed = types.replace('inStock: boolean;', 'inStock: boolean; stock?: number;');
  assert.match(compare(skill, changed), /differ from support\/core\/types\.ts at quoted line \d+/);
});

test('a skill without the marked block is reported', () => {
  assert.match(compare('# no block', types), /has no ```ts block/);
});
