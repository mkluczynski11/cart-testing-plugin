---
scenario: two-products-qty-remove
scenario_sha256: 4ffc3a5fde6fab989fda5a809fd4e5021d38bda9d031930f38d85bdc5d43dcce
verdict: INTENT_OK
---

# Intent review of two-products-qty-remove

| # | Clause of the request (verbatim) | Covered by | Object | Finding |
| --- | --- | --- | --- | --- |
| 1 | "Add two different products to the cart." | S1, S2 (`add`, qty 1 each) | A (`first-available`), B (`next-available`, `distinct_from: [A]`) | none |
| 2 | "Change the quantity of one," | S3 (`setQty` 1 -> 3) | A | none; the product and the new quantity 3 are free choices of the request |
| 3 | "then remove the other." | S4 (`remove`), after S3 | B, the product whose quantity was not changed | none |
| 4 | "Check that the cart shows the correct total after each change." | `check: each-step`: checkpoints at S1, S2, S3, S4 | every step changes the cart (two adds, one setQty, one remove), each has a checkpoint | none |

The scenario's `request` field equals the request in the prompt verbatim.

Excess: none (the checkpoints after the two adds are changes to the cart and fall under clause 4; the quantity 3 and the choice of A are free choices)
Finding: none
