# Reference

This document lists the commands, options, files and verdicts of the `qa` plugin as the code implements them.
`README.md` covers installation and use. Paths in `e2e/` are given relative to the e2e root (`e2e/` after
`/qa:setup`).

## Commands

The plugin has four commands. Their arguments come from `argument-hint` in `skills/<command>/SKILL.md`.

| Command | Argument or option | Default | Effect |
| --- | --- | --- | --- |
| `/qa:setup` | `<app>` | required | Lowercase name (`[a-z0-9][a-z0-9-]*`). Names `app/<app>.driver.ts`, `app/<app>.pricing.ts` and `app/<app>.map.md`. When missing, the command asks for it and stops. |
| | `<base-url>` | required | The address of the application. When missing, the command asks for it and stops. |
| | `--defects default\|extended` | `default` | Written to `defects` in `qa.config.json`. |
| | `--test-id-attribute <a>` | `data-testid` | Written to `testIdAttribute`. A starter pack may set another value (Toolshop: `data-test`). |
| | `--locale <l>` | `en-US` | Written to `locale`. |
| | `--currency <c>` | `USD` | Written to `currency`. `USD` or `EUR`. |
| `/qa:new-test` | `"<request>"` | — | Creates, runs and verifies a test (see Workflow). |
| | `--yes` | off | Do not wait for the confirmation. |
| | `--dry` | off | Stops after the dry gates (step 5). The test is not verified. |
| | `--defects extended` | the `defects` field | Runs step 3b for this test. |
| | `--risk "<concern>"` | none | Adds one defect with origin `tester`. |
| | `<slug>` | — | Resumes the scenario `specs/<slug>.md` (see Resuming). |
| `/qa:verify` | `<slug>` | required | Repeats the verification of an existing test and promotes a `VERIFIED` run. |
| `/qa:triage` | `<slug>` | required | Reruns a red test, reads its verdict and routes it to a driver repair or to the tester. |

`/qa:setup` sets `disable-model-invocation`: only the tester starts it. It runs `qa-harness doctor`, then
`qa-harness init` with the arguments unchanged, and reports at most 8 lines.

## Harness

`qa-harness` is the command line of `support/harness/cli.ts`; in a terminal, `npm run qa -- <subcommand>` in `e2e/`.
In a Claude Code session the plugin's `bin/qa-harness` finds the e2e root (`./e2e`, the current directory, or the
nearest parent that is or holds one) and runs the harness installed there. Every subcommand prints at most 15 lines,
then `VERDICT: <name>`; the exit code is 0 only for `PASS`, `INTENT_OK` and `VERIFIED`. An exception the harness does
not classify prints "The harness failed unexpectedly" and ends `INFRA_FAIL`. Options of every subcommand:
`--root <dir>` (the e2e root; default: the directory of the installed harness) and `--help` (the list, `PASS`).

