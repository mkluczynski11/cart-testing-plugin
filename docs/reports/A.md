## A exit report

Branch `a-core`, worktree `.worktrees/a-core`. All commands below were run in `templates/e2e/` unless noted.

**Exit criteria**

| # | Command | Result | Status |
| --- | --- | --- | --- |
| 1 | `npm ci` | `found 0 vulnerabilities`, exit 0 | PASS |
| 2 | `npm run test:unit` | `60 passed (1.2s)`, exit 0 | PASS |
| 3 | `npm run qa -- selftest` | 10/10 cases PASS, unit PASS, 7.2 s, `VERDICT: PASS`, exit 0 | PASS |
| 4 | `npm run qa -- gates cart-total-add-change-remove` | `VERDICT: GATES_OK`, exit 0 (1.3 s) | PASS |
| 5 | `git status --short` (after the final commit) | empty output | PASS |
| 6 | `git worktree list` (run from the worktree) | lists `.worktrees/a-core` on `[a-core]` | PASS |
| 7 | `tests/cart-total-add-change-remove.spec.ts` committed; `npm run qa -- compile cart-total-add-change-remove` | `tests/cart-total-add-change-remove.spec.ts is up to date; nothing written.` `VERDICT: PASS` | PASS |

Selftest output (3):

```text
unit  PASS  60 passed (1.1s)
 1  PASS  reference scenario: example, confirm, compile x2, gates (1.2s): GATES_OK; changed scenario refused; 8 detected, 3 n/a
 2  PASS  swapped objects: setQty on B, remove A (1.1s): GATES_OK
 3  PASS  two adds of 2 units: state 4, needQty 4, add-replaces-quantity detected (0.5s): final A=4, needQty 4, add-replaces-quantity detected at S2; gates GATES_OK
 4  PASS  same request written wrongly (S2 state 2): SPEC_INVALID V4 (0.0s): V4 S2: Step S2 (add A+2) says cart_after A×2 but the cart then holds A×4; write cart_after: { A: 4 }.
 5  PASS  step with no state change: SPEC_INVALID V5 (0.0s): V5 S2: Step S2: setQty A to 1 does not change the cart (it already holds 1); remove the step or change it so the cart changes.
 6  PASS  eco discount on both sides of the 50% threshold (1.1s): discount at S1 (1/1) and S3 (2/3), not at S2 (exactly 1/2) or S4 (2/5); discount-not-applied and total-truncated detected; gates GATES_OK
 7  PASS  checkpoint after S3 removed by hand: FILE_CONFLICT, DEFECT_MISSED (1.1s): missed: total-stale-after-setqty
 8  PASS  driver-reads-subtotal: red with LOCATOR_FAIL (scenario with a discount) (0.5s): LocatorError: LOCATOR_FAIL at S1 (add A+1)
 9  PASS  removing the only line: green checkpoint on the empty cart (0.5s): 2 checkpoints green; S2 shows an empty cart
10  PASS  money parser: all formats (0.0s): 12 formats
10/10 cases passed, unit tests passed; 7.2s
VERDICT: PASS
```

Gates output (4):

```text
Gates for cart-total-add-change-remove (reference cart, 11 defects)
G0 ok: scenario valid and frozen; test compiled from the current scenario
G1 ok: green on the healthy reference cart
G2 defect                     result          red at  first diff
   total-ignores-quantity     detected        S3      S3
   total-stale-after-setqty   detected        S3      S3
   total-stale-after-remove   detected        S4      S4
   setqty-ignored             detected        S3      S3
   remove-ignored             detected        S4      S4
   remove-wrong-line          detected        S4      S4
   add-replaces-quantity      not-applicable  -       -
   line-total-wrong           detected        S3      S3
   discount-not-applied       not-applicable  -       -
   total-truncated            not-applicable  -       -
   driver-reads-subtotal      detected        S1      S1  (LOCATOR_FAIL)
VERDICT: GATES_OK
```

