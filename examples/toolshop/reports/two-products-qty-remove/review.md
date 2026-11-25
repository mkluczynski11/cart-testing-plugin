---
scenario: two-products-qty-remove
run: 20261125T101730Z-29d4
verdict: VERIFIED
---

# Review of run 20261125T101730Z-29d4

| Gate | Result | Evidence |
| --- | --- | --- |
| Intent | current INTENT_OK | specs/two-products-qty-remove.intent.md, scenario_sha256 4ffc3a5fde6f (equals `intentSha256` in verification.json) |
| G0–G2 | PASS (`gates.dry`); live G2 PASS (`gates.G2live`) | stub prices: 12 detected / 0 late / 0 missed / 1 not applicable; run products: 9 detected / 0 late / 0 missed / 4 not applicable |
| G3 | PASS | 3 / 3 repeats passed on https://practicesoftwaretesting.com |
| G4 | PASS | 4 caught / 0 missed / 0 not bound; skew-total, drift-price, lost-update, lost-remove each activated, shown at the read, first red at the expected checkpoint (S1, S1, S3, S4) |
| G5 | complete | every checkpoint S1–S4 names the action in shopper words (add Combination Pliers 1 unit, add Pliers 1 unit, set quantity of Combination Pliers to 3, remove Pliers), the expected amount with its composition (subtotal, no adjustment), the displayed raw text and the row label "Total", a screenshot link; the evidence section states what exists and that review.md was not yet part of the run |

Test origin: compiled (no step-by-step comparison needed; G0 confirms the untouched compilation of the confirmed scenario)
Scenario gaps and the hint that closes each:
- rule-never, rule-wrong-rate (not applicable with Combination Pliers and Pliers, both co2_rating D): add or choose products so that more than half of the units have co2_rating A or B at some checkpoint, so the eco-discount is in force.
- rule-boundary: add a step at which exactly half of the units have co2_rating A or B, so the cart sits on the eco-discount threshold.
- round-down: choose products or quantities whose 5% discount gives an amount with a fraction of a cent above one half, so truncation would show.
Note: the total always equalled the subtotal in this run; only the skew-total control (caught) shows that the driver reads the "Total" row and not the subtotal.
Finding: none
