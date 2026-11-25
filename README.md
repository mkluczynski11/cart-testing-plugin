# cart-testing-plugin

cart-testing-plugin is a Claude Code plugin for QA engineers. It turns a shopping-cart scenario written in
plain words into a Playwright test kept in the repository, and verifies that test before handing it over.
Its commands start with `/qa:`.

The tests run in a browser against a running web shop, local or remote. The address is given once, in
`/qa:setup`.

Assumption: each shop needs a page driver, one file that knows that shop's buttons and fields. The plugin
includes the driver for the Toolshop demo shop, https://practicesoftwaretesting.com, and is verified on it.
For another shop the driver has to be built first. See Limits.

The test, its scenario and its run report live in `e2e/`. They work without the plugin and without
Claude Code.

## Install

Requires Claude Code, Node.js 20 or newer, and git.

    git clone https://github.com/mkluczynski11/cart-testing-plugin

Start Claude Code in the repository that will hold the tests, with the plugin loaded from the clone:

    claude --plugin-dir /path/to/cart-testing-plugin

## Usage

Run once per repository:

    /qa:setup toolshop https://practicesoftwaretesting.com

Create a test:

    /qa:new-test "Add two different products to the cart. Change the quantity of one, then remove the other. Check that the cart shows the correct total after each change."

Another scenario is another sentence. The page driver is reused.

    /qa:new-test "Add a Wood Saw, then two units of the first available product. Raise the saw to three units, then remove the other product. Check the total after each change."

| Command | Purpose |
| --- | --- |
| `/qa:setup <app> <base-url>` | Create `e2e/`, install Playwright and Chromium, run the self-test. |
| `/qa:new-test "<request>"` | Create, run and verify a test. |
| `/qa:new-test <slug>` | Resume an interrupted flow at the first missing step. |
| `/qa:verify <slug>` | Repeat the verification of an existing test. |
| `/qa:triage <slug>` | Diagnose a test that went red. |

| Option of `new-test` | Effect |
| --- | --- |
| `--yes` | Do not wait for the confirmation. |
| `--dry` | Stop before the application is opened. |
| `--defects extended` | Design additional defects for this scenario. |
| `--risk "<concern>"` | Add one defect described by the tester. |

## Test creation process

1. The request is mapped to a scenario: products, steps (`add`, `setQty`, `remove`) and the cart state
   after each step. A vague request gets one question. An unsupported feature gets a refusal.
2. Code validates the scenario and computes example totals on stub prices.
3. The tester sees the scenario, the example and every choice the plugin made, and confirms or corrects.
   The confirmed scenario is frozen by its hash.
4. Code compiles the scenario into `e2e/tests/<slug>.spec.ts`. The model writes no test code and no amounts.
   The same scenario always gives the same file.
5. If the page driver lacks an action the scenario needs, an agent reads the live page and adds it.

Expected totals are computed at run time from the unit prices read on the product pages, the scenario's
quantities and the shop's pricing rules in `e2e/app/<app>.pricing.ts`. They are never read from the cart.

## Test verification process

1. Intent review. Before compilation, a separate agent compares the confirmed scenario with the words of
   the request.
2. Static check (G0). Fixed waits, skipped tests and amount literals in the test are rejected.
3. Reference cart (G1). The test runs against a simulated cart on stub prices and must reproduce the
   confirmed example.
4. Defects (G2). The simulated cart gets one defect at a time. The test must go red at the first checkpoint
   where the defect shows. The check is repeated on the prices of the live run.
5. Live run (G3). The test runs three times against the application. Each checkpoint compares the cart lines,
   the unit prices, the subtotal, the adjustments and the total.
6. Live controls (G4). Four faults are injected into the live page, one at a time: an altered total, a
   changed unit price, a dropped quantity change, a dropped removal. The test must catch each.
7. Report review (G5). A separate agent checks the report against the recorded evidence and issues
   `VERIFIED`.
8. Promotion. Only the report of a run that passed steps 2 to 6 is written to `e2e/reports/<slug>/`. The one
   exception is a mismatch the tester promotes as evidence with `--as-evidence`; its report says so.

