---
scenario: two-products-change-remove
scenario_sha256: fc04e8abb98b8e8f35f48f41ab7abf195f69614d81990a297d3013e0917984fd
verdict: INTENT_OK
---

# Intent review of two-products-change-remove

| # | Clause of the request (verbatim) | Covered by | Object | Finding |
| --- | --- | --- | --- | --- |
| 1 | "Add two different products to the cart." | S1, S2 (`add`, qty 1 each) | A, B (`distinct_from: [A]`) | none |
| 2 | "Change the quantity of one," | S3 (`setQty` 1 -> 3) | A | none |
| 3 | "then remove the other." | S4 (`remove`), after S3 | B (the product not changed in S3) | none |
| 4 | "Check that the cart shows the correct total after each change." | `check: each-step`: checkpoints at S1, S2, S3, S4 | total after every step that changes the cart | none |

Excess: none (checkpoints after the two adds are also changes to the cart; quantity 3 and which product is changed are free choices)
Finding: none
