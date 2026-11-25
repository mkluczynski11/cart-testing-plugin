# Wood Saw and two units of another product, saw raised to three, other product removed, total checked after each step

## PASS · test verified

| | |
| --- | --- |
| Test | `e2e/tests/wood-saw-raise-remove-other.spec.ts` |
| Objective | Add a Wood Saw, then two units of the first available product. Raise the saw to three units, then remove the other product. Check the total after each change. |
| Status | PASS, 3 of 3 repeats · verified |
| Environment | https://practicesoftwaretesting.com · Chromium · en-US · 2026-11-25 12:37 UTC · run `20261125T123701Z-8ba1` |
| Preconditions | empty cart, guest, no geolocation |
| Test data | A = Wood Saw, $12.18, co2_rating B · B = Combination Pliers, $14.15, co2_rating D (read from the product pages in this run) |

### Steps

| # | Shopper's action | Expected total | Actual (as displayed) | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| S1 | add Wood Saw, 1 unit | $11.57 = $12.18 − eco-discount $0.61 | "$11.57" | pass | `e2e/reports/wood-saw-raise-remove-other/screens/S1.png` |
| S2 | add Combination Pliers, 2 units | $40.48 | "$40.48" | pass | `e2e/reports/wood-saw-raise-remove-other/screens/S2.png` |
| S3 | set quantity of Wood Saw to 3 | $61.60 = $64.84 − eco-discount $3.24 | "$61.60" | pass | `e2e/reports/wood-saw-raise-remove-other/screens/S3.png` |
| S4 | remove Combination Pliers | $34.71 = $36.54 − eco-discount $1.83 | "$34.71" | pass | `e2e/reports/wood-saw-raise-remove-other/screens/S4.png` |

Repeat 1 of 3 is shown; every repeat is in `run.json`.

### Verification of the test

| Check | Result |
| --- | --- |
| Intent review | INTENT_OK, `e2e/specs/wood-saw-raise-remove-other.intent.md`, for the confirmed scenario |
| Static check, reference cart | PASS (gates G0, G1) |
| Defects on stub prices | 11 of 11 detected at the right step, 2 not applicable |
| Defects on the prices of this run | 12 of 12 detected at the right step, 1 not applicable |
| Live run | 3 of 3 repeats passed; the test is the untouched compilation of the confirmed scenario |
| Live controls | 4 of 4 caught |
| Report review | VERIFIED, `review.md` of this run |

### Not covered by this scenario

- rule-boundary: Add a step at which the cart sits exactly at the threshold of rule eco-discount.

### Pricing rules

- eco-discount: 5% off when more than half of the units have co2_rating A or B · source: observed on the live site, confirmed · in force at S1, S3, S4 in this run.

### Page driver

`e2e/app/toolshop.driver.ts`: the plugin's starter pack for toolshop, as setup installed it. This flow did not change it (sha256 382d9e8915d5…). Operations this scenario used: candidates, productFacts, readCart, addProduct, setQuantity, remove. The total was read from the row "Total".

The page driver is the one file that knows the shop's pages: the test calls it to find products, add them, change quantities, remove them and read the cart, so the test holds no locator.

### Files

| File | Content |
| --- | --- |
| `e2e/tests/wood-saw-raise-remove-other.spec.ts` | the test |
| `e2e/specs/wood-saw-raise-remove-other.md` | the confirmed scenario |
| `e2e/specs/wood-saw-raise-remove-other.intent.md` | the intent review |
| `e2e/reports/wood-saw-raise-remove-other/report.md` | the full report, every defect and control |
| `e2e/reports/wood-saw-raise-remove-other/screens/` | one screenshot per step |
| `e2e/app/toolshop.driver.ts`, `.pricing.ts`, `.map.md` | page driver, pricing rules, locator evidence |

### Run it again

`cd e2e && npm run qa -- run wood-saw-raise-remove-other` (3 repeats, with the report)
`cd e2e && npx playwright test tests/wood-saw-raise-remove-other.spec.ts` (plain Playwright)

### Defects

