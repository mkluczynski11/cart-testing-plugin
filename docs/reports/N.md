# Report N: merge A and B, full harness of design v0.3

Branch `n-harness`, worktree `.worktrees/n-harness`. Started `Wed Nov 25 00:28:59 UTC 2026`.

## Plan

Time box 180 min from 00:28:59 UTC; no new stage after 02:58:59 UTC (150 min).

| Stage | Target | Budget |
| --- | --- | --- |
| 0 | merges, order committed, plan (this section) | 10 min |
| 1 | layout `templates/e2e` + `examples/toolshop`; driver on `support/core/money` and library errors; live fixture; `toolshop.map.md`; first live run | 30 min |
| 2 | grammar (`preconditions`, `price_source`, `where`), V1–V8 per 8.1, example with stubs and attribute search, freeze in the example, full driver interface, rule vocabulary, compiler 8.4, layered soft checkpoint with the 9.1 message | 40 min |
| 3 | operators and derived defects, `defects.json`, applicability, G0 (parser-based), G1, G2, verdict dictionary and routing, `doctor`, `need`, CLI names of 6.1 | 40 min |
| 4 | reporter, run directories, `run` G0–G3, attempts, promotion, `report.md`, `cart-eco-threshold`, negative checks | 30 min |
| 5 | live controls, control page with its drivers, browser selftest rows, `verify` | 30 min |

Files (new or rewritten), all under `templates/e2e/` unless noted:

- `support/core/`: `types.ts` (8.3 interface), `money.ts` (locale/currency parser), `pricing.ts` (9.2 vocabulary),
  `config.ts` (qa.config.json, roots), `scenario.ts` (grammar, hashes, freeze), `validator.ts` (V1–V8),
  `ledger.ts`, `example.ts` (stubs, attribute search, gaps), `compiler.ts` (8.4), `selection.ts` (8.3 product
  selection), `shopper.ts`, `checkpoint.ts` (9.1 layers, message), `reference-cart.ts`, `operators.ts` (10.3,
  6.2 of the order), `fixtures.ts`, `reporter.ts` (8.5), `live-controls.ts` (10.6), `verdicts.ts` (6.3 + routing),
  `MANIFEST.json`.
- `support/harness/`: `cli.ts`, one module per subcommand (`example`, `compile`, `need`, `defects`, `run`,
  `verify`, `report`, `doctor`, `selftest`), `lint.ts` (G0), `gates.ts` (G1/G2), `playwright-runner.ts`,
  `run-dir.ts`, `manifest.ts`, `fixtures/` (selftest scenarios, `reference.pricing.ts`), `control-app/`
  (server, page, drivers, pricing, config).
- `unit/`: one spec per core module.
- `examples/toolshop/`: `qa.config.json`, `app/toolshop.{driver,pricing}.ts`, `app/toolshop.map.md`,
  `lab/driver.live.spec.ts`, `specs/`, `tests/`, `reports/`, `support` symlink, `tsconfig.json`.

Approach: keep order A's modules where they already match the design and rewrite in place; one commit per
stage; live budget counted below; every stage ends with unit tests, selftest and `tsc` green.

Live invocations used: 0 / 20.

## Open questions


## Stage 1 — reconcile A and B, new layout, first live green

Started `Wed Nov 25 00:32:37 UTC 2026`, committed `8d38db0` at 00:53 UTC.

Built:
- Layout of order section 1. `templates/e2e/` holds only the library, the harness, the unit tests and empty
  `specs/ tests/ app/ reports/`; `examples/toolshop/` holds `qa.config.json` (settleMs 1000, probeMs 5000),
  `app/toolshop.{driver,pricing}.ts`, `app/toolshop.map.md`, `lab/driver.live.spec.ts` (project `driver-live`),
  the scenario, its example and compiled test, and the committed symlink `support -> ../../templates/e2e/support`.
  `scratch/` is deleted. `npm run qa:toolshop` = the CLI with `--root ../../examples/toolshop`;
  `npm run typecheck:toolshop` type-checks the example root through its own `tsconfig.json` (`paths` for
  `@playwright/test` and `yaml`). The fallback of section 1 was not needed.
