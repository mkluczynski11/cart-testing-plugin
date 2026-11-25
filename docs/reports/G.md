# Report G — what the tester reads: confirmation and readback

## Plan

Time box 70 minutes from `Wed Nov 25 12:15:20 UTC 2026`; stage 4 by 12:55, report from 13:15.

0. Workspace: branch check, commit the order, `npm ci` in `templates/e2e`, baseline of the order F checks.
1. Confirmation (design 11.1). `qa-harness example` words products as `A = Product A, $10.00, co2_rating A` and rules
   without "of the running value" for the first rule, shares as "half", "a third", "a quarter" or a percentage, and
   prints one `Source:` line from the provenance without the file reference. `report.md` uses the same rule wording.
   `skills/new-test/intake.md`: "total" is the row the rules file labels as the total, no question; the confirmation
   says so under "Plugin's choice"; the calibration row that asked is replaced by one that asks only for "subtotal",
   "price before discount" or a contradiction. Level A cases touched by the new default. Unit tests first.
2. Readback (design 11.2). `report.md` starts with the readback form of the order (verdict heading, header table,
   Steps, Verification of the test, Not covered, Pricing rules, Page driver, Files, Run it again); on a red run the
   failing step comes directly under the verdict. Facts the harness did not print yet go into `run.json` (driver
   file, its sha256, its origin: starter pack recorded by setup, repaired by `--repair driver`, otherwise built or
   changed after setup; the driver operations the scenario uses; the browser). `readback.md`: the readback is the
   form part of `report.md`, copied verbatim; the dry, mismatch and stopped readbacks take the same headings. Unit
   tests first.
3. Neutral names in `unit/defects-table.spec.ts`, `unit/` in the neutrality check; `evals/run.mjs` `transcript()`
   keeps the first entry of a tool call, with a test in `scripts/` on a recorded transcript; all level A cases once.
4. Live: setup, the reference request without `--yes` (ends at "Confirm?" with no discount question), resumed with
   `--yes`, the Wood Saw request with `--yes`; rebuild `examples/toolshop/`; README "Result", `docs/reference.md`,
   design 18.
5. Exit checks, report, one commit per stage.

## Stage 0 — workspace

`date -u`: `Wed Nov 25 12:15:20 UTC 2026`. Branch `g-polish` (checked with `git branch --show-current`). Order and plan
committed as `04128c4`. `npm ci` in `templates/e2e`. Baseline of the order F checks: `tsc` exit 0,
`typecheck:toolshop` exit 0, `test:unit` `193 passed (4.4s)`, selftest `13/13 rows passed in 71.6 s.` `VERDICT: PASS`.

## Stage 1 — the confirmation (design 11.1)

`date -u`: `Wed Nov 25 12:16:13 UTC 2026`; committed `9dabe3e` at 12:21:59.

Test first: `unit/wording.spec.ts`, five tests, all red before the change (`describeSources is not a function`;
`Expected: "green-discount: 5% off when more than half of the units have energy_class A or B"`), green after.

| What the tester reads | Before | After | Where |
| --- | --- | --- | --- |
| A stub | `A = Product A $10.00 {"co2_rating":"A"}` | `A = Product A, $10.00, co2_rating A` | `support/harness/example.ts` |
| A rule | `eco-discount: 5% of the running value off when more than 0.5 of the units have co2_rating A or B` | `eco-discount: 5% off when more than half of the units have co2_rating A or B` | `support/core/pricing.ts` `describeRule`, `describeShare` |
| The source | `Source of each rule: eco-discount: observed (docs/toolshop-facts.md#h1; cart.component.ts @ae7caec), confirmed live.` (the model filled it from `provenance`) | `Source: observed on the live site, confirmed.` (printed by `example`, `describeSources`) | `example.ts`, `pricing.ts`; `intake.md` takes the line |
| "Total" with a rule | a question: before or after the discount? | the row the rules file labels as the total, after every rule in force; said under "Plugin's choice"; a question only for another amount or a contradiction | `intake.md` (calibration pairs, template), `SKILL.md` step 1 |

