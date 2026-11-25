# Order F — fixes from the verification, and the examples from a real plugin run

Project: `cart-testing-plugin` (Claude Code plugin `qa`). Branch `f-fix` is `d-plugin` (the plugin on top
of the harness) with `v-review` merged in. Your input is two reports: `docs/reports/V.md` (independent
verification: findings B1, F1–F12, N1–N6, the mutation table) and `docs/reports/D.md` ("Requests to the
harness" 1–7, "Final check G-d", "Built but not exercised", the hand-over). Read both in full before
planning; their file and line references are your map. The contract is still `docs/design.md`.

This order lives in the repo as `docs/orders/F.md`. After any context compaction, re-read this file
and `docs/reports/F.md` before doing anything else.

## Rules

Unattended run:
- Never ask a question and never wait for approval: write the plan at the top of `docs/reports/F.md`
  and start. Where you would ask, choose the option closest to the design, record it, continue.
- Time box 150 minutes. Write `date -u` into the report at the start of every stage. Stage 6 (live
  regression and the examples) starts no later than minute 95: finish the item you are on, mark the
  rest of the earlier stages "not done", and go there. After 135 minutes write the final report and stop.
- A stage ends with its checks green, earlier checks still green, a commit, and its section appended
  to the report. If an item cannot be made green with reasonable effort, revert it, record precisely
  where it stopped, and go on: a reverted fix is better than a half fix.
- Nothing you run may wait for input or run forever: no `--ui`, `--debug`, `--headed`,
  `playwright show-report`; `npx` only for installed binaries or with `--yes`; `git commit` with `-m`.
  A local server runs in the background only for the duration of one check and is killed after it.
- Never: `git push`, `git reset --hard`, `git checkout -- .`, `git clean`, `git stash`, `sudo`, global
  installs, writes under `.git/` or `.claude/`, `claude plugin install`, `claude plugin marketplace add`.
  Do not put `cd` and `git` in one command line: use `git -C <dir>`. Do not prefix commands with your
  own environment variables. A refused command is not retried in another form.
- Nested Claude Code sessions: headless and bounded, exactly as order D ran them (`claude -p "<prompt>"
  --plugin-dir <this worktree> --permission-mode auto --max-turns <n> --output-format json`), in scratch
  repos **outside this worktree**, under your session's scratch directory (report D, stage 3 finding:
  inside the worktree the Write tool of a nested session is refused). Never
  `--dangerously-skip-permissions`. Level A cases with `--model sonnet`, the live flow on the default
  model. Log each session: purpose, model, turns, duration, cost. If one ends with a usage-limit
  message, do not retry it: write the report with what exists and stop.
- Live site https://practicesoftwaretesting.com: only in stage 6, at most 12 harness or Playwright
  invocations, headless, one at a time.

Engineering:
- English in the repo. Plan and file list first.
- **Test first.** Every change of behaviour starts with a test that fails for the reason the finding
  names; then the fix; then the same test green. Paste the red line of each into the report. For a
  finding that is "no test exists" (F10, F11, F12, O1), the test is the fix, and you prove it can fail
  by applying V's mutation once: red, then restore.
- No new features and no new vocabulary: verdicts only from design 6.3, terms only from the design.
- The commit that changes `support/core` also carries the regenerated manifest
  (`doctor --write-manifest`). `templates/e2e` stays free of application names (C2).
- After every stage, in `templates/e2e`: `npx tsc --noEmit`, `npm run typecheck:toolshop`,
  `npm run test:unit`, `npm run qa -- selftest`; in the repo root: `node --test scripts/`,
  `node scripts/check-contracts.mjs`, `claude plugin validate .`.
- You own everything in the repo except `README.md` and `LICENSE` (the final session writes them).

## 0. Workspace

The session is started inside the worktree `.worktrees/f-fix`, on branch `f-fix`. Check with
`git rev-parse --abbrev-ref HEAD` and that both `docs/reports/V.md` and `docs/reports/D.md` exist;
otherwise stop and report. `git add docs/orders/F.md`, commit. `npm ci` in `templates/e2e`. Run the
checks of "after every stage" once before touching anything and record the baseline.

## 1. Stages

### Stage 1 — promotion and the report's verdict (V: B1, F6 · D: request 3)

- `report <slug> --promote <runId>` promotes only a live run whose `verification.json` is `PASS`
  through G4. It refuses a dry run, a run without `verification.json`, and a red run: the tracked set
  stays byte for byte as it was, the exit code is not 0, the last line is the run's own verdict when
  that is not `PASS`, and `NO_TESTS_RUN` when there is no verified live run to promote (dry, or no G4).
- One exception, design 8.5: with an explicit flag `--as-evidence` the tester may promote a live run
  that ended `ORACLE_MISMATCH` or `UNMODELED_ADJUSTMENT`. Its `report.md` says in the first line that
  this is evidence of a mismatch, not a verified test, and the command still ends with that verdict.