- The driver parses amounts with `support/core/money` (`parseAmount`, the product page with the symbol
  optional) and throws `PreconditionError` (with the alert text), `LocatorError` and `InfraError`;
  `toolshop.money-temp.ts` is deleted. `toolshop.pricing.ts` is typed with the library's types; every entry has
  provenance.
- The live fixture: the app named in the root's `qa.config.json`, its driver and rules file, a fresh browser and
  context per test launched from the `playwright` fixture (so project `dry` never starts a browser), `locale` and
  `testIdAttribute` from the config, `permissions: []`, no storage state, a trace kept only for a failed repeat.
- Most of the library was rewritten in its final form here rather than patched twice: `money` (locale and currency
  parser via Intl separators, no float), `pricing` (9.2 vocabulary), `scenario`, `validator` (V1–V8 renumbered to
  8.1), `ledger`, `example`, `compiler`, `checkpoint` (all layers, soft), `shopper`, `selection`, `operators`,
  `reference-cart`, `verdicts` (full dictionary). The CLI of stage 1 has `selftest`, `example`, `compile`, `run`.

First joint live run of A's oracle and B's driver. It failed twice before it was green, both times on the
empty-cart precondition, not on an amount:

1. Run `20261125T004524Z-b5c5`: `INFRA_FAIL` (then misclassified; fixed: a setup error now carries its own
   verdict). In a session that never had a cart, `/checkout` renders neither the table nor the empty message.
   Probe (invocation 2): the page shows only the navigation; no `nav-cart`.
2. Run `20261125T004716Z-5ce0`: `FLAKY`, 2/3 pass. The failed repeat's trace shows the application throwing
   `TypeError: Cannot read properties of null (reading 'cart_items')` in a loop on `/checkout` without a cart, and the
   page never rendering. Fix: `readCart` in a session without a cart reads the header (no `nav-cart` counter =
   no cart) and goes to `/checkout` only when a cart exists (`toolshop.map.md`, `readCart` row).
3. Run `20261125T004827Z-92d2`:

```text
Run 20261125T004827Z-92d2 of cart-total-add-change-remove
G3 live, 3 repeat(s) on https://practicesoftwaretesting.com: 3/3 pass; 3/3 repeats ended PASS
   products: Combination Pliers ($14.15, co2_rating D)
   S1   add Combination Pliers, 1 unit         expected $14.15    displayed "$14.15" in row "Total"  pass
   S2   add Pliers, 1 unit                     expected $26.16    displayed "$26.16" in row "Total"  pass
   S3   set quantity of Combination Pliers to 3 expected $54.46    displayed "$54.46" in row "Total"  pass
   S4   remove Pliers                          expected $42.45    displayed "$42.45" in row "Total"  pass
Evidence: reports/cart-total-add-change-remove/runs/20261125T004827Z-92d2/
VERDICT: PASS
```

The amounts equal order B's H2 prediction and its live readings exactly.

Checks: `npm run test:unit` 105 passed; `npm run qa -- selftest` 5/5 rows (unit, money, validator, compiler,
product selection) `VERDICT: PASS`; `npx tsc --noEmit` clean in `templates/e2e` and for the example root.

Deviations:
- The selftest fixtures and the reference rules file no longer use Toolshop names or prices (Wood Saw, Claw
  Hammer, $14.15, `co2_rating`): the reference app's rule is `green-discount` on `energy_class`. Reason: quality bar,
  "templates/e2e contains no Toolshop name, selector, product or price".
- The design's `Displayed.value` is kept in the driver contract, but the checkpoint re-parses every `rawText`
  with the configured locale and currency, so a driver cannot hand the oracle a value the page did not show.

## Stage 2 — contracts and oracle as designed (8.1–8.4, 9.1–9.3)

Started `Wed Nov 25 00:53:08 UTC 2026`, committed at 00:55 UTC.

Built (most of it already written in final form during stage 1; listed here against the order):
- Grammar: `preconditions` (`empty-cart`, `guest`, `no-geolocation`) and `price_source` are required fields
  (V1); `where` on unnamed picks. V1–V8 with the numbering of 8.1: V4 step conditions, V5 a `setQty` that
  changes nothing, V6 `cart_after` agreement, V7 checkpoints including "the last step has a checkpoint", V8
  limits from the rules file (by-name products also get their product-specific limits).
