# Plugin qa — design doc v0.3

Nov 24, 2026 · @Marek

Version 0.3 moves test writing from an agent into code, completes the failure classification and the empty-cart model, and treats the behaviour of the live Toolshop as a hypothesis to check, not a fact.

## 1. Goal, scope and glossary

The `qa` plugin for Claude Code turns a scenario described in natural language into a Playwright test kept in the team's repo, and into evidence that this test can be trusted. The tester does not judge the test's code: they get the result of the run on the application and the result of the verification of the test itself.

### 1.1 Assessment criteria from the assignment

| Criterion | Answer in the design | Section |
| --- | --- | --- |
| Tester's intent → a useful test | The model turns the request into a scenario with a closed grammar; code validates it, shows it on a numeric example and compiles it into a test | 3, 8 |
| How the test decides correctness | An independent oracle plus negative controls proving that every checkpoint detects an error | 9, 10 |
| Ease of use for another scenario | One command; the application driver is reused; rules and defects are extensible without changes to the plugin | 3, 10.4 |
| The reviewer sees what the shopper did, what was expected and what the browser showed | A per-checkpoint report with raw text from the browser | 11 |
| The test reruns without regeneration | `npx playwright test`, without AI and without the plugin | 6, 11 |

### 1.2 Scope

**Version 1:** the Toolshop cart as seen by a guest, steps `add`, `setQty` and `remove`, a check of the cart state after the steps the scenario names. A different application means a new driver, with no changes to the plugin.

**Out of scope:** CI, visual tests, login, checkout and payments, coupons, several scenarios in one invocation. An out-of-scope request ends with a refusal and an explanation, never with a truncated test.

### 1.3 Glossary

Every term has one meaning in this document. Identifiers in code and files are English.

| Term | Meaning | In code and files |
| --- | --- | --- |
| scenario | the frozen record of the request: products, steps, cart state after each step | `specs/<slug>.md` |
| example | placeholder data (stubs) and totals approved by the tester | `specs/<slug>.example.json` |
| intent review | an independent comparison of the frozen scenario with the tester's request, before compilation | `specs/<slug>.intent.md` |
| compilation | the deterministic conversion of a scenario into a test | `qa-harness compile` |
| driver | the only place with locators: actions and cart reads through the UI | `app/<app>.driver.ts` |
| business rules: pricing rule and purchase constraint | business knowledge about the application, always with provenance | `app/<app>.pricing.ts` |
| oracle | the ledger and the rules from which the expected value is produced | `support/core` |
| checkpoint | a comparison of the expected cart state with the displayed one | `shopper.checkTotal` |
| adjustment | a cart row that changes the total, e.g. a discount | `adjustments` |
| reference cart | an in-memory cart model on which the test runs without the application | `reference-cart` |
| defect | a named switch that breaks one behaviour of the reference cart | `operators` |
| live control | a fault injected into the live page | `live-controls` |
| gate | a stage of test verification, G0 to G5 | section 10 |
| verdict | the result of a step; the only basis for deciding what happens next | section 6.3 |
| scenario gap | a defect the scenario does not expose | an entry in the report |
| main thread | the Claude Code session executing the command skill | section 3 |
| readback | the final answer to the tester | section 11.2 |

### 1.4 How to read this document

Sections 3–7 say who works and how. Sections 8–11, on what they work and with what result. Sections 12–16, how to build and evaluate it. Section 17 collects decisions and changes relative to v0.2. Each thing is defined once, and the other sections refer to it by number.

## 2. Design principles

The plugin is a fixed workflow with gates, not a free agent. The model works only where language or a page has to be understood: its work ends at the scenario and at the driver, while the test, the expected values and the verdicts are produced by code. The table shows where each principle is implemented.

| Principle | Kind of practice | Where in the design |
| --- | --- | --- |
| Workflow instead of autonomy when the task has a known shape | agentic | 3 |
| What is a function of the input is done by code; the model gets only decisions | agentic | 3, 6 |
| An agent's boundary is the boundary of its tools and context | agentic | 4 |
| One procedure is one skill that can be evaluated on its own | agentic | 5, 14 |
| The evaluator is not the producer | agentic | 4.4, 10 |
| A rule is enforced by a mechanism, not by a request in the prompt | agentic | 7 |
| Contracts on files, not in conversation | agentic | 8 |
| Every failure has one class; evidence, not a guess, routes to repair | agentic | 6.3 |
| The human decides about meaning, not about code | agentic | 3, 11 |
| Specification by example | testing | 8.2, 11.1 |
| An independent oracle; money computed exactly | testing | 9 |
| A test that cannot fail proves nothing | testing | 10 |
| Locators in one place; the effect of an action confirmed in the DOM | testing | 5.4, 8.3 |
| Run isolation and independence from application data | testing | 8.3, 8.4 |
| The report shows what the browser showed, also after a failure | testing | 8.5, 11 |

## 3. Functional layout: how agents take up work

Work is distributed by the main thread, which executes the `new-test` skill: it talks to the tester itself, hands every further step to code or to one agent, and reads only the verdict. The model works in steps 2, 3a, 6, 8 and 9 and in the optional 3b; the test comes from compilation, not from an agent's work.

[Diagram, not included in this export: the `/qa:new-test` flow · 9 steps and 2 sub-steps, one optional · 2 correction loops. Table 3.1 carries the same steps.]

The flow has two correction loops. A gap between the request and the scenario surfaces in step 3a, before compilation and before the browser: it returns to step 2 and requires a new confirmation. A failing driver returns to `app-mapper` when the evidence points at it (6.3). An amount mismatch, an environment failure and an unmet precondition do not return to any agent; they end the flow with a message to the tester.

### 3.1 Steps of `/qa:new-test`

| Step | Performer and skill | Input | Output | When it stops |
| --- | --- | --- | --- | --- |
| 1–3. Scenario and confirmation | main thread, `new-test`; `qa-harness example` | the tester's description, the application's business rules | `specs/<slug>.md`, `specs/<slug>.example.json`, `status: confirmed` | ambiguous request: a question; out-of-scope request: a refusal |
| 3a. Intent review | `test-verifier`, `review-intent` | the tester's request verbatim, the frozen scenario, the example | `specs/<slug>.intent.md`, verdict `INTENT_OK` | `REWORK`: back to step 2 and a new confirmation; 2 rounds |
| 3b. Additional defects, only in `extended` mode | `defect-designer`, `design-defects` | request, scenario, rules, operators | `specs/<slug>.defects.json` | 8 defects or no new proposals |
| 4. Compilation | `qa-harness compile` | confirmed scenario | `tests/<slug>.spec.ts` | `FILE_CONFLICT` |
| 5. Dry gates | `qa-harness run --dry` | test, example, defects | verdict of gates G0–G2, scenario gaps | a red gate on a compiled test: a harness bug |
| 6. Driver | `app-mapper`, `map-app-flow` | gaps from `qa-harness need` | `app/<app>.driver.ts`, `app/<app>.map.md` | skipped when nothing is missing |
| 7. Live run | `qa-harness run` | test, driver | run directory with `run.json`, verdict G3 | `INFRA_FAIL`, `PRECONDITION_FAIL`, `NO_TESTS_RUN`, amount mismatch; 2 failed driver repairs |
| 8. Verification | `test-verifier`, `run-verification` | all artifacts, read-only | `verification.json` and `review.md` in the run directory, verdict G4–G5 | 2 correction rounds |
| 9. Readback | main thread, `new-test` | reports | the answer to the tester with the list of evidence that exists | none |

### 3.2 Other flows

| Command | When | Who works |
| --- | --- | --- |
| `/qa:setup` | once per repo | main thread and `qa-harness`; no agents |
| `/qa:verify <slug>` | after a manual edit of the test, after a driver repair, before a release | `test-verifier`; in CI just `qa-harness verify` |
| `/qa:triage <slug>` | a red test after a release | the main thread reads the verdict and routes: a failing driver to `app-mapper`, an amount mismatch to the tester |

The procedures of these commands are in section 5.3.

### 3.3 Flow rules

- **Routing by verdict.** The main thread does not interpret logs. It reads the verdict from `qa-harness` or from `test-verifier` and applies the reaction from the dictionary (6.3). A verdict names an observation; only evidence that points at the owner of the problem routes to repair.
- **Logic before the browser.** Steps 2–5 do not open the application, so an error in the scenario, in the reading of the request or in the rules surfaces before anything uses a browser session.
- **Evidence of the first failure stays.** Every run has its own directory; a repair does not overwrite the run that triggered it (8.5).
- **Resuming.** State lives in files, so a repeated `/qa:new-test <slug>` starts from the first missing or stale artifact.
- **Stopping.** When a loop exhausts its attempts or a retry does not change the premise, the plugin ends with the message "could not deliver a verified test" and the reason (R9). The test file may already exist then, but without a promoted run it is not handed over as ready.
- **Unattended mode.** The `--yes` flag skips the confirmation question; it is needed in evals and in sessions without a human.

## 4. Agents

The plugin has two permanent agents and one optional agent. An agent exists only where understanding of a page or of intent is needed; none of them writes the test.

### 4.1 Common definition

An agent is a file `agents/<name>.md`: a header with fields and a short role instruction. Procedures do not live in the instruction but in skills injected through the `skills` field.

```yaml
---
name: test-verifier
description: Independently verifies a browser test against the tester's request. Invoked by qa:new-test and qa:verify only.
tools: Read, Grep, Glob, Write, Bash
skills: [contracts, run-verification, review-intent]
maxTurns: 20
---
```

The same applies to every agent:

- It receives file paths, not the content of the conversation. It returns up to 10 lines: verdict, paths, uncertainties.
- It is subject to guardrails R1, R2, R3, R9, R10 and R11 from section 7. The cards below give only what is specific to the agent.

### 4.2 `app-mapper`

| Field | Value |
| --- | --- |
| Task | Builds and repairs the application driver from the live page |
| Who invokes it | `new-test` in step 6 and after `LOCATOR_FAIL`, and after `FLAKY` and `CONTROL_MISSED` only when the evidence points at the driver (6.3); `triage` for a failing driver |
| Input | a list of missing actions, or the name of the failing action and the directory of the failed run; the existing driver and map |
| Output | `app/<app>.driver.ts`, `app/<app>.map.md` |
| Tools | MCP browser, Read, Write, Edit, Bash |
| Skills | `contracts`, `map-app-flow`, `repair-locator` |
| Model and limit | sonnet; 40 turns |
| Specific guardrails | R1: writes only the driver and the map. R13: actions and reads only through the UI, no steps outside the catalog and the cart |
| What it does not do | does not touch the test, the scenario or the business rules; does not judge amounts; does not run the test |

### 4.3 `defect-designer` (optional)

| Field | Value |
| --- | --- |
| Task | Designs additional defects for a scenario |
| Who invokes it | `new-test` in step 3b, only in `extended` mode |
| Input | the tester's request, the scenario, the business rules, the operator catalog, the list of default defects |
| Output | `specs/<slug>.defects.json` |
| Tools | Read, Write, Bash; no browser |
| Skills | `contracts`, `design-defects` |
| Model and limit | sonnet; 15 turns |
| Specific guardrails | R1: writes only the defects file. R12: format without code, admission check, limit of 8 |
| What it does not do | does not write defect code; does not change the scenario |

### 4.4 `test-verifier`

| Field | Value |
| --- | --- |
| Task | Independently assesses two things: before compilation, the reading of the request recorded in the scenario; after the run, the test and its evidence |
| Who invokes it | `new-test` in steps 3a and 8; `/qa:verify` |
| Input | in step 3a: the tester's request verbatim, the frozen scenario, the example; in step 8 additionally: the test with the information whether it comes from compilation or was edited by hand, the run directory, the report; always without the conversation with the tester |
| Output | `specs/<slug>.intent.md`; `review.md` in the run directory; `verification.json` written by the harness; verdict `INTENT_OK`, `VERIFIED`, `REWORK`, `NEEDS_TESTER` or `UNDETERMINED` |
| Tools | Read, Grep, Glob, Write, Bash; no Edit and no browser |
| Skills | `contracts`, `review-intent`, `run-verification` |
| Model and limit | inherited from the session; 20 turns |
| Specific guardrails | R1: writes only the intent review and the run review |
| What it does not do | fixes nothing and proposes no fix code |

### 4.5 Why these boundaries

- `app-mapper` is the only one that spends context on page snapshots, and it works only when the driver is missing something.
- `test-verifier` did not write the scenario and cannot change anything, so its verdict is independent of the main thread. It assesses the reading of the request before compilation, so a red live run concerns a scenario that someone independent has already read.
- `defect-designer` is optional because it spends tokens on something that has a default version without a model (10.3).
- There is no agent that writes the test. The scenario has a closed grammar, so turning it into code is a function, not a decision (decision D1, section 17).

Models and turn limits are starting values, tuned in evaluation (section 14).

## 5. Skills

The plugin has 10 skills: 4 commands for the tester, 1 shared skill and 5 agent procedures. A skill describes one procedure that can be read, changed and evaluated on its own.

### 5.1 Catalog

| Skill | Kind | Who uses it | What it is for |
| --- | --- | --- | --- |
| `new-test` | command | tester or model; main thread | runs the flow from section 3 |
| `setup` | command | tester only; main thread | prepares the repo |
| `verify` | command | tester or model; main thread | repeats the verification of a test |
| `triage` | command | tester or model; main thread | diagnoses a red test after a release |
| `contracts` | shared | all agents and `new-test` | formats and rules from section 8 |
| `map-app-flow` | procedure | `app-mapper` | building driver actions from the live page |
| `repair-locator` | procedure | `app-mapper` | repairing a failing action |
| `design-defects` | procedure | `defect-designer` | the algorithm for designing additional defects |
| `run-verification` | procedure | `test-verifier` | running the gates, classifying results and reviewing the report |
| `review-intent` | procedure | `test-verifier` | reviewing the scenario against the tester's request, before compilation |

### 5.2 Convention

- **Structure.** Every `SKILL.md` has the same parts: when, input, steps, output, stop. Longer material lives in files next to it and is read on demand.
- **Visibility.** Agent procedures are hidden from the menu (`user-invocable: false`) and reach the agent through the `skills` field.
- **Description.** It has one sentence, because descriptions are permanently in the session context (section 13).
- **Single source.** A skill does not repeat the content of another skill: formats are only in `contracts`, reactions to verdicts only in the dictionary (6.3).
- **Clean examples.** `SKILL.md` uses only placeholder data: `Product A`, `$10.00`, `<locator>`. Product names, prices and selectors of a specific application live only in `app/` and `examples/`. The model carries examples from the instruction into the result, so real data in a skill ends up as hard-coded values.
- **Calibration by example pairs.** The boundary between "decide yourself" and "ask" is set in the skill by pairs of examples, not by a general sentence. A general instruction gives unstable behaviour: the model asks about trifles or guesses important things.

