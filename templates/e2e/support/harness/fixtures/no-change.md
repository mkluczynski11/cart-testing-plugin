---
id: no-change
title: Setting the quantity a product already has
app: toolshop
status: draft            # draft | confirmed
request: "Add one product, then set its quantity to one. Check the total."
products:
  A: { pick: first-available }
steps:
  - { id: S1, do: add,    product: A, qty: 1, cart_after: { A: 1 } }
  - { id: S2, do: setQty, product: A, qty: 1, cart_after: { A: 1 } }
check: each-step
---
