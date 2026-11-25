---
id: wood-saw-raise-remove-other
title: The cart total is correct after adding a Wood Saw and two units of another product, raising the saw to three and removing the other product
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

A guest adds one Wood Saw, then two units of the first available product other than the Wood Saw, changes the
quantity of the Wood Saw to 3, then removes the other product. The cart state and the total are checked after every
step.
