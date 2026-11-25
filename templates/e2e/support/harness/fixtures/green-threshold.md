---
id: green-threshold
title: The green discount applies only when more than half of the units are in energy class A or B
app: reference
status: draft            # draft | confirmed
request: "Add a Green Lamp and an Iron Kettle. Raise the lamp to two units, then raise the kettle to three. Check the total after each change."
products:
  A: { pick: by-name, name: "Green Lamp" }
  B: { pick: by-name, name: "Iron Kettle" }
steps:
  - { id: S1, do: add,    product: A, qty: 1, cart_after: { A: 1 } }
  - { id: S2, do: add,    product: B, qty: 1, cart_after: { A: 1, B: 1 } }
  - { id: S3, do: setQty, product: A, qty: 2, cart_after: { A: 2, B: 1 } }
  - { id: S4, do: setQty, product: B, qty: 3, cart_after: { A: 2, B: 3 } }
check: each-step
preconditions: [empty-cart, guest, no-geolocation]
price_source: ui
---
