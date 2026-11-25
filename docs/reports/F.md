# Report F: fixes from the verification, and the examples from a real plugin run

Order: `docs/orders/F.md`. Branch `f-fix` (`d-plugin` with `v-review` merged), worktree `.worktrees/f-fix`.
Start: `Wed Nov 25 09:38:19 UTC 2026`. Time box 150 min (ends 12:08); stage 6 starts by 11:13 at the latest; after
11:53 only the final report is written.

## Plan

Contract: `docs/design.md`; map: `docs/reports/V.md` (B1, F1–F12, N1–N6, mutation table) and `docs/reports/D.md`
(requests 1–7, final check G-d, hand-over). Every change of behaviour starts with a test that fails for the reason
the finding names; the red line is pasted below. Checks after every stage: `scratchpad/checks.sh` (the eight
commands of "after every stage").

| Stage | What | Files | Check |
| --- | --- | --- | --- |
| 0 | branch, order committed, `npm ci`, baseline | — | baseline below |
| 1 | promotion guard, `--as-evidence`, `report` ends with the run's verdict, reviews named in `report.md` (B1, F6, D3) | `support/harness/report.ts`, `cli.ts`, `unit/promotion.spec.ts` | unit cases for every refusal and `--as-evidence`; V's promotion experiment with the set's hash |
| 2 | driver timeouts → `LOCATOR_FAIL`, unknown exceptions → `UNDETERMINED`, user-side conditions with their own sentence, `doctor` per-scenario `SPEC_INVALID`, `*.intent.md` skipped, no problem under `ok:`, rules vocabulary check, `tsc` in `doctor` (F4, F3, F2, F1, N4, V-Q7, D1, D6) | `support/core/{verdicts,shopper,reporter,pricing,config}.ts`, `support/harness/{cli,doctor,run-dir,compile}.ts`, unit specs | V's roots c2, c3, hp, h and D's first fixture as tests |
| 3 | one test per survivor (#10, 16, 18, 19, 20, 25, 26, 27, O1, O2, O5, O6), selftest row "guarantees", counts asserted in "reference cart" (F10–F12); replay of the 12 survivors and #28 | unit specs, `support/harness/selftest.ts` | replay table, `git status --short` empty after each restore |
| 4 | G0 bypasses, positional diff, repair counter, messages, N2, N3 (F9, F5, F7, F8, D7) | `support/harness/{lint,compile,attempts,run}.ts`, `support/core/{checkpoint,reporter}.ts`, lab | unit tests red then green |
| 5 | `intent` in the harness, `browserAllowedOrigins`, readback gaps, `PASS` for app-mapper/defect-designer, routing, contracts (D2, D4, readback flaw, ambiguity 4) | `support/harness/intent.ts`, `verify.ts`, `doctor.ts`, `core/config.ts`, `bin/qa-harness`, `scripts/`, `skills/`, `agents/` | `node --test scripts/`, level A cases, `docs/eval-log.md` |
| 6 | live regression in one scratch repo, the clone rerun, the triage repair if time allows; rebuild `examples/toolshop/` | `examples/toolshop/`, `docs/evidence/` removed | R15 search, `qa:toolshop -- doctor`, both examples `run --dry` |

Choices made up front (closest to the design, recorded here instead of asked):

- A run is "verified live" when its `verification.json` has `gates.G3 === 'PASS'`, `gates.G4 === 'PASS'` and
  `verdict === 'PASS'`. Anything else is refused with its own verdict, or `NO_TESTS_RUN` when the run is dry, has no
  `verification.json`, or did not reach G4 with a `PASS`.
- `--as-evidence` admits a live run (G3 executed) whose verdict is `ORACLE_MISMATCH` or `UNMODELED_ADJUSTMENT`; it
  is refused for everything else, with the run's verdict.
- Tests that need a root on disk use the selftest's `workspace()` under `reports/selftest/runs/unit-*`.

## Stage 0 — workspace

`date -u`: `Wed Nov 25 09:38:19 UTC 2026`. `git rev-parse --abbrev-ref HEAD` → `f-fix`; `docs/reports/V.md` and
`docs/reports/D.md` exist. Order committed (`e9e6daf`). `npm ci` in `templates/e2e` → `found 0 vulnerabilities`.

Baseline (before any change):

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npm run typecheck:toolshop` | exit 0 |
| `npm run test:unit` | `139 passed` |
| `npm run qa -- selftest` | `12/12 rows passed in 55.4 s.` `VERDICT: PASS` |
| `node --test scripts/` | 14 pass, 0 fail |
| `node scripts/check-contracts.mjs` | `ok: skills/contracts/driver.md quotes templates/e2e/support/core/types.ts exactly.` |
| `claude plugin validate .` | `✔ Validation passed` (directory check: the README has no install line; README is the final session's file) |

## Stage 1 — promotion and the report's verdict (V: B1, F6 · D: request 3)

`date -u`: `Wed Nov 25 09:39:39 UTC 2026`.

Test first: `unit/promotion.spec.ts` (12 tests, one scratch root `reports/selftest/runs/unit-promotion`, run
directories written by hand). Red before the fix, 11 of 12:

```text
  1) promotion: a dry run that passed is refused with NO_TESTS_RUN and the set kept
    -   "unchanged": true,
    -   "verdict": "NO_TESTS_RUN",
    +   "unchanged": false,
    +   "verdict": "PASS",
  …
  9) promotion: --as-evidence puts an amount mismatch in the repo, says so in the first line and keeps the verdict
    -   "evidence": true,   "verdict": "ORACLE_MISMATCH",
    +   "evidence": false,  "verdict": "PASS",
 10) report.md of a promoted verified run names the intent review and the report review with their verdicts
    +   "intent": false, "none": true, "review": false,
 11) report without --promote ends with the verdict of the run it reports
    Expected: "ORACLE_MISMATCH"
    Received: "PASS"
  11 failed, 1 passed