Wording rules in code: a share is `half`, `a third`, `a quarter` when the ratio is exactly 1/2, 1/3, 1/4, otherwise a
percentage (`0.6` → `60%`, `0.3333` → `33.33%`; a third cannot be written exactly in the decimal vocabulary of 9.2, so
in practice only half and a quarter are words). The first rule's percentage needs no base (its running value is the
subtotal); a later rule says `of the subtotal` or `off the amount after the rules before it`. Fixed amounts and the
subtotal threshold are money (`$5.00`). `hasUnits` says `1 unit has` / `2 units have`. `report.md` uses the same rule
and source words, without `provenance.ref` (the file reference stays in the rules file). Manifest regenerated.

Level A cases the new default touches: R2 (the reference request without `--yes`) gets two checks: no line before
"Confirm?" ends with a question mark, and "Plugin's choice" names the total row. New case R3: "… Check the price before
the discount after each change." must end with one question and write nothing. Both are in the eval run of stage 3.

Checks after the stage: `tsc` 0, `typecheck:toolshop` 0, `test:unit` `198 passed`, selftest `13/13` `VERDICT: PASS`,
`qa:toolshop -- doctor` `VERDICT: PASS`, `node --test scripts/` `ℹ fail 0` (14), `check-contracts` `ok: …`.

## Stage 2 — the readback (design 11.2)

`date -u`: `Wed Nov 25 12:22:08 UTC 2026`; committed `3957682`.

Test first: `unit/readback-form.spec.ts`, three tests red before the change (`3 failed`: no section `## PASS · test
verified`, no "Failing step", no "Page driver"), then a fourth for the dry run, red with `Expected: "## PASS · dry
gates only, not run live"`, `Received: undefined` (a dry run wrote no `report.md`). All green after.

What changed:

