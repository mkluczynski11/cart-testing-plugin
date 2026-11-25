---
scenario: three-products-set-remove
scenario_sha256: d1d829e77f23b900d681dcfa4372a9fef451b219dc44d06aded9163fe1ac8881
verdict: INTENT_OK
---

# Intent review of three-products-set-remove

| # | Clause of the request (verbatim) | Covered by | Object | Finding |
| --- | --- | --- | --- | --- |
| 1 | "Add three different products" | S1, S2, S3 (`add`, qty 1 each) | A, B (`distinct_from: [A]`), C (`distinct_from: [A, B]`) | none (qty 1 is a free choice) |
| 2 | "Set the first to 2 units" | S4 (`setQty` 2) | A, the first added (S1) | none |
| 3 | "and the third to 4" | S5 (`setQty` 4) | C, the third added (S3) | none |
| 4 | "Remove the second" | S6 (`remove`) | B, the second added (S2) | none |
| 5 | "Check the total after every change" | `check: each-step`: checkpoints S1, S2, S3, S4, S5, S6 | every step changes the cart; each has a checkpoint, last step S6 included | none |

Request field: equals the prompt's request verbatim.
Order: adds, then set first, set third, then remove second, as in the request.
Excess: none
Finding: none
