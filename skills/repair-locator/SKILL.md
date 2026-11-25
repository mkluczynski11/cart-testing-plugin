---
description: Procedure of app-mapper for repairing the one driver action a failed run points at, with the smallest change.
user-invocable: false
---

# repair-locator

## When

After `LOCATOR_FAIL`, or `FLAKY` with action failures, or `CONTROL_MISSED` whose evidence points at the driver (the
routing table of `new-test`). You get `slug`, `root`, the failing action and the run directory.

## Input

The run directory (`run.json`: the failing step and its error message; `artifacts/` traces; `S<n>.png`), the driver,
the map. The run directory is evidence: read it, never change it.

## Steps

1. Read the failing action, its locator in the driver, and the error text in `run.json`.
2. Replay the scenario's steps in the browser (`mcp__plugin_qa_browser__*`) up to the failing action, with snapshots.
3. Compare the page with the evidence in the map: the element disappeared, changed an attribute, is covered, or
   appears later; for a control, the binding no longer matches the request.
4. Make the smallest fix: the locator, the completion signal or the binding of that one action. Nothing else.
5. Update the map entry of that action (what changed, why, date) and run `qa-harness doctor`.
6. Say exactly what changed. The harness rejects a retry without a change to the driver (R9).

## Output

The changed driver and map; the answer of the agent card with `VERDICT: REPAIRED`.

## Stop

`NEEDS_TESTER` in two cases, with one question:

- the repair would read the total or a price from a field with another label than the rules file names, or change
  the label itself: that changes what the test measures (pointing at the row that carries that label is ordinary);
- the locator and the action are right, but the application does not acknowledge the action, or shows text that is
  not an amount where an amount belongs: that is the application's behaviour, not the driver's.

`UNDETERMINED` when the page cannot be reached or the cause stays unclear.
