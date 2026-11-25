# Report V: independent verification of the harness of order N

Branch `v-review` (from `n-harness` at `157d027`), worktree `.worktrees/v-review`. Started `Wed Nov 25 02:12:24 UTC 2026`.

## Plan

Time box 120 min from 02:12:24 UTC; after 03:52 UTC (100 min) finish the current part and write the summary.

| Part | What | Budget |
| --- | --- | --- |
| 0 | branch check, order committed, `.sandbox/` in `.gitignore`, this plan | 3 min |
| 1 | reproduce the claims: npm ci, tsc, unit, selftest, doctor, two dry runs, two live `verify` (live first) | 15 min |
| 2 | 29 mutations + own mutations, one at a time, unit + selftest each; hollow tests | 35 min |
| 3 | conformance by experiment (6.1, 6.3, compile contract, V1–V8, run.json, R15, C2, clean export, repair loop, staleness, promotion, parallelism) | 25 min |
| 4 | evidence vs. report (screenshots, run.json, verification.json, report.md) | 10 min |
| 5 | hostile and sloppy input | 10 min |
| 6 | a tester's read | 5 min |
| 7 | code against the quality bar, npm audit | 5 min |
| 8 | open questions of report N, summary, commit | 10 min |

Method: every mutation is a single in-place edit under `templates/e2e/`, measured with `npm run test:unit` and
`npm run qa -- selftest`, undone with `git restore`, followed by `git status --short` (nothing under
`templates/` or `examples/`). Scratch roots live in `.sandbox/` in this worktree. Live budget: at most 10
invocations against https://practicesoftwaretesting.com, headless, counted in Measurements.

## 1. Verdict

1. **Not submittable as it is.** The claims reproduce (both live verifications `PASS` with identical totals and control facts, selftest 12/12, a clean export builds and passes), but `report --promote` puts a red or a dry run into the repo with `VERDICT: PASS` and deletes the verified evidence (B1).
2. 12 of 34 mutations survive both the unit tests and the selftest: the settle poll, `DEFECT_LATE`, the classification order, raw text, G1 conformance and every R4–R9 guarantee have no test (F11, F12).
3. Fix first B1 (a verdict and mode guard on promotion), then one test per survivor (F11, F12), then F4 (driver bugs classified as the environment) and F9 (three ways past G0).

## 2. Findings

Most serious first. Paths are relative to the repo root; line numbers are those of `HEAD` (`n-harness` `157d027`).

