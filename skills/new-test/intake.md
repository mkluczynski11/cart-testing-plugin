# new-test: intake and confirmation

## Scope (design 1.2)

In scope: a guest's cart, steps `add`, `setQty`, `remove`, checks of the cart state and total after named steps.
Out of scope, refused before anything is written, naming the missing feature: login, checkout, payment, coupons or
discount codes, shipping, taxes charged after the cart, wish lists, several scenarios in one request, any step the
grammar has no kind for. Example refusal: "The plugin cannot apply a coupon: the scenario grammar has only add, change
quantity and remove (a `set` step for cart attributes is not built yet). I have written nothing."

## Calibration pairs (design 5.3): decide yourself, map the words, or stop

| Situation in the request | Behaviour | Request → scenario |
| --- | --- | --- |
| Freedom in choosing data | choose, and show the choice in the confirmation | "add two different products" → `A: first-available`, `B: next-available, distinct_from: [A]`, `add` 1 each |
| Freedom in choosing data | choose, and show it | "change the quantity of one" → `setQty` of A to 3 (A is the one; 3 differs from the current quantity) |
| Freedom in choosing data | choose, and show it | "add a product" without a name → `first-available`; with a name "Product A" → `by-name, name: "Product A"` |
| Meaning of actions and objects | map the words, not a familiar pattern | "add two more" → `add` 2 (the quantity grows by 2) |
| Meaning of actions and objects | map the words | "set the quantity to two" → `setQty` 2 |
| Meaning of actions and objects | map the words | "increase the quantity of the second and remove the first" → `setQty` on B, `remove` on A, not the reverse |
| Meaning of actions and objects | map the words | "add two units, then two more of the same" → `add A 2`, `add A 2`, `cart_after: { A: 4 }`; no `setQty` |
| Meaning of actions and objects | map the words | "check the total after each change" → `check: each-step`; "only at the end" → `check: last-step` |
| A change of the requirement | ask one question, write nothing | "check that the cart works" (no steps, no expectation): ask what the shopper does and what to check |
| A change of the requirement | ask | "check the total" when a rule applies, without saying before or after the discount |
| A change of the requirement | ask | "remove one of them" when which one changes what the test proves (e.g. only one of them meets a rule's condition) |
| An out-of-scope feature | refuse, write nothing | "use a coupon", "log in", "go to checkout" |

A product named by the tester is `by-name`. A required attribute ("a product with `<attr>` `<value>`") is `where` on an
unnamed pick, and the attribute must be one the driver provides (`qa-harness need` tells). Quantities you choose are
small (1–4), never above a purchase limit of the rules file.

## Confirmation (design 11.1)

Fill every `<…>` from the scenario you wrote, the output of `qa-harness example <slug>` and the rules file. Amounts
come only from the `example` output; rule wording only from the rules file. In the language of the request.

```text
Scenario: <slug>
<alias> = <how it is picked, in words>, …
Plugin's choice: <every choice you made yourself: which product changes, quantities, which is removed, checkpoints>

Step  Shopper's action            Cart after the step
S1    adds A, 1 unit              A×1
S2    adds B, 1 unit              A×1, B×1
S3    changes quantity of A to 3  A×3, B×1
S4    removes B                   A×3
The cart state and the total are checked after <every step | the steps named>.

Example on stub prices (<stub of each alias as `example` printed it>):
S1 $10.00 · S2 $30.00 · S3 $50.00 · S4 $30.00
Rules: <each rule as `example` printed it>, or "no pricing rule applies".
Source of each rule: <provenance from the rules file: code | tester | observed; confirmed live or not>.

Assumptions: guest, empty cart, no geolocation, prices from the <product page | API>,
the total is the row labelled "<summary.total label of the rules file>".
<the first line of `qa-harness defects check <slug>`, verbatim: "The test will be checked against …">
Confirm? (ok / correction)
```

The example rows above show the layout only; never copy their amounts. With `--yes` replace the last line by
"Confirmed by --yes."
