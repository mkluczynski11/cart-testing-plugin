---
scenario: wood-saw-raise-remove-other
run: 20261125T123701Z-8ba1
verdict: VERIFIED
---

# Review of run 20261125T123701Z-8ba1

| Gate | Result | Evidence |
| --- | --- | --- |
| Intent | current INTENT_OK | specs/wood-saw-raise-remove-other.intent.md, scenario_sha256 621785b3de62 (equals `intentSha256` in verification.json) |
| G0–G2 | PASS (`gates.dry`) | stub prices: 11 detected / 0 late / 0 missed / 2 not applicable (rule-boundary, round-down); live prices (`G2live` PASS): 12 detected / 0 late / 0 missed / 1 not applicable (rule-boundary) |
| G3 | PASS | 3 / 3 repeats passed on https://practicesoftwaretesting.com |
| G4 | PASS | 4 caught / 0 missed / 0 not bound; skew-total (activated, row "Total", read "$11.58" S1 … "$34.72" S4, red at S1), drift-price (activated, GET carts x7, red at S1), lost-update (activated, PUT quantity x1, red at S3), lost-remove (activated, DELETE product x1, red at S4); each reacted at its expected step |
| G5 | PASS | every checkpoint S1–S4 names the action in the tester's terms (add Wood Saw 1 unit; add Combination Pliers 2 units; set Wood Saw to 3; remove Combination Pliers), the expected total with its composition (eco-discount at S1, S3, S4; plain subtotal at S2), the displayed raw text, the row read ("Total"), and a screenshot per step; the report states the HTML report stays outside the repo and traces exist only for failed repeats (none here) |

Test origin: compiled (no step-by-step comparison needed; the test's calls nonetheless match S1–S4: by-name Wood Saw x1, first-available x2, setQuantity(a, 3), remove(b), checkTotal after each)

Live data: A = Wood Saw $12.18 (co2_rating B), B = Combination Pliers $14.15 (co2_rating D); B is not the saw, so "the other product" is a distinct product.

Scenario gaps and the hint that closes each:
- rule-boundary (eco-discount threshold): add a step after which exactly half of the units in the cart are Wood Saws (for example the saw at 2 units next to 2 units of the other product), so the cart sits exactly at the "more than half" threshold of the eco-discount.
- round-down (stub prices only; detected on the live prices of this run): no change needed for this run; it stays not applicable only on the approved example's stub prices.

Finding: none
