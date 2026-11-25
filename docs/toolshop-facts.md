# Toolshop: live cart facts

Date: 2026-11-25 (runs between 00:30 and 00:47 local time).
Site: https://practicesoftwaretesting.com, page title "Practice Software Testing - Toolshop - v5.0".
Browser: Playwright 1.65.1, Chromium, headless, `locale: 'en-US'`, no geolocation permission, a fresh context per test.

Sources of evidence:
- `docs/evidence/driver-lab/`: the driver lab (written in order B as `scratch/driver-lab/driver.live.spec.ts`, now `examples/toolshop/lab/driver.live.spec.ts`), final run
  `npx playwright test --repeat-each 3` (18/18 passed). JSON and screenshots are from the last repeat; all
  three repeats are in `runs.jsonl`, and the console output is in `repeat-each-3.log`.
- `docs/evidence/explore/`: screenshots from the manual exploration in a browser before the driver existed.

All amounts below were read in the browser. None of them come from the API or the source code.

## Hypotheses

| ID | Result | Raw text seen | Screenshot |
| --- | --- | --- | --- |
| <a id="h1"></a>H1 | **Confirmed** | Wood Saw, product page badge rating `B`; cart: `Subtotal` `$12.18`, `Eco-Friendly Discount (5%)` `- $0.61`, `Total` `$11.57` (3/3 repeats). Exploration with quantity 2: `Subtotal` `$24.36`, `Eco-Friendly Discount (5%)` `- $1.22`, `Total` `$23.14` | `evidence/driver-lab/H1-eco-wood-saw.png`, `evidence/explore/H1-wood-saw-cart.png` |
| <a id="h2"></a>H2 | **Confirmed** | A = Combination Pliers `$14.15`, B = Pliers `$12.01`, both rating `D`. S1 `Total` `$14.15`; S2 `$26.16`; S3 `$54.46` (A line `$42.45`); S4 `$42.45`. No adjustment row and no `Subtotal` row in any step (3/3 repeats) | `evidence/driver-lab/S1.png` … `S4.png` |
| <a id="h3"></a>H3 | **Confirmed**, with additions | Cart: `product-title`, `product-quantity`, `product-price`, `line-price`, `cart-subtotal`, `cart-eco-discount`, `cart-total` all present. Product page: `co2-rating-badge`, `product-name`, `unit-price`, `quantity`, `add-to-cart`, `out-of-stock`. Full inventories in `H3-product-page.json` and `H3-cart.json` | `evidence/driver-lab/H3-product-page.png`, `evidence/driver-lab/S2.png` |
| <a id="h4"></a>H4 | **Confirmed** | Paragraph `The cart is empty. Nothing to display.`; 0 `<table>` elements and 0 `[data-test="cart-total"]` in the DOM (`H4-empty.json`). The header cart counter is not rendered | `evidence/driver-lab/H4-empty.png`, `evidence/explore/H4-empty-cart.png` |
| <a id="h5"></a>H5 | **Confirmed** | Toasts (`role="alert"`, top right): `Product added to shopping cart.`, `Product quantity updated.`, `Product deleted.`. Toast box x=1018 y=27 w=235 h=24 at 1280×720; the cart table starts at y≈271. No overlap with any cart element after S3 or S4 (`H5-toasts.json`). Order of events for a change: PUT response → toast (~55 ms later) → GET refetch response (~100 ms after the toast). For a removal: DELETE response → toast → GET response | `evidence/explore/H5-toast-qty-change.png`, `evidence/driver-lab/S3.png`, `S4.png` |
| <a id="h6"></a>H6 | **Confirmed** | Without a discount (S1–S4) the summary is one row: label `Total`, amount `$14.15` etc. With the eco discount the rows are `Subtotal` / `Eco-Friendly Discount (5%)` / `Total`. The column header `Total` is in `<thead>` and is not a summary row | `evidence/driver-lab/S1.png`, `evidence/driver-lab/H1-eco-wood-saw.png` |

Notes on H5: in `H5-toasts.json` the field `url` is the page after the cart settled. For S1 and S2 the toast was
measured on the product page, before the driver opened the cart, so the overlap check is vacuous there.

Other recorded behaviour:
- Repeated add (test 4): adding Combination Pliers twice gives one line, quantity `2`, `Total` `$28.30` (3/3).
- Lost locator (test 5): `addProduct("No Such Product 7f3c", 1)` fails after 10 s with
  `LOCATOR: addProduct("No Such Product 7f3c", 1): getByTestId(/^product-[0-9A-Z]{26}$/).filter(...)`.

## Settle time (test 6)

The time is measured from the driver's acknowledgment (action response with status 2xx, then the toast)
to the end of the first `readCart()` that shows the new state. That is the quantity and a changed line total
for a quantity change, and the line gone for a removal. Samples: 5 per kind per repeat, 3 repeats.

