---
scenario: three-products-set-remove
run: 20261125T025707Z-5ccd
verdict: VERIFIED
---

# Review of run 20261125T025707Z-5ccd

| Gate | Result | Evidence |
| --- | --- | --- |
| Intent | current INTENT_OK | specs/three-products-set-remove.intent.md, scenario_sha256 d1d829e77f23 (`qa-harness intent` PASS) |
| G0–G2 | PASS | stub prices: 12 detected / 0 late / 0 missed / 1 not applicable (round-down); live products (Combination Pliers 14.15, Pliers 12.01, Bolt Cutters 48.41): 9 detected / 0 late / 0 missed / 4 not applicable (rule-never, rule-wrong-rate, rule-boundary, round-down) |
| G3 | PASS | 3/3 repeats passed; displayed totals identical in all three repeats: S1 $14.15, S2 $26.16, S3 $74.57, S4 $88.72, S5 $233.95, S6 $221.94 |
| G4 | PASS | 4 caught / 0 missed / 0 not bound; all activated. skew-total: row "Total", read +$0.01 at every checkpoint, first red S1; drift-price: GET /carts/* 11 intercepted, read $14.16 vs $14.15, first red S1; lost-update: PUT quantity 2 intercepted, read $74.57 vs $88.72, first red S4; lost-remove: DELETE product 1 intercepted, read $233.95 vs $221.94, first red S6. Each first red equals the expected step |
| G5 | PASS | At S1–S6 report.md names the action ("add Combination Pliers, 1 unit", "add Pliers, 1 unit", "add Bolt Cutters, 1 unit", "set quantity of Combination Pliers to 2", "set quantity of Bolt Cutters to 4", "remove Pliers"), the expected amount with its composition (total = subtotal, no adjustment), the displayed raw text and the row label "Total", the result and a screenshot; S1.png–S6.png exist and show the same totals. The Evidence section states what exists and what is not available (agent reviews). Limits, not gaps: the composition stops at subtotal level (the per-line breakdown comes from the Products table and the action); the table shows repeat 1 only (repeats 2–3 are in run.json) |

Test origin: compiled (verification.json `testOrigin`; G0 confirms the untouched compilation of the confirmed scenario), so no step-by-step comparison is needed.

Scenario gaps and the hint that closes each:
- rule-never and rule-wrong-rate (the eco discount is never in force: all three live products have CO2 rating D): if the eco discount should be covered, ask for the first product to have CO2 rating A or B. The discount then applies after the first add (1 of 1 unit).
- rule-boundary (the cart never sits exactly at the eco threshold): the same request puts the cart at exactly half of the units after the second add (1 of 2) and after setting the first to 2 units (2 of 4).
- round-down (no amount has a fraction of a cent above one half): without a percentage discount every amount is a whole cent. With the eco discount in force, products whose 5% leaves more than half a cent would expose truncation; otherwise this stays not applicable.

Scope note (from report.md): at every checkpoint the live total equalled the subtotal. The live run alone does not prove that the driver reads the "Total" row. The skew-total control proves it, and it was caught at every checkpoint.

Finding: none
