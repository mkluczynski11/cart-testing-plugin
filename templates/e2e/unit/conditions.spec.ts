// Unit tests of conditions a tester or another run causes, which are not harness bugs (report V F1, F2, F3, N4 and
// open question 7; report D request 1): each ends with its own sentence and a verdict of the dictionary (design 6.3).
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { files, loadConfig, packageRoot } from '../support/core/config';
import { QaError } from '../support/core/verdicts';
import { loadPricing } from '../support/harness/common';
import { compile } from '../support/harness/compile';
import { doctor } from '../support/harness/doctor';
import { withLock } from '../support/harness/run-dir';
import { example } from '../support/harness/example';
import { prepare, workspace } from '../support/harness/selftest';

const REF = 'cart-total-add-change-remove';

/** What a thrown error says: its verdict (when it carries one) and its message. */
function caught(fn: () => unknown): { verdict: string; message: string } {
  try {
    fn();
    return { verdict: 'none', message: '' };
  } catch (e) {
    return { verdict: e instanceof QaError ? e.verdict : 'plain error', message: (e as Error).message };
  }
}

/** A rules file in the root's own style: imports from support/core, the reference rule with `when` replaced. */
function rulesFile(when: string, extra = ''): string {
  return [
    "import type { PricingRule, PurchaseConstraint, SummaryLabels } from '../support/core/pricing';",
    "const P = { source: 'tester', ref: 'unit', live: 'unconfirmed' } as const;",
    'export const summary: SummaryLabels = { total: { label: /^total\\b/i }, subtotal: { label: /^subtotal\\b/i }, provenance: P };',
    `export const rules: PricingRule[] = [{ id: 'spring-sale', label: /spring/i, when: ${when}, amount: { percentOf: 'subtotal', rate: '5' }, provenance: P }];`,
    "export const constraints: PurchaseConstraint[] = [{ id: 'line-max', maxQty: 99, provenance: P }];",
    extra,
  ].join('\n');
}

test('a rules file with an unknown condition is LINT_FAIL naming the rule id and the key', () => {
  const root = workspace('unit-rules-vocabulary', []);
  fs.writeFileSync(files.pricing(root, 'reference'), rulesFile("{ couponCode: 'SPRING' } as never"));
  const r = caught(() => loadPricing(root, 'reference'));
  expect({ verdict: r.verdict, named: r.message.includes('spring-sale') && r.message.includes('couponCode') }).toEqual({ verdict: 'LINT_FAIL', named: true });
});

test('doctor reports an unreadable scenario as one SPEC_INVALID line naming the file and still checks the others', () => {
  const root = workspace('unit-doctor-tabs', [REF]);
  fs.writeFileSync(files.scenario(root, 'h-tabs'), '---\nid: h-tabs\nproducts:\n\tA: { pick: first-available }\n---\n');
  const r = caught(() => doctor(root, false));
  const lines = r.verdict === 'none' ? doctor(root, false).lines : [r.message];
  expect({ named: lines.some((l) => /^SPEC_INVALID: .*specs\/h-tabs\.md/.test(l)), other: lines.some((l) => l.includes(REF)) }).toEqual({ named: true, other: true });
});

test('doctor does not read specs/<slug>.intent.md as a scenario', () => {
  const root = workspace('unit-doctor-intent', [REF]);
  fs.writeFileSync(path.join(root, 'specs', `${REF}.intent.md`), `---\nscenario: ${REF}\nverdict: INTENT_OK\n---\n`);
  expect(doctor(root, false).lines.filter((l) => l.includes('.intent'))).toEqual([]);
});

test('doctor prints a hand-edited test and a changed scenario as findings, not under ok:', () => {
  const root = workspace('unit-doctor-ok', [REF]);
  prepare(root, REF);
  fs.appendFileSync(files.test(root, REF), '// a hand edit\n');
  expect(doctor(root, false).lines.filter((l) => l.startsWith('ok:') && /edited by hand|changed/.test(l))).toEqual([]);
});

test('a held lock is refused with INFRA_FAIL and a sentence that says to wait for the other run', async () => {
  const root = workspace('unit-lock', [REF]);
  fs.mkdirSync(files.reports(root, REF), { recursive: true });
  fs.writeFileSync(path.join(files.reports(root, REF), '.lock'), '12345\n');
  let r = { verdict: 'none', message: '' };
  await withLock(root, REF, () => undefined).catch((e: unknown) => { r = { verdict: e instanceof QaError ? e.verdict : 'plain error', message: (e as Error).message }; });
  expect({ verdict: r.verdict, says: /wait for (it|the other run)/i.test(r.message) }).toEqual({ verdict: 'INFRA_FAIL', says: true });
});

test('a root without qa.config.json is SPEC_INVALID with a sentence that says where --root must point', () => {
  const r = caught(() => loadConfig(path.join(packageRoot(), 'reports', 'selftest', 'no-such-root')));
  expect({ verdict: r.verdict, says: /--root/.test(r.message) }).toEqual({ verdict: 'SPEC_INVALID', says: true });
});

test('compile onto a file that is in the way (a dangling link) is FILE_CONFLICT, nothing written', () => {
  const root = workspace('unit-compile-link', [REF]);
  example(root, REF, true);
  fs.symlinkSync(path.join(root, 'nowhere.ts'), files.test(root, REF));
  const r = caught(() => compile(root, REF, false));
  const verdict = r.verdict === 'none' ? compile(root, REF, false).verdict : r.verdict;
  expect({ verdict, written: fs.existsSync(path.join(root, 'nowhere.ts')) }).toEqual({ verdict: 'FILE_CONFLICT', written: false });
});

test("doctor type-checks the rules file with the root's own tsc and reports the first message as LINT_FAIL", () => {
  test.setTimeout(30_000);
  const root = workspace('unit-doctor-tsc', [REF]);
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ extends: path.join(packageRoot(), 'tsconfig.json'), include: ['app/**/*.ts'] }));
  fs.writeFileSync(files.pricing(root, 'reference'), rulesFile("{ subtotalAtLeast: '50.00' }", "export const broken: number = 'text';"));
  expect(doctor(root, false).lines.some((l) => /^LINT_FAIL: .*reference\.pricing\.ts.*TS2322/.test(l))).toBe(true);
});
