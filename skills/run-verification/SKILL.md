---
description: Procedure of test-verifier for step 8, running gates G0-G4 afresh and reviewing the test's report (G5).
user-invocable: false
---

# run-verification

## When

Step 8 of `new-test`, and `/qa:verify`: a test exists and has run live. You get `slug`, `request (verbatim)`, `root`.

## Input

The scenario, the example and the intent review in `<root>/specs/`, the test `<root>/tests/<slug>.spec.ts`, and the
run directory that `qa-harness verify <slug>` creates: `run.json`, `verification.json`, `report.md`.

## Steps

1. Run `qa-harness intent <slug>`. Unless it ends `PASS` the intent review is missing or stale: stop with
   `REWORK`, addressee the scenario ("intent review missing or stale for the confirmed scenario").
2. Run `qa-harness verify <slug>` once. It computes G0–G4 from scratch in a new run directory and prints its path
   (`Evidence: reports/<slug>/runs/<runId>/`). Read that directory's `verification.json` and `report.md`.
3. If `verify` did not end `PASS`, read its verdict and the evidence lines it printed, and classify by the routing of
   `new-test` (`${CLAUDE_PLUGIN_ROOT}/skills/new-test/routing.md`), `CONTROL_MISSED` and `FLAKY` only by their
   recorded facts:
   - evidence pointing at the driver (`LOCATOR_FAIL`; `FLAKY` with action failures; `CONTROL_MISSED` not activated
     for a network control, or active and shown with the test green): `REWORK`, addressee `app-mapper`;
   - `DEFECT_LATE`, `DEFECT_MISSED`, `LINT_FAIL`, `CONFORMANCE_FAIL` on an edited test: `REWORK`, addressee
     `tester`, naming the step; on a compiled test: `UNDETERMINED` ("harness bug");
   - `ORACLE_MISMATCH`, `UNMODELED_ADJUSTMENT`, `FLAKY` with amount mismatches, `CONTROL_MISSED` of `skew-total` not
     activated: `NEEDS_TESTER` with the one question of the routing table;
   - `INFRA_FAIL`, `PRECONDITION_FAIL`, `NO_TESTS_RUN`, anything without evidence for an owner: `UNDETERMINED`
     with what is missing.
4. Defects (`verification.json` `defects[]`): every result other than `detected` and `not-applicable` is a finding.
   For every scenario gap write one hint in the tester's words: which change to the scenario would close it.
5. Live controls (`controls[]`): read the four facts (activated, target, shown at the read, reacted at) and nothing
   else; a missing binding is lower coverage, say so.
6. Stability: G3 must have all repeats agreeing (`gates.G3` and the repeat counts in `report.md`).
7. Test origin (`testOrigin`): `compiled` needs no comparison with the scenario. `edited`: compare the test with the
   scenario step by step (calls, order, products, quantities, checkpoints); every difference is a finding for the
   tester, naming the step (e.g. "no checkTotal after S3").
8. G5, the report: at every checkpoint `report.md` names the action in the tester's words, shows the expected value
   with its composition and the displayed raw text with the row's label, and says which evidence exists and which
   does not. A missing element is a finding for the tester.
9. Write `review.md` into that run directory in the format of `contracts` (`reviews.md`).

## Output and verdict

- `VERIFIED`: intent current and `INTENT_OK`, `verify` ended `PASS`, no finding in steps 4–8.
- Always end with `RUN: <runId>` and `HARNESS: <the verdict verify printed>` after the verdict line.
- `REWORK` with an addressee: `app-mapper` (driver evidence), `scenario`, or `tester` (an edited test, a report gap).
- `NEEDS_TESTER`: one question (e.g. which row is the total).
- `UNDETERMINED`: the list of what is missing.

## Stop

After writing `review.md` and answering. One `verify` per invocation; never fix anything, never promote a run.
