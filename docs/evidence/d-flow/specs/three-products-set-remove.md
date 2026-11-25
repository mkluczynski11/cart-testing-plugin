---
id: three-products-set-remove
title: Cart total after adding three products, setting the quantities of the first and third and removing the second
app: toolshop
status: confirmed
request: "Add three different products. Set the first to 2 units and the third to 4. Remove the second. Check the total after every change."
products:
  A: { pick: first-available }
  B: { pick: next-available, distinct_from: [A] }
  C: { pick: next-available, distinct_from: [A, B] }
steps:
  - { id: S1, do: add,    product: A, qty: 1, cart_after: { A: 1 } }
  - { id: S2, do: add,    product: B, qty: 1, cart_after: { A: 1, B: 1 } }
  - { id: S3, do: add,    product: C, qty: 1, cart_after: { A: 1, B: 1, C: 1 } }
  - { id: S4, do: setQty, product: A, qty: 2, cart_after: { A: 2, B: 1, C: 1 } }
  - { id: S5, do: setQty, product: C, qty: 4, cart_after: { A: 2, B: 1, C: 4 } }
  - { id: S6, do: remove, product: B,         cart_after: { A: 2, C: 4 } }
check: each-step
preconditions: [empty-cart, guest, no-geolocation]
price_source: ui
---

A guest adds three different products (one unit each), sets the quantity of the first to 2 and of the third to 4,
then removes the second. The cart state and the total are checked after every step.
