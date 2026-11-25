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
