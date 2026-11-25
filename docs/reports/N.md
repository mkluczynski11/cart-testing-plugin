# Report N: merge A and B, full harness of design v0.3

Branch `n-harness`, worktree `.worktrees/n-harness`. Started `Wed Nov 25 00:28:59 UTC 2026`.

## Plan

Time box 180 min from 00:28:59 UTC; no new stage after 02:58:59 UTC (150 min).

| Stage | Target | Budget |
| --- | --- | --- |
| 0 | merges, order committed, plan (this section) | 10 min |
| 1 | layout `templates/e2e` + `examples/toolshop`; driver on `support/core/money` and library errors; live fixture; `toolshop.map.md`; first live run | 30 min |
| 2 | grammar (`preconditions`, `price_source`, `where`), V1–V8 per 8.1, example with stubs and attribute search, freeze in the example, full driver interface, rule vocabulary, compiler 8.4, layered soft checkpoint with the 9.1 message | 40 min |
| 3 | operators and derived defects, `defects.json`, applicability, G0 (parser-based), G1, G2, verdict dictionary and routing, `doctor`, `need`, CLI names of 6.1 | 40 min |
| 4 | reporter, run directories, `run` G0–G3, attempts, promotion, `report.md`, `cart-eco-threshold`, negative checks | 30 min |
| 5 | live controls, control page with its drivers, browser selftest rows, `verify` | 30 min |

Files (new or rewritten), all under `templates/e2e/` unless noted:

- `support/core/`: `types.ts` (8.3 interface), `money.ts` (locale/currency parser), `pricing.ts` (9.2 vocabulary),
  `config.ts` (qa.config.json, roots), `scenario.ts` (grammar, hashes, freeze), `validator.ts` (V1–V8),
  `ledger.ts`, `example.ts` (stubs, attribute search, gaps), `compiler.ts` (8.4), `selection.ts` (8.3 product
  selection), `shopper.ts`, `checkpoint.ts` (9.1 layers, message), `reference-cart.ts`, `operators.ts` (10.3,
  6.2 of the order), `fixtures.ts`, `reporter.ts` (8.5), `live-controls.ts` (10.6), `verdicts.ts` (6.3 + routing),
  `MANIFEST.json`.
- `support/harness/`: `cli.ts`, one module per subcommand (`example`, `compile`, `need`, `defects`, `run`,
  `verify`, `report`, `doctor`, `selftest`), `lint.ts` (G0), `gates.ts` (G1/G2), `playwright-runner.ts`,
  `run-dir.ts`, `manifest.ts`, `fixtures/` (selftest scenarios, `reference.pricing.ts`), `control-app/`
  (server, page, drivers, pricing, config).
- `unit/`: one spec per core module.
- `examples/toolshop/`: `qa.config.json`, `app/toolshop.{driver,pricing}.ts`, `app/toolshop.map.md`,
  `lab/driver.live.spec.ts`, `specs/`, `tests/`, `reports/`, `support` symlink, `tsconfig.json`.

Approach: keep order A's modules where they already match the design and rewrite in place; one commit per
stage; live budget counted below; every stage ends with unit tests, selftest and `tsc` green.

Live invocations used: 13 / 20 (counted in Measurements).

Open questions are collected at the end of this report, after the negative checks and the design findings.

## Stage 1 — reconcile A and B, new layout, first live green

Started `Wed Nov 25 00:32:37 UTC 2026`, committed `8d38db0` at 00:52 UTC.

Built:
- Layout of order section 1. `templates/e2e/` holds only the library, the harness, the unit tests and empty
  `specs/ tests/ app/ reports/`; `examples/toolshop/` holds `qa.config.json` (settleMs 1000, probeMs 5000),
  `app/toolshop.{driver,pricing}.ts`, `app/toolshop.map.md`, `lab/driver.live.spec.ts` (project `driver-live`),
  the scenario, its example and compiled test, and the committed symlink `support -> ../../templates/e2e/support`.
  `scratch/` is deleted. `npm run qa:toolshop` = the CLI with `--root ../../examples/toolshop`;
  `npm run typecheck:toolshop` type-checks the example root through its own `tsconfig.json` (`paths` for
  `@playwright/test` and `yaml`). The fallback of section 1 was not needed.
- The driver parses amounts with `support/core/money` (`parseAmount`, the product page with the symbol
  optional) and throws `PreconditionError` (with the alert text), `LocatorError` and `InfraError`;
  `toolshop.money-temp.ts` is deleted. `toolshop.pricing.ts` is typed with the library's types; every entry has
  provenance.
- The live fixture: the app named in the root's `qa.config.json`, its driver and rules file, a fresh browser and
  context per test launched from the `playwright` fixture (so project `dry` never starts a browser), `locale` and
  `testIdAttribute` from the config, `permissions: []`, no storage state, a trace kept only for a failed repeat.
- Most of the library was rewritten in its final form here rather than patched twice: `money` (locale and currency
  parser via Intl separators, no float), `pricing` (9.2 vocabulary), `scenario`, `validator` (V1–V8 renumbered to
  8.1), `ledger`, `example`, `compiler`, `checkpoint` (all layers, soft), `shopper`, `selection`, `operators`,
  `reference-cart`, `verdicts` (full dictionary). The CLI of stage 1 has `selftest`, `example`, `compile`, `run`.

First joint live run of A's oracle and B's driver. It failed twice before it was green, both times on the
empty-cart precondition, not on an amount:

1. Run `20261125T004524Z-b5c5`: `INFRA_FAIL` (then misclassified; fixed: a setup error now carries its own
   verdict). In a session that never had a cart, `/checkout` renders neither the table nor the empty message.
   Probe (invocation 2): the page shows only the navigation; no `nav-cart`.
2. Run `20261125T004716Z-5ce0`: `FLAKY`, 2/3 pass. The failed repeat's trace shows the application throwing
   `TypeError: Cannot read properties of null (reading 'cart_items')` in a loop on `/checkout` without a cart, and the
   page never rendering. Fix: `readCart` in a session without a cart reads the header (no `nav-cart` counter =
   no cart) and goes to `/checkout` only when a cart exists (`toolshop.map.md`, `readCart` row).
3. Run `20261125T004827Z-92d2`:

```text
Run 20261125T004827Z-92d2 of cart-total-add-change-remove
G3 live, 3 repeat(s) on https://practicesoftwaretesting.com: 3/3 pass; 3/3 repeats ended PASS
   products: Combination Pliers ($14.15, co2_rating D)
   S1   add Combination Pliers, 1 unit         expected $14.15    displayed "$14.15" in row "Total"  pass
   S2   add Pliers, 1 unit                     expected $26.16    displayed "$26.16" in row "Total"  pass
   S3   set quantity of Combination Pliers to 3 expected $54.46    displayed "$54.46" in row "Total"  pass
   S4   remove Pliers                          expected $42.45    displayed "$42.45" in row "Total"  pass
Evidence: reports/cart-total-add-change-remove/runs/20261125T004827Z-92d2/
VERDICT: PASS
```

The amounts equal order B's H2 prediction and its live readings exactly.

Checks: `npm run test:unit` 105 passed; `npm run qa -- selftest` 5/5 rows (unit, money, validator, compiler,
product selection) `VERDICT: PASS`; `npx tsc --noEmit` clean in `templates/e2e` and for the example root.

Deviations:
- The selftest fixtures and the reference rules file no longer use Toolshop names or prices (Wood Saw, Claw
  Hammer, $14.15, `co2_rating`): the reference app's rule is `green-discount` on `energy_class`. Reason: quality bar,
  "templates/e2e contains no Toolshop name, selector, product or price".
- The design's `Displayed.value` is kept in the driver contract, but the checkpoint re-parses every `rawText`
  with the configured locale and currency, so a driver cannot hand the oracle a value the page did not show.

## Stage 2 — contracts and oracle as designed (8.1–8.4, 9.1–9.3)

Started `Wed Nov 25 00:53:08 UTC 2026`, committed `0736af5` at 00:55 UTC.

Built (most of it already written in final form during stage 1; listed here against the order):
- Grammar: `preconditions` (`empty-cart`, `guest`, `no-geolocation`) and `price_source` are required fields
  (V1); `where` on unnamed picks. V1–V8 with the numbering of 8.1: V4 step conditions, V5 a `setQty` that
  changes nothing, V6 `cart_after` agreement, V7 checkpoints including "the last step has a checkpoint", V8
  limits from the rules file (by-name products also get their product-specific limits).
- Freeze: `example <slug> --confirm` sets `status: confirmed` and writes `confirmed: { scenarioSha256,
  rulesSha256 }` into the example. The lock file is gone. A changed scenario or rules file is reported by name
  (`scenario-changed`, `rules-changed`).
- Example (8.2, order 6.1): stubs `Product A`, `Product B`… or the `by-name` name; $10, $20… in declaration order;
  the attribute search over "first alias matching, then the next combination", pinned by `where`; a rule that is
  always or never in force is a scenario gap, never a failure. The reference scenario reproduces 8.2:
  $9.50 · $30.00 · $47.50 · $28.50.
