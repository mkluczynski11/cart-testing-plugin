---
description: Procedure of app-mapper for building missing driver actions from the live page, with evidence in the map.
user-invocable: false
---

# map-app-flow

## When

`new-test` step 6: `qa-harness need <slug>` names actions, product attributes or request bindings the driver lacks.

## Input

`slug`, `root`, the missing items exactly as `need` printed them; `<root>/qa.config.json`; the existing
`<root>/app/<app>.driver.ts` (if any) and `<root>/app/<app>.map.md`; the driver contract in `contracts` (`driver.md`).

## Steps

1. Read the map first: do not rediscover what it already describes. Read the driver to see what exists.
2. For every missing action, in the browser (`mcp__plugin_qa_browser__*`): `browser_navigate` to the page, take a
   `browser_snapshot` before, perform the action, take a snapshot after, and `browser_network_requests` to see what
   the action sent. Stay on the application's origin, in the catalog and the cart; never finalize an order.
3. Choose the locator in this order: the test attribute of the config (`getByTestId`), role with name, label, a
   locator relative to the row that holds the product name. Never positional CSS, CSS classes or XPath.
4. Choose the completion signal: an acknowledgment the application shows in the DOM (a notification, an updated
   counter). A finished request may be an extra condition, never the only one. It is not the expected cart state.
5. Products: `candidates()` in listing order, `productFacts(name)` from the product page (selling price in force,
   availability, the attributes in `provides.attrs`), `addProduct(name, qty)`. No selection logic in the driver. A
   refusal by the application is `PreconditionError` with its raw text.
6. `readCart()`: tell an empty cart from a non-empty one; raw text of every amount; for summary rows the label from
   the same row element as the amount.
7. Record the requests of the quantity change, the removal and the cart read as `controls` bindings
   (`{ method, urlPattern }`, `pricePath` for the line price in the cart body).
8. Write the action into the driver (the contract's types, imports only from `@playwright/test` and
   `../support/core/…`) and the evidence into the map: locator, why, completion signal, requests, pitfalls, date.
9. Run `qa-harness need <slug>`, then `qa-harness doctor`. Repeat steps 2–8 for what is still missing; finish when
   both end `PASS`.

## Output

The driver and the map; the answer of the agent card with `VERDICT: PASS`.

## Stop

An element that is ambiguous or cannot be reached is an uncertainty in the answer, not a guess: end with
`UNDETERMINED` and what is missing. A request to another origin that the browser blocks: name the origin; the tester
adds it to `browserAllowedOrigins` in `qa.config.json`.
