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
