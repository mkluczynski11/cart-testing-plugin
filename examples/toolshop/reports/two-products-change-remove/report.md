# Two different products, change the quantity of one, remove the other, total checked after each step

## PASS · test verified

| | |
| --- | --- |
| Test | `e2e/tests/two-products-change-remove.spec.ts` |
| Objective | Add two different products to the cart. Change the quantity of one, then remove the other. Check that the cart shows the correct total after each change. |
| Status | PASS, 3 of 3 repeats · verified |
| Environment | https://practicesoftwaretesting.com · Chromium · en-US · 2026-11-25 12:33 UTC · run `20261125T123349Z-fee3` |
| Preconditions | empty cart, guest, no geolocation |
| Test data | A = Combination Pliers, $14.15, co2_rating D · B = Pliers, $12.01, co2_rating D (read from the product pages in this run) |

### Steps

| # | Shopper's action | Expected total | Actual (as displayed) | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| S1 | add Combination Pliers, 1 unit | $14.15 | "$14.15" | pass | `e2e/reports/two-products-change-remove/screens/S1.png` |
| S2 | add Pliers, 1 unit | $26.16 | "$26.16" | pass | `e2e/reports/two-products-change-remove/screens/S2.png` |
| S3 | set quantity of Combination Pliers to 3 | $54.46 | "$54.46" | pass | `e2e/reports/two-products-change-remove/screens/S3.png` |
| S4 | remove Pliers | $42.45 | "$42.45" | pass | `e2e/reports/two-products-change-remove/screens/S4.png` |

Repeat 1 of 3 is shown; every repeat is in `run.json`.

### Verification of the test

| Check | Result |
| --- | --- |
| Intent review | INTENT_OK, `e2e/specs/two-products-change-remove.intent.md`, for the confirmed scenario |
| Static check, reference cart | PASS (gates G0, G1) |
| Defects on stub prices | 12 of 12 detected at the right step, 1 not applicable |
| Defects on the prices of this run | 9 of 9 detected at the right step, 4 not applicable |
| Live run | 3 of 3 repeats passed; the test is the untouched compilation of the confirmed scenario |
| Live controls | 4 of 4 caught |
| Report review | VERIFIED, `review.md` of this run |

### Not covered by this scenario

- rule-never: Add a step at which rule eco-discount is in force.
- rule-wrong-rate: Add a step at which rule eco-discount is in force.
- rule-boundary: Add a step at which the cart sits exactly at the threshold of rule eco-discount.
- round-down: No amount at a checkpoint has a fraction of a cent above one half; other products or quantities would expose truncation.

### Pricing rules

- eco-discount: 5% off when more than half of the units have co2_rating A or B · source: observed on the live site, confirmed · not in force in this run.

### Page driver

`e2e/app/toolshop.driver.ts`: the plugin's starter pack for toolshop, as setup installed it. This flow did not change it (sha256 382d9e8915d5…). Operations this scenario used: candidates, productFacts, readCart, addProduct, setQuantity, remove. The total was read from the row "Total".

The page driver is the one file that knows the shop's pages: the test calls it to find products, add them, change quantities, remove them and read the cart, so the test holds no locator.

### Files

| File | Content |
| --- | --- |
| `e2e/tests/two-products-change-remove.spec.ts` | the test |
| `e2e/specs/two-products-change-remove.md` | the confirmed scenario |
| `e2e/specs/two-products-change-remove.intent.md` | the intent review |
| `e2e/reports/two-products-change-remove/report.md` | the full report, every defect and control |
| `e2e/reports/two-products-change-remove/screens/` | one screenshot per step |
| `e2e/app/toolshop.driver.ts`, `.pricing.ts`, `.map.md` | page driver, pricing rules, locator evidence |

### Run it again

`cd e2e && npm run qa -- run two-products-change-remove` (3 repeats, with the report)
`cd e2e && npx playwright test tests/two-products-change-remove.spec.ts` (plain Playwright)

### Defects

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

### Live controls

| Control | Result | Activated | Element or request changed | Shown at the read | First red | Expected |
| --- | --- | --- | --- | --- | --- | --- |
| skew-total | caught | yes | row "Total" (its DOM fragment is in verification.json) | the driver read "$14.16" at S1, "$26.17" at S2, "$54.47" at S3, "$42.46" at S4 | S1 | every checkpoint with a total red by exactly +$0.01 |
| drift-price | caught | yes | GET **/carts/*: 7 request(s) intercepted, the first line's price raised in 7 | total "$14.16" at S1, expected $14.15 | S1 | first red at S1 |
| lost-update | caught | yes | PUT **/carts/*/product/quantity: 1 request(s) intercepted | total "$26.16" at S3, expected $54.46 | S3 | first red at S3 |
| lost-remove | caught | yes | DELETE **/carts/*/product/*: 1 request(s) intercepted | total "$54.46" at S4, expected $42.45 | S4 | first red at S4 |

### Scope

The total was read from the row "Total". In this run it always equalled the subtotal or a line total, so the live run alone cannot tell those fields apart; only the label-based control skew-total shows that the driver reads the total.

### Rows read

| # | Expected, how it is made up | Row read |
| --- | --- | --- |
| S1 | $14.15 = subtotal $14.15 | "Total" |
| S2 | $26.16 = subtotal $26.16 | "Total" |
| S3 | $54.46 = subtotal $54.46 | "Total" |
| S4 | $42.45 = subtotal $42.45 | "Total" |

### Reading a failure

A red checkpoint names the step, the action, the expected amount with how it is made up, the raw text the page displayed and the row it came from, the difference, and the first layer that disagreed (state, labels, lines, unit price, line total, adjustments, subtotal, total). `ORACLE_MISMATCH` means the amounts differ: an application bug or a missing rule. `UNMODELED_ADJUSTMENT` means the cart shows an adjustment no rule describes. `LOCATOR_FAIL` means the driver did not find an element, got no acknowledgment, or read a field with another label. `INFRA_FAIL` means the environment failed. The full data is in `run.json` and `verification.json`; the Playwright HTML report of the run stays outside the repo in `runs/<runId>/html/`.

Amounts are in USD; expected amounts are exact values rounded to the cent, displayed amounts are the page's own text. Total row label /^total\b/i, subtotal row label /^subtotal\b/i · source: observed on the live site, confirmed.
