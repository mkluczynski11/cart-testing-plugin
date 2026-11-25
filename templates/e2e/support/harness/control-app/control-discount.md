---
id: control-discount
title: The control page grants its discount from a subtotal of 50,00 €
app: control
status: draft            # draft | confirmed
request: "Add three units of the first product and check the total."
products:
  A: { pick: first-available }
steps:
  - { id: S1, do: add, product: A, qty: 3, cart_after: { A: 3 } }
check: each-step
preconditions: [empty-cart, guest, no-geolocation]
price_source: ui
---