Also checked: with no `QA_DRIVER`, the compiled test fails with `INFRA_FAIL: live driver not installed`, and no
page or browser is used.

**Deviations from this order**

1. Dependency `@types/node` (dev) added. Reason: without it `tsc --noEmit` cannot type-check the code
   (`node:fs`, `__dirname`, `require.resolve`). Runtime behaviour is unaffected.
2. Extra files beyond §2: `support/harness/commands.ts` (example/confirm/compile), `support/harness/gates.ts`
   (G0–G2 + Playwright runner), `support/harness/selftest.ts`. They keep `cli.ts` small. Config loading
   (`loadConfig`, `qaRoot`) lives in `scenario.ts`, so the CLI never imports `@playwright/test`. Unit tests:
   `unit/{money,validator,ledger,compiler,checkpoint}.spec.ts`.
3. V1 is slightly stricter than listed:
   - the scenario `id` must equal the file slug (the fixture loads `specs/<id>.md` at run time);
   - aliases must match `^[A-Z][A-Z0-9_]*$` and must not lower-case to a JS reserved word, because they become
     variables (`A` → `a`);
   - unknown fields on products and steps are rejected (closed grammar).
4. V5 and V6 overlap. A `setQty` to the current quantity ("qty differs from current" in the table) is reported
   only as **V5**, because it is the one step that is otherwise valid but changes nothing. All other table
   conditions are V6.
5. Positive verdicts for `example`, `confirm` and `compile` are `PASS`, since the dictionary has no other fit.
   Other verdict choices:
   - a failing `selftest` ends `INFRA_FAIL`;
   - in G0, a missing test or one compiled from an older scenario hash is `FILE_CONFLICT` ("run compile");
   - a G1 red ends with that run's own verdict (e.g. `ORACLE_MISMATCH`);
   - a G2 run that is red outside a checkpoint (precondition or infra failure) gets result `error` and that
     run's verdict.
6. Adjustment amounts are compared by absolute value, taken from design §9.3: apps write a discount's sign
   differently, and the total checks the direction. Label matching is as ordered.
7. The `// request:` header line holds the full request with whitespace collapsed (not truncated with "…").
8. `confirm` replaces only the value token on the `status:` line, so the trailing comment's column shifts by
   four characters. The lock file is `{ scenario, sha256 }` with no timestamp, so it stays deterministic.
9. The shopper reads the scenario at run time (via `test.use({ scenario })`) to get aliases and step ids for
   messages, and maps the test's i-th action to step i. A test that drifts from the scenario fails with
   `INFRA_FAIL … recompile the test`.
10. Selftest runs each case in `reports/selftest/runs/<case>/` (gitignored by `reports/*/runs`). In each one,
    `support/` and `app/` are symlinks, so the fixed import `../support/core/fixtures` still resolves. The
    harness accepts `--root <dir>` / `QA_ROOT` for this.
11. TypeScript resolved to 7.0.2, which removed `moduleResolution: node10`, so `tsconfig.json` uses
    `module: nodenext` (CommonJS package).

**Observations**

- **Selftest caught my own wrong expectation (case 6).** I first expected no discount at S1. The code correctly
  applied it: one Wood Saw is 1/1 = 100% of units rated B. The final fixture covers all four positions:
  above (S1), exactly 0.5 and not applied (S2), above (S3), below (S4).
- Two bugs in my own unit tests, found on the first run:
  - an `Object.create(cart)` wrapper split `this` state between the wrapper and the cart;
  - the compiler unit test read `specs/…md`, which became `confirmed` once I confirmed it. It now reads the
    draft fixture copy.
- **Mutation check of the gates.** With layer 2 (line totals) disabled in `checkpoint.ts`, `gates` reported
  `line-total-wrong  missed` and `VERDICT: DEFECT_MISSED`. File restored afterwards.