A defect that cannot show in a scenario does not fail it. The report lists it as a scenario gap, with the
step that would close it.

`--dry` stops after step 4. Such a test is not verified.

### Built-in defects

Derived by code from the scenario's steps and the shop's pricing rules. No model call.

| Defect | What it plants |
| --- | --- |
| `lost-add`, `lost-qty`, `lost-remove` | The step is acknowledged and changes nothing. |
| `qty-wrong-line`, `remove-wrong-line` | The step hits the next line in the cart. |
| `stale-total` | The total is the one from before the last change. |
| `total-off-by-cent` | The total is one cent too high. |
| `line-ignores-qty` | The line total is the unit price, whatever the quantity. |
| `rule-never`, `rule-always` | A pricing rule is never applied, or always applied. |
| `rule-wrong-rate`, `rule-boundary` | A pricing rule uses twice its rate, or a shifted threshold. |
| `round-down` | Amounts are truncated at the cent instead of rounded. |

A new pricing rule in the rules file gets its rule defects without any change to the plugin: `rule-never` and
`rule-always`, and `rule-wrong-rate` and `rule-boundary` when the rule has a rate and a threshold.

### Built-in or generated defects

The switch is `"defects"` in `e2e/qa.config.json`. It is set by `/qa:setup <app> <base-url> --defects <mode>`
and overridden for one test by `/qa:new-test "<request>" --defects extended`.

| Mode | Defects used | Model cost |
| --- | --- | --- |
| `default` | The built-in list. | None. |
| `extended` | The built-in list, plus up to 8 defects an agent designs for this scenario before the test is compiled. | One agent call per scenario. |

In both modes `--risk "<concern>"` adds one defect described by the tester.

Generated and tester defects are data, not code: an operator, a target and parameters, stored in
`e2e/specs/<slug>.defects.json`. Code rejects one when its operator does not exist, its target is not in
the scenario or the rules, or it behaves like a defect already present. Later verifications reuse the file
and call no model.

## Result

The answer to the reference request, shortened:

    ## PASS · test verified
    | Test | `e2e/tests/two-products-change-remove.spec.ts` |
    | Status | PASS, 3 of 3 repeats · verified |
    | Test data | A = Combination Pliers, $14.15, co2_rating D · B = Pliers, $12.01, co2_rating D (read from the product pages in this run) |

    ### Steps
    | # | Shopper's action | Expected total | Actual (as displayed) | Status | Evidence |
    | --- | --- | --- | --- | --- | --- |
    | S1 | add Combination Pliers, 1 unit | $14.15 | "$14.15" | pass | `e2e/reports/two-products-change-remove/screens/S1.png` |
    | S2 | add Pliers, 1 unit | $26.16 | "$26.16" | pass | `e2e/reports/two-products-change-remove/screens/S2.png` |
    | S3 | set quantity of Combination Pliers to 3 | $54.46 | "$54.46" | pass | `e2e/reports/two-products-change-remove/screens/S3.png` |
    | S4 | remove Pliers | $42.45 | "$42.45" | pass | `e2e/reports/two-products-change-remove/screens/S4.png` |

    ### Verification of the test
    | Defects on stub prices | 12 of 12 detected at the right step, 1 not applicable |
    | Defects on the prices of this run | 9 of 9 detected at the right step, 4 not applicable |
    | Live controls | 4 of 4 caught |

The answer goes on with the reviews, what the scenario does not cover, the pricing rules, the page driver, the
files and two commands that run the test again. `e2e/reports/<slug>/report.md` starts with the same form and adds
every defect and every live control with its outcome; next to it are `run.json`, `verification.json`, `review.md`
and a screenshot of every step. Both example answers: `examples/toolshop/reports/<slug>/readback.txt`.

| Verdict | Meaning | Tester's decision |
| --- | --- | --- |
| `ORACLE_MISMATCH` | The cart shows another amount than expected. | Application bug or missing pricing rule. |
| `UNMODELED_ADJUSTMENT` | The cart shows a discount or fee no rule explains. | State the rule. |
| `INFRA_FAIL` | The environment failed: the site, the network or the browser. | Run `/qa:new-test <slug>` to resume. |
| `PRECONDITION_FAIL` | The scenario could not be carried out, for example a product is out of stock. | Change the scenario. |

