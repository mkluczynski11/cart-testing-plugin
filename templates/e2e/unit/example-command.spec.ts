// Unit tests of `qa-harness example <slug>` without --confirm (design 8.1, 8.2; follow-up to order G): on a confirmed
// scenario it prints the example and leaves specs/<slug>.example.json, with its confirmed record, as it is.
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import { files } from '../support/core/config';
import { example } from '../support/harness/example';
import { workspace } from '../support/harness/selftest';

const REF = 'cart-total-add-change-remove';

test('example without --confirm on a confirmed scenario prints the example and leaves example.json as it is', () => {
  const root = workspace('unit-example-confirmed', [REF]);
  example(root, REF, true);
  const before = fs.readFileSync(files.example(root, REF));
  const r = example(root, REF, false);
  expect({ verdict: r.verdict, example: r.lines[0].startsWith(`Example for ${REF} on stub products`), kept: fs.readFileSync(files.example(root, REF)).equals(before) })
    .toEqual({ verdict: 'PASS', example: true, kept: true });
  expect(r.lines).toContain(`Scenario ${REF} is confirmed and unchanged.`);
  expect(r.lines.some((l) => /^Wrote /.test(l))).toBe(false);
});

test('a confirmed scenario changed after its confirmation: the record stays, and the output says a new confirmation is due', () => {
  const root = workspace('unit-example-changed', [REF]);
  example(root, REF, true);
  const before = fs.readFileSync(files.example(root, REF));
  fs.writeFileSync(files.scenario(root, REF), fs.readFileSync(files.scenario(root, REF), 'utf8').replace(/^title: .*$/m, 'title: Changed after the confirmation'));
  const r = example(root, REF, false);
  expect(fs.readFileSync(files.example(root, REF)).equals(before)).toBe(true);
  expect(r.lines).toContain(`Scenario ${REF} changed after its confirmation; show the new example and run \`qa-harness example ${REF} --confirm\` again.`);
});

test('a draft scenario still gets its example.json written, without a confirmed record', () => {
  const root = workspace('unit-example-draft', [REF]);
  const r = example(root, REF, false);
  const written = JSON.parse(fs.readFileSync(files.example(root, REF), 'utf8')) as { confirmed?: unknown };
  expect({ wrote: r.lines.some((l) => /^Wrote specs\//.test(l)), confirmed: written.confirmed }).toEqual({ wrote: true, confirmed: undefined });
});