- Driver interface 8.3 in full (`controls`, `provides`, optional `setAttribute`, `apiPrice`, `listPrice`);
  `ProductFilters { needQty, where }`; selection in `support/core/selection.ts`.
- Rule vocabulary 9.2: `always`, `shareOfUnits`, `hasUnits`, `subtotalAtLeast`; percent of the subtotal, of the
  running value, or fixed. The "rules only reduce" comment is at the top of `pricing.ts`.
- Compiler output as 8.4: `test.use({ preconditions, priceSource[, reserved] })`, `filters: { needQty[, where] }`,
  a blank line after each checkpoint; golden file `support/harness/fixtures/golden/reference.spec.txt`.
- Checkpoint 9.1: layers state, labels (and "is it an amount" — read errors before any amount), lines, unit price,
  line total (exact), adjustments (by absolute value), subtotal (exact), total (half a cent); soft: the shopper
  records a red checkpoint, keeps going from the expected state, and fails at the last checkpoint with the first
  mismatch. Verdict precedence inside a checkpoint: LOCATOR_FAIL > UNMODELED_ADJUSTMENT > ORACLE_MISMATCH.
- Fixture: preconditions before the first step (6.8); `price_source: api` takes the unit price from `apiPrice`
  and checks the product page price at the next checkpoint.
- `run <slug> --dry` = G1: the compiled test on the reference cart with the example's stubs; the ledger trace must
  equal `cart_after` and every checkpoint's exact total must equal the example's (`CONFORMANCE_FAIL` otherwise).

Check output:

```text
$ npm run test:unit            -> 112 passed
$ npm run qa:toolshop -- run cart-total-add-change-remove --dry
Run 20261125T005309Z-9028 of cart-total-add-change-remove (dry)
G1 ok: green on the healthy reference cart; ledger trace equals cart_after; totals equal the approved example
VERDICT: PASS
$ npm run qa:toolshop -- run cart-total-add-change-remove        (live invocation 5)
Run 20261125T005355Z-b4d8 of cart-total-add-change-remove
G1 ok: green on the healthy reference cart; ledger trace equals cart_after; totals equal the approved example
G3 live, 3 repeat(s) on https://practicesoftwaretesting.com: 3/3 pass; 3/3 repeats ended PASS
   products: Combination Pliers ($14.15, co2_rating D) · Pliers ($12.01, co2_rating D)
   S1   add Combination Pliers, 1 unit         expected $14.15    displayed "$14.15" in row "Total"  pass
   S2   add Pliers, 1 unit                     expected $26.16    displayed "$26.16" in row "Total"  pass
   S3   set quantity of Combination Pliers to 3 expected $54.46    displayed "$54.46" in row "Total"  pass
   S4   remove Pliers                          expected $42.45    displayed "$42.45" in row "Total"  pass
Evidence: reports/cart-total-add-change-remove/runs/20261125T005355Z-b4d8/
VERDICT: PASS
```

Deviations and choices:
- `ExampleRow` carries `totalExact` (the exact fraction) besides the rounded `total`, so G1 compares "exactly"
  (order 6.1) and not on rounded strings.
- V3 "lists all earlier aliases" is read as "all earlier unnamed aliases": a by-name product is already excluded by
  `reserved`, and the order's own `cart-eco-threshold` (A by-name, B `first-available`) requires it.
- The reference cart displays a rule's row with a literal text derived from its label pattern
  (`/^total\b/i` → `total`); a pattern that is not plain text is rejected with a message. The design does not say
  how the in-memory cart labels its rows.

## Stage 3 — verification without a browser (10.1–10.5, 6.1, 6.3)

Started `Wed Nov 25 00:55:12 UTC 2026`, committed `c44aa6d` at 01:01 UTC.

Built:
- `support/core/operators.ts`: the ten operators of 10.3 with the ids and effects of order 6.2; `deriveDefects`
  gives exactly the thirteen of 10.1 for the reference scenario (unit test). `wrong-target` only for kinds that run
  while the cart holds two or more lines; rule operators per rule, with `:<id>` when there are several rules.
  `reference-cart.ts` implements every effect, including `when` (`afterStep`, `direction`).
- G2 (`support/harness/gates.ts`): both carts are simulated in-process on the same products; the expected place is
  the first checkpoint where the serialized views differ; then the compiled test runs in Playwright project `dry`
  with the defect on (6 processes at a time); results `detected`, `detected-late`, `missed`, `not-applicable`;
  scenario gaps with a hint per operator. `DEFECT_MISSED` outranks `DEFECT_LATE`.
- Additional defects (`specs/<slug>.defects.json`): `defects list` and `defects check` with the admission rules of
  order 6.2 and R12 (unknown operator, target absent from the scenario and the rules, twin of an admitted defect at
  every checkpoint, more than 8). Origins `tester` and `generated` are both accepted; no agent is involved.
- G0 (`support/harness/lint.ts`) on a syntax tree from **@babel/parser 7.29.15** (new dev dependency): TypeScript
  7.0.2 has no `createSourceFile` (`typeof ts.createSourceFile === 'undefined'`). Test rules and driver rules of
  order 6.3; a violation is `LINT_FAIL` with file, line and rule. The Toolshop driver had one finding, a fake URL
  base `new URL(page.url(), 'http://x')`, now fixed.
- `verdicts.ts`: the full dictionary of 6.3 and the routing table for `CONTROL_MISSED` and `FLAKY` as data.
  Positive verdicts `PASS`, `INTENT_OK`, `VERIFIED`; `GATES_OK` is gone.
- `doctor` (Node, Chromium, `MANIFEST.json`, `SCENARIO_CHANGED`, `VERIFICATION_STALE`, the driver's interface at
  run time and its UI boundary through the G0 driver rules) and `doctor --write-manifest`; `need`.
- CLI names of 6.1; `confirm` and `gates` are gone; every subcommand ends with at most 15 lines and the verdict;
  `--help` lists one line per subcommand. `run` probes the application address before the browser (`INFRA_FAIL`).
- Selftest rows without a browser: money, validator, compiler, product selection, reference cart (three
  scenarios), equal prices, empty cart, classification, parallelism, integrity.

Check output:

```text
$ npm run qa -- selftest
unit tests         PASS  112 passed (721ms)
money              PASS  16 formats in 2 locales, foreign currency and non-amounts rejected
validator          PASS  each of V1–V8 gives SPEC_INVALID naming that rule
compiler           PASS  golden file byte for byte; two compilations equal; a hand edit gives FILE_CONFLICT
product selection  PASS  needQty 4 for two adds of 2; an unnamed pick skips "Green Lamp", named by a later alias
reference cart     PASS  healthy carts green; every applicable default defect red where expected (cart-total-add-change-remove 12/13, swapped-objects 12/13, green-threshold 10/11)
equal prices       PASS  all stubs at $10.00: qty-wrong-line and remove-wrong-line still detected, so lines are compared
empty cart         PASS  green with a zero total and without a total element; lost-remove red at S2
classification     PASS  unreachable address INFRA_FAIL; PreconditionError PRECONDITION_FAIL; zero tests NO_TESTS_RUN; action failure after a red checkpoint ORACLE_MISMATCH
parallelism        PASS  two runs at once: 20261125T010008Z-4a8e and 20261125T010008Z-0bab, each with its own evidence
integrity          PASS  support/core and support/harness match support/core/MANIFEST.json
11/11 rows passed in 15.5 s.
VERDICT: PASS

$ npm run qa:toolshop -- run cart-total-add-change-remove --dry
Run 20261125T010058Z-08d2 of cart-total-add-change-remove (dry: gates G0–G2 on the reference cart)
G0 ok: no forbidden pattern; the test is the untouched compilation of the confirmed scenario
G1 ok: green on the healthy reference cart; ledger trace equals cart_after; totals equal the approved example
G2 13 defects: 12 detected where expected, 0 late, 0 missed, 1 not applicable
Scenario gap: round-down is not applicable: No amount at a checkpoint has a fraction of a cent above one half; other products or quantities would expose truncation.
Evidence: reports/cart-total-add-change-remove/runs/20261125T010058Z-08d2/
VERDICT: PASS
```

Negative check (temporary copy of the root in the scratchpad, the checkpoint after S3 removed by hand):

```text
$ npm run qa -- compile cart-total-add-change-remove --root <copy>
tests/cart-total-add-change-remove.spec.ts was edited by hand, so nothing was written. Differences:
  - compiled: await shopper.checkTotal('S3');
Move the change into the scenario, or run compile with --force to discard the edit.
VERDICT: FILE_CONFLICT
$ npm run qa -- run cart-total-add-change-remove --dry --root <copy>
Run 20261125T005802Z-671e of cart-total-add-change-remove (dry: gates G0–G2 on the reference cart)
G0 ok: no forbidden pattern; the test is EDITED BY HAND after compilation
G1 ok: green on the healthy reference cart; ledger trace equals cart_after; totals equal the approved example
G2 13 defects: 9 detected where expected, 3 late, 0 missed, 1 not applicable
   lost-qty detected-late: expected red at S3, first red S4; no checkpoint judges the change before S4
   qty-wrong-line detected-late: expected red at S3, first red S4; no checkpoint judges the change before S4
   line-ignores-qty detected-late: expected red at S3, first red S4; no checkpoint judges the change before S4
Scenario gap: round-down is not applicable: …
VERDICT: DEFECT_LATE
```

