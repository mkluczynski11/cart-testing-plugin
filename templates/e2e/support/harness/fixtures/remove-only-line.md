---
id: remove-only-line
title: Removing the only product leaves an empty cart
app: reference
status: draft            # draft | confirmed
request: "Add one product, then remove it. Check that the cart is empty."
products:
  A: { pick: first-available }
steps:
  - { id: S1, do: add,    product: A, qty: 1, cart_after: { A: 1 } }
  - { id: S2, do: remove, product: A,         cart_after: {} }
check: each-step
preconditions: [empty-cart, guest, no-geolocation]
price_source: ui
---