```

Fix (`support/harness/report.ts`, `cli.ts`, new `support/harness/intent.ts`):

- `promotionRefusal()` runs before anything is touched. Admitted: `verification.json` with `gates.G3` present,
  `gates.G4 === 'PASS'`, `verdict === 'PASS'`. Refused with the run's own verdict when it is not `PASS`, otherwise
  `NO_TESTS_RUN` (dry run, no G4, no `verification.json`, no such directory). Two lines: why, and "The tracked files in
  reports/<slug>/ are unchanged."
- `--as-evidence` (only with `--promote`) admits a live run that ended `ORACLE_MISMATCH` or `UNMODELED_ADJUSTMENT`;
  `report.md` then starts with "**Evidence of a mismatch, not a verified test:** run … ended … and was promoted with
  --as-evidence (design 8.5)." and the command ends with that verdict (exit 1).
- `report <slug>` and `report --promote` end with the verdict of the run (verification.json, else run.json).
- `report.md` names the intent review (`specs/<slug>.intent.md`, verdict, current or stale against the confirmed
  hash) and the report review (`review.md` of the run, verdict); "Not available" only for the one that is missing.

After the fix: `12 passed (581ms)`.

V's promotion experiment, repeated on a scratch copy of `examples/toolshop` (CLI, tracked set hashed with path and
bytes, outside `runs/`):

```text
before: 58115ae275b1
run --dry → PASS; report --promote <that run>:
  Run 20261125T094242Z-eae5 of cart-total-add-change-remove was not promoted: it is a dry run (gates G0–G2 on the reference cart); only a live run verified through G4 is promoted.
  The tracked files in reports/cart-total-add-change-remove/ are unchanged.
  VERDICT: NO_TESTS_RUN   [exit=1]
after: 58115ae275b1
checkTotal('S2') removed by hand; run --dry → G2 13 defects: 10 detected where expected, 0 late, 2 missed, 1 not applicable; VERDICT: DEFECT_MISSED
report --promote <that run>               → "… it ended DEFECT_MISSED; only a live run verified through G4 is promoted." VERDICT: DEFECT_MISSED [exit=1]
report --promote <that run> --as-evidence → VERDICT: DEFECT_MISSED [exit=1]
report (no --promote)                     → VERDICT: DEFECT_MISSED [exit=1]
after: 58115ae275b1
```

Checks: `tsc`, `typecheck:toolshop`, `test:unit` 151 passed, selftest 12/12 `PASS` (53.8 s), `node --test scripts/`,
`check-contracts`, `claude plugin validate .` all green; manifest regenerated.

## Stage 2 — classification, and conditions that are not harness bugs (V: F4, F3, F2, F1, N4, Q7 · D: requests 1, 6)

`date -u`: `Wed Nov 25 09:44:36 UTC 2026`.

Tests first: `unit/driver-calls.spec.ts` (6) and `unit/conditions.spec.ts` (8). Red before the fix:

```text
driver-calls (V c2, c3; D request 6), 6 failed:
  a plain exception in a driver action is UNDETERMINED, naming the step and the method
    -   "kind": "UNDETERMINED",  "method": true,  "step": "S1",
    +   "kind": "INFRA_FAIL",    "method": false, "step": null,
  Playwright's own timeout on a locator inside an action is LOCATOR_FAIL, naming the step and the method
    +   "kind": "INFRA_FAIL",    "method": false, "step": "S2",
  a read that never returns is LOCATOR_FAIL at its checkpoint, naming readCart      Test timeout of 5000ms exceeded.
  an action that never returns is LOCATOR_FAIL, naming the step and the method      Test timeout of 5000ms exceeded.
  the driver's own InfraError stays INFRA_FAIL                                       +   "step": null,
  a network error inside a driver call stays INFRA_FAIL                              +   "method": false, "step": null,
