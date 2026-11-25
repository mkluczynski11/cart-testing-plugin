# Order D — the plugin layer: skills, agents, hooks, setup

Project: `cart-testing-plugin` (Claude Code plugin `qa`). Branch `n-harness` holds the deterministic
harness (`templates/e2e`, `examples/toolshop`). This session builds everything that makes it a Claude
Code plugin a QA engineer installs and drives with one command. The contract is `docs/design.md`:
sections 3 (flow), 4 (agents), 5 (skills), 6.3 (verdict routing), 7 (guardrails and hooks), 11 (what the
tester sees), 12.1 (layout), 14.1 (level A cases). The facts about the harness as built are in the
hand-over at the end of `docs/reports/N.md`: read that first; it is the CLI contract, not your memory.

This order lives in the repo as `docs/orders/D.md`. After any context compaction, re-read this file
and `docs/reports/D.md` before doing anything else.

## Rules

Unattended run:
- Never ask a question and never wait for approval, including approval of your plan: write the plan at
  the top of `docs/reports/D.md` and start. Where you would ask, choose the option closest to the
  design, record it under "Open questions", and continue.
- Time box 240 minutes. Write `date -u` into the report at the start of every stage. After 210 minutes
  finish the stage you are in, write the final report and stop.
- Stages in order, with one fixed point: stage 4 (the whole flow on the live site) starts no later than
  minute 120. It is the one result this order must not miss. If stage 3's eval cases are not all run by
  then, commit what exists, mark the rest "not run", go on, and return to them in stage 6.
- A stage ends with its checks green, earlier checks still green, a commit, and its section appended to
  the report. If a stage cannot be made green with reasonable effort, record precisely where it stopped
  and continue only with stages that do not build on the broken part.
- Nothing you run may wait for input or run forever: no `--ui`, `--debug`, `--headed`,
  `playwright show-report`; `npx` only for installed binaries or with `--yes`; `git commit` with `-m`.
  A local server may run in the background only for the duration of one check and is killed before that
  check's result is written.
