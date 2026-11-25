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

