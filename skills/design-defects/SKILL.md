---
description: Procedure of defect-designer for a systematic list of up to eight additional defects a scenario can expose.
user-invocable: false
---

# design-defects

## When

Step 3b of `new-test`, only in `extended` mode: the scenario is confirmed and its intent review is `INTENT_OK`; the
test is not compiled yet, so the list cannot be fitted to what the test happens to detect.

## Input

`slug`, the request verbatim, `<root>/specs/<slug>.md`, `<root>/specs/<slug>.example.json`, the rules file
`<root>/app/<app>.pricing.ts`, the output of `qa-harness defects list <slug>`, the format in `contracts`
(`reviews.md`, "Additional defects").

## Steps

1. **Inventory.** Write down four lists: the steps (kind, target alias); the values shown in the cart (lines,
   adjustments, total); the rules (inputs, rate, threshold); the transitions between consecutive steps.
2. **Subtract the defaults.** Run `qa-harness defects list <slug>`. The defaults break things always and
   unconditionally; your space is conditional and parameterized variants of them.
3. **Lenses.** Ask every inventory item the four questions:

   | Lens | Question | Typical result |
   | --- | --- | --- |
   | Sequence | Can a value fail to refresh only after a particular kind of step? | `stale-value` with `when.afterStep` |
   | Threshold and direction | Can a rule fail to switch on when its threshold is crossed upwards, or off downwards? Does decreasing a quantity behave like increasing it? | `rule-never`, `rule-always` or `no-effect` with `when` |
   | Interaction | Can a rate be computed on the wrong base or cover lines it should not? | `rule-rate` on an adjustment |
   | Identity and repetition | Can an operation hit the wrong line, or fail on a second occurrence? Does removing the last line leave the old total? | `wrong-target`, `no-effect` or `stale-value` with `when` |

4. **Record a candidate**: `id` (kebab-case), `"origin": "generated"`, `operator`, `target` (`{ "value": "total" |
   "subtotal" | "lineTotal" }`, `{ "adjustment": "<rule id>" }` or `{ "step": "add" | "setQty" | "remove" }`),
   optional `when` (`{ "afterStep": "<kind>", "direction": "increase" | "decrease" }`), and `why`: one sentence on the
   effect the shopper would see.
5. **Select at most 8.** First the defects this scenario actually exposes (a step of that kind exists, the rule's
   condition changes), then the largest effect on the total; at most 2 per lens.
6. **Admission.** Write `<root>/specs/<slug>.defects.json` (keep entries with `"origin": "tester"` that are already
   there) and run `qa-harness defects check <slug>`. Fix or drop each rejected entry once and check again.
7. **Result.** The file and the answer of the agent card.

## Output

`specs/<slug>.defects.json` and the counts per lens, the rejected entries with reasons, the concerns that no
operator can express (they go into the report as uncovered risks).

## Stop

An empty list is a valid result: never pad up to the limit. Stop after the second `defects check`.