Every defect the test was checked against. Stub prices: the approved example. Live prices: the products of this run (A = Wood Saw 12.18, B = Combination Pliers 14.15).

| Defect | Origin | What it plants | Stub prices | First red | Live prices | First red |
| --- | --- | --- | --- | --- | --- | --- |
| lost-add | default | add is acknowledged and changes nothing | detected | S1 | detected | S1 |
| lost-qty | default | setQty is acknowledged and changes nothing | detected | S3 | detected | S3 |
| lost-remove | default | remove is acknowledged and changes nothing | detected | S4 | detected | S4 |
| qty-wrong-line | default | setQty hits the next line in cart order | detected | S3 | detected | S3 |
| remove-wrong-line | default | remove hits the next line in cart order | detected | S4 | detected | S4 |
| stale-total | default | the total shown is the one from before the last change | detected | S1 | detected | S1 |
| total-off-by-cent | default | the total is one cent too high | detected | S1 | detected | S1 |
| line-ignores-qty | default | the line total is the unit price, whatever the quantity | detected | S2 | detected | S2 |
| rule-never | default | rule eco-discount is never applied | detected | S1 | detected | S1 |
| rule-always | default | rule eco-discount is always applied | detected | S2 | detected | S2 |
| rule-wrong-rate | default | rule eco-discount is applied at twice its rate | detected | S1 | detected | S1 |
| rule-boundary | default | the threshold of rule eco-discount is shifted by its boundary | not-applicable | — | not-applicable | — |
| round-down | default | the total and the adjustments are truncated at the cent instead of rounded | not-applicable | — | detected | S1 |

### Live controls

| Control | Result | Activated | Element or request changed | Shown at the read | First red | Expected |
| --- | --- | --- | --- | --- | --- | --- |
| skew-total | caught | yes | row "Total" (its DOM fragment is in verification.json) | the driver read "$11.58" at S1, "$40.49" at S2, "$61.61" at S3, "$34.72" at S4 | S1 | every checkpoint with a total red by exactly +$0.01 |
| drift-price | caught | yes | GET **/carts/*: 7 request(s) intercepted, the first line's price raised in 7 | total "$11.58" at S1, expected $11.57 | S1 | first red at S1 |
| lost-update | caught | yes | PUT **/carts/*/product/quantity: 1 request(s) intercepted | total "$40.48" at S3, expected $61.60 | S3 | first red at S3 |
| lost-remove | caught | yes | DELETE **/carts/*/product/*: 1 request(s) intercepted | total "$61.60" at S4, expected $34.71 | S4 | first red at S4 |

### Scope

The total was read from the row "Total". At S1, S3, S4 it differed from the subtotal and from every line total, so a driver reading another field would have failed there.

### Rows read

| # | Expected, how it is made up | Row read |
| --- | --- | --- |
| S1 | $11.57 = subtotal $12.18 − eco-discount $0.61 | "Total" |
| S2 | $40.48 = subtotal $40.48 | "Total" |
| S3 | $61.60 = subtotal $64.84 − eco-discount $3.24 | "Total" |
| S4 | $34.71 = subtotal $36.54 − eco-discount $1.83 | "Total" |

### Reading a failure

A red checkpoint names the step, the action, the expected amount with how it is made up, the raw text the page displayed and the row it came from, the difference, and the first layer that disagreed (state, labels, lines, unit price, line total, adjustments, subtotal, total). `ORACLE_MISMATCH` means the amounts differ: an application bug or a missing rule. `UNMODELED_ADJUSTMENT` means the cart shows an adjustment no rule describes. `LOCATOR_FAIL` means the driver did not find an element, got no acknowledgment, or read a field with another label. `INFRA_FAIL` means the environment failed. The full data is in `run.json` and `verification.json`; the Playwright HTML report of the run stays outside the repo in `runs/<runId>/html/`.

Amounts are in USD; expected amounts are exact values rounded to the cent, displayed amounts are the page's own text. Total row label /^total\b/i, subtotal row label /^subtotal\b/i · source: observed on the live site, confirmed.