- `report <slug>` without `--promote` ends with the verdict of the run it reports.
- `report.md` names the intent review and the report review when they exist, with their verdicts,
  instead of saying that none is available.
- Check: unit or selftest cases for every refusal and for `--as-evidence`; V's experiment of part 3
  ("promotion") repeated with the tracked set's hash before and after.

### Stage 2 — classification, and conditions that are not harness bugs

Sources: V findings F4, F3, F2, F1, N4 and open question 7; D requests 1 and 6.

- Inside a driver call (action or read), with the environment probe healthy: Playwright's own timeout
  on a locator, and a driver call that exceeds its `actionMs` limit, give `LOCATOR_FAIL` naming the
  step and the driver method (design 6.1: "an action that did not find its element"). Any other
  exception that is not a library error gives `UNDETERMINED` with the step and the method (6.3), not
  `INFRA_FAIL`. Network errors, 5xx, the probe, the browser start and the driver's own `InfraError`
  stay `INFRA_FAIL`. Environment still outranks everything in the classification order.
- A held lock, a root without `qa.config.json`, an existing file at the test path: each gets its own
  sentence saying what to do and a verdict from the dictionary. The catch-all "harness bug" message
  remains only for real bugs.
- `doctor`: an unreadable scenario is one `SPEC_INVALID` line naming the file, and the other scenarios
  are still checked; `specs/*.intent.md` is not a scenario; problems are not printed under `ok:` (N4).
- Rules file: every rule is validated against the vocabulary of design 9.2 when the file is loaded; an
  unknown condition gives `LINT_FAIL` naming the rule id and the key. `doctor` also type-checks the
  driver and the rules file with the root's own `tsc` when it is installed, and reports the first
  compiler message as `LINT_FAIL`.
- Check: V's scratch roots c2, c3, hp, h and D's stage 5 first fixture (a missing element in an
  unwrapped action) rebuilt as tests: `UNDETERMINED`, `LOCATOR_FAIL` with step and method,
  `LINT_FAIL`, `SPEC_INVALID`, `LOCATOR_FAIL`.

### Stage 3 — a test for every survivor (V: F10, F11, F12, mutation table)

- One test per survivor, as the last column of V's mutation table names it: #10, 16, 18, 19, 20, 25,
  26, 27, O1, O2, O5, O6. A selftest row "guarantees" that edits a scratch root and expects
  `HARNESS_MODIFIED`, `SCENARIO_CHANGED`, `VERIFICATION_STALE`, `RETRY_REFUSED`, `LIMIT_REACHED` and the
  refusal under a held lock. The row "reference cart" asserts the numbers of applicable and detected
  defects it prints.
- Replay: apply each of the 12 survivor mutations and #28 (remove the promotion guard of stage 1),
  one at a time, as V did (regenerate the manifest, run unit tests and selftest, restore). Every one
  must now turn a check red. V's runner and mutation list are in `../v-review/.sandbox/mut/` (not
  committed); you may read them, you may not write there.
- Check: the replay table mutation · caught by; `git status --short` empty after each restore.

### Stage 4 — the remaining fixes (V: F9, F5, F7, F8, N2, N3 · D: request 7)

- G0 on a driver: the origin of a URL literal is compared exactly (`new URL(x).origin`), a
  string-literal computed member is resolved (`page['waitForTimeout']`), a `setTimeout`-based wait is
  a fixed wait.
- `FILE_CONFLICT` shows moved and duplicated lines (a diff by position).
- `--repair driver` is admitted only with a live run; a repair run that ends `PASS` closes the episode,
  so the counter starts again for the next failure.
- Messages: the `ORACLE_MISMATCH` cause quotes the raw text of the row it names; the
  `UNMODELED_ADJUSTMENT` record no longer adds "the total is not the subtotal minus the adjustments"
  when the displayed rows add up; a read that is not an amount is not reported under layer "labels".
- N2 (the non-null assertion in the lab) and N3 (`run.json` records that the tree was dirty).
- Not in this order: N1, N5, N6. List them in the hand-over as known limits.

### Stage 5 — the plugin side (D: request 2, 4, the readback flaw, ambiguity 4)

- The intent review becomes visible to the harness: `intent <slug>` is a harness subcommand with the
  output the plugin's script has today; `verify` records the scenario hash for which a current
  `INTENT_OK` review exists (design 8.5); `doctor` reports a stale review. `scripts/intent.mjs` goes,
  `bin/qa-harness` forwards, the guard matrix keeps its meaning.
- `qa.config.json` knows the optional `browserAllowedOrigins`; the Toolshop starter pack sets the API
  origin there, so `app-mapper` can read the live page.
