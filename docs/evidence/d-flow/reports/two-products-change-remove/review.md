---
scenario: two-products-change-remove
run: 20261125T025220Z-a326
verdict: VERIFIED
---

# Review of run 20261125T025220Z-a326

| Gate | Result | Evidence |
| --- | --- | --- |
| Intent | current INTENT_OK | specs/two-products-change-remove.intent.md, scenario_sha256 b292f3cc0f2e (`qa-harness intent` ended PASS) |
| G0–G2 | PASS (`gates.dry`) | stub prices: 12 detected / 0 late / 0 missed / 1 not applicable (round-down); live products (G2live PASS): 9 detected / 0 late / 0 missed / 4 not applicable (rule-never, rule-wrong-rate, rule-boundary, round-down); every detected defect went red at its expected checkpoint |
| G3 | PASS (`gates.G3`) | 3/3 repeats passed; run.json shows the same ledger, expected amount and displayed raw text at S1–S4 in all three repeats ($14.15, $26.16, $54.46, $42.45, row "Total") |
| G4 | PASS (`gates.G4`) | 4 caught / 0 missed / 0 not bound / 0 not applicable. skew-total: activated, target row "Total", read +$0.01 at S1–S4, reacted S1. drift-price: activated, 7 GET /carts/* intercepted, $14.16 read at S1, reacted S1. lost-update: activated, 1 PUT quantity intercepted, $26.16 read at S3, reacted S3. lost-remove: activated, 1 DELETE intercepted, $54.46 read at S4, reacted S4 |
| G5 | PASS (assessment) | report.md names at every checkpoint the action with the product and quantity ("add Combination Pliers, 1 unit", "add Pliers, 1 unit", "set quantity of Combination Pliers to 3", "remove Pliers"), the expected amount with its composition (subtotal, no adjustment), the displayed raw text and the row label "Total", and a screenshot (S1.png–S4.png present and matching); it says what is missing (agent reviews outside the run, HTML report outside the repo). Nothing missing |

Test origin: compiled (no step-by-step comparison needed; header hash b292f3cc… equals the confirmed scenario)

Scenario gaps and the hint that closes each (both products in this run have CO2 rating D, so the eco discount never applied):
- rule-never, rule-wrong-rate: ask for the first product to have CO2 rating A or B (`where: { co2_rating: [A, B] }` on A). After the quantity change (3 of 4 units) and after the removal (3 of 3 units), more than half the units are then eco-rated and the 5% discount must appear.
- rule-boundary: also ask for the second product not to be eco-rated (for example CO2 rating C, `where` on B). After the second add exactly half the units are eco-rated, which is the threshold where the discount must not yet apply. The stub example already assumed this pairing.
- round-down: half cents appear only when the 5% discount applies. The change above may expose truncation, depending on the prices picked. If it does not, choose products or a quantity whose 5% leaves more than half a cent.

Coverage note: no adjustment was in force, so the live total always equalled the subtotal. Only the label-based skew-total control shows that the driver reads the "Total" row and not another field (report.md "Scope").
Minor note: screenshots of repeats 2 and 3 sit under artifacts/…-repeat1 and …-repeat2 (0-based naming). run.json maps them correctly.

Finding: none
