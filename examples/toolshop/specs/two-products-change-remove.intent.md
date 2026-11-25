---
scenario: two-products-change-remove
scenario_sha256: 31f919ab322c6b4358c19946f2f2f1c7c790fe604b5926b8d7b1985aaf94cfb9
verdict: INTENT_OK
---

# Intent review of two-products-change-remove

The scenario's `request` field equals the request in the prompt word for word.

| # | Clause of the request (verbatim) | Covered by | Object | Finding |
| --- | --- | --- | --- | --- |
| 1 | "Add two different products to the cart." | S1 (add A 1), S2 (add B 1) | A, B (`distinct_from: [A]`) | none |
| 2 | "Change the quantity of one," | S3 (setQty A 1 -> 3) | A | none; the request leaves free which product and which quantity |
| 3 | "then remove the other." | S4 (remove B), after S3 | B, the product whose quantity was not changed | none |
| 4 | "Check that the cart shows the correct total after each change." | `check: each-step`, which puts checkpoints at S1, S2, S3, S4 | every step that changes the cart | none |

Excess: none. S1 and S2 are both adds and so both change the cart. Their checkpoints fall under "after each change".
Finding: none
