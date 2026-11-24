## B exit report

Branch `b-driver`, worktree `.worktrees/b-driver`, 2026-11-25.

**Exit criteria**

| Criterion | Command / check | Result |
| --- | --- | --- |
| Install | `cd scratch/driver-lab && npm ci` | PASS (0 vulnerabilities) |
| Browser | `npx playwright install chromium` | PASS |
| Lab green, headless, 3 repeats | `npx playwright test --repeat-each 3` | PASS: 18 passed (1.8 min), exit 0. Log: `docs/evidence/driver-lab/repeat-each-3.log` |
| Clean tree | `git status --short` after the last commit | PASS (empty) |
| Type check | `npx tsc -p .` in `scratch/driver-lab` | PASS |
| Facts settle H1–H6 | `docs/toolshop-facts.md` | PASS: all six confirmed, with evidence |
| S1–S4 JSON committed | `docs/evidence/driver-lab/S1.json` … `S4.json` | PASS |

The first `--repeat-each 3` run had 2 of 18 failures. Both were driver bugs, fixed before the final run:
- A torn `readCart` read during the removal of the last line.
- A search race in `openProduct`.

See Deviations 2 and 3.

**Hypotheses**
- H1 confirmed: Wood Saw (rating B) alone gives `Eco-Friendly Discount (5%)` `- $0.61` and a `Subtotal` row; `rules` keeps `eco-discount`.
- H2 confirmed: no rule fires, and the totals equal the predicted values (table below).
- H3 confirmed: every `data-test` from section 2 is deployed. Additions: `unit-price` has no `$`, the CO2 rating is marked only by a CSS class, and eco products have an `ECO` badge in the heading.
- H4 confirmed: `The cart is empty. Nothing to display.`, no table, no `cart-total`.
- H5 confirmed: a `role="alert"` toast appears after add, change and removal. It sits top right and never overlaps cart elements. For change and removal it appears before the refetch completes.
- H6 confirmed: the total row is labelled `Total`, and `Subtotal` appears only with the discount. Unlike the source's "footer", the subtotal and discount rows sit in `<tbody>`.

**Live totals** (as displayed, identical in all 3 repeats)

| Step | H2 predicted | Live |
| --- | --- | --- |
| S1 add Combination Pliers 1 | $14.15 | $14.15 |
| S2 add Pliers 1 | $26.16 | $26.16 |
| S3 set Combination Pliers 3 | $54.46 | $54.46 |
| S4 remove Pliers | $42.45 | $42.45 |
| Eco case: Wood Saw × 1 | n/a | Subtotal $12.18, Eco-Friendly Discount (5%) - $0.61, Total $11.57 |
| Repeated add: Combination Pliers twice | n/a | one line, qty 2, Total $28.30 |

**Settle time** (from acknowledgment to the first `readCart()` that shows the new state, 15 samples each)
- Quantity change: min 4 ms, median 6 ms, max 118 ms. The samples are bimodal: changes to 2 took 4–6 ms and changes to 3 took 108–118 ms. The cause was not determined.
- Removal: min 112 ms, median 115 ms, max 137 ms.
- Recommended `settleMs`: **1000**, about 7× the largest sample, with headroom for network jitter on a public site. The assumed 3000 is safe too. It only costs time when the cart is wrong, because polling ends early when it agrees.