- Readback: the gap list comes from the same G2 pass as the counts.
- `app-mapper` and `defect-designer` end with `PASS`, not `REPAIRED`.
- `skills/new-test/routing.md` covers what stages 1 and 2 changed: a refused promotion, `UNDETERMINED`
  and `LOCATOR_FAIL` from `run`. `skills/contracts` matches the code (`check-contracts`).
- Check: `node --test scripts/`; all level A cases once (`node evals/run.mjs … --root <scratch>`),
  every result in `docs/eval-log.md`.

### Stage 6 — live regression and the examples (starts by minute 95)

In one fresh scratch repo outside the worktree, headless sessions on the default model:
1. `/qa:setup toolshop https://practicesoftwaretesting.com`
2. `/qa:new-test "Add two different products to the cart. Change the quantity of one, then remove the
   other. Check that the cart shows the correct total after each change." --yes` → `VERIFIED`.
3. `/qa:new-test "Add a Wood Saw, then two units of the first available product. Raise the saw to three
   units, then remove the other product. Check the total after each change." --yes` → `VERIFIED`, with
   the eco rule in force at some steps and not at others (the total differs from the subtotal there).
4. `qa-harness report <slug of 2> --promote <the dry run of 2>` → refused, the promoted set unchanged.
5. Commit the scratch repo, clone it, `npm ci` in `e2e/`, then the rerun line of each readback verbatim
   from the repo root and `npm run qa -- verify <slug>` from `e2e/`, without Claude Code: all green.
6. If at least 20 minutes are left: break one locator of the Toolshop driver in the scratch repo (one
   the driver wraps), `/qa:triage <slug of 2>` → `LOCATOR_FAIL`, repaired by `app-mapper` on the live
   page, `run --repair driver` green, scenario and test untouched (design 14.2, B5).
A run that ends `INFRA_FAIL` is resumed once with the same command; say so in the report.

Then rebuild `examples/toolshop/` from that scratch repo, so the submission shows what the plugin
generated and the result of its real run: `specs/` (scenario, example, intent review), `tests/`,
`reports/<slug>/` (the promoted set with `review.md` and the screenshots), `app/` as installed. Remove
the two harness-made scenarios of order N with their tests and reports, and `docs/evidence/d-flow/`,
which this replaces. Keep `qa.config.json`, `tsconfig.json`, the `support` link and `lab/`, so
`npm run qa:toolshop -- doctor` and `-- run <slug> --dry` still pass from the plugin repo. Add the
final answer of sessions 2 and 3 as `examples/toolshop/reports/<slug>/readback.txt`. Copy the Playwright
HTML report of the promoted run of 2 next to it only if it holds no trace, no cookie or header value,
and is under 5 MB; otherwise say why not.
Check: R15 search over `examples/` and `docs/` (no `/Users/`, cookie, authorization header, token);
`npm run qa:toolshop -- doctor` `PASS`; both examples `run --dry` `PASS`.

## 2. Notes

1. Where V's direction of a fix and this order differ, this order decides; where both are silent, the
   design does.
2. No retry after `INFRA_FAIL` (V, question 6): the flow stops and a repeated command resumes it.
3. The main thread still may not run `qa-harness verify`; that is the design's "Who invokes it" column.
4. `docs/design.md`: append a section "18. Amendments after v0.3" with one line per place where the
   code now differs from sections 1–17 on purpose (the `intent` subcommand, the promotion guard and
   `--as-evidence`, the starter pack, `browserAllowedOrigins`, `new-test --dry`, `setup` arguments,
   `tsc` in `doctor`, the classification of driver timeouts). Do not edit sections 1–17.

## 3. Exit criteria — each result pasted into the report

```bash
# in templates/e2e
npm ci && npx tsc --noEmit && npm run typecheck:toolshop && npm run test:unit
npm run qa -- selftest
npm run qa:toolshop -- doctor
# in the repo root
node --test scripts/ && node scripts/check-contracts.mjs && claude plugin validate .
grep -rniE "toolshop|practicesoftwaretesting|pliers|wood saw" skills agents   # no output
git status --short                                                            # clean
```

Plus: the replay table of stage 3 with no survivor, the eval table of stage 5, the outcomes of stage 6.

## 4. Report: `docs/reports/F.md`

Plan at the top; one section per stage. At the end:
- a table finding or request · what changed · the test that guards it · its red line before the fix;
- what was not done or was reverted, with the reason;
- the replay table; the eval table; the nested sessions; live invocations used;
- the examples: scratch run ids, date, what was copied where;
- for the final session: the exact commands from an empty repo to a verified test with what each
  prints now, the known limits to name in the README, and three candidate observations for the README's
  "one decision", each with the number or output that supports it.

Commit on `f-fix` with English messages, at least one commit per stage. Do not merge, do not push.