- Freeze: `example <slug> --confirm` sets `status: confirmed` and writes `confirmed: { scenarioSha256,
  rulesSha256 }` into the example. The lock file is gone. A changed scenario or rules file is reported by name
  (`scenario-changed`, `rules-changed`).
- Example (8.2, order 6.1): stubs `Product A`, `Product B`… or the `by-name` name; $10, $20… in declaration order;
  the attribute search over "first alias matching, then the next combination", pinned by `where`; a rule that is
  always or never in force is a scenario gap, never a failure. The reference scenario reproduces 8.2:
  $9.50 · $30.00 · $47.50 · $28.50.
- Driver interface 8.3 in full (`controls`, `provides`, optional `setAttribute`, `apiPrice`, `listPrice`);
  `ProductFilters { needQty, where }`; selection in `support/core/selection.ts`.
- Rule vocabulary 9.2: `always`, `shareOfUnits`, `hasUnits`, `subtotalAtLeast`; percent of the subtotal, of the
  running value, or fixed. The "rules only reduce" comment is at the top of `pricing.ts`.
- Compiler output as 8.4: `test.use({ preconditions, priceSource[, reserved] })`, `filters: { needQty[, where] }`,
  a blank line after each checkpoint; golden file `support/harness/fixtures/golden/reference.spec.txt`.
- Checkpoint 9.1: layers state, labels (and "is it an amount" — read errors before any amount), lines, unit price,
  line total (exact), adjustments (by absolute value), subtotal (exact), total (half a cent); soft: the shopper
  records a red checkpoint, keeps going from the expected state, and fails at the last checkpoint with the first
  mismatch. Verdict precedence inside a checkpoint: LOCATOR_FAIL > UNMODELED_ADJUSTMENT > ORACLE_MISMATCH.
- Fixture: preconditions before the first step (6.8); `price_source: api` takes the unit price from `apiPrice`
  and checks the product page price at the next checkpoint.
- `run <slug> --dry` = G1: the compiled test on the reference cart with the example's stubs; the ledger trace must
  equal `cart_after` and every checkpoint's exact total must equal the example's (`CONFORMANCE_FAIL` otherwise).

Check output:

```text
$ npm run test:unit            -> 112 passed
$ npm run qa:toolshop -- run cart-total-add-change-remove --dry
Run 20261125T005309Z-9028 of cart-total-add-change-remove (dry)
G1 ok: green on the healthy reference cart; ledger trace equals cart_after; totals equal the approved example
VERDICT: PASS
$ npm run qa:toolshop -- run cart-total-add-change-remove        (live invocation 5)
Run 20261125T005355Z-b4d8 of cart-total-add-change-remove
G1 ok: green on the healthy reference cart; ledger trace equals cart_after; totals equal the approved example
G3 live, 3 repeat(s) on https://practicesoftwaretesting.com: 3/3 pass; 3/3 repeats ended PASS
   products: Combination Pliers ($14.15, co2_rating D) · Pliers ($12.01, co2_rating D)
   S1   add Combination Pliers, 1 unit         expected $14.15    displayed "$14.15" in row "Total"  pass
   S2   add Pliers, 1 unit                     expected $26.16    displayed "$26.16" in row "Total"  pass
   S3   set quantity of Combination Pliers to 3 expected $54.46    displayed "$54.46" in row "Total"  pass
   S4   remove Pliers                          expected $42.45    displayed "$42.45" in row "Total"  pass
Evidence: reports/cart-total-add-change-remove/runs/20261125T005355Z-b4d8/
VERDICT: PASS
```

Deviations and choices:
- `ExampleRow` carries `totalExact` (the exact fraction) besides the rounded `total`, so G1 compares "exactly"
  (order 6.1) and not on rounded strings.
- V3 "lists all earlier aliases" is read as "all earlier unnamed aliases": a by-name product is already excluded by
  `reserved`, and the order's own `cart-eco-threshold` (A by-name, B `first-available`) requires it.
- The reference cart displays a rule's row with a literal text derived from its label pattern
  (`/^total\b/i` → `total`); a pattern that is not plain text is rejected with a message. The design does not say
  how the in-memory cart labels its rows.
