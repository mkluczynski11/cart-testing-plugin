# Cart total stays correct after add, quantity change and remove

**PASS 3/3** · scenario `cart-total-add-change-remove` · run `20261125T012028Z-8ed3` · 2026-11-25T01:20:31Z · https://practicesoftwaretesting.com · Chromium, en-US

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
| skew-total | caught | yes | row "Total": <tr _ngcontent-ng-c2879330868=""><td _ngcontent-ng-c2879330868="" class="col-md-5"></td><td _ngcontent-ng-c2879330868="" class="col-md-2"></td><td _ngcontent-ng-c2879330868="" class="col-md-2 text-end"><strong _ngcontent-ng-c2879330868="">Total</strong></td><td _ngcontent-ng-c2879330868="" data-test | "$42.46" (driver read "$14.16", "$26.17", "$54.47", "$42.46") | S1 | every checkpoint with a total red by exactly +$0.01 |
| drift-price | caught | yes | GET **/carts/*: 7 request(s) intercepted, the first line's price raised in 7, first GET /carts/01m884ned9bzgkpz4vcmeawq5w | "$14.16" at S1 | S1 | first red at S1 |
| lost-update | caught | yes | PUT **/carts/*/product/quantity: 1 request(s) intercepted, first PUT /carts/01m884nqt32rj8nywyvn93229j/product/quantity | "$26.16" at S3 | S3 | first red at S3 |
| lost-remove | caught | yes | DELETE **/carts/*/product/*: 1 request(s) intercepted, first DELETE /carts/01m884nzddt7ft9aa0gxeanjb5/product/01M883FHGXWRBED9KWRWAGA10B | "$54.46" at S4 | S4 | first red at S4 |

- **Not available:** the intent review and the report review are written by an agent, not by the harness; none is part of this run.

## Scope

The total was read from the row "Total"; in this run it never differed from both the subtotal and every line total, so only the label-based control (skew-total) shows that the fields are told apart.

## Scenario gaps

- rule-never is not applicable with the products of this run: Add a step at which rule eco-discount is in force.
- rule-wrong-rate is not applicable with the products of this run: Add a step at which rule eco-discount is in force.
- rule-boundary is not applicable with the products of this run: Add a step at which the cart sits exactly at the threshold of rule eco-discount.
- round-down is not applicable with the products of this run: No amount at a checkpoint has a fraction of a cent above one half; other products or quantities would expose truncation.

## Rules used

- eco-discount: 5% of the running value off when more than 0.5 of the units have co2_rating A or B · source: observed (docs/toolshop-facts.md#h1, 2026-11-25; cart.component.ts @ae7caec) · live: confirmed · not in force in this run.
- Total row label /^total\b/i, subtotal row label /^subtotal\b/i · source: observed (docs/toolshop-facts.md#h6, 2026-11-25).

## How to rerun and how to read a failure

Rerun: `cd templates/e2e && npm run qa -- run cart-total-add-change-remove --root ../../examples/toolshop`

A red checkpoint names the step, the action, the expected amount with how it is made up, the raw text the page displayed and the row it came from, the difference, and the first layer that disagreed (state, labels, lines, unit price, line total, adjustments, subtotal, total). `ORACLE_MISMATCH` means the amounts differ: an application bug or a missing rule. `UNMODELED_ADJUSTMENT` means the cart shows an adjustment no rule describes. `LOCATOR_FAIL` means the driver did not find an element, got no acknowledgment, or read a field with another label. `INFRA_FAIL` means the environment failed. The full data is in `run.json` and `verification.json`; the Playwright HTML report of the run stays outside the repo in `runs/<runId>/html/`.

Amounts are in USD; expected amounts are exact values rounded to the cent, displayed amounts are the page's own text.