| Action | n | min | median | max |
| --- | --- | --- | --- | --- |
| Quantity change | 15 | 4 ms | 6 ms | 118 ms |
| Removal | 15 | 112 ms | 115 ms | 137 ms |

Quantity samples are bimodal. Changes to 2 settled in 4–6 ms and changes to 3 in 108–118 ms. The cause was not determined.

## Differences between the live site and order B, section 2

1. **Summary row placement.** `cart-total` is in `<tfoot>`, but `Subtotal` and `Eco-Friendly Discount (5%)` are
   `<tr>` rows in `<tbody>`, after the product lines. Each label is a `<strong>` in the cell before the amount.
2. **Eco discount label** is `Eco-Friendly Discount (5%)`. The amount `- $0.61` uses an ordinary space (U+0020).
3. **Product page price.** `[data-test="unit-price"]` holds `14.15` without the currency symbol. The `$` is outside
   the element.
4. **CO2 badge.** `co2-rating-badge` renders all five letters `A B C D E`. Its text is always `ABCDE`. The rating is
   marked only by the CSS class `active` on one letter (e.g. `co2-letter active rating-d`). There is no attribute,
   ARIA state or text that names the rating.
5. **Product heading.** For eco products the `<h1 data-test="product-name">` also contains an `ECO` badge, so
   its text is ` Wood Saw  ECO`. The cart title is `Wood Saw` followed by a non-breaking space.
6. **Search race.** If the search is submitted before the initial `/products` listing response is rendered, the
   late listing overwrites the search result. The page then shows "Searched for: Wood Saw" with "45 products found",
   and the product is not on the page. This was seen once in 18 runs before the driver waited for the listing. The
   search itself (`GET /products/search`) returns 1 product for "Wood Saw".
7. **Version.** The title says v5.0. The page footer says `v2.5 | Built 2026-10-11 | Angular 20.0.5`.
8. **Extra UI not mentioned in section 2:** a permanent banner "Practice Black Box Testing & Bug Hunting" with the
   buttons "Testing Guide" and "Bug Hunting", `chat-toggle`, `live-activity-toggle`, `compare-btn`, and
   `course-promo`. The site loads a Cloudflare challenge script (`/cdn-cgi/challenge-platform/...`). No rate limit
   or block was seen.
9. **Console errors.** The browser console logged errors on every page (3 on the home page, more on checkout).
   Their content was not analysed.
10. **First add** sends `POST /carts` (create) and then `POST /carts/{id}`. Later adds send only `POST /carts/{id}`.

Everything else in section 2 matched: test ids, the `/checkout` URL, the empty message, the toast texts, and the
change → PUT → refetch sequence. Also: the cart id in `sessionStorage` (`cart_id`, `cart_quantity`), the header
counter hidden at zero, 9 products per page, and Long Nose Pliers out of stock (`out-of-stock`, add button disabled).

## Selectors used by the driver

`testIdAttribute` is `data-test`.

| Purpose | Locator |
| --- | --- |
| Listing cards | `getByTestId(/^product-[0-9A-Z]{26}$/)` |
| Card name | `getByTestId('product-name')` inside a card, exact text |
| Paging | `getByRole('button', { name: 'Page-N', exact: true })`; next page is ready when the old first card is detached |
| Search | `getByTestId('search-query')`, `getByTestId('search-submit')`; signal: `GET /products/search` response |
| Product heading | `getByRole('heading', { level: 1 }).and(getByTestId('product-name'))`; name = own text nodes only |
| Unit price | `getByTestId('unit-price')` |
| In stock | `getByTestId('out-of-stock')` not visible |
| CO2 rating | `getByTestId('co2-rating-badge').locator('.active')`: **CSS class, see deviation** |
| Quantity / add | `getByTestId('quantity')`, `getByTestId('add-to-cart')` |
| Cart line row | `getByRole('row').filter({ has: getByTestId('product-title') with exact text })` |
| Line quantity | `getByTestId('product-quantity')` in the row; committed with Tab (`change` event) |
| Remove button | `locator('a')` inside the line row (no test id, no accessible name) |
| Toast | `getByRole('alert').filter({ hasText: <message> })` |
| Cart ready | `getByTestId('cart-total').or(getByText(/the cart is empty/i))` |
| Cart read | one in-page read: lines = `tr` containing `[data-test="product-title"]`; summary = every `[data-test^="cart-"]` in the table holding `[data-test="cart-total"]`; label = the other cells of the same `tr` |

Acknowledgment signals: add → `POST /carts/{id}` 2xx + toast `Product added to shopping cart.`; quantity →
`PUT /carts/{id}/product/quantity` 2xx + toast `Product quantity updated.`; remove →
`DELETE /carts/{id}/product/{productId}` 2xx + toast `Product deleted.`.
