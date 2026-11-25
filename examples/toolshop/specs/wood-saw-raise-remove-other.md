---
id: wood-saw-raise-remove-other
title: Wood Saw and two units of another product, saw raised to three, other product removed, total checked after each step
app: toolshop
status: confirmed
request: "Add a Wood Saw, then two units of the first available product. Raise the saw to three units, then remove the other product. Check the total after each change."
products:
  A: { pick: by-name, name: "Wood Saw" }
  B: { pick: first-available }
steps:
  - { id: S1, do: add,    product: A, qty: 1, cart_after: { A: 1 } }
  - { id: S2, do: add,    product: B, qty: 2, cart_after: { A: 1, B: 2 } }
  - { id: S3, do: setQty, product: A, qty: 3, cart_after: { A: 3, B: 2 } }
  - { id: S4, do: remove, product: B,         cart_after: { A: 3 } }
check: each-step
preconditions: [empty-cart, guest, no-geolocation]
price_source: ui
---

A guest adds one Wood Saw, then two units of the first available other product, raises the saw to three units,
then removes the other product. The cart total is checked after every step.