(The wording of the late line was then changed to "the test has no checkpoint after S3; recompile it from the
scenario", the diagnosis 10.2 asks for.)

Choices:
- Completeness (`NO_TESTS_RUN`) counts the `checkTotal` calls of the test file itself, read from its syntax tree,
  not the scenario's checkpoints: otherwise a hand-edited test with a removed checkpoint would stop at
  `NO_TESTS_RUN` and never reach the `DEFECT_LATE` that 10.2 describes.
- A defect run that is red only through an action failure (no red checkpoint) counts as `detected` with a note;
  this happens with `check: last-step` after `lost-add`, when a later `setQty` finds no line.
- `defects check` ends `SPEC_INVALID` when any entry is rejected and `PASS` otherwise; a defect that changes no
  checkpoint is admitted as a scenario gap and is never called a twin of another such defect.
- `need` and `doctor` end `LINT_FAIL` for a missing action or attribute ("mismatched types in the driver", 6.3);
  missing request bindings are lower coverage and do not fail `need`.
- `doctor` checks the driver's interface at run time (methods, `controls`, `provides.attrs`) on a driver created
  with a page that throws on any access; the static type check is `npm run typecheck:toolshop` (tsc), not part of
  `doctor`, to keep it fast and independent of a root's tsconfig.

## Stage 4 — runs and evidence (6.1, 8.5)

Started `Wed Nov 25 01:02:20 UTC 2026`, committed `a1737a6` at 01:11 UTC.

Built:
- `support/core/reporter.ts`: a Playwright reporter that writes `run.json` (8.5: `meta`, `verdict`, `repeats` with
  every checkpoint, the failure record `error: { step, kind, message, url, rawTotal }`, raw text of every amount) on
  `onBegin`, every `onTestEnd`, `onError` and `onEnd`; a timed-out repeat gets an `INFRA_FAIL` record with the last
  step. The first repeat's full-page screenshots are copied next to it as `<step>.png`. `classification.ts` (core)
  holds the run record types and the 6.1 classification shared by the reporter and the harness.
- Run directories `reports/<slug>/runs/<YYYYMMDDTHHMMSSZ-xxxx>/` created with an exclusive `mkdir`; the lock
  `reports/<slug>/.lock` (exclusive create, stale after 10 minutes) guards `attempts.json` and promotion. The
  Playwright HTML report goes to `runs/<runId>/html/` with `open: 'never'`; a trace only for a failed repeat.
- `run <slug>`: G0–G2 dry, the address probe (`INFRA_FAIL` before any browser), G3 with `repeat` repeats and the
  6.1 classification (`INFRA_FAIL`, first failed step, `FLAKY`, `NO_TESTS_RUN`), then G2 again on the products the
  live run read (order 6.6, last bullet); `verification.json`, the final verdict in `run.json`, and `report.md` in
  the run directory. `run <slug> --repair driver|test` with `attempts.json` (R9).
- `report <slug>` writes `report.md` for the latest run and prints the 11.2 readback; `report <slug> --promote
  <runId>` builds the complete set in `reports/<slug>/.promote-<runId>/`, moves the previous set aside, renames
  the new files into place and removes the old ones, under the lock.
- `report.md`: verdict line, products with alias, price and attributes, the step table (expected, its composition,
  the displayed raw text, the row read, the result, the screenshot), what failed, the evidence that exists and the
  evidence that does not, scope (did the total differ from the subtotal and every line), scenario gaps with hints,
  rules with provenance and where they were in force, the rerun command from the repo root, how to read a failure.
- `examples/toolshop/specs/cart-eco-threshold.md` as ordered (A by-name "Wood Saw", B first-available).

Live checks (invocations 6 and 7):

```text
Run 20261125T010511Z-7186 of cart-total-add-change-remove
G0 ok: no forbidden pattern; the test is the untouched compilation of the confirmed scenario
G1 ok: green on the healthy reference cart; ledger trace equals cart_after; totals equal the approved example
G2 13 defects: 12 detected where expected, 0 late, 0 missed, 1 not applicable
G3 live, 3 repeat(s) on https://practicesoftwaretesting.com: 3/3 pass; 3/3 repeats ended PASS
   products: Combination Pliers ($14.15, co2_rating D) · Pliers ($12.01, co2_rating D)
   S1   add Combination Pliers, 1 unit         expected $14.15    displayed "$14.15" in row "Total"  pass
   S2   add Pliers, 1 unit                     expected $26.16    displayed "$26.16" in row "Total"  pass
   S3   set quantity of Combination Pliers to 3 expected $54.46    displayed "$54.46" in row "Total"  pass
   S4   remove Pliers                          expected $42.45    displayed "$42.45" in row "Total"  pass
G2 again on the products of this run: 13 defects: 9 detected where expected, 0 late, 0 missed, 4 not applicable
Evidence: reports/cart-total-add-change-remove/runs/20261125T010511Z-7186/
VERDICT: PASS
Run 20261125T010538Z-fccb of cart-eco-threshold
G0 ok: no forbidden pattern; the test is the untouched compilation of the confirmed scenario
G1 ok: green on the healthy reference cart; ledger trace equals cart_after; totals equal the approved example
G2 13 defects: 11 detected where expected, 0 late, 0 missed, 2 not applicable
G3 live, 3 repeat(s) on https://practicesoftwaretesting.com: 3/3 pass; 3/3 repeats ended PASS
   products: Wood Saw ($12.18, co2_rating B) · Combination Pliers ($14.15, co2_rating D)
   S1   add Wood Saw, 1 unit                   expected $11.57    displayed "$11.57" in row "Total"  pass
   S2   add Combination Pliers, 2 units        expected $40.48    displayed "$40.48" in row "Total"  pass
   S3   set quantity of Wood Saw to 3          expected $61.60    displayed "$61.60" in row "Total"  pass
   S4   remove Combination Pliers              expected $34.71    displayed "$34.71" in row "Total"  pass
G2 again on the products of this run: 13 defects: 12 detected where expected, 0 late, 0 missed, 1 not applicable
Evidence: reports/cart-eco-threshold/runs/20261125T010538Z-fccb/
VERDICT: PASS
```

Promotion (shortened to the last lines; both before and after a fix of the rerun line, see deviations):

```text
$ npm run qa:toolshop -- report cart-total-add-change-remove --promote 20261125T010511Z-7186
PASS 3/3 · run 20261125T010511Z-7186
S1   add Combination Pliers, 1 unit         $14.15    "$14.15"   match
S2   add Pliers, 1 unit                     $26.16    "$26.16"   match
S3   set quantity of Combination Pliers to 3 $54.46    "$54.46"   match
S4   remove Pliers                          $42.45    "$42.45"   match
Scenario gaps: 4 (see report.md)
Rerun: cd templates/e2e && npm run qa -- run cart-total-add-change-remove --root ../../examples/toolshop
Promoted run 20261125T010511Z-7186 to reports/cart-total-add-change-remove/: report.md, run.json, verification.json, screens/ (4).
VERDICT: PASS
$ npm run qa:toolshop -- report cart-eco-threshold --promote 20261125T010538Z-fccb
PASS 3/3 · run 20261125T010538Z-fccb
S1   add Wood Saw, 1 unit                   $11.57    "$11.57"   match
S2   add Combination Pliers, 2 units        $40.48    "$40.48"   match
S3   set quantity of Wood Saw to 3          $61.60    "$61.60"   match
S4   remove Combination Pliers              $34.71    "$34.71"   match
Scenario gaps: 1 (see report.md)
Rerun: cd templates/e2e && npm run qa -- run cart-eco-threshold --root ../../examples/toolshop
Promoted run 20261125T010538Z-fccb to reports/cart-eco-threshold/: report.md, run.json, verification.json, screens/ (4).
VERDICT: PASS
```

The eco scenario shows the discount on, off, on, on as ordered: 1 of 1, 1 of 3, 3 of 5, 3 of 3 units rated A or B.
On the live prices `round-down` becomes applicable and is detected (12/12); in the first scenario the two products
are rated D, so the eco rule is never in force live and four rule defects are scenario gaps there.
R15: a search of the promoted files for cookie, authorization, set-cookie, bearer and token finds nothing.

Repair attempts (dry, temporary root):

```text
Run 20261125T011033Z-b37e of cart-total-add-change-remove (dry: …), repair attempt 1
VERDICT: DEFECT_LATE
The test is unchanged since repair attempt 1 (sha256 084927a82c7c…); change the premise before another run.
VERDICT: RETRY_REFUSED
Run 20261125T011036Z-9e5c of cart-total-add-change-remove (dry: …), repair attempt 2
VERDICT: DEFECT_LATE
2 repair attempts of cart-total-add-change-remove are recorded, the limit; the last ended DEFECT_LATE (run 20261125T011036Z-9e5c). Hand the matter to the tester.
VERDICT: LIMIT_REACHED
```

Deviations and choices:
- `report.md` is written by `run` into every run directory and regenerated at promotion with links into
  `screens/`; `report <slug>` without `--promote` rewrites it for the latest run.
- Promotion moves the previous tracked set into `.previous-<runId>/` and renames the new files in one by one under
  the lock, rather than one directory rename: the tracked files sit directly in `reports/<slug>/` next to the
  untracked `runs/`, so a single rename of the set is not possible without changing the layout of 8.5.
- `attempts.json` limit: two repair runs per scenario; the third request is `LIMIT_REACHED` (order 6.5).

## Stage 5 — live controls and the control page (10.6, 10.8)

Started `Wed Nov 25 01:12:33 UTC 2026`, committed `843d254` at 01:23 UTC.

Built:
- `support/core/live-controls.ts`: `skew-total` as a `page.addInitScript` with a `MutationObserver`: it finds a leaf
  element (not in `th`/`thead`) whose trimmed text matches `summary.total.label`, takes its row (closest `tr`,
  `dl > div` group, `li`, or parent block), requires exactly one text node that reads as an amount, rewrites only
  the digits to +0.01 in the page's own format (integer cents in BigInt), re-applies after every render, and keeps
  `window.__qaControl = { activated, label, rowHtml (300 chars), shown[] }`. The checkpoint copies it into its
  record after the read. Network controls through `page.route` on the driver's bindings: `lost-update` and
  `lost-remove` answer with a success that was never executed (200 `{}`; DELETE 204), `drift-price` forwards the cart
  request and raises the price at `pricePath` by exactly 0.01 (decimal arithmetic, the JSON type kept).
- `verify <slug>`: G0–G3 as `run`, then one Playwright run per control with one repeat in
  `runs/<runId>/G4/<control>/`, the test limit extended by checkpoints × settleMs (8.6), the four facts per control
  (activated; element or request; what it showed at the read; first red), `not applicable` when the step kind is
  absent, `not bound: lower coverage` without a binding, `CONTROL_MISSED` with the routing evidence of 6.3.
- Control page (`support/harness/control-app/`): Node `http` server on 127.0.0.1 and an ephemeral port, started and
  stopped inside the selftest process; static HTML and vanilla JavaScript; JSON API `GET /api/products`,
  `GET /api/cart`, `POST /api/cart/items`, `PUT|DELETE /api/cart/items/:id`, a cart per `sid` cookie; a list with
  `dl` groups, `data-qa`, EUR as `1.234,50 €`, the subtotal row always shown, `0,00 €` in the empty cart, a status
  region; six products, one out of stock; its own 10% rule from 50,00 € computed in integer cents, importing nothing
  from `support/core`. `control.pricing.ts` states the rule with `subtotalAtLeast`; `control.driver.ts` and the
  wrong driver `control-wrong.driver.ts`.
- The Toolshop driver's `controls` bindings and `provides: { attrs: ['co2_rating'] }`; the response bodies behind
  them were read from a retained trace and recorded in `toolshop.map.md`.

Check output:

```text
unit tests         PASS  139 passed (802ms)
money              PASS  16 formats in 2 locales, foreign currency and non-amounts rejected
validator          PASS  each of V1–V8 gives SPEC_INVALID naming that rule
compiler           PASS  golden file byte for byte; two compilations equal; a hand edit gives FILE_CONFLICT
product selection  PASS  needQty 4 for two adds of 2; an unnamed pick skips "Green Lamp", named by a later alias
reference cart     PASS  healthy carts green; every applicable default defect red where expected (cart-total-add-change-remove 12/13, swapped-objects 12/13, green-threshold 10/11)
equal prices       PASS  all stubs at $10.00: qty-wrong-line and remove-wrong-line still detected, so lines are compared
empty cart         PASS  green with a zero total and without a total element; lost-remove red at S2
classification     PASS  unreachable address INFRA_FAIL; PreconditionError PRECONDITION_FAIL; zero tests NO_TESTS_RUN; action failure after a red checkpoint ORACLE_MISMATCH
control page       PASS  correct driver passes G3 and G4 (4/4 controls); wrong driver passes G3 on equal values, G4 CONTROL_MISSED "control active, test green"; with a discount LOCATOR_FAIL at the label layer
parallelism        PASS  two runs at once: 20261125T012327Z-10cd and 20261125T012327Z-4227, each with its own evidence
integrity          PASS  support/core and support/harness match support/core/MANIFEST.json
12/12 rows passed in 54.6 s.
VERDICT: PASS
```

```text
Verify 20261125T012028Z-8ed3 of cart-total-add-change-remove: gates G0–G4
G0 ok: no forbidden pattern; the test is the untouched compilation of the confirmed scenario
G1 ok: green on the healthy reference cart; ledger trace equals cart_after; totals equal the approved example
G2 13 defects: 12 detected where expected, 0 late, 0 missed, 1 not applicable
G3 live, 3 repeat(s) on https://practicesoftwaretesting.com: 3/3 pass; 3/3 repeats ended PASS
G2 again on the products of this run: 13 defects: 9 detected where expected, 0 late, 0 missed, 4 not applicable
G4 live controls: 4 caught, 0 missed, 0 not applicable, 0 not bound
   skew-total   caught         activated yes; first red S1; expected every checkpoint with a total red by exactly +$0.01
   drift-price  caught         activated yes; first red S1; expected first red at S1
   lost-update  caught         activated yes; first red S3; expected first red at S3
   lost-remove  caught         activated yes; first red S4; expected first red at S4
Evidence: reports/cart-total-add-change-remove/runs/20261125T012028Z-8ed3/
VERDICT: PASS
Verify 20261125T012124Z-9d5f of cart-eco-threshold: gates G0–G4
G0 ok: no forbidden pattern; the test is the untouched compilation of the confirmed scenario
G1 ok: green on the healthy reference cart; ledger trace equals cart_after; totals equal the approved example
G2 13 defects: 11 detected where expected, 0 late, 0 missed, 2 not applicable
G3 live, 3 repeat(s) on https://practicesoftwaretesting.com: 3/3 pass; 3/3 repeats ended PASS
G2 again on the products of this run: 13 defects: 12 detected where expected, 0 late, 0 missed, 1 not applicable
G4 live controls: 4 caught, 0 missed, 0 not applicable, 0 not bound
   skew-total   caught         activated yes; first red S1; expected every checkpoint with a total red by exactly +$0.01
   drift-price  caught         activated yes; first red S1; expected first red at S1
   lost-update  caught         activated yes; first red S3; expected first red at S3
   lost-remove  caught         activated yes; first red S4; expected first red at S4
Evidence: reports/cart-eco-threshold/runs/20261125T012124Z-9d5f/
VERDICT: PASS
```

Both verified runs are promoted (`report --promote 20261125T012028Z-8ed3` and `… 20261125T012124Z-9d5f`) in
place of the stage 4 runs; `report.md` now has the control table with the four facts.

Choices:
- The wrong driver of 10.8 is made concrete as "the label of the second summary group, the amount of the subtotal
  group": without a discount the second group is "Summe" and the amounts are equal, so G3 passes and `skew-total`
  (which finds "Summe" by itself) is missed with "control active, test green"; with a discount the second group
  is "Rabatt", so the label layer gives `LOCATOR_FAIL`. A driver that reads the label and the amount from one row
  cannot pass G3 on this page at all, so the design's row needs exactly this two-locator mistake.
- The wrong driver cannot import the correct one from `app/` (G0 forbids imports outside `support/core` and
  Playwright); selftest installs it as one file: the correct driver renamed, plus the wrapper.
- A faked success is `200 {}` (`204` for DELETE): the bindings are data only and carry no body. Toolshop accepts it
  (lost-update and lost-remove caught live); its real bodies are `{"result":"item added or updated"}` and 204.
- G0 exempts the test title from the "string that reads as an amount" rule: the compiled title of
  `control-discount` contains "50,00 €" and is a description, never an expected value.

## Final — polish and hand-over

Started `Wed Nov 25 01:24 UTC 2026` (stage 5 green), ended at 01:35 UTC with the last commit.

- `report.md` read as a QA engineer: the control table showed raw Angular HTML and cart ids, and the scope sentence
  was hard to parse. Fixed in the generator (`support/harness/report.ts`, `verify.ts`): the target names the row
  and keeps the DOM fragment in `verification.json`; network targets show the binding and counts; fact 3 shows
  what the driver read and what was expected; the scope line says plainly what the live run can and cannot tell
  apart. Both reports were regenerated by promotion, not edited.
- The first final eco `verify` (invocation 13) ended `FLAKY` 2/3: in repeat 2 the API answered nothing for 10 s
  (`QUERY /products`, `/brands`, `/categories/tree` without a response in the trace) and the driver called that a
  locator failure. The driver now waits for the listing response first and throws `InfraError` when it does not
  come (`toolshop.map.md`). That change made both verifications stale, which `doctor` reported:

```text
VERIFICATION_STALE: cart-eco-threshold: the driver changed after verification; run qa-harness verify cart-eco-threshold.
VERIFICATION_STALE: cart-total-add-change-remove: the driver changed after verification; run qa-harness verify cart-total-add-change-remove.
ok: Node 24.16.0, Chromium installed
ok: support/core and support/harness match the manifest
ok: cart-eco-threshold: confirmed, test compiled
ok: cart-total-add-change-remove: confirmed, test compiled
ok: driver app/toolshop.driver.ts satisfies CartDriver and stays within the UI
ok: rules file app/toolshop.pricing.ts loads
VERDICT: VERIFICATION_STALE
```

  Both scenarios were then verified again (invocations 14 and 15) and promoted:

```text
Verify 20261125T012823Z-d8c5 of cart-total-add-change-remove: gates G0–G4
G0 ok: no forbidden pattern; the test is the untouched compilation of the confirmed scenario
G1 ok: green on the healthy reference cart; ledger trace equals cart_after; totals equal the approved example
G2 13 defects: 12 detected where expected, 0 late, 0 missed, 1 not applicable
G3 live, 3 repeat(s) on https://practicesoftwaretesting.com: 3/3 pass; 3/3 repeats ended PASS
G2 again on the products of this run: 13 defects: 9 detected where expected, 0 late, 0 missed, 4 not applicable
G4 live controls: 4 caught, 0 missed, 0 not applicable, 0 not bound
   skew-total   caught         activated yes; first red S1; expected every checkpoint with a total red by exactly +$0.01
   drift-price  caught         activated yes; first red S1; expected first red at S1
   lost-update  caught         activated yes; first red S3; expected first red at S3
   lost-remove  caught         activated yes; first red S4; expected first red at S4
Evidence: reports/cart-total-add-change-remove/runs/20261125T012823Z-d8c5/
VERDICT: PASS
Verify 20261125T012915Z-a9a2 of cart-eco-threshold: gates G0–G4
G0 ok: no forbidden pattern; the test is the untouched compilation of the confirmed scenario
G1 ok: green on the healthy reference cart; ledger trace equals cart_after; totals equal the approved example
G2 13 defects: 11 detected where expected, 0 late, 0 missed, 2 not applicable
G3 live, 3 repeat(s) on https://practicesoftwaretesting.com: 3/3 pass; 3/3 repeats ended PASS
G2 again on the products of this run: 13 defects: 12 detected where expected, 0 late, 0 missed, 1 not applicable
G4 live controls: 4 caught, 0 missed, 0 not applicable, 0 not bound
   skew-total   caught         activated yes; first red S1; expected every checkpoint with a total red by exactly +$0.01
   drift-price  caught         activated yes; first red S1; expected first red at S1
   lost-update  caught         activated yes; first red S3; expected first red at S3
   lost-remove  caught         activated yes; first red S4; expected first red at S4
Evidence: reports/cart-eco-threshold/runs/20261125T012915Z-a9a2/
VERDICT: PASS
Promoted run 20261125T012823Z-d8c5 to reports/cart-total-add-change-remove/: report.md, run.json, verification.json, screens/ (4).
VERDICT: PASS
Promoted run 20261125T012915Z-a9a2 to reports/cart-eco-threshold/: report.md, run.json, verification.json, screens/ (4).
VERDICT: PASS
```

- Section 7 of the order, applied to everything touched: every source file starts with two or three lines naming
  the design section; no `any`; the three non-null assertions of the Toolshop driver were replaced by a check or a
  cast with its reason; no TODO; leftovers gone (`GATES_OK`, `confirm`, `gates`, the temporary parser, `scratch/`,
  the lock file, three unused exports); unit test names read as behaviour, one assertion each; the template holds
  no Toolshop name, selector, product or price (search below), the fixtures and unit tests use neutral names and
  prices; `docs/toolshop-facts.md` points at the lab's new place.

Search for Toolshop traces in the template before the last commit:

```text
$ grep -rniE "toolshop|practicesoftwaretesting|wood saw|pliers|claw hammer|thor|co2|eco-friendly|14\.15|12\.01|12\.18" templates/e2e --exclude-dir=node_modules --exclude-dir=reports --exclude=MANIFEST.json
templates/e2e/package.json:12:    "qa:toolshop": "tsx support/harness/cli.ts --root ../../examples/toolshop",
templates/e2e/package.json:13:    "typecheck:toolshop": "tsc --noEmit -p ../../examples/toolshop"
```

Only the npm script the order asks for (`qa:toolshop`) and its type-check companion `typecheck:toolshop` remain (open question 1).

## Exit criteria (run in `templates/e2e/`)

| # | Command | Result | Status |
| --- | --- | --- | --- |
| 1 | `npm ci` | `found 0 vulnerabilities`, exit 0 | PASS |
| 2 | `npx tsc --noEmit` | no output, exit 0 (also `npm run typecheck:toolshop`: exit 0) | PASS |
| 3 | `npm run test:unit` | `139 passed` | PASS |
| 4 | `npm run qa -- selftest` | 12/12 rows, all areas of design 10.8, `VERDICT: PASS` | PASS |
| 5 | `npm run qa:toolshop -- doctor` | `VERDICT: PASS` | PASS |
| 6 | `npm run qa:toolshop -- run cart-total-add-change-remove --dry` | `VERDICT: PASS`, 12 detected where expected, 0 late, 0 missed | PASS |
| 7 | `git status --short` | empty after the last commit (see the end of this report) | PASS |

Live outputs: stage 1 (first joint run), stage 2, stage 4 (both scenarios, promotion), stage 5 and the final
re-verification are pasted in their sections.

Full output of 1–6:

```text
$ npm ci
  run `npm fund` for details

found 0 vulnerabilities
exit 0
$ npx tsc --noEmit
exit 
$ npm run test:unit

  139 passed (796ms)
$ npm run qa -- selftest
unit tests         PASS  139 passed (783ms)
money              PASS  16 formats in 2 locales, foreign currency and non-amounts rejected
validator          PASS  each of V1–V8 gives SPEC_INVALID naming that rule
compiler           PASS  golden file byte for byte; two compilations equal; a hand edit gives FILE_CONFLICT
product selection  PASS  needQty 4 for two adds of 2; an unnamed pick skips "Green Lamp", named by a later alias
reference cart     PASS  healthy carts green; every applicable default defect red where expected (cart-total-add-change-remove 12/13, swapped-objects 12/13, green-threshold 10/11)
equal prices       PASS  all stubs at $10.00: qty-wrong-line and remove-wrong-line still detected, so lines are compared
empty cart         PASS  green with a zero total and without a total element; lost-remove red at S2
classification     PASS  unreachable address INFRA_FAIL; PreconditionError PRECONDITION_FAIL; zero tests NO_TESTS_RUN; action failure after a red checkpoint ORACLE_MISMATCH
control page       PASS  correct driver passes G3 and G4 (4/4 controls); wrong driver passes G3 on equal values, G4 CONTROL_MISSED "control active, test green"; with a discount LOCATOR_FAIL at the label layer
parallelism        PASS  two runs at once: 20261125T013119Z-ad47 and 20261125T013119Z-028f, each with its own evidence
integrity          PASS  support/core and support/harness match support/core/MANIFEST.json
12/12 rows passed in 55.4 s.
VERDICT: PASS
$ npm run qa:toolshop -- doctor
ok: Node 24.16.0, Chromium installed
ok: support/core and support/harness match the manifest
ok: cart-eco-threshold: confirmed, test compiled
ok: cart-total-add-change-remove: confirmed, test compiled
ok: driver app/toolshop.driver.ts satisfies CartDriver and stays within the UI
ok: rules file app/toolshop.pricing.ts loads
VERDICT: PASS
$ npm run qa:toolshop -- run cart-total-add-change-remove --dry
Run 20261125T013123Z-89f9 of cart-total-add-change-remove (dry: gates G0–G2 on the reference cart)
G0 ok: no forbidden pattern; the test is the untouched compilation of the confirmed scenario
G1 ok: green on the healthy reference cart; ledger trace equals cart_after; totals equal the approved example
G2 13 defects: 12 detected where expected, 0 late, 0 missed, 1 not applicable
Scenario gap: round-down is not applicable: No amount at a checkpoint has a fraction of a cent above one half; other products or quantities would expose truncation.
Evidence: reports/cart-total-add-change-remove/runs/20261125T013123Z-89f9/
VERDICT: PASS
```

## Negative checks

Each in a temporary copy of `examples/toolshop/` in the session's scratchpad (with `support` linked to the
package); nothing of them is committed except this output.