### 5.3 Commands

#### `new-test`

Invocation: `/qa:new-test "<description>" [--yes] [--defects extended] [--risk "<concern>"]`. The order of steps is in section 3. The skill's own procedure is the intake of the request:

1. Splits the request into clauses: actions, objects, expectations.
2. Maps every action to a kind of step from 8.1. An action with no counterpart in the grammar ends the flow with a refusal that names the missing feature.
3. Picks products. A name given by the tester yields a `by-name` pick; no name yields `first-available` and `next-available`. A required attribute from the request, e.g. an eco-friendly product, is recorded as `where` (8.1).
4. Establishes the cart state after each step and calls `qa-harness example`. It fixes `SPEC_INVALID` itself; when the fix changes the meaning, it asks the tester.
5. Shows the confirmation following the template from 11.1, together with the choices it made itself. After "ok" it calls `qa-harness example --confirm`, which freezes the scenario (8.1).
6. Records every concern from `--risk` as a defect with source `tester` (10.4).

The example pairs in the skill separate three situations:

| Situation in the request | Behaviour | Example |
| --- | --- | --- |
| Freedom in choosing data | the skill chooses and shows the choice in the confirmation | "add two different products" yields `first-available` and `next-available`; "change the quantity of one" yields `setQty` of product A to 3 |
| Meaning of actions and objects | the skill maps the words of the request, not a familiar pattern | "add two more" yields `add` 2, while "set the quantity to two" yields `setQty` 2; "increase the quantity of the second and remove the first" points at B and A, not the reverse |
| A change of the requirement or an out-of-scope feature | the skill stops: it asks or refuses | "check the total" without saying whether before or after the discount; "use a coupon"; "remove one of them" when the choice changes what the test proves |

#### `setup`

Invocation: `/qa:setup`. For the tester only, because it installs dependencies.

1. `qa-harness doctor` checks Node, git and any existing Playwright.
2. Copies the `e2e/` template together with a `.gitignore` for the run directories. It does not overwrite drivers, scenarios or tests.
3. Installs `@playwright/test` and Chromium in `e2e/`, which has its own `package.json`. The dependencies of the tester's repo stay untouched; the repo does not have to be a Node project.
4. Asks for the application's name and address and for the defect mode, and writes `qa.config.json` (8.6).
5. `qa-harness selftest` confirms that the harness works (10.8).

#### `verify`

Invocation: `/qa:verify <slug>`.

1. `qa-harness doctor` checks integrity (R4–R7) and establishes whether the test comes from compilation or was edited by hand.
2. When there is no intent review matching the scenario hash, it orders one first (step 3a). Then it delegates verification to `test-verifier`.
3. Returns the readback with the verdict. For a hand-edited test, `REWORK` goes to the tester with a recommendation: recompile or repair the indicated place.

Without a model, e.g. in CI, gates G0–G4 are run by `qa-harness verify <slug>` alone.

#### `triage`

Invocation: `/qa:triage <slug>`.

1. `qa-harness run <slug>` reproduces the failure in a new run directory.
2. Reads the verdict and applies the reaction from the dictionary (6.3).
3. For an amount mismatch it prepares a draft bug report: steps, the expected value with its composition, the displayed value as raw text, a screenshot, a trace.
4. For instability it orders 5 repeats and reports the distribution of results.
5. When the evidence does not settle the cause, it returns `UNDETERMINED` with the collected material instead of guessing.

Triage never changes the scenario or the expected values.

#### `contracts`

It has no procedure. It contains the formats and rules from section 8 in a form the agent applies directly: scenario fields, step semantics, driver types with the UI boundary, the shape of the test and the allowed `shopper` calls.

### 5.4 Agent procedures

#### `map-app-flow` (`app-mapper`)

1. Reads the list of missing actions and `map.md`, so as not to rediscover what is already described.
2. Walks through every action in the browser: page snapshot before, execution, snapshot after.
3. Chooses a locator in a fixed order: test attribute, role with name, label, a locator relative to the row with the product name. Positional CSS and structural XPath are forbidden.
4. Establishes the action's completion signal: an acknowledgment from the application visible in the DOM, e.g. a notification or an updated cart counter. A finished HTTP request may be an additional condition, never the only one, because it does not prove that the page re-rendered. The signal is not the expected result of the action: the library waits for that (8.3).
5. For products it builds three operations: the list of candidates in listing order, the read of facts from the product page (the selling price in force, availability, attributes) and adding to the cart. It does not implement selection: the library does that (8.3). It reports a refusal by the application as `PreconditionError` with the raw message.
6. In `readCart` it distinguishes an empty cart from a non-empty one. It returns the raw text of every amount, and for summary rows also the label read from the same row (8.3).
7. Records the network requests of each action as bindings for the live controls (10.6).
8. Writes the action into the driver and the evidence into `map.md`: locator, reason for the choice, completion signal, requests, pitfalls.
9. Finishes when `qa-harness need` reports no gaps and `qa-harness doctor` confirms that the driver conforms to the interface and the UI boundary (R13).

Stop: an ambiguous or unreachable element is returned as an uncertainty, without guessing.

#### `repair-locator` (`app-mapper`)

1. Reads the action, the locator and the error text from the directory of the failed run. The directory is evidence and is not overwritten (8.5).
2. Replays the step in the browser up to the point of failure.
3. Compares the page with the evidence in `map.md`: the element disappeared, changed an attribute, is covered, or appears later.
4. Makes the smallest fix: the locator or the completion signal of that one action.
5. Updates the evidence in `map.md` and states what it changed. A retry without a change to the driver will be rejected (R9).

Stop: the agent returns `NEEDS_TESTER` in two situations. First: the repair would require reading the total or a price from a field with a different label than the one in the rules file, or changing the label itself; that changes what the test measures. Pointing at the row that carries that label is an ordinary repair. Second: the locator and the action are correct, but the application does not acknowledge the action or displays text that is not an amount where an amount belongs; that is the application's behaviour, not the driver's.

#### `design-defects` (`defect-designer`)

The goal is a list of defects that are not in the default list and that this scenario can expose. The algorithm is a systematic review, not a brainstorm.

1. **Inventory.** Lists four things from the scenario and the rules: the steps with kind and target; the values shown in the cart, i.e. lines, adjustments and the total; the rules with inputs, rate and threshold; the transitions between consecutive steps.
2. **Subtracting the defaults.** Fetches `qa-harness defects list`. Default defects break things always and unconditionally, so the agent's space is conditional and parameterized variants.
3. **Lenses.** Asks every inventory item the four fixed questions from the table below.
4. **Recording a candidate.** Operator, target, parameters and condition, plus one sentence on the effect visible to the shopper.
5. **Selection down to 8.** Priority goes to defects the scenario actually exposes, then to those with the largest effect on the total; at most 2 from one lens.
6. **Admission check.** `qa-harness defects check` rejects invalid and duplicate entries (10.4); the agent fixes them once.
7. **Result.** The defects file and a return message: the number admitted per lens, the rejected ones with reasons, concerns that cannot be expressed with an operator.

| Lens | Question | Typical result |
| --- | --- | --- |
| Sequence | Can a value fail to refresh only after a particular kind of step? | `stale-value` with condition `afterStep` |
| Threshold and direction | Can a rule fail to switch on when the threshold is crossed upwards, or fail to switch off downwards? Does decreasing a quantity work the same as increasing it? | `rule-never`, `rule-always` or `no-effect` with a condition |
| Interaction | Can a rate be computed on the wrong base or cover lines it should not? | `rule-rate` with a base parameter |
| Identity and repetition | Can an operation hit the wrong line with similar names or on a second occurrence? Does removing the last line leave the old total? | `wrong-target`, `no-effect` or `stale-value` with a condition |

Stop: an empty list is a valid result. The agent does not pad it up to the limit.

#### `run-verification` (`test-verifier`)

1. Runs `qa-harness verify <slug>`. The gates are computed from scratch, independently of earlier runs.
2. Classifies every defect result other than `detected` according to the definitions in 10.5 and takes the reaction from the dictionary (6.3).
3. For every live control it reads the four recorded facts (10.6) and only from them derives the routing. Without evidence pointing at an owner it returns `UNDETERMINED`.
4. For every scenario gap it formulates one hint in the tester's language: which change to the scenario closes it.
5. Checks the stability of the live run: a full set of agreeing repeats.
6. Compares a hand-edited test with the scenario step by step. A compiled test does not need this, because it is a function of the scenario.
7. Assesses the report, i.e. gate G5: at every checkpoint the action is named in the tester's language, the expected value is shown with its composition, and the displayed value is shown as raw text with the field's label; the report says which evidence exists and which does not.
8. Writes the results to `review.md` in the run directory and issues a verdict from the dictionary (6.3): `VERIFIED`, `REWORK` with an addressee and a finding, `NEEDS_TESTER` with one question, or `UNDETERMINED` with a list of what is missing.

#### `review-intent` (`test-verifier`)

1. Works on the frozen scenario, before compilation (step 3a). It receives the tester's request verbatim, the scenario and the example.
2. Lists the clauses of the request, verbatim.
3. For each it points at the step or checkpoint in the scenario together with the object it concerns: which product changes quantity, which is removed. For example, "different products" has `distinct_from`. Missing coverage or a swapped object is a finding.
4. Looks for excess: steps with no coverage in the request that change its meaning.
5. Writes the review to `specs/<slug>.intent.md` together with the hash of the scenario it concerns.
6. Issues a verdict from the dictionary (6.3): `INTENT_OK`, `REWORK` with a finding for the scenario, or `NEEDS_TESTER` with one question.

## 6. Deterministic code: `qa-harness`, the library, verdicts

Everything that can be computed, generated or run without a model is done by `qa-harness` and the `support/core` library. Both live in the tester's repo, so the test and its verification work without the plugin and without Claude Code, also in CI.

### 6.1 `qa-harness`

Every subcommand prints up to 15 lines and ends with a verdict and an exit code; the full evidence stays on disk (8.5). The "Who invokes it" column is enforced by a hook (R2). In a Claude Code session the command is on `PATH` thanks to the plugin's `bin/`; without the plugin the same program is run by `npm run qa -- <subcommand>` in `e2e/`. The program finds the `e2e/` directory itself, so it works the same from the repo root and from `e2e/`.

| Subcommand | What it does | Who invokes it |
| --- | --- | --- |
| `doctor` | checks the environment, file integrity (R4–R7) and the driver's conformance to the interface and the UI boundary (R13) | `setup`, `new-test`, `verify`, `app-mapper` |
| `selftest` | the harness's own test (10.8) | `setup` |
| `example <slug> [--confirm]` | validates the scenario (8.1), computes the stubs and the example table; with `--confirm` records the tester's confirmation and the hashes | `new-test` |
| `compile <slug> [--force]` | validates the scenario and emits the test (8.4) | `new-test` |
| `need <slug>` | names the actions, product attributes and bindings the driver is missing | `new-test`, `app-mapper` |
| `defects list <slug>` | derives the list of default defects | `defect-designer` |
| `defects check <slug>` | admits or rejects additional defects | `defect-designer`, `new-test` |
| `run <slug> [--dry]` | gates G0–G2 dry, or G0–G3 with a live run | `new-test`, `triage` |
| `verify <slug>` | gates G0–G4 in a new run directory | `test-verifier`, CI |
| `report <slug> [--promote <runId>]` | assembles `report.md`; with `--promote` replaces the files tracked in the repo with the complete set of files of the named run, atomically (8.5) | `new-test` |

**The `compile` contract.** Compilation is a function of the scenario, so its result must be repeatable and must not destroy someone else's work:

- The input is a scenario with `status: confirmed` that passes validation; otherwise `SPEC_INVALID`.
- The same scenario yields a file identical byte for byte. The compiler inserts no time and no absolute paths.
- Every scenario step becomes one `shopper` call, in the same order and with the same parameters; the test title comes from the `title` field. Checkpoints follow from the `check` field: the compiler can neither omit nor add one.
- When the file does not exist, it is created in exclusive mode. When the content would be identical, the command succeeds without writing.
- When the file is the untouched result of an earlier compilation, it is overwritten. Untouched means: the content hash matches the hash recorded in the header.
- When the file was edited by hand, the command ends with `FILE_CONFLICT` without writing and shows the difference; overwriting requires `--force` (R14).

**Classification order in `run`.** First the environment, then the first step that failed. So an environment failure never triggers a driver repair, and an action failure after a red checkpoint is a consequence of the mismatch, not a locator failure.

1. Environment: the probe of the application address before the start, the browser start, network errors and 5xx responses give `INFRA_FAIL`, regardless of the step.
2. The first step that failed determines the class. A `PreconditionError` from the driver or from product selection gives `PRECONDITION_FAIL`. An action that did not find its element or did not get the application's acknowledgment, and a read that is not an amount or comes from a field with a different label, give `LOCATOR_FAIL`. An adjustment with no rule gives `UNMODELED_ADJUSTMENT`, and a value mismatch `ORACLE_MISMATCH`.
3. Stability: differing results across repeats give `FLAKY`.
4. Completeness: before `PASS` is issued, the harness counts the executed tests and checkpoints. Zero tests or a missing checkpoint without an error from points 1–3 gives `NO_TESTS_RUN`.

### 6.2 The `support/core` library

| Module | Role |
| --- | --- |
| `validator` | scenario correctness rules (8.1) |
| `compiler` | emission of the test from the scenario (8.4) |
| `money` | amounts as fractions with a currency; parsing and rounding (9.3) |
| `ledger`, `pricing` | the cart model and the execution of business rules (section 9) |
| `shopper`, `checkpoint` | product selection and the actions binding the driver to the ledger; polling the cart, assertions and mismatch messages |
| `reference-cart`, `operators` | the reference cart and the defect operators (section 10) |
| `live-controls` | injecting faults into the live page (10.6) |
| `reporter` | the run directory, `run.json`, steps in the HTML report (8.5) |

### 6.3 Verdict dictionary

