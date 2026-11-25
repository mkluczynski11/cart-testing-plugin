---
id: wood-saw-qty-remove-other
title: Wood Saw and two units of another product, raise the saw to three, remove the other; total checked after each step
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

The shopper adds one Wood Saw (A), then two units of the first available other product (B), raises the
Wood Saw to three units, then removes B. The cart state and total are checked after every step.
