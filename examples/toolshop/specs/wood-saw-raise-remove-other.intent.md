---
scenario: wood-saw-raise-remove-other
scenario_sha256: 621785b3de62ae7d078778e083f5292abc024c07516181f8bd6c6211b6a4a317
verdict: INTENT_OK
---

# Intent review of wood-saw-raise-remove-other

| # | Clause of the request (verbatim) | Covered by | Object | Finding |
| --- | --- | --- | --- | --- |
| 1 | "Add a Wood Saw" | S1 (`add`, qty 1) | A (`by-name`, "Wood Saw") | none |
| 2 | "then two units of the first available product" | S2 (`add`, qty 2) | B (`first-available`; an unnamed pick never selects the named Wood Saw, so B differs from A) | none |
| 3 | "Raise the saw to three units" | S3 (`setQty`, 3; A goes 1 -> 3) | A (the saw) | none |
| 4 | "then remove the other product" | S4 (`remove`) | B (the non-saw product) | none |
| 5 | "Check the total after each change." | `check: each-step`: checkpoints after S1, S2, S3, S4 (all four steps change the cart) | total at S1-S4 | none |

Order: S1 -> S2 -> S3 -> S4 follows "Add ..., then ... Raise ..., then remove ...". The request field equals the
tester's words verbatim; the example's cart states (A×1; A×1, B×2; A×3, B×2; A×3) match the clauses.

Excess: none (preconditions `empty-cart`, `guest`, `no-geolocation` and `price_source: ui` are defaults the request
leaves free; they add no step or checkpoint)
Finding: none
