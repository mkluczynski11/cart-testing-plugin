---
description: Turns a shopping-cart scenario described in plain words into a verified Playwright test, or resumes one by its slug.
argument-hint: "\"<what the shopper does and what to check>\" [--yes] [--dry] [--defects extended] [--risk \"<concern>\"] | <slug>"
allowed-tools: Bash(qa-harness *), Read, Write, Edit, Glob, Grep, Agent
---

# new-test

You run the flow of the `qa` plugin. Your own work is the scenario, the talk with the tester, and reading verdicts.
Code writes the test, the expected amounts and the hashes; agents review and map pages. You never write a test, an
amount, a hash or a verdict, and you never edit `e2e/tests/`, `e2e/support/`, a review or anything under
`e2e/reports/`. Answer in the language of the tester's request; files in the repo are in English.

Read before you start: the formats in `${CLAUDE_PLUGIN_ROOT}/skills/contracts/SKILL.md`, the intake pairs and the
confirmation template in `${CLAUDE_SKILL_DIR}/intake.md`, the verdict reactions in `${CLAUDE_SKILL_DIR}/routing.md`, the
readback in `${CLAUDE_SKILL_DIR}/readback.md`.

## When

The tester asks for a new cart test in plain words, or gives the slug of a scenario to continue.

## Input

`$ARGUMENTS`

- A request in quotes, with optional flags: `--yes` (no confirmation question; the confirmation is still shown),
  `--dry` (stop after the dry gates, step 5), `--defects extended` (step 3b), `--risk "<concern>"` (a tester defect).
- Or one slug of an existing `e2e/specs/<slug>.md`: resume (see "Resuming").

## Steps

Every `qa-harness` call prints at most 15 lines and ends `VERDICT: <name>`. After each call read the verdict and look
it up in `routing.md`; continue only on the reaction it gives. Run calls one at a time, in the foreground, and never
repeat a call whose premise has not changed. `run` and `verify` open a browser and take minutes: give those Bash
calls `timeout: 600000`. Call agents in the foreground and wait for their answer.

0. **Preflight.** `qa-harness doctor`. If it says setup has not run, tell the tester to run
   `/qa:setup <app> <base-url>` and stop. Read `e2e/qa.config.json` (`app`, `priceSource`, `defects`) and
   `e2e/app/<app>.pricing.ts` (labels, rules, constraints, provenance) for the confirmation.
1. **Intake** (`intake.md`). Split the request into clauses; map each action to `add`, `setQty` or `remove`; refuse
   an action outside the grammar or the scope, naming the missing feature, before writing anything. When the request
   leaves open something that changes what the test proves, write nothing and ask: your answer is at most three
   lines and its last line is one question. "The total" is not open: it is the row the rules file labels as the
   total, after every rule in force; ask only when the request names another amount or contradicts itself. Pick products and quantities by the pairs in `intake.md`. Choose a slug:
   short, lowercase, hyphens, unique in `e2e/specs/`.
2. **Scenario.** Write `e2e/specs/<slug>.md` with `status: draft`, `request` verbatim, `cart_after` after every step,
   `check: each-step` unless the request names other checkpoints. Run `qa-harness example <slug>`. On `SPEC_INVALID`
   fix the rules it names and run it again; if a fix would change the meaning, ask the tester instead. Two fixes at
   most, then stop with the violations.
3. **Confirmation.** With `--risk "<concern>"`: express the concern as one entry with `"origin": "tester"` in
   `e2e/specs/<slug>.defects.json` (format in contracts). Run `qa-harness defects check <slug>`, with `--extended` when
   `--defects extended` was given; fix a rejected entry once, or report it as a risk no operator covers. Fill the
   template of `intake.md` from the `example` output, the first line of `defects check` (verbatim) and the rules file,
   listing every choice you made. Without `--yes`: show it, ask "Confirm? (ok / correction)" and end your turn; on "ok"
   continue, on a correction go back to step 2. With `--yes`: the text of the message that calls
   `qa-harness example <slug> --confirm` is the filled template, its last line "Confirmed by --yes."; `--yes` skips
   the question, never the confirmation. Then `qa-harness example <slug> --confirm`.
3a. **Intent review.** Run `qa-harness intent <slug>`; if it ends `PASS`, the review is current: go on. Otherwise call
   the Agent tool with `subagent_type: "qa:test-verifier"` and this prompt, nothing from the conversation:
   `mode: intent` / `slug: <slug>` / `request (verbatim): <the tester's words>` / `root: e2e`.
   Its last line is its verdict. `INTENT_OK`: run `qa-harness intent <slug>` again and go on only on `PASS`.
   `REWORK`: apply the finding to the scenario, set `status: draft`, and repeat from step 2 with a new confirmation;
   after two `REWORK` rounds stop. `NEEDS_TESTER`: ask its question and stop.
3b. **Additional defects.** Only with `--defects extended` or `"defects": "extended"` in the config: call
   `qa:defect-designer` with `slug`, the request verbatim and `root: e2e`; it keeps the tester entry of step 3.
4. **Compilation.** `qa-harness compile <slug>`, only after `qa-harness intent <slug>` ended `PASS`.
5. **Dry gates.** `qa-harness run <slug> --dry`. With `--dry`: stop here and give the dry readback.
6. **Driver.** `qa-harness need <slug>`. `PASS`: skip. Otherwise call `qa:app-mapper` with `mode: build`, `slug`,
   the missing actions exactly as `need` printed them and `root: e2e`. Its last line is `VERDICT: PASS`,
   `NEEDS_TESTER` (ask its question, stop) or `UNDETERMINED` (stop). Then `qa-harness need <slug>` again.
7. **Live run.** `qa-harness run <slug>` (after a driver repair: `qa-harness run <slug> --repair driver`).
8. **Verification.** Call `qa:test-verifier` with `mode: run` / `slug: <slug>` / `request (verbatim): …` / `root: e2e`.
   `VERIFIED` with a run id: `qa-harness report <slug> --promote <runId>`. Any other verdict: `routing.md`.
9. **Readback.** By `readback.md`, filled only from command output and the files it names.

## Resuming

`/qa:new-test <slug>` starts at the first missing or stale artifact; steps 4–6 are cheap and always run again.

| State found | Start at |
| --- | --- |
| `e2e/specs/<slug>.md` missing | step 1 (ask for the request: a slug alone is not one) |
| `status: draft`, or `doctor` reports `SCENARIO_CHANGED` for the slug | step 2 (`--yes` covers the confirmation only when given again) |
| `qa-harness intent <slug>` does not end `PASS` | step 3a |
| no promoted run, or `doctor` reports `VERIFICATION_STALE` | step 4 |
| `e2e/reports/<slug>/review.md` exists and `doctor` is `PASS` | step 9 from the promoted files |

## Output

The confirmation of step 3 (also with `--yes`), then the readback of `readback.md`; or one question; or one refusal.
Nothing else.

## Stop

- An ending of `routing.md`, a question, or a refusal ends the turn. Say "could not deliver a verified test" with the
  reason, the last verdict and the run directory whenever no run was promoted.
- Never retry the same call to get a different verdict. Never edit the rules file, a confirmed scenario (only a
  `REWORK` of the intent review reopens it), the test or the harness to turn a verdict green: an amount mismatch is
  the tester's decision.
