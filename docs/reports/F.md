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

Replay repeated on the final tree (`7ca8bd3`, clean export, 10:30–10:45 UTC, runner `replay2.mjs`: the same list, O1
written against the new form of the goto line, `if (lit !== undefined && !lit.startsWith('/') && originOf(lit) !==
origin) v(n,` → `if (false) v(n,`): 13 of 13 applied, 13 of 13 red, `git status` clean after each. Caught by, in order:
#10 unit (2 poll tests, `2 failed, 186 passed`); #16 guarantees "expected DEFECT_LATE, got PASS"; #18 unit
classification; #19 unit raw text; #20 guarantees (no `HARNESS_MODIFIED` line); #25 guarantees "expected
RETRY_REFUSED, got DEFECT_LATE"; #26 guarantees "expected LIMIT_REACHED, got DEFECT_LATE"; #27 guarantees "no
VERIFICATION_STALE line"; O1 unit lint (2); O2 guarantees "expected CONFORMANCE_FAIL, got PASS"; O5 unit conditions and
guarantees; O6 guarantees "a run after the rules file changed: PASS"; #28 unit promotion (8). No survivor.

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
  changes or new files when the run started) next to `gitSha`. (First cut ignored untracked files; stage 6 showed
  `gitDirty: false` for a run whose test was not yet committed. Test "an uncommitted new file (a test not yet added)
  also makes the tree dirty" red — `Expected: true Received: false` — then fixed by dropping `--untracked-files=no`.)

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

## Stage 6 — live regression and the examples

`date -u`: `Wed Nov 25 10:03:45 UTC 2026` (minute 25; started while the stage 5 evals ran, the earliest point at
which the plugin was final; no live call overlapped another).

One fresh scratch repo `shop` under the session's scratch directory (outside the worktree), `git init`; sessions as
order D ran them (`claude -p "<prompt>" --plugin-dir <worktree> --permission-mode auto --max-turns <n> --output-format
json`), default model. Commits in the scratch repo: `28b2b96` (after setup), `d2d7ccc` (both verified tests).

| # | Step | Session / command | Outcome |
| --- | --- | --- | --- |
| 1 | setup | L1 `/qa:setup toolshop https://practicesoftwaretesting.com` | `VERDICT: PASS`; `e2e/` 83 template files, starter pack 3 files, `qa.config.json` with `browserAllowedOrigins: ["https://api.practicesoftwaretesting.com"]`, selftest passed |
| 2 | first request | L2 `/qa:new-test "Add two different products to the cart. Change the quantity of one, then remove the other. Check that the cart shows the correct total after each change." --yes` | **`INFRA_FAIL`**: scenario `two-products-qty-remove` confirmed, intent `INTENT_OK`, compiled, dry `PASS` (12/13), live run `20261125T100655Z-d54e` 0/3: repeat 1 `LOCATOR_FAIL` at S2 (no `POST /carts/…` answer within 10 s), repeats 2 and 3 the driver's own `InfraError` "candidates: the application's API did not answer the product listing within 10000 ms". The flow stopped, no promotion. |
| 2b | resumed once | L2b `/qa:new-test two-products-qty-remove --yes` | **`VERIFIED`**: run `20261125T101701Z-14e0` `PASS` 3/3, `verify` `20261125T101730Z-29d4` G4 4/4 caught, `review.md` `VERIFIED`, promoted. Readback: `PASS 3/3 · test verified`; S1 $14.15, S2 $26.16, S3 $54.46, S4 $42.45; defects 9/9 applicable (live pass); gaps from the live pass (4). |
| 3 | eco request | L3 `/qa:new-test "Add a Wood Saw, then two units of the first available product. Raise the saw to three units, then remove the other product. Check the total after each change." --yes` | **`VERIFIED`**: `wood-saw-qty-remove-other`, Wood Saw $12.18 (co2 B) · Combination Pliers $14.15 (co2 D); S1 $11.57, S2 $40.48, S3 $61.60, S4 $34.71; "eco-discount … in force at S1, S3, S4"; at S2 the total equals the subtotal (share of eco units 1/3); "At S1, S3, S4 it differed from the subtotal and from every line total"; defects 12/12, controls 4/4. |
| 4 | refused promotion | `qa-harness report two-products-qty-remove --promote 20261125T100647Z-9190` (the dry run of 2), from the scratch repo root | "Run 20261125T100647Z-9190 of two-products-qty-remove was not promoted: it is a dry run (gates G0–G2 on the reference cart); only a live run verified through G4 is promoted." / "The tracked files in reports/two-products-qty-remove/ are unchanged." `VERDICT: NO_TESTS_RUN`, exit 1; set hash `d7c197330069` before and after |
| 5 | clone, no Claude Code | `git clone`, `npm ci` in `e2e/` (0 vulnerabilities); from the clone root `cd e2e && npm run qa -- run two-products-qty-remove` and `… run wood-saw-qty-remove-other` (the readbacks' rerun lines verbatim); in `e2e/` `npm run qa -- verify <slug>` for both | all four `VERDICT: PASS`, exit 0: G3 3/3 each; G2 again 9/0/0/4 and 12/0/0/1; G4 "4 caught, 0 missed, 0 not applicable, 0 not bound" for both (skew-total S1, drift-price S1, lost-update S3, lost-remove S4) |
| 6 | broken locator | `getByTestId('product-quantity')` → `'product-qty'` in `setQuantity` of the scratch driver (wrapped by `onLocator`, not committed), then L4 `/qa:triage two-products-qty-remove` | **as expected**: `run` `20261125T102537Z-1334` `LOCATOR_FAIL` 3/3 at S3 `setQuantity("Combination Pliers", 3)`; `app-mapper` (sonnet) read the live cart page through `mcp__plugin_qa_browser__*` (navigate, evaluate, click, find), found `INPUT[data-test="product-quantity"]`, restored the line and added a dated note to the map; `qa-harness run two-products-qty-remove --repair driver` → `20261125T102716Z-76ac` `PASS` 3/3; `attempts.json` moved into that run directory (episode closed, stage 4). `git status`: only `e2e/app/toolshop.map.md`; the driver is back to its committed bytes; scenario and test untouched. |

Step 2 ended `INFRA_FAIL` and was resumed once, with the resumption form of the same command that the session's own
answer named (`/qa:new-test <slug> --yes`; the skill's resuming table starts at step 4 for a confirmed scenario with a
current intent review). Before the resume the API answered a plain request in 0.19 s. Not retried otherwise.

Live invocations against https://practicesoftwaretesting.com: **12 of 12**, headless, one at a time.

| # | UTC | Invocation | Result |
| --- | --- | --- | --- |
| 1 | 10:06:55 | L2 `run` | `INFRA_FAIL` (API listing unanswered in 2 of 3 repeats) |
| 2 | 10:17:01 | L2b `run` | `PASS` 3/3 |
| 3 | 10:17:30 | L2b `verify` | `PASS`, G4 4/4 |
| 4 | 10:20:12 | L3 `run` | `PASS` 3/3 |
| 5 | 10:20:38 | L3 `verify` | `PASS`, G4 4/4 |
| 6 | 10:22:36 | clone `run two-products-qty-remove` | `PASS` 3/3 |
| 7 | 10:22:56 | clone `run wood-saw-qty-remove-other` | `PASS` 3/3 |
| 8 | 10:23:23 | clone `verify two-products-qty-remove` | `PASS`, G4 4/4 |
| 9 | 10:24:19 | clone `verify wood-saw-qty-remove-other` | `PASS`, G4 4/4 |
| 10 | 10:25:37 | L4 `run` (broken locator) | `LOCATOR_FAIL` 3/3 at S3 |
| 11 | 10:26:40–10:27:14 | L4 `app-mapper` browser session (Playwright MCP) | locator found |
| 12 | 10:27:16 | L4 `run --repair driver` | `PASS` 3/3 |

(The dry runs inside the flow use no browser and no live site.)

### The examples

`examples/toolshop/` rebuilt from the scratch repo at `d2d7ccc` (before the locator was broken):

- removed: `specs/`, `tests/` and `reports/` of order N's `cart-total-add-change-remove` and `cart-eco-threshold`;
  `docs/evidence/d-flow/` (replaced by this);
- `specs/`: `two-products-qty-remove.{md,example.json,intent.md}`, `wood-saw-qty-remove-other.{md,example.json,intent.md}`;
- `tests/`: the two compiled tests;
- `reports/<slug>/`: the promoted set (`report.md`, `run.json`, `verification.json`, `review.md`, `screens/S1–S4.png`)
  and `readback.txt`, the final answer of L2b and L3;
- `app/`: as installed, byte-identical to the starter pack (so nothing changed there); kept `qa.config.json` (now with
  `browserAllowedOrigins`), `tsconfig.json`, the `support` link and `lab/`.
- The Playwright HTML report of the promoted run of 2 (532 KB, no trace — the run passed, so tracing kept nothing — no
  cookie or header value) was **not** copied: its embedded data holds 12 absolute local paths (the checkpoint
  attachments' `screenshot` field points into the machine's scratch directory, which carries the home folder name), so it
  would put a local path into the repo, against R15's intent. It stays in `runs/<runId>/html/`.

Checks: `npm run typecheck:toolshop` exit 0; `npm run qa:toolshop -- doctor` `VERDICT: PASS` (with the note that no
TypeScript compiler is installed for that root); `run two-products-qty-remove --dry` `PASS` (12/0/0/1) and `run
wood-saw-qty-remove-other --dry` `PASS` (11/0/0/2) from the plugin repo; R15 search (`/Users/`, cookie,
authorization, bearer, set-cookie, x-api-key, token, the user name, `private/tmp`) over `examples/` and `docs/`: hits only
in the prose of the design, the orders and earlier reports, none in `examples/`.

## Exit criteria

`date -u`: `Wed Nov 25 10:30 UTC 2026`, on `7ca8bd3`, commands exactly as the order writes them:

```text
$ npm ci && npx tsc --noEmit && npm run typecheck:toolshop && npm run test:unit        (templates/e2e)
found 0 vulnerabilities
  188 passed (4.5s)
[exit=0]
$ npm run qa -- selftest
… 13 rows, the last: integrity          PASS  support/core and support/harness match support/core/MANIFEST.json
13/13 rows passed in 77.7 s.
VERDICT: PASS
$ npm run qa:toolshop -- doctor
note: no TypeScript compiler installed for this root, so the driver and the rules file were not type-checked.
ok: Node 24.16.0, Chromium installed
ok: support/core and support/harness match the manifest
ok: two-products-qty-remove: confirmed, test compiled
ok: wood-saw-qty-remove-other: confirmed, test compiled
ok: driver app/toolshop.driver.ts satisfies CartDriver and stays within the UI
ok: rules file app/toolshop.pricing.ts loads and stays within the vocabulary of design 9.2
VERDICT: PASS
$ node --test scripts/ && node scripts/check-contracts.mjs && claude plugin validate .   (repo root)
ℹ tests 14
ℹ pass 14
ℹ fail 0
ok: skills/contracts/driver.md quotes templates/e2e/support/core/types.ts exactly.
✔ Validation passed
[exit=0]
$ grep -rniE "toolshop|practicesoftwaretesting|pliers|wood saw" skills agents
(no output, exit 1)
$ git status --short
(no output)
```

`claude plugin validate .` also prints its separate directory check (the README has no marketplace install line); the
README is the final session's file. Plus: the replay table (stage 3, no survivor, on `a8054d5` and again on the final tree `7ca8bd3`),
the eval table (stage 5, 14/14), the outcomes of stage 6 (two `VERIFIED`, one refused promotion, four green commands
in the clone without Claude Code, one live repair).

F10 shown able to fail with V's own experiment (`expectedPlace` returning `null`, manifest regenerated, then restored,
`git status --short` empty): `reference cart     FAIL  cart-total-add-change-remove: 0 detected of 0 applicable (13
defects); expected 12 of 12 (13)` (and `guarantees FAIL … expected DEFECT_LATE, got PASS`), `9/13 rows passed`.

## Findings and requests: what changed, what guards it

| Finding / request | What changed | Test that guards it | Red line before the fix |
| --- | --- | --- | --- |
| V B1 | `report --promote` admits only a live run `PASS` through G4; refusal keeps the set byte for byte | `unit/promotion.spec.ts` (8 refusals, 1 admission); replay #28 | `"verdict": "PASS"`, `"unchanged": false` (expected `NO_TESTS_RUN`, `true`) |
| design 8.5 exception | `--as-evidence` for a live `ORACLE_MISMATCH`/`UNMODELED_ADJUSTMENT`; first line of `report.md` says so; verdict kept | `promotion.spec.ts` "--as-evidence puts an amount mismatch …", "… does not admit a dry run", "… LOCATOR_FAIL" | `"evidence": false, "verdict": "PASS"` |
| V F6 | `report` ends with the reported run's verdict | `promotion.spec.ts` "report without --promote ends with the verdict of the run it reports" | `Expected: "ORACLE_MISMATCH" Received: "PASS"` |
| D request 3 | `report.md` names the intent review and the report review with verdicts | `promotion.spec.ts` "report.md of a promoted verified run names …" | `"intent": false, "none": true, "review": false` |
| V F4 | driver calls limited to 3 × `actionMs`; locator timeout/hang → `LOCATOR_FAIL`, other exception → `UNDETERMINED`, environment → `INFRA_FAIL`; step and method named | `unit/driver-calls.spec.ts` (6) | `"kind": "INFRA_FAIL", "method": false, "step": null`; hangs: `Test timeout of 5000ms exceeded.` |
| D request 6 | Playwright `TimeoutError` in an unwrapped action → `LOCATOR_FAIL` | `driver-calls.spec.ts` "Playwright's own timeout …"; selftest control page "a missing element in setQuantity LOCATOR_FAIL at S3" | `"kind": "INFRA_FAIL"`, `"step": "S2"` (D saw `INFRA_FAIL` on the control app) |
| V F3 | held lock `INFRA_FAIL`, no `qa.config.json` `SPEC_INVALID`, file in the way `FILE_CONFLICT`, each with its own sentence | `unit/conditions.spec.ts` (3) | `"verdict": "plain error"`; compile threw `EEXIST` |
| V F2 | `doctor`: one `SPEC_INVALID` line per unreadable scenario | `conditions.spec.ts` "doctor reports an unreadable scenario …" | doctor threw ("plain error") |
| D request 1 | `doctor` skips `specs/*.intent.md` | `conditions.spec.ts` "doctor does not read specs/<slug>.intent.md …" | `"ok: cart-total-add-change-remove.intent: draft, test not compiled"` |
| V N4 | problems as `note:`/findings, not `ok:` | `conditions.spec.ts` "doctor prints a hand-edited test …" | `"ok: cart-total-add-change-remove: confirmed, test edited by hand"` |
| V F1 | rules checked against 9.2 on load, `LINT_FAIL` naming rule id and key | `conditions.spec.ts` "a rules file with an unknown condition …" | `"named": false, "verdict": "none"` |
| V open question 7 | `tsc` in `doctor` with the root's own TypeScript | `conditions.spec.ts` "doctor type-checks the rules file …" | `Expected: true Received: false` |
| V F10 | "reference cart" asserts applicable/detected/total | selftest row "reference cart" | (no test existed) V's experiment: `0 detected of 0 applicable (13 defects); expected 12 of 12 (13)` |
| V F11 (#10, 16, 18, 19, O2) | tests only | unit checkpoint/classification; selftest guarantees | replay table: each red |
| V F12 (#20, 25, 26, 27, O5, O6) | tests only | selftest row "guarantees"; `conditions.spec.ts` (lock) | replay table: each red |
| V O1 | goto rule asserted by its text | `lint.spec.ts` "goto to a relative address is reported by the goto rule" | replay: red |
| V F9 | exact origin, computed members, `setTimeout` | `lint.spec.ts` (3) | `Received string: ""` |
| V F5 | positional (LCS) diff with line numbers | `compiler.spec.ts` (2) | `Expected: > 0 Received: 0`; `Received string: ""` |
| V F7 | `--repair driver` needs a live run; green repair closes the episode | `unit/attempts.spec.ts` (2); live in stage 6 (attempts.json archived) | `ENOENT … reference.driver.ts` (admission ran); `+ 2, "LIMIT_REACHED"` |
| V F8 | cause line quotes the row's raw text; non-amount in its field's layer | `checkpoint.spec.ts` (2) | `layer: adjustments · row "Green discount (5%)" does not agree with rule green-discount`; `Expected: "total" Received: "labels"` |
| D request 7 | no total finding when an unmodeled adjustment's displayed rows add up | `checkpoint.spec.ts` "an unmodeled adjustment whose rows add up …" | `Expected substring: not "not the subtotal minus the adjustments"` |
| V N2 | lab `?? ''` instead of `!` | `typecheck:toolshop` (no behaviour) | — |
| V N3 | `run.json` `meta.gitDirty`, new files included | `unit/reporter.spec.ts` (2) | `TypeError: (0 , _reporter.gitState) is not a function`; then `Expected: true Received: false` (untracked) |
| D request 2 | `intent` in the harness; `intentSha256` in `verification.json`; `doctor` on a stale review | `unit/intent.spec.ts` (5); eval A4 | `TypeError: … intentCommand is not a function`; `Received: undefined`; `Expected: true Received: false` |
| D request 4 | `browserAllowedOrigins` in config; Toolshop pack sets the API origin | `intent.spec.ts` "qa.config.json keeps browserAllowedOrigins …"; stage 6 setup | `+ undefined, undefined` |
| D readback flaw | gaps from the same G2 pass as the counts | skill text; stage 6 L2b readback (4 gaps = the 4 not-applicable of `livePass`) | — (skill) |
| D ambiguity 4 | `app-mapper` ends `PASS` | stage 6 L4: `app-mapper` last line `VERDICT: PASS` | — (agent card) |
| order: routing | rows for refused promotion, `UNDETERMINED`/`LOCATOR_FAIL` naming a method | stage 6 L4 (`LOCATOR_FAIL` → `app-mapper` → `run --repair driver`) | — (skill) |

## Not done, reverted, or done differently

- Nothing was reverted.
- Not in this order, kept as known limits: N1 (15 lines plus `VERDICT`), N5 (USD and EUR only), N6 (a thrown read inside
  a checkpoint is retried silently); D request 5 (readback headline flag).
- The Playwright HTML report of the promoted run of 2 was not copied into `examples/` (absolute local paths in its
  data; stage 6).
- The replay of stage 3 ran first on the stage 3 commit `a8054d5`, then again on the final tree `7ca8bd3` (no survivor
  either time).
- Stage 6 started at minute 25, in parallel with the stage 5 eval run, not after it; no live call overlapped another.
- Step 2 was resumed with `/qa:new-test <slug> --yes` (the resumption form of the same command), not by retyping the
  request.
- `doctor` type-checks only where TypeScript resolves from the root; for `examples/toolshop` (no `node_modules` of
  its own) it prints a `note:` and skips, so `qa:toolshop -- doctor` does not type-check; `typecheck:toolshop` does.
- The limit of a driver call is 3 × `actionMs` (my reading of "its actionMs limit": one call chains up to three waits
  of `actionMs`); recorded in design 18.

## Nested sessions

All headless, `--permission-mode auto`, never `--dangerously-skip-permissions`; cost is `total_cost_usd`. No session
ended with a usage-limit message.

| # | Purpose | Model | Turns | Duration | Cost |
| --- | --- | --- | --- | --- | --- |
| E25–E38 | level A cases A1–A13 and R1, once each (`evals/run.mjs --jobs 4`) | sonnet (+ agents) | 1–18 | 5–78 s | $2.99 in all |
| L1 | `/qa:setup toolshop https://practicesoftwaretesting.com` | default (opus) | 3 | 106 s | $0.23 |
| L2 | `/qa:new-test "<request of step 2>" --yes` → `INFRA_FAIL` | default (opus) | 12 | 120 s | $0.63 |
| L2b | `/qa:new-test two-products-qty-remove --yes` (resume) → `VERIFIED` | default (opus) | 10 | 139 s | $0.59 |
| L3 | `/qa:new-test "<request of step 3>" --yes` → `VERIFIED` | default (opus) | 15 | 176 s | $0.86 |
| L4 | `/qa:triage two-products-qty-remove` (broken locator) | opus + sonnet (`app-mapper`) | 6 | 128 s | $0.42 |

Total: 19 sessions, about $5.72.

Live invocations against the site: 12 of 12 (table in stage 6).

## Hand-over for the final session

### From an empty repo to a verified test (what each step prints now)

The owner installs the plugin first (`claude plugin marketplace add <repo>`, `claude plugin install qa@cart-testing`;
not run in this order: the sessions used `--plugin-dir`).

```text
$ git init my-shop-tests && cd my-shop-tests && claude
> /qa:setup toolshop https://practicesoftwaretesting.com
```

prints (L1, 106 s): "The harness setup for **toolshop** finished with `VERDICT: PASS`." — `e2e/` with 83 files from the
template, `qa.config.json` (toolshop, https://practicesoftwaretesting.com, `data-test`, en-US, USD, `default` defects),
3 starter files in `e2e/app/`, dependencies and Chromium installed, the self-check passed; next:
`/qa:new-test "<what the shopper does and what to check>"`; commit `e2e/`.

```text
$ git add e2e && git commit -m "qa setup"
> /qa:new-test "Add two different products to the cart. Change the quantity of one, then remove the other. Check that the cart shows the correct total after each change."
```

without `--yes` it shows the confirmation and asks; with `--yes` (L2b, after one `INFRA_FAIL` of the live site and
its resume) it ends with the readback now in `examples/toolshop/reports/two-products-qty-remove/readback.txt`:
`PASS 3/3 · test verified`, Combination Pliers $14.15 · Pliers $12.01, S1 $14.15, S2 $26.16, S3 $54.46, S4 $42.45 all
`match`, intent review without remarks, defects 9/9, controls 4/4, report review, scope, four gaps from the live
pass, rules, `Rerun: cd e2e && npm run qa -- run two-products-qty-remove`, the files.

```text
$ git add e2e && git commit -m "verified cart test"
$ cd e2e && npm run qa -- run two-products-qty-remove        # without the plugin: PASS, G3 3/3, ≈20 s
$ npm run qa -- verify two-products-qty-remove               # in e2e/: PASS, G4 "4 caught, 0 missed", ≈55 s
$ qa-harness report two-products-qty-remove --promote <a dry run id>
Run … was not promoted: it is a dry run (gates G0–G2 on the reference cart); only a live run verified through G4 is promoted.
The tracked files in reports/two-products-qty-remove/ are unchanged.
VERDICT: NO_TESTS_RUN
```

### Known limits to name in the README

- Currencies USD and EUR only (N5); the output budget is 15 lines plus the `VERDICT` line (N1); a single failing read
  inside a checkpoint is retried until `settleMs` without a trace (N6).
- An environment failure is not retried: the flow stops and the same command resumes it (stage 6: 1 of 12 live
  invocations ended `INFRA_FAIL`, the API listing unanswered for 10 s).
- A driver call may take at most 3 × `actionMs` before it is `LOCATOR_FAIL`.
- `doctor` type-checks only when TypeScript is installed for the root.
- `--as-evidence` is the tester's flag; the plugin never promotes a red run.
- `claude plugin eval` cannot run the harness cases (no plugin `bin/` in its sandbox); `node evals/run.mjs --root <dir
  outside the worktree>` runs them. In this environment nested sessions cannot Write inside a git worktree.
- The Playwright HTML report stays in `runs/<runId>/html/` (outside the repo); its data holds absolute local paths.
- The first session after installation downloads `@playwright/mcp` through `npx -y` (time not measured).

### Three candidate observations for the README's "one decision"

1. **The harness, not an agent, decides what enters the repo.** Before order F a dry run that ended `DEFECT_LATE`
   replaced the verified evidence with `VERDICT: PASS` (V B1: set hash `88efaca0c0b7` → `6b2834eb882c`); now the same
   request ends `NO_TESTS_RUN`, exit 1, set hash `d7c197330069` before and after (stage 6, step 4), and 8 unit tests plus
   mutation #28 hold it.
2. **The defects are re-judged on the products the live run actually chose.** For the first request the stub prices
   made 12 of 13 default defects applicable; on the live products (no eco-rated product in the cart) only 9 of 13 were
   (`G2 again on the products of this run: 13 defects: 9 detected where expected, 0 late, 0 missed, 4 not applicable`),
   and the readback reports 9/9 with the four gaps, not 12/12.
3. **A live run alone could not prove the driver reads the total; a control does.** In `two-products-qty-remove` the
   total always equalled the subtotal or a line total ("the live run alone cannot tell those fields apart"); only
   `skew-total` (caught at S1 in every verification) shows the driver reads the "Total" row. With the eco rule in force
   (`wood-saw-qty-remove-other`), "At S1, S3, S4 it differed from the subtotal and from every line total".

## Measurements

| Stage | From (UTC) | To | Minutes |
| --- | --- | --- | --- |
| 0 workspace, baseline | 09:38:19 | 09:39:39 | 1.5 |
| 1 promotion and the report's verdict | 09:39:39 | 09:44:36 | 5 |
| 2 classification and conditions | 09:44:36 | 09:51:34 | 7 |
| 3 tests per survivor (replay 09:55–10:13 in the background) | 09:51:34 | 10:13 | 22 (5 of own work) |
| 4 remaining fixes | 09:55:41 | 09:59:30 | 4 |
| 5 plugin side (evals 10:03–10:15 in the background) | 10:00:07 | 10:17:31 | 17 |
| 6 live regression and examples | 10:03:45 | 10:29 | 25 |
| exit criteria, report, F10 proof, replay on the final tree | 10:29 | 10:46 | 17 |

Ended `Wed Nov 25 10:46 UTC 2026`, minute 68 of the 150-minute box; no stage was cut.