| Id | Severity | What | Evidence | File and line | Direction of the fix |
| --- | --- | --- | --- | --- | --- |
| B1 | blocker | `report --promote` accepts any run: a red run, a dry run, a run without `run.json`. It ends `VERDICT: PASS`, exit 0, deletes the tracked `run.json` and screenshots of the verified live run and puts the red or dry set in their place. Design 8.5 allows automatic promotion after `VERIFIED` and a manual one only for an amount mismatch. | Part 3, promotion: `report cart-total-add-change-remove --promote 20261125T022311Z-21b1` (dry, `DEFECT_LATE`) → "Promoted run … report.md, verification.json, screens/ (0)." `VERDICT: PASS`; the set's hash changed `88efaca0c0b7` → `6b2834eb882c`, `report.md` now "**DEFECT_LATE** 0/0". Same with a dry `PASS` run ("No checkpoint was judged in this run"). Mutation 28 cannot be applied: there is no verdict check to remove. | `templates/e2e/support/harness/report.ts:157-180` | Refuse a dry run and any run whose `verification.json` verdict is not `PASS` after G4, and admit an `ORACLE_MISMATCH`/`UNMODELED_ADJUSTMENT` live run only with an explicit tester flag; leave the set untouched on refusal. |
| F11 | fix | Five behaviours of the oracle and the classification are implemented but no unit test or selftest row fails when they break (survivors 10, 16, 18, 19, O2): the poll until `settleMs` (9.1), `DEFECT_LATE` (10.5), environment before locator (6.1), `rawText` verbatim (8.5), G1's comparison with the approved example (`CONFORMANCE_FAIL`). | Part 2: each mutation alone, manifest regenerated, `test:unit` 139 passed and `selftest` 12/12 `PASS`. | `templates/e2e/support/core/checkpoint.ts:250`, `templates/e2e/support/harness/gates.ts:136, 61`, `templates/e2e/support/core/classification.ts:60`, `templates/e2e/support/core/checkpoint.ts:203` | Add the missing tests named in the mutation table (one per survivor). |
| F12 | fix | None of the integrity and repair guarantees has a test (survivors 20, 25, 26, 27, O5, O6): `doctor` `HARNESS_MODIFIED` (R4), the rules-file freeze (R6), `VERIFICATION_STALE` (R7), `RETRY_REFUSED` and `LIMIT_REACHED` (R9), the lock. They work today (part 3), but can be broken unnoticed. | Part 2, same method. The selftest row "integrity" calls `manifestChanges()` directly (`selftest.ts:293`), never `doctor`; no unit test imports `attempts`, `doctor`, `run-dir` or `promote`. | `templates/e2e/support/harness/doctor.ts:32-57`, `templates/e2e/support/harness/attempts.ts:25-33`, `templates/e2e/support/harness/run-dir.ts:37-45`, `templates/e2e/support/core/scenario.ts:88-93` | Add a selftest row "guarantees" that edits a scratch root and expects each of these verdicts. |
| F4 | fix | Any exception that is not a library error is classified `INFRA_FAIL` (environment, "never app-mapper"), including a bug in the driver; a hanging driver call ends as a test timeout with no step. Design 6.3 asks for `UNDETERMINED` when the evidence does not settle the cause. | Root c2, driver throws `Error('driver bug: …')`: `INFRA_FAIL`, "the environment failed in at least one repeat". Root c3, `readCart` never resolves: `INFRA_FAIL` after 65 s, `error.step: null`, message "The test exceeded its time limit of 60000 ms." | `templates/e2e/support/core/verdicts.ts:69-72`, `templates/e2e/support/core/reporter.ts:63` | Map unknown exceptions to `UNDETERMINED` with the step and the driver method, and give every driver call its own `actionMs` limit so a hang names the step and the method. |
| F9 | fix | G0's driver rules miss three ways out of the UI boundary or into a fixed wait: a look-alike origin, a computed member, a `setTimeout` wait. | Root g0, appended to the driver: `page.goto('https://practicesoftwaretesting.com.attacker.example/steal')`, `page['waitForTimeout'](500)`, `new Promise((r) => setTimeout(r, 500))` — none reported by `doctor` or `run --dry`; only the `api.` subdomain URL and `fetch` were. | `templates/e2e/support/harness/lint.ts:119, 126, 131` | Compare `new URL(literal).origin` with the configured origin exactly, resolve string-literal computed members, and flag `setTimeout`-based waits. |
| F1 | fix | A rules file with an unknown condition passes `doctor` and crashes `example` with a TypeError reported as a harness bug. | Root hp, `when: { couponCode: 'SPRING' }`: `doctor` "ok: rules file app/toolshop.pricing.ts loads"; `example cart-eco-threshold` → "The harness failed unexpectedly: Cannot read properties of undefined (reading 'trim')" `INFRA_FAIL`. `tsc` on the same root: `TS2353 … 'couponCode' does not exist in type 'RuleCondition'` (0.7 s). | `templates/e2e/support/core/pricing.ts:68-84` (falls through to `subtotalAtLeast`), `templates/e2e/support/harness/doctor.ts:73-78` | Validate every rule against the 9.2 vocabulary when the rules file is loaded and report `LINT_FAIL` naming the rule id and the unknown key (or run `tsc` in `doctor`, open question 7). |
| F10 | fix | The selftest row "reference cart" prints the detected counts (12/13, 12/13, 10/11) but asserts only the verdict; G2 passes when no defect is applicable, so a regression that makes every defect not applicable keeps the row green. | Scratch copy (`.sandbox/clean`, restored): `expectedPlace` returning null → `G2 13 defects: 0 detected where expected, 0 late, 0 missed, 13 not applicable` `VERDICT: PASS`. | `templates/e2e/support/harness/selftest.ts:216-221` | Assert the expected number of applicable and detected defects for each fixture scenario. |
| F6 | fix | `report <slug>` prints the readback of a red run and then `VERDICT: PASS`, exit 0. | Root c4: `LOCATOR_FAIL 0/1 · run …`, four `LOCATOR_FAIL` rows, `VERDICT: PASS` `[exit=0]`. | `templates/e2e/support/harness/report.ts:188-191` | End `report` with the reported run's verdict (or a distinct positive verdict) so a script and a tester cannot read a red run as `PASS`. |
| F7 | fix | Repair counter: `run --dry --repair driver` is admitted and counted, although G0–G2 never execute the driver; the counter never resets, so after two green repairs every later repair is `LIMIT_REACHED` "the last ended PASS … Hand the matter to the tester". | Part 3, repair loop, root rp, steps 1–5. | `templates/e2e/support/harness/attempts.ts:23-37`, `templates/e2e/support/harness/run.ts` (repair with `dry`) | Admit `--repair driver` only for a live run, and close the episode (archive `attempts.json`) when a repair run ends `PASS`. |
| F2 | fix | One unreadable scenario makes `doctor` fail for the whole root, as a harness bug. | Root h with `specs/h-tabs.md` (tab indentation): `doctor` → "The harness failed unexpectedly: Tabs are not allowed as indentation …" `INFRA_FAIL`; without that file: 14 lines, `PASS`. | `templates/e2e/support/harness/doctor.ts:41-42` | Catch the read error per scenario and report it as a `SPEC_INVALID` line naming the file, then check the others. |
| F3 | fix | Conditions caused by the user or another run are reported as "The harness failed unexpectedly … report it as a harness bug", `INFRA_FAIL`: a held lock, a root without `qa.config.json`, an existing (dangling) file at the test path. | Part 3 promotion with `.lock` present; part 5 `--root /nonexistent/qa-root doctor`; part 3 compile onto a symlink (`EEXIST`). | `templates/e2e/support/harness/run-dir.ts:41-43`, `templates/e2e/support/core/config.ts` (loadConfig), `templates/e2e/support/harness/compile.ts:31`, catch-all `templates/e2e/support/harness/cli.ts:91-97` | Give each its own sentence and a dictionary verdict that says what to do (wait for the other run; point `--root` at an e2e root; remove the file), and keep the catch-all for real bugs. |
| F5 | fix | `FILE_CONFLICT` shows no difference when the hand edit reorders lines. Design 6.1: "shows the difference". | Root t1, `setQuantity` and `remove` swapped: "edited by hand, so nothing was written. Differences:" followed directly by "Move the change into the scenario…". | `templates/e2e/support/harness/compile.ts:11-18` (set membership, not position) | Diff by position (line numbers or an LCS) so moved and duplicated lines appear. |
| F8 | fix | Failure messages a tester cannot follow without the code: the ORACLE_MISMATCH cause omits the adjustment's raw text; UNMODELED_ADJUSTMENT says "the total is not the subtotal minus the adjustments", false for the page; a non-amount is reported in layer "labels". | Part 6, the three messages (roots c4, c5, c6). | `templates/e2e/support/core/checkpoint.ts:37-40, 124-130, 150-153, 165-181` | Quote the displayed raw text of the row named in the cause line; say "minus the modelled adjustments"; name the layer "amount" or "read" for a non-amount. |
| N1 | note | The 15-line limit is read as 15 lines plus the `VERDICT` line (16 in total). | Part 3: root c4 run, `[lines=16 … last=VERDICT: LOCATOR_FAIL]`. | `templates/e2e/support/harness/common.ts:15, 78-81` | Say in the design which reading holds, or cap at 14 + verdict. |
| N2 | note | One non-null assertion without a reason is left, in the driver lab. | `examples/toolshop/lab/driver.live.spec.ts:106` `e.getAttribute('data-test')!` | same | Replace it with a check, as was done in the driver. |
| N3 | note | `run.json` `meta.gitSha` does not identify the code that ran when the tree is dirty. | Both promoted runs: `gitSha 843d254`; the driver at `843d254` has sha256 `e923dd…`, `verification.json` `driverSha256` `382d9e…` (= HEAD). | `templates/e2e/support/core/reporter.ts:22-25` | Record a dirty flag (or the hashes of the driver, rules and test, which `verification.json` already has) next to `gitSha`. |
| N4 | note | `doctor` prints problems under `ok:` ("confirmed, test edited by hand", "changed, test compiled"). | Part 3 staleness output. | `templates/e2e/support/harness/doctor.ts:58` | Print those as findings, not `ok:`. |
| N5 | note | Only `USD` and `EUR` can be configured. | `CurrencyCode = 'USD' \| 'EUR'` | `templates/e2e/support/core/types.ts:5`, `templates/e2e/support/core/config.ts:22` | Accept any ISO 4217 code that Intl formats; the parser already takes the format from Intl. |
| N6 | note | A single read that throws inside a checkpoint is retried silently until `settleMs`; nothing records it. | Root c2 (throw on the 3rd read only): `PASS`, no trace of the error in the output. | `templates/e2e/support/core/checkpoint.ts:237-251` | Count read errors in the checkpoint record so a flaky driver shows. |

## 3. Claims of report N

