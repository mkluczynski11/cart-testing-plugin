# Order V — independent verification of the harness built in order N

Project: `cart-testing-plugin` (Claude Code plugin `qa`). Branch `n-harness` holds the deterministic
harness built last night (orders A, B, N). You did not write it. Your job is to find out whether its
claims are true and whether its checks can fail. You change nothing in the product: you report.

This order lives in the repo as `docs/orders/V.md`. After any context compaction, re-read this file
and `docs/reports/V.md` before doing anything else.

## Rules

- Unattended run. Never ask a question, never wait for approval. Write your plan at the top of
  `docs/reports/V.md` and start. Time box 120 minutes: write `date -u` into the report at the start of
  every part; after 100 minutes finish the part you are in and write the summary.
- You are the evaluator, not the producer. Do not fix anything under `templates/` or `examples/`, and do
  not commit any change there. The only things you commit, on branch `v-review`, are
  `docs/reports/V.md`, this order, and one line `.sandbox/` added to `.gitignore`.
- Temporary changes (mutations, broken inputs, scratch copies) are made, measured and undone one at a
  time. After each one `git status --short` must show nothing under `templates/` or `examples/`.
  Undo a mutation with `git restore <file>`. Scratch copies live in `.sandbox/` inside this worktree.
- A finding needs evidence: the command, its output, the file and line. No finding from reading alone
  when a command can show it. Say plainly when something is confirmed; do not pad the report.
- Nothing you run may wait for input or run forever: no `--ui`, `--debug`, `--headed`,
  `playwright show-report`; `npx` only for installed binaries; `git commit` with `-m`.
- Never: `git push`, `git reset --hard`, `git checkout -- .`, `git clean`, `git stash`, `sudo`, writes
  under `.git/` or `.claude/`. Do not put `cd` and `git` in one command line. Do not prefix commands
  with your own environment variables. A refused command is not retried in another form.
- Live site https://practicesoftwaretesting.com: do the live part first (part 1), at most 10 harness
  invocations in total, one browser, headless. If it is unreachable, try once more at the end, then
  report the live part as not verified.
- English in the repo. The design `docs/design.md` (sections 6–10) and `docs/orders/N.md` are the
  specification; `docs/reports/N.md` is the claim under test. Read the design by section.

## 0. Workspace

The session is started inside the worktree `.worktrees/v-review`, on branch `v-review`, created from
`n-harness`. Check with `git rev-parse --abbrev-ref HEAD`; otherwise stop and report. Then
`git add docs/orders/V.md` and commit it.

## Part 1 — Reproduce the claims

In `templates/e2e/`: `npm ci`, `npx tsc --noEmit`, `npm run typecheck:toolshop`, `npm run test:unit`,
`npm run qa -- selftest`, `npm run qa:toolshop -- doctor`, `npm run qa:toolshop -- run <slug> --dry` for
both scenarios, then live: `npm run qa:toolshop -- verify <slug>` for both scenarios, once each.
Table in the report: claim in report N · what you observed · confirmed or not. For the live runs compare
totals, repeats, the four facts of every control and the verdict with the promoted reports.

## Part 2 — Can the harness's own checks fail?

Apply each mutation alone, run `npm run test:unit` and `npm run qa -- selftest`, record which check went
red, undo. A mutation that leaves everything green is a finding ("survivor"): name the missing test.
Find the right place in the code yourself; if a mutation does not apply to this code base, say why.

| # | Mutation |
| --- | --- |
| 1 | money: the comparison tolerance is 1 cent instead of half a cent |
| 2 | money: the parser accepts an amount with no currency symbol where the config requires one |
| 3 | ledger: `add` sets the quantity instead of increasing it |
| 4 | pricing: `shareOfUnits … above` behaves as "at or above" |
| 5 | pricing: a percentage of the running value is computed on the subtotal instead |
| 6 | checkpoint: the label layer is skipped |
| 7 | checkpoint: the unit-price layer is skipped |
| 8 | checkpoint: only the total is compared, lines are ignored |
| 9 | checkpoint: a displayed adjustment with no rule is accepted |
| 10 | checkpoint: a red checkpoint is not retried until `settleMs` (first read is final) |
| 11 | validator: the state-agreement rule (cart_after equals the ledger) is switched off |
| 12 | validator: a step that changes nothing is accepted |
| 13 | compiler: `needQty` is the largest step argument instead of the largest state |
| 14 | compiler: the last checkpoint is not emitted |
| 15 | selection: an unnamed pick may select a product the scenario names |
| 16 | gates: `detected-late` is counted as `detected` |
| 17 | classification: zero executed tests give `PASS` |
| 18 | classification: a locator failure is reported before an environment failure |
| 19 | reporter: `rawText` is replaced by the formatted value |
| 20 | doctor: a changed file in `support/core` is not reported |
| 21 | static gate: `waitForTimeout` in a driver is accepted |
| 22 | control `skew-total`: it does not rewrite the amount (activates and does nothing) |
| 23 | control page: the wrong driver is treated as the correct one (the selftest row still passes?) |
| 24 | compile: a hand-edited test is overwritten without `--force` |
| 25 | repair counter: a retry with no change to the repaired file is accepted (`RETRY_REFUSED` never issued) |
| 26 | repair counter: the limit is never reached (`LIMIT_REACHED` never issued) |
| 27 | integrity: a driver changed after verification still counts as verified |
| 28 | promotion: a run whose verdict is not `PASS` can be promoted |
| 29 | run directories: two runs started at the same moment share one directory |

