# Cart total stays correct after add, quantity change and remove

**PASS 3/3** · scenario `cart-total-add-change-remove` · run `20261125T010511Z-7186` · 2026-11-25T01:05:14Z · https://practicesoftwaretesting.com · Chromium, en-US

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
- **Not available:** live controls G4 were not run (`qa-harness verify` runs them after a green G3).
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
