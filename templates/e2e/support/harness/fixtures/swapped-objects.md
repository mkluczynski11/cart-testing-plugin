---
id: swapped-objects
title: Cart total stays correct when the second product changes and the first is removed
app: toolshop
status: draft            # draft | confirmed
request: "Add two different products. Change the quantity of the second, then remove the first. Check the total after each change."
products:
  A: { pick: first-available }
  B: { pick: next-available, distinct_from: [A] }
steps:
  - { id: S1, do: add,    product: A, qty: 1, cart_after: { A: 1 } }
  - { id: S2, do: add,    product: B, qty: 1, cart_after: { A: 1, B: 1 } }
  - { id: S3, do: setQty, product: B, qty: 3, cart_after: { A: 1, B: 3 } }
  - { id: S4, do: remove, product: A,         cart_after: { B: 3 } }
check: each-step
---