Add up to six mutations of your own where you suspect a check is hollow. Also look for tests that cannot
fail: assertions on constants, tests without an assertion, selftest rows that only check that a command
exited.

## Part 3 — Conformance to the design, by experiment

- CLI names, the 15-line limit, `VERDICT:` as the last line, exit code 0 only for `PASS` (design 6.1).
- The verdict dictionary (6.3): every name exists exactly once in code; list any the code emits that the
  design does not have, and any the design has that no code path can emit.
- Compilation contract (6.1): same bytes twice; exclusive create; identical content succeeds without
  writing; `FILE_CONFLICT` shows the difference; `--force` overwrites.
- Validation V1–V8 (8.1): one failing scenario per rule, written by you, not taken from the fixtures.
- `run.json` against 8.5: every field present; a run that throws still leaves a file; `rawText` verbatim.
- Evidence hygiene (R15): no cookie, authorization header, token or absolute local path (`/Users/`) in
  any tracked file under `examples/` or `docs/`.
- Application neutrality (design 14.3, C2): no Toolshop name, selector, product or price in tracked files
  under `templates/e2e/`, except the npm scripts named in report N.
- The committed tree is self-sufficient: export `HEAD` into `.sandbox/clean/` (`git archive`), run
  `npm ci`, `npm run test:unit`, `npm run qa -- selftest` there.
- Repair loop (R9, 8.5): `run <slug> --repair driver` twice with an unchanged driver gives
  `RETRY_REFUSED`; with a changed driver each time it ends in `LIMIT_REACHED` at the configured limit;
  `attempts.json` agrees with what happened. Find the cheapest way to exercise it; if only a live run
  can, spend at most 2 of the live invocations on it.
- Staleness (R7): in a scratch copy of a verified root, change one character of the driver: `doctor`
  reports the verification as stale. The same for the test and for the rules file (R5, R6).
- Promotion (8.5): `report --promote` of a red run is refused and leaves the promoted set as it was;
  a promotion while the lock is held is refused.
- Parallelism (14.3, C4): two `run <slug> --dry` processes started together give two run directories,
  each complete.

## Part 4 — Does the evidence say what the report says?

For both promoted runs under `examples/toolshop/reports/`: open every screenshot and read the cart on
it; compare products, quantities and the total with `run.json` and `report.md` for that step. Check that
`verification.json` matches the current test, driver and rules (`doctor`), that each control has its
four facts, and that every number in `report.md` can be traced to `run.json` or `verification.json`.

## Part 5 — Hostile and sloppy input

Scenarios with CRLF line endings, tabs, a lower-case alias, quantity 0, quantity 100, an unknown field,
no `check`, a step for an undeclared product; a slug with `../`; `--root` pointing nowhere; a pricing
file with an unknown condition; a driver that returns a non-amount as the total; a driver whose
`readCart` never resolves. Expected every time: a verdict from the dictionary and a sentence a tester
can act on; never a stack trace as the only output, never a hang beyond the configured limits, never a
file written outside the root.

## Part 6 — A tester's read

Read both `report.md` files, the output of every subcommand and three failure messages (one each for
`ORACLE_MISMATCH`, `UNMODELED_ADJUSTMENT`, `LOCATOR_FAIL`) as a QA engineer who has never seen the code.
List every sentence that needs the code to be understood, every number without a source, every term
used in two spellings.

## Part 7 — Code against the quality bar

Section 7 of `docs/orders/N.md`, checked with searches: file headers, `any`, non-null assertions, TODO,
dead or commented-out code, leftovers of the reduced scope. `npm audit` summary. Name the five places
you would least like to maintain, with the reason.

## Part 8 — The open questions of report N

For each of the eight open questions at the end of `docs/reports/N.md`: keep the choice or change it,
with one sentence of reason from what you observed, not from taste. For question 6 (a retry after
`INFRA_FAIL`) count how often the live site failed to answer in your own runs.

## Report: `docs/reports/V.md`

1. Verdict in three lines: can this harness be submitted as it is; what must be fixed first.
2. Findings table, most serious first: id · severity (`blocker` = wrong result or a check that cannot
   fail; `fix` = should be fixed before submission; `note`) · what · evidence · file and line ·
   direction of the fix in one sentence, no code.
3. Claims of report N: confirmed / not confirmed / not checked, with the reason.
4. Mutation table: mutation · caught by · or survivor.
5. The open questions of report N: keep or change, with the reason.
6. Measurements: wall-clock per part, live invocations used.

Commit `docs/reports/V.md` on `v-review`. Do not merge, do not push.