conditions (V hp, h, F3, N4; D request 1), 8 failed:
  a rules file with an unknown condition is LINT_FAIL naming the rule id and the key   +   "named": false, "verdict": "none",
  doctor reports an unreadable scenario as one SPEC_INVALID line …                     +   "verdict": "plain error" (doctor threw)
  doctor does not read specs/<slug>.intent.md as a scenario                            +   "ok: cart-total-add-change-remove.intent: draft, test not compiled",
  doctor prints a hand-edited test and a changed scenario as findings, not under ok:   +   "ok: cart-total-add-change-remove: confirmed, test edited by hand",
  a held lock is refused with INFRA_FAIL and a sentence …                              +   "verdict": "plain error",
  a root without qa.config.json is SPEC_INVALID …                                      +   "says": false, "verdict": "plain error",
  compile onto a file that is in the way (a dangling link) is FILE_CONFLICT            (threw EEXIST)
  doctor type-checks the rules file with the root's own tsc …                          Expected: true  Received: false
```

Fix:

- `support/core/driver-guard.ts` (new): every driver call of the shopper and of the precondition check goes through
  `driverCall(method, 3 × actionMs, …)`. Playwright's `TimeoutError` and a call over its limit → `LOCATOR_FAIL`
  ("… The element it waited for did not appear; the driver did not find its element." / "readCart did not return
  within 150 ms (3 × actionMs) …"); a library error keeps its verdict (method prefixed); a network or closed-browser
  message → `INFRA_FAIL`; anything else → `UNDETERMINED` ("addProduct threw Error: … The evidence does not say whether
  the driver or the application is at fault; read addProduct in the driver and the trace of the run."). New class
  `UndeterminedError` (verdict of 6.3). The limit is 3 × actionMs because one driver call chains up to three waits of
  actionMs each (navigation, element, acknowledgment); recorded in design 18.
- The shopper takes the step ids (`steps`), so an action failure names its own step (`S3 · set quantity of … :
  setQuantity: …`), not the last checkpoint. The probe, browser start, 5xx and the driver's `InfraError` are unchanged;
  `classify()` still puts the environment first.
- `ConditionError` (verdict from the dictionary, own sentence); the CLI prints a `QaError` as itself and keeps "The
  harness failed unexpectedly … harness bug" only for anything else. Held lock → `INFRA_FAIL` "Another run of <slug>
  holds reports/<slug>/.lock (pid N); wait for it to finish and run the command again, or delete the file if no run
  is active."; no `qa.config.json` → `SPEC_INVALID` "<dir> is not an e2e root … Point --root at the directory that
  holds qa.config.json"; a file in the way of `compile` → `FILE_CONFLICT` "… is in the way … Remove … and run compile
  … again."
- `rulesProblems()` in `support/core/pricing.ts` checks every rule, the summary and the constraints against 9.2 when
  the rules file is loaded (harness and fixture); the first problem is `LINT_FAIL` naming the rule id and the key.
- `doctor`: one `SPEC_INVALID` line per unreadable scenario, the rest still checked; `specs/*.intent.md` skipped; a
  hand-edited test is a `note:` and a changed scenario only its `SCENARIO_CHANGED` line; `tsc --noEmit --pretty false
  -p <root>/tsconfig.json` with the root's own TypeScript (resolved from the root; skipped with a `note:` when there is
  none) reports the first message about the driver or the rules file as `LINT_FAIL: tsc: …`.

After the fix: unit tests `165 passed`. The selftest row "control page" now also rebuilds D's stage 5 first fixture on
the control application (`line-qty` → `line-quantity` in `setQuantity`, which the control driver does not wrap; D saw
`INFRA_FAIL` there): `a missing element in setQuantity LOCATOR_FAIL at S3`.

V's scratch roots, by CLI on a copy of `examples/toolshop` (no live run):

```text
hp  example cart-eco-threshold  → The rules file app/toolshop.pricing.ts is outside the vocabulary of design 9.2: rule eco-discount: unknown condition key "couponCode" in when; the vocabulary of design 9.2 is always, shareOfUnits, hasUnits, subtotalAtLeast. … VERDICT: LINT_FAIL
h   doctor                      → SPEC_INVALID: specs/h-tabs.md cannot be read (Tabs are not allowed as indentation at line 3, column 1:); fix its YAML front matter.
                                  … ok: cart-eco-threshold: confirmed, test compiled / ok: cart-total-add-change-remove: confirmed, test compiled … VERDICT: SPEC_INVALID
lock run --dry --repair driver  → Another run of cart-total-add-change-remove holds reports/cart-total-add-change-remove/.lock (pid 4242); wait for it to finish … VERDICT: INFRA_FAIL
--root /nonexistent/qa-root doctor → /nonexistent/qa-root is not an e2e root: it has no qa.config.json. Point --root at … VERDICT: SPEC_INVALID
compile onto a dangling link    → tests/cart-eco-threshold.spec.ts is in the way: … Remove … and run compile cart-eco-threshold again. VERDICT: FILE_CONFLICT (nothing written through the link)
```

Checks: `tsc`, `typecheck:toolshop`, `test:unit` 165 passed, selftest 12/12 `PASS` (62.1 s), `node --test scripts/`,
`check-contracts`, `claude plugin validate .` green; manifest regenerated.

## Stage 3 — a test for every survivor (V: F10, F11, F12, mutation table)

`date -u`: `Wed Nov 25 09:51:34 UTC 2026`.

For a finding that is "no test exists" the test is the fix; it is shown able to fail by the replay below (V's
mutation applied once: red, then restored).

| Survivor | Test (where) |
| --- | --- |
| #10 settle poll | `unit/checkpoint.spec.ts` "poll: a first read that disagrees and a second that agrees is green after two reads", "poll: a cart that never agrees is red, and only after settleMs" |
| #16 `DEFECT_LATE` | selftest row "guarantees": the compiled test without `checkTotal('S3')`, `run --dry --repair test` → `DEFECT_LATE` |
| #18 environment before locator | `unit/classification.spec.ts` "the environment outranks a locator failure in another repeat" |
| #19 raw text | `unit/checkpoint.spec.ts` "the displayed record keeps the raw text byte for byte" (`- $2.50`, `USD 47.50`) |
| #20 `doctor` `HARNESS_MODIFIED` | row "guarantees": a scratch copy of the package with one line added to `support/core/money.ts`, its own `doctor` → `HARNESS_MODIFIED: … support/core/money.ts` |
| #25 `RETRY_REFUSED` | row "guarantees": a second `--repair test` with the test unchanged |
| #26 `LIMIT_REACHED` | row "guarantees": a third repair after two red ones |
| #27 `VERIFICATION_STALE` | row "guarantees": a verification record of the current files, one byte more in the driver → `VERIFICATION_STALE … the driver` |
| O1 goto rule | `unit/lint.spec.ts` "goto to a relative address is reported by the goto rule" (and the absolute case now asserts the rule's text, not `length > 0`) |
| O2 G1 conformance | row "guarantees": the approved example's S2 `totalExact` changed → `CONFORMANCE_FAIL` |
| O5 lock | row "guarantees": promotion of a verified run under a fresh `.lock` → `INFRA_FAIL`, no `report.md`; and `unit/conditions.spec.ts` "a held lock is refused …" |
| O6 rules freeze | row "guarantees": a line appended to the rules file → `run` `SCENARIO_CHANGED` naming the rules file |
| F10 | row "reference cart" asserts applicable/detected/total per fixture: 12/12/13, 12/12/13, 10/10/11 |

Selftest after the change: `13/13 rows passed`, the new row "guarantees PASS VERIFICATION_STALE, SCENARIO_CHANGED,
CONFORMANCE_FAIL, DEFECT_LATE, RETRY_REFUSED, LIMIT_REACHED, a held lock and HARNESS_MODIFIED each where expected"
(14 lines of output plus the verdict, within the 15-line budget). Committed as `a8054d5` before the replay, so the
replay runs on a committed tree.

### Replay table

Runner `scratchpad/replay-tool/replay.mjs` (V's mutation strings, read from `../v-review/.sandbox/mut/mutations.mjs`,
plus #28), on a clean export of `a8054d5` made into a git repository of its own under the session's scratch directory
(`npm ci` there), so stage 4 could go on in the worktree meanwhile. Per mutation: apply, `doctor --write-manifest`,
`npm run test:unit`, `npm run qa -- selftest`, `git restore` of the touched files and the manifest, `git status
--short` (must be empty). Started 09:55 UTC, ended about 10:13 (about 80 s per mutation).

| # | Mutation | Caught by | Selftest | `git status` after restore |
| --- | --- | --- | --- | --- |
| 10 | checkpoint: first read final | unit `checkpoint.spec.ts` "poll: a first read that disagrees and a second that agrees is green after two reads", "poll: a cart that never agrees is red, and only after settleMs" | `INFRA_FAIL` (row unit tests) | clean |
| 16 | gates: detected-late counted as detected | selftest guarantees: "repair 1: a test without the S3 checkpoint: expected DEFECT_LATE, got PASS" | `INFRA_FAIL` | clean |
| 18 | classification: locator before environment | unit `classification.spec.ts` "the environment outranks a locator failure in another repeat" | `INFRA_FAIL` | clean |
| 19 | reporter: rawText = formatted value | unit `checkpoint.spec.ts` "the displayed record keeps the raw text byte for byte" | `INFRA_FAIL` | clean |
| 20 | doctor: support/core change not reported | selftest guarantees: "doctor with a changed support/core file:" (no `HARNESS_MODIFIED` line) | `INFRA_FAIL` | clean |
| 25 | repair: RETRY_REFUSED never | selftest guarantees: "a repair with the test unchanged: expected RETRY_REFUSED, got DEFECT_LATE" | `INFRA_FAIL` | clean |
| 26 | repair: LIMIT_REACHED never | selftest guarantees: "a third repair: expected LIMIT_REACHED, got DEFECT_LATE" | `INFRA_FAIL` | clean |
| 27 | doctor: changed driver still verified | selftest guarantees: "a driver changed after verification: no VERIFICATION_STALE line" | `INFRA_FAIL` | clean |
| O1 | G0: goto rule off | unit `lint.spec.ts` "goto outside the application is forbidden", "goto to a relative address is reported by the goto rule" | `INFRA_FAIL` | clean |
| O2 | G1: totals vs approved example off | selftest guarantees: "an approved example whose S2 total differs from the test: expected CONFORMANCE_FAIL, got PASS" | `INFRA_FAIL` | clean |
| O5 | lock: a held lock never refuses | unit `conditions.spec.ts` "a held lock is refused …"; selftest guarantees: "a promotion under a held lock: PASS" | `INFRA_FAIL` | clean |
| O6 | freeze: rules change not detected (R6) | selftest guarantees: "a run after the rules file changed: PASS" | `INFRA_FAIL` | clean |
| 28 | promotion guard removed (`if (false && refusal)`) | unit `promotion.spec.ts`: 8 tests (every refusal, both `--as-evidence` refusals) | `INFRA_FAIL` | clean |

No survivor: 13 of 13 mutations turn at least one check red; the tree was clean after every restore. The replay ran on
the stage 3 commit; stage 4 rewrote the goto line of `lint.ts` (exact origin), so V's O1 string no longer applies to
the final tree, and the O1 tests still assert the goto rule's own text.

## Stage 4 — the remaining fixes (V: F9, F5, F7, F8, N2, N3 · D: request 7)

`date -u`: `Wed Nov 25 09:55:41 UTC 2026`.

Tests first (in `unit/lint.spec.ts`, `compiler.spec.ts`, `checkpoint.spec.ts`, new `attempts.spec.ts`,
`reporter.spec.ts`). Red before the fix, 12 failed:

```text
lint      a URL literal on a look-alike origin is outside the application        Expected substring: "outside the application"  Received string: ""
lint      a computed member with a string literal is resolved: page["waitForTimeout"]  Received string: ""
lint      a setTimeout-based wait is a fixed wait                                 Received string: ""
compiler  FILE_CONFLICT shows two swapped lines                                   Expected: > 0  Received: 0
compiler  FILE_CONFLICT shows a duplicated line with its line number              Expected pattern: /\+ in file:\s+line 3: b/  Received string: ""
attempts  a driver repair is refused for a dry run …                              ENOENT … unit-repair-dry/app/reference.driver.ts (the dry run went into admission)
attempts  after two repairs that ended PASS a third repair is admitted as the first of a new episode   -   1, 1   +   2, "LIMIT_REACHED"
checkpoint an amount mismatch names the raw text of the row in its cause line    Received string: "  layer:     adjustments · row \"Green discount (5%)\" does not agree with rule green-discount"
checkpoint an unmodeled adjustment whose rows add up does not say the total is not the subtotal minus the adjustments   Expected substring: not "not the subtotal minus the adjustments"
checkpoint a total that is not an amount is reported in the total layer, not labels   Expected: "total"  Received: "labels"
reporter  the git state of a run records a dirty tree next to the commit         TypeError: (0 , _reporter.gitState) is not a function
```

Fix:

- G0 (`lint.ts`): URL literals and `goto` targets are compared by `new URL(x).origin` with the configured origin
  exactly; a computed member with a string literal is resolved (`page['waitForTimeout']`, `globalThis['fetch']`);
  `setTimeout`/`setInterval` calls in a driver are fixed waits.
- `FILE_CONFLICT` (`compile.ts`): the difference is a longest-common-subsequence diff with line numbers.
- Repairs (`run.ts`, `attempts.ts`): `run --dry --repair driver` → `SPEC_INVALID` "--repair driver needs a live run …",
  nothing counted; a repair that ends `PASS` moves `attempts.json` into its run directory, closing the episode.
- Messages (`checkpoint.ts`): the cause line quotes the row's raw text ("row "Rabatt" ("-7,47 €") does not agree
  with rule rabatt, which gives 3,74 €"); with an unmodeled adjustment whose displayed rows add up there is no total
  finding; a text that is not an amount is reported in the layer of the field read (total, subtotal, adjustments,
  unit price, line total), the layer names of design 9.1.
- N2: `examples/toolshop/lab/driver.live.spec.ts` `?? ''` instead of `!`. N3: `run.json` `meta.gitDirty` (uncommitted
  changes to tracked files when the run started) next to `gitSha`.

After the fix: `181 passed`.

CLI on a scratch copy of the example (no live run):

```text
t1 (setQuantity and remove swapped)  compile → tests/cart-total-add-change-remove.spec.ts was edited by hand, so nothing was written. Differences:
                                        + in file:  line 16: await shopper.remove(b);
                                        - compiled: line 16: await shopper.setQuantity(a, 3);
                                        + in file:  line 19: await shopper.setQuantity(a, 3);
                                        - compiled: line 19: await shopper.remove(b);
                                      VERDICT: FILE_CONFLICT
g0 (V's three lines in the driver)   doctor → LINT_FAIL: app/toolshop.driver.ts:342 goto outside the application: "https://practicesoftwaretesting.com.attacker.example/steal"
                                              LINT_FAIL: …:342 a URL outside the application's origin "…attacker.example/steal"
                                              LINT_FAIL: …:343 waitForTimeout: a fixed wait instead of a completion signal
                                      (doctor shows the first three; the setTimeout line is the unit test's)
rp                                   run cart-eco-threshold --dry --repair driver → --repair driver needs a live run: a dry run (G0–G2 on the reference cart) never calls the driver, so it cannot show a repair. … VERDICT: SPEC_INVALID
```

Not in this order, kept as known limits for the hand-over: N1 (15 lines plus the `VERDICT` line), N5 (USD and EUR
only), N6 (a single thrown read inside a checkpoint is retried silently).

Checks: `tsc`, `typecheck:toolshop`, `test:unit` 181 passed, selftest 13/13 `PASS` (76.6 s), `node --test scripts/`,
`check-contracts`, `claude plugin validate .` green; manifest regenerated.

## Stage 5 — the plugin side (D: requests 2, 4, the readback flaw, ambiguity 4)

`date -u`: `Wed Nov 25 10:00:07 UTC 2026`.

Test first: `unit/intent.spec.ts` (6). Red before the fix:

```text
intent: no review is SPEC_INVALID with state missing, and the confirmed hash is printed   TypeError: (0 , _intent.intentCommand) is not a function
intent: a review of another scenario hash is stale                                       TypeError: … is not a function
intent: a current INTENT_OK review is PASS                                               TypeError: … is not a function
verification.json records the scenario hash for which a current INTENT_OK review exists  Expected: "f451d059…8893"  Received: undefined
doctor reports a stale intent review of a verified scenario as VERIFICATION_STALE        Expected: true  Received: false
qa.config.json keeps browserAllowedOrigins, empty by default                             + undefined, undefined
```

Changes:

- Harness: `qa-harness intent <slug>` (`support/harness/intent.ts`), the output of the former `scripts/intent.mjs`
  line for line (`Scenario … is confirmed; scenario_sha256: …`, the finding, `state: …`). `run` and `verify` write
  `intentSha256` into `verification.json` (the hash for which a current `INTENT_OK` review exists, else `null`).
  `doctor` reports a stale review of a scenario that has a promoted verification as `VERIFICATION_STALE`, otherwise
  as a `note:`. `report.md` names both reviews (stage 1).
- `scripts/intent.mjs` removed; `bin/qa-harness` forwards `intent` like every other subcommand. The guard matrix is
  unchanged (`intent` stays allowed for the main thread and `test-verifier`); `node --test scripts/` 14/14.
- `qa.config.json`: optional `browserAllowedOrigins` (exact origins; anything else is `SPEC_INVALID` naming the
  value). The Toolshop starter pack sets `["https://api.practicesoftwaretesting.com"]`; `init` takes it with the
  pack's other defaults (confirmed in stage 6: the installed `e2e/qa.config.json` has it).
- Readback (`skills/new-test/readback.md`): the gap list is the `not-applicable` entries of the same G2 pass as the
  counts (`livePass.defects[]`, else `defects[]`), each with its hint.
- `agents/app-mapper.md`, `skills/repair-locator`, `routing.md`: `app-mapper` ends `PASS` (build and repair);
  `defect-designer` already ended `PASS`.
- `skills/new-test/routing.md`: rows for `LOCATOR_FAIL` and `UNDETERMINED` from `run` naming a driver method, and for a
  refused promotion; the repair call says `--repair driver` needs a live run and a green repair closes the episode.
- `skills/contracts/SKILL.md`: `browserAllowedOrigins`, and a section "Harness commands the flow relies on" (`intent`,
  the promotion guard and `--as-evidence`, the classification of driver calls). `check-contracts` ok.
- `docs/design.md` section 18, "Amendments after v0.3" (12 lines; sections 1–17 untouched).

After the fix: unit tests `187 passed`; checks green (selftest 13/13, 77.6 s).

### Eval table (level A, every case once, `docs/eval-log.md` rows 25–38)

`node evals/run.mjs --root <session scratch>/ev --jobs 4`, sonnet, plugin at `7cfc08d`, 10:03–10:15 UTC.

| Case | Result | Turns | Cost | Time |
| --- | --- | --- | --- | --- |
| A1 triggering | PASS | 10 | $0.17 | 20 s |
| A2 no triggering | PASS | 1 | $0.08 | 5 s |
| A3 ambiguity | PASS | 6 | $0.14 | 11 s |
| A4 reference scenario, dry | PASS | 12 | $0.26 | 48 s |
| A5 the verifier catches a test with a hole | PASS | 5 | $0.20 | 47 s |
| A6 guard: no fitting of the expected total | PASS | 3 | $0.09 | 8 s |
| A7 extended defects, dry | PASS | 16 | $0.36 | 78 s |
| A8 out-of-scope request | PASS | 6 | $0.14 | 10 s |
| A9 protection of a manual edit | PASS | 2 | $0.27 | 44 s |
| A10 environment failure | PASS | 16 | $0.29 | 57 s |
| A11 paraphrase with swapped objects | PASS | 14 | $0.28 | 49 s |
| A12 adding versus setting | PASS | 13 | $0.26 | 43 s |
| A13 intent review catches a swapped object | PASS | 2 | $0.14 | 21 s |
| R1 a tester concern through --risk (not in design 14.1) | PASS | 18 | $0.31 | 66 s |

14 of 14 pass, $2.99 in all. A4 now checks the intent review through the harness subcommand (`qa-harness intent` PASS). No case needed a second run.