**1. `baseURL` set to an unreachable host** (`https://toolshop.unreachable.invalid`): `INFRA_FAIL` from the address
probe before any browser starts; no locator verdict.

```text
$ npm run qa -- run cart-total-add-change-remove --root <copy>
Run 20261125T010653Z-13ce of cart-total-add-change-remove
G0 ok: no forbidden pattern; the test is the untouched compilation of the confirmed scenario
G1 ok: green on the healthy reference cart; ledger trace equals cart_after; totals equal the approved example
G2 13 defects: 12 detected where expected, 0 late, 0 missed, 1 not applicable
G3 not started: https://toolshop.unreachable.invalid did not answer within 5000 ms (ENOTFOUND); check baseURL in qa.config.json and the network.
Evidence: reports/cart-total-add-change-remove/runs/20261125T010653Z-13ce/
VERDICT: INFRA_FAIL
```

**2. The eco rule removed from the Toolshop rules file, the scenario re-confirmed, `run cart-eco-threshold`.**
The first attempt (invocation 8, 01:06 UTC) met a degraded site: repeat 1 ended `UNMODELED_ADJUSTMENT`, repeats
2 and 3 timed out loading the listing, and the 6.1 order put the environment first (`INFRA_FAIL`). The site
answered normally a minute later (two plain GETs: 200 in 0.13 s and 0.60 s) and the check was run once more
(invocation 9), as the order allows:

