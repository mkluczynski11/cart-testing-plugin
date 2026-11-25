# Evaluation log

Plugin `qa` 0.3.0, order D. Level A cases of design 14.1, run by `node evals/run.mjs <case…> --root <scratch> [--jobs n]`:
one headless session per case (`claude -p "<prompt>" --plugin-dir <worktree> --permission-mode auto --max-turns <n>
--output-format json --model sonnet`) in a fresh copy of a set-up tester repo (`qa-harness init --app toolshop
--base-url http://127.0.0.1:9`, so nothing reaches a live site), graded by code in `evals/cases.mjs`. One run per case,
no comparison arm. Turns are the main thread's `num_turns`; cost is `total_cost_usd` (list-price estimate, all models
including subagents); time is wall-clock of the session.

| # | Time (UTC) | Case | Result | Turns | Cost | Time | What went wrong | What changed because of it |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 02:35 | A3 ambiguity | FAIL | 6 | $0.13 | 10 s | asked two questions, then ended with an example request instead of the question | `new-test` step 1: an ambiguous request gets at most three lines and the last line is one question |
| 2 | 02:35 | A4 reference, dry | FAIL | 1 | $0.25 | 33 s | `test-verifier` could not write `intent.md`: "The server-side auto mode classifier gave no verdict (it skipped this action) … Write" | none in the plugin; the cause was the scratch location (rows 6–9) |
| 3 | 02:37 | A3 ambiguity | PASS | 4 | $0.11 | 8 s | — | — |
| 4 | 02:37 | A8 out of scope | PASS | 6 | $0.13 | 9 s | — | — |
| 5 | 02:37 | A4, A11, A12 | FAIL | 9 each | $0.16 each | 15–18 s | the main thread's Write of `specs/<slug>.md` got the same "no verdict"; the sessions stopped before `example` | — |
| 6 | 02:38 | A4 | FAIL | 1 | $0.24 | 34 s | as row 2 (sequential, to rule out concurrency) | — |
| 7 | 02:42 | A4 | FAIL | 1 | $0.23 | 38 s | as row 2, with an explicit `--allowedTools "Edit(./e2e/**)"` grant: still "no verdict" | grant removed again |
| 8 | 02:45 | A4 reference, dry | PASS | 4 | $0.27 | 43 s | — (scratch repos moved out of the worktree, see report D stage 3) | `evals/run.mjs --root` |
| 9 | 02:46 | A1 triggering | PASS | 8 | $0.15 | 19 s | — | — |
| 10 | 02:46 | A2 no triggering | PASS | 1 | $0.07 | 5 s | — | — |
| 11 | 02:46 | A3 ambiguity | PASS | 4 | $0.11 | 8 s | — | — |
| 12 | 02:46 | A5 verifier catches a hole | PASS | 5 | $0.19 | 39 s | — (`verify` → `DEFECT_LATE`, `test-verifier` → `REWORK` to the tester at S3) | — |
| 13 | 02:46 | A6 guard | FAIL | 6 | $0.14 | 22 s | no skill was chosen; the answer explained the three possible causes and offered to change the rules file, but asked no question | `triage`: description also covers "a request to change its expected total"; new step 0 answers such a request with the one question of 6.3 and runs nothing |
| 14 | 02:46 | A8 out of scope | PASS | 6 | $0.13 | 8 s | — | — |
| 15 | 02:46 | A9 manual edit protected | PASS | 3 | $0.26 | 40 s | — | — |
| 16 | 02:46 | A10 environment failure | PASS | 6 | $0.28 | 51 s | — | — |
| 17 | 02:46 | A11 swapped objects | PASS | 4 | $0.27 | 44 s | — | — |
| 18 | 02:46 | A12 add versus set | FAIL | 14 | $0.27 | 44 s | grader bug: it looked for the dry verdict in the transcript; the session itself ended `DRY PASS` | grader reads `verification.json` of the newest run directory |
| 19 | 02:46 | A13 intent review | PASS | 2 | $0.13 | 17 s | — | — |
| 20 | 02:48 | A6 guard | PASS | 3 | $0.08 | 6 s | — (`qa:triage` chosen by the model; one question, nothing run); the answer named the rules file by its placeholder `e2e/app/<app>.pricing.ts` | `triage` step 0 says "the application's rules file in `e2e/app/`" |
| 21 | 02:48 | A12 add versus set | PASS | 13 | $0.25 | 40 s | — | — |
| 22 | 03:04 | A4 with `.mcp.json` (stage 5) | PASS | 13 | $0.26 | 40 s | — (the plugin's 25 browser tools are listed as deferred; the flow is unchanged) | — |
| 23 | 03:05 | A7 extended defects, dry | PASS | 14 | $0.33 | 61 s | — (`defect-designer` admitted 6, 0 rejected; G2 19 defects, 18 detected, 1 not applicable) | — |
| 24 | 03:05 | R1 `--risk` (own case, not in 14.1) | PASS | 16 | $0.30 | 51 s | — (one `tester` entry admitted; the main thread chose `add A 2` then `setQty A 1` so that the concern "after a decrease" applies, and said so) | — |

Totals of this table: 26 sessions (row 5 is three), $5.05. Every case A1–A13 has a passing run, plus R1.
