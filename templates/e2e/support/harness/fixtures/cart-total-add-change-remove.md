---
id: cart-total-add-change-remove
title: Cart total stays correct after add, quantity change and remove
app: reference
status: draft            # draft | confirmed
request: "Add two different products to the cart. Change the quantity of one, then remove the other. Check that the cart shows the correct total after each change."
products:
  A: { pick: first-available }
  B: { pick: next-available, distinct_from: [A] }
steps:
  - { id: S1, do: add,    product: A, qty: 1, cart_after: { A: 1 } }
  - { id: S2, do: add,    product: B, qty: 1, cart_after: { A: 1, B: 1 } }
  - { id: S3, do: setQty, product: A, qty: 3, cart_after: { A: 3, B: 1 } }
  - { id: S4, do: remove, product: B,         cart_after: { A: 3 } }
check: each-step         # each-step | last-step | [S2, S4]
preconditions: [empty-cart, guest, no-geolocation]
price_source: ui
---

Two different products go into the cart. The quantity of the first changes to 3, then the second
is removed. The cart total is checked after every step.
