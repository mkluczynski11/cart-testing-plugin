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

Live invocations used: 0 / 20.

## Open questions


## Stage 1 — reconcile A and B, new layout, first live green

Started `Wed Nov 25 00:32:37 UTC 2026`, committed `8d38db0` at 00:53 UTC.

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

Started `Wed Nov 25 00:53:08 UTC 2026`, committed at 00:55 UTC.

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

Started `Wed Nov 25 00:55:12 UTC 2026`, committed at 01:02 UTC.

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