| Subcommand | Options | Roles that may run it | Prints | Verdicts |
| --- | --- | --- | --- | --- |
| `init` | `--app <name>`, `--base-url <url>`, `--test-id-attribute <a>`, `--locale <l>`, `--currency <c>`, `--defects default\|extended` | main | files copied and kept, starter pack, the config line, `npm ci`, Chromium, `selftest` | `PASS`, `SPEC_INVALID`, `INFRA_FAIL` |
| `doctor` | `--write-manifest` | main, app-mapper | `ok:`, `note:` and one line per finding: Node, Chromium, manifest, each scenario, driver, rules file, type check | `PASS`, `INFRA_FAIL`, `HARNESS_MODIFIED`, `SPEC_INVALID`, `SCENARIO_CHANGED`, `VERIFICATION_STALE`, `LINT_FAIL` |
| `selftest` | — | main | one row per area of the harness's own test, then the count of rows passed | `PASS`, `INFRA_FAIL` (a row failed) |
| `example <slug>` | `--confirm` | main | the stubs, the example totals per step, the rules; with `--confirm` the frozen hashes | `PASS`, `SPEC_INVALID` |
| `compile <slug>` | `--force` | main | the test file written, unchanged, or the difference to a hand edit | `PASS`, `FILE_CONFLICT`, `SPEC_INVALID` |
| `intent <slug>` | — | main, test-verifier | `scenario_sha256: <hash>`, the review file, `state:` (`missing`, `stale`, `unreadable`, `not-confirmed`, `current <VERDICT>`) | `PASS`, `SPEC_INVALID` |
| `need <slug>` | — | main, app-mapper | missing actions, product attributes, request bindings | `PASS`, `LINT_FAIL`, `SPEC_INVALID` |
| `defects list <slug>` | — | defect-designer | the default defects with operator and why, then the admitted ones | `PASS`, `SPEC_INVALID` |
| `defects check <slug>` | `--extended` | main, defect-designer | the count of defects by origin and where the list will be; admitted and rejected entries | `PASS`, `SPEC_INVALID` |
| `run <slug>` | `--dry`, `--repair driver\|test` | main | the run id, gate lines G0–G3, G2 on the live products, scenario gaps, the run directory | any verdict of gates G0–G3, `SPEC_INVALID`, `SCENARIO_CHANGED`, `RETRY_REFUSED`, `LIMIT_REACHED` |
| `verify <slug>` | — | test-verifier | the run id, G0–G3 lines, one line per live control | any verdict of gates G0–G4 |
| `report <slug>` | `--promote <runId>`, `--as-evidence` | main | the files promoted, or why not; the rerun line | the verdict of the reported run, `NO_TESTS_RUN` |

Option details:

- `doctor --write-manifest` rewrites `support/core/MANIFEST.json`. It is meant for the plugin repository only.
- `example --confirm` sets `status: confirmed` and records the scenario and rules hashes.
- `compile --force` overwrites a hand-edited test. Without it a hand edit gives `FILE_CONFLICT`.
- `run --repair driver|test` admits a repair run: `RETRY_REFUSED` when the repaired file is unchanged since the last
  attempt, `LIMIT_REACHED` after 2 attempts. `--repair driver` with `--dry` is refused (`SPEC_INVALID`).
- `report --promote <runId>` copies a run into `reports/<slug>/`. It admits only a live run whose
  `verification.json` has `G3` and `G4` `PASS` and verdict `PASS`. `--as-evidence` also admits a live run that ended
  `ORACLE_MISMATCH` or `UNMODELED_ADJUSTMENT`; the first line of its `report.md` says it is evidence of a mismatch.
  A refused promotion leaves the tracked files unchanged.

## Workflow

### New test

| Step | Who | Input | Output | Stops when |
| --- | --- | --- | --- | --- |
| 0 Preflight | main thread | `qa-harness doctor`, `qa.config.json`, the rules file | — | setup has not run |
| 1 Intake | main thread | the request, `intake.md` | actions mapped to `add`, `setQty`, `remove`; a slug | a feature outside the scope (refusal), a gap that changes what the test proves (one question) |
| 2 Scenario | main thread, `qa-harness example` | the intake | `specs/<slug>.md` (`status: draft`), `specs/<slug>.example.json` | `SPEC_INVALID` after two fixes |
| 3 Confirmation | main thread, `qa-harness defects check` | the example, the rules file, the `--risk` entry | the confirmation; `example --confirm` | without `--yes`: the question "Confirm?" ends the turn |
| 3a Intent review | `qa:test-verifier` (`mode: intent`), `qa-harness intent` | the request verbatim, the confirmed scenario | `specs/<slug>.intent.md` | `REWORK` twice, `NEEDS_TESTER` |
| 3b Additional defects | `qa:defect-designer` | the request verbatim, the scenario | `specs/<slug>.defects.json` | — (only in extended mode) |
| 4 Compilation | `qa-harness compile` | the confirmed scenario | `tests/<slug>.spec.ts` | `FILE_CONFLICT` |
| 5 Dry gates | `qa-harness run --dry` | the test, the example, the defects | a run directory with G0–G2 | a red gate; with `--dry` always |
| 6 Driver | `qa-harness need`, `qa:app-mapper` (`mode: build`) | the missing actions as `need` printed them | `app/<app>.driver.ts`, `app/<app>.map.md` | `NEEDS_TESTER`, `UNDETERMINED` |
| 7 Live run | `qa-harness run` | the test, the driver, the application | a run directory with G0–G3 | any verdict but `PASS` (routing) |
| 8 Verification | `qa:test-verifier` (`mode: run`), then `qa-harness report --promote` | the run | `review.md`; `reports/<slug>/` | any verdict but `VERIFIED` (routing) |
| 9 Readback | main thread | command output, `report.md`, `verification.json` | the readback | — |