| Claim | Status | Reason |
| --- | --- | --- |
| Exit criteria 1–6 (`npm ci`, `tsc`, typecheck, 139 unit tests, selftest 12/12, `doctor` `PASS`, dry run 12/0/0/1) | confirmed | Part 1, identical outputs. |
| Both scenarios verified live, `PASS` 3/3, four controls caught at S1, S1, S3, S4 | confirmed | Part 1, live invocations 1 and 2; totals, repeats, verdict and all four facts equal the promoted files. |
| Promoted evidence (screenshots, `run.json`, `report.md`, `verification.json`) agrees with itself and with the current files | confirmed | Part 4: eight screenshots read; hashes equal; every number traced. Only `meta.gitSha` names a commit that is not the code that ran (N3). |
| Compile contract 6.1 | confirmed, except the difference listing | Part 3: same bytes, exclusive create, no-op, `FILE_CONFLICT`, `--force`; a reordering shows an empty difference (F5). |
| V1–V8 each give `SPEC_INVALID` naming the rule | confirmed | Part 3, eight scenarios of my own. |
| `run.json` per 8.5, written despite a failure, raw text verbatim | confirmed | Part 3 (script check, throwing and hanging drivers, U+00A0 kept). |
| R15 (no secrets in promoted files) and C2 (template holds only the two npm scripts) | confirmed | Part 3 searches. |
| The committed tree is self-sufficient | confirmed | `git archive HEAD` → `npm ci`, 139 unit tests, selftest 12/12. |
| Repair attempts: `RETRY_REFUSED`, then `LIMIT_REACHED` at 2 | confirmed | Part 3, dry; with F7. |
| `doctor` reports staleness of driver, test, rules | confirmed | Part 3, one character each. |
| Parallel runs get separate, complete directories | confirmed | Part 3, two processes in the same second. |
| Promotion "replaces the tracked set atomically under the lock" | partly | Atomic and refused under a held lock (set unchanged), but any run is promoted, red or dry, with `PASS` (B1); the refusal under the lock reads as a harness bug (F3). |
| Selftest row "reference cart: every applicable default defect red where expected (12/13 …)" | not confirmed as a check | The counts are printed, not asserted; G2 passes with 0 applicable defects (F10). |
| `doctor` "rules file … loads" means the rules file is usable | not confirmed | An unknown condition passes `doctor` and crashes `example` (F1). |
| `doctor` "driver … stays within the UI" | partly | Three bypasses not reported (F9). |
| Quality bar: every message a complete sentence saying what to do next | not confirmed | F3 ("report it as a harness bug" for user errors), F8, part 6. |
| Quality bar: no `any`, no TODO, file headers, no leftovers, no non-null assertion without a reason | confirmed, one exception | One non-null assertion left in the driver lab (N2). |
| `price_source: api`, `need` with a missing action, `defects check`, the `driver-live` lab, `FLAKY` routing, 5xx classification, a red G2 on live prices | not checked | No live case occurred and the order did not ask for them; budget kept for the parts above. |

## 4. Mutation table (part 2)

Started `Wed Nov 25 02:18:41 UTC 2026`, ended 02:48:12 UTC (runner `.sandbox/mut/run.mjs`, results in
`.sandbox/mut/results/`, not committed). Method: one mutation at a time in `templates/e2e`, then
`doctor --write-manifest` (otherwise the selftest row "integrity" turns red for *any* edit — shown in the clean
copy: one comment line in `money.ts` → `HARNESS_MODIFIED` — and would hide whether a behavioural check fails),
then `npm run test:unit` and `npm run qa -- selftest`, then `git restore` of the file(s) and `MANIFEST.json`;
`git status --short -- templates examples` was empty after each of the 34. A mutation caught by a unit test also
turns the selftest row "unit tests" red; that row is not repeated below.

