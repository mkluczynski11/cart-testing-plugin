# Order N — merge A and B, restore the full harness of design v0.3

Project: `cart-testing-plugin` (Claude Code plugin `qa`). Submission is today in the afternoon.
Orders A (core) and B (Toolshop driver) are finished on branches `a-core` and `b-driver`. They built a
reduced scope. This session merges them and brings the deterministic harness up to the full design:
`docs/design.md`, sections 6, 8, 9 and 10, are now the contract. It runs unattended overnight.

This order lives in the repo as `docs/orders/N.md`. After any context compaction, and whenever you are
unsure what comes next, re-read this file and `docs/reports/N.md` before doing anything else.

## Rules

Unattended run:
- Never ask a question and never wait for approval, including approval of your plan: write the plan at
  the top of `docs/reports/N.md` and start. Where you would ask, choose the option closest to the
  design, record it under "Open questions", and continue.
- Time box: 180 minutes. Write `date -u` into the report at the start of every stage. If more than
  150 minutes have passed since the first timestamp, finish the stage you are in, write the final
  report and stop. Do not start a stage you cannot finish.
- Work in the stages of section 2, in order. A stage ends with its checks green, all earlier checks
  still green, a commit, and its section appended to the report. If a stage's checks are not green
  after a reasonable effort, stop there: commit what works on the branch, write the report, do not start
  the next stage.
- Nothing you run may wait for input or run forever:
  - no `--ui`, `--debug`, `--headed`, `codegen`, watch modes or `playwright show-report`; the Playwright
    HTML reporter only with `open: 'never'`; a `globalTimeout` in the Playwright config;
  - `npx` only for binaries installed in `node_modules`, or with `--yes`; `git commit` and `git merge`
    always with `-m`;
  - no server left running from the shell: the control app is started and stopped by the harness itself,
    inside the process that needs it, with a start timeout.
- Commands the permission layer may refuse: do not use them, and do not retry a refused command in
  another form. Never: `git push`, `git reset --hard`, `git checkout -- .`, `git clean`, `git stash`,
  `sudo`, piping a download into a shell, global installs, writes under `.git/` or `.claude/`.
  Do not put `cd` and `git` in one command line; run git from the directory you are in. Do not prefix
  commands with your own environment variables (`FOO=bar npx …`): give the harness a flag or an npm
  script for it. If something is refused anyway, use an allowed alternative or note it and move on.

Engineering:
- English everywhere in the repo. Plan and file list first, then code. Tests are written with each module.
- The design is the contract. Where the current code differs from `docs/design.md`, the design wins,
  except for the decisions in section 3 and the mechanics in section 6 of this order.
- Read the design by section, when you need it: 6 (CLI, classification, verdicts), 7.4 (forbidden
  patterns), 8 (contracts), 9 (oracle), 10 (verification). Do not read it whole. Read
  `docs/reports/A.md`, `docs/reports/B.md` and `docs/toolshop-facts.md` first.
- Out of scope, do not create: `.claude-plugin/`, `skills/`, `agents/`, `hooks/`, `scripts/`, `bin/`,
  `evals/`, `.mcp.json`, `README.md`. No model is involved in anything you build here.
- Nothing outside scope; ideas go to the report. If a contract cannot be met: stop and report.
- No floating-point arithmetic on money. No fixed waits in any code.