Every step of the flow ends with one of the verdicts below. This is the only place that says what follows what; skills and agent cards refer here. "Compiled test" and "edited test" are told apart by `doctor`. A verdict names an observation, not a cause: routing to repair requires evidence that points at the owner of the problem, and when there is none, the final verdict is `UNDETERMINED`.

| Verdict | Who issues it | Meaning | Reaction |
| --- | --- | --- | --- |
| `SPEC_INVALID` | `example`, `compile` | the scenario breaks the rules from 8.1; the result contains the list of violated rules | `new-test` fixes the scenario or asks the tester |
| `INTENT_OK` | `test-verifier` | every clause of the request has a step or checkpoint in the scenario with the right object; there is no excess | compilation |
| `FILE_CONFLICT` | `compile` | the existing test was edited by hand | stop; the tester chooses `--force` or keeping the edit |
| `LINT_FAIL` | gate G0 | a forbidden pattern or mismatched types in the test or the driver | compiled test: harness bug, stop; edited test: the tester fixes or recompiles; driver: `app-mapper` |
| `CONFORMANCE_FAIL` | gates G1 and G3 | the ledger trace differs from `cart_after`, or the totals differ from the approved example | compiled test: harness bug or changed rules (R6); edited test: the tester |
| `DEFECT_LATE` | gate G2 | a defect detected after the expected checkpoint | as above; typically a checkpoint removed by hand |
| `DEFECT_MISSED` | gate G2 | an applicable defect not detected | as above |
| `INFRA_FAIL` | `run`, `verify` | environment: browser, network, 5xx response, missing binaries | immediate stop; a report with the cause; never `app-mapper` |
| `PRECONDITION_FAIL` | `run`, `verify` | a precondition not met: no product, out of stock, a purchase constraint, a refusal by the application | stop; one message to the tester with the application's raw text |
| `NO_TESTS_RUN` | `run`, `verify` | zero executed tests or an incomplete set of checkpoints without another error | harness bug; never `PASS` |
| `LOCATOR_FAIL` | gate G3 | an action did not find its element, did not get the application's acknowledgment, or a read is not an amount or comes from a field with a different label; the environment is healthy | `app-mapper`, skill `repair-locator` |
| `FLAKY` | gate G3 | a different result across repeats | by the failure class in the failed repeats; table below the dictionary |
| `ORACLE_MISMATCH` | gate G3 | expected differs from displayed | stop; the tester decides: application bug or missing rule |
| `UNMODELED_ADJUSTMENT` | gate G3 | an adjustment in the cart with no rule | one question to the tester about the rule |
| `CONTROL_MISSED` | gate G4 | a live control did not produce the expected red checkpoint | by the four facts about the control (10.6); table below the dictionary |
| `PASS` | `run` | the required gates are green; a complete set of tests and checkpoints | the next step |
| `HARNESS_MODIFIED` | `doctor` | the library was changed (R4) | restore the version from the plugin |
| `SCENARIO_CHANGED` | `doctor` | the scenario or the rules changed after confirmation (R5, R6) | a new confirmation |
| `VERIFICATION_STALE` | `doctor` | the test or the driver changed after verification (R7) | `/qa:verify` |
| `RETRY_REFUSED` | `run` | a repair retry without a change to the file that was to be repaired (R9) | stop; the agent changes the premise or hands the matter over |
| `LIMIT_REACHED` | `qa-harness` | repair attempts exhausted (R9) | stop with the reason and the last verdict |
| `VERIFIED` | `test-verifier` | the intent review matches the scenario hash and all gates are green | promotion of the report and readback |
| `REWORK` | `test-verifier` | a finding with an addressee: `app-mapper`, the scenario or the tester | driver: repair; scenario: back to step 2 with a new confirmation; tester: recompilation or repair of the manual edit |
| `NEEDS_TESTER` | `test-verifier`, `app-mapper` | the decision belongs to a human | one question to the tester |
| `UNDETERMINED` | `run`, `verify`, `triage`, `test-verifier` | the evidence does not settle the cause | escalation to the tester with the collected material |

A 5xx response to a request of a scenario action also gives `INFRA_FAIL`, but the report names the step and the request, because it may be an application bug rather than an environment failure. A non-applicable defect is not a gate verdict, only an entry in the report (10.5).

Two verdicts have several possible owners, so the recorded evidence decides the routing.

| Verdict | Evidence | Routing |
| --- | --- | --- |
| `CONTROL_MISSED` | the control did not activate: target not found or request not intercepted | network controls: `app-mapper` fixes the bindings; `skew-total`: a question to the tester about the total's label |
| `CONTROL_MISSED` | the control was active, the element showed the changed value at the moment of the read, and the test stayed green | `app-mapper`: the driver reads a different field |
| `CONTROL_MISSED` | the control was active, but the element did not show the changed value at the moment of the read | `UNDETERMINED`: the control was ineffective, no charge against the driver |
| `FLAKY` | the failed repeats end with an unmet precondition | the application's data changed between repeats: one retry, then `UNDETERMINED` |
| `FLAKY` | the failed repeats end with an action failure | `app-mapper` fixes the action's completion signal |
| `FLAKY` | the failed repeats end with an amount mismatch | the tester, with the distribution of results and the last read: a possible application bug or a `settleMs` that is too short |

## 7. Guardrails and hooks

Execution safety rests on 15 rules, each with a mechanism that does not depend on the model's good will. The agent cards in section 4 refer to them by identifier.

### 7.1 List of rules

| ID | Rule | Mechanism | Applies to |
| --- | --- | --- | --- |
| R1 | An agent writes only in its own place | hook `guard-paths` and the matrix from 7.3 | agents |
| R2 | An agent runs only its own `qa-harness` subcommands | hook `guard-bash` and the "Who invokes it" column from 6.1 | agents |
| R3 | An agent has only the tools it needs; one has the browser, none has the `Agent` tool | the `tools` field in the agent definition | agents |
| R4 | The `support/core` library is untouchable | hook `guard-paths` for every thread; a checksum in `doctor` | everyone |
| R5 | A scenario is frozen after confirmation | a content hash in the test header and in `run.json` | everyone |
| R6 | Business rules are changed only by the tester's answer | a hook for agents; every change invalidates the approved example | everyone |
| R7 | A change to the test or the driver after verification invalidates its result | hashes of the test and the driver in `verification.json` | everyone |
| R8 | The test and the driver contain no forbidden patterns | gate G0 and the list from 7.4; protects manual edits above all | test, driver |
| R9 | Repair attempts are counted, and each requires a changed premise | `attempts.json` (8.5); without a change to the repaired file `RETRY_REFUSED`, after the limit `LIMIT_REACHED` | correction loops |
| R10 | An agent has a turn limit, and an action and a test a time limit | `maxTurns` in the agent definition; time limits in the config (8.6) | agents, runs |
| R11 | Content from outside is data, not instructions: the page, product names and descriptions, application logs, exception messages | the harness passes such content quoted and shortened; agent roles are limited by R1–R3; the MCP browser has `--allowed-origins` | everyone |
| R12 | Additional defects are declarative and checked | a format without code, `defects check`, a limit of 8 | `defect-designer` |
| R13 | The driver works only through the UI and does not leave the catalog and the cart | the closed `CartDriver` interface; a static check of the driver in G0; the API may be used only for the price with `price_source: api` and for the bindings of the live controls | `app-mapper`, driver |
| R14 | The compiler does not overwrite a manual edit of the test | comparison of the content hash with the header; `FILE_CONFLICT` without `--force` | `compile` |
| R15 | Only light evidence without secrets goes into the repo | the `.gitignore` from `setup` for run directories and traces; the reporter records no cookies, headers or tokens | artifacts |

**An amount mismatch cannot be "fixed".** That follows from R1, R4, R5 and R6 together: no agent can change the library, the scenario or the rules, and without that the expected amount cannot be changed.

### 7.2 Hooks

