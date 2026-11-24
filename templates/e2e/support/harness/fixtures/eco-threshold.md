---
id: eco-threshold
title: Eco discount applies only when more than half of the units are rated A or B
app: toolshop
status: draft            # draft | confirmed
request: "Add a Wood Saw and a Claw Hammer. Raise the saw to two units, then raise the hammer to three. Check the total after each change."
products:
  A: { pick: by-name, name: "Wood Saw" }
  B: { pick: by-name, name: "Claw Hammer" }
steps:
  - { id: S1, do: add,    product: A, qty: 1, cart_after: { A: 1 } }
  - { id: S2, do: add,    product: B, qty: 1, cart_after: { A: 1, B: 1 } }
  - { id: S3, do: setQty, product: A, qty: 2, cart_after: { A: 2, B: 1 } }
  - { id: S4, do: setQty, product: B, qty: 3, cart_after: { A: 2, B: 3 } }
check: each-step
---