The confirmation's last line before "Confirm?" is the first line of `qa-harness defects check <slug>`, verbatim:
"The test will be checked against N defects: D default, T tester (ids), G generated; the full list will be in
e2e/reports/<slug>/report.md." With extended mode it adds ", plus at most 8 generated defects that
qa:defect-designer designs after the intent review".

### Verify and triage

`/qa:verify` runs `qa-harness doctor`; `qa-harness intent <slug>` and, unless it ends `PASS`, the intent review by
`qa:test-verifier`; `qa:test-verifier` in `mode: run`; on `VERIFIED`, `qa-harness report <slug> --promote <runId>`.

`/qa:triage` refuses a request to change an expected amount. It runs `qa-harness run <slug>` in a new run directory
and reacts by `skills/new-test/routing.md` (see Verdicts). After a repair that ends `PASS` it tells the tester to run
`/qa:verify <slug>`. It never changes the scenario, the rules file or an expected value.

### Resuming

`/qa:new-test <slug>` starts at the first missing or stale artifact. Steps 4–6 always run again.

| State found | Start at |
| --- | --- |
| `specs/<slug>.md` missing | step 1; the command asks for the request |
| `status: draft`, or `doctor` reports `SCENARIO_CHANGED` | step 2; `--yes` applies only when given again |
| `qa-harness intent <slug>` does not end `PASS` | step 3a |
| no promoted run, or `doctor` reports `VERIFICATION_STALE` | step 4 |
| `reports/<slug>/review.md` exists and `doctor` is `PASS` | step 9 from the promoted files |

### Dry mode

`--dry` ends after step 5. The dry readback names the G0–G2 lines and the scenario gaps, and lists what did not run:
the driver check, the live run, the live controls and the report review.

## Agents

### app-mapper

| Field | Value |
| --- | --- |
| Purpose | Builds missing driver actions from the live page (`mode: build`) and repairs one failing action (`mode: repair`). |
| Model | `sonnet` |
| Turn limit | 40 |
| Tools | Read, Grep, Glob, Write, Edit, Bash, `mcp__plugin_qa_browser__*` |
| Skills | `qa:contracts`, `qa:map-app-flow`, `qa:repair-locator` |
| Files it may write | `app/*.driver.ts`, `app/*.map.md` |
| Harness subcommands | `doctor`, `need` |
| Verdicts | `PASS`, `NEEDS_TESTER`, `UNDETERMINED` |

### defect-designer

| Field | Value |
| --- | --- |
| Purpose | Designs up to 8 additional defects for a confirmed scenario, as data. |
| Model | `sonnet` |
| Turn limit | 15 |
| Tools | Read, Grep, Glob, Write, Bash |
| Skills | `qa:contracts`, `qa:design-defects` |
| Files it may write | `specs/*.defects.json` |
| Harness subcommands | `defects list`, `defects check` |
| Verdicts | `PASS`, `UNDETERMINED` |

### test-verifier