| # | Mutation (where) | Caught by | Survivor: missing test |
| --- | --- | --- | --- |
| 1 | tolerance 1 cent (`money.ts:124`) | unit: "more than half a cent is outside tolerance", "total: a total one cent off is red"; selftest: reference cart, classification, control page, parallelism | — |
| 2 | bare number accepted where a symbol is required (`money.ts:185`) | unit: "a bare number is rejected when the symbol is required"; selftest: money | — |
| 3 | `add` sets the quantity (`ledger.ts:36`) | unit: "add of a product in the cart grows its quantity" (+2); selftest: product selection | — |
| 4 | `above` as "at or above" (`pricing.ts:76`) | unit: 13 tests (checkpoint, example, pricing) | — |
| 5 | percentage of the running value on the subtotal (`pricing.ts:90`) | unit: "a percentage of the running value follows earlier adjustments" | — |
| 6 | label layer skipped (`checkpoint.ts:66-67`) | unit: "labels: a total read from the subtotal row is a read error"; selftest: control page (wrong driver with a discount → `ORACLE_MISMATCH`) | — |
| 7 | unit-price layer skipped (`checkpoint.ts:98`) | unit: "unit price: a price other than the one read at the add is red"; selftest: control page (drift-price missed) | — |
| 8 | only the total compared (`checkpoint.ts:148`, findings cleared before the total) | unit: 10 checkpoint tests; selftest: reference cart, classification, control page, parallelism | — |
| 9 | an adjustment with no rule accepted (`checkpoint.ts:115-118`) | unit: "a row with no rule is an unmodeled adjustment", "an unmodeled adjustment outranks the total mismatch" | — |
| 10 | first read is final, no poll until `settleMs` (`checkpoint.ts:250`) | — | **survivor.** Every unit test uses `settleMs: 0` and a driver right on the first read. Missing: a driver whose first read disagrees and second agrees → green with `reads: 2`; one that never agrees → red after ≥ `settleMs`. |
| 11 | V6 off (`validator.ts:163`) | unit: 2 validator tests; selftest: validator | — |
| 12 | V5 off (`ledger.ts:26`, the step table shared with the validator, design 8.1) | unit: ledger and validator V5; selftest: validator | — |
| 13 | `needQty` = largest step argument (`compiler.ts:17`) | unit: "needQty is the largest state …"; selftest: product selection | — |
| 14 | last checkpoint not emitted (`compiler.ts:56`) | unit: golden file, "the checkpoints follow the check field"; selftest: compiler, reference cart, equal prices, empty cart, classification, control page, parallelism | — |
| 15 | unnamed pick may take a named product (`selection.ts:27`) | selftest only: product selection ("selected Green Lamp") | — |
| 16 | `detected-late` counted as `detected` (`gates.ts:136`) | — | **survivor.** No test produces a late defect. Missing: a selftest case with one `checkTotal` removed from the compiled test → `DEFECT_LATE` (report N did this once by hand). |
| 17 | zero tests → `PASS` (`classification.ts:58`) | unit: "zero executed tests is NO_TESTS_RUN"; selftest: classification | — |
| 18 | locator failure before environment failure (`classification.ts:60`) | — | **survivor.** The unit test mixes `INFRA_FAIL` only with `ORACLE_MISMATCH`. Missing: repeats `[LOCATOR_FAIL, INFRA_FAIL]` → `INFRA_FAIL`. |
| 19 | `rawText` replaced by the formatted value (`checkpoint.ts:203`) | — | **survivor.** Missing: `displayedRecord` of `"- $0.61"` and `"24,90 €"` (U+00A0) keeps both byte for byte. |
| 20 | `doctor` ignores a changed file in `support/core` (`doctor.ts:32`) | — | **survivor.** The integrity row calls `manifestChanges()`, not `doctor`. Missing: a changed core file in a scratch package → `doctor` `HARNESS_MODIFIED`. |
| 21 | `waitForTimeout` accepted (`lint.ts:119`) | unit: "waitForTimeout in a driver is forbidden" | — |
| 22 | `skew-total` activates and rewrites nothing (`live-controls.ts:57`) | selftest only: control page (skew-total missed) | — |
| 23 | the wrong driver treated as correct: an active control with a green test counts as caught (`verify.ts:47`) | selftest only: control page ("the wrong driver with equal values: PASS") — the row does not pass | — |
| 24 | hand edit overwritten without `--force` (`compile.ts:37`) | selftest only: compiler | — |
| 25 | `RETRY_REFUSED` never issued (`attempts.ts:31`) | — | **survivor.** Missing: two `--repair` runs with an unchanged file → `RETRY_REFUSED`. |
| 26 | `LIMIT_REACHED` never issued (`attempts.ts:25`) | — | **survivor.** Missing: a third admitted repair → `LIMIT_REACHED`. |
| 27 | a driver changed after verification still verified (`doctor.ts:55`) | — | **survivor.** Missing: a verified scratch root with one byte changed in the driver (and test, rules) → `VERIFICATION_STALE` naming it. |
| 28 | promotion of a non-`PASS` run | not applicable | `promote` (`report.ts:157-180`) has no verdict check to switch off; the property is absent, shown by experiment (B1). |
| 29 | two runs in one directory (`run-dir.ts:11` fixed suffix, `:22` non-exclusive `mkdir`) | selftest only: parallelism ("two runs got the same run directory") | — |
| O1 | G0 `goto` rule off (`lint.ts:131`) | — | **survivor.** The unit test "goto outside the application" uses an absolute foreign URL, which the URL-literal rule also flags, and asserts only `length > 0`. Missing: `page.goto('elsewhere.html')` must be reported by the goto rule. |
| O2 | G1 no longer compares totals with the approved example (`gates.ts:61`) | — | **survivor.** No test ever produces `CONFORMANCE_FAIL`. Missing: an example whose `totalExact` differs from the compiled test's → `CONFORMANCE_FAIL`. |
| O3 | subtotal layer skipped (`checkpoint.ts:142`) | unit: "subtotal: a subtotal other than the sum of lines is red" | — |
| O4 | adjustment amount not compared (`checkpoint.ts:127`) | unit: "adjustments: a wrong amount is red" | — |
| O5 | a held lock never refuses (`run-dir.ts:41`) | — | **survivor.** Missing: a promotion with a fresh `.lock` → refused, tracked set unchanged. |
| O6 | a changed rules file not detected (`scenario.ts:91`) | — | **survivor.** Missing: confirm, change the rules file, `compile` → `SCENARIO_CHANGED` "the rules file changed". |

Score: 34 applied (28 of the 29 in the order, #28 not applicable; 6 of mine). Caught 22, survived 12 (#10, 16, 18, 19, 20,
25, 26, 27, O1, O2, O5, O6). Selftest-only catches: #15, 22, 23, 24, 29. Unit-only catches: #4, 5, 9, 21, O3, O4.

Tests that cannot fail, or barely: no unit test asserts a constant and none lacks an assertion (one `expect` each,
script count); two assert only `length > 0` (`unit/lint.spec.ts:16` test.only, `:24` goto — the second masks O1);
the selftest row "reference cart" asserts the verdict but not the counts it prints (F10); the row "integrity" is a
tamper check that fires on any byte, so it cannot tell a behavioural regression from a comment; the row "unit
tests" checks the exit code of the unit run, which is the right check.

## 5. The open questions of report N (part 8)

Started `Wed Nov 25 02:31:00 UTC 2026`.

| # | Question | Keep or change | Reason from what I observed |
| --- | --- | --- | --- |
| 1 | `qa:toolshop` in the template | keep | The C2 search finds exactly these two scripts and nothing else; they are what the exit criteria and this order run, and removing them belongs to `/qa:setup`. |
| 2 | A red G2 on live prices becomes the run verdict | keep | Live prices changed what the test can see: G2 went from 12/13 applicable on stubs to 9/13 on the live products of the first scenario (4 rule defects not applicable), so a live-price miss is a real loss of detection, not noise. |
| 3 | Generic success body `200 {}` / `204` | keep | Both network controls were caught on Toolshop in both verifications of this session and on the control page in every selftest; no application here checks the body, so there is no observation that asks for a body in the bindings. |
| 4 | Fact 3 of network controls = the total the driver read at the expected checkpoint | keep | `total "$26.16" at S3, expected $54.46` (lost-update) told me in one line that the change never happened; that is the fact a tester needs. |
| 5 | `no-geolocation` by construction | keep | `templates/e2e/support/core/fixtures.ts:61` creates every context with `permissions: []`; no run in this session showed a permission prompt, so a run-time probe would test Playwright, not the application. |
| 6 | Retry a repeat that ends `INFRA_FAIL` once | keep (no retry) | In this session the live site failed to answer **0 times** in 2 invocations (6 G3 repeats and 8 control runs, 14 browser sessions against the site); with report N's 2 failures in 15 invocations the rate does not justify hiding an environment failure behind a retry. Make the classification right first (F4: a driver bug is now also `INFRA_FAIL`, and a retry would repeat it). |
| 7 | `doctor` without the TypeScript compiler | change | A rules file with an unknown condition passed `doctor` ("rules file … loads") and crashed `example` with a TypeError (F1); `tsc --noEmit` on the same root named it exactly (`TS2353 … 'couponCode' does not exist in type 'RuleCondition'`) and `npm run typecheck:toolshop` took 0.7 s. |
| 8 | Readback headline `PASS 3/3` without "verified" | keep | The harness cannot know whether an intent review exists, and `VERIFIED` is the agent's verdict; the real problem in the readback is elsewhere (F6: `report` prints `VERDICT: PASS` under a red table). |

## 6. Measurements

Wall-clock from `date -u` at the start of each part. Parts 3–7 ran while the mutation runner of part 2 worked in
the background on `templates/e2e`; they used the clean export, so the times overlap.