```text
$ npm run qa -- example cart-eco-threshold --confirm --root <copy>
Example for cart-eco-threshold on stub products, not the application's: A = Wood Saw $10.00; B = Product B $20.00.
S1   add A 1        A×1              $10.00
S2   add B 2        A×1, B×2         $50.00
S3   setQty A 3     A×3, B×2         $70.00
S4   remove B       A×3              $30.00
No pricing rules apply.
Confirmed: status set to confirmed; scenario sha256 f5ce2ce09104…, rules sha256 4eeead6e680a….
Wrote specs/cart-eco-threshold.example.json.
VERDICT: PASS
$ npm run qa -- run cart-eco-threshold --root <copy>
Run 20261125T010833Z-2c2c of cart-eco-threshold
G0 ok: no forbidden pattern; the test is the untouched compilation of the confirmed scenario
G1 ok: green on the healthy reference cart; ledger trace equals cart_after; totals equal the approved example
G2 9 defects: 8 detected where expected, 0 late, 0 missed, 1 not applicable
G3 live, 3 repeat(s) on https://practicesoftwaretesting.com: 0/3 pass; 3/3 repeats ended UNMODELED_ADJUSTMENT
   products: Wood Saw ($12.18, co2_rating B) · Combination Pliers ($14.15, co2_rating D)
   S1   add Wood Saw, 1 unit                   expected $12.18    displayed "$11.57" in row "Total"  fail
   S2   add Combination Pliers, 2 units        expected $40.48    displayed "$40.48" in row "Total"  pass
   S3   set quantity of Wood Saw to 3          expected $64.84    displayed "$61.60" in row "Total"  fail
   S4   remove Combination Pliers              expected $36.54    displayed "$34.71" in row "Total"  fail
   S1 · unmodeled adjustment
     action:    add Wood Saw, 1 unit
     expected:  no adjustment row: no rule matches this label
     displayed: "- $0.61" in row "Eco-Friendly Discount (5%)"
… 3 more line(s): see the run directory or rerun with a narrower scope
VERDICT: UNMODELED_ADJUSTMENT
```