- **Half-cent blind spot.** With the order's tolerance (|expected − displayed| ≤ 0.5 cent), `total-truncated` is
  only detectable when the exact total's fraction of a cent is above 0.5. At exactly 0.5 both the rounded and
  the truncated value are within tolerance. With a 5% discount this happens when the pre-discount amount in
  cents C ≡ 10 (mod 20). The case 6 prices give S3 = $39.9855 (fraction 0.55), so the defect is detected.
- On the reference catalog the reference scenario picks Claw Hammer (D) and Combination Pliers (C). No eco
  discount fires, so `discount-not-applied`, `total-truncated` and `add-replaces-quantity` are
  `not-applicable` there. Case 6 and case 3 cover them.
- The reference cart and the ledger share `pricing.ts` (rule evaluation). A bug in rule evaluation would hit
  both sides and the gates would not see it. The unit tests for `conditionHolds`/`applyRules` are the only
  guard.
- Timing: gates run 1 + 8 Playwright processes in parallel, about 1.3 s in total. Full selftest about 7 s.
- The example message in §3.9 (`displayed: $40.31`) cannot be produced by any defined defect. The exact format
  is asserted in `unit/checkpoint.spec.ts` with `total-stale-after-setqty` (`displayed: $26.16`).

**Open questions**

1. `percentOf: 'running'` with `rate: '5'` is implemented as a deduction (−5%). A surcharge cannot be expressed.
   Should the sign be explicit (e.g. `rate: '-5'`)?
2. G2 compares views at every step, as ordered. The design compares only at checkpoints. Under the order's
   rule, a `check: last-step` scenario reports defects visible only mid-scenario as `missed` (DEFECT_MISSED).
   Is that intended?
3. The freeze hash covers only the scenario. The design also hashes the rules file, so a change to
   `app/<app>.pricing.ts` does not invalidate a confirmed scenario today.
4. **Shared contract with Order B:** besides §3.1, B's `app/toolshop.pricing.ts` must export `summary`,
   `rules` and `constraints` with the types in `support/core/pricing.ts`.
5. **Live fixture:** the stub in `fixtures.ts` needs the driver module path, the pricing file
   (`app/${config.app}.pricing.ts`), and `settleMs` from config. How should it receive `page`?
6. Should a checkpoint also compare the subtotal value? It is not in the §3.9 layer list, so it is not done.

**Out of scope, proposed** (seen in the design, not implemented)

- Pick `where` filters; driver `controls` / `provides`; `listPrice`; `price_source: api`; `preconditions`.
- Verdicts `DEFECT_LATE` and `NO_TESTS_RUN` (`detected-late` is reported as a result but does not block).
- Operator-derived defect list (`rule-always`, `rule-wrong-rate`, `rule-boundary`, `total-off-by-cent`,
  `lost-add`, `qty-wrong-line`) and custom defects (`specs/<slug>.defects.json`).
- Subcommands `doctor`, `need`, `defects list|check`, `run`, `verify`, `report`; run evidence in
  `reports/<slug>/`.
- Soft assertions: continue after a red checkpoint so the report shows every checkpoint.
- Subtotal value layer; rule provenance; a wider condition vocabulary (`always`, `hasUnits`, `subtotalAtLeast`)
  and fixed amounts.
- Locale-aware amount parser driven by `qa.config.json`; a full diff output on `FILE_CONFLICT` (currently up to
  6 lines).
- An independent price computation in the reference cart (see Observations).

**Measurements**

- Wall-clock: 00:29 (worktree created) to 00:48 (report written), by the session's system clock.
- Files committed under `templates/e2e/`: 40, including `package-lock.json`, 8 selftest fixtures, and the
  reference spec with its example, lock and compiled test.
- Lines of code:
  - `support/core`: 1,568 (13 files)
  - `support/harness` plus `app/reference.pricing.ts` plus `playwright.config.ts`: 697
  - unit tests: 527 (5 files, 60 tests)
  - selftest fixtures: 117 (8 files)