| Part | From | To | Minutes |
| --- | --- | --- | --- |
| 0 workspace, order committed, plan | 02:12:24 | 02:12:43 | 0.5 |
| 1 reproduce the claims (incl. both live verifications, 54 s and 51 s) | 02:12:43 | 02:16:54 | 4 |
| clean export: `npm ci`, unit tests, selftest | 02:17:15 | 02:18:30 | 1.5 |
| 2 mutations (34 × about 55 s, background) | 02:18:41 | 02:48:12 | 29.5 |
| 3 conformance by experiment | 02:17:15 | 02:24:25 | 7 |
| 5 hostile and sloppy input (incl. local control-app runs) | 02:21:00 | 02:25:02 | 4 |
| 4 evidence vs. report | 02:25:02 | 02:26:10 | 1 |
| 7 code against the quality bar | 02:26:10 | 02:27:20 | 1 |
| 6 a tester's read (incl. two control-app runs) | 02:25:45 | 02:29:20 | 3.5 |
| 8 open questions; G0 and G2 probes | 02:29:20 | 02:32:03 | 3 |
| summary and commit | 02:48:16 | 02:55 | 7 |

Total about 43 minutes of the 120-minute box; no part was cut.

Live invocations against https://practicesoftwaretesting.com: **2 of 10**, both headless, one browser.

| # | UTC | What | Result |
| --- | --- | --- | --- |
| 1 | 02:13:04 | `verify cart-total-add-change-remove` | `PASS`, G3 3/3, G4 4/4 caught |
| 2 | 02:14:03 | `verify cart-eco-threshold` | `PASS`, G3 3/3, G4 4/4 caught |

The repair loop, staleness, promotion, parallelism and every failure message were exercised without the live
site: dry runs, and the control page of `support/harness/control-app/` served on 127.0.0.1 from the clean export
(about 20 local runs). The live site did not fail once (0 of 14 browser sessions).

Scratch material (not committed, under `.sandbox/`, ignored by `.gitignore`): `clean/` (export of `HEAD`),
`roots/` (scratch roots t1, t2, v18, par, st, rp, pr, pl, pl2, h, hp, g0, hol, c1–c6), `mut/` (mutation list,
runner, results), `logs/`, `qa.sh`, `mkroot.sh`, `mkctl.sh`, `serve-control.ts`, `cmp.mjs`, `runjson.mjs`.

## Evidence by part

The sections below hold the commands, outputs and observations the tables above rest on.

## Part 1 — Reproduce the claims

Started `Wed Nov 25 02:12:43 UTC 2026`, ended 02:16:54 UTC. All commands in `templates/e2e/`.

| Claim in report N | Observed | Status |
| --- | --- | --- |
| `npm ci`: 0 vulnerabilities, exit 0 | `found 0 vulnerabilities`, exit 0 | confirmed |
| `npx tsc --noEmit` clean; `npm run typecheck:toolshop` exit 0 | both exit 0, no output | confirmed |
| `npm run test:unit`: 139 passed | `139 passed (1.0s)` | confirmed |
| `selftest`: 12/12 rows, `VERDICT: PASS`, ~55 s | `12/12 rows passed in 58.0 s.` `VERDICT: PASS` (row texts identical to report N) | confirmed |
| `doctor`: `VERDICT: PASS` with six `ok:` lines | identical six lines, `VERDICT: PASS` | confirmed |
| `run cart-total-add-change-remove --dry`: 12 detected, 0 late, 0 missed, 1 n/a, `PASS` | run `20261125T021637Z-8eb1`: identical G0–G2 lines, `PASS` | confirmed |
| `run cart-eco-threshold --dry`: 11 detected, 2 n/a, `PASS` | run `20261125T021639Z-c34b`: identical, `PASS` | confirmed |
| live `verify cart-total-add-change-remove` (promoted `20261125T012823Z-d8c5`) | run `20261125T021304Z-2c6f` (live 1, 54 s): G3 3/3 PASS; G2-live 9/0/0/4; G4 4 caught | confirmed |
| live `verify cart-eco-threshold` (promoted `20261125T012915Z-a9a2`) | run `20261125T021403Z-a36c` (live 2, 51 s): G3 3/3 PASS; G2-live 12/0/0/1; G4 4 caught | confirmed |

Live runs against the promoted `run.json`/`verification.json` (script `.sandbox/cmp.mjs`, not committed):

| | Promoted | Observed now |
| --- | --- | --- |
| total-add-change-remove, verdict / repeats | `PASS`, 3 × pass | `PASS`, 3 × pass |
| totals S1–S4, every repeat (expected / raw) | 14.15/"$14.15", 26.16/"$26.16", 54.46/"$54.46", 42.45/"$42.45" | identical in all three repeats |
| skew-total: activated · target · shown at read · first red | yes · row "Total" · "$14.16" S1, "$26.17" S2, "$54.47" S3, "$42.46" S4 · S1 | identical |
| drift-price | yes · `GET **/carts/*`, 7 intercepted, 7 raised · total "$14.16" at S1, expected $14.15 · S1 | identical |
| lost-update | yes · `PUT **/carts/*/product/quantity`, 1 · "$26.16" at S3, expected $54.46 · S3 | identical |
| lost-remove | yes · `DELETE **/carts/*/product/*`, 1 · "$54.46" at S4, expected $42.45 · S4 | identical |
| eco-threshold, verdict / repeats | `PASS`, 3 × pass | `PASS`, 3 × pass |
| totals S1–S4 | 11.57, 40.48, 61.60, 34.71 (raw text equal) | identical in all three repeats |
| controls (four facts) | caught at S1, S1, S3, S4; drift "$11.58" vs $11.57; lost-update "$40.48" vs $61.60; lost-remove "$61.60" vs $34.71 | identical (only cart ids in the request paths differ) |

The live site answered every request in both runs: 0 environment failures in 2 live invocations.

## Part 3 — Conformance to the design, by experiment

Started `Wed Nov 25 02:17:15 UTC 2026`. Every experiment ran with the clean export `.sandbox/clean` (part 3,
last bullet) on scratch roots in `.sandbox/roots/`, so the mutations of part 2 running at the same time in
`templates/e2e` could not touch them. `qa.sh ROOT ARGS` = `tsx support/harness/cli.ts --root ROOT ARGS` in the
clean package, printing `[lines=N exit=E last=…]` after the output.