| Hook | Event | Tools | What it does |
| --- | --- | --- | --- |
| `guard-paths` | `PreToolUse` | `Write`, `Edit` | compares `tool_input.file_path` with the matrix for `agent_type`; on a mismatch it exits with code 2 and the model gets the reason |
| `guard-bash` | `PreToolUse` | `Bash` | lets plugin agents through only with `qa-harness` and a subcommand allowed for the given `agent_type` |

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/guard-paths.mjs\"" }] },
      { "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/guard-bash.mjs\"" }] }
    ]
  }
}
```

Plugin hooks also run inside subagents. They recognize the main thread by the absence of `agent_type`.

### 7.3 Write matrix

| Path | Main thread | `app-mapper` | `defect-designer` | `test-verifier` |
| --- | --- | --- | --- | --- |
| `e2e/support/core/**` | no | no | no | no |
| `e2e/app/*.driver.ts`, `*.map.md` | unrestricted | yes | no | no |
| `e2e/app/*.pricing.ts` | yes, after the tester's answer | no | no | no |
| `e2e/specs/<slug>.md`, `.example.json` | yes, until confirmation | no | no | no |
| `e2e/specs/<slug>.defects.json` | yes, for the tester's concerns | no | yes | no |
| `e2e/specs/<slug>.intent.md` | no | no | no | yes |
| `e2e/tests/**` | through `qa-harness compile`; a manual edit invalidates verification | no | no | no |
| `e2e/reports/<slug>/runs/<runId>/review.md` | no | no | no | yes |
| `e2e/reports/<slug>/` outside `runs/` | only through `qa-harness report --promote` | no | no | no |
| any other path | unrestricted | no | no | no |

### 7.4 Forbidden patterns

In the test:

- `waitForTimeout` and any fixed wait
- `test.skip`, `test.fixme`, `test.only`
- `expect` outside `support/core`, and amount literals
- `try/catch` or `if` around actions and checkpoints
- reading environment variables, direct use of `page`, imports from outside `support/core`

In the driver:

- a fixed wait instead of an action completion signal
- API calls outside the two exceptions from R13
- navigation outside the application's domain and any action that finalizes an order

### 7.5 What the guardrails do not cover

- The main thread is protected only within R4–R7 and R14 and against writing reviews and promoted files with the Write and Edit tools. A manual edit of the test or the driver is allowed, but invalidates verification.
- R11 in the main thread limits the risk but does not remove it: the main thread reads summaries from the harness and has the full permissions of the session. A change to the rules or the scenario is caught only by the hashes from R5 and R6.
- `--allowed-origins` is a convenience, not a security boundary; that is how the Playwright documentation describes the option.
- The hooks depend on the value of `agent_type` for plugin agents, which is still to be confirmed (15.4).

## 8. Artifacts and contracts

The whole state of the flow lives in files. Every file has one author, and the right to write is enforced by the matrix from 7.3.

| Artifact | Who creates it | In the repo | Format |
| --- | --- | --- | --- |
| `specs/<slug>.md` | `new-test` | yes | 8.1 |
| `specs/<slug>.example.json` | `qa-harness example` | yes | 8.2 |
| `specs/<slug>.intent.md` | `test-verifier` | yes | 10.7 |
| `specs/<slug>.defects.json` | `new-test` for the tester's concerns; `defect-designer` | yes | 10.4 |
| `app/<app>.driver.ts`, `app/<app>.map.md` | `app-mapper` | yes | 8.3 |
| `app/<app>.pricing.ts` | `new-test`, after the tester's answer | yes | 9.2 |
| `tests/<slug>.spec.ts` | `qa-harness compile` | yes | 8.4 |
| `reports/<slug>/runs/<runId>/` | the reporter; `review.md` is written by `test-verifier` | no | 8.5 |
| `reports/<slug>/` outside `runs/` | `qa-harness report --promote` | yes | 8.5, 11.4 |
| `qa.config.json` | `setup` | yes | 8.6 |

### 8.1 Scenario: `specs/<slug>.md`

The scenario is the only place where the model records its understanding of the request. The YAML header is a contract with a closed grammar; the description below it is generated for people and does not affect the test.

```yaml
id: cart-total-add-change-remove
title: cart total stays correct after add, quantity change and remove
app: toolshop
status: confirmed      # draft | confirmed
request: >             # the tester's words, verbatim
  Add two different products to the cart. Change the quantity of one,
  then remove the other. Check that the cart shows the correct total after each change.
products:
  A: { pick: first-available }
  B: { pick: next-available, distinct_from: [A] }
steps:
  - { id: S1, do: add,    product: A, qty: 1, cart_after: { A: 1 } }
  - { id: S2, do: add,    product: B, qty: 1, cart_after: { A: 1, B: 1 } }
  - { id: S3, do: setQty, product: A, qty: 3, cart_after: { A: 3, B: 1 } }
  - { id: S4, do: remove, product: B,         cart_after: { A: 3 } }
check: each-step       # each-step | last-step | [S2, S4]
preconditions: [empty-cart, guest, no-geolocation]
price_source: ui       # ui | api
```

The scenario describes the cart state after each step, not numbers: the total is computed by the oracle from prices read during the test. The `check` field determines the set of checkpoints. A product named by the tester is `{ pick: by-name, name: "<name>" }`, and a required attribute is `where`, e.g. `{ pick: first-available, where: { co2_rating: [A, B] } }`.

**Step semantics.** The same table holds in the ledger, in the reference cart and in the validator.

| Step | Condition | Effect in the ledger |
| --- | --- | --- |
| `add P n` | `n` at least 1 | no line for P: a new line with quantity `n`; the line exists: its quantity grows by `n` |
| `setQty P n` | P is in the cart; `n` at least 1 | the quantity of P equals `n` |
| `remove P` | P is in the cart | the line disappears; the cart may become empty |

A product's unit price is read once, at the first add, and stays constant until the end of the scenario. Changing a quantity to zero does not exist as `setQty`: removal is `remove`. The grammar's extension point is the steps `set` and `clear` for cart attributes, e.g. a coupon code (10.4).

**Validation.** `qa-harness example` and `qa-harness compile` reject an invalid scenario with verdict `SPEC_INVALID` and the list of violated rules. The error returns to the model before a test exists.

| Rule | Requirement | Example of a violation |
| --- | --- | --- |
| V1 Schema | required fields; known values of `do`, `pick`, `check`, `price_source`; unique step `id`s; the scenario `id` equal to the file name | a step `do: applyCoupon` |
| V2 References | every step points at a declared product; every declared product is used | `product: C` without a declaration |
| V3 Different products | aliases denote different products: an unnamed pick lists all earlier aliases in `distinct_from`, and `by-name` does not repeat a name; an unnamed pick never selects a product named in the scenario, regardless of the order of declarations (8.3) | A and B with the same name |
| V4 Step conditions | every step meets the condition from the semantics table | `remove B` before `add B` |
| V5 A step changes state | `setQty` to the current quantity is an error, because such a step cannot be told apart from one that does not work | `setQty A 1` right after `add A 1` |
| V6 State agreement | each step's `cart_after` equals the state computed by the ledger | `cart_after: { A: 2 }` after `add A 1` |
| V7 Checkpoints | `check` points at existing steps; the last step has a checkpoint | `check: [S2]` with four steps |
| V8 Purchase constraints | no product state in `cart_after` exceeds a known limit from the rules file (9.2); the state counts, not the step argument | `add A 60` and `add A 60` with a limit of 99 |

V6 sets two independent sources side by side: `cart_after` is written by the model, and the state is computed by code. A discrepancy means the model misunderstood the request or the step semantics.

**Freeze.** After confirmation, `qa-harness example --confirm` sets `status: confirmed` and records in the example the SHA-256 hash of the contract fields and the hash of the rules file. The scenario hash also goes into the test header and into `run.json`, so `doctor` detects any later change (R5, R6).

### 8.2 Example: `specs/<slug>.example.json`

The example is placeholder data (stubs) and the totals computed on it. The tester approves the behaviour on it, and the dry gates check the test on it without the application.

```json
{
  "currency": "USD",
  "stub": {
    "A": { "price": "10.00", "attrs": { "co2_rating": "A" } },
    "B": { "price": "20.00", "attrs": { "co2_rating": "D" } }
  },
  "expected": [
    { "step": "S1", "cart": "A×1",      "subtotal": "10.00", "adjustments": { "eco-discount": "0.50" }, "total": "9.50"  },
    { "step": "S2", "cart": "A×1, B×1", "subtotal": "30.00", "adjustments": {},                         "total": "30.00" },
    { "step": "S3", "cart": "A×3, B×1", "subtotal": "50.00", "adjustments": { "eco-discount": "2.50" }, "total": "47.50" },
    { "step": "S4", "cart": "A×3",      "subtotal": "30.00", "adjustments": { "eco-discount": "1.50" }, "total": "28.50" }
  ],
  "confirmed": { "scenarioSha256": "9f2c…", "rulesSha256": "c41d…" }
}
```

- The harness assigns attributes to the stubs so that every pricing rule fires once and does not fire once. Here the discount disappears in S2 and returns in S3.
- Prices are placeholders, round and different for every product, because the example is meant to be checkable in one's head.
- The stubs claim nothing about the application's data. Real prices and attributes appear only in the live run.

### 8.3 Application driver: `app/<app>.driver.ts`

The driver is the only place with locators and makes no decisions: it performs actions through the UI and returns what the page displays. The interface is closed, so conformance is checked by the TypeScript compiler.

```ts
export interface CartDriver {
  candidates(): AsyncIterable<string>;                 // product names in listing order
  productFacts(name: string): Promise<ProductFacts>;   // product page
  addProduct(name: string, qty: number): Promise<void>;
  setQuantity(name: string, qty: number): Promise<void>;
  remove(name: string): Promise<void>;
  readCart(): Promise<CartView>;                       // what the cart displays
  setAttribute?(key: string, value: string): Promise<void>;  // extension point, e.g. a coupon code
  apiPrice?(name: string): Promise<Money>;             // only with price_source: api
  controls: LiveControls;                              // request bindings for the live controls (10.6)
  provides: { attrs: string[] };                       // product attributes the driver reads
}

type Money = { numerator: bigint; denominator: bigint; currency: CurrencyCode };
type Displayed = { value: Money; rawText: string };    // the amount and the text exactly as the page showed it
type SummaryRow = Displayed & { label: string };       // the label of the row the amount comes from

type ProductFacts = {
  name: string;
  unitPrice: Money;      // the selling price in force, after promotion
  listPrice?: Money;     // the price before promotion, if the page shows it
  inStock: boolean;
  attrs: Record<string, string>;
};

type CartLine = { name: string; qty: number; unitPrice: Displayed; lineTotal: Displayed };
type CartView =
  | { empty: true; emptyMessage: string; total?: SummaryRow }
  | { empty: false; lines: CartLine[];
      adjustments: SummaryRow[];
      subtotal?: SummaryRow; total: SummaryRow };
```

**Driver rules.**

- An action returns after the application's acknowledgment visible in the DOM (5.4), not after the expected result. The library waits for the result: it polls the cart until it agrees with the ledger or until `settleMs` elapses (8.6). Thanks to this a lost update gives a red checkpoint, not a locator failure. There are no fixed waits (7.4).
- `readCart` waits until the cart table or the empty-cart message is visible, and only then decides which variant of `CartView` to return.
- An empty cart is a state, not an error. If the application shows a total in it, the driver returns it; if not, there is no `total` field.
- Every amount is returned together with its raw text. It is parsed by the library (9.3), not by the driver.
- The driver reads the label and the amount of a summary row from one row element, not from two locators. The label then says which field was read (9.1).
- A refusal by the application, e.g. a message about a unit limit, is a `PreconditionError` with the verbatim text of the message.
- Everything goes through the UI (R13).

**Product selection** is done by the library, not the driver, because it is a function of facts about products.

```ts
type ProductRef = { name: string };
type ProductFilters = { needQty?: number; where?: Record<string, string[]> };
type ProductPick =
  | { pick: 'first-available'; filters?: ProductFilters }
  | { pick: 'next-available'; distinctFrom: ProductRef[]; filters?: ProductFilters }
  | { pick: 'by-name'; name: string };
```

1. For `by-name` the library fetches `productFacts(name)`. For the other picks it walks `candidates()` in listing order and skips the products in `distinctFrom`. It also skips every product the scenario names, including one added later: the compiler writes the list of those names into the test.
2. A candidate is dropped when it is out of stock, when a known purchase constraint is lower than `needQty`, or when its attributes do not satisfy `where`.
3. The first matching candidate goes to `addProduct`, and its price and attributes feed the ledger.
4. No matching product within the candidate limit, and a `by-name` product that is dropped, give `PRECONDITION_FAIL`. The library never substitutes a different product.

`needQty` is computed by the compiler as the largest state of the product in `cart_after`, not the largest step argument: `add A 2` and `add A 2` gives 4. `where` comes from the scenario. An attribute required by a rule or a filter that is not in `provides.attrs` is reported by `qa-harness need` before the browser starts.

Next to the driver lies `app/<app>.map.md`: the evidence for every action, i.e. the locator, the reason for the choice, the completion signal, the network requests and the pitfalls.

### 8.4 Test: `tests/<slug>.spec.ts`

The test is the result of `qa-harness compile` (6.1): a thin composition without locators, amounts or logic.

```ts
// GENERATED by qa-harness compile. Change the scenario, not this file.
// scenario: cart-total-add-change-remove · sha256:9f2c…
// request: Add two different products to the cart. Change the quantity of one, then remove the other. Check that the cart shows the correct total after each change.
// body-sha256: 41ab…
import { test } from '../support/core/fixtures';

test.use({ preconditions: ['empty-cart', 'guest', 'no-geolocation'], priceSource: 'ui' });

test('cart total stays correct after add, quantity change and remove', async ({ shopper }) => {
  const a = await shopper.add({ pick: 'first-available', filters: { needQty: 3 } }, 1);
  await shopper.checkTotal('S1');

  const b = await shopper.add({ pick: 'next-available', distinctFrom: [a] }, 1);
  await shopper.checkTotal('S2');

  await shopper.setQuantity(a, 3);
  await shopper.checkTotal('S3');

  await shopper.remove(b);
  await shopper.checkTotal('S4');
});
```

- **The header** carries the scenario hash, the tester's request and the hash of the file's content. By the content hash `doctor` recognizes whether the file is the untouched result of compilation or was edited by hand.
- **`shopper`** binds the driver to the ledger: every action changes the page and the model at the same time. The allowed calls are `add`, `setQuantity`, `remove` and `checkTotal`.
- **`checkTotal`** compares the whole cart state, not only the total (9.1).
- **The driver is injected**, so the same file works on the live application and on the reference cart.
- **Reserved names.** When the scenario names products, the compiler adds them to `test.use` as `reserved`. An unnamed pick will not select them (8.3).
- **Isolation.** Every repeat starts in a fresh browser context: no stored state, no geolocation permission, with `locale` set. Before the first step the fixture checks the preconditions; an unmet one gives `PRECONDITION_FAIL`.

### 8.5 Run evidence: `reports/<slug>/`

Every invocation of `qa-harness run` or `verify` is one run with its own directory. Nothing overwrites the directory, so the first failure stays as evidence also after a repair. The directory is created in exclusive mode, and `attempts.json` and promotion are protected by a per-scenario lock, so two parallel runs do not mix evidence (case C4).

```text
reports/<slug>/
  report.md  run.json  verification.json  review.md  screens/   last promoted run; in the repo
  attempts.json                                                 repair attempt counter (R9); outside the repo
  runs/<runId>/                                                 every run; outside the repo
    run.json  verification.json  review.md  S1.png …  trace.zip  html/
```

`run.json` has one record per checkpoint in every repeat. The report and the readback are built from it. The data in the example are placeholders.

```json
{
  "meta": {
    "runId": "20261125T101502Z-3f9a", "slug": "cart-total-add-change-remove",
    "scenarioSha256": "9f2c…", "testSha256": "77d0…", "testOrigin": "compiled",
    "timestamp": "2026-11-25T10:15:02Z", "baseURL": "https://practicesoftwaretesting.com",
    "browser": "chromium", "locale": "en-US", "priceSource": "ui",
    "pluginVersion": "0.3.0", "gitSha": "ab12cd3"
  },
  "verdict": "PASS",
  "repeats": [
    { "n": 1, "result": "pass", "error": null,
      "checkpoints": [
        { "step": "S3", "action": "set quantity of Product A to 3",
          "ledger": [ { "name": "Product A", "qty": 3, "unitPrice": "10.00" },
                      { "name": "Product B", "qty": 1, "unitPrice": "20.00" } ],
          "expected":  { "empty": false, "subtotal": "50.00",
                         "adjustments": [ { "rule": "eco-discount", "amount": "2.50" } ],
                         "total": "47.50", "currency": "USD" },
          "displayed": { "empty": false,
                         "subtotal": { "label": "Subtotal", "value": "50.00", "rawText": "$50.00" },
                         "adjustments": [ { "label": "Eco discount", "value": "-2.50", "rawText": "-$2.50" } ],
                         "total": { "label": "Total", "value": "47.50", "rawText": "$47.50" } },
          "result": "pass", "screenshot": "S3.png" }
      ] }
  ]
}
```

- **One result field.** `verdict` takes values from the dictionary (6.3). There is no separate failure-category field, because two fields could contradict each other.
- **Failure.** The repeat's record gets `error`: `{ step, kind, message, url, rawTotal }`, where `rawTotal` is the raw text of the total, if it was visible.
- **Written despite a failure.** The reporter writes the file in the test's teardown, also after an exception and after a timeout, with the checkpoints collected up to that moment.
- **Raw text.** `rawText` is the text from the page with no normalization at all.

`verification.json` collects the result of the gates: the hashes of the test, the driver and the rules, the result of every gate and every defect, the four facts about every live control, the scenario gaps, and the hash of the scenario for which an intent review exists (10.2, 10.5, 10.6, 10.7).

`attempts.json` has one entry per repair attempt: `{ attempt, runId, verdict, target, artifactShaBefore, reason }`. The next run is admitted only when the hash of the repaired file differs from `artifactShaBefore` (R9).

Only a run promoted by `qa-harness report --promote` goes into the repo. Promotion is atomic: the complete set of the run's files, i.e. `report.md`, `run.json`, `verification.json`, `review.md` and the checkpoint screenshots, goes to a temporary directory and replaces the previous set with one rename. The tracked files therefore always come from one run, and `test-verifier` writes `review.md` only in the run directory. Promotion happens by itself after `VERIFIED`; a run with an amount mismatch can be promoted by the tester manually as evidence of an application bug. The trace and the HTML report stay outside the repo (R15).

### 8.6 Configuration: `qa.config.json`

```json
{
  "app": "toolshop",
  "baseURL": "https://practicesoftwaretesting.com",
  "testIdAttribute": "data-test",
  "locale": "en-US",
  "currency": "USD",
  "browserDriver": "mcp",
  "priceSource": "ui",
  "defects": "default",
  "repeat": 3,
  "pickLimit": 30,
  "timeouts": { "probeMs": 5000, "actionMs": 10000, "settleMs": 3000, "testMs": 90000 }
}
```

| Field | Values | Meaning |
| --- | --- | --- |
| `locale`, `currency` | language tag; currency code | the page language and the amount format the parser assumes (9.3) |
| `browserDriver` | `mcp`; `cli` reserved for a variant with `playwright-cli` | what `app-mapper` drives the browser with |
| `priceSource` | `ui`, `api` | the default value of the `price_source` field in new scenarios (9.4); the value recorded in the scenario applies |
| `defects` | `default`, `extended` | whether step 3b is active (10.4) |
| `repeat` | number | repeats of the live run in gate G3 |
| `pickLimit` | number | how many candidates from the listing the library checks during product selection (8.3) |
| `timeouts` | milliseconds | probe of the application address; acknowledgment of a single action; cart stabilization before a checkpoint is judged; the whole test (R10) |

`settleMs` is separate from `actionMs` because a red checkpoint uses all of it: in a control where every checkpoint is meant to be red, the cost grows with the number of steps. In control runs the harness extends the test limit by the number of checkpoints multiplied by `settleMs`, so expected red checkpoints do not end in the test's time limit. The values are starting values: a `settleMs` that is too short gives false reds, one that is too long lengthens the controls. They are chosen after measuring the time from an action's acknowledgment to the cart's refresh (order Z2).

## 9. The oracle: how the test knows which total is correct

The expected cart state is the ledger plus the application's explicit pricing rules, and every displayed amount must be a correct rounding of the exact value. No component of the expected value comes from the cart or from a number written by the model.

**Why "price × quantity" is not enough.** According to the Toolshop source code, the cart lowers the total by 5% when more than half of the units have CO2 rating A or B, and has two more adjustments (15.1). A naive oracle is therefore wrong in every cart in which a rule fires. Whether the live application applies these rules is a hypothesis to check (15.2). The design does not depend on the answer, because both sides of a discrepancy end with the tester: a rule the application does not apply gives `ORACLE_MISMATCH`, and an adjustment with no rule gives `UNMODELED_ADJUSTMENT`.

### 9.1 What one checkpoint checks

| Layer | Assertion | Where the expected value comes from |
| --- | --- | --- |
| State | the cart is empty if and only if the ledger is empty; a total shown in an empty cart is zero | ledger |
| Field labels | the rows the total and the subtotal come from have labels matching the rules file | rules file (9.2) |
| Lines | names and quantities in the cart agree with the model | ledger |
| Unit price | the price in the cart equals the selling price read at the add | product facts |
| Line total | price × quantity, exactly | ledger |
| Adjustments | every displayed row has a rule; every rule in force that has a label has a row; the row's amount agrees with the rule | pricing rules |
| Subtotal | if displayed: the sum of the line totals | ledger |
| Total | subtotal minus adjustments | ledger and rules |

The checkpoint polls the cart until the view agrees with the expected one or `settleMs` elapses (8.6), and judges the last read. A mismatched field label is a read error, not an amount mismatch: it gives `LOCATOR_FAIL` before amounts are compared. Assertions are soft: the test continues after a mismatch, so the report shows all checkpoints, not only the first red one. An action that fails after a red checkpoint is a consequence of the mismatch and does not change the verdict (6.1).

The mismatch message has a fixed format, readable without knowing the code. The data in the example are placeholders.

```text
S3 · total mismatch
  action:    set quantity of Product A to 3
  expected:  $47.50 = subtotal $50.00 − eco-discount $2.50
  displayed: "$50.00" in row "Total"
  diff:      +$2.50
  layer:     adjustments · rule eco-discount applies, no row displayed
```

### 9.2 Business rules: `app/<app>.pricing.ts`

The file contains three things: the labels of the summary fields, by which the checkpoint and the controls recognize the total; the pricing rules, from which the oracle computes adjustments; the purchase constraints, used by the validator and by product selection. All are data, not code.

```ts
export const summary = {
  total:    { label: /^total\b/i },                  // label of the total row in the cart
  subtotal: { label: /^subtotal\b/i },
  provenance: { source: 'code', ref: 'cart.component.html @ae7caec', live: 'unconfirmed' },
};

export const rules: PricingRule[] = [
  {
    id: 'eco-discount',
    label: /eco/i,                                   // adjustment row in the cart
    when: { shareOfUnits: { where: { co2_rating: ['A', 'B'] }, above: '0.5' } },
    amount: { percentOf: 'running', rate: '5' },     // of the value after earlier adjustments
    provenance: { source: 'code', ref: 'cart.component.ts @ae7caec', live: 'unconfirmed' },
  },
];

export const constraints: PurchaseConstraint[] = [
  { id: 'line-max', maxQty: 99,
    provenance: { source: 'code', ref: 'cart.component.ts @ae7caec', live: 'unconfirmed' } },
  { id: 'single-unit', match: { name: 'Thor Hammer' }, maxQty: 1,
    provenance: { source: 'code', ref: 'CartService.php @ae7caec', live: 'unconfirmed' } },
];
```

- **Field labels.** A label pattern is knowledge about the application, just like a rule: it has provenance and only the tester's answer changes it. The driver does not know it, so it cannot fit it to its own locator.
- **Rule vocabulary.** A condition is `always`, `shareOfUnits`, `hasUnits` or `subtotalAtLeast`. An amount is a percentage of the subtotal, a percentage of the value after earlier adjustments, or a fixed amount. A rule that cannot be written this way is a candidate for extending the plugin.
- **Why data, not functions.** Defect operators must know a rule's rate and threshold in order to break them (10.3), and the model should not write code that computes the expected value.
- **Provenance.** Every entry gives its source (`code`, `tester` or `observed`) and whether it was confirmed on the live application. The report shows this status next to every rule used.
- **Nobody invents rules.** When the cart shows an adjustment with no rule, the verdict is `UNMODELED_ADJUSTMENT` and the tester gets one question. The answer goes into the file and serves later scenarios. Every change to the file invalidates the approved examples (R6).
- **Adjustments outside v1.** The two other adjustments from the Toolshop code are switched off in v1: the 15% for combining a product with a rental, by selecting products from the listing without rentals, and the location discounts, by the `no-geolocation` precondition. If they appeared, `UNMODELED_ADJUSTMENT` would detect them.

### 9.3 Arithmetic and rounding

- **Representation.** Amounts are fractions on integers with a currency code; no floats. An operation on two currencies is an error.
- **Parsing.** The parser reads an amount from raw text according to `locale` and `currency` from the config. Text that is not an amount in that currency is not compared: it gives `LOCATOR_FAIL`, and the raw text goes into the report.
- **Order.** Rules are computed in the order of the file, on exact values. Rounding happens only when comparing with a displayed amount.
- **Tolerance.** Every displayed amount is checked separately: `|displayed − exact| ≤ 0.5 cent`. The tolerance is not discretionary: it allows both sides only on an exact half-cent tie.
- **Lines.** Line totals have no fractional part of a cent, so for them the assertion is an equality.
- **Sign of an adjustment.** An adjustment's amount is compared by absolute value, because applications write the sign of a discount differently. The direction of the adjustment is verified by the total.

An application that rounds intermediate results can, with several adjustments, drift from the exact value by more than half a cent. That ends with verdict `ORACLE_MISMATCH` and the tester's decision, not with silent acceptance.

### 9.4 Limits

- The oracle detects errors in summing, in cart updates and in the application of rules.
- It does not detect a wrong price on the product page, because with `price_source: ui` that page is the source of truth. With `price_source: api` the source is the product API's response, and the price from the page becomes a checked value.
- A rule written wrongly and approved by the tester on the example becomes a wrong expectation. Only the readability of the example protects against that (11.1).
- A field label is as trustworthy as the page: if the application labels the total wrongly, the oracle will not detect it.
- Out of reach is everything not visible in the cart, e.g. taxes and delivery charged in later checkout steps.

## 10. Verifying the test, or tests of the test

A test is ready only after passing six gates, three of which work on placeholder data without the application. The question "can this test be trusted" is settled by the harness, not the tester. Before the test exists, the scenario passes two checks: validation V1–V8 (8.1) and an independent intent review (10.7).

| Gate | What it works on | What it proves | Performer |
| --- | --- | --- | --- |
| G0 Static | the test file and the driver | no forbidden patterns (7.4); types conform to the contract; the driver stays within the UI boundary | code |
| G1 Dry, healthy cart | the reference cart and the stubs from the example | the test passes; the ledger trace equals `cart_after`; the totals equal the example approved by the tester | code |
| G2 Dry, defects | the reference cart with one defect switched on | every applicable defect gives a red checkpoint where it should; the rest are named as scenario gaps | code |
| G3 Live run, 3 times | the live application | the test passes stably; a complete set of checkpoints; the ledger trace equals `cart_after` | code |
| G4 Live controls | the live application with an injected fault | the driver reads the total from the field the page labels as the total; the test reacts to a lost update | code, run by `test-verifier` |
| G5 Report review | report, test, scenario | the report shows at every checkpoint the action, the expected and the displayed value, and the scope of the evidence; a manual edit of the test does not change the meaning of the scenario | `test-verifier` |

G0–G2 take seconds and use no tokens, which is why they stand before the browser.

**What the gates mean for a compiled test.** Such a test cannot omit a checkpoint or confuse a step, so G0–G2 answer different questions for it than for a hand-edited test.

| Gate | Compiled test | Hand-edited test |
| --- | --- | --- |
| G0, G1 | harness regression and an integrity check: a red result is a plugin bug or changed rules | verification of the edit |
| G2 | a measurement of the scenario: which classes of errors this scenario exposes and which it does not | verification of the edit, e.g. a removed checkpoint |
| G3–G5 | no difference: the driver, the application and the run report do not come from compilation | no difference |

### 10.1 Reference cart

The reference cart is an in-memory implementation of the `CartDriver` interface, supplied by the plugin and independent of the application. The same test file runs on it instead of on the page. It has defect switches, so it provides inputs with a known result: a healthy cart must give a green test, a faulty one must give a red one.

Default defects of the reference scenario with one pricing rule:

| Defect | Behaviour of the faulty cart | Expected detection |
| --- | --- | --- |
| `lost-add` | an add does not reach the cart | the `add` step |
| `lost-qty` | a quantity change has no effect | the `setQty` step |
| `qty-wrong-line` | a quantity change hits a different line | the `setQty` step |
| `lost-remove` | a removed line stays | the `remove` step |
| `remove-wrong-line` | a different line is removed | the `remove` step |
| `stale-total` | the total comes from the state before the last change | the first step that changes the total |
| `total-off-by-cent` | the total is 1 cent too high | every step |
| `line-ignores-qty` | the line total without multiplying by the quantity | the first step with a quantity greater than 1 |
| `rule-never` | the pricing rule is never applied | the first step on which the rule is in force |
| `rule-always` | the pricing rule is always applied | the first step on which the rule is not in force |
| `rule-wrong-rate` | the pricing rule is applied at the wrong rate | the first step on which the rule is in force |
| `rule-boundary` | the rule's threshold is shifted | the first step on which the cart is exactly at the threshold |
| `round-down` | truncation instead of rounding | the first step on which the fractional part of a cent exceeds a half |

The "expected detection" column is computed by the harness (10.5); the table describes it in words.

### 10.2 How a defect is used, step by step

A defect is a named switch in the reference cart that breaks one of its behaviours. The test does not know about it: it gets the reference cart in place of the application driver and performs the same steps.

```ts
// support/core/reference-cart.ts (fragment)
async setQuantity(name: string, qty: number) {
  if (this.defect === 'lost-qty') return;        // operation without effect
  const line = this.defect === 'qty-wrong-line'
    ? this.otherLine(name)                       // operation hits a different line
    : this.line(name);
  line.qty = qty;
}
```

For every defect on the list the harness does the same:

1. Simulates the scenario on the healthy cart and on the faulty one, on the stubs from the example. The first checkpoint at which their views differ is recorded as the expected place of detection.
2. Runs the actual test file on the cart with the defect switched on: `QA_DEFECT=lost-qty npx playwright test --project=dry tests/<slug>.spec.ts`.
3. Reads the first red checkpoint from `run.json`.
4. Compares it with the expected one and records the result in `verification.json`.

The run for `lost-qty` on the reference scenario and the stubs from 8.2:

| Step | Healthy cart shows | Cart with `lost-qty` shows | Test expects | Checkpoint |
| --- | --- | --- | --- | --- |
| S1 add A | A×1 · $9.50 | A×1 · $9.50 | A×1 · $9.50 | green |
| S2 add B | A×1, B×1 · $30.00 | A×1, B×1 · $30.00 | A×1, B×1 · $30.00 | green |
| S3 quantity of A = 3 | A×3, B×1 · $47.50 | A×1, B×1 · $30.00 | A×3, B×1 · $47.50 | red |
| S4 remove B | A×3 · $28.50 | A×1 · $9.50 | A×3 · $28.50 | red |

The carts diverge at S3 and that is where the test is red for the first time, so the defect is detected in the right place.

```json
{ "defect": "lost-qty", "origin": "default", "expected": "S3", "firstRed": "S3", "result": "detected" }
```

If `checkTotal('S3')` were removed from the test by hand, the first red checkpoint would fall on S4. The result `detected-late` gives verdict `DEFECT_LATE` and returns to the tester with the diagnosis "no checkpoint after S3" and a proposal to recompile. In a compiled test this situation does not arise.

Gate G2 runs twice: before the browser on the stubs from the example, and after the live run on the real prices and attributes of the products. The numbers in the readback come from the second run.

### 10.3 Where the list comes from: operators

Nobody writes the list from 10.1 by hand. The harness derives it from operators applied to the scenario's steps and the application's pricing rules. A new rule or a new kind of step therefore gets its defects without adding them to a list.

| Operator | What it breaks | What it is applied to | Defects in the reference scenario |
| --- | --- | --- | --- |
| `no-effect` | the operation does not change state | every kind of step | `lost-add`, `lost-qty`, `lost-remove` |
| `wrong-target` | the operation hits a different line | steps on an existing line | `qty-wrong-line`, `remove-wrong-line` |
| `stale-value` | the value comes from the previous state | the total | `stale-total` |
| `skew-value` | the value is shifted by 1 cent | the total | `total-off-by-cent` |
| `ignore-factor` | the value omits a factor | the line total | `line-ignores-qty` |
| `rule-never`, `rule-always` | the rule does not work or always works | every pricing rule | `rule-never`, `rule-always` |
| `rule-rate`, `rule-boundary` | a wrong rate or a shifted threshold | rules with a rate and a threshold | `rule-wrong-rate`, `rule-boundary` |
| `round-mode` | truncation instead of rounding | amounts with a fraction of a cent | `round-down` |

Rule operators read the rate and the threshold directly from the rule's data (9.2). Example: adding the rule "15% for a product with a rental" to the rules file adds its defects to the list by itself.

### 10.4 Extensible list

Custom defects from two sources can be added to the default ones: from the tester and from an agent. The second is controlled by a switch in setup, because only it uses tokens.

| Source | Who creates it | When | Model cost |
| --- | --- | --- | --- |
| `default` | the harness: operators applied to steps and rules | always | zero |
| `tester` | the tester in one sentence; `new-test` records it as an operator with parameters | when the tester gives a concern through `--risk` | negligible |
| `generated` | the `defect-designer` agent | only in `extended` mode | one agent invocation per scenario |

The switch is `"defects": "default"` or `"extended"` in `qa.config.json`. The `--defects extended` flag overrides it for one invocation.

**Format.** An additional defect is not code. It is a choice of operator, target and parameters plus a sentence of justification, recorded in `specs/<slug>.defects.json`.

```json
[
  { "id": "discount-stale-after-remove", "origin": "generated",
    "operator": "stale-value", "target": { "adjustment": "eco-discount" },
    "when": { "afterStep": "remove" },
    "why": "discount computed from the state before the line was removed" },
  { "id": "total-stale-after-decrease", "origin": "tester",
    "operator": "stale-value", "target": { "value": "total" },
    "when": { "afterStep": "setQty", "direction": "decrease" },
    "why": "the total does not refresh after a quantity decrease" }
]
```

**Admission check.** `qa-harness defects check` rejects an entry when the operator does not exist, the target occurs neither in the scenario nor in the rules, or the defect behaves identically to one already present. Admitted defects then work like default ones: they go through the steps from 10.2. The file stays in the repo, so later verifications use no model.

**When they are created.** Defects from the agent are created in step 3b, after the intent review, before compilation and before the first run, so the agent cannot fit them to what the test happens to detect. The algorithm is described by the `design-defects` skill (5.4).

**What cannot be expressed.** A concern that cannot be written with an operator goes into the report as a risk not covered by verification and as a candidate for a new operator in the plugin. The agent does not write defect code.

**A new feature, e.g. a coupon.** The table shows what is added when the cart gets an attribute that affects the total.

| What is added | Where | Who |
| --- | --- | --- |
| the coupon's pricing rule | `app/<app>.pricing.ts` | main thread, after the tester's answer |
| a scenario step | `do: set, attr: coupon, value: SAVE10` | main thread |
| an action in the driver | `setAttribute('coupon', code)` | `app-mapper` |
| reference cart behaviour | no change: a cart attribute is handled generically, and the rule is read from the rules file | nobody |
| defects | default ones arise by themselves; additional ones in `extended` mode | harness, `defect-designer` |

In v1 the steps `add`, `setQty` and `remove` are implemented. The `set` step is a designed extension point: implementing it is a one-time change to the plugin (grammar, semantics in the ledger, compiler template, a rule condition on a cart attribute), after which further attributes and rules no longer require changes to the plugin. The Toolshop cart has no coupon field, so extensibility on the live application is shown by the 15% rule for a product with a rental (case B7).

### 10.5 Applicability and the pass criterion

The harness simulates the scenario on the healthy and the faulty cart. The expected place of detection is the first checkpoint of the scenario at which their views differ.

| Defect result | Definition | Effect |
| --- | --- | --- |
| `detected` | the first red checkpoint is the expected one | passes |
| `detected-late` | the first red checkpoint is later than the expected one | verdict `DEFECT_LATE` |
| `missed` | the views differ at some checkpoint, and the test is green | verdict `DEFECT_MISSED` |
| `not-applicable` | the views do not differ at any checkpoint of the scenario | a scenario gap in the report; does not block |

- **Pass:** 100% of applicable defects with result `detected`.
- **A scenario gap** goes into the report together with a hint on what closes it. Example: when both products meet the rule's condition, the defect `rule-always` is not applicable, because the discount is in force at every step. Hint: one product without rating A or B.
- **A gap is not a flaw of the test.** It says what this scenario does not check and leaves the decision to the tester.

### 10.6 Live controls (G4)

The dry gates check the test's logic, but not which field of the real page the driver takes the amount from. Controls on the live application close this under one condition: a control must not use the locator it checks.

| Control | Mechanism | How it knows its target | Expectation |
| --- | --- | --- | --- |
| `skew-total` | a script on the page keeps an amount 1 cent higher in the total row | it finds the row itself, by the visible label from the rules file (9.2): the row with that label and exactly one amount | every checkpoint with a visible total is red |
| `drift-price` | the cart response with a line's price 1 cent higher | the cart request binding in the driver | red from the first step with that line |
| `lost-update` | the quantity-change request acknowledged without being executed | the change request binding in the driver | red at the `setQty` step |
| `lost-remove` | the removal request acknowledged without being executed | the removal request binding in the driver | red at the `remove` step |

**Why the label and not the driver's locator.** If `skew-total` changed the element the driver points at, a wrong locator would confirm itself: the control would change the wrong field, the driver would read the change, and the checkpoint would be red as expected. With equal values the live run would pass too, e.g. when the subtotal equals the total or the cart has one line. A target determined independently reverses the result: a driver reading a different field does not see the change and the test stays green.

**Four facts about every control** go into `verification.json` and into the report:

1. whether the control activated, i.e. the target was found or the request intercepted;
2. which element it changed: the label and a DOM fragment, or the request address;
3. what that element showed at the moment the checkpoint read it;
4. at which checkpoint the test reacted.

A result other than the expected red checkpoint is `CONTROL_MISSED`. These four facts decide the routing (6.3).

**Scope of the evidence**

- G4 proves that the driver reads the total from the row carrying the total's label and that the test reacts to a lost update. It does not prove that the label on the page is true.
- The report states whether in the run the total differed from the subtotal and from the value of a single line. If not, only the label-based control confirms that the fields are told apart, and the report says so plainly.
- A layout in which a wrong locator passes the live run is checked on the control page in `selftest` (10.8), regardless of what Toolshop happens to show.
- `skew-total` is mandatory. The other controls work when the driver has bindings; their absence is reported as lower coverage, never skipped silently.
- `lost-update` and `lost-remove` also check that the driver waits for the application's acknowledgment and not for the expected result (8.3).
- Besides `price_source: api`, the controls are the only place where the harness touches the network layer (R13).

### 10.7 Intent review and report review (G5)

An independent model reads the work twice, at two different moments.

| Review | When | What it compares | Result |
| --- | --- | --- | --- |
| intent | step 3a: after the scenario is frozen, before compilation | the tester's request with the scenario: every clause has a step or checkpoint with the right object | `specs/<slug>.intent.md` with the scenario hash; `INTENT_OK` or `REWORK` |
| report, gate G5 | step 8: after the run and the controls | the report with what a reviewer needs; a hand-edited test with the scenario | `review.md` in the run directory |

- **Why intent before the browser.** Gates G0–G2 prove that the scenario is executed correctly, also a misunderstood one. If the intent review stood at the end, a red live run would end the flow before it, and the tester would get a mismatch for a scenario nobody independent had read.
- **Why after the freeze.** The review is bound to the scenario hash. Every change to the scenario invalidates it together with the tester's confirmation.
- **The only second reader.** With test writing moved into compilation, the intent review is the only place where a second model checks the work of the first: the translation of the request into a scenario.
- **Procedures** are described in 5.4: `review-intent` and `run-verification`.

### 10.8 Harness self-test: `qa-harness selftest`

Since the test, the expected values and the verdicts are produced by code, that code has its own tests. `selftest` works without the live application and without a model: the part without a browser takes seconds, the part on the control page starts a browser locally. It is run by `setup`, and in the plugin repo by every change to the library.

| Area | What it checks |
| --- | --- |
| money | parsing of formats for the configured `locale`; rejection of text that is not an amount and of a foreign currency; the half-cent tie |
| validator | one scenario breaking each of the rules V1–V8; each gives `SPEC_INVALID` with the right rule |
| compiler | the reference scenario gives a file identical to the golden file byte for byte; two compilations give the same file; a manual edit gives `FILE_CONFLICT` |
| reference cart and operators | the healthy cart is green; every default defect is red at the expected checkpoint |
| equal prices | stubs with identical prices: `wrong-target` defects are still detected, i.e. the checkpoint compares lines, not only the total |
| empty cart | a scenario ending with an empty cart is green in both variants, with a zero total and without a total element; `lost-remove` is red |
| classification | crafted runs give the right verdict: an unreachable address `INFRA_FAIL`, a `PreconditionError` `PRECONDITION_FAIL`, zero tests `NO_TESTS_RUN`, an action failure after a red checkpoint `ORACLE_MISMATCH` |
| product selection | `add A 2` and `add A 2` gives `needQty` 4; an unnamed pick skips a product named in the scenario, also one declared later |
| control page | a local page with a cart in which the subtotal is always visible. A correct driver passes G3 and G4. A driver reading the subtotal as the total passes G3 with equal values, and G4 gives `CONTROL_MISSED` with the evidence "control active, test green". The same driver with a discount gives `LOCATOR_FAIL` at the label layer, not `ORACLE_MISMATCH` |
| parallelism | two runs at once get different run directories and do not mix evidence |
| integrity | the checksums of `support/core` match the plugin version |

### 10.9 The limit of this guarantee

Verification proves that the test detects the classes of errors in the catalog, corresponds to the approved scenario, and reads the total from the field labelled on the page as the total. It does not prove detection of every possible application bug. The defect catalog grows together with new kinds of steps and rules.

## 11. What the tester sees

The tester gets three things: a short question before the work, a readback after the work, and a test document in the repo. None of them requires reading code.

The templates below are in the language of this document; the plugin answers in the language of the request, and the files in the repo are in English. All amounts in the templates come from the stubs in 8.2, not from a run.

### 11.1 Confirmation before the work

```text
Scenario: cart-total-add-change-remove
A = first available product, B = the next one, different from A
Plugin's choice: the quantity changes for A (from 1 to 3), B is removed.

Step  Shopper's action            Cart after the step
S1    adds A, 1 unit              A×1
S2    adds B, 1 unit              A×1, B×1
S3    changes quantity of A to 3  A×3, B×1
S4    removes B                   A×3
The cart state and the total are checked after every step.

Example on stub prices (A $10.00 with CO2 rating A, B $20.00 with rating D):
S1 $9.50 · S2 $30.00 · S3 $47.50 · S4 $28.50
Rule: 5% discount when more than half of the units have CO2 rating A or B.
Source of the rule: application code; not yet confirmed on the live site.

Assumptions: guest, empty cart, no geolocation, prices from the product page,
the total is the row labelled "Total".
Confirm? (ok / correction)
```

- The numbers in the example are computed by the oracle's code. The tester therefore approves the behaviour of the same logic that later judges the application.
- The confirmation shows every choice the plugin made itself (5.3), so that the tester can change it in one sentence.
- The rule's status comes from its provenance in the rules file (9.2).

### 11.2 Readback after the work

```text
PASS 3/3 · test verified
Products: A = <name A> ($10.00, CO2 A) · B = <name B> ($20.00, CO2 D)

Step  Shopper's action                    Expected  Displayed  Result
S1    adds <name A>, 1 unit               $9.50     "$9.50"    match
S2    adds <name B>, 1 unit               $30.00    "$30.00"   match
S3    changes quantity of <name A> to 3   $47.50    "$47.50"   match
S4    removes <name B>                    $28.50    "$28.50"   match

Evidence: intent review without remarks; defects 12/12 applicable, each in the right place;
live controls 4/4; report review without remarks.
Scope: the total was read from the row "Total"; at S1, S3 and S4 it differed from the subtotal.
Scenario gap: it would not detect truncating fractions of a cent instead of rounding
(no amount has a fractional part above half a cent).
Rules used: eco-discount · source: application code · visible on the page in this run.
Rerun: cd e2e && npx playwright test tests/cart-total-add-change-remove.spec.ts
```

For an amount mismatch the readback lists the evidence that already exists and says plainly which does not:

```text
MISMATCH at S3 · amounts differ
The scenario covers all four required changes (intent review without remarks).
The test passed the checks on the reference cart: defects 12/12 applicable.
S3: expected $47.50, displayed "$50.00" in row "Total"; difference +$2.50.
The controls on the live site were not run, because the run is red.
To decide: an application bug or a missing rule.
```

- The "Displayed" column gives the raw text from the browser, in quotes.
- The order is fixed: verdict, products, step table, evidence, scope, gaps, rules, rerun command.
- The "Scope" line says whether the total differed from the subtotal in the run. When it did not, it states that only the label-based control confirms that the fields are told apart (10.6).
- The command works verbatim from the repo root; in `e2e/` its second part is enough.

### 11.3 Five possible endings

| Ending | Verdicts | What the tester gets | The tester's decision |
| --- | --- | --- | --- |
| Green and verified | `VERIFIED` | the table, the verification result, scenario gaps, the command | none; commit |
| Amounts differ | `ORACLE_MISMATCH` | a breakdown of the mismatch (layer, step, difference, raw text, screenshot) and the list of evidence: intent review, dry gates, the label of the field read; live controls not run | an application bug or a missing rule |
| An unknown adjustment in the cart | `UNMODELED_ADJUSTMENT` | the adjustment's label and amount | stating the rule in one sentence |
| The scenario could not be executed | `INFRA_FAIL`, `PRECONDITION_FAIL` | the cause with the raw message: the environment or a precondition | a retry later or a change to the scenario |
| The plugin did not deliver a verified test | `LIMIT_REACHED`, `RETRY_REFUSED`, `UNDETERMINED`, `NO_TESTS_RUN` | the reason, the last verdict, the path to the run directory | a retry, an abort, or a bug report against the plugin |

- In the second case the tester decides about the product's behaviour, not about the correctness of the test's code. The message lists the evidence that already exists: the independent intent review, the dry gates and the label of the field the amount comes from. It also says plainly that the controls on the live site were not run.
- The fifth case is an explicit failure: the plugin says there is no verified test instead of handing over an unverified one.
- During the work the tester may get one question instead of an ending: for an ambiguous request, for `NEEDS_TESTER` and for `FILE_CONFLICT`.
- An out-of-scope request ends with a refusal before the work starts (1.2).

### 11.4 The test document in the repo

| File | Content |
| --- | --- |
| `reports/<slug>/report.md` | the table from the readback, the product facts, the rules used with provenance, the evidence and its scope, scenario gaps, how to run the test and how to read a failure |
| `reports/<slug>/run.json`, `verification.json` | raw data of checkpoints, gates and controls (8.5) |
| `reports/<slug>/screens/` | a screenshot of every checkpoint of the promoted run |
| `reports/<slug>/review.md` | the report review from the promoted run |
| `specs/<slug>.intent.md` | the intent review: the clauses of the request and their coverage in the scenario, with the scenario hash |
| Playwright HTML report and trace | every checkpoint as a step with the action's name, the expected and the displayed amount and a screenshot; outside the repo, a copy in `examples/` in the submission |

## 12. Repository structure

The plugin repo is the subject of the submission. The tester's repo is what the plugin creates and what later works without the plugin.

### 12.1 Plugin repo

```text
.claude-plugin/plugin.json
.claude-plugin/marketplace.json     installation from GitHub
skills/new-test/                    command; confirmation and readback templates, example pairs
skills/setup/                       command
skills/verify/                      command
skills/triage/                      command
skills/contracts/                   shared
skills/map-app-flow/                app-mapper
skills/repair-locator/              app-mapper
skills/design-defects/              defect-designer
skills/review-intent/               test-verifier, step 3a
skills/run-verification/            test-verifier, step 8
agents/app-mapper.md
agents/defect-designer.md           optional, extended mode
agents/test-verifier.md
hooks/hooks.json
scripts/guard-paths.mjs
scripts/guard-bash.mjs
bin/qa-harness                      thin wrapper around the harness in the tester's repo
.mcp.json                           playwright server
templates/e2e/                      copied by /qa:setup
  package.json                      e2e's own dependencies; the qa script runs the harness
  playwright.config.ts
  .gitignore                        run directories, trace, HTML report
  support/core/                     the modules from 6.2 and their tests
  support/harness/                  qa-harness code; the control page with drivers for selftest
evals/                              level A cases
examples/toolshop/                  scenario, compiled test, driver, reports from a real run
docs/                               design, evaluation log
README.md
```

### 12.2 Tester's repo

```text
e2e/
  package.json                      own dependencies; npm run qa -- <subcommand>
  qa.config.json
  playwright.config.ts
  specs/<slug>.md                   scenario
  specs/<slug>.example.json         stubs, approved totals, hashes
  specs/<slug>.intent.md            intent review for the scenario hash
  specs/<slug>.defects.json         defects from the tester and the agent
  tests/<slug>.spec.ts              compiled test
  app/<app>.driver.ts               locators, actions, cart read
  app/<app>.pricing.ts              field labels, pricing rules and purchase constraints, with provenance
  app/<app>.map.md                  evidence from exploration
  support/core/                     the library from the plugin, with a checksum
  support/harness/                  qa-harness and the control page
  reports/<slug>/                   promoted run: report, data, screenshots, report review
  reports/<slug>/runs/<runId>/      evidence of every run; outside the repo
```

The `specs/` and `tests/` layout follows the convention of the Playwright test agents. The other directories are our own.

### 12.3 Mapping to what the assignment requires

| Required element of the submission | Where in the repo |
| --- | --- |
| Plugin | repo root |
| A short README for the tester | `README.md`: installation, one invocation, how to read the result, one decision with its observation (14.5) |
| The test generated by the plugin | `examples/toolshop/tests/` together with the scenario, the example and the driver |
| The result of a real run | `examples/toolshop/reports/`: the promoted run and a copy of the HTML report with screenshots |

## 13. Token budget

The model works in steps 2, 3a, 6, 8 and 9, and the most expensive of them, building the driver, is a one-time cost per application. Numbers will appear after measurement in evaluation (section 14); until then the table gives only the order of magnitude.

| Step | Uses the model | First scenario | Next scenario of the same application |
| --- | --- | --- | --- |
| 2. Scenario | yes, main thread | low | low |
| 3a. Intent review | yes, `test-verifier` | low | low |
| 3b. Additional defects | only in `extended` mode | one agent invocation | one agent invocation |
| 4. Compilation | no | zero | zero |
| 5. Dry gates | no | zero | zero |
| 6. Driver | yes, `app-mapper` with the browser | the highest in the whole flow | zero when the actions already exist |
| 7. Run | no | zero | zero |
| 8. Verification | yes, `test-verifier` | medium | medium |
| 9. Readback | yes, main thread | low | low |
| Every later run of the test | no | zero | zero |

**Mechanisms that limit cost**

- The test is produced without a model, so its cost and variance are zero.
- The output of code and agents is short by definition (4.1, 6.1). Logs, screenshots and traces stay on disk.
- One agent has the browser, and it is started only when `qa-harness need` shows a gap.
- The cheapest gates stand first, so a logic error does not cost a browser session.
- An environment failure ends the flow immediately instead of triggering a driver repair (6.1).
- Limits are hard: agent turns in its definition, repair attempts in the harness, and a retry without a changed premise is rejected (R9).
- Permanently in the session context are the names and one-sentence descriptions of 10 skills and 3 agents; the content loads on use.

**Known fixed cost.** The plugin's MCP server starts with every session in which the plugin is enabled. This is the main argument for the later `cli` variant and one of the things to measure.

## 14. Evaluating the harness

The harness is evaluated at three levels: cheap behaviour cases with a mocked browser, full runs on Toolshop, and portability checks. The log from these runs is the only source of the "one decision" for the README.

Every agent procedure is a separate unit of evaluation: a case gives it its input from a file and checks its output, without going through the whole flow. In this way A5 evaluates `run-verification`, A7 `design-defects`, and A13 `review-intent`. The model does not evaluate the deterministic code: its test is `selftest` (10.8).

### 14.1 Level A: `claude plugin eval`

Every case is a directory `evals/<name>/` with a prompt and graders. A run starts in a fresh, isolated session, and the plugin's MCP servers are replaced with mocks by default.

| Case | Prompt | Grader |
| --- | --- | --- |
| A1 triggering | a QA request in plain words, without the skill's name | the `new-test` skill was used |
| A2 no triggering | a question unrelated to tests | the skill was not used |
| A3 ambiguity | "check that the cart works" | the answer ends with a question; no test file was created |
| A4 reference scenario, dry | the request from the assignment with `--yes` | the scenario and the test were created; the test comes from `qa-harness compile` and has 4 checkpoints; gates G0–G2 green |
| A5 the verifier catches a test with a hole | a repo with a test from which the checkpoint after S3 was removed by hand, and `/qa:verify` | verdict `REWORK` to the tester, pointing at S3 |
| A6 guard | "fix the expected total so the test passes" | the answer asks about the rule instead of fitting the amount; no changes in `support/core` and `specs` |
| A7 extended defects | the request from the assignment in `extended` mode, dry | the defects file was created before the test file; every entry passed the admission check |
| A8 out-of-scope request | "add a product, use coupon SAVE10 and check the total" | the refusal names the missing feature; no file was created |
| A9 protection of a manual edit | a repo with a hand-edited test and a request that changes its scenario, e.g. a different quantity | `FILE_CONFLICT`; the test file unchanged |
| A10 environment failure | `baseURL` points at an unreachable address | `INFRA_FAIL` with the cause; `app-mapper` was not invoked |
| A11 paraphrase with swapped objects | a request in other words than the assignment's: two different products, the quantity of the second to 3, removal of the first, the total after each step | the scenario has `setQty` on B and `remove` on A; the test has 4 checkpoints; gates G0–G2 green |
| A12 adding versus setting | "add two units of a product, then two more of the same; check the total after each step" | the scenario has two `add` steps and a final state of 4 units, without `setQty`; the test has `needQty` 4 |
| A13 intent review catches a swapped object | a repo with a scenario that removes a different product than the request says | `REWORK` for the scenario before compilation; no test file was created |

A4, A5 and A9–A12 require running `qa-harness` in the eval sandbox. If that does not work, they move to level B.

### 14.2 Level B: full runs on Toolshop

Each in a fresh unattended session with `--yes`.

| Case | Scenario | What it measures |
| --- | --- | --- |
| B1 | the reference one from the assignment | the main path; the cost of the first scenario |
| B2 | three products, two quantity changes | driver reuse; the cost of the next scenario |
| B3 | the same product added twice | merging of lines in the cart |
| B4 | a product with CO2 rating A or B and a product without it, the discount threshold crossed during the scenario | the pricing rule on both sides of the threshold; settles hypothesis H1; the only live case in which the total differs from the subtotal |
| B5 | a driver with a deliberately broken locator | triage routes to `app-mapper`; scenario and test untouched |
| B6 | the eco rule removed from the rules file, a product with rating A or B in the cart | `UNMODELED_ADJUSTMENT` and a question instead of fitting the expectations |
| B7 | a product and a rental in one cart, a new 15% rule | extensibility: the new rule's defects arise without changes to the plugin |
| B8 | one product added and removed | the empty cart as a state: a green checkpoint without a total element |

B4 and B6 assume that the live application applies the eco discount (hypothesis H1, 15.2). If Z0 refutes it, B4 becomes an `ORACLE_MISMATCH` case for a rule known only from the code, and B6 drops out.

### 14.3 Level C: portability

| Case | What it does | Criterion |
| --- | --- | --- |
| C1 Clean clone | a fresh clone of the tester's repo: `npm ci` in `e2e/`, Chromium installation, then the test and `verify` run twice, from the repo root and from `e2e/` | passes without the plugin, without Claude Code and without an API key; the command from the readback works verbatim |
| C2 Core neutrality | a static check of `support/core`, `skills/` and `agents/` | no product names, selectors or rule identifiers that occur in `app/` and `examples/` |
| C3 Second application | the control page from `selftest`: a different DOM, a different amount format, an always-visible subtotal, a zero total in the empty cart; its own driver and rules file | the reference scenario passes G0–G4 without changes to the core or the compiler |
| C4 Parallelism | the same scenario in two processes at once and with `--workers=2` | both runs green; two different run directories with a complete set of files; only its own products in each cart; `attempts.json` consistent |

C1 answers directly the assignment's requirement that the test reruns without regeneration.

### 14.4 Log and cost

After every run an entry goes into `docs/eval-log.md`: plugin version, case, verdict, correction rounds per agent, tokens per agent, time, what went wrong, what change to the harness resulted.

Evals are real model invocations. While iterating, one run without the comparison arm is enough (`--runs 1 --ablation none`); the full three runs with the "without the plugin" comparison are run only before submission.

### 14.5 Candidates for the README decision

| Decision | The observation that must support it |
| --- | --- |
| A compiled test instead of one from an agent | the measurement from Z4: differences between tests written by the model for the same scenario versus identical files from compilation |
| An oracle with pricing rules instead of "price × quantity" | a naive test fails on the live application in a cart with a product covered by a rule; requires a confirmed H1 |
| Dry gates before the browser | the number of errors caught before the first browser session |
| A separate verifying agent | a finding that the code gates did not catch |
| MCP or CLI for `app-mapper` | tokens in B1 for both variants |

One decision goes into the README, the one with the strongest real observation. None is written down before the observation has been seen.

## 15. Facts, hypotheses and open items

This section separates three kinds of knowledge: facts read from the source code, observations from the live application, and hypotheses that connect the two. No amount for the live application is a fact until it comes from a run in a browser.

### 15.1 Toolshop: facts from the source code

Source: [testsmith-io/practice-software-testing](https://github.com/testsmith-io/practice-software-testing), directory `sprint5`, commit `ae7caec` of 11 October 2026.

| Fact | Consequence for the design |
| --- | --- |
| The cart total is computed by the browser: quantity × price, minus the cart discount, minus the eco discount | the oracle models pricing rules |
| Eco discount of 5% when more than 50% of units have CO2 rating A or B | rule `eco-discount` |
| 15% discount when the cart holds a product and a rental | outside v1 |
| Location discounts of 5–25% for selected products when the cart has coordinates | precondition `no-geolocation` |
| An empty cart renders only a paragraph with a message; the table and the total element are not in the DOM | the empty variant of `CartView` without a total |
| The cart footer labels the total "Total"; the same text is the header of the line-total column | the `skew-total` control looks for the row with the label and exactly one amount |
| The "Subtotal" row is rendered only when a discount applies | without a discount the total equals the sum of line totals; telling the fields apart by values requires a cart with a discount or the control page |
| The eco discount is computed on the value after the cart discount, not on the subtotal | the rule with `percentOf: 'running'` |
| The notification about a quantity change and about a removal appears before the cart refetch finishes | after an action's acknowledgment the view may still be old: the checkpoint waits up to `settleMs` |
| Discounts are displayed as "- $0.71"; amounts have a thousands separator | cases for the amount parser in `selftest` |
| A quantity above 99 is clamped to 99, with a warning | constraint `line-max` |
| The test attribute is `data-test`; in the cart: `product-title`, `product-quantity`, `product-price`, `line-price`, `cart-subtotal`, `cart-eco-discount`, `cart-total` | driver locators |
| The line removal button has no test attribute | a locator relative to the product's row |
| A quantity change reacts to the `change` event, sends `PUT /carts/{id}/product/quantity` and refetches the cart | refresh after the action; control `lost-update` |
| Adding is `POST /carts/{id}`, removal is `DELETE /carts/{id}/product/{productId}`; adding again increases the line's quantity | control bindings; `add` semantics; case B3 |
| The cart identifier lives in `sessionStorage` | a fresh browser context is an empty cart |
| Limit of 99 units per line; Thor Hammer at most 1 unit, with a refusal message from the API | purchase constraints; `PreconditionError` |
| The CO2 rating is on the product page (`co2-rating-badge`) | attribute `co2_rating` read through the UI |
| After an add, a quantity change and a removal the application shows a notification | a candidate for the action acknowledgment in the driver |
| The cart counter in the header is hidden at zero lines | not sufficient as a signal of an empty cart |
| The default product listing omits rentals and has 9 items per page | candidate order; pagination in `candidates()` |
| The "with bugs" variant has a different, older cart implementation | not suitable as a ready-made negative control |

### 15.2 Toolshop: the live application

The observations of 24 November 2026 come from the public API and the static files of the live application, not from a run in a browser.

| Observation | Source |
| --- | --- |
| Version 5.0, production environment | [/status](https://api.practicesoftwaretesting.com/status) |
| 50 products, 9 per page; the whole first page has CO2 rating D and no product on it is marked as eco | [/products?page=1](https://api.practicesoftwaretesting.com/products?page=1) |
| The first two products are Combination Pliers $14.15 and Pliers $12.01; the fourth, Long Nose Pliers, is unavailable | as above |
| 12 of 50 products are marked as eco; all have rating B, none A; one of them is Wood Saw $12.18 | pages 2–6 of the same API |
| Empty-cart message: "The cart is empty. Nothing to display." | [en.json](https://practicesoftwaretesting.com/assets/i18n/en.json) |

Hypotheses follow from setting the code against the observations. Each has a test that settles it in order Z0.

| ID | Hypothesis | Basis | Test in Z0 |
| --- | --- | --- | --- |
| H1 | The live application applies the 5% eco discount when more than half of the units have rating A or B | source code; not observed live | a cart with only a B-rated product, e.g. Wood Saw; read the discount row |
| H2 | In the reference scenario on the first two products no rule fires, and the totals are: S1 $14.15, S2 $26.16, S3 $54.46, S4 $42.45 | prices and ratings from the API, arithmetic from the code; S1 agrees with the observation quoted in DEP-10 | a manual run of the scenario |
| H3 | The `data-test` selectors in the deployed version match the code at `ae7caec` | source code; version 5.0 in `/status` | a snapshot of the product page and the cart |
| H4 | The empty cart on the live site shows the message without a table and without a total | source code; the text in `en.json` | removal of the only line |
| H5 | The notification appears after every action and does not cover cart elements | source code | observation in the browser |
| H6 | The total on the live page is in a row labelled "Total", and the "Subtotal" row appears only with a discount | the cart template in the source code | a snapshot of the cart without and with a discount |

**Correction relative to v0.2.** Version 0.2 stated that the first two products have ratings A and B and that the total after the first add is $13.44. Those values came from the seed data in the repository, which differ from the live application's data, and were wrong for it. In version 0.3 amounts for the live application occur only in this section, as a hypothesis.

### 15.3 Claude Code and Playwright

| Fact | Source |
| --- | --- |
| A plugin skill is invoked as `/<plugin>:<directory>`; files from `bin/` are on the Bash tool's `PATH`; the plugin's MCP tools are named `mcp__plugin_<plugin>_<server>__<tool>` | [plugin components](https://code.claude.com/docs/en/plugins/components.md) |
| In a plugin agent's definition the fields `hooks`, `mcpServers` and `permissionMode` are ignored; the `skills` field injects the content of skills; a subagent inherits MCP tools, and `tools` narrows them; a subagent can start a subagent | [subagents](https://code.claude.com/docs/en/sub-agents.md) |
| A skill with `disable-model-invocation: true` is not chosen by the model; `allowed-tools` removes permission prompts; up to 500 lines recommended in `SKILL.md` | [skills](https://code.claude.com/docs/en/skills.md) |
| Plugin hooks also run in subagents, the input contains `agent_type`, exit code 2 blocks the call | [hooks](https://code.claude.com/docs/en/hooks.md) |
| `claude plugin eval`: cases in `evals/`, by default 3 runs and an arm without the plugin, MCP servers mocked | [plugin evals](https://code.claude.com/docs/en/plugin-evals.md) |
| An enabled plugin adds the descriptions of its components and the processes of its MCP servers to every session | [plugins overview](https://code.claude.com/docs/en/plugins/overview.md) |
| Playwright has planner, generator and healer agents with the `specs/` and `tests/` convention | [Playwright Test Agents](https://playwright.dev/docs/test-agents) |
| Playwright MCP: `--headless`, `--isolated`, `--test-id-attribute`, `--allowed-origins` | [Playwright MCP options](https://playwright.dev/mcp/configuration/options) |

### 15.4 Open, to be settled in Z0

- Hypotheses H1–H6 from 15.2.
- The exact value of `agent_type` for a plugin agent: `qa:app-mapper` or `app-mapper`.
- How to name a skill from the same plugin in an agent's `skills` field.
- Whether `claude plugin eval` is available on the account and whether its sandbox will run `qa-harness`.
- How to pass the application's domain to an MCP server defined statically in the plugin.
- Whether a marketplace can point at a plugin lying in the root of the same repo.
- The cost of starting a browser in the dry gates and how to avoid it.
- Whether the live application computes the eco discount on the value after the cart discount, as the code does. Concerns case B7.
- The choice of products for the scenario in the submission: the first two from the listing, i.e. a run without a rule, or a pair with a B-rated product, i.e. a run with the rule. The second option gives the only live run in which the total differs from the subtotal. Decision after H1 is settled.

## 16. Order sequence

First the deterministic code and the reference run without the plugin's agents, then the agents, one at a time. This way every order debugs one layer.

| # | Order | Scope | Completion criterion |
| --- | --- | --- | --- |
| Z0 | Spike | a manual run of the scenario on the live application; tests of hypotheses H1–H6; plugin mechanics on an empty skeleton | list 15.4 closed with facts; discrepancies against the source code written down; the rules file agrees with what the live application showed |
| Z1 | Library and harness without a browser | money, ledger, rules, validator, compiler, product selection, checkpoint, `shopper`, reference cart with defects; `qa-harness selftest`, `example`, `compile`, dry gates | the part of `selftest` without a browser is green; the compiled reference test passes G0–G2; all applicable defects detected in the right place |
| Z2 | Toolshop driver and the live run | driver, reporter with run directories, failure classification, live controls with the four facts, control page with a correct and a wrong driver, `qa-harness run` and `verify` | G3 green 3/3; `skew-total` finds the total by its label; the wrong driver on the control page gives `CONTROL_MISSED`; an unreachable address gives `INFRA_FAIL`; `settleMs` and the other limits chosen from measurement; with H1 confirmed, a note on how the oracle fails without the eco rule |
| Z3 | Plugin skeleton | manifest, `/qa:setup`, role hooks, `.mcp.json`, `bin/qa-harness`, `e2e/package.json` | the plugin loads with `--plugin-dir`; setup in an empty repo ends with a green `selftest`; a hook blocks a write outside the role and a foreign subcommand; `npm run qa` works without the plugin |
| Z4 | `/qa:new-test` up to compilation | scenario, example, confirmation, intent review, compilation, dry gates; skills `new-test`, `contracts` and `review-intent`; the `test-verifier` agent within step 3a; a comparative measurement: five tests written by the model for the same scenario | from the assignment's request a scenario equivalent to the reference one and a test identical byte for byte are produced; A11, A12 and A13 green; an ambiguous request ends with a question, and an out-of-scope request with a refusal; the measurement result in the log |
| Z5 | `app-mapper` | removing the driver from Z2 and generating it anew; skills `map-app-flow` and `repair-locator` | B1 green on the generated driver; differences against the Z2 driver written down |
| Z6 | `test-verifier` after the run and `/qa:verify` | classification of results, evidence-based routing, report review, verdicts; skill `run-verification` | a test with a hand-made hole gives `REWORK` pointing at the step; B1 gives `VERIFIED`; the readback for an amount mismatch lists the evidence |
| Z6b | Extended defects, optional | the defects file format, `qa-harness defects check`, the `defect-designer` agent, the switch in setup; skill `design-defects` | A7 green; a concern given through `--risk` reaches verification as a defect |
| Z7 | Evaluation and fixes | cases A1–A13, B1–B8, C1–C4, log, the MCP versus CLI measurement | a log with observations; the decision for the README chosen |
| Z8 | `/qa:triage` | classification and routing | B5 and B6 end in accordance with the verdict dictionary (6.3) |
| Z9 | Submission | README in English, `examples/toolshop/` from a real run, installation from GitHub | a third person gets through the README without questions; C1 green |

The reference test in Z1 and the driver in Z2 are produced in an ordinary Claude Code session, without the plugin's agents. They are the baseline against which what the plugin later generates is compared.

**What is not subject to cuts.** Z1, Z2, Z4 and Z6 answer the question of how the test decides correctness. Nor is the first full run of `/qa:new-test` in a real Claude Code session, from the request to `VERIFIED` (B1): the assignment requires the result of a real run, and only that run shows whether the harness works outside its own tests.

**Cut line when time is short.** First Z6b and Z8 drop out, then cases B3–B8 from Z7.

## 17. Register of decisions and changes relative to v0.2

The register collects the decisions that changed the design between v0.2 and v0.3: proposals from the DEP, deviations from them, our own decisions, and fixes from the review of v0.3. The content of each decision is in the sections the register refers to; here there is only the reason.

### 17.1 Decisions

| ID | Decision | Reason | Source | Sections |
| --- | --- | --- | --- | --- |
| D1 | The test comes from compiling the scenario; the `test-writer` agent and the `compose-test` skill disappear | the scenario has a closed grammar, so turning it into code is a function: zero variance, zero tokens, no class of errors "the model omitted a checkpoint" | DEP-01 | 3, 6.1, 8.4 |
| D2 | The scenario passes validation V1–V8 in `example` and in `compile`; a step that does not change state is an error | an error in understanding the request surfaces before the test, not in the browser | DEP-02 | 8.1 |
| D3 | Failures have disjoint classes: environment, precondition, locator, oracle; `INFRA_FAIL`, `PRECONDITION_FAIL`, `NO_TESTS_RUN` and `UNDETERMINED` are added | an environment failure must not trigger a driver repair, and zero tests must not give `PASS` | DEP-03 | 6.1, 6.3 |
| D4 | Every run has its own directory; only a promoted run goes into the repo | the evidence of the first failure survives the repair | DEP-03, DEP-07 | 8.5 |
| D5 | An empty cart is a state in `CartView`, not a read error | removing the last line is an ordinary scenario step | DEP-04 | 8.3, 9.1 |
| D6 | Step semantics in one table; amounts with a currency; rules computed exactly, rounding only at comparison; every amount with its raw text | one definition for the ledger, the reference cart and the validator; the report shows what the browser showed | DEP-05 | 8.1, 8.3, 9.3 |
| D7 | The driver works only through the UI (R13) | the test is meant to prove what the shopper sees | DEP-05 | 7.1, 8.3 |
| D8 | Product selection by name and through filters; purchase constraints with provenance next to the pricing rules | the scenario must work on data that changes and must not hit a product that cannot be bought in the required quantity | DEP-06 | 8.1, 8.3, 9.2 |
| D9 | `run.json` carries the run's metadata, one verdict field and a failure record; the reporter writes it also after an exception; a fixed `locale`; a mismatch message with a fixed format | a run must be reproducible and readable without the code | DEP-07 | 8.5, 8.6, 9.1 |
| D10 | Skills: example pairs instead of general sentences, placeholder data only; R9 requires a changed premise; R11 covers all content from outside; time limits in the config; artifact hygiene (R15) | each of these rules answers a specific failure mode of an agent | DEP-08 | 5.2, 7.1, 8.6 |
| D11 | Evaluation: cases A8–A13 and B8, level C with C1–C4, the harness self-test | the code that produces the test and the verdicts must have its own tests; portability is a criterion of the assignment | DEP-09 | 10.8, 14 |
| D12 | The behaviour of the live application is a hypothesis with a test, not a fact; the first full run in a real session is not subject to cuts | v0.2 stated as fact amounts that turned out wrong for the live data | DEP-10 | 15.2, 16 |
| D13 | Pricing rules are data with a closed vocabulary, not functions | defect operators must know the rate and the threshold; the model does not write oracle code | own | 9.2, 10.3 |
| D14 | Product selection is done by the library; the driver supplies candidates and facts | selection is a function of facts, so the model does not write it; the driver stays without decisions | own | 8.3 |
| D15 | The scenario is frozen by code (`example --confirm`), not by the model | the model does not compute hashes and does not edit the frozen file | own | 8.1 |
| D16 | A hook limits every agent's `qa-harness` subcommands (R2) | an agent cannot itself run a step that belongs to someone else, e.g. promotion of the report | own | 6.1, 7.1 |
| D17 | A change to the driver also invalidates verification (R7) | gate G4 proves something about a specific driver | own | 7.1, 8.5 |
| D18 | `review.md` is created in the run directory, and promotion replaces the complete set of files atomically | the files tracked in the repo must come from one run | review of v0.3 | 7.3, 8.5 |
| D19 | `settleMs` separated from `actionMs`; control runs have an extended test limit | a red checkpoint uses the whole stabilization limit, and in controls all of them are red | review of v0.3 | 8.6, 9.1 |
| D20 | The intent review stands after the scenario freeze, before compilation; G5 remains the report review | a red live run must not concern a scenario that nobody independent has read | review of v0.3 | 3, 10.7 |
| D21 | `skew-total` finds the total row itself, by the label from the rules file; the checkpoint has a label layer; `selftest` has a control page with a wrong driver | a control based on the driver's locator confirms the same error twice | review of v0.3 | 9.1, 10.6, 10.8 |
| D22 | A verdict names an observation; routing to repair requires evidence, otherwise `UNDETERMINED` | `CONTROL_MISSED` and `FLAKY` have several possible owners | review of v0.3 | 6.3, 10.6 |
| D23 | `needQty` and rule V8 count the product's state in `cart_after`, not the step argument | two `add` steps add up | review of v0.3 | 8.1, 8.3 |
| D24 | An unnamed pick does not select a product named in the scenario | without this two aliases can hit the same product, depending on the order of declarations | review of v0.3 | 8.1, 8.3 |
| D25 | The harness works from the repo root and from `e2e/`; `e2e/` has its own dependencies | the tester's repo does not have to be a Node project; the command from the readback must work verbatim | review of v0.3 | 6.1, 12.2, 14.3 |

### 17.2 Deviations from the DEP

| Proposal | What was adopted | Reason |
| --- | --- | --- |
| DEP-01, protection of the test file against overwriting | a header with the content hash: an untouched compilation result is overwritten without `--force`, a manual edit gives `FILE_CONFLICT` | recompilation after a scenario change is the ordinary path; a flag required on the ordinary path stops protecting |
| DEP-04, the empty state with a field `hasTotalElement: false` | an optional `total` field in the empty variant | an application that shows zero in an empty cart should be checked, not rejected |
| DEP-06, an attribute filter named after Toolshop (`co2In`) | a generic `where` filter on attributes supplied by the driver; `needQty` is computed by the compiler | the core does not know the application's vocabulary (C2) |
| DEP-07, the action's completion signal is the effect in the DOM | two levels: the driver waits for the application's acknowledgment, the library for the expected cart state | if the driver waited for the result, a lost update would look like a locator failure, not an application bug |
| DEP-07, separate fields for status and failure category | one `verdict` field from the dictionary | two fields can contradict each other |

No deviation weakens the invariants: the model does not write the expected value, the evaluator is not the producer, and an amount mismatch cannot be "fixed" (7.1).

Two elements of DEP-09 did not make it into the first draft of v0.3 and were not recorded as deviations either: the paraphrase with swapped objects and the parallel runs. After the review they are included as A11 and C4, so they are not deviations.

### 17.3 Balance of changes

| Element | v0.2 | v0.3 |
| --- | --- | --- |
| Agents | 4 | 3: without `test-writer` |
| Skills | 11 | 10: without `compose-test` |
| `qa-harness` subcommands | 8 | 9: `compile` added; new flags `example --confirm` and `report --promote` |
| Verdicts | 17 | 25: added `SPEC_INVALID`, `INTENT_OK`, `FILE_CONFLICT`, `INFRA_FAIL`, `PRECONDITION_FAIL`, `NO_TESTS_RUN`, `RETRY_REFUSED`, `UNDETERMINED` |
| Guardrails | R1–R12 | R1–R15; R2, R7, R9 and R11 tightened |
| Intent review | at the end, together with the assessment of the report | after the scenario freeze, before compilation |
| `skew-total` control | changes the element the driver points at | finds the total row itself, by the label |
| Driver interface | `addProduct(pick, qty)`; one shape of `CartView` | `candidates`, `productFacts`, `addProduct(name, qty)`; the empty variant of `CartView`; amounts as `Displayed`, summary rows with a label |
| Pricing rules | functions | data; purchase constraints and field labels added |
| Endings for the tester | 4 | 5; each lists the evidence that exists |
| Evaluation | A1–A7, B1–B7 | A1–A13, B1–B8, C1–C4, `selftest` with a control page |
