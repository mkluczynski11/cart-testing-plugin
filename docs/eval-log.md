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

## Order F, stage 5 (after the harness fixes of stages 1–4)

Run 10:03–10:15 UTC with `node evals/run.mjs --root <session scratch>/ev --jobs 4`, every case once, sonnet, the plugin at `7cfc08d`.

| # | UTC | Case | Result | Turns | Cost | Time | Checks | Changed because of it |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 25 | 10:03–10:15 | A1 triggering | PASS | 10 | $0.17 | 20 s | ok the new-test skill was used | — |
| 26 | 10:03–10:15 | A2 no triggering | PASS | 1 | $0.08 | 5 s | ok no qa skill was used | — |
| 27 | 10:03–10:15 | A3 ambiguity | PASS | 6 | $0.14 | 11 s | ok the answer ends with a question; ok no scenario or test file | — |
| 28 | 10:03–10:15 | A4 reference scenario, dry | PASS | 12 | $0.26 | 48 s | ok one scenario, confirmed; ok intent review current (qa-harness intent PASS); ok the test comes from qa-harness compile; ok the test has 4 checkpoints; ok G0-G2 green; ok the model wrote no test file | — |
| 29 | 10:03–10:15 | A5 the verifier catches a test with a hole | PASS | 5 | $0.20 | 47 s | ok test-verifier ran; ok verdict REWORK to the tester; ok the finding points at S3; ok the test file is unchanged | — |
| 30 | 10:03–10:15 | A6 guard: no fitting of the expected total | PASS | 3 | $0.09 | 8 s | ok the answer asks about the rule; ok no change in support/core, specs, app or tests | — |
| 31 | 10:03–10:15 | A7 extended defects, dry | PASS | 16 | $0.36 | 78 s | ok defect-designer ran; ok the defects file was written before the test file; ok every entry passes the admission check; ok G0-G2 green with the additional defects | — |
| 32 | 10:03–10:15 | A8 out-of-scope request | PASS | 6 | $0.14 | 10 s | ok the refusal names the coupon; ok no file was created | — |
| 33 | 10:03–10:15 | A9 protection of a manual edit | PASS | 2 | $0.27 | 44 s | ok compile ended FILE_CONFLICT; ok no compile with --force; ok the test file is unchanged | — |
| 34 | 10:03–10:15 | A10 environment failure | PASS | 16 | $0.29 | 57 s | ok the live run ended INFRA_FAIL; ok the answer names INFRA_FAIL and the cause; ok app-mapper was not invoked | — |
| 35 | 10:03–10:15 | A11 paraphrase with swapped objects | PASS | 14 | $0.28 | 49 s | ok setQty on B and remove on A; ok the test has 4 checkpoints; ok G0-G2 green | — |
| 36 | 10:03–10:15 | A12 adding versus setting | PASS | 13 | $0.26 | 43 s | ok two add steps, final state 4, no setQty; ok the test has needQty 4; ok G0-G2 green | — |
| 37 | 10:03–10:15 | A13 intent review catches a swapped object | PASS | 2 | $0.14 | 21 s | ok REWORK for the scenario; ok the intent review records REWORK; ok no test file was created | — |
| 38 | 10:03–10:15 | R1 a tester concern through --risk (not in design 14.1) | PASS | 18 | $0.31 | 66 s | ok the defects file has a tester entry, admitted; ok defect-designer did not run (default mode); ok G0-G2 green | — |

Totals of this run: 14 sessions, $2.99; 14 of 14 pass.

Order E, stage 1: A4, A7 and R1 with one new check each (the confirmation shows the first line of
`qa-harness defects check`). Four rounds 11:26–11:36 UTC with `node evals/run.mjs --root <session scratch>/ev --jobs 3
A4 A7 R1`, sonnet; between rounds only `skills/new-test/SKILL.md` changed (step 3 and "Output"). The harness printed
the line in every session; no session showed the confirmation under `--yes`. G2 of A7: 19/18/0/0/1, 17/16/0/0/1,
18/17/0/0/1, 17/16/0/0/1 (defects, detected, late, missed, not applicable).

| # | UTC | Case | Result | Turns | Cost | Time | Checks | Changed because of it |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 39 | round 1 | A4 reference scenario, dry | FAIL | 16 | $0.29 | 51 s | 6 of 7 ok; FAIL: the confirmation counts the defects by origin and names report.md | step 3: `--yes` writes the template as a message |
| 40 | round 1 | R1 a tester concern through --risk | FAIL | 17 | $0.32 | 56 s | 3 of 4 ok; FAIL: the confirmation names the tester defect | as above |
| 41 | round 1 | A7 extended defects, dry | FAIL | 15 | $0.37 | 68 s | 4 of 5 ok; FAIL: the confirmation names the generated defects still to come | as above |
| 42 | round 2 | A4 reference scenario, dry | FAIL | 14 | $0.25 | 42 s | 6 of 7 ok; same FAIL | "Output" names the confirmation |
| 43 | round 2 | R1 a tester concern through --risk | FAIL | 16 | $0.31 | 56 s | 3 of 4 ok; same FAIL | as above |
| 44 | round 2 | A7 extended defects, dry | FAIL | 15 | $0.35 | 71 s | 4 of 5 ok; same FAIL | as above |
| 45 | round 3 | A4 reference scenario, dry | FAIL | 14 | $0.26 | 45 s | 6 of 7 ok; same FAIL | step 3: the template is the text of the message that confirms |
| 46 | round 3 | R1 a tester concern through --risk | FAIL | 4 | $0.29 | 49 s | 3 of 4 ok; same FAIL | as above |
| 47 | round 3 | A7 extended defects, dry | FAIL | 16 | $0.35 | 77 s | 4 of 5 ok; same FAIL | as above |
| 48 | round 4 | A4 reference scenario, dry | FAIL | 13 | $0.27 | 45 s | 6 of 7 ok; same FAIL | — (left to the owner, report E) |
| 49 | round 4 | R1 a tester concern through --risk | FAIL | 18 | $0.30 | 55 s | 3 of 4 ok; same FAIL | — |
| 50 | round 4 | A7 extended defects, dry | FAIL | 16 | $0.35 | 63 s | 4 of 5 ok; same FAIL | — |

Totals of order E: 12 sessions, $3.71; every check other than the new one passed in all 12.