- **CLI (6.1).** The nine names of 6.1 in `--help` (12 lines incl. the verdict, exit 0). Longest outputs seen:
  `defects list` 14 + `VERDICT` = 15 lines; a failing live run (`LOCATOR_FAIL`, root c4) 15 + `VERDICT` = 16
  lines, the 15th being `… 2 more line(s): see the run directory`. `VERDICT:` was the last line in every
  invocation of this session. Exit code: 1 for every non-`PASS` verdict seen (`SPEC_INVALID`, `FILE_CONFLICT`, `INFRA_FAIL`,
  `DEFECT_LATE`, `LOCATOR_FAIL`, `ORACLE_MISMATCH`, `UNMODELED_ADJUSTMENT`, `NO_TESTS_RUN`, `RETRY_REFUSED`,
  `LIMIT_REACHED`, `SCENARIO_CHANGED`, `VERIFICATION_STALE`). Confirmed; but see F6: `report` on a red run
  prints the red readback and then `VERDICT: PASS`, exit 0.
- **Verdict dictionary (6.3).** `VERDICTS` in `support/core/verdicts.ts:4-9` holds the 25 names of the design
  table, each once (script diff of the sorted lists: equal; no duplicate). No code path emits a name outside
  the dictionary (`Verdict` type). Never emitted by the harness: `INTENT_OK`, `VERIFIED`, `REWORK`,
  `NEEDS_TESTER` (agents' verdicts, as report N says) and `UNDETERMINED`, which 6.3 assigns also to `run` and
  `verify` — the harness prints the routing text "UNDETERMINED: …" under `CONTROL_MISSED` but never issues it,
  and classifies unknown exceptions as `INFRA_FAIL` instead (F4).
- **Compile contract (6.1).** Same bytes twice: two roots compiled independently, `cmp` equal, sha256
  `207ddd82b4c7…` = the committed test; no absolute path or timestamp in the file. Identical content: `is up to
  date; nothing was written`, mtime unchanged. Exclusive create: with a dangling symlink at the test path,
  `EEXIST` and nothing written through the link (but reported as "harness failed unexpectedly", F3).
  Hand edit (checkpoint S2 removed): `FILE_CONFLICT`, file byte-identical afterwards, the difference shown as
  `- compiled: await shopper.checkTotal('S2');`. `--force`: rewritten, sha256 back to `207ddd82b4c7…`.
  Not confirmed in one case: swapping two steps gives `FILE_CONFLICT` with an empty "Differences:" list (F5).
- **V1–V8 (8.1)**, own scenarios `vb-*` (base: P1 add 2, P2 add 1, P1 add 1, remove P1, `check: [A2, A4]`, valid):
  V1 `price_source: html` → `V1: Field "price_source" must be ui or api.`; V2 an unused `P3` → `V2: Product P3 is
  declared but no step uses it`; V3 two by-name picks `"Wood Saw"` / `" wood saw "` → `V3: … both pick by-name`;
  V4 `setQty P1 0` → `V4 A4: … setQty needs a quantity of at least 1; use remove`; V5 `setQty P1 2` while P1 is 2
  → `V5 A3`; V6 `cart_after: { P1: 1, P2: 1 }` after `add P1 1` → `V6 A3: … write cart_after: { P1: 3, P2: 1 }`;
  V7 `check: [A1, A3]` → `V7: check has no checkpoint after the last step A4`; V8 `setQty P1 100` (limit 99) →
  `V8 A3`. Each `SPEC_INVALID`, exit 1, exactly one rule named. Confirmed.
- **run.json (8.5).** Script `.sandbox/runjson.mjs` checks every field of the 8.5 example (meta 12 fields,
  repeats, error `{ step, kind, message, url, rawTotal }`, checkpoint, ledger, expected, displayed
  `{label, value, rawText}`, screenshot in repeat 1): none missing in both promoted files and in every scratch
  run checked. A run whose driver throws from the third read on (root c2): `INFRA_FAIL`, `run.json` present with
  `error.step S2`, `rawTotal "24,90 €"`, S1 recorded. A test that hangs (root c3) still leaves `run.json` with a
  timeout record. `rawText` verbatim: the control page's `24,90 €` is stored with its U+00A0 (bytes
  `32 34 2c 39 30 a0 20ac`). Confirmed. Note: `meta.gitSha` of both promoted runs is `843d254`, whose driver
  (sha256 `e923dd…`) is not the driver that ran (`382d9e…`, `verification.json`); the runs were made on an
  uncommitted tree and nothing in `run.json` says so (N3).
- **R15.** `git ls-files examples docs` (non-PNG) searched for cookie, authorization, bearer, set-cookie, token,
  `/Users/`, x-api-key, `sid=`, JWT-shaped strings: only prose in the design and orders. 40+-hex hits are
  SHA-256 hashes. `verification.json` of both promoted runs holds guest cart and product ids in request paths
  (`/carts/01m88…`), which are not credentials. Confirmed.
- **C2 (14.3).** `git ls-files templates/e2e | xargs grep -inE "toolshop|practicesoftwaretesting|wood saw|pliers|
  claw hammer|thor|co2|eco-friendly|data-test=|nav-cart|<Toolshop prices>"`: only `package.json:12-13`
  (`qa:toolshop`, `typecheck:toolshop`), as report N says. Confirmed. (Portability limit, not C2:
  `CurrencyCode` is `'USD' | 'EUR'` only, `support/core/types.ts:5`, `config.ts:22`.)
- **Clean tree.** `git archive HEAD` → `.sandbox/clean`; `npm ci` (0 vulnerabilities), `npm run test:unit`
  (139 passed), `npm run qa -- selftest` (12/12, 56.1 s, `PASS`). Confirmed: the committed tree is self-sufficient.
- **Repair loop (R9).** Exercised without the live site: `run cart-total-add-change-remove --dry --repair
  driver` in root rp. 1st: attempt 1, `PASS`. 2nd, driver unchanged: `The driver is unchanged since repair attempt
  1 (sha256 382d9e8915d5…)` `RETRY_REFUSED`. 3rd, driver changed: attempt 2, `PASS`. 4th and 5th, driver
  changed again: `2 repair attempts … are recorded, the limit; the last ended PASS … Hand the matter to the
  tester.` `LIMIT_REACHED`. `attempts.json` after each step agrees (2 entries, runIds, verdicts, sha before).
  Confirmed, with F7 (a dry run, which never executes the driver, is admitted and counted as a driver repair;
  the counter never resets after a green repair). 0 live invocations spent.
- **Staleness (R5–R7)**, root st (copy of the verified example): one character in the driver's header comment →
  `VERIFICATION_STALE` for both scenarios ("the driver changed after verification"); `'S4'` → `"S4"` in one test
  → `VERIFICATION_STALE` for that scenario only ("the test changed"); `rate: '5'` → `'6'` in the rules →
  `SCENARIO_CHANGED` (shown first) plus `VERIFICATION_STALE` for both. Restored → `PASS`. Confirmed.