- `support/harness/report.ts` `buildReport`: `report.md` starts with the form of the order. `## <verdict> · <meaning>`
  (`test verified`; `dry gates only, not run live`; `live run only, not verified`; `amounts differ`; `an adjustment no
  rule describes`; `could not be executed`; `no verified test`; `evidence of a mismatch, not a verified test`), the
  test-case table, "Steps" with `pass`, `fail`, `not run` and a screenshot path each (the Expected cell shows the
  composition where a rule is in force: `$23.58 = $24.19 − green-discount $0.61`), "Verification of the test" (intent
  review, static check, defects on both price sets as `<d> of <n> detected at the right step, <k> not applicable`, live
  run, live controls, report review), "Not covered by this scenario" (the not-applicable defects of the live pass with
  their hints), "Pricing rules", "Page driver", "Files", "Run it again" (the `npm run qa -- run` line with the
  configured repeat count, and the plain `npx playwright test` line). On a red run "Failing step" (the red checkpoint
  with expected composition, displayed raw text, row, verdict, layer, screenshot; the failure message) comes directly
  under the verdict. The details follow: "Defects" (order E's table), "Live controls", "Scope", "Rows read" (every
  step's composition and row label, for G5), "Reading a failure".
- Facts the harness did not print before: the driver's origin and whether this flow changed it (from
  `app/starter-pack.json`, the `driverSha256` of the scenario's run records and `attempts.json`); the operations the
  scenario uses (`scenarioActions`, the list `need` checks); the browser (`run.json` `meta.browser`).
- `scripts/init.mjs`: when it installs a starter pack, it writes `e2e/app/starter-pack.json` with the sha256 of every
  pack file whose installed copy is identical.
- `support/harness/run.ts`: a dry run (and a red dry gate) also writes `report.md`, so the `--dry` readback has its file.
- `report` prints the heading, the status, the step rows and `Readback: <path>, from "<heading>" to the end of "Run it
  again".`
- `skills/new-test/readback.md` rewritten: the readback is that part of `report.md`, copied verbatim; which file for
  which ending; the endings add after the form only what `routing.md` asks. `SKILL.md` steps 5 and 9,
  `run-verification` G5 (composition where a rule is in force; "Rows read" for every step) and `contracts/reviews.md`
  follow.

Checks after the stage: `tsc` 0, `typecheck:toolshop` 0, `test:unit` `202 passed`, selftest `13/13 rows passed in 77.4
s.` `VERDICT: PASS`, `qa:toolshop -- doctor` `VERDICT: PASS`, `qa:toolshop -- run two-products-change-remove --dry`
`VERDICT: PASS`, `node --test scripts/` `ℹ fail 0`, `check-contracts` `ok: …`, `claude plugin validate .` `✔
Validation passed`.

## Stage 3 — two leftovers

`date -u`: `Wed Nov 25 12:28:58 UTC 2026`.

- Neutral names. `scripts/neutrality.test.mjs` (new, runs with `node --test scripts/`) reads the names of the example
  applications from `examples/` (directory names, the host of `qa.config.json`, pricing rule ids and attributes,
  constraint product names, product names of the recorded runs; the harness's own stub names `Product A…` excepted)
  and searches `skills/`, `agents/`, `templates/e2e/support/core/` and `templates/e2e/unit/`. Red first:
  `skills/new-test/intake.md: co2_rating` (the stage 1 template line), `templates/e2e/support/core/ledger.ts:
  eco-discount` (a comment), `unit/defects-table.spec.ts: Pliers`, `unit/readback-form.spec.ts: Pliers`, `Wood Saw`.
  Fixed with neutral names (`Steel Kettle`, `Paper Lamp`, `green-discount`, `<attribute> <value>`); green. Manifest
  regenerated (the `ledger.ts` comment).
- `evals/run.mjs` `transcript()`: the reading moved to `evals/transcript.mjs` `callsFrom()`, which records a call only
  the first time its id appears. Test `scripts/transcript.test.mjs` on `scripts/fixtures/transcript-duplicate-call.jsonl`:
  three records of the A4 session of order E (the `tool_use` of `qa-harness intent`, its `tool_result`, and the same
  `tool_use` logged again as an `api-request-blob` record with `cd <path> && …`), cut to the fields the reader uses,
  paths replaced by `<path>`. With the old condition red: `actual: 'cd <path> && qa-harness intent
  two-products-qty-remove'`; with the fix green.

Eval run (stage 3): all 16 level A cases once, sonnet, 12:29:36–12:33:38 UTC, `--jobs 4`: 16 of 16 pass, $3.53
(`docs/eval-log.md` rows 55–70; commit `ad04d77`). R2 passes its two new checks (no question before "Confirm?";
"Plugin's choice" names the total row); R3 asks one question and writes nothing; A4 passes all six checks.

Checks after the stage: `tsc` 0, `typecheck:toolshop` 0, `test:unit` `202 passed`, selftest `13/13 rows passed in 90.8
s.` `VERDICT: PASS`, `node --test scripts/` `ℹ fail 0` (16), `check-contracts` `ok: …`, `claude plugin validate .` `✔
Validation passed`. Code committed `5349b3b`, eval log `ad04d77`.

## Stage 4 — live run, examples, documents

`date -u`: `Wed Nov 25 12:29:55 UTC 2026` (minute 15; the eval run of stage 3 was still running, on no live site).

One fresh scratch repo `shop` in the session's scratch directory, `git init`. Sessions headless:
`claude -p "<prompt>" --plugin-dir <worktree> --permission-mode auto --max-turns <n> --output-format json`, default
model (`claude-opus-5-5`), never `--dangerously-skip-permissions`.

| # | Session | Outcome |
| --- | --- | --- |
| L1 | `/qa:setup toolshop https://practicesoftwaretesting.com` | `VERDICT: PASS`; 86 template files, starter pack 3 files, selftest 13/13; `e2e/app/starter-pack.json` lists the three files with their sha256. Scratch commit `70a10cc` |
| L2 | `/qa:new-test "<reference request of the README>"` (no `--yes`) | ends at "Confirm? (ok / correction)"; no question about the discount; "Plugin's choice" says "the total" is the row labelled "Total", after eco-discount; scenario `two-products-change-remove` stays `status: draft` |
| L3 | `/qa:new-test two-products-change-remove --yes` | **`VERIFIED`**: run `20261125T123320Z-da61` `PASS` 3/3; verify run `20261125T123349Z-fee3` G4 4 of 4 caught, `review.md` `VERIFIED`, promoted. Scratch commit `bde1a28` |
| L4 | `/qa:new-test "<Wood Saw request of the README>" --yes` | **`VERIFIED`**: `wood-saw-raise-remove-other`; run `20261125T123628Z-1fac` `PASS` 3/3; verify run `20261125T123701Z-8ba1` G4 4 of 4, `review.md` `VERIFIED`, promoted; eco-discount in force at S1, S3, S4. Scratch commit `61ce58b` |

No `INFRA_FAIL`, so no resume after a failure. Both slugs are the ones of order E.

`examples/toolshop/` rebuilt from the scratch repo at `61ce58b`: `specs/<slug>.{md,example.json,intent.md}`,
`tests/<slug>.spec.ts`, `reports/<slug>/{report.md,run.json,verification.json,review.md,screens/S1–S4.png}` and
`readback.txt` (the final answer of L3 and L4) for both slugs. `app/` is byte-identical to the scratch repo's (`cmp`:
all three files identical); `starter-pack.json` was not copied (setup writes it). `qa.config.json`, `tsconfig.json`,
the `support` link and `lab/` kept.

Documents: `README.md` "Result" holds the shortened answer of L3 in the new form (heading, three rows of the test case,
the four steps, three rows of the verification) and one paragraph on the rest of the answer and `report.md`; 250 lines,
`grep -c '<!--'` 0; the numbers of "Design note" still hold (12 + 1 of 13 on stub prices, 9 + 4 of 13 on the live
prices; the Wood Saw total differs from the subtotal at S1, S3, S4). `docs/reference.md`: step 9 of the workflow, a
subsection "Confirmation and readback", the dry mode, `app/starter-pack.json` in "Files" (465 lines). `docs/design.md`
18: four rows ("Total" in a request, words of the confirmation, readback form, driver origin).

One harness change in this stage, test first: a dry run's Environment row showed `—` for the date (no `run.json`).
`unit/readback-form.spec.ts` got an assertion on the date (red: `1 failed`), `report.ts` takes the date from the run id
when `run.json` has none (green: `4 passed`). The live sessions used the harness copied into the scratch repo by L1,
so they are not affected.

Observation, not changed: `qa-harness example <slug>` without `--confirm` on a confirmed scenario rewrites
`example.json` without its `confirmed` record (seen when I ran it on the scratch repo after L4 to record the "after"
output below; the scratch file was restored from its commit, the example copy was made before). `new-test` runs
`example` without `--confirm` only on a draft (step 2).

### The confirmation, before and after

Before (the owner's run, as order G quotes it; the `example` output of `main` on the same scenario, run offline on a
copy of the scratch repo's files):

```text
Example for two-products-change-remove on stub products, not the application's: A = Product A $10.00 {"co2_rating":"A"}; B = Product B $20.00 {"co2_rating":"C"}.
S1   add A 1        A×1              $9.50 after eco-discount $0.50
S2   add B 1        A×1, B×1         $30.00
S3   setQty A 3     A×3, B×1         $47.50 after eco-discount $2.50
S4   remove B       A×3              $28.50 after eco-discount $1.50
Rules: eco-discount: 5% of the running value off when more than 0.5 of the units have co2_rating A or B.
```

and in the confirmation `Source of each rule: eco-discount: observed (docs/toolshop-facts.md#h1; cart.component.ts
@ae7caec), confirmed live.`, with the question "before or after the discount?" asked for the reference request.

After, `example` (same scenario, this branch):

```text
Example for two-products-change-remove on stub products, not the application's: A = Product A, $10.00, co2_rating A; B = Product B, $20.00, co2_rating C.
S1   add A 1        A×1              $9.50 after eco-discount $0.50
S2   add B 1        A×1, B×1         $30.00
S3   setQty A 3     A×3, B×1         $47.50 after eco-discount $2.50
S4   remove B       A×3              $28.50 after eco-discount $1.50
Rules: eco-discount: 5% off when more than half of the units have co2_rating A or B.
Source: observed on the live site, confirmed.
```

After, the confirmation of L2 in full (the session's final answer, verbatim):

I wrote a draft scenario from your request. Please check it before I build the test:

```text
Scenario: two-products-change-remove
A = the first available product, B = the next available product, different from A
Plugin's choice: A is the product whose quantity changes, from 1 to 3; B is the one removed; both are added 1 unit each; the total is checked after every step;
"the total" is the row labelled "Total" (it must start with "total"), after eco-discount, when that rule applies

Step  Shopper's action            Cart after the step
S1    adds A, 1 unit              A×1
S2    adds B, 1 unit              A×1, B×1
S3    changes quantity of A to 3  A×3, B×1
S4    removes B                   A×3
The cart state and the total are checked after every step.

Example on stub prices:
A = Product A, $10.00, co2_rating A
B = Product B, $20.00, co2_rating C
S1 $9.50 · S2 $30.00 · S3 $47.50 · S4 $28.50
Rules: eco-discount: 5% off when more than half of the units have co2_rating A or B.
Source: observed on the live site, confirmed.

Assumptions: guest, empty cart, no geolocation, prices from the product page.
The test will be checked against 13 defects: 13 default, 0 tester, 0 generated; the full list will be in e2e/reports/two-products-change-remove/report.md.
Confirm? (ok / correction)
```

### The readback, before and after

Before: `examples/toolshop/reports/two-products-change-remove/readback.txt` on `main` (order E, L2), in full:

````text
The test passed and was independently verified.

```text
PASS 3/3 · test verified
Products: Combination Pliers ($14.15, co2_rating D) · Pliers ($12.01, co2_rating D)

Step  Shopper's action                         Expected  Displayed  Result
S1    add Combination Pliers, 1 unit           $14.15    "$14.15"   match
S2    add Pliers, 1 unit                       $26.16    "$26.16"   match
S3    set quantity of Combination Pliers to 3  $54.46    "$54.46"   match
S4    remove Pliers                            $42.45    "$42.45"   match

Evidence: intent review INTENT_OK (it counted the two adds as "changes", so the checks after S1 and S2 are intended); defects 9/9 applicable, each detected at the expected step; live controls 4/4 caught; report review VERIFIED, one finding: the total always equalled the subtotal, so only the skew-total control shows the driver reads the "Total" row.
Scope: The total was read from the row "Total". In this run it always equalled the subtotal or a line total, so the live run alone cannot tell those fields apart; only the label-based control skew-total shows that the driver reads the total.
Scenario gap:
  - rule-never: Add a step at which rule eco-discount is in force.
  - rule-wrong-rate: Add a step at which rule eco-discount is in force.
  - rule-boundary: Add a step at which the cart sits exactly at the threshold of rule eco-discount.
  - round-down: No amount at a checkpoint has a fraction of a cent above one half; other products or quantities would expose truncation.
Rules used: eco-discount · observed · live: confirmed (not in force in this run, because both products are rated D)
Rerun: cd e2e && npm run qa -- run two-products-change-remove
Files: e2e/specs/two-products-change-remove.md, e2e/specs/two-products-change-remove.intent.md, e2e/tests/two-products-change-remove.spec.ts, e2e/reports/two-products-change-remove/
```

Because both products the test picked are rated D, it never checks the eco discount. A follow-up scenario that picks a product rated A or B would cover that discount.
````

After: the final answer of L3 (`two-products-change-remove`), in full:

````markdown
## PASS · test verified

| | |
| --- | --- |
| Test | `e2e/tests/two-products-change-remove.spec.ts` |
| Objective | Add two different products to the cart. Change the quantity of one, then remove the other. Check that the cart shows the correct total after each change. |
| Status | PASS, 3 of 3 repeats · verified |
| Environment | https://practicesoftwaretesting.com · Chromium · en-US · 2026-11-25 12:33 UTC · run `20261125T123349Z-fee3` |
| Preconditions | empty cart, guest, no geolocation |
| Test data | A = Combination Pliers, $14.15, co2_rating D · B = Pliers, $12.01, co2_rating D (read from the product pages in this run) |

### Steps

| # | Shopper's action | Expected total | Actual (as displayed) | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| S1 | add Combination Pliers, 1 unit | $14.15 | "$14.15" | pass | `e2e/reports/two-products-change-remove/screens/S1.png` |
| S2 | add Pliers, 1 unit | $26.16 | "$26.16" | pass | `e2e/reports/two-products-change-remove/screens/S2.png` |
| S3 | set quantity of Combination Pliers to 3 | $54.46 | "$54.46" | pass | `e2e/reports/two-products-change-remove/screens/S3.png` |
| S4 | remove Pliers | $42.45 | "$42.45" | pass | `e2e/reports/two-products-change-remove/screens/S4.png` |

Repeat 1 of 3 is shown; every repeat is in `run.json`.

### Verification of the test

| Check | Result |
| --- | --- |
| Intent review | INTENT_OK, `e2e/specs/two-products-change-remove.intent.md`, for the confirmed scenario |
| Static check, reference cart | PASS (gates G0, G1) |
| Defects on stub prices | 12 of 12 detected at the right step, 1 not applicable |
| Defects on the prices of this run | 9 of 9 detected at the right step, 4 not applicable |
| Live run | 3 of 3 repeats passed; the test is the untouched compilation of the confirmed scenario |
| Live controls | 4 of 4 caught |
| Report review | VERIFIED, `review.md` of this run |

### Not covered by this scenario

- rule-never: Add a step at which rule eco-discount is in force.
- rule-wrong-rate: Add a step at which rule eco-discount is in force.
- rule-boundary: Add a step at which the cart sits exactly at the threshold of rule eco-discount.
- round-down: No amount at a checkpoint has a fraction of a cent above one half; other products or quantities would expose truncation.

### Pricing rules

- eco-discount: 5% off when more than half of the units have co2_rating A or B · source: observed on the live site, confirmed · not in force in this run.

### Page driver

`e2e/app/toolshop.driver.ts`: the plugin's starter pack for toolshop, as setup installed it. This flow did not change it (sha256 382d9e8915d5…). Operations this scenario used: candidates, productFacts, readCart, addProduct, setQuantity, remove. The total was read from the row "Total".

The page driver is the one file that knows the shop's pages: the test calls it to find products, add them, change quantities, remove them and read the cart, so the test holds no locator.

### Files

| File | Content |
| --- | --- |
| `e2e/tests/two-products-change-remove.spec.ts` | the test |
| `e2e/specs/two-products-change-remove.md` | the confirmed scenario |
| `e2e/specs/two-products-change-remove.intent.md` | the intent review |
| `e2e/reports/two-products-change-remove/report.md` | the full report, every defect and control |
| `e2e/reports/two-products-change-remove/screens/` | one screenshot per step |
| `e2e/app/toolshop.driver.ts`, `.pricing.ts`, `.map.md` | page driver, pricing rules, locator evidence |

### Run it again

`cd e2e && npm run qa -- run two-products-change-remove` (3 repeats, with the report)
`cd e2e && npx playwright test tests/two-products-change-remove.spec.ts` (plain Playwright)

Both products picked in this run have a co2_rating of D, so the eco-discount never applied live. To cover it, a follow-up scenario could require products with co2_rating A or B, which would test the "Not covered" lines for that rule.
````

After: the final answer of L4 (`wood-saw-raise-remove-other`), in full:

````markdown
## PASS · test verified

| | |
| --- | --- |
| Test | `e2e/tests/wood-saw-raise-remove-other.spec.ts` |
| Objective | Add a Wood Saw, then two units of the first available product. Raise the saw to three units, then remove the other product. Check the total after each change. |
| Status | PASS, 3 of 3 repeats · verified |
| Environment | https://practicesoftwaretesting.com · Chromium · en-US · 2026-11-25 12:37 UTC · run `20261125T123701Z-8ba1` |
| Preconditions | empty cart, guest, no geolocation |
| Test data | A = Wood Saw, $12.18, co2_rating B · B = Combination Pliers, $14.15, co2_rating D (read from the product pages in this run) |

### Steps

| # | Shopper's action | Expected total | Actual (as displayed) | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| S1 | add Wood Saw, 1 unit | $11.57 = $12.18 − eco-discount $0.61 | "$11.57" | pass | `e2e/reports/wood-saw-raise-remove-other/screens/S1.png` |
| S2 | add Combination Pliers, 2 units | $40.48 | "$40.48" | pass | `e2e/reports/wood-saw-raise-remove-other/screens/S2.png` |
| S3 | set quantity of Wood Saw to 3 | $61.60 = $64.84 − eco-discount $3.24 | "$61.60" | pass | `e2e/reports/wood-saw-raise-remove-other/screens/S3.png` |
| S4 | remove Combination Pliers | $34.71 = $36.54 − eco-discount $1.83 | "$34.71" | pass | `e2e/reports/wood-saw-raise-remove-other/screens/S4.png` |

Repeat 1 of 3 is shown; every repeat is in `run.json`.

### Verification of the test

| Check | Result |
| --- | --- |
| Intent review | INTENT_OK, `e2e/specs/wood-saw-raise-remove-other.intent.md`, for the confirmed scenario |
| Static check, reference cart | PASS (gates G0, G1) |
| Defects on stub prices | 11 of 11 detected at the right step, 2 not applicable |
| Defects on the prices of this run | 12 of 12 detected at the right step, 1 not applicable |
| Live run | 3 of 3 repeats passed; the test is the untouched compilation of the confirmed scenario |
| Live controls | 4 of 4 caught |
| Report review | VERIFIED, `review.md` of this run |

### Not covered by this scenario

- rule-boundary: Add a step at which the cart sits exactly at the threshold of rule eco-discount.

### Pricing rules

- eco-discount: 5% off when more than half of the units have co2_rating A or B · source: observed on the live site, confirmed · in force at S1, S3, S4 in this run.

### Page driver

`e2e/app/toolshop.driver.ts`: the plugin's starter pack for toolshop, as setup installed it. This flow did not change it (sha256 382d9e8915d5…). Operations this scenario used: candidates, productFacts, readCart, addProduct, setQuantity, remove. The total was read from the row "Total".

The page driver is the one file that knows the shop's pages: the test calls it to find products, add them, change quantities, remove them and read the cart, so the test holds no locator.

### Files

| File | Content |
| --- | --- |
| `e2e/tests/wood-saw-raise-remove-other.spec.ts` | the test |
| `e2e/specs/wood-saw-raise-remove-other.md` | the confirmed scenario |
| `e2e/specs/wood-saw-raise-remove-other.intent.md` | the intent review |
| `e2e/reports/wood-saw-raise-remove-other/report.md` | the full report, every defect and control |
| `e2e/reports/wood-saw-raise-remove-other/screens/` | one screenshot per step |
| `e2e/app/toolshop.driver.ts`, `.pricing.ts`, `.map.md` | page driver, pricing rules, locator evidence |

### Run it again

`cd e2e && npm run qa -- run wood-saw-raise-remove-other` (3 repeats, with the report)
`cd e2e && npx playwright test tests/wood-saw-raise-remove-other.spec.ts` (plain Playwright)

---

This scenario never puts the cart exactly on the eco-discount threshold. To cover that, a follow-up scenario could add a step where exactly half of the units are saws.
````

## Nested sessions

All headless, `--permission-mode auto`, `--output-format json`, never `--dangerously-skip-permissions`, in scratch
repos outside the worktree. No session ended with a usage-limit message.

| # | Purpose | Model | Turns | Duration | Cost |
| --- | --- | --- | --- | --- | --- |
| E55–E70 | all level A cases once (`evals/run.mjs --jobs 4`), stage 3 | sonnet (+ agents) | 1–17 | 4–75 s | $3.53 in all |
| L1 | `/qa:setup toolshop https://practicesoftwaretesting.com` | default (`claude-opus-5-5`) | 3 | 102 s | $0.23 |
| L2 | `/qa:new-test "<reference request>"`, no `--yes` → ends at "Confirm?" | default | 6 | 21 s | $0.35 |
| L3 | `/qa:new-test two-products-change-remove --yes` → `VERIFIED` | default + test-verifier (2) | 16 | 185 s | $0.93 |
| L4 | `/qa:new-test "<Wood Saw request>" --yes` → `VERIFIED` | default + test-verifier (2) | 18 | 196 s | $1.00 |

Total: 20 sessions, about $6.04.

## Live invocations

Against https://practicesoftwaretesting.com, headless, one at a time: **6 of 8** (1–4 in stage 4, 5–6 in stage 5).

| # | UTC | Invocation | Result |
| --- | --- | --- | --- |
| 1 | 12:33:20 | L3 `qa-harness run two-products-change-remove`, run `20261125T123320Z-da61` | `PASS` 3/3 |
| 2 | 12:33:49 | L3 `qa-harness verify two-products-change-remove` (test-verifier), run `20261125T123349Z-fee3`, promoted | `PASS`, G4 4/4 |
| 3 | 12:36:28 | L4 `qa-harness run wood-saw-raise-remove-other`, run `20261125T123628Z-1fac` | `PASS` 3/3 |
| 4 | 12:37:01 | L4 `qa-harness verify wood-saw-raise-remove-other` (test-verifier), run `20261125T123701Z-8ba1`, promoted | `PASS`, G4 4/4 |
| 5 | 12:41:37 | clone, `e2e/`: `npx playwright test tests/two-products-change-remove.spec.ts` (the plain line of "Run it again") | `2 passed (5.7s)`, exit 0 |
| 6 | 12:41:51 | clone, `e2e/`: `npm run qa -- run two-products-change-remove` (the first line of "Run it again"), run `20261125T124152Z-3cc8` | `VERDICT: PASS`, 3/3, exit 0 |

The dry runs, setup's selftest, the evals (A10 uses `127.0.0.1`) and my two `example` calls on scratch copies use no
browser on the live site.

## Not done

- `qa-harness example` without `--confirm` dropping the `confirmed` record of a confirmed scenario (stage 4,
  observation): not changed, outside the two texts this order changes.
- A third is never worded "a third" in practice: the rules vocabulary takes only decimal shares, and no finite decimal
  is exactly 1/3 (stage 1).
- `docs/reference.md` grew from 449 to 465 lines (order E's limit of 450 is not part of this order).

## Measurements

| Stage | From (UTC) | To | Minutes |
| --- | --- | --- | --- |
| 0 workspace, baseline | 12:15:20 | 12:16:13 | 1 |
| 1 confirmation | 12:16:13 | 12:21:59 | 6 |
| 2 readback | 12:22:08 | 12:27:30 | 5 |
| 3 leftovers (eval run to 12:33:38) | 12:28:58 | 12:34 | 5 |
| 4 live run, examples, documents | 12:29:55 | 12:41 | 11 |
| 5 exit checks, report | 12:41 | see the last commit | — |

Stages 3 and 4 overlapped while nested sessions ran. Stage 4 started at minute 15, before minute 40.

## Stage 5 — exit checks

`date -u`: `Wed Nov 25 12:41:06 UTC 2026`. On commit `4e56139` (the code of all stages), clean tree.

Rerun lines of the readback, from a `git clone` of the scratch repo (at `61ce58b`) without Claude Code, `npm ci` in
`e2e/` (`added 16 packages`), then in `e2e/`:

```text
$ npx playwright test tests/two-products-change-remove.spec.ts
Running 2 tests using 1 worker

  ✓  1 [dry] › tests/two-products-change-remove.spec.ts:9:1 › Two different products, change the quantity of one, remove the other, total checked after each step (101ms)
  ✓  2 [live] › tests/two-products-change-remove.spec.ts:9:1 › Two different products, change the quantity of one, remove the other, total checked after each step (5.0s)

  2 passed (5.7s)

$ npm run qa -- run two-products-change-remove
…
G3 live, 3 repeat(s) on https://practicesoftwaretesting.com: 3/3 pass; 3/3 repeats ended PASS
…
G2 again on the products of this run: 13 defects: 9 detected where expected, 0 late, 0 missed, 4 not applicable
Evidence: reports/two-products-change-remove/runs/20261125T124152Z-3cc8/
VERDICT: PASS
```

Exit checks of order F, on `4e56139`, last line of each (`templates/e2e` unless noted):

| Check | Last line |
| --- | --- |
| `npm ci` | `added 16 packages in 814ms` |
| `npx tsc --noEmit` | exit 0, no output |
| `npm run typecheck:toolshop` | exit 0 |
| `npm run test:unit` | `202 passed (6.1s)` |
| `npm run qa -- selftest` | `VERDICT: PASS` (`13/13 rows passed in 77.9 s.`) |
| `npm run qa:toolshop -- doctor` | `VERDICT: PASS` |
| `qa:toolshop -- run two-products-change-remove --dry`, `run wood-saw-raise-remove-other --dry` | `VERDICT: PASS`, `VERDICT: PASS` |
| root: `node --test scripts/` | `ℹ tests 16`, `ℹ fail 0` (with `neutrality.test.mjs` and `transcript.test.mjs`) |
| root: `node scripts/check-contracts.mjs` | `ok: skills/contracts/driver.md quotes templates/e2e/support/core/types.ts exactly.` |
| root: `claude plugin validate .` | `✔ Validation passed` |
| root: `grep -rniE "toolshop\|practicesoftwaretesting\|pliers\|wood saw" skills agents` | no output |
| R15: `git grep -I -i` for `/Users/`, `/private/tmp`, the home folder name, `cookie:`, `authorization:`, `bearer <value>`, `x-api-key:` over `examples/` and `docs/` | no hit in `examples/`; in `docs/` only the search patterns quoted in orders E, F, V and reports E, F, N, V, and a scratch path in prose in report D (from order D, not touched here) |
| `grep -c '<!--'` `README.md`, `docs/reference.md` | `0`, `0` |
| `wc -l README.md` | `250` |
| `git status --short` after the last commit | (no output; checked after the commit below) |

The time box: started 12:15:20, last check 12:42:42, minute 27 of 70; no stage was cut.
