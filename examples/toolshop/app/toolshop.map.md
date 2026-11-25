# Toolshop driver map

Evidence for every action of `app/toolshop.driver.ts` (design 8.3). Source of the facts:
`docs/toolshop-facts.md` (order B, live lab, 2026-11-25) and the runs of order N.
`testIdAttribute` is `data-test`. The driver goes through the UI only; the request names below are the
acknowledgment signals it waits for and the bindings of the live controls, never calls it makes itself.

| Action | Locator | Why this locator | Completion signal | Network requests | Pitfalls |
| --- | --- | --- | --- | --- | --- |
| `candidates()` | `getByTestId(/^product-[0-9A-Z]{26}$/)` cards, names from `getByTestId('product-name')`; paging `getByRole('button', { name: 'Page-N', exact: true })` | cards carry a stable `data-test` per product; the pager buttons have accessible names | first card visible; on paging, the previous first card is detached | `GET /products` (listing) | 9 products per page; the listing is re-entered for every page because the caller navigates in between |
| `productFacts(name)` | search box `search-query` + `search-submit`, card by exact `product-name`; heading `getByRole('heading', { level: 1 }).and(getByTestId('product-name'))`; price `unit-price`; stock `out-of-stock`; rating `co2-rating-badge` `.active` | the heading is the page's own name; the test ids are deployed (H3) | heading with the name visible | `GET /products/search`, `GET /products/{id}` | the heading also holds an `ECO` badge, so the name is read from its own text nodes; `unit-price` has no `$` (the symbol is outside the element); **CO2 rating: CSS class `active` (locator exception)**, because the badge renders all letters A–E and nothing else marks the rating (order N, decision 4) |
| `addProduct(name, qty)` | `quantity` input, `add-to-cart` button | deployed test ids | `POST /carts/{id}` 2xx **and** toast `Product added to shopping cart.` (`role="alert"`) | first add: `POST /carts` then `POST /carts/{id}`; later adds `POST /carts/{id}` | search race: a late listing response overwrites the search result, so the driver waits for the initial listing and for the `/products/search` response before clicking (facts §6) |
| `setQuantity(name, qty)` | row `getByRole('row')` filtered by `product-title` with the exact name; `product-quantity` inside it, committed with Tab | the row is the line's own container; the input has a test id | `PUT /carts/{id}/product/quantity` 2xx **and** toast `Product quantity updated.` | then `GET /carts/{id}` (refetch) | the toast arrives about 100 ms before the refetch: the action returns on the acknowledgment and the library polls the cart (settleMs 1000) |
| `remove(name)` | the only `a` element in the line's row | the remove control has no test id and no accessible name (facts H3) | `DELETE /carts/{id}/product/{productId}` 2xx **and** toast `Product deleted.` | then `GET /carts/{id}` | removal settles in 112–137 ms (facts, settle time) |
| `readCart()` | one in-page snapshot: lines = `tr` holding `product-title`; amounts `product-quantity`, `product-price`, `line-price`; summary = every `[data-test^="cart-"]` inside the table that holds `cart-total`, label = the other cells of the same `tr` | label and amount from one row element (design 8.3); one snapshot cannot tear during a re-render (order B, run 1) | `cart-total` or the text `The cart is empty` visible | `GET /carts/{id}` | `Subtotal` and `Eco-Friendly Discount (5%)` rows sit in `<tbody>`, not `<tfoot>` (H6). **A session that never had a cart:** `/checkout` throws in the application (`Cannot read properties of null (reading 'cart_items')`) and sometimes renders nothing for 10 s; the driver therefore reads the header first and reports the empty variant when there is no `nav-cart` counter (order N, stage 1) |

Refusals: a non-2xx action response other than 5xx is a `PreconditionError` carrying the text of the alerts
on the page (e.g. a unit limit); a 5xx response is an `InfraError`; a locator that does not respond within
`actionMs` is a `LocatorError`.

Live control bindings (`controls`, design 10.6):

| Control | Binding | Source |
| --- | --- | --- |
| `lost-update` | `PUT **/carts/*/product/quantity` | facts, acknowledgment signals |
| `lost-remove` | `DELETE **/carts/*/product/*` | facts, acknowledgment signals |
| `drift-price` | `GET **/carts/*`, `pricePath` `cart_items.0.product.price` | facts §10 (refetch); the body seen in a retained trace of order N (below) |

Response bodies, read from the trace of a failed repeat of order N (run `20261125T010833Z-2c2c`, 2026-11-25):
`POST /carts` 201 `{"id":"…"}`; `POST /carts/{id}` 200 `{"result":"item added or updated"}`;
`PUT /carts/{id}/product/quantity` 200 `{"result":"item added or updated"}`; `DELETE /carts/{id}/product/{productId}` 204 with
no body; `GET /carts/{id}` 200 `{"id", "additional_discount_percentage", "lat", "lng", "cart_items": [{"id", "quantity",
"discount_percentage", "cart_id", "product_id", "product": {"name", "price": 12.18 (a JSON number), "co2_rating",
"is_eco_friendly", …}}]}`. The UI computes the displayed unit price from `cart_items[].product.price`.

Attributes the driver reads (`provides.attrs`): `co2_rating`.
