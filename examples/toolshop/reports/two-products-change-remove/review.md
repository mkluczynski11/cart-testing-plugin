---
scenario: two-products-change-remove
run: 20261125T123349Z-fee3
verdict: VERIFIED
---

# Review of run 20261125T123349Z-fee3

| Gate | Result | Evidence |
| --- | --- | --- |
| Intent | current INTENT_OK | specs/two-products-change-remove.intent.md, scenario_sha256 fc04e8abb98b; intentSha256 in verification.json equals it |
| G0–G2 | PASS | stub prices: 12 detected / 0 late / 0 missed / 1 not applicable (round-down); live prices (A = Combination Pliers 14.15, B = Pliers 12.01): 9 detected / 0 late / 0 missed / 4 not applicable |
| G3 | PASS | 3/3 repeats passed on https://practicesoftwaretesting.com |
| G4 | PASS | 4 caught / 0 missed / 0 not bound; skew-total activated on row "Total", red at S1 (+$0.01 at every checkpoint); drift-price activated on GET **/carts/*, red at S1; lost-update activated on PUT .../product/quantity, red at S3; lost-remove activated on DELETE .../product/*, red at S4 |
| G5 | PASS | at S1–S4 report.md names the action in the tester's words (add Combination Pliers 1 unit, add Pliers 1 unit, set quantity of Combination Pliers to 3, remove Pliers), the expected total with its composition ("Rows read": subtotal only, eco-discount not in force), the displayed raw text, the row read ("Total", Page driver and Rows read), one screenshot per step; it states the HTML report stays outside the repo; no traces exist because no repeat failed |

Test origin: compiled (no step-by-step comparison needed; G0 confirms the untouched compilation)

Scenario gaps and the hint that closes each:
- rule-never, rule-wrong-rate (live prices): both products picked have co2_rating D, so the eco-discount never applies. Add a step where more than half of the units in the cart have co2_rating A or B, so the discount is in force at a checkpoint.
- rule-boundary (live prices): add a step where the cart sits exactly at the eco-discount threshold, i.e. exactly half of the units are rated A or B.
- round-down (stub and live prices): no amount at a checkpoint has a fraction of a cent above one half; choose other products or quantities whose amounts would expose truncation, for example when the discount is in force.

Finding: none