- Never: `git push`, `git reset --hard`, `git checkout -- .`, `git clean`, `git stash`, `sudo`, global
  installs, writes under `.git/` or `.claude/`, `claude plugin install`, `claude plugin marketplace add`
  (both change the owner's global configuration; the owner tests the install path after the push). Do
  not put `cd` and `git` in one command line: use `git -C <dir>`. Do not prefix commands with your own
  environment variables. A refused command is not retried in another form.
- Nested Claude Code sessions (the only way to test a skill, an agent or a hook): always headless and
  bounded, `claude -p "<prompt>" --plugin-dir <this worktree> --permission-mode auto --max-turns <n>
  --output-format json`, started with the longest timeout the shell tool allows, in a scratch repo under
  `.sandbox/`. Check `claude --help` for the exact flags first. Never `--dangerously-skip-permissions`.
  Level A cases run with `--model sonnet` (cheaper, and a stricter reader of the skill text); the live
  flow of stage 4 runs on the default model. Keep sessions few: every one costs usage. Log each one in
  the report: purpose, turns, duration, cost or tokens as the JSON output reports them.
- If a nested session ends with a usage-limit message, do not retry it: write the report with what
  exists, say which stage was cut, and stop.

Engineering:
- English in the repo. Plan and file list first. The design is the contract; where it is silent, the
  notes in section 3 of this order decide; anything still open is your choice, recorded in the report.
- Do not guess plugin, skill, agent, hook or MCP schemas. Read the current docs first
  (https://code.claude.com/docs/en/plugins/components.md, /skills.md, /sub-agents.md, /hooks.md,
  /plugins/overview.md, /plugin-evals.md) and record what you verified there.
- File ownership: you create `.claude-plugin/`, `skills/`, `agents/`, `hooks/`, `scripts/`, `bin/`,
  `evals/`, `.mcp.json`, `docs/eval-log.md`, `docs/evidence/d-flow/`, `docs/reports/D.md`, and one line
  `.sandbox/` in `.gitignore`. Do not change anything under `templates/e2e/` or `examples/`. If the
  harness needs a change, describe it under "Requests to the harness" in the report; another session is
  reviewing that code right now.
- No application names in `skills/` and `agents/`: placeholders only (`Product A`, `$10.00`,
  `<locator>`), as design 5.2 requires. The model copies examples into results.
- Live site https://practicesoftwaretesting.com: only in stage 4, at most 10 harness or Playwright
  invocations, headless, one at a time. If it is unreachable, try once more later, then report stage 4
  as not verified.

## 0. Workspace

The session is started inside the worktree `.worktrees/d-plugin`, on branch `d-plugin`, created from
`n-harness`. Check with `git rev-parse --abbrev-ref HEAD`; otherwise stop and report. Then
`git add docs/orders/D.md`, add `.sandbox/` to `.gitignore`, commit. Run `npm ci` in `templates/e2e`.

## 1. What the tester does

```text
/qa:setup
/qa:new-test "Add two different products to the cart. Change the quantity of one, then remove the
other. Check that the cart shows the correct total after each change."
```

The model's work is to turn the request into a scenario, talk to the tester, map a page when a driver
action is missing, and read the evidence independently. Code does the rest. The model never writes a
test, an expected amount, a verdict or a hash.

## 2. Stages

### Stage 1 — mechanics, settled by experiment (design 15.4)

With a throwaway plugin skeleton under `.sandbox/`, answer each with an executed command and keep the
output: how a plugin skill is invoked and listed; whether `claude -p "/qa:<skill> <arguments>"` invokes
a plugin skill headlessly with its arguments, also one the model may not choose itself; whether `bin/`
is on the shell tool's `PATH`; the exact `agent_type` a hook receives for a plugin agent and for the
main thread; how an agent's `skills` field names a skill of the same plugin; whether `effort` in skill
and agent frontmatter is accepted; how a static `.mcp.json` of a plugin starts the Playwright MCP server
and whether the application's origin and test-id attribute can be passed to it; what
`claude plugin validate` checks; whether `claude plugin eval` exists on this account, what it bills
against, and whether its sandbox can run `qa-harness`; what `--output-format json` reports about turns
and cost. From the docs only, without installing anything: whether a marketplace file can point at the
repo root, and which directories an installed plugin then contains (are `templates/` and `examples/`
there?).
Check: a table question · command · answer in the report. Every later stage uses these answers.

### Stage 2 — shell and setup

- `.claude-plugin/plugin.json` (name `qa`, version `0.3.0`) and `.claude-plugin/marketplace.json`.
- `bin/qa-harness`: finds the tester's e2e root (`./e2e`, the current directory, or a parent) and runs
  the harness there; same behaviour from the repo root and from `e2e/` (design 6.1).
- `scripts/init.mjs`, reached as `qa-harness init --app <name> --base-url <url> [--test-id-attribute <a>]
  [--locale <l>] [--currency <c>] [--defects default|extended]`: copies `templates/e2e` to `./e2e`
  without overwriting drivers, scenarios, tests or reports; removes the `qa:toolshop` and
  `typecheck:toolshop` scripts from the installed `package.json`; writes `qa.config.json`; runs `npm ci`
  and the Chromium install; runs `selftest`; ends with a `VERDICT:` line.
- Starter pack: when `--app toolshop` is given, `init` also copies `examples/toolshop/app/*` into
  `e2e/app/`. This is a deliberate addition to the design: the first run of a new tester does not
  depend on an agent mapping the site. `app-mapper` extends and repairs that driver.
- Skill `setup` (design 5.3): tester-only, calls `qa-harness init`, reports the result.
- Check: in `.sandbox/tester-1/` (`git init`), `qa-harness init --app toolshop --base-url …` ends
  `VERDICT: PASS`; `npm run qa -- selftest` passes there with no plugin involved; the installed tree has
  no Toolshop name outside `e2e/app/` and `qa.config.json`, and no `node_modules` copied from the
  template (compare `e2e/` with `git ls-files templates/e2e` plus what `npm ci` creates).

### Stage 3 — the flow up to the verdict (design 3, 5, 6.3, 7, 11)

- Skill `contracts`: the formats of design 8 as the harness actually implements them (scenario fields,
  step semantics, validation rules, driver types and the UI boundary, the shape of the test, allowed
  `shopper` calls). `scripts/check-contracts.mjs` fails when the type block quoted in the skill differs
  from `templates/e2e/support/core/types.ts`.
- Skill `new-test` (design 5.3 and the step table 3.1): intake, product picks, `cart_after`, example,
  confirmation by the template of 11.1 with every choice the skill made, freeze, intent review (3a),
  optional step 3b, compile, dry gates, `qa-harness need`, driver step, live run, verification (8),
  readback by 11.2. It reads only verdicts and applies the dictionary of 6.3, including the
  evidence-based routing of `CONTROL_MISSED` and `FLAKY`, the stopping rule, and resumption from the
  first missing or stale artifact. The three example pairs of 5.3 are in the skill.
- Agent `test-verifier` (card 4.4) with skills `review-intent` and `run-verification` (5.4). It writes
  only `specs/<slug>.intent.md` and `review.md` in a run directory, and issues `INTENT_OK`, `VERIFIED`,
  `REWORK`, `NEEDS_TESTER` or `UNDETERMINED`.
- Skills `verify` and `triage` (5.3).
- Hooks `guard-paths` and `guard-bash` (7.2) enforcing the write matrix of 7.3 and the "who invokes it"
  column of 6.1 by `agent_type`; unit tests with recorded hook inputs (`node --test`).
- Level A cases (14.1) A1–A6 and A8–A13 under `evals/`, in the format `claude plugin eval` expects if
  stage 1 found it usable, otherwise with `evals/run.mjs` driving headless sessions; one run each, no
  comparison arm. Every run gets a line in `docs/eval-log.md`: case, result, turns, cost, what went
  wrong, what was changed in which skill because of it.
- Check: `node --test scripts/` green; the eval table with a result for every case; two transcripts in
  the report showing a hook refusing: `test-verifier` trying to edit a test, and an agent running a
  subcommand that is not its own.

### Stage 4 — the whole flow on the live Toolshop (starts by minute 120)

Headless sessions on the default model, in a fresh scratch repo `.sandbox/flow-1/` (`git init`):
1. `/qa:setup toolshop https://practicesoftwaretesting.com`, then
   `/qa:new-test "<the request of section 1>" --yes`: expected `VERIFIED`, a promoted report with
   `review.md`, `specs/<slug>.intent.md`, and the readback of 11.2.
2. In the same repo: `/qa:new-test "Add three different products. Set the first to 2 units and the third
   to 4. Remove the second. Check the total after every change." --yes`: expected `VERIFIED`;
   `git -C .sandbox/flow-1 status --short` shows nothing changed under `e2e/app/` and `e2e/support/`.
3. In the same repo: `/qa:new-test "Check that the cart works."`: expected a question, no files.
4. Rerun without the plugin (design 14.3, C1): commit the scratch repo, `git clone` it into
   `.sandbox/clone-1/`, `npm ci` in its `e2e/`, then the rerun command printed by the readback of run 1,
   verbatim, from the repo root, and `npm run qa -- verify <slug>` from `e2e/`. No `claude`, no
   `--plugin-dir`. Expected: both green.

A run that ends `INFRA_FAIL`, or a session cut off by its turn limit, is resumed once with the same
command (design 3.3: the flow continues from the first missing or stale artifact). Say in the report
which runs needed it and from which step they resumed.

Keep the evidence: `.sandbox/` is ignored and would be lost. Copy from `.sandbox/flow-1/e2e/` the
`specs/`, `tests/` and the promoted files of `reports/<slug>/` (no `runs/`), plus the final answer of
each session as a text file, into `docs/evidence/d-flow/`, and commit. The final session builds
`examples/toolshop/` from these files: they are the test the plugin generated and the result of its
real run.
Check: the four outcomes, each with duration, turns and cost; the readback of run 1 pasted in full.

### Stage 5 — the page-reading agent and triage (design 4.2, 5.4, 5.3)

- Agent `app-mapper` with skills `map-app-flow` and `repair-locator`; `.mcp.json` with the Playwright
  MCP server as stage 1 found it can be configured.
- `new-test` step 6 and `triage` route to it exactly as 6.3 says, with the repair counter of R9
  (`qa-harness run --repair driver`).
- Check without the live site, on the harness's control application. `startControlApp()` in
  `templates/e2e/support/harness/control-app/server.ts` serves it on 127.0.0.1; start it from a small
  script under `.sandbox/`, write its address into the scratch repo's `qa.config.json`, kill it when the
  check ends. The scratch tester repo holds a copy of the control driver and its rules file and one
  scenario taken through the harness to a green run. Three headless sessions:
  a. one locator of the driver broken on purpose, then `/qa:triage <slug>`: expected the action
     repaired by `app-mapper` (`repair-locator`), the map updated, `qa-harness run` green, scenario and
     test untouched (design 14.2, B5);
  b. one action removed from the driver, then `/qa:new-test <slug>` resumed: expected `qa-harness need`
     names the action, `app-mapper` builds it from the page (`map-app-flow`), the run green;
  c. a scenario confirmed against a rules file without the discount rule, on a cart that crosses the
     discount threshold, then `/qa:triage <slug>`: expected `UNMODELED_ADJUSTMENT`, an answer that ends
     with a question about the rule, and no file changed (design 14.2, B6).
  For each: the outcome, or a precise account of where it stopped and why.
- Once `.mcp.json` exists, rerun level A case A4: the main flow must not change because the server
  now starts with every session. Record the start-up cost if the JSON output shows it.

### Stage 6 — what is left, in this order

Level A cases not yet run. Then, only if at least 30 minutes are left: agent `defect-designer` with
skill `design-defects` (4.3, 5.4), `--defects extended`, `--risk`, case A7.

## 3. Notes where the design is silent

1. `new-test` gets one flag the design does not have: `--dry` stops after the dry gates and says so in
   the readback. The level A cases use it; nothing else does.
2. The harness prints `PASS`; `VERIFIED` is issued only by `test-verifier` in step 8, when the intent
   review matches the scenario hash and gates G0–G5 are green. After `VERIFIED` the main thread calls
   `qa-harness report --promote <runId>`. The readback headline "PASS 3/3 · test verified" appears only then.
3. Compilation is not called before `INTENT_OK` exists for the current scenario hash. `REWORK` from the
   intent review returns to the scenario and needs a new confirmation; two rounds, then stop (3.1).
4. Skills are written in English and tell the model to answer in the language of the request.
   Templates of 11.1 and 11.2 are filled only from command output and report files.
5. Descriptions are one sentence (they sit in every session's context); procedure skills are hidden
   from the menu; each `SKILL.md` stays under about 150 lines, longer material in files next to it.
6. Hook scripts resolve paths against the project directory, work from any working directory, read
   the matrix from one data file, and explain a refusal in one sentence the model can act on.
7. Models and turn limits as in the agent cards of design 4; they are starting values.
8. `setup` takes its answers as arguments, `/qa:setup <app> <base-url> [--defects default|extended]`,
   and asks only for what is missing: a headless session cannot answer a question.
9. Before `/qa:setup` has run there is no `e2e/`. `qa-harness doctor` then checks Node, git and the
   network from the plugin and says that setup has not run; every other subcommand answers with one
   sentence that names `/qa:setup` and a verdict from the dictionary. Never a stack trace.
10. `init` copies the template by an explicit exclusion list (`node_modules`, `test-results`, run
    directories, HTML reports). A development checkout has them and an installed plugin does not; both
    must produce the same `e2e/`.
11. `init` finds the starter pack relative to the plugin's own location, not the working directory.
    When it is absent, it says so in one sentence and continues without it.

## 4. Exit criteria — each result pasted into the report

```bash
claude plugin validate .            # or what stage 1 found to be the validation
node --test scripts/
node scripts/check-contracts.mjs
grep -rniE "toolshop|practicesoftwaretesting|pliers" skills agents   # no output
git status --short                  # clean after the last commit
```

Plus: stage 2's scratch install, stage 3's eval table and hook transcripts, stage 4's four outcomes and
the committed evidence, stage 5's three sessions.

## 5. Report: `docs/reports/D.md`

Plan at the top. One section per stage, appended when it ends: timestamp, what was built, check output,
deviations from the design with the reason. At the end: exit criteria table; the mechanics table of
stage 1; the eval table; the table of nested sessions (purpose, model, turns, duration, cost); requests
to the harness; where the design was ambiguous or wrong and what you chose; open questions;
measurements (wall-clock per stage, live invocations); a list "built but not exercised" naming every
skill, agent, hook rule and verdict reaction that no session of this order actually ran; and a
hand-over for the final session: the exact commands a tester types from an empty repo to a verified
test, what each prints, and everything known not to work.

Commit on `d-plugin` with English messages, at least one commit per stage. Do not merge, do not push.

## 6. Quality bar

- Every skill reads as a procedure a new colleague could follow: when, input, steps, output, stop.
- One spelling for every verdict, command, file and term, the design's.
- No skill repeats another: formats only in `contracts`, reactions to verdicts only in `new-test`'s
  routing table, which quotes design 6.3.
- Scripts: a two-line header saying what the file is and which design section it implements; no dead
  code; errors as complete sentences.
- Nothing in `skills/` or `agents/` names Toolshop, a product, a price or a selector.
