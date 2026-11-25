# The cart total is correct after adding two products, changing the quantity of one and removing the other

**PASS 3/3** · scenario `two-products-change-remove` · run `20261125T112933Z-b685` · 2026-11-25T11:29:35Z · https://practicesoftwaretesting.com · Chromium, en-US

The tester asked: "Add two different products to the cart. Change the quantity of one, then remove the other. Check that the cart shows the correct total after each change."

## Products

| Alias | Product | Unit price (read at the add) | Attributes |
| --- | --- | --- | --- |
| A | Combination Pliers | $14.15 | co2_rating D |
| B | Pliers | $12.01 | co2_rating D |

## Steps (repeat 1 of 3)

| Step | Shopper's action | Expected | How it is made up | Displayed (raw text) | Row read | Result | Screenshot |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | add Combination Pliers, 1 unit | $14.15 | subtotal $14.15 | "$14.15" | "Total" | match | [S1](screens/S1.png) |
| S2 | add Pliers, 1 unit | $26.16 | subtotal $26.16 | "$26.16" | "Total" | match | [S2](screens/S2.png) |
| S3 | set quantity of Combination Pliers to 3 | $54.46 | subtotal $54.46 | "$54.46" | "Total" | match | [S3](screens/S3.png) |
| S4 | remove Pliers | $42.45 | subtotal $42.45 | "$42.45" | "Total" | match | [S4](screens/S4.png) |

## Evidence

- Static check G0, reference cart G1 and defects G2: PASS; defects 12/12 applicable, each detected at the expected checkpoint (on the example's stub prices).
- G2 repeated on the products of this run (A = Combination Pliers 14.15, B = Pliers 12.01): 9/9 applicable defects detected where expected.
- Live run G3: PASS, 3/3 repeats passed; the test is the untouched compilation of the confirmed scenario.
- Live controls G4: PASS.

| Control | Result | Activated | Element or request changed | Shown at the read | First red | Expected |
| --- | --- | --- | --- | --- | --- | --- |
| skew-total | caught | yes | row "Total" (its DOM fragment is in verification.json) | the driver read "$14.16" at S1, "$26.17" at S2, "$54.47" at S3, "$42.46" at S4 | S1 | every checkpoint with a total red by exactly +$0.01 |
| drift-price | caught | yes | GET **/carts/*: 7 request(s) intercepted, the first line's price raised in 7 | total "$14.16" at S1, expected $14.15 | S1 | first red at S1 |
| lost-update | caught | yes | PUT **/carts/*/product/quantity: 1 request(s) intercepted | total "$26.16" at S3, expected $54.46 | S3 | first red at S3 |
| lost-remove | caught | yes | DELETE **/carts/*/product/*: 1 request(s) intercepted | total "$54.46" at S4, expected $42.45 | S4 | first red at S4 |

- Intent review: `specs/two-products-change-remove.intent.md`, verdict INTENT_OK, for the confirmed scenario (sha256 31f919ab322c…).
- Report review: `review.md` of this run, verdict VERIFIED.

## Defects

Every defect the test was checked against. Stub prices: the approved example. Live prices: the products of this run (A = Combination Pliers 14.15, B = Pliers 12.01).

| Defect | Origin | What it plants | Stub prices | First red | Live prices | First red |
| --- | --- | --- | --- | --- | --- | --- |
| lost-add | default | add is acknowledged and changes nothing | detected | S1 | detected | S1 |
| lost-qty | default | setQty is acknowledged and changes nothing | detected | S3 | detected | S3 |
| lost-remove | default | remove is acknowledged and changes nothing | detected | S4 | detected | S4 |
| qty-wrong-line | default | setQty hits the next line in cart order | detected | S3 | detected | S3 |
| remove-wrong-line | default | remove hits the next line in cart order | detected | S4 | detected | S4 |
| stale-total | default | the total shown is the one from before the last change | detected | S1 | detected | S1 |
| total-off-by-cent | default | the total is one cent too high | detected | S1 | detected | S1 |
| line-ignores-qty | default | the line total is the unit price, whatever the quantity | detected | S3 | detected | S3 |
| rule-never | default | rule eco-discount is never applied | detected | S1 | not-applicable | — |
| rule-always | default | rule eco-discount is always applied | detected | S2 | detected | S1 |
| rule-wrong-rate | default | rule eco-discount is applied at twice its rate | detected | S1 | not-applicable | — |
| rule-boundary | default | the threshold of rule eco-discount is shifted by its boundary | detected | S2 | not-applicable | — |
| round-down | default | the total and the adjustments are truncated at the cent instead of rounded | not-applicable | — | not-applicable | — |

## Scope

The total was read from the row "Total". In this run it always equalled the subtotal or a line total, so the live run alone cannot tell those fields apart; only the label-based control skew-total shows that the driver reads the total.

## Scenario gaps

- rule-never is not applicable with the products of this run: Add a step at which rule eco-discount is in force.
- rule-wrong-rate is not applicable with the products of this run: Add a step at which rule eco-discount is in force.
- rule-boundary is not applicable with the products of this run: Add a step at which the cart sits exactly at the threshold of rule eco-discount.
- round-down is not applicable with the products of this run: No amount at a checkpoint has a fraction of a cent above one half; other products or quantities would expose truncation.

## Rules used

- eco-discount: 5% of the running value off when more than 0.5 of the units have co2_rating A or B · source: observed (docs/toolshop-facts.md#h1, 2026-11-25; cart.component.ts @ae7caec) · live: confirmed · not in force in this run.
- Total row label /^total\b/i, subtotal row label /^subtotal\b/i · source: observed (docs/toolshop-facts.md#h6, 2026-11-25).

## How to rerun and how to read a failure

Rerun: `cd e2e && npm run qa -- run two-products-change-remove`

A red checkpoint names the step, the action, the expected amount with how it is made up, the raw text the page displayed and the row it came from, the difference, and the first layer that disagreed (state, labels, lines, unit price, line total, adjustments, subtotal, total). `ORACLE_MISMATCH` means the amounts differ: an application bug or a missing rule. `UNMODELED_ADJUSTMENT` means the cart shows an adjustment no rule describes. `LOCATOR_FAIL` means the driver did not find an element, got no acknowledgment, or read a field with another label. `INFRA_FAIL` means the environment failed. The full data is in `run.json` and `verification.json`; the Playwright HTML report of the run stays outside the repo in `runs/<runId>/html/`.

Amounts are in USD; expected amounts are exact values rounded to the cent, displayed amounts are the page's own text.