The full message of the first repeat (from `run.json`; the CLI keeps to 15 lines):

```text
UNMODELED_ADJUSTMENT
S1 · unmodeled adjustment
  action:    add Wood Saw, 1 unit
  expected:  no adjustment row: no rule matches this label
  displayed: "- $0.61" in row "Eco-Friendly Discount (5%)"
  layer:     adjustments · row "Eco-Friendly Discount (5%)" has no rule in app/toolshop.pricing.ts
  also:      total: the total is not the subtotal minus the adjustments
```

This is the observation behind the main design decision (9, 9.2): the oracle does not take the cart's word for an
adjustment. Without the rule in the rules file, the row "Eco-Friendly Discount (5%)" is an adjustment nobody
modelled, and the harness stops with one question for the tester instead of accepting the displayed total. With
the rule, the same cart is green (stage 4). S2 stays green in both cases: one Wood Saw out of three units is not
more than half, and the application shows no discount there either.

## Where the design turned out ambiguous, incomplete or wrong, and what was chosen

1. **The empty cart of a session that never had a cart (8.3, 6.8).** The design assumes `readCart` sees either the
   table or an empty message. On Toolshop a fresh session shows neither on `/checkout`, and the application
   throws (`reading 'cart_items'` of null) and sometimes renders nothing (stage 1, run 2). Chosen: the driver reads
   the header first and reports the empty variant when there is no cart counter. The design should say what
   "empty" means before the first cart exists.
2. **Completeness against what (6.1, point 4).** "A missing checkpoint" is counted against the `checkTotal` calls of
   the test file, not the scenario; otherwise 10.2's hand-edited test never reaches `DEFECT_LATE`.
3. **The wrong driver of 10.8.** "Reads the subtotal as the total, passes G3 with equal values, `LOCATOR_FAIL` with
   a discount" is only possible for a driver that takes the label and the amount from two places. The control
   page's wrong driver does exactly that (second group's label, subtotal's amount); see stage 5.
4. **The body of a faked success (10.6).** The bindings are data only (method, URL pattern), so the control cannot
   know the application's success body. Chosen: `200 {}` and `204` for DELETE; Toolshop accepts it. An application
   that checks the body would turn `lost-update` into an action failure; `verify` then reports the control as missed
   with the action failure as its first red.
5. **How the reference cart labels rows (10.1).** Rules have label patterns, not texts. Chosen: a literal derived
   from the pattern (`/^total\b/i` → `total`), rejected with a message when the pattern is not plain text.
6. **V3 "every earlier alias" (8.1) vs. the order's `cart-eco-threshold`.** Read as every earlier *unnamed* alias;
   a by-name product is already excluded by `reserved`.
7. **Exactness of G1 (order 6.1).** The 8.2 example stores rounded amounts; G1 compares exact totals, so the example
   also stores `totalExact`.
8. **A defect red only through an action failure.** 10.5 defines results by the first red *checkpoint*. With
   `check: last-step` a lost add makes a later `setQty` fail before any checkpoint; counted as `detected` with a note.
9. **Twins among non-applicable defects (10.4).** Two defects that change nothing at any checkpoint have equal views;
   they are admitted as scenario gaps, never rejected as twins of each other.
10. **G2 on live prices (10.2) and the verdict.** The design says the readback numbers come from the second pass but
    not what a red second pass means; chosen: its `DEFECT_MISSED`/`DEFECT_LATE` becomes the run's verdict.
11. **The amount rule of G0 and the test title.** A title with an amount ("50,00 €") would fail the compiled test's
    own G0; the title is exempt.
12. **`need` and `defects check` verdicts.** The dictionary has no verdict for "the driver lacks an action" or "an
    additional defect is rejected"; chosen `LINT_FAIL` (mismatched types in the driver) and `SPEC_INVALID`.
13. **Promotion "with one rename" (8.5).** The tracked files live next to the untracked `runs/` in the same
    directory, so one rename of the set is impossible; the set is staged complete and renamed in file by file under
    the lock, with the previous set moved aside first.
14. **Positive verdict of `example`, `compile`, `report`, `doctor`.** None is named; all end `PASS`.
15. **`browserDriver` and `defects` in qa.config.json** are read and typed but have no effect in the harness: they
    belong to the agents (`app-mapper`, step 3b).
16. **The template and `qa:toolshop`.** The order asks for the npm script `qa:toolshop` in `templates/e2e/package.json`
    and also for no Toolshop name in `templates/e2e`. Both are done; the script is the one Toolshop reference left
    in the template, and `/qa:setup` should drop it when it installs the template.
17. **A slow backend is neither a locator nor a network error (6.1).** An API that never answers within `actionMs`
    is "the environment", but a driver that waits only for elements reports it as a locator failure. Chosen: the
    Toolshop driver waits for the listing response first and throws `InfraError` when it does not come. The design
    could require every driver action to separate "the request got no answer" from "the element is missing".

## Open questions

Each was decided on the spot, as close to the design as possible; the decision stands until someone reopens it.

1. **`qa:toolshop` in the template.** The order wants the script in `templates/e2e/package.json` and also no Toolshop
   name in `templates/e2e`. Kept the script (the exit criteria use it); `/qa:setup` should remove it on install.
2. **A red G2 on live prices.** Chosen: it becomes the run's verdict (`DEFECT_MISSED`/`DEFECT_LATE`). Should it only be
   reported, since the scenario passed on the approved example?
3. **The success body of `lost-update`/`lost-remove`.** Chosen: generic `200 {}` / `204`. Should the bindings carry a
   success body (data, like `pricePath`) for applications that check it?
4. **Fact 3 for network controls** ("what that element showed at the moment of the read"): there is no element, so the
   report shows the total the driver read at the expected checkpoint and the expected amount next to it.
5. **`no-geolocation`** is enforced by construction (the context grants no permissions) and not probed at run time.
6. **Environment flakiness of the live site.** Twice in the session the Toolshop API answered nothing for over 10 s.
   The driver now reports that as `INFRA_FAIL` (listing request unanswered), which stops the flow per 6.3. Should
   `run` retry a repeat that ends `INFRA_FAIL` once before classifying, as it does for an unmet precondition in
   `FLAKY`?
7. **`doctor` without the TypeScript compiler.** The interface check is at run time; should `doctor` also run `tsc`
   on the driver (about 2 s with TypeScript 7)?
8. **Readback headline.** 11.2 shows "PASS 3/3 · test verified" after G5; the harness prints `PASS 3/3` and leaves
   "verified" to `test-verifier`, which issues `VERIFIED`.

