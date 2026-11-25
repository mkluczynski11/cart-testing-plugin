---
id: cart-eco-threshold
title: Eco discount follows the share of A- or B-rated units through add, quantity change and remove
app: toolshop
status: confirmed            # draft | confirmed
request: "Add a Wood Saw, then two units of the first available product. Raise the saw to three units, then remove the other product. Check after each change that the eco discount applies exactly when more than half of the units are rated A or B, and that the total is correct."
products:
  A: { pick: by-name, name: "Wood Saw" }
  B: { pick: first-available }
steps:
  - { id: S1, do: add,    product: A, qty: 1, cart_after: { A: 1 } }
  - { id: S2, do: add,    product: B, qty: 2, cart_after: { A: 1, B: 2 } }
  - { id: S3, do: setQty, product: A, qty: 3, cart_after: { A: 3, B: 2 } }
  - { id: S4, do: remove, product: B,         cart_after: { A: 3 } }
check: each-step         # each-step | last-step | [S2, S4]
preconditions: [empty-cart, guest, no-geolocation]
price_source: ui         # ui | api
---

The Wood Saw is rated B; the other product is the first available one in the listing. Units rated A or B:
1 of 1 after S1 (discount), 1 of 3 after S2 (none), 3 of 5 after S3 (discount), 3 of 3 after S4 (discount).
