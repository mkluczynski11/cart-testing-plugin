# Cart total after adding three products, setting the quantities of the first and third and removing the second

**PASS 3/3** · scenario `three-products-set-remove` · run `20261125T025707Z-5ccd` · 2026-11-25T02:57:09Z · https://practicesoftwaretesting.com · Chromium, en-US

The tester asked: "Add three different products. Set the first to 2 units and the third to 4. Remove the second. Check the total after every change."

## Products

| Alias | Product | Unit price (read at the add) | Attributes |
| --- | --- | --- | --- |
| A | Combination Pliers | $14.15 | co2_rating D |
| B | Pliers | $12.01 | co2_rating D |
| C | Bolt Cutters | $48.41 | co2_rating D |

## Steps (repeat 1 of 3)

| Step | Shopper's action | Expected | How it is made up | Displayed (raw text) | Row read | Result | Screenshot |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | add Combination Pliers, 1 unit | $14.15 | subtotal $14.15 | "$14.15" | "Total" | match | [S1](screens/S1.png) |
| S2 | add Pliers, 1 unit | $26.16 | subtotal $26.16 | "$26.16" | "Total" | match | [S2](screens/S2.png) |
| S3 | add Bolt Cutters, 1 unit | $74.57 | subtotal $74.57 | "$74.57" | "Total" | match | [S3](screens/S3.png) |
| S4 | set quantity of Combination Pliers to 2 | $88.72 | subtotal $88.72 | "$88.72" | "Total" | match | [S4](screens/S4.png) |
| S5 | set quantity of Bolt Cutters to 4 | $233.95 | subtotal $233.95 | "$233.95" | "Total" | match | [S5](screens/S5.png) |
| S6 | remove Pliers | $221.94 | subtotal $221.94 | "$221.94" | "Total" | match | [S6](screens/S6.png) |

## Evidence

- Static check G0, reference cart G1 and defects G2: PASS; defects 12/12 applicable, each detected at the expected checkpoint (on the example's stub prices).
- G2 repeated on the products of this run (A = Combination Pliers 14.15, B = Pliers 12.01, C = Bolt Cutters 48.41): 9/9 applicable defects detected where expected.
- Live run G3: PASS, 3/3 repeats passed; the test is the untouched compilation of the confirmed scenario.
- Live controls G4: PASS.

| Control | Result | Activated | Element or request changed | Shown at the read | First red | Expected |
| --- | --- | --- | --- | --- | --- | --- |
| skew-total | caught | yes | row "Total" (its DOM fragment is in verification.json) | the driver read "$14.16" at S1, "$26.17" at S2, "$74.58" at S3, "$88.73" at S4, "$233.96" at S5, "$221.95" at S6 | S1 | every checkpoint with a total red by exactly +$0.01 |
| drift-price | caught | yes | GET **/carts/*: 11 request(s) intercepted, the first line's price raised in 11 | total "$14.16" at S1, expected $14.15 | S1 | first red at S1 |
| lost-update | caught | yes | PUT **/carts/*/product/quantity: 2 request(s) intercepted | total "$74.57" at S4, expected $88.72 | S4 | first red at S4 |
| lost-remove | caught | yes | DELETE **/carts/*/product/*: 1 request(s) intercepted | total "$233.95" at S6, expected $221.94 | S6 | first red at S6 |

- **Not available:** the intent review and the report review are written by an agent, not by the harness; none is part of this run.

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

Rerun: `cd e2e && npm run qa -- run three-products-set-remove`

A red checkpoint names the step, the action, the expected amount with how it is made up, the raw text the page displayed and the row it came from, the difference, and the first layer that disagreed (state, labels, lines, unit price, line total, adjustments, subtotal, total). `ORACLE_MISMATCH` means the amounts differ: an application bug or a missing rule. `UNMODELED_ADJUSTMENT` means the cart shows an adjustment no rule describes. `LOCATOR_FAIL` means the driver did not find an element, got no acknowledgment, or read a field with another label. `INFRA_FAIL` means the environment failed. The full data is in `run.json` and `verification.json`; the Playwright HTML report of the run stays outside the repo in `runs/<runId>/html/`.

Amounts are in USD; expected amounts are exact values rounded to the cent, displayed amounts are the page's own text.
