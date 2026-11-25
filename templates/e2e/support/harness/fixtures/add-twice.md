---
id: add-twice
title: Adding the same product twice accumulates the quantity
app: reference
status: draft            # draft | confirmed
request: "Add two units of a product, then add two more of the same product. Check the total after each add."
products:
  A: { pick: first-available }
steps:
  - { id: S1, do: add, product: A, qty: 2, cart_after: { A: 2 } }
  - { id: S2, do: add, product: A, qty: 2, cart_after: { A: 4 } }
check: each-step
preconditions: [empty-cart, guest, no-geolocation]
price_source: ui
---