Live site (https://practicesoftwaretesting.com):
- One browser, one worker, headless, no login, no checkout, no geolocation.
- Budget: at most 20 harness or Playwright invocations against it in the whole session. Count them in
  the report.
- If it is unreachable, rate-limits or blocks you: try once more later in the session, then skip the
  remaining live checks, say so in the report, and continue with the offline work.

## 1. Workspace and layout — do this first

The session is started inside the worktree `.worktrees/n-harness`, on branch `n-harness`, which the
owner has already created from `main`. Check it, then merge:

```bash
git rev-parse --abbrev-ref HEAD        # must print n-harness; otherwise stop and report
git merge --no-ff a-core -m "merge: core without a browser (order A)"
git merge --no-ff b-driver -m "merge: Toolshop driver and live facts (order B)"
git add docs/orders/N.md
git commit -m "docs(orders): order N"
```

The only file both branches touch is `templates/e2e/support/core/types.ts`, with identical content.
Work only in this worktree; all paths in this order are relative to it. Do not touch the main worktree
or the worktrees `a-core` and `b-driver`. Commit only on `n-harness`. Do not merge into `main`.

Target layout. `templates/e2e/` is what the plugin installs into a tester's repo, so it must contain
no application files and none of our scenarios. The Toolshop files move to an example root:

```text
templates/e2e/                  installed by /qa:setup; application-neutral
  package.json  package-lock.json  tsconfig.json  playwright.config.ts  .gitignore  qa.config.json
  support/core/**               the library
  support/harness/**            qa-harness, selftest fixtures (incl. the reference pricing file),
                                the control app with its drivers and pricing
  unit/**                       unit tests of the library
  specs/ tests/ app/ reports/   empty, with .gitkeep
examples/toolshop/              a tester's e2e root for the live Toolshop
  qa.config.json                app toolshop, baseURL, testIdAttribute, locale, currency, timeouts
  app/toolshop.driver.ts  app/toolshop.pricing.ts  app/toolshop.map.md
  lab/driver.live.spec.ts       the driver lab from order B (Playwright project driver-live)
  specs/  tests/  reports/      scenarios, compiled tests, promoted reports
  support -> ../../templates/e2e/support        committed symlink
```

- The harness already supports another root (`--root`, `QA_ROOT`; see report A). Make the Playwright
  config, the config loader and `tsc` work for a root outside `templates/e2e` (`paths` for
  `@playwright/test` in `tsconfig.json`; the driver and pricing files import types only).
- Add the npm script `qa:toolshop` = the CLI with `--root ../../examples/toolshop`.
- `templates/e2e/qa.config.json` keeps neutral defaults; `examples/toolshop/qa.config.json` holds the
  Toolshop values, with `timeouts.settleMs` 1000 and `probeMs` 5000.
- Fallback: if the example root cannot be made to work within about 15 minutes, keep the Toolshop
  files inside `templates/e2e` as they are, write that down as the first open question, and go on.
  In that case read `npm run qa:toolshop` below as `npm run qa`.

## 2. Stages

### Stage 1 — reconcile A and B, new layout, first live green

- The layout of section 1. `scratch/` is gone at the end of this stage.
- `app/toolshop.pricing.ts` is typed with the library's pricing types; every entry keeps its `provenance`.
- The driver uses `support/core/money`; delete `app/toolshop.money-temp.ts`. Product-page prices have no
  `$`; discounts display as `- $0.61`.
- A driver error starting `REFUSED:` becomes `PreconditionError` carrying the application's raw text;
  `LOCATOR:` becomes `LocatorError`, `INFRA:` becomes `InfraError`.
- Fill in the live variant of the fixtures: the shopper backed by the driver and pricing file of the
  app named in the root's `qa.config.json`; fresh context per test, `locale` from config, no
  permissions granted, `testIdAttribute` from config.
- Write `app/toolshop.map.md` from `docs/toolshop-facts.md`: for every driver action the locator, why it
  was chosen, the completion signal, the network requests, the pitfalls (design 8.3).
- Check: unit tests and `selftest` green; `tsc --noEmit` clean; the compiled reference test runs green
  once against the live Toolshop. This first joint run of A's oracle and B's driver is the most
  important fact of the night: paste its output into the report.

### Stage 2 — contracts and oracle as designed (design 8.1–8.4, 9.1–9.3)

- Scenario grammar: `preconditions`, `price_source`, `where` filters; validation V1–V8 with the numbering
  and meaning of design 8.1; freeze through `example <slug> --confirm`, recording `scenarioSha256` and
  `rulesSha256` in the example file. The separate lock file goes away.
- Example (8.2): stubs get attributes so that every pricing rule fires at least once and does not fire
  at least once; totals computed with the rules (section 6.1).
- Driver interface (8.3) in full: `controls`, `provides`, optional `setAttribute` and `apiPrice`;
  `ProductFilters` with `needQty` and `where`; product selection by the library as described there.
- Rule vocabulary (9.2): conditions `always`, `shareOfUnits`, `hasUnits`, `subtotalAtLeast`; amounts as a
  percentage of the subtotal, a percentage of the running value, or a fixed amount.
- Compiler output exactly as in 8.4 (`test.use({ preconditions, priceSource, reserved })`,
  `filters: { needQty }`); update the golden file. Same scenario, same bytes.
- Checkpoint (9.1): all layers, soft assertions so that every checkpoint is judged, the fixed message
  format of 9.1, arithmetic and tolerance of 9.3. The fixture enforces the preconditions and the
  isolation of 8.4 (section 6.8).
- Check: unit tests cover every validation rule and every checkpoint layer, both ways; the recompiled
  reference test is green on the reference cart and once more on the live Toolshop.

### Stage 3 — verification without a browser (design 10.1–10.5, 6.1, 6.3)

- Defects are derived by operators from the scenario's steps and the pricing rules (10.3, section 6.2);
  the thirteen defaults of 10.1 come out of that derivation, not from a list.
- Additional defects as data (10.4): `specs/<slug>.defects.json`, `qa-harness defects list` and
  `defects check` with the admission rules. No agent; origins `tester` and `generated` are both accepted.
- Applicability and results exactly as 10.5: comparison at the scenario's checkpoints; `detected`,
  `detected-late`, `missed`, `not-applicable`; scenario gaps reported with a hint.
- Gates: G0 static (section 6.3), G1, G2; entry point `qa-harness run <slug> --dry`; Playwright project `dry`.
- The full verdict dictionary of 6.3 in code, with the evidence-based routing table for
  `CONTROL_MISSED` and `FLAKY` as data. Positive verdicts are `PASS` and, from agents later, `INTENT_OK`
  and `VERIFIED`. Remove `GATES_OK`.
- `qa-harness doctor` (section 6.4) and `qa-harness need <slug>` (missing actions, attributes, bindings).
- CLI names exactly as the table in 6.1: `doctor`, `selftest`, `example [--confirm]`, `compile [--force]`,
  `need`, `defects list|check`, `run [--dry]`, `verify`, `report [--promote <runId>]`. Remove `confirm`
  and `gates`. Every subcommand prints at most 15 lines, then `VERDICT: <name>`; exit 0 only for `PASS`.
  `qa-harness --help` lists them with one line each.
- Check: the `selftest` rows of design 10.8 that need no browser are green;
  `npm run qa:toolshop -- run cart-total-add-change-remove --dry` gives `PASS`; and, in a temporary copy
  of the root, the checkpoint after S3 removed by hand gives `FILE_CONFLICT` from `compile` and
  `DEFECT_LATE` from `run --dry` (or `DEFECT_MISSED`, if a derived defect is then not caught at all).

### Stage 4 — runs and evidence (design 6.1, 8.5)

- Reporter and run directories (8.5, section 6.5): `run.json`, the failure record, raw text of every
  amount, written also after an exception or a timeout; `attempts.json` with `RETRY_REFUSED` and
  `LIMIT_REACHED` (R9); `report.md` readable without the code; a Playwright HTML report per run;
  `report --promote <runId>` replacing the tracked set atomically. No cookies, headers or tokens in
  any file (R15).
- `qa-harness run <slug>`: gates G0–G3 with the classification order of 6.1, including `INFRA_FAIL` from
  the address probe, `NO_TESTS_RUN` from the completeness count, and `FLAKY`.
- `examples/toolshop/specs/cart-eco-threshold.md`: A = `by-name` "Wood Saw", B = `first-available`;
  add A 1; add B 2; setQty A 3; remove B. Units rated A or B: 1 of 1, 1 of 3, 3 of 5, 3 of 3.
- Check, with every output kept in the report:

```bash
npm run qa:toolshop -- run cart-total-add-change-remove     # PASS, 3/3
npm run qa:toolshop -- run cart-eco-threshold               # PASS, 3/3; discount on, off, on, on
npm run qa:toolshop -- report cart-total-add-change-remove --promote <runId>
npm run qa:toolshop -- report cart-eco-threshold --promote <runId>
```

- Two negative checks, each in a temporary copy of the example root, nothing of them committed except
  their output in the report:
  1. `baseURL` set to an unreachable host: `INFRA_FAIL`, no locator verdict.
  2. The eco rule removed from the Toolshop pricing file, scenario re-confirmed, `run cart-eco-threshold`:
     `UNMODELED_ADJUSTMENT` naming the row "Eco-Friendly Discount (5%)". Keep the complete output: it is
     the observation behind the main design decision.
- From this stage on the repo holds what the assignment asks for: a compiled test and the evidence of a
  real browser run. Make `report.md` good enough to hand to a reviewer as it is.

### Stage 5 — live controls and the control page (design 10.6, 10.8)

- Live controls (10.6, section 6.6): `skew-total`, which finds the total row by itself from the label in
  the pricing file and never through the driver; `drift-price`, `lost-update`, `lost-remove` through the
  driver's request bindings. The four facts are recorded for every control. Control runs extend the
  test limit as 8.6 says. `verification.json`. `qa-harness verify <slug>`: gates G0–G4 in a new run directory.
- The control page (section 6.7): its own driver and pricing file under app name `control`, plus a wrong
  driver that reads the subtotal as the total.
- `selftest` gains the browser part: every remaining row of the table in 10.8, including the control
  page row (correct driver passes G3 and G4; the wrong driver passes G3 on equal values and gets
  `CONTROL_MISSED` with the evidence "control active, test green"; with a discount it gets
  `LOCATOR_FAIL` at the label layer) and the parallelism row.
- The Toolshop driver gets its `controls` bindings (requests listed in `docs/toolshop-facts.md`) and
  `provides: { attrs: ['co2_rating'] }`.
- Check: `npm run qa -- selftest` green with all rows of 10.8; then, on the live site:

```bash
npm run qa:toolshop -- verify cart-total-add-change-remove  # PASS: G0–G4, four facts per control
npm run qa:toolshop -- verify cart-eco-threshold            # PASS
```

  and the two verified runs promoted in place of the ones from stage 4.

### Final — polish and hand-over, only when stage 5 is green or the time box says stop

- Read `examples/toolshop/reports/*/report.md` as a QA engineer who has never seen the code. Fix
  anything unclear in the generator, not in the file.
- Section 7 of this order, applied to everything touched tonight.
- The exit criteria of section 4, the report of section 5.

## 3. Decisions already taken — do not reopen

1. Rules only reduce the total in v1. A surcharge is outside the vocabulary; say so in a comment in
   `pricing.ts`. Adjustment amounts are compared by absolute value, the total checks the direction (9.3).
2. Defects are compared at checkpoints, not after every step (10.5). With `check: last-step` a defect
   visible only mid-scenario is `not-applicable` and is reported as a scenario gap.
3. The freeze covers the rules file: a changed rules file invalidates the approved example
   (`SCENARIO_CHANGED` from `doctor`, design R6).
4. The CO2 rating is read through the CSS class `active` inside `co2-rating-badge`. This is an accepted,
   documented exception: nothing else on the page identifies it. The static check flags CSS-class
   locators in drivers unless the line carries `// locator-exception: <reason>`, and `toolshop.map.md`
   records the reason.
5. An action is acknowledged by its 2xx response and the toast together, as order B built it.
6. `readCart` as one in-page snapshot is fine: it reads only what the page displays.
7. `price_source: api` is validated and wired through `apiPrice`, but no driver has to implement it
   now; `need` reports it as missing when a scenario asks for it.
8. The Toolshop files live in `examples/toolshop/`, not in the template (section 1). The design's
   section 12 says the same; orders A and B put them in the template only for speed.

## 4. Exit criteria — run in `templates/e2e/`, each result pasted into the report

```bash
npm ci
npx tsc --noEmit
npm run test:unit
npm run qa -- selftest                                          # VERDICT: PASS, all rows of design 10.8
npm run qa:toolshop -- doctor                                   # VERDICT: PASS
npm run qa:toolshop -- run cart-total-add-change-remove --dry   # VERDICT: PASS, no defect missed or late
git status --short                                              # clean after the last commit
```

Plus the live outputs of stages 1, 2, 4 and 5.

## 5. Report: `docs/reports/N.md`

Plan at the top. Then one section per stage, appended when the stage ends: timestamp, what was built,
the check output, deviations from the design with the reason. At the end:

- the exit criteria table;
- the negative checks with their output;
- every place where the design turned out ambiguous, incomplete or wrong, and what you chose;
- open questions;
- measurements: wall-clock per stage, lines of code and of tests, live invocations used;
- a hand-over for the sessions that build the plugin on top of this tomorrow morning: for every
  subcommand one real sample of its output and the verdicts it can return; the exact files a scenario
  produces and where; what a skill may write and what only the harness writes; what is known not to work.

Commit on `n-harness` with English messages, at least one commit per stage.

## 6. Implementation notes — where the design says what, not how

The design fixes behaviour and contracts. These notes fix the mechanics it leaves open. They are
binding; anything still open after them is your choice, recorded in the report.

### 6.1 Example stubs (stage 2)

- Stub products are named `Product A`, `Product B`, … by alias, or by the scenario's own name for a
  `by-name` pick; prices are $10.00, $20.00, $30.00, … in declaration order.
- Attributes: for every attribute a rule or a `where` filter mentions, search the assignments of
  "matching value" / "non-matching value" over the aliases in a fixed order (first alias matching, the
  rest not; then the next combination) and take the first one under which every rule is in force at
  some checkpoint and not in force at another. A `where` filter on an alias pins that alias.
- If no assignment achieves that for a rule, keep the first assignment and report a scenario gap:
  "rule <id> is always / never in force in this scenario". Never fail the example for it.
- The reference cart's catalog for a scenario is built from these stubs and uses the rules of the app's
  own pricing file, so G1 can compare the test's totals with the approved example exactly
  (`CONFORMANCE_FAIL` otherwise). The pricing file that orders A's selftest used moves to
  `support/harness/fixtures/`.

### 6.2 Operators and derived defects (stage 3)

One defect per operator and target, with these ids and exact effects:

| Operator | Target | Id | Effect in the reference cart |
| --- | --- | --- | --- |
| `no-effect` | each step kind in the scenario | `lost-add`, `lost-qty`, `lost-remove` | the operation is acknowledged and changes nothing |
| `wrong-target` | `setQty`, `remove`, when the cart has two or more lines | `qty-wrong-line`, `remove-wrong-line` | the operation hits the next line in cart order, wrapping around |
| `stale-value` | total | `stale-total` | the total shown is the one from before the last change; lines are current |
| `skew-value` | total | `total-off-by-cent` | total + $0.01 |
| `ignore-factor` | line total | `line-ignores-qty` | line total = unit price; the cart total stays correct |
| `rule-never`, `rule-always` | each rule | `rule-never:<id>`, `rule-always:<id>` | the rule's condition is forced false / true |
| `rule-rate` | each rule with a rate | `rule-wrong-rate:<id>` | the rate is doubled |
| `rule-boundary` | each rule with a threshold | `rule-boundary:<id>` | "above" becomes "at or above" (and the reverse for `subtotalAtLeast`) |
| `round-mode` | total and adjustments | `round-down` | truncate toward zero at the cent instead of rounding |

With one rule the short ids of design 10.1 are used without the `:<id>` suffix.
Additional defects (`defects.json`): `operator` from this table; `target` is `{ "value": "total" |
"subtotal" | "lineTotal" }`, `{ "adjustment": "<rule id>" }` or `{ "step": "add" | "setQty" | "remove" }`;
`when` may hold `afterStep` (a step kind) and `direction` (`increase` | `decrease`), and limits the
defect to those moments. `defects check` rejects an unknown operator, a target absent from the scenario
and the rules, and a defect whose simulated views equal those of an already admitted one at every checkpoint.

### 6.3 Static gate G0 (stage 3)

Use a real parser, not regular expressions: the installed `typescript` package if it exposes
`createSourceFile` (report A says TypeScript resolved to 7.x, so check before relying on it); otherwise
add one small parser dependency and name it in the report.
- Test file: the only import is `../support/core/fixtures`; the body is `test.use(...)` and one `test(...)`
  whose statements are `await shopper.<add|setQuantity|remove|checkTotal>(...)` with or without a `const`;
  no other identifiers called, no `if`, `try`, loops, `expect`, `page`, `process.env`, no numeric or
  string literal that parses as an amount.
- Drivers under `app/`: no `waitForTimeout`; no `page.request`, `fetch`, `request.newContext`; `goto`
  only with relative paths or the configured origin; no XPath; a CSS-class locator only with the
  `// locator-exception:` marker; no import from outside `support/core` and Playwright.
- A violation is `LINT_FAIL` with file, line and the rule broken.

### 6.4 Integrity and `doctor` (stage 3)

`support/core/MANIFEST.json` lists every file of `support/core` and `support/harness` with its SHA-256.
`doctor` recomputes and reports `HARNESS_MODIFIED` with the changed files. `doctor --write-manifest`
regenerates it and is meant for the plugin repo only; the last commit of every stage regenerates it.
`SCENARIO_CHANGED`: scenario or rules hash differs from the confirmed example.
`VERIFICATION_STALE`: `verification.json` stores the hashes of the test, the driver and the rules file;
`doctor` compares them with the files on disk. `doctor` also checks Node, the Playwright browser and
that the driver of the configured app satisfies the interface and the UI boundary (R13).

### 6.5 Reporter and run directories (stage 4)

- A custom Playwright reporter builds `run.json` from the `checkpoint` attachments; it writes on
  `onTestEnd` and again on `onEnd`, so an exception or a timeout still leaves a file.
- Run id: UTC timestamp `YYYYMMDDTHHMMSSZ` plus four hex characters. The directory is created with an
  exclusive `mkdir`; on collision a new suffix is drawn.
- In live mode the checkpoint takes a full-page screenshot after its last read, named `<step>.png`.
- Every checkpoint is a `test.step` named with the step id, the action in the tester's words and the
  expected total, so the Playwright HTML report reads as the scenario. The HTML report of a run goes to
  `runs/<runId>/html/` with `open: 'never'`; a trace is kept only for a failed repeat.
- Lock for `attempts.json` and promotion: `reports/<slug>/.lock` created with the exclusive flag, removed
  on exit, considered stale after 10 minutes.
- Promotion: build the complete set in `reports/<slug>/.promote-<runId>/`, then rename the files into
  place and remove the previous screenshots; never leave a mix of two runs.
- Repair attempts: `run <slug> --repair <driver|test>` records an entry in `attempts.json` with the
  SHA-256 of that file before the run. A second `--repair` run with an unchanged hash is `RETRY_REFUSED`;
  the third attempt for one scenario is `LIMIT_REACHED`. A plain `run` is never counted.
- After a red checkpoint the shopper continues from the expected state, so later checkpoints are still
  judged; the test fails at its end with the first mismatch as its error.
- `report.md` follows the readback of design 11.2 and the file list of 11.4: verdict line; products
  with price and attributes; the step table with expected (and its composition), displayed raw text,
  the row label and the result; evidence that exists and evidence that does not; scenario gaps with
  hints; rules used with provenance; the rerun command.

### 6.6 Live controls (stage 5)

- One control per run, one repeat, in its own run directory; `verify` runs them after a green G3.
- `skew-total`: installed with `page.addInitScript`. A `MutationObserver` looks for an element whose
  visible text, after trimming, matches `summary.total.label` and whose row (closest `tr`, `li`, `dl`
  group or parent block) contains exactly one text node that parses as an amount; header cells and rows
  with several amounts are skipped. It rewrites that amount to +0.01 in the page's own format and keeps
  it there after every re-render. It records on `window.__qaControl`: `activated`, the label text, the
  row's outer HTML truncated to 300 characters, and the text shown after each rewrite. The checkpoint
  copies `window.__qaControl` into its attachment right after its read; the reporter derives the four
  facts from that.
- Network controls use `page.route` with data-only bindings on the driver:
  `controls: { setQuantity: { method, urlPattern }, remove: { method, urlPattern }, cart: { method, urlPattern, pricePath? } }`.
  `lost-update` and `lost-remove` answer the request with the status and body shape of a success without
  forwarding it. `drift-price` forwards the cart request and raises the first line's price by 0.01 at
  `pricePath`; when a driver gives no `pricePath`, the control is reported as "not bound: lower coverage".
- Expected result per control: `skew-total` red with a total mismatch of exactly +0.01 at every
  checkpoint that shows a total; `lost-update` first red at the first `setQty` checkpoint; `lost-remove`
  first red at the first `remove` checkpoint; `drift-price` red from the first checkpoint. A control
  whose step kind is absent from the scenario is "not applicable", not missed.
- After the live run G2 is repeated on the real prices and attributes read during that run; the numbers
  in `report.md` come from this second pass (design 10.2).

### 6.7 Control page (stage 5)

- Served by a Node `http` server in `support/harness/control-app/`: static HTML with vanilla JavaScript,
  and a JSON API `GET /api/products`, `GET /api/cart`, `POST /api/cart/items`, `PUT /api/cart/items/:id`,
  `DELETE /api/cart/items/:id`, cart kept per session cookie. No framework, no build step. Bound to
  `127.0.0.1` on an ephemeral port; started and stopped by the harness.
- Deliberately unlike Toolshop: no table (a list with definition groups), `data-qa` instead of
  `data-test`, currency EUR with the format `1.234,50 €`, a subtotal row that is always shown, a total
  of `0,00 €` in the empty cart, a status region instead of a toast. Six products, one out of stock.
- Its own rule, implemented in the server in plain code: 10% off when the subtotal is at least 50,00 €,
  shown as a row labelled "Rabatt". Its pricing file states the same rule with `subtotalAtLeast`.
  The server imports nothing from `support/core`: the reference cart shares the rule code with the
  ledger (report A), so this page is the independent implementation the oracle is checked against.
- `CurrencyCode` gains `EUR`; the money parser takes locale and currency from the config of the app
  under test. Selftest runs the control app with its own config in a temporary root.

### 6.8 Preconditions and price source (stage 2)

`empty-cart`: the first `readCart` must be the empty variant. `guest`: fresh context, no storage state.
`no-geolocation`: the context grants no permissions. A violated precondition is `PRECONDITION_FAIL`
before the first step. With `price_source: api` the expected unit price comes from `apiPrice` and the
price read from the product page becomes a checked value at the first checkpoint.

## 7. Quality bar

This repo is read by people judging how the harness was engineered. Hold everything to this:

- Every source file starts with two or three lines: what it is and which design section it implements.
- Small modules with one job; names from the design's glossary; no dead code, no commented-out code,
  no leftovers of the reduced scope (`GATES_OK`, `confirm`, `gates`, the temporary parser, `scratch/`).
- No `any` and no non-null assertion without a one-line reason. No TODO left in code: unfinished things
  go to the report.
- Every message a tester can see is a complete sentence that says what happened and what to do next;
  amounts are always shown with the raw text the page displayed.
- Unit test names read as a specification of the behaviour; each test asserts one thing.
- Verdict names, CLI names and file names are exactly those of the design; one spelling everywhere.
- `templates/e2e` contains no Toolshop name, selector, product or price (design 14.3, case C2):
  check it with a search before the last commit.