| Field | Value |
| --- | --- |
| Purpose | Compares the confirmed scenario with the request (`mode: intent`); runs `verify` and reviews the report (`mode: run`). |
| Model | not set: the model of the session |
| Turn limit | 20 |
| Tools | Read, Grep, Glob, Write, Bash |
| Skills | `qa:contracts`, `qa:review-intent`, `qa:run-verification` |
| Files it may write | `specs/*.intent.md`, `reports/*/runs/*/review.md` |
| Harness subcommands | `verify`, `intent` |
| Verdicts | `INTENT_OK`, `VERIFIED`, `REWORK`, `NEEDS_TESTER`, `UNDETERMINED`; in `mode: run` followed by `RUN: <runId>` and `HARNESS: <verdict>` |

The prompt of an agent carries its inputs: `mode` where the agent has modes, `slug`, `root`, and the request verbatim
(test-verifier, defect-designer) or the missing actions and the run directory (app-mapper). No agent gets the
conversation.

## Skills

| Skill | Kind | Used by | What it does |
| --- | --- | --- | --- |
| `setup` | command | the tester | Installs `e2e/` for one application. |
| `new-test` | command | the tester | Runs the workflow above; holds `intake.md`, `routing.md`, `readback.md`. |
| `verify` | command | the tester | Repeats the verification of a test. |
| `triage` | command | the tester | Diagnoses a red test. |
| `contracts` | shared | all three agents | File formats: scenario, example, defects file, rules file, configuration, driver contract (`driver.md`). |
| `map-app-flow` | procedure | app-mapper | Builds missing driver actions from the live page. |
| `repair-locator` | procedure | app-mapper | Repairs the one driver action a failed run points at. |
| `design-defects` | procedure | defect-designer | Designs up to 8 additional defects. |
| `review-intent` | procedure | test-verifier | Compares a frozen scenario with the request (step 3a). |
| `run-verification` | procedure | test-verifier | Runs G0–G4 and reviews the report (G5). |

## Guardrails

Two `PreToolUse` hooks (`hooks/hooks.json`) read `hooks/matrix.json`. The role is the `agent_type` of the call; any
other caller is `main`.

| Hook | Tools | Rule |
| --- | --- | --- |
| `scripts/guard-paths.mjs` | Write, Edit, NotebookEdit | `main` may write anywhere except the denied paths. A plugin agent may write only its allowed paths inside an e2e root. |
| `scripts/guard-bash.mjs` | Bash | Each role may run only its harness subcommands. A plugin agent may run only one plain `qa-harness` call: no chaining, pipes, redirections or substitutions. |

Write matrix (paths relative to the e2e root):

| Role | Rule | Paths |
| --- | --- | --- |
| main | deny | `support/core/**`, `support/harness/**`, `specs/*.intent.md`, `reports/**` |
| qa:app-mapper | allow only | `app/*.driver.ts`, `app/*.map.md` |
| qa:defect-designer | allow only | `specs/*.defects.json` |
| qa:test-verifier | allow only | `specs/*.intent.md`, `reports/*/runs/*/review.md` |

Subcommand matrix:

| Role | Subcommands |
| --- | --- |
| main | `init`, `doctor`, `selftest`, `example`, `compile`, `need`, `defects check`, `run`, `report`, `intent` |
| qa:app-mapper | `doctor`, `need` |
| qa:defect-designer | `defects list`, `defects check` |
| qa:test-verifier | `verify`, `intent` |

The hooks act only inside Claude Code. In a terminal every subcommand is open.

## Page driver

### Files

| File | Content | Written by |
| --- | --- | --- |
| `app/<app>.driver.ts` | exports `createDriver(page, { actionMs, baseURL })` returning a `CartDriver`; the only file with locators | app-mapper, a starter pack, or the tester |
| `app/<app>.pricing.ts` | summary labels, pricing rules, purchase constraints | a starter pack or the tester |
| `app/<app>.map.md` | per action: locator, why, completion signal, requests, pitfalls, date | app-mapper, a starter pack |

### Interface

From `support/core/types.ts`:

```ts
export interface CartDriver {
  candidates(): AsyncIterable<string>;                       // product names in listing order
  productFacts(name: string): Promise<ProductFacts>;         // product page
  addProduct(name: string, qty: number): Promise<void>;      // resolves on the application's acknowledgment
  setQuantity(name: string, qty: number): Promise<void>;
  remove(name: string): Promise<void>;
  readCart(): Promise<CartView>;                             // what the cart displays
  setAttribute?(key: string, value: string): Promise<void>;  // extension point, e.g. a coupon code
  apiPrice?(name: string): Promise<Money>;                   // only with price_source: api
  controls: LiveControls;                                    // request bindings for the live controls
  provides: { attrs: string[] };                             // product attributes the driver reads
}
```

`ProductFacts` is `{ name, unitPrice, listPrice?, inStock, attrs }`. `CartView` is either
`{ empty: true, emptyMessage, total? }` or `{ empty: false, lines, adjustments, subtotal?, total }`. Every amount is
`{ value, rawText }`; a summary row adds its `label`.

### Operations

| Operation | Must | Must not |
| --- | --- | --- |
| `candidates` | yield product names in listing order | select products: selection is the library's |
| `productFacts` | read the selling price in force, availability and the attributes in `provides.attrs` from the product page | — |
| `addProduct`, `setQuantity`, `remove` | return after the application's acknowledgment in the DOM | wait for the expected cart state; use a finished request as the only signal; use fixed waits |
| `readCart` | wait for the cart table or the empty-cart message; return the raw text of every amount; read a summary row's label and amount from one row element | treat an empty cart as an error |
| any | throw `PreconditionError` with the application's text for a refusal, `LocatorError` for a missing element or acknowledgment, `InfraError` for an unanswered request | import from outside `@playwright/test` and `../support/core/`; call `fetch`, `page.request` or `request.newContext`; open a URL outside the application's origin; finalize an order |

Locators, in this order: the test attribute (`getByTestId`), role with name, label, a locator relative to the row
that holds the product name. Positional CSS, CSS classes and XPath are forbidden. An unavoidable class needs a
`// locator-exception: <reason>` comment on the same line. A driver call that does not return within 3 × `actionMs`
gives `LOCATOR_FAIL`.

### Bindings and map

`controls` holds `{ method, urlPattern }` for `setQuantity`, `remove` and `cart`; `cart` may add `pricePath`, the
line's price in the cart response. Live controls G4 intercept these requests. A missing binding makes its control
`not-bound`. `need` lists missing bindings without failing. The map `app/<app>.map.md` has one section per action:
the locator, why it was chosen, the completion signal, the network requests (method and URL pattern), pitfalls and
the date. app-mapper reads it before opening the browser and updates it with every change to the driver.

### Creating a driver

1. `/qa:setup <app> <base-url>`. Without a starter pack `init` prints that app-mapper builds the driver from the page
   on the first scenario. No command creates `app/<app>.pricing.ts`: the tester writes it. Until it exists `doctor`
   names it (`LINT_FAIL`) and `example` ends `SPEC_INVALID` naming it.
2. `/qa:new-test "<request>"`. After the dry gates (step 5), `qa-harness need <slug>` lists the actions, attributes
   and bindings the driver lacks.
3. app-mapper (`mode: build`, skill `map-app-flow`) reads the map, opens each page with the plugin's browser, takes a
   snapshot before and after the action, records the requests, chooses the locator and the completion signal, and
   writes the action into the driver and the evidence into the map.
4. app-mapper runs `qa-harness need <slug>` and `qa-harness doctor` until both end `PASS`. `doctor` checks that the
   driver exports every `CartDriver` method, `controls` and `provides.attrs`, and that it stays within the UI boundary.
5. The flow continues with the live run (step 7).

### Repairing a driver

