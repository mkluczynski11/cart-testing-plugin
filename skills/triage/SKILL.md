---
description: Diagnoses a red or failing cart test, or a request to change its expected total, and routes it to a driver repair or to the tester.
argument-hint: "<slug>"
allowed-tools: Bash(qa-harness *), Read, Glob, Grep, Agent
---

# triage

Answer in the language of the tester. Triage never changes the scenario, the rules file or the expected values.

## When

A test that was green is red, typically after a release of the application.

## Input

`$ARGUMENTS`: one slug of `e2e/specs/<slug>.md`.

## Steps

0. A request to change an expected amount, or to make a test pass by changing what it expects, is not done: expected
   amounts come only from the confirmed scenario and the rules file (R5, R6). Answer in at most four lines: what was
   expected and what was displayed as the tester reported it, and end with one question: is the displayed amount an
   application bug, or does a pricing rule apply that the application's rules file in `e2e/app/` does not have (if so, state it in
   one sentence: condition and amount)? Run nothing and stop.
1. `qa-harness run <slug>` (Bash `timeout: 600000`) reproduces the failure in a new run directory. Never reuse an
   old one.
2. Read the verdict and react by the routing table of `new-test`
   (`${CLAUDE_PLUGIN_ROOT}/skills/new-test/routing.md`), which is the only place reactions are defined:
   - a failing driver (`LOCATOR_FAIL`, or `FLAKY` with action failures) goes to `app-mapper` as that file says, then
     `qa-harness run <slug> --repair driver`; repeat only while the harness admits the attempt (R9);
   - `ORACLE_MISMATCH`: prepare a draft bug report from the run directory: the steps, the expected value with its
     composition, the displayed raw text and its row, the screenshot path (`S<n>.png`) and the trace path
     (`artifacts/`), all copied from `run` output and `run.json`;
   - `UNMODELED_ADJUSTMENT`: the adjustment's label and amount as displayed, and one question about the rule;
   - `FLAKY`: run `qa-harness run <slug>` once more to see the distribution (each run has `repeat` repeats), then
     report the distribution of results by class;
   - `PASS`: say the failure did not reproduce, with the run directory.
3. After a repair that ends `PASS`, the driver changed: tell the tester to run `/qa:verify <slug>` (R7).
4. When the evidence does not settle the cause, the answer is `UNDETERMINED` with the collected material: the run
   directories, the verdicts and the evidence lines.

## Output

At most 12 lines: the verdict, what was done (repairs with their run directories), the material for the tester
(bug report draft or question), what to run next. Amounts and texts only as the harness printed them.

## Stop

On any ending of the routing table, on `UNDETERMINED`, or when R9 stops the repairs.