**Deviations from this order**
1. **CO2 rating is read through a CSS class.** The locator is `getByTestId('co2-rating-badge').locator('.active')`. The badge renders all letters A–E, and only the class `active` marks the rating. No `data-test`, role, ARIA state or text identifies it. The order forbids CSS classes, so this is reported, not hidden. The alternative is to drop `attrs.co2_rating`, which kills H1 and the eco rule.
2. **`readCart` reads the page in one in-page snapshot.** It is a single `page.evaluate` that selects by `data-test` attributes and by the empty-message text. Separate locators gave a torn read in run 1: the total was seen, then the table vanished during a removal, and the read waited 10 s. The variant decision, lines and summary now come from one DOM state. Each label comes from the same `<tr>` as its amount.
3. **`openProduct` waits for the initial listing and for the `GET /products/search` response before clicking the card.** Run 1 lost a search result to a late listing response (facts §6). Waiting for a response as a signal is allowed by the order.
4. **Acknowledgment requires both the action's 2xx response and the toast.** The order allows either one. The design (5.4) says a response must not be the only signal, and the response alone protects against a stale toast with the same text.
5. **A non-2xx action response throws `REFUSED: …`.** The order defines only `LOCATOR:` and `INFRA:`. A refusal (e.g. the Thor Hammer limit) is neither. The design calls it `PreconditionError`, which is not in the order's types. Not exercised live.
6. **Lab polling for S1–S4 also waits for the total text to change from the previous step,** within the same 5 s budget. The quantity input shows the typed value before the refetch, so "lines and quantities match" alone would capture a stale total at S3. No amount is compared with a computed value.
7. **The temporary parser accepts an amount without `$`** (product page `unit-price`) and returns `- $0.71` as −71/100. Fractions are exact and not reduced (`1415/100`).
8. **Extra evidence files** beyond S1–S4: `H1-eco-wood-saw.*`, `H3-*.json`, `H4-empty.*`, `H5-toasts.json`, `repeat-add.*`, `settle.*`, `runs.jsonl`, `repeat-each-3.log`, and `docs/evidence/explore/*.png` from the manual exploration.
9. **Lab tsconfig maps `@playwright/test`** to the lab's `node_modules`, so the driver under `templates/e2e/` type-checks. The driver imports only types from Playwright, so it has no runtime import that would need resolving.
10. **Design items not implemented, per the addendum:** `controls` / request bindings, `provides`, `setAttribute`, `apiPrice`, `listPrice`, `PreconditionError`, `app/toolshop.map.md`.

**Observations**
- The deployed footer says `v2.5 | Built 2026-10-11 | Angular 20.0.5`, while the title says v5.0.
- The site loads a Cloudflare challenge script. No rate limiting or blocking was seen in any run.
- There is a permanent "Practice Black Box Testing & Bug Hunting" banner, plus chat and live-activity toggles. None are covered by the source facts.
- The first add sends `POST /carts` and then `POST /carts/{id}`.
- The eco discount is rounded half up on display: 0.609 → `$0.61`, and 1.218 → `$1.22` at quantity 2, with Total `$23.14`. This is consistent with 5% of the running value.
- The browser console reports errors on every page. Their content was not analysed.
- Side effect: the Playwright MCP tool used for exploration wrote its log directory `.playwright-mcp/` into the **main worktree root**. I did not touch it, per the rule on the main worktree. It is untracked and can be deleted by hand.

**Open questions**
1. Is the class-based CO2 locator acceptable? If not, the rating must come from somewhere else, and the order rules out the API.
2. Refusals: should the shared types gain a `PreconditionError`, as the design has it, or is the `REFUSED:` prefix enough? This is also needed for Thor Hammer and quantities above 99.
3. Sign convention: Order A's `money.ts` must agree that `- $0.71` parses to a negative value, or the oracle must take the absolute value of adjustments.
4. Order A's Playwright config must set `testIdAttribute: 'data-test'`. The driver relies on it.
5. `settleMs`: adopt 1000?
6. The driver reaches product pages through site search. Products whose names are not unique in search results are handled by exact name matching. A product whose search result is not on the first result page would fail with `LOCATOR:`. That is not seen today.

**Measurements**
- Wall-clock: 00:29:53 to about 00:50, about 20 minutes of the 120-minute box.
- Browser runs, one at a time:
  - 1 manual exploration session: 1 browser, about 8 interactions, 4 cart actions.
  - 2 probe scripts for the search race: 6 fresh contexts, searches only, no cart actions.
  - 3 lab runs: 6 + 18 + 18 = 42 test contexts.
  - Total: 6 browser launches and 49 contexts.