A `LOCATOR_FAIL`, or a `FLAKY` whose failed repeats end with an action failure, goes to app-mapper with `mode: repair`,
the failing action and the run directory (skill `repair-locator`). After its `PASS` the main thread runs
`qa-harness run <slug> --repair driver`. Two failed attempts, `RETRY_REFUSED` or `LIMIT_REACHED` end the repair.

## Pricing rules

`app/<app>.pricing.ts` exports `summary`, `rules` and `constraints`:

| Part | Fields |
| --- | --- |
| `summary` | `total.label` and `subtotal.label` (regular expressions), `provenance` |
| `rules[]` | `id`, `label` (regular expression of the adjustment row), `when`, `amount`, `provenance` |
| `constraints[]` | `id`, `maxQty`, optional `match: { name }`, `provenance` |

Rule vocabulary:

| Key | Values |
| --- | --- |
| `when` | `{ always: true }`, `{ shareOfUnits: { where, above } }`, `{ hasUnits: { where, atLeast } }`, `{ subtotalAtLeast }` |
| `amount` | `{ percentOf: 'subtotal' \| 'running', rate }` or `{ fixed }` |
| `where` | attribute name → list of accepted values |
| `provenance` | `{ source: 'code' \| 'tester' \| 'observed', ref, live: 'confirmed' \| 'unconfirmed' }` |

Loading the file checks it against this vocabulary; a key outside it gives `LINT_FAIL` naming the rule and the key.
`doctor` also type-checks it when TypeScript is installed for the root.

Only the tester's answer changes the rules file (`skills/contracts/SKILL.md`). Its hash is part of the confirmation:
after a change `compile` refuses with `SPEC_INVALID` and `run` with `SCENARIO_CHANGED` until a new confirmation, and
`doctor` reports `SCENARIO_CHANGED`, and `VERIFICATION_STALE` for verified scenarios.

## Verification

| Gate | Where | Passes when |
| --- | --- | --- |
| G0 static check | the test and the driver | no forbidden pattern; the test was compiled from the current scenario |
| G1 reference cart | the test on a simulated cart, stub prices | green; the ledger equals `cart_after`; the totals equal the approved example |
| G2 defects | the test on the simulated cart, one defect at a time | every applicable defect is red at its expected checkpoint |
| G3 live run | the application, `repeat` times | every repeat green; then G2 runs again on the products of the live run |
| G4 live controls | the application, one control at a time | no control `missed` |
| G5 report review | `qa:test-verifier` | `VERIFIED` in `review.md` |

Forbidden in a test (G0): `waitForTimeout`, `test.skip`, `fixme`, `only`, `expect`, amount literals, `try`/`catch` or
`if` around actions and checkpoints, environment variables, `page`, imports from outside `support/core`.

### Defect operators

| Operator | Breaks | Default defects |
| --- | --- | --- |
| `no-effect` | the step is acknowledged and changes nothing | `lost-add`, `lost-qty`, `lost-remove` |
| `wrong-target` | the step hits the next line in cart order | `qty-wrong-line`, `remove-wrong-line` (cart with two lines) |
| `stale-value` | the value from before the last change | `stale-total` |
| `skew-value` | the value one cent too high | `total-off-by-cent` |
| `ignore-factor` | the line total ignores the quantity | `line-ignores-qty` |
| `rule-never`, `rule-always` | a rule never or always applies | `rule-never`, `rule-always` per rule |
| `rule-rate` | a rule at twice its rate | `rule-wrong-rate`, for a rule with a rate |
| `rule-boundary` | a rule's threshold shifted | `rule-boundary`, for a rule with a threshold |
| `round-mode` | truncation at the cent instead of rounding | `round-down` |

With more than one rule, rule defect ids carry the rule id (`rule-never:<rule>`).

### Defects file

`specs/<slug>.defects.json` is a list of entries `{ id, origin, operator, target, when?, why }`:

| Field | Values |
| --- | --- |
| `id` | lower-case letters, digits, dashes and colons; unique |
| `origin` | `tester` or `generated` |
| `operator` | one of the operators above |
| `target` | `{ value: total \| subtotal \| lineTotal }`, `{ adjustment: <rule id> }` or `{ step: add \| setQty \| remove }` |
| `when` | `{ afterStep, direction: increase \| decrease }` |
| `why` | one sentence on what the defect breaks |

`defects check` rejects an entry with an unknown operator, a target outside the scenario or the rules, a twin of a
defect already present, or beyond the limit of 8. Admitted entries run like default defects.

### Results

A defect is `detected` (first red at the expected checkpoint), `detected-late`, `missed` or `not-applicable` (no
checkpoint differs). G2 ends `DEFECT_MISSED` when one is missed, `DEFECT_LATE` when one is late. A `not-applicable`
defect is a scenario gap; its hint names the step that would close it. `report.md` lists every defect with its origin,
its why, and its result and first red checkpoint on the stub prices and on the prices of the live run.

### Live controls

| Control | Changes | Applies when |
| --- | --- | --- |
| `skew-total` | the total row shows one cent more | always |
| `drift-price` | the first line's price in the cart response | a `cart` binding exists |
| `lost-update` | the quantity request is dropped | a `setQty` step and a `setQuantity` binding exist |
| `lost-remove` | the removal request is dropped | a `remove` step and a `remove` binding exist |

Each control records four facts: `activated`, `target` (the element or request changed), `shownAtRead` (what the
driver read) and `reactedAt` (the first red checkpoint). Its result is `caught`, `missed`, `not-applicable` or
`not-bound`. G4 passes when none is `missed`.

## Verdicts

From `support/core/verdicts.ts`; issuers, meanings and reactions from `skills/new-test/routing.md`.

| Verdict | Issued by | Meaning | Reaction |
| --- | --- | --- | --- |
| `PASS` | every subcommand | the required gates are green | next step |
| `SPEC_INVALID` | `example`, `compile`, `intent`, `defects`, any subcommand on bad arguments | the scenario or an argument breaks a rule | fix the scenario or ask the tester |
| `FILE_CONFLICT` | `compile`, G0 | the test was edited by hand, or a file is in the way | the tester chooses `--force` or the edit |
| `LINT_FAIL` | G0, `need`, `doctor`, loading the rules file | a forbidden pattern, a driver action missing, a rules key outside the vocabulary | test: recompile; driver: app-mapper; rules: the tester |
| `CONFORMANCE_FAIL` | G1, G3 | the ledger differs from `cart_after`, or totals differ from the example | harness bug or changed rules; edited test: the tester |
| `DEFECT_LATE` | G2 | a defect red after its expected checkpoint | as above; typically a checkpoint removed by hand |
| `DEFECT_MISSED` | G2 | an applicable defect not detected | as above |
| `INFRA_FAIL` | `run`, `verify`, any subcommand | environment: browser, network, 5xx response, missing binaries | stop; resume with `/qa:new-test <slug>` |
| `PRECONDITION_FAIL` | `run`, `verify` | no product, out of stock, a purchase constraint, a refusal by the application | one message with the application's text |
| `NO_TESTS_RUN` | `run`, `verify`, `report --promote` | zero tests or an incomplete set of checkpoints; a run that cannot be promoted | harness bug; for `report`, promote only a `VERIFIED` run |
| `LOCATOR_FAIL` | G3 | an action did not find its element or acknowledgment, a read is not an amount or has another label, or a driver call exceeded 3 × `actionMs` | app-mapper, `repair-locator` |
| `FLAKY` | G3 | repeats differ | by the class of the failed repeats |
| `ORACLE_MISMATCH` | G3 | expected differs from displayed | the tester: application bug or missing rule |
| `UNMODELED_ADJUSTMENT` | G3 | an adjustment no rule describes | one question about the rule |
| `CONTROL_MISSED` | G4 | a live control did not turn a checkpoint red | by the four facts of the control |
| `HARNESS_MODIFIED` | `doctor` | `support/core` or `support/harness` differ from the manifest | restore with `/qa:setup` |
| `SCENARIO_CHANGED` | `doctor`, `run` | the scenario or the rules changed after confirmation | a new confirmation |
| `VERIFICATION_STALE` | `doctor` | the test, driver, rules or intent review changed after verification | `/qa:verify <slug>` |
| `RETRY_REFUSED` | `run --repair` | a repair without a change to the repaired file | stop |
| `LIMIT_REACHED` | `run --repair` | 2 repair attempts recorded | stop with the last verdict |
| `INTENT_OK` | test-verifier | the scenario matches the request | compilation |
| `VERIFIED` | test-verifier | intent review current, all gates green, report checked | `report --promote` |
| `REWORK` | test-verifier | a finding for app-mapper, the scenario or the tester | by addressee |
| `NEEDS_TESTER` | test-verifier, app-mapper | a decision for a human | one question |
| `UNDETERMINED` | `run`, `verify`, triage, test-verifier, app-mapper, defect-designer | the evidence does not settle the cause; or a driver method threw another exception | stop with the material |