## Measurements

Wall-clock by `date -u` at the start of every stage (the commit times are from the commits):

| Stage | From | To | Minutes |
| --- | --- | --- | --- |
| 0 merges, plan | 00:28:59 | 00:32:37 | 4 |
| 1 layout, driver, live fixture, first live green | 00:32:37 | 00:52 | 20 |
| 2 contracts and oracle | 00:53:08 | 00:55 | 2 (most of it was written in stage 1) |
| 3 verification without a browser | 00:55:12 | 01:01 | 6 |
| 4 runs and evidence | 01:02:20 | 01:11 | 9 |
| 5 live controls, control page | 01:12:33 | 01:23 | 11 |
| Final polish, re-verification, report | 01:24 | 01:35 | 11 |

Total about 66 minutes of the 180-minute box; no stage was skipped.

Lines (non-empty and empty, `wc -l`):

| Part | Files | Lines |
| --- | --- | --- |
| `support/core` (library) | 19 | 2,372 |
| `support/harness` (CLI and gates) | 17 | 1,808 |
| `support/harness/control-app` (server, page, drivers, rules, scenarios) | 8 | 357 + 2 scenarios |
| `unit/` (139 tests) | 14 | 509 |
| selftest fixtures and golden file | 9 | 173 |
| `examples/toolshop/app` (driver, rules) + map | 3 | 364 + 40 |

Live invocations against https://practicesoftwaretesting.com: **15 of 20**.

| # | UTC | What | Result |
| --- | --- | --- | --- |
| 1 | 00:45 | `run cart-total-add-change-remove` | `INFRA_FAIL` (empty cart of a fresh session) |
| 2 | 00:46 | probe script: `/checkout` in a fresh context | page with navigation only |
| 3 | 00:47 | `run cart-total-add-change-remove` | `FLAKY` 2/3 (application error on `/checkout`) |
| 4 | 00:48 | `run cart-total-add-change-remove` | `PASS` 3/3 |
| 5 | 00:53 | `run cart-total-add-change-remove` (stage 2) | `PASS` 3/3 |
| 6 | 01:05 | `run cart-total-add-change-remove` (stage 4) | `PASS` 3/3 |
| 7 | 01:05 | `run cart-eco-threshold` (stage 4) | `PASS` 3/3 |
| 8 | 01:06 | negative check 2 | `INFRA_FAIL` (site degraded) |
| 9 | 01:08 | negative check 2, once more | `UNMODELED_ADJUSTMENT` 3/3 |
| 10 | 01:20 | `verify cart-total-add-change-remove` | `PASS`, 4/4 controls |
| 11 | 01:21 | `verify cart-eco-threshold` | `PASS`, 4/4 controls |
| 12 | 01:26 | `verify cart-total-add-change-remove` (final code) | `PASS`, 4/4 controls |
| 13 | 01:27 | `verify cart-eco-threshold` (final code) | `FLAKY` 2/3 (API unanswered 10 s) |
| 14 | 01:28 | `verify cart-total-add-change-remove` (final driver) | `PASS`, 4/4 controls |
| 15 | 01:29 | `verify cart-eco-threshold` (final driver) | `PASS`, 4/4 controls |

Not counted: two plain HTTPS GETs to check that the site answered (01:08), negative check 1 (an unreachable host,
not the site), and the control page (local).

## Hand-over for the plugin sessions

Run everything from `templates/e2e/` (the package): `npm run qa -- <subcommand>` for the package's own root,
`npm run qa:toolshop -- <subcommand>` for `examples/toolshop/`, or `npm run qa -- <subcommand> --root <dir>` for any
other e2e root. In a tester's repo the package is `e2e/` and its root is itself. Every subcommand prints at most
15 lines and then `VERDICT: <name>`; the exit code is 0 only for `PASS`.

### Subcommands, verdicts and one real output each

| Subcommand | Verdicts it can return |
| --- | --- |
| `doctor [--write-manifest]` | `PASS`, `INFRA_FAIL` (Node < 20, no Chromium), `HARNESS_MODIFIED`, `SCENARIO_CHANGED`, `VERIFICATION_STALE`, `LINT_FAIL` (driver missing, not conforming, outside the UI; rules file missing) |
| `selftest` | `PASS`, `INFRA_FAIL` (any row failed) |
| `example <slug> [--confirm]` | `PASS`, `SPEC_INVALID` (V1–V8, wrong app) |
| `compile <slug> [--force]` | `PASS`, `SPEC_INVALID` (invalid, not confirmed, changed after confirmation), `FILE_CONFLICT` |
| `need <slug>` | `PASS`, `LINT_FAIL` (missing action or attribute), `SPEC_INVALID` |
| `defects list <slug>` / `defects check <slug>` | `PASS`, `SPEC_INVALID` (no example yet; an entry rejected) |
| `run <slug> --dry` | `PASS`, `SCENARIO_CHANGED`, `SPEC_INVALID`, `FILE_CONFLICT`, `LINT_FAIL`, `CONFORMANCE_FAIL`, `DEFECT_MISSED`, `DEFECT_LATE`, `NO_TESTS_RUN`, `INFRA_FAIL`; a red G1 on a compiled test ends with that run's verdict and is a harness bug |
| `run <slug> [--repair driver\|test]` | the above, then `INFRA_FAIL` (probe, browser, network, 5xx), `PRECONDITION_FAIL`, `LOCATOR_FAIL`, `UNMODELED_ADJUSTMENT`, `ORACLE_MISMATCH`, `FLAKY`, `NO_TESTS_RUN`; with `--repair`: `RETRY_REFUSED`, `LIMIT_REACHED` |
| `verify <slug>` | everything `run` returns, then `CONTROL_MISSED` |
| `report <slug> [--promote <runId>]` | `PASS`, `NO_TESTS_RUN` (no run yet) |

`FLAKY` carries the class of the failed repeats as evidence (`precondition`, `action`, `amount`) and
`CONTROL_MISSED` the four facts (`not-activated`, `active-shown-green`, `active-not-shown`); the routing table is
`ROUTING` in `support/core/verdicts.ts`. `INTENT_OK`, `VERIFIED`, `REWORK`, `NEEDS_TESTER` and `UNDETERMINED` are in
the dictionary for the agents; the harness never issues them.

Samples (real output of this session; the run ids are those of the runs named):

