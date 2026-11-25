---
scenario: two-products-change-remove
scenario_sha256: b292f3cc0f2e653fda45b5d82d1a0dd6054717321efefd5ca45ad65fbced0eca
verdict: INTENT_OK
---

# Intent review of two-products-change-remove

| # | Clause of the request (verbatim) | Covered by | Object | Finding |
| --- | --- | --- | --- | --- |
| 1 | "Add two different products to the cart." | S1 (add A 1), S2 (add B 1) | A (`first-available`), B (`next-available`, `distinct_from: [A]`) | none |
| 2 | "Change the quantity of one," | S3 (setQty A 1 -> 3) | A | none (which product and the new quantity 3 are free choices) |
| 3 | "then remove the other." | S4 (remove B), after S3 | B, the product whose quantity was not changed | none |
| 4 | "Check that the cart shows the correct total after each change." | `check: each-step`: checkpoints at S1, S2, S3, S4 | total after every step; each step changes the cart | none |

Excess: none (the checkpoints at S1 and S2 follow cart changes, the adds, so "after each change" asks for them)
Finding: none