## Files

| Path in `e2e/` | Written by | Tracked |
| --- | --- | --- |
| `qa.config.json` | `init` | yes |
| `app/<app>.driver.ts`, `app/<app>.map.md` | app-mapper, a starter pack, the tester | yes |
| `app/<app>.pricing.ts` | a starter pack, the tester | yes |
| `specs/<slug>.md` | main thread; `example --confirm` sets `status` | yes |
| `specs/<slug>.example.json` | `example` | yes |
| `specs/<slug>.intent.md` | test-verifier | yes |
| `specs/<slug>.defects.json` | main thread (`--risk`), defect-designer | yes |
| `tests/<slug>.spec.ts` | `compile` | yes |
| `reports/<slug>/report.md`, `run.json`, `verification.json`, `review.md`, `screens/S<n>.png` | `report --promote` | yes |
| `reports/<slug>/runs/<runId>/` | `run`, `verify`; `review.md` there by test-verifier | no |
| `reports/<slug>/attempts.json`, `.lock`, `.promote-*/` | `run --repair`, the run lock, `report --promote` | no |
| `support/core/`, `support/harness/`, `playwright.config.ts`, `package.json` | `init` from the template | yes |
| `node_modules/`, `test-results/`, `playwright-report/` | `npm ci`, Playwright | no |

A run id has the form `<UTC timestamp>-<4 hex>`, for example `20261125T101701Z-14e0`. A run directory holds
`run.json`, `verification.json`, `report.md`, screenshots, `dry/` (G1, G2 runs), `G4/` (one directory per control)
and the Playwright HTML report in `html/`.

## Configuration

`qa.config.json`; defaults from `support/core/config.ts`.

| Field | Default | Meaning |
| --- | --- | --- |
| `app` | required | application name |
| `baseURL` | `""` | address of the application |
| `testIdAttribute` | `data-testid` | attribute behind `getByTestId` |
| `locale` | `en-US` | amount format |
| `currency` | `USD` | `USD` or `EUR` |
| `browserDriver` | `mcp` | `mcp` or `cli`; no code reads it |
| `priceSource` | `ui` | `ui` or `api`; recorded in `run.json`. A test uses its scenario's `price_source`, compiled into `test.use` |
| `defects` | `default` | `default` or `extended` |
| `repeat` | `3` | repeats of the live run G3 |
| `pickLimit` | `30` | candidates the library reads to pick a product |
| `timeouts.probeMs` | `5000` | probe of `baseURL` before G3 |
| `timeouts.actionMs` | `10000` | one wait inside a driver action |
| `timeouts.settleMs` | `3000` | polling of the cart after an action |
| `timeouts.testMs` | `90000` | one repeat of the test |
| `browserAllowedOrigins` | `[]` | exact origins the plugin's browser may open besides `baseURL` |