```text
$ npm run qa -- --help
qa-harness subcommands:
usage: qa-harness <subcommand> [--root <dir>]
  doctor [--write-manifest]                  check the environment, file integrity and the driver
  selftest                                   run the harness's own test without the live application
  example <slug> [--confirm]                 validate the scenario and compute the example; --confirm freezes it
  compile <slug> [--force]                   emit tests/<slug>.spec.ts from the confirmed scenario
  need <slug>                                name the actions, attributes and bindings the driver is missing
  defects list|check <slug>                  list the default defects; admit or reject specs/<slug>.defects.json
  run <slug> [--dry] [--repair driver|test]  gates G0–G2 on the reference cart, or G0–G3 live
  verify <slug>                              gates G0–G4: the live run and the live controls, in a new run directory
  report <slug> [--promote <runId>]          write report.md of the latest run; --promote puts a run in the repo
VERDICT: PASS

$ npm run qa:toolshop -- doctor
ok: Node 24.16.0, Chromium installed
ok: support/core and support/harness match the manifest
ok: cart-eco-threshold: confirmed, test compiled
ok: cart-total-add-change-remove: confirmed, test compiled
ok: driver app/toolshop.driver.ts satisfies CartDriver and stays within the UI
ok: rules file app/toolshop.pricing.ts loads
VERDICT: PASS

$ npm run qa -- selftest            (the full output is in the exit criteria above)
12/12 rows passed in 55.4 s.
VERDICT: PASS

$ npm run qa -- example cart-eco-threshold --root <copy>      (scenario still draft)
Example for cart-eco-threshold on stub products, not the application's: A = Wood Saw $10.00 {"co2_rating":"A"}; B = Product B $20.00 {"co2_rating":"C"}.
S1   add A 1        A×1              $9.50 after eco-discount $0.50
S2   add B 2        A×1, B×2         $50.00
S3   setQty A 3     A×3, B×2         $66.50 after eco-discount $3.50
S4   remove B       A×3              $28.50 after eco-discount $1.50
Rules: eco-discount: 5% of the running value off when more than 0.5 of the units have co2_rating A or B.
Show this to the tester; after the approval run qa-harness example cart-eco-threshold --confirm.
Wrote specs/cart-eco-threshold.example.json.
VERDICT: PASS

$ npm run qa -- compile cart-eco-threshold --root <copy>      (same draft scenario)
Scenario cart-eco-threshold is not confirmed; show the example to the tester and run `qa-harness example cart-eco-threshold --confirm` after the approval.
VERDICT: SPEC_INVALID

$ npm run qa:toolshop -- need cart-eco-threshold
Actions: all 6 the scenario needs are present.
Attributes: co2_rating provided.
Request bindings: present for every live control the scenario can use.
VERDICT: PASS

$ npm run qa:toolshop -- defects list cart-eco-threshold
13 default defects of cart-eco-threshold, derived from its steps and 1 rule(s):
  lost-add                 no-effect     add is acknowledged and changes nothing
  lost-qty                 no-effect     setQty is acknowledged and changes nothing
  lost-remove              no-effect     remove is acknowledged and changes nothing
  qty-wrong-line           wrong-target  setQty hits the next line in cart order
  remove-wrong-line        wrong-target  remove hits the next line in cart order
  stale-total              stale-value   the total shown is the one from before the last change
  total-off-by-cent        skew-value    the total is one cent too high
  line-ignores-qty         ignore-factor the line total is the unit price, whatever the quantity
  rule-never               rule-never    rule eco-discount is never applied
  rule-always              rule-always   rule eco-discount is always applied
  rule-wrong-rate          rule-rate     rule eco-discount is applied at twice its rate
  rule-boundary            rule-boundary the threshold of rule eco-discount is shifted by its boundary
  round-down               round-mode    the total and the adjustments are truncated at the cent instead of rounded
VERDICT: PASS

$ npm run qa -- defects check cart-total-add-change-remove --root <copy>
specs/cart-total-add-change-remove.defects.json: 1 admitted, 2 rejected.
  admitted total-stale-after-increase (tester, stale-value)
  rejected coupon-ignored: operator drop-coupon does not exist; use one of no-effect, wrong-target, stale-value, skew-value, ignore-factor, rule-never, rule-always, rule-rate, rule-boundary, round-mode
  rejected same-as-default: it behaves like total-off-by-cent at every checkpoint
Fix or remove the rejected entries; a concern no operator expresses goes into the report as an uncovered risk.
VERDICT: SPEC_INVALID

$ npm run qa:toolshop -- run cart-total-add-change-remove --dry
Run 20261125T013123Z-89f9 of cart-total-add-change-remove (dry: gates G0–G2 on the reference cart)
G0 ok: no forbidden pattern; the test is the untouched compilation of the confirmed scenario
G1 ok: green on the healthy reference cart; ledger trace equals cart_after; totals equal the approved example
G2 13 defects: 12 detected where expected, 0 late, 0 missed, 1 not applicable
Scenario gap: round-down is not applicable: No amount at a checkpoint has a fraction of a cent above one half; other products or quantities would expose truncation.
Evidence: reports/cart-total-add-change-remove/runs/20261125T013123Z-89f9/
VERDICT: PASS

$ npm run qa:toolshop -- run cart-eco-threshold        (stage 4, live)
Run 20261125T010538Z-fccb of cart-eco-threshold
G0 ok: no forbidden pattern; the test is the untouched compilation of the confirmed scenario
G1 ok: green on the healthy reference cart; ledger trace equals cart_after; totals equal the approved example
G2 13 defects: 11 detected where expected, 0 late, 0 missed, 2 not applicable
G3 live, 3 repeat(s) on https://practicesoftwaretesting.com: 3/3 pass; 3/3 repeats ended PASS
   products: Wood Saw ($12.18, co2_rating B) · Combination Pliers ($14.15, co2_rating D)
   S1   add Wood Saw, 1 unit                   expected $11.57    displayed "$11.57" in row "Total"  pass
   S2   add Combination Pliers, 2 units        expected $40.48    displayed "$40.48" in row "Total"  pass
   S3   set quantity of Wood Saw to 3          expected $61.60    displayed "$61.60" in row "Total"  pass
   S4   remove Combination Pliers              expected $34.71    displayed "$34.71" in row "Total"  pass
G2 again on the products of this run: 13 defects: 12 detected where expected, 0 late, 0 missed, 1 not applicable
Evidence: reports/cart-eco-threshold/runs/20261125T010538Z-fccb/
VERDICT: PASS

$ npm run qa:toolshop -- verify cart-eco-threshold     (final)
Verify 20261125T012915Z-a9a2 of cart-eco-threshold: gates G0–G4
G0 ok: no forbidden pattern; the test is the untouched compilation of the confirmed scenario
G1 ok: green on the healthy reference cart; ledger trace equals cart_after; totals equal the approved example
G2 13 defects: 11 detected where expected, 0 late, 0 missed, 2 not applicable
G3 live, 3 repeat(s) on https://practicesoftwaretesting.com: 3/3 pass; 3/3 repeats ended PASS
G2 again on the products of this run: 13 defects: 12 detected where expected, 0 late, 0 missed, 1 not applicable
G4 live controls: 4 caught, 0 missed, 0 not applicable, 0 not bound
   skew-total   caught         activated yes; first red S1; expected every checkpoint with a total red by exactly +$0.01
   drift-price  caught         activated yes; first red S1; expected first red at S1
   lost-update  caught         activated yes; first red S3; expected first red at S3
   lost-remove  caught         activated yes; first red S4; expected first red at S4
Evidence: reports/cart-eco-threshold/runs/20261125T012915Z-a9a2/
VERDICT: PASS

$ npm run qa:toolshop -- report cart-eco-threshold --promote 20261125T012915Z-a9a2
PASS 3/3 · run 20261125T012915Z-a9a2
S1   add Wood Saw, 1 unit                   $11.57    "$11.57"   match
S2   add Combination Pliers, 2 units        $40.48    "$40.48"   match
S3   set quantity of Wood Saw to 3          $61.60    "$61.60"   match
S4   remove Combination Pliers              $34.71    "$34.71"   match
Scenario gaps: 1 (see report.md)
Rerun: cd templates/e2e && npm run qa -- run cart-eco-threshold --root ../../examples/toolshop
Promoted run 20261125T012915Z-a9a2 to reports/cart-eco-threshold/: report.md, run.json, verification.json, screens/ (4).
VERDICT: PASS
```

`report <slug>` without `--promote` prints the same readback for the latest run and writes its `report.md`.

### Files a scenario produces, and who writes them

| File | Written by | In the repo |
| --- | --- | --- |
| `specs/<slug>.md` | the skill (`new-test`), until confirmation; `example --confirm` changes only its `status:` line | yes |
| `specs/<slug>.example.json` | `qa-harness example`; `--confirm` adds `confirmed: { scenarioSha256, rulesSha256 }` | yes |
| `specs/<slug>.defects.json` | the skill for the tester's concerns, `defect-designer` in extended mode; admitted by `defects check` | yes |
| `tests/<slug>.spec.ts` | `qa-harness compile` only | yes |
| `app/<app>.driver.ts`, `app/<app>.map.md` | `app-mapper` | yes |
| `app/<app>.pricing.ts` | the main thread after the tester's answer | yes |
| `reports/<slug>/runs/<runId>/` | the harness: `run.json`, `verification.json`, `report.md`, `S1.png …`, `html/` (Playwright report), `artifacts/` (traces of failed repeats), `dry/g1/`, `dry/g2/<defect>/`, `dry/g2-live/`, `G4/<control>/` (each with its own `run.json` and `html/`) | no |
| `reports/<slug>/runs/<runId>/review.md` | `test-verifier` | no |
| `reports/<slug>/attempts.json`, `reports/<slug>/.lock` | the harness (`run --repair`, promotion) | no |
| `reports/<slug>/{report.md, run.json, verification.json, review.md, screens/}` | `qa-harness report --promote` only | yes |
| `support/core/MANIFEST.json` | `doctor --write-manifest`, in the plugin repo only | yes |

A skill may write the scenario (until it is confirmed), the defects file, the driver and its map, the rules file
(after the tester's answer) and `review.md` in a run directory. Everything else is written only by the harness.
The `.gitignore` of a root keeps `reports/*/runs/`, `attempts.json`, `.lock`, `.promote-*` and `test-results/` out.

### Known not to work or not built

- The `set` step (coupon) is the design's extension point and is not implemented.
- `price_source: api` is validated, compiled, wired through `apiPrice` and covered by a unit test; no driver
  implements `apiPrice`, so `need` reports it as missing and it was never run live.
- `listPrice` is in the type but nothing reads it.
- `skew-total` recognises an amount text node only when the currency symbol is in the same text node (true on
  Toolshop and the control page); a page that renders the symbol in a separate element is not handled.
- A faked success for `lost-update`/`lost-remove` is `200 {}` / `204`; an application that checks the body would make
  the control fail at the action instead of at the checkpoint.
- The reference cart computes rules with the same code as the ledger; only the control page is independent.
- `doctor` checks the driver's interface at run time, not with the TypeScript compiler; `npm run typecheck:toolshop`
  (or `tsc` in a tester's `e2e/`) does the static check.
- G0 does not resolve variables: `page.goto(path)` with a variable is accepted; absolute URL literals anywhere in a
  driver are checked against the origin instead.
- The Toolshop driver walks only the first page of search results (order B, open question 6).
- Toolshop's `/checkout` throws in the application when the session has no cart (stage 1); the driver avoids it.
- `examples/toolshop/lab/driver.live.spec.ts` (project `driver-live`) still writes into `docs/evidence/driver-lab/`
  when run; it was not run in order N.
- `selftest` takes about 55 s, of which about 40 s are the control-page row (three browser runs, 12 Playwright
  processes); the part without a browser takes about 15 s.