- **Promotion (8.5).** Lock held (fresh `.lock`): refused, the tracked set byte-identical (hash of the set
  before/after `e5e0a6cc7536`), but as "The harness failed unexpectedly … report it as a harness bug",
  `INFRA_FAIL` (F3). Lock older than 10 min: taken over, promotion done. **A red run is not refused (B1):** a dry
  run that ended `DEFECT_LATE` (hand-edited test) was promoted with `VERDICT: PASS`, exit 0; the tracked
  `run.json` and the four screenshots of the verified live run were deleted and replaced by `report.md` "**DEFECT_LATE**
  0/0", `verification.json`, `screens/ (0)`. A green dry run is promoted the same way ("PASS 0/0 … No checkpoint was
  judged in this run"). Not confirmed.
- **Parallelism (C4).** Two `run cart-total-add-change-remove --dry` started together from the shell: runs
  `20261125T022226Z-9674` and `…-f090` (same second), each `PASS`, each with its own `verification.json` whose
  `runId` matches, 12 G2 defect directories each. Confirmed.

## Part 4 — Does the evidence say what the report says?

Started `Wed Nov 25 02:25:02 UTC 2026`. All eight promoted screenshots opened and read:

| Run | Step | Screenshot shows | `run.json` (repeat 1) | `report.md` |
| --- | --- | --- | --- | --- |
| total | S1 | Combination Pliers ×1 $14.15 / $14.15; Total $14.15 | same lines, total "$14.15" | $14.15, "$14.15", match |
| total | S2 | + Pliers ×1 $12.01 / $12.01; Total $26.16 | same | $26.16, match |
| total | S3 | Combination Pliers ×3 $14.15 / $42.45, Pliers ×1; Total $54.46 | same | $54.46, match |
| total | S4 | Combination Pliers ×3 / $42.45; Total $42.45 | same | $42.45, match |
| eco | S1 | Wood Saw ×1 $12.18; Subtotal $12.18; Eco-Friendly Discount (5%) - $0.61; Total $11.57 | same, adjustment raw "- $0.61" | $11.57 = $12.18 − $0.61 |
| eco | S2 | Wood Saw ×1, Combination Pliers ×2 $28.30; no subtotal or discount row; Total $40.48 | same | $40.48 |
| eco | S3 | Wood Saw ×3 $36.54, Pliers ×2 $28.30; Subtotal $64.84; - $3.24; Total $61.60 | same | $61.60 = $64.84 − $3.24 |
| eco | S4 | Wood Saw ×3 $36.54; Subtotal $36.54; - $1.83; Total $34.71 | same | $34.71 = $36.54 − $1.83 |

`verification.json` of both runs: `testSha256`, `driverSha256`, `rulesSha256` equal the current files (script;
`doctor` `PASS` in part 1); each of the four controls has `activated`, `target`, `shownAtRead`, `reactedAt`.
Every number in both `report.md` files traces to the JSON: products and prices to the ledger of repeat 1,
"defects 11/11" and "12/12" to `defects`/`livePass`, the control table to `controls`, "in force at S1, S3, S4" to
the adjustments of repeat 1, the scope sentence to the displayed totals vs. subtotal and line totals, the four
scenario gaps of the first scenario to `livePass` (`rule-never`, `rule-wrong-rate`, `rule-boundary`,
`round-down`). Confirmed. Only `run.json` `meta.gitSha` does not identify the code that ran (N3).

## Part 5 — Hostile and sloppy input

Started `Wed Nov 25 02:24:25 UTC 2026`. Scratch roots h, hp, c2–c4; control app served locally (no live budget).

| Input | Result | OK? |
| --- | --- | --- |
| CRLF line endings | `example` `PASS`; `--confirm` rewrites the status line and keeps all 21 CR; `compile` `PASS` | yes |
| tab indentation | `V1: specs/h-tabs.md cannot be read (Tabs are not allowed as indentation at line 11 …)` `SPEC_INVALID` | yes |
| alias `a` | `V1: Product alias "a" is not allowed; use upper-case letters …` | yes |
| `add B 0` | `V4 S2: add needs a quantity of at least 1` (+ the V6/V4 it causes) | yes |
| quantity 100 | `V8 S3: … above the purchase limit of 99 in the rules file` | yes |
| unknown field `priority` | `V1: Unknown field(s) priority; the grammar is closed, remove them.` | yes |
| no `check` | `V1: Field "check" must be each-step, last-step or a list of step ids` | yes |
| step for undeclared `Z` | `V2 S4: Step S4 uses product Z, which is not declared` | yes |
| slugs `../specs/x`, `../../x`, `..%2f..%2fx`, `../../../../tmp/evil` | `<cmd> needs one scenario slug.` + usage, `SPEC_INVALID`; no file written (find on `-newer` marker) | yes (message does not say which characters a slug may hold) |
| `--root /nonexistent/qa-root` | `The harness failed unexpectedly: /nonexistent/qa-root/qa.config.json does not exist … report it as a harness bug` `INFRA_FAIL` | no (F3) |
| rules file with `when: { couponCode: 'SPRING' }` | `doctor`: "ok: rules file … loads"; `example`: `The harness failed unexpectedly: Cannot read properties of undefined (reading 'trim')` `INFRA_FAIL` | no (F1) |
| one unreadable scenario in `specs/` | `doctor` for the whole root: "The harness failed unexpectedly: Tabs are not allowed …" `INFRA_FAIL` | no (F2) |
| driver returns `"gratis"` as the total | `LOCATOR_FAIL`, `S1 · total read error … expected: an amount in EUR … displayed: "gratis" in row "Summe"` | yes |
| driver throws a plain `Error` on every read from the 3rd | `INFRA_FAIL` "driver bug: cannot read properties of undefined" | no (F4: a driver bug is not the environment) |
| `readCart` never resolves | `INFRA_FAIL` after 65 s: `The test exceeded its time limit of 60000 ms.`, `error.step: null` | bounded, but no step or action named (F4) |

No stack trace was ever the only output; no command hung beyond `testMs`; nothing was written outside the root.
A single thrown read inside a checkpoint is retried by the poll and the run stays `PASS` (root c2, first variant).

## Part 6 — A tester's read

Started `Wed Nov 25 02:28:53 UTC 2026`. Read: both `report.md`, the output of every subcommand in this session,
and three failure messages produced on the local control page (no live budget):

```text
S1 · total mismatch                                      (ORACLE_MISMATCH, root c5: rule rate 5% in the rules, 10% on the page)
  action:    add Teekanne, 3 units
  expected:  70,97 € = subtotal 74,70 € − rabatt 3,74 €
  displayed: "67,23 €" in row "Summe"
  diff:      −3,74 €
  layer:     adjustments · row "Rabatt" does not agree with rule rabatt

S1 · unmodeled adjustment                                (UNMODELED_ADJUSTMENT, root c6: rule removed)
  action:    add Teekanne, 3 units
  expected:  no adjustment row: no rule matches this label
  displayed: "-7,47 €" in row "Rabatt"
  layer:     adjustments · row "Rabatt" has no rule in app/control.pricing.ts
  also:      total: the total is not the subtotal minus the adjustments

S1 · total read error                                    (LOCATOR_FAIL, root c4: driver returns "gratis")
  action:    add Teekanne, 1 unit
  expected:  an amount in EUR
  displayed: "gratis" in row "Summe"
  layer:     labels · the text read for the total is not an amount in EUR
```

