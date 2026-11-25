---
scenario: wood-saw-raise-remove-other
scenario_sha256: 0b5550fe6e88c543faaefa932bba35a0f45af298aa98c1ede7c6243107ed240e
verdict: INTENT_OK
---

# Intent review of wood-saw-raise-remove-other

The scenario's `request` field equals the tester's request verbatim.

| # | Clause of the request (verbatim) | Covered by | Object | Finding |
| --- | --- | --- | --- | --- |
| 1 | "Add a Wood Saw" | S1 (`add`, qty 1) | A (`pick: by-name, name: "Wood Saw"`) | none |
| 2 | "then two units of the first available product" | S2 (`add`, qty 2) | B (`pick: first-available`; an unnamed pick never selects the named Wood Saw, so B differs from A) | none |
| 3 | "Raise the saw to three units" | S3 (`setQty`, 1 -> 3) | A (the saw) | none |
| 4 | "then remove the other product" | S4 (`remove`) | B (the product that is not the saw) | none |
| 5 | "Check the total after each change." | `check: each-step`: checkpoints after S1, S2, S3, S4 (all four steps change the cart; example.json marks each `checkpoint: true`) | total at every step | none |

Order of steps S1 -> S2 -> S3 -> S4 follows the order of the request.

Excess: none (preconditions empty-cart, guest, no-geolocation and price_source ui are defaults, not extra checks)
Finding: none
