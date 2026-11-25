# Report G — what the tester reads: confirmation and readback

## Plan

Time box 70 minutes from `Wed Nov 25 12:15:20 UTC 2026`; stage 4 by 12:55, report from 13:15.

0. Workspace: branch check, commit the order, `npm ci` in `templates/e2e`, baseline of the order F checks.
1. Confirmation (design 11.1). `qa-harness example` words products as `A = Product A, $10.00, co2_rating A` and rules
   without "of the running value" for the first rule, shares as "half", "a third", "a quarter" or a percentage, and
   prints one `Source:` line from the provenance without the file reference. `report.md` uses the same rule wording.
   `skills/new-test/intake.md`: "total" is the row the rules file labels as the total, no question; the confirmation
   says so under "Plugin's choice"; the calibration row that asked is replaced by one that asks only for "subtotal",
   "price before discount" or a contradiction. Level A cases touched by the new default. Unit tests first.
2. Readback (design 11.2). `report.md` starts with the readback form of the order (verdict heading, header table,
   Steps, Verification of the test, Not covered, Pricing rules, Page driver, Files, Run it again); on a red run the
   failing step comes directly under the verdict. Facts the harness did not print yet go into `run.json` (driver
   file, its sha256, its origin: starter pack recorded by setup, repaired by `--repair driver`, otherwise built or
   changed after setup; the driver operations the scenario uses; the browser). `readback.md`: the readback is the
   form part of `report.md`, copied verbatim; the dry, mismatch and stopped readbacks take the same headings. Unit
   tests first.
3. Neutral names in `unit/defects-table.spec.ts`, `unit/` in the neutrality check; `evals/run.mjs` `transcript()`
   keeps the first entry of a tool call, with a test in `scripts/` on a recorded transcript; all level A cases once.
4. Live: setup, the reference request without `--yes` (ends at "Confirm?" with no discount question), resumed with
   `--yes`, the Wood Saw request with `--yes`; rebuild `examples/toolshop/`; README "Result", `docs/reference.md`,
   design 18.
5. Exit checks, report, one commit per stage.

