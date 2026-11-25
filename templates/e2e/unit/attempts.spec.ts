// Unit tests of the repair attempts of R9 (report V F7): a driver repair needs a live run, and a repair that ends
// PASS closes the episode, so the counter starts again for the next failure.
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import { files } from '../support/core/config';
import { admitRepair, closeAttempt } from '../support/harness/attempts';
import { run } from '../support/harness/run';
import { prepare, workspace } from '../support/harness/selftest';

const REF = 'cart-total-add-change-remove';

test('a driver repair is refused for a dry run, which never calls the driver, and nothing is counted', async () => {
  const root = workspace('unit-repair-dry', [REF]);
  prepare(root, REF);
  const r = await run(root, REF, { dry: true, repair: 'driver' });
  expect({ verdict: r.verdict, counted: fs.existsSync(`${files.reports(root, REF)}/attempts.json`) }).toEqual({ verdict: 'SPEC_INVALID', counted: false });
});

test('after two repairs that ended PASS a third repair is admitted as the first of a new episode', () => {
  const root = workspace('unit-repair-episode', [REF]);
  prepare(root, REF);
  const attempt = (n: number) => {
    fs.appendFileSync(files.test(root, REF), `// repair ${n}\n`);
    const a = admitRepair(root, REF, 'reference', 'test');
    if (a.ok) closeAttempt(root, REF, a.attempt.attempt, `run-${n}`, 'PASS');
    return a.ok ? a.attempt.attempt : a.verdict;
  };
  expect([attempt(1), attempt(2), attempt(3)]).toEqual([1, 1, 1]);
});
