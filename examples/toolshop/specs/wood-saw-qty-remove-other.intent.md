---
scenario: wood-saw-qty-remove-other
scenario_sha256: 9b537caaa7c2df6d45a9e97ab31612cfca02c12c945cb389ad9b2e094a4c3cfb
verdict: INTENT_OK
---

# Intent review of wood-saw-qty-remove-other

The scenario's `request` field equals the request word for word.

| # | Clause of the request (verbatim) | Covered by | Object | Finding |
| --- | --- | --- | --- | --- |
| 1 | "Add a Wood Saw" | S1 (`add`, qty 1) | A (`by-name: "Wood Saw"`) | none |
| 2 | "then two units of the first available product" | S2 (`add`, qty 2) | B (`first-available`; an unnamed pick never selects the named Wood Saw, so B differs from A) | none |
| 3 | "Raise the saw to three units" | S3 (`setQty`, qty 3) | A (the Wood Saw), 1 -> 3 | none |
| 4 | "then remove the other product" | S4 (`remove`) | B (the product that is not the saw) | none |
| 5 | "Check the total after each change." | `check: each-step`, checkpoints at S1, S2, S3, S4 | every step changes the cart, each has a checkpoint | none |

Excess: none
Finding: none
