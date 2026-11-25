---
scenario: wood-saw-raise-remove-other
run: 20261125T113257Z-498e
verdict: VERIFIED
---

# Review of run 20261125T113257Z-498e

| Gate | Result | Evidence |
| --- | --- | --- |
| Intent | current INTENT_OK | specs/wood-saw-raise-remove-other.intent.md, scenario_sha256 0b5550fe6e88 (equals verification.json intentSha256) |
| G0–G2 | PASS | stub prices: 11 detected where expected / 0 late / 0 missed / 2 not applicable (rule-boundary, round-down); live prices (Wood Saw 12.18, Combination Pliers 14.15): 12 detected / 0 late / 0 missed / 1 not applicable (rule-boundary) |
| G3 | PASS | 3/3 repeats passed on https://practicesoftwaretesting.com |
| G4 | PASS | 4 caught / 0 missed / 0 not bound; each activated, with target and value shown at the read: skew-total red at S1 (+$0.01 at every checkpoint), drift-price red at S1, lost-update red at S3, lost-remove red at S4, each at its expected step |
| G5 | PASS | report.md names the action at S1–S4 in the tester's terms (add Wood Saw 1, add Combination Pliers 2, set Wood Saw to 3, remove Combination Pliers), the expected amount with its composition (subtotal and eco-discount), the displayed raw text and the row label "Total", screenshots S1–S4, and states what is not available (review.md at report time). S4.png shows Total $34.71 = $36.54 − $1.83, matching the report. |

Test origin: compiled (no step-by-step comparison needed; G0 confirms the untouched compilation of the confirmed scenario).

Scenario gaps and the hint that closes each:
- rule-boundary (not applicable with stub and live prices): the eco-discount applies when more than half of the units are A/B-rated. To test the edge, add a step where exactly half of the units in the cart are A/B-rated, e.g. set the Wood Saw to two units while two units of the other product (not A/B-rated) are in the cart, and check the total there.
- round-down: not applicable on the stub prices only; detected at S1 on the live prices of this run, so no change is needed for these products.

Finding: none