An expected amount changes only through the rules file, and a changed rules file needs a new confirmation.

## Running tests

    cd e2e
    npm run qa -- run <slug>
    npm run qa -- verify <slug>

`run` executes the test three times. `verify` runs verification steps 2 to 6. Both exit 0 only on `PASS`.
Neither needs Claude Code or an API key.

`npx playwright test tests/<slug>.spec.ts` in `e2e/` also works. It runs the test once on the reference cart and
once against the application, without the gates and without a report.

In a pipeline: `npm ci`, `npx playwright install chromium`, then `npm run qa -- run <slug>` in `e2e/`.

## Page driver

The page driver is `e2e/app/<app>.driver.ts`. It is the only file with locators. It lists products, reads
a product's price and attributes, adds a product, sets a quantity, removes a line and reads the cart.
Next to it are `<app>.pricing.ts` (row labels and pricing rules) and `<app>.map.md` (the evidence for
every locator).

Creating a driver for another shop:

1. `/qa:setup <app> <base-url>`. Setup reports that the plugin has no starter pack for this shop. The tester
   writes `e2e/app/<app>.pricing.ts`: no command creates it, and `qa-harness doctor` names it until it exists.
2. `/qa:new-test "<request>"`. After verification steps 2 to 4, `qa-harness need <slug>` lists the actions
   the driver lacks.
3. The `app-mapper` agent opens the live page, performs each missing action, chooses a locator (test
   attribute, then role, then label) and writes the action into the driver and the evidence into the map.
4. `qa-harness doctor` checks the driver against the interface and the UI boundary.
5. The flow continues with the live run.

A driver can also be written by hand against the interface in `docs/reference.md`. `qa-harness need <slug>`
and `qa-harness doctor` report what is missing.

When the page changes and a test goes red, `/qa:triage <slug>` repairs the locator the same way.

## Design note

The first design ran the generated test and, on a mismatch, showed the tester two amounts. Its only check of
the test itself was a one-cent shift of the expected value. The tester still had to decide whether the
application or the test was wrong.

Decision: the plugin verifies the test before handing it over, the way code is covered by unit tests. The
test runs against a simulated cart with known defects and must fail on each.

Two questions followed.

Who writes the defects? An agent that invents defects for its own test grades its own work, and the result
changes between runs. The default list is therefore derived by code from operators. It is repeatable and
uses no tokens.

What about features the default list does not know? A fixed list cannot follow a new promotion or a
tester's specific concern. So the list is extensible. The tester can add a defect in one sentence. In
extended mode a separate agent designs more, before the test is compiled, as data that code admits or
rejects. The mode is a switch, so tokens are spent only when the tester asks for it.

Observations that informed it:

- In the reference scenario 12 of 13 default defects could show on stub prices, 9 of 13 on the prices of
  the live run. The report therefore lists scenario gaps instead of one green mark.
- In the same run the total always equalled the subtotal. Only the live control that alters the total row
  proved that the driver reads the total. In the Wood Saw scenario the two differ at three of four steps.
- In extended mode the agent added 6 defects to the reference scenario. 18 of 19 were detected, 1 could not
  show. This was a dry run.

## Limits

- Guest cart only. No login, coupons or checkout.
- Verified means: the test detects the listed defects, matches the confirmed scenario and reads the row
  that the rules file labels as the total. It does not mean every bug is detected.
- Another shop needs its own page driver. The plugin has an agent that adds a missing action from the
  live page (exercised on a local shop) and repairs a locator (exercised on Toolshop). Building a whole
  driver for a new shop was not exercised.
- All Toolshop runs used the public instance. A local instance was not tried.
- Extended mode and `--risk` were exercised in dry runs only.
- Amounts in USD and EUR.

## More

- `examples/toolshop/`: two generated tests with their scenarios, reports and screenshots of real runs.
- `docs/reference.md`: every command and option, the workflow, the agents, the skills, the page driver.
- `docs/design.md`: the design.

## License

MIT
