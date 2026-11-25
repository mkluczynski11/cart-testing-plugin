// Test of evals/transcript.mjs on a recorded transcript (eval A4 of order E, cut to one call, paths removed): the call
// is logged again after its result, and the grader must keep the first entry with its command and its result.
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { callsFrom } from '../evals/transcript.mjs';

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'transcript-duplicate-call.jsonl');

test('a tool call logged again after its result is recorded once, with its command and its result', () => {
  const calls = callsFrom([fixture]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.command, 'qa-harness intent two-products-qty-remove');
  assert.match(calls[0].result, /VERDICT: PASS/);
});
