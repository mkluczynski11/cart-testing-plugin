---
description: Procedure of test-verifier for step 3a, comparing a frozen scenario with the tester's request before compilation.
user-invocable: false
---

# review-intent

## When

Step 3a of `new-test` and `verify`: the scenario is confirmed, the test does not exist yet or must be checked
against it. You get `slug`, `request (verbatim)` and `root`.

## Input

- the request, verbatim, from the prompt;
- `<root>/specs/<slug>.md` (the frozen scenario; its `request` field must equal the prompt's request);
- `<root>/specs/<slug>.example.json` (stubs and the expected cart after every checkpoint);
- the output of `qa-harness intent <slug>`: the confirmed `scenario_sha256`.

## Steps

1. Run `qa-harness intent <slug>`. If the scenario is not confirmed, stop with `UNDETERMINED` ("not confirmed").
2. Read the scenario and the example. If the scenario's `request` differs from the prompt's request, that is a
   finding (`REWORK`, the scenario must quote the tester).
3. Split the request into clauses, verbatim: every action, every object, every expectation (what is checked, when).
4. For each clause point at the step(s) or checkpoint(s) that cover it and at the object: which alias is added,
   which changes quantity and to what, which is removed, which steps have a checkpoint. "Different products" needs
   `distinct_from`; "after each change" needs a checkpoint after every step that changes the cart; "two more" is an
   `add`, "set to two" a `setQty`; "the second" and "the first" are the order the products were added in.
5. Missing coverage, a swapped object or a wrong kind of step is a finding for the scenario.
6. Look for excess: a step or checkpoint no clause asks for and that changes what the test proves. A choice the
   request leaves free (which product, a quantity of 3) is not excess.
7. Write `<root>/specs/<slug>.intent.md` in the format of `contracts` (`reviews.md`), with `scenario_sha256` copied
   exactly from step 1 and one table row per clause.

## Output and verdict

- `INTENT_OK`: every clause covered with the right object, no excess.
- `REWORK`: one finding per line, each saying what the scenario must change (e.g. "S3 changes A; the request changes
  the second product, B").
- `NEEDS_TESTER`: the request itself is ambiguous in a way the scenario cannot settle; one question.

## Stop

After writing the file and answering. You never edit the scenario, the example or the test.
