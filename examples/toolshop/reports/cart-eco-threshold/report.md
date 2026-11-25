# Eco discount follows the share of A- or B-rated units through add, quantity change and remove

**PASS 3/3** · scenario `cart-eco-threshold` · run `20261125T010538Z-fccb` · 2026-11-25T01:05:42Z · https://practicesoftwaretesting.com · Chromium, en-US

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
- **Not available:** live controls G4 were not run (`qa-harness verify` runs them after a green G3).
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
