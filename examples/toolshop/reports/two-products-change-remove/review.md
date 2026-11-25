---
scenario: two-products-change-remove
run: 20261125T112933Z-b685
verdict: VERIFIED
---

# Review of run 20261125T112933Z-b685

| Gate | Result | Evidence |
| --- | --- | --- |
| Intent | current INTENT_OK | specs/two-products-change-remove.intent.md, scenario_sha256 31f919ab322c (equals intentSha256 in verification.json) |
| G0–G2 | PASS | stub prices: 12 detected / 0 late / 0 missed / 1 not applicable; live prices (A = Combination Pliers 14.15, B = Pliers 12.01): 9 detected / 0 late / 0 missed / 4 not applicable |
| G3 | PASS | 3/3 repeats passed on https://practicesoftwaretesting.com |
| G4 | PASS | 4 caught / 0 missed / 0 not bound: skew-total activated, row "Total", read +$0.01 at S1–S4, red at S1; drift-price activated (7 GET /carts/* intercepted), red at S1; lost-update activated (1 PUT quantity), red at S3; lost-remove activated (1 DELETE), red at S4 |
| G5 | PASS | at S1–S4 report.md names the action in the tester's words (add, set quantity to 3, remove), the expected amount with its composition (subtotal), the displayed raw text and the row label "Total", a screenshot link; it lists the evidence present and states review.md as not yet available |

Test origin: compiled (no step-by-step comparison needed; G0 confirms the untouched compilation)

Scenario gaps and the hint that closes each:
- rule-never, rule-wrong-rate (live prices only): the products picked have co2_rating D, so eco-discount is never in force. Ask for at least one product with CO2 rating A or B (e.g. `where: { co2_rating: [A, B] }` on a pick) so that more than half the units qualify at some checkpoint.
- rule-boundary (live prices only): add a state in which exactly half of the units have CO2 rating A or B (e.g. one qualifying and one non-qualifying unit) so the "more than 0.5" threshold is tested at its edge.
- round-down (stub and live): no checkpoint amount has a sub-cent fraction above one half; a step where eco-discount (5%) applies to a suitable subtotal, or other quantities, would expose truncation.

Scope note (not a finding): in this run the total always equalled the subtotal, so only the skew-total control shows the driver reads the "Total" row; that control was activated and caught.

Finding: none