Sentences that need the code (or the design) to be understood:

1. `G1 ok: green on the healthy reference cart; ledger trace equals cart_after; totals equal the approved example`
   — "reference cart", "ledger trace", `cart_after` are internal terms; every `run` prints it.
2. `G2 13 defects: 12 detected where expected, 0 late, 0 missed, 1 not applicable` — nothing says the 13
   "defects" are faults the harness plants in its own simulated cart, not defects of the application.
3. `Scenario gap: round-down is not applicable: No amount at a checkpoint has a fraction of a cent above one half`
   — `round-down` is an operator id; the tester is not told what it would have detected.
4. ORACLE_MISMATCH above: the cause line names the row "Rabatt" but not what it displayed ("-7,47 €" is only in
   `run.json`); the quality bar of order N section 7 asks for every amount with its raw text.
5. UNMODELED_ADJUSTMENT above: `also: total: the total is not the subtotal minus the adjustments` is false for the
   page (74,70 € − 7,47 € = 67,23 €); it is true only for the ledger, which has no adjustment.
6. LOCATOR_FAIL above: `layer: labels` for a text that is not an amount; the label ("Summe") was right.
7. `doctor`: `ok: cart-eco-threshold: confirmed, test edited by hand` and `ok: …: changed, test compiled` — a
   problem printed under `ok:`.
8. `report <slug>` on a `LOCATOR_FAIL` run: four `LOCATOR_FAIL` lines, then `VERDICT: PASS` (exit 0).
9. `LIMIT_REACHED`: `2 repair attempts … are recorded, the limit; the last ended PASS … Hand the matter to the
   tester.` — what is there to hand over after a green repair?
10. `example` of a scenario with `check: [A2, A4]`: `A1   add P1 2   P1×2   (no checkpoint) after eco-discount
    $1.00` — a discount is shown for a step that has no expected total.
11. `The test exceeded its time limit of 60000 ms.` (hanging `readCart`) — no step, no action, no hint which
    driver method did not return.
12. "The harness failed unexpectedly … report it as a harness bug" for a held lock, a missing `qa.config.json`
    and a dangling symlink — three user-side conditions presented as harness bugs.

Numbers without a visible source:

- `report.md` "defects 11/11 applicable" (eco) and the readback "Scenario gaps: 1": the dry pass had 13 defects
  with 2 not applicable (`rule-boundary`, `round-down`); `report.md` names only the live gap, so 13 − 2 = 11 cannot
  be followed from the page.
- `selftest` "cart-total-add-change-remove 12/13, swapped-objects 12/13, green-threshold 10/11": which defect is
  the 13th is not printed.
- CLI `G2 13 defects`: the list exists only behind `defects list`.

Terms in two (or more) spellings:

- the quantity action: `setQty` (scenario, `example`), `setQuantity` (test), "set quantity of … to" (readback),
  `lost-qty` (defect) vs `lost-update` (control) for the same fault;
- `not applicable` / `not-applicable`, `not bound` / `not-bound` (CLI and report vs. `verification.json` and the
  `defects` rows);
- "G2 again on the products of this run" (CLI) vs "G2 repeated on the products of this run" (`report.md`);
- "detected where expected" (CLI) vs "each detected at the expected checkpoint" (`report.md`);
- rule id `rabatt` / `eco-discount` next to the page's row label "Rabatt" / "Eco-Friendly Discount (5%)" in one
  message, without saying which is which;
- `repeat(s)` vs `repeats`; "Scenario gap" vs "not applicable" for the same entry.

## Part 7 — Code against the quality bar

Started `Wed Nov 25 02:26:10 UTC 2026`, on `.sandbox/clean` (58 `.ts` files under `templates/e2e/support`,
`templates/e2e/unit`, `examples/toolshop/{app,lab}`).

| Check (order N section 7) | Search | Result |
| --- | --- | --- |
| file header | first line `//` | 58/58 (`cli.ts` after its shebang) |
| `any` | `:\s*any\b`, `<any>`, `as any`, `any[]` | none |
| non-null assertion | `x!.`, `x!;`, `x!)`, `x![` | one, `examples/toolshop/lab/driver.live.spec.ts:106`, without a reason (report N says the driver's three were removed; the lab still has one) |
| TODO/FIXME/XXX/HACK | grep | none |
| suppressions | `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` | none |
| commented-out code | `^\s*//\s*(const|let|await|return|if|for|import|export|call;)` | none (one prose hit) |
| dead exports | exported names occurring once in all sources | none |
| leftovers | `GATES_OK`, `money-temp`, `scratch/`, the `confirm`/`gates` subcommands | none (`gates` is the G0–G2 module) |
| type escapes | `as never`, `as unknown as` | 11 in 8 files; `verify.ts:106` fabricates a gate outcome `{ verdict: 'PASS', lines: [], rows: … as never }` to reuse `writeVerification` |
| one assertion per unit test | count of `expect(` per test | all one; two are weak: `lint.spec.ts:16` and `:24` assert only `length > 0` (see O1) |
| `npm audit` | full and `--omit=dev` | `found 0 vulnerabilities` both |

The five places I would least like to maintain:

1. `support/harness/selftest.ts:52-60, 157-167, 80-85` — rows built from exact-whitespace string replacements in
   fixture text, and the wrong driver assembled by string surgery on the correct driver's source; any cosmetic
   change to a fixture or driver turns a row red with "fixture edit did not apply".
2. `support/core/live-controls.ts:28-68` — the in-page `skewTotal`: serialized into the page, rescans `body *` on
   every DOM mutation, recognises an amount only when the symbol shares its text node; it is the only check that the
   driver reads the labelled total and it runs only in a browser.
3. `support/harness/report.ts:157-180` (`promote`) — staging, aside, rename, delete, with no guard on the run's
   verdict or mode, and a `TRACKED` list that silently deletes `run.json`/`review.md` when the promoted run has none (B1).
4. `support/harness/verify.ts:106` — `verification.json` is rewritten after G4 from a re-read of itself through a
   fabricated gate outcome and an `as never` cast; a 311-character line.
5. `support/core/checkpoint.ts:33-182` — `judge` (120 lines) mixes layer order, early returns and the verdict
   ranking, and `formatMismatch` chooses the headline and the cause separately; the message defects of part 6
   (items 4–6) come from this split.
