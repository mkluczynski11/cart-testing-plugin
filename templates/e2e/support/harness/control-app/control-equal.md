---
id: control-equal
title: The control page keeps the total correct while it equals the subtotal
app: control
status: draft            # draft | confirmed
request: "Add two different products, raise the second to two units, remove the first, and check the total after each change."
products:
  A: { pick: first-available }
  B: { pick: next-available, distinct_from: [A] }
steps:
  - { id: S1, do: add,    product: A, qty: 1, cart_after: { A: 1 } }
  - { id: S2, do: add,    product: B, qty: 1, cart_after: { A: 1, B: 1 } }
  - { id: S3, do: setQty, product: B, qty: 2, cart_after: { A: 1, B: 2 } }
  - { id: S4, do: remove, product: A,         cart_after: { B: 2 } }
check: each-step
preconditions: [empty-cart, guest, no-geolocation]
price_source: ui
---
