# Eco discount follows the share of A- or B-rated units through add, quantity change and remove

**PASS 3/3** · scenario `cart-eco-threshold` · run `20261125T012124Z-9d5f` · 2026-11-25T01:21:26Z · https://practicesoftwaretesting.com · Chromium, en-US

The tester asked: "Add a Wood Saw, then two units of the first available product. Raise the saw to three units, then remove the other product. Check after each change that the eco discount applies exactly when more than half of the units are rated A or B, and that the total is correct."

## Products

| Alias | Product | Unit price (read at the add) | Attributes |
| --- | --- | --- | --- |
| A | Wood Saw | $12.18 | co2_rating B |
| B | Combination Pliers | $14.15 | co2_rating D |

## Steps (repeat 1 of 3)

| Step | Shopper's action | Expected | How it is made up | Displayed (raw text) | Row read | Result | Screenshot |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | add Wood Saw, 1 unit | $11.57 | subtotal $12.18 − eco-discount $0.61 | "$11.57" | "Total" | match | [S1](screens/S1.png) |
| S2 | add Combination Pliers, 2 units | $40.48 | subtotal $40.48 | "$40.48" | "Total" | match | [S2](screens/S2.png) |
| S3 | set quantity of Wood Saw to 3 | $61.60 | subtotal $64.84 − eco-discount $3.24 | "$61.60" | "Total" | match | [S3](screens/S3.png) |
| S4 | remove Combination Pliers | $34.71 | subtotal $36.54 − eco-discount $1.83 | "$34.71" | "Total" | match | [S4](screens/S4.png) |

## Evidence

- Static check G0, reference cart G1 and defects G2: PASS; defects 11/11 applicable, each detected at the expected checkpoint (on the example's stub prices).
- G2 repeated on the products of this run (A = Wood Saw 12.18, B = Combination Pliers 14.15): 12/12 applicable defects detected where expected.
- Live run G3: PASS, 3/3 repeats passed; the test is the untouched compilation of the confirmed scenario.
- Live controls G4: PASS.

| Control | Result | Activated | Element or request changed | Shown at the read | First red | Expected |
| --- | --- | --- | --- | --- | --- | --- |
| skew-total | caught | yes | row "Total": <tr _ngcontent-ng-c2879330868=""><td _ngcontent-ng-c2879330868="" class="col-md-5"></td><td _ngcontent-ng-c2879330868="" class="col-md-2"></td><td _ngcontent-ng-c2879330868="" class="col-md-2 text-end"><strong _ngcontent-ng-c2879330868="">Total</strong></td><td _ngcontent-ng-c2879330868="" data-test | "$34.72" (driver read "$11.58", "$40.49", "$61.61", "$34.72") | S1 | every checkpoint with a total red by exactly +$0.01 |
| drift-price | caught | yes | GET **/carts/*: 7 request(s) intercepted, the first line's price raised in 7, first GET /carts/01m884q2j905gheyzap064y3e6 | "$11.58" at S1 | S1 | first red at S1 |
| lost-update | caught | yes | PUT **/carts/*/product/quantity: 1 request(s) intercepted, first PUT /carts/01m884qbft74r3xh1rrz9svm9s/product/quantity | "$40.48" at S3 | S3 | first red at S3 |
| lost-remove | caught | yes | DELETE **/carts/*/product/*: 1 request(s) intercepted, first DELETE /carts/01m884qjxs90bsk441wm14hqpm/product/01M883FHGRPMHEXQG54S0BY1AQ | "$61.60" at S4 | S4 | first red at S4 |

- **Not available:** the intent review and the report review are written by an agent, not by the harness; none is part of this run.

## Scope

The total was read from the row "Total"; at S1, S3, S4 it differed from the subtotal and from every line total.

## Scenario gaps

- rule-boundary is not applicable with the products of this run: Add a step at which the cart sits exactly at the threshold of rule eco-discount.

## Rules used

- eco-discount: 5% of the running value off when more than 0.5 of the units have co2_rating A or B · source: observed (docs/toolshop-facts.md#h1, 2026-11-25; cart.component.ts @ae7caec) · live: confirmed · in force at S1, S3, S4 in this run.
- Total row label /^total\b/i, subtotal row label /^subtotal\b/i · source: observed (docs/toolshop-facts.md#h6, 2026-11-25).

## How to rerun and how to read a failure

Rerun: `cd templates/e2e && npm run qa -- run cart-eco-threshold --root ../../examples/toolshop`

A red checkpoint names the step, the action, the expected amount with how it is made up, the raw text the page displayed and the row it came from, the difference, and the first layer that disagreed (state, labels, lines, unit price, line total, adjustments, subtotal, total). `ORACLE_MISMATCH` means the amounts differ: an application bug or a missing rule. `UNMODELED_ADJUSTMENT` means the cart shows an adjustment no rule describes. `LOCATOR_FAIL` means the driver did not find an element, got no acknowledgment, or read a field with another label. `INFRA_FAIL` means the environment failed. The full data is in `run.json` and `verification.json`; the Playwright HTML report of the run stays outside the repo in `runs/<runId>/html/`.

Amounts are in USD; expected amounts are exact values rounded to the cent, displayed amounts are the page's own text.
