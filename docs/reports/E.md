# Report E: defects shown to the tester, README, reference, licence, release state

Order: `docs/orders/E.md`. Branch `e-final` (= `f-fix` at `9b3e5cb`), worktree `.worktrees/e-final`.
Start: `Wed Nov 25 11:21:59 UTC 2026`. Time box 110 min (ends 13:12); README (stage 3) starts by 12:07 at the latest;
reference (stage 4) by 12:32; after 13:02 only the report is written.

## Plan

Contract: `docs/design.md`; hand-over: `docs/reports/F.md`. Every change of behaviour starts with a test that fails for
the reason the order names. Checks after every stage (order F): in `templates/e2e` `npx tsc --noEmit`,
`npm run typecheck:toolshop`, `npm run test:unit`, `npm run qa -- selftest`; in the root `node --test scripts/`,
`node scripts/check-contracts.mjs`, `claude plugin validate .`. Script: `scratchpad/checks.sh`.

| Stage | What | Files | Check |
| --- | --- | --- | --- |
| 0 | branch, README draft present, order committed, `npm ci`, baseline | — | baseline below |
| 1 | defects table in `report.md` (both passes, from `verification.json`); one line before "Confirm?" with the defect count by origin and the report path, from command output | `support/harness/report.ts`, `support/harness/defects.ts` or `cli.ts`, `skills/new-test/SKILL.md`, unit spec, manifest | unit test red then green; level A A4, A7, `--risk` once each |
| 2 | one scratch repo: setup, the two requests of F stage 6 with `--yes`; one plain `npx playwright test` in a clone; rebuild `examples/toolshop/` | `examples/toolshop/` | R15 over `examples/`; `qa:toolshop -- doctor`; both `run --dry` |
| 3 | README verified sentence by sentence, install confirmed by clone + `--plugin-dir`, result block from stage 2, design-note numbers from repo files; `LICENSE`; manifests | `README.md`, `LICENSE`, `.claude-plugin/*.json` | table below; `grep -c '<!--'` 0; ≤ 240 lines |
| 4 | `docs/reference.md` from the code | `docs/reference.md` | options shown parsed; verdicts in `verdicts.ts`; `grep -c '<!--'` 0; contracts |
| 5 | `.gitignore`, ignored tracked files, design 18, clean export checks, R15 over the tree | `.gitignore`, `docs/design.md` | export: `npm ci`, unit, selftest, `validate`; `git status --short` empty |

Choices made up front (recorded here instead of asked):

- The defects table reads the per-defect results already stored in `verification.json` (both passes); if a field the
  table needs (origin, `why`, first red step) is not stored there, it is added to what G2 already writes, not
  recomputed in `report`.
- The line before "Confirm?" is printed by the harness (one command), so the skill quotes it verbatim.
- If the live site fails, stage 2 keeps F's examples and regenerates only their `report.md`.

## Stage 0 — workspace

`date -u`: `Wed Nov 25 11:21:59 UTC 2026`. Branch `e-final`; `README.md` starts with `# cart-testing-plugin` and has
`## Page driver` (line 163 of the draft). Order and plan committed (`10deb27`); `README.md` left uncommitted until
stage 3. `npm ci` in `templates/e2e` → `found 0 vulnerabilities`.

Baseline (before any change):

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npm run typecheck:toolshop` | exit 0 |
| `npm run test:unit` | `188 passed (4.2s)` |
| `npm run qa -- selftest` | `13/13 rows passed in 71.3 s.` `VERDICT: PASS` |
| `node --test scripts/` | 14 pass, 0 fail |
| `node scripts/check-contracts.mjs` | `ok: skills/contracts/driver.md quotes templates/e2e/support/core/types.ts exactly.` |
| `claude plugin validate .` | `✔ Validation passed` (advice: the README has no marketplace install line) |

## Stage 1 — the defects shown to the tester (design 10.2–10.5, 11.1, 11.4)

`date -u`: `Wed Nov 25 11:22:33 UTC 2026`.

What the code had: `verification.json` stored per defect `defect`, `origin`, `operator`, `expected`, `result`,
`firstRed` (and `hint`) for both G2 passes, but not the `why`. `report.md` printed only the counts.

Test first (`templates/e2e/unit/defects-table.spec.ts`, 4 tests), all red before the change:

| Test | Red line |
| --- | --- |
| table with all four results, both passes, a tester and a generated defect | `Expected pattern: /^## Defects$/m` (no such section) |
| G2 records the `why` | `expect(received).toEqual(expected)`: `why` undefined |
| `defects check` line, no file | `Received: "specs/cart-total-add-change-remove.defects.json does not exist or is empty; only the default defects apply."` |
| `defects check` line with a tester entry and `--extended` | `Received string: "specs/cart-total-add-change-remove.defects.json: 1 admitted, 0 rejected."` |

Changes (commit `167c0a5`, manifest regenerated):

- `support/harness/gates.ts`: each G2 row records the defect's `why` (G2 already computed everything else).
- `support/harness/report.ts`: `report.md` gets a section "Defects": one row per defect of the run, columns Defect,
  Origin, What it plants (`why`), Stub prices, First red, Live prices, First red; read from `defects` and
  `livePass.defects` of `verification.json`, nothing computed anew. The readback is unchanged.
- `support/harness/defects.ts`, `cli.ts`: `defects check <slug> [--extended]` prints first "The test will be checked
  against N defects: D default, T tester (ids), G generated; the full list will be in e2e/reports/<slug>/report.md."
  With `--extended` or `"defects": "extended"`: ", plus at most 8 generated defects that qa:defect-designer designs
  after the intent review". The path is relative to the top of the git repository (the harness runs with `cwd` in
  `e2e/`). `defects check` and not `defects list`, because `hooks/matrix.json` gives `defects list` only to
  `defect-designer`.
- `skills/new-test/SKILL.md`, `intake.md`: step 3 writes the `--risk` entry and runs `defects check` before the
  confirmation; the template quotes its first line verbatim before "Confirm?". The generated defects are designed in
  step 3b (after the intent review, as design 10.4 and `design-defects` require), so the line names them as still to
  come; the numbers come from `defects check`.
- `evals/cases.mjs`, `evals/run.mjs`: A4, A7, R1 check that the line printed by `defects check` appears in the main
  thread's text; the runner now keeps that text.

After the change: `4 passed`; `npm run test:unit` `192 passed`.

Level A cases A4, A7 and R1 (the `--risk` case): **FAIL** on the new check, every other check passed. The harness
printed the line in every session; no session showed the confirmation at all under `--yes` (they ran
`example --confirm` right after `defects check`, with no text). I changed the skill text three times (step 3: "write
the filled template as a message of its own"; "Output" named the confirmation, it had said "the readback … Nothing
else"; step 3: "the text of the message that calls `example --confirm` is the filled template") and reran: same result
4 of 4 rounds (`docs/eval-log.md` rows 39–50; the order asks for one run each, so rounds 2–4 exceed it). Commit
`68e0fdb` keeps the last wording. The same behaviour existed before this order: no earlier check looked for the
confirmation under `--yes` (F's rows 25–38 do not).

Without `--yes` the confirmation is the turn's last message and carries the line. Nested session L4 (default model,
`/qa:new-test "<request of order F step 2>" --dry --risk "the total does not refresh after the quantity of a product
is decreased"`, no `--yes`) ended with the confirmation; its last two lines:

```text
The test will be checked against 14 defects: 13 default, 1 tester (total-stale-after-decrease), 0 generated; the full list will be in e2e/reports/two-products-decrease-remove/report.md.
Confirm? (ok / correction)
```

Left to the owner: whether `--yes` should show the confirmation in a headless run, and if so how to enforce it (the
model does not follow the text); see "Unverified and left to the owner".

## Stage 2 — the examples in the new format

`date -u`: `Wed Nov 25 11:26:22 UTC 2026`.

One fresh scratch repo `shop` in the session's scratch directory (outside the worktree), `git init`. Sessions as order
F ran them (`claude -p "<prompt>" --plugin-dir <worktree> --permission-mode auto --max-turns <n> --output-format json`),
default model (opus). Commits in the scratch repo: `f2a15ba` (setup), `6be3048`, `c640abf` (each verified test).

| # | Step | Outcome |
| --- | --- | --- |
| L1 | `/qa:setup toolshop https://practicesoftwaretesting.com` | `VERDICT: PASS`; `e2e/` with 84 template files, starter pack 3 files, selftest passed |
| L2 | `/qa:new-test "Add two different products to the cart. Change the quantity of one, then remove the other. Check that the cart shows the correct total after each change." --yes` | **`VERIFIED`** on the first run: `two-products-change-remove`; run `20261125T112904Z-a953` `PASS` 3/3; `verify` G4 4/4 caught; `review.md` `VERIFIED`; promoted. Combination Pliers $14.15 · Pliers $12.01; S1 $14.15, S2 $26.16, S3 $54.46, S4 $42.45; defects 12/12 on stub prices, 9/9 on the live prices; four gaps of the live pass |
| L3 | `/qa:new-test "Add a Wood Saw, then two units of the first available product. Raise the saw to three units, then remove the other product. Check the total after each change." --yes` | **`VERIFIED`** on the first run: `wood-saw-raise-remove-other`; run `20261125T113230Z-bb76` `PASS` 3/3; G4 4/4; Wood Saw $12.18 (co2 B) · Combination Pliers $14.15 (co2 D); S1 $11.57, S2 $40.48, S3 $61.60, S4 $34.71; eco-discount in force at S1, S3, S4; defects 11/11 on stub prices, 12/12 on the live prices |

No `INFRA_FAIL`, so no resume. The slugs differ from F's (the model chooses them).

Clone without Claude Code: `git clone` of the scratch repo, `npm ci` in `e2e/` (`added 16 packages`), then in `e2e/`
`npx playwright test tests/two-products-change-remove.spec.ts`, which printed exactly:

```text
Running 2 tests using 1 worker

  ✓  1 [dry] › tests/two-products-change-remove.spec.ts:9:1 › The cart total is correct after adding two products, changing the quantity of one and removing the other (97ms)
  ✓  2 [live] › tests/two-products-change-remove.spec.ts:9:1 › The cart total is correct after adding two products, changing the quantity of one and removing the other (5.6s)

  2 passed (6.2s)
```

Exit 0. The plain command works on its own: it runs the test once in project `dry` (the reference cart on the
example's stub prices, `support/core/fixtures.ts` `drySetup`) and once in project `live` (the application), with the
`list` reporter; no gates, no `run.json`, no report.

`examples/toolshop/` rebuilt from the scratch repo at `c640abf` (commit `dbf8254`): F's specs, tests and reports of
`two-products-qty-remove` and `wood-saw-qty-remove-other` removed; `specs/<slug>.{md,example.json,intent.md}`,
`tests/<slug>.spec.ts`, `reports/<slug>/{report.md,run.json,verification.json,review.md,screens/S1–S4.png}` and
`readback.txt` (the final answer of L2 and L3) for both new slugs. `app/` is byte-identical to the scratch repo's;
`qa.config.json` has the same values (only its formatting differs), so it was kept.

Checks: R15 search (`/Users/`, `/private/`, the home folder name, the GitHub handle, cookie, authorization, bearer,
x-api-key, token) over `examples/`: no hit. `npm run qa:toolshop -- doctor` → `VERDICT: PASS` (with the note that no
TypeScript compiler is installed for that root). `run two-products-change-remove --dry` → G2 13: 12/0/0/1, `PASS`;
`run wood-saw-raise-remove-other --dry` → `PASS`.

## Stage 3 — README

`date -u`: README edits started `11:30:35 UTC` (minute 9, while L2 ran); README, `LICENSE` and manifests committed at
`11:37:45` (`ba76030`).

### Install

`git clone` of this worktree (at `ba76030`) into the scratch directory, a fresh `git init` repo `my-shop-tests`, then
one headless session I1 in it: `claude -p "/qa:setup toolshop https://practicesoftwaretesting.com" --plugin-dir
<scratch>/install/cart-testing-plugin --permission-mode auto --output-format json`. Answer: "The harness setup finished
with **`VERDICT: PASS`**", `e2e/` with 84 files, starter pack 3 files in `e2e/app/`, selftest 13/13. The two README
lines work as written. The marketplace is not mentioned.

### Sentences

Source names a file and section, or a command output of this session. "Kept" means true as written.

| Sentence (abridged) | Source | Kept or corrected |
| --- | --- | --- |
| cart-testing-plugin is a Claude Code plugin for QA engineers. | `.claude-plugin/plugin.json` | kept |
| It turns a shopping-cart scenario … and verifies that test before handing it over. | `skills/new-test/SKILL.md` steps 1–9 | kept |
| Its commands start with `/qa:`. | `claude plugin validate .` lists `qa:setup`, `qa:new-test`, … | kept |
| The tests run in a browser against a running web shop, local or remote. | `support/core/fixtures.ts` `openLive` (Chromium, `baseURL`) | kept (local not run, see Limits) |
| The address is given once, in `/qa:setup`. | `scripts/init.mjs` writes `baseURL` | kept |
| Assumption: each shop needs a page driver, one file … | `support/harness/doctor.ts` (`app/<app>.driver.ts`), design 8.3 | kept |
| The plugin includes the driver for the Toolshop demo shop … and is verified on it. | `init.mjs` starter pack from `examples/toolshop/app`; L2, L3 `VERIFIED` | kept |
| For another shop the driver has to be built first. See Limits. | new-test step 6 | kept |
| The test, its scenario and its run report live in `e2e/`. | `support/core/config.ts` `files` | kept |
| They work without the plugin and without Claude Code. | stage 2 clone (`npx playwright test`); F stage 6 step 5 | kept |
| Requires Claude Code, Node.js 20 or newer, and git. | `bin/qa-harness` doctor before setup; `package.json` `engines` | kept |
| `git clone https://github.com/mkluczynski11/cart-testing-plugin` | order E; clone of this worktree, I1 | kept |
| Start Claude Code in the repository … loaded from the clone: `claude --plugin-dir …` | I1 `VERDICT: PASS` | kept |
| Run once per repository: `/qa:setup toolshop …` | `skills/setup/SKILL.md` "Once per repo"; L1 | kept |
| Create a test: `/qa:new-test "<request of F step 2>"` | L2 | kept |
| Another scenario is another sentence. The page driver is reused. | L3; `app/` unchanged | kept |
| Command table, 5 rows | `argument-hint`s; `init.mjs` (`npm ci`, `playwright install chromium`, `selftest`); new-test "Resuming"; verify and triage descriptions | kept |
| Option table, 4 rows | new-test "Input" | kept |
| Creation 1: mapped to a scenario …; one question; a refusal. | new-test step 1, `intake.md` | kept |
| Creation 2: Code validates the scenario and computes example totals on stub prices. | `support/harness/example.ts` | kept |
| Creation 3: The tester sees … and confirms or corrects. The confirmed scenario is frozen by its hash. | new-test step 3; `example --confirm` records `scenarioSha256` | kept |
| Creation 4: Code compiles …; the model writes no test code and no amounts; same scenario, same file. | `compile.ts`; new-test intro; design 6 ("identical byte for byte"); `unit/compiler.spec.ts` golden | kept |
| Creation 5: If the page driver lacks an action … an agent … adds it. | new-test step 6; `map-app-flow` | kept |
| Expected totals are computed at run time from the unit prices read on the product pages … | `support/core/shopper.ts` ledger; compiled `test.use({ priceSource: 'ui' })` | kept |
| They are never read from the cart. | design 9; checkpoint compares displayed with expected | kept |
| Verification 1: Intent review before compilation by a separate agent. | new-test step 3a before step 4 | kept |
| Verification 2: G0 rejects fixed waits, skipped tests and amount literals. | `support/harness/lint.ts`; contracts | kept |
| Verification 3: G1 must reproduce the confirmed example. | `gates.ts` `gateG1` | kept |
| Verification 4: "must go red at the first step where the defect shows" | `gates.ts` `expectedPlace` returns a checkpoint | corrected: "first checkpoint" |
| The check is repeated on the prices of the live run. | `run.ts` `livePass` | kept |
| Verification 5: runs three times | `config.ts` `repeat` 3 | kept |
| "Each step compares the cart lines, …" | checkpoint layers; with `check: last-step` not every step is checked | corrected: "Each checkpoint compares" |
| Verification 6: four faults | `support/core/live-controls.ts` `CONTROLS` | kept |
| Verification 7: G5 by a separate agent, `VERIFIED` | `agents/test-verifier.md`, `run-verification` | kept |
| Verification 8: "Only the report of a run that passed steps 2 to 6 is written …" | `report.ts` `promotionRefusal`; `--as-evidence` admits a live mismatch | corrected: the `--as-evidence` exception added |
| A defect that cannot show … does not fail it; listed as a scenario gap with the step that would close it. | `gateG2` (not-applicable not counted); `operators.ts` `gapHint` | kept |
| `--dry` stops after step 4. Such a test is not verified. | new-test step 5 | kept |
| Derived by code from the scenario's steps and the shop's pricing rules. No model call. | `operators.ts` `deriveDefects` | kept |
| Built-in defect table, 10 rows | `deriveDefects` ids and `why`s | kept |
| "A new pricing rule … gets its four rule defects" | `deriveDefects`: `rule-wrong-rate` only with a rate, `rule-boundary` only with a threshold | corrected |
| The switch is `"defects"` …; set by `/qa:setup … --defects`; overridden by `--defects extended`. | `config.ts`; `init.mjs` `known`; new-test 3b | kept |
| Mode table (8 defects before compilation; one agent call) | `defects.ts` `ADDITIONAL_LIMIT`; step 3b before step 4 | kept |
| In both modes `--risk` adds one defect described by the tester. | new-test step 3 | kept |
| Generated and tester defects are data …; rejected when …; reused, no model. | `defects.ts` `admitAdditional`; `run.ts` reads the file | kept |
| Result block | L2 answer = `examples/toolshop/reports/two-products-change-remove/readback.txt` | replaced (the lines are identical to the draft's) |
| The answer continues with the evidence, the scope, the gaps, the rules and the rerun command. | `skills/new-test/readback.md` | kept |
| The full answers … are in `examples/toolshop/reports/<slug>/readback.txt`. | stage 2 | kept |
| "… and a screenshot of every step." | `report.ts` `TRACKED`, `screens/` (one per checkpoint) | corrected: "every checkpoint"; added: `report.md` lists every defect (stage 1) |
| Verdict rows `ORACLE_MISMATCH`, `UNMODELED_ADJUSTMENT`, `PRECONDITION_FAIL` | `skills/new-test/routing.md` | kept |
| `INFRA_FAIL`: "The site did not answer." | `routing.md`: browser, network, 5xx, missing binaries | corrected |
| "No agent can change an expected amount to make a test pass." | `hooks/matrix.json` does not deny `app/*.pricing.ts` or `tests/` to the main thread; amounts come from the rules file, whose hash is confirmed (`run` → `SCENARIO_CHANGED`); G0 rejects amount literals | corrected to what the code enforces |
| `cd e2e`, `npm run qa -- run <slug>`, `npm run qa -- verify <slug>` | F stage 6 step 5 | kept |
| `run` executes the test three times. `verify` runs steps 2 to 6. Both exit 0 only on `PASS`. No Claude Code or API key. | `repeat`; `verify.ts` G0–G4; `cli.ts` `POSITIVE`; F stage 6 step 5 | kept |
| (new) `npx playwright test tests/<slug>.spec.ts` also works … | stage 2 clone output | added |
| In a pipeline: `npm ci`, `npx playwright install chromium`, then `npm run qa -- run <slug>` | `init.mjs` runs the same steps; not run in a CI | kept |
| The page driver is `e2e/app/<app>.driver.ts`. It is the only file with locators. | `config.ts` `files.driver`; G0 forbids `page` in a test | kept |
| It lists products, reads a product's price and attributes, … reads the cart. | `support/core/types.ts` `CartDriver` | kept |
| Next to it are `<app>.pricing.ts` … and `<app>.map.md` … | contracts; `driver.md` "Map" | kept |
| Step 1: "Setup reports that the plugin has no driver for this shop." | `init.mjs` prints "The plugin has no starter pack for …" | corrected; added: the tester writes `<app>.pricing.ts` (no command creates it; `doctor` prints `LINT_FAIL: The rules file cannot be used: … does not exist; write the app's rules file first`) |
| Step 2: "After the dry steps, `qa-harness need <slug>` lists the actions the driver lacks." | new-test step 6 after step 5 | corrected: "After verification steps 2 to 4" (the README's own terms) |
| Step 3: app-mapper opens the live page, performs each action, chooses a locator (test attribute, role, label), writes driver and map. | `map-app-flow` steps 2, 3, 8 | kept |
| Step 4: `qa-harness doctor` checks the driver against the interface and the UI boundary. | `doctor.ts`; `map-app-flow` step 9 | kept |
| Step 5: The flow continues with the live run. | new-test step 7 | kept |
| A driver can also be written by hand against the interface in `docs/reference.md`; `need` and `doctor` report what is missing. | `docs/reference.md` "Page driver"; `need.ts`, `doctor.ts` | kept |
| `/qa:triage <slug>` repairs the locator the same way. | `skills/triage/SKILL.md`; F stage 6 L4 | kept |
| The first design … showed the tester two amounts; its only check … a one-cent shift. | no file in this repo describes the design before v0.2 (design 17 compares v0.2 and v0.3) | kept; not verifiable here, left to the owner |
| Decision: the plugin verifies the test …; must fail on each. | design 10 | kept |
| Who writes the defects? … the result changes between runs. … repeatable and uses no tokens. | `deriveDefects`; A7 added 6, 4, 5 and 4 defects in four runs (`docs/eval-log.md` rows 41, 44, 47, 50) | kept |
| What about features the default list does not know? … The mode is a switch … | design 10.4; `defects.ts` | kept |
| Observation 1: 12 of 13 on stub prices, 9 of 13 on live prices | `examples/toolshop/reports/two-products-change-remove/verification.json` (`defects` 12 applicable of 13, `livePass.defects` 9 of 13) | kept |
| Observation 2: the total always equalled the subtotal; only `skew-total` proved the driver reads the total; Wood Saw: differ at three of four steps | `…/two-products-change-remove/report.md` "Scope"; `…/wood-saw-raise-remove-other/report.md` "Scope" ("At S1, S3, S4 it differed") | kept |
| Observation 3: 6 added, 18 of 19 detected, 1 could not show, dry | `docs/eval-log.md` row 23 (and row 41: 19/18/0/0/1) | kept |
| Guest cart only. No login, coupons or checkout. | `intake.md` "Scope" | kept |
| Verified means … reads the row labelled "Total". | the total row is `summary.total.label` of the rules file | corrected |
| Another shop needs its own page driver … (local shop) … (Toolshop). A whole driver was not exercised. | `docs/reports/D.md` session b on the control application; F stage 6 L4 | kept |
| "All runs used the public Toolshop instance." | contradicts "exercised on a local shop" one line above | corrected: "All Toolshop runs used the public instance." |
| Extended mode and `--risk` were exercised in dry runs only. | eval A7, R1 | kept |
| Amounts in USD and EUR. | `types.ts` `CurrencyCode` | kept |
| More (3 lines); License: MIT | `examples/toolshop/`, `docs/reference.md`, `docs/design.md`; `LICENSE` | kept |

`README.md`: 240 lines; `grep -c '<!--' README.md` → `0`; no section added, none renamed or moved.

`LICENSE`: MIT, `Copyright (c) 2026 mkluczynski11`. `.claude-plugin/plugin.json`: `author.name` `mkluczynski11`,
`"repository"`, `"license": "MIT"`. `.claude-plugin/marketplace.json`: `owner.name` `mkluczynski11`; the plugin entry
gets `author`, `repository`, `license`. `claude plugin validate .` accepts both (`✔ Validation passed`).

## Stage 4 — `docs/reference.md`

`date -u`: drafted from `11:31` while L3 ran; checks at `Wed Nov 25 11:39:23 UTC 2026`; committed `41fb026`.

449 lines, twelve sections in the order of the order. Two statements were corrected against the code while checking:
`compile` refuses a changed scenario with `SPEC_INVALID` (not `SCENARIO_CHANGED`), and `selftest` ends `INFRA_FAIL`
when a row fails.

Options of sections 1 and 2 and the line that parses each:

| Option | Parsed at |
| --- | --- |
| `--root` | `support/harness/cli.ts:52` `const rootArg = take('--root');` |
| `--help` | `cli.ts:55` `if (has('--help') …` |
| `--promote` | `cli.ts:56` `const promote = take('--promote');` |
| `--repair` | `cli.ts:57` `const repair = take('--repair');` (values checked at the `run` case) |
| `--confirm` | `cli.ts:58` |
| `--force` | `cli.ts:59` |
| `--dry` | `cli.ts:60` |
| `--write-manifest` | `cli.ts:61` |
| `--as-evidence` | `cli.ts:62` |
| `--extended` | `cli.ts:63` |
| `init --app`, `--base-url`, `--test-id-attribute`, `--locale`, `--currency`, `--defects` | `scripts/init.mjs:38` `const known = { '--app': 'app', '--base-url': 'baseURL', … '--defects': 'defects' };` |
| `/qa:setup` flags | `skills/setup/SKILL.md:23` "passed through unchanged" to `init` |
| `/qa:new-test` `--yes`, `--dry`, `--defects extended`, `--risk`, `<slug>` | `skills/new-test/SKILL.md:26–28` ("Input"); read by the model, not by code |

Verdicts: the 25 rows of section 10 equal the 25 names in `support/core/verdicts.ts` (a script compared both sets:
none missing either way). `grep -c '<!--' docs/reference.md` → `0`. `node scripts/check-contracts.mjs` → `ok:
skills/contracts/driver.md quotes templates/e2e/support/core/types.ts exactly.`

What the document could not state, because the code does not settle it:

- `browserDriver` (`mcp` | `cli`): no code on this branch reads it.
- `priceSource` in `qa.config.json` is only recorded in `run.json`; a test uses its scenario's `price_source`. When
  the library calls `apiPrice` with `api` was not traced.
- `run --repair test`: accepted and counted by `attempts.ts`, but no skill or agent issues it; who repairs a test,
  and how, is not written down.
- `setAttribute` is in the interface as an extension point; no step kind uses it.
- A new shop without a driver: `doctor` ends `LINT_FAIL`, and new-test step 0 says only "if setup has not run, stop";
  whether the flow goes on is left to the model.
- A missing rules file: `example` and `need` end "The harness failed unexpectedly … `INFRA_FAIL`" instead of a
  condition with its own verdict (seen on a scratch root; `doctor` reports it as `LINT_FAIL`).
- The main thread has no turn limit of its own.

## Stage 5 — release state

`date -u`: `Wed Nov 25 11:39:44 UTC 2026`.

- `.gitignore`: `.playwright-mcp/`, `.worktrees/` and `node_modules/` appeared three times each; now every line once
  (`sort | uniq -d` empty for all three `.gitignore` files). `git ls-files -i --exclude-standard -c`: empty.
- `docs/design.md` 18: header names order E; two rows: "Defects in `report.md`" and "Defects line of the
  confirmation" (commit `81c2aae`).
- Clean export: `git archive HEAD` (`81c2aae`) into `<scratch>/export`; there `npm ci` (`added 16 packages`),
  `npm run test:unit` → `192 passed (4.6s)`, `npm run qa -- selftest` → `13/13 rows passed in 70.9 s.` `VERDICT: PASS`
  (in `templates/e2e`); `claude plugin validate .` in its root → `✔ Validation passed`. Directory checks of
  `validate`: one warning, `ICON_MISSING` (no icon); advice: the README has no marketplace install line (by order);
  "Hosts not declared: list what these parts reach under `network.hosts`"; no finding about README content or
  `LICENSE`.
- R15 over the whole tree (`git grep -I -i` for `/Users/`, the home folder name, `/private/tmp`, cookie,
  authorization, bearer, x-api-key, token): hits only in prose (orders, reports, the design, "tokens" in the README),
  in code that checks for cookies (`fixtures.ts`, guest precondition) or sets the control application's own session
  cookie (`control-app/server.ts`), and in a test name ("Unexpected token"). No recorded value. The GitHub handle
  appears only where this order puts it (`LICENSE`, manifests, the README clone line).

## Unverified and left to the owner

- A run against a local instance of a shop: not tried (all live runs used the public Toolshop).
- The marketplace install (`claude plugin marketplace add`, `/plugin install qa --marketplace …`): never run, not in
  the README. `validate` advises an install line; it was left out by order.
- `--yes` and the confirmation: in 12 of 12 eval sessions (sonnet) and in L2, L3 (opus) the confirmation was not shown
  under `--yes`, so the defects line was not shown either; without `--yes` it is (L4). The eval checks of A4, A7, R1
  stay red until this is decided.
- Building a whole driver for a new shop: not exercised. A new shop also needs a rules file written by the tester;
  with none, `example` ends "The harness failed unexpectedly … `INFRA_FAIL`" (a misclassified condition).
- The design before v0.2 (README "Design note", first paragraph): no file in the repo records it.
- `validate` directory checks: `ICON_MISSING`; `network.hosts` not declared in `plugin.json`.
- The items under "What the document could not state" (stage 4).
- The CI line of the README ("In a pipeline: …") was not run in a CI.

## Nested sessions

All headless, `--permission-mode auto`, `--output-format json`, never `--dangerously-skip-permissions`, in scratch
repos outside the worktree. No session ended with a usage-limit message.

| # | Purpose | Model | Turns | Duration | Cost |
| --- | --- | --- | --- | --- | --- |
| E39–E50 | level A cases A4, A7, R1, four rounds (`evals/run.mjs --jobs 3`) | sonnet (+ agents) | 4–18 | 42–77 s | $3.71 in all |
| L1 | `/qa:setup toolshop https://practicesoftwaretesting.com` | default (opus) | 3 | 87 s | $0.23 |
| L2 | `/qa:new-test "<request of F step 2>" --yes` → `VERIFIED` | default (opus) + test-verifier | 18 | 179 s | $0.94 |
| L3 | `/qa:new-test "<request of F step 3>" --yes` → `VERIFIED` | default (opus) + test-verifier | 18 | 187 s | $0.94 |
| L4 | `/qa:new-test "<request of F step 2>" --dry --risk "…"`, no `--yes` → the confirmation | default (opus) | 8 | 31 s | $0.41 |
| I1 | `/qa:setup toolshop …` with `--plugin-dir` on a clone of this worktree (install check) | default (opus) | 3 | 86 s | $0.23 |

Total: 17 sessions, about $6.46.

## Live invocations

Against https://practicesoftwaretesting.com, headless, one at a time, all in stage 2: **5 of 8**.

| # | UTC | Invocation | Result |
| --- | --- | --- | --- |
| 1 | 11:29:04 | L2 `qa-harness run two-products-change-remove` | `PASS` 3/3 |
| 2 | 11:29:33 | L2 `qa-harness verify two-products-change-remove` (test-verifier), run `20261125T112933Z-b685`, promoted | `PASS`, G4 4/4 |
| 3 | 11:32:29 | L3 `qa-harness run wood-saw-raise-remove-other` | `PASS` 3/3 |
| 4 | 11:32:57 | L3 `qa-harness verify wood-saw-raise-remove-other` (test-verifier), run `20261125T113257Z-498e`, promoted | `PASS`, G4 4/4 |
| 5 | 11:35:06 | clone: `npx playwright test tests/two-products-change-remove.spec.ts` | 2 passed (dry, live) |

The dry runs (`run --dry`, selftest, the evals, L4, I1) use no browser on the live site; `doctor` before setup
contacts only the npm registry.

## Exit checks

Full set of order F ("after every stage") at baseline, after the stage 3 commit `ba76030` (covering stages 1–3) and
after the stage 5 commit `81c2aae` (covering stages 4–5); at the stage 1 commit `tsc` and `test:unit` ran. Last line
of every check on `81c2aae`:

| Check | Last line |
| --- | --- |
| `npx tsc --noEmit` | exit 0, no output |
| `npm run typecheck:toolshop` | exit 0, no output |
| `npm run test:unit` | `192 passed (3.8s)` |
| `npm run qa -- selftest` | `VERDICT: PASS` (`13/13 rows passed in 70.5 s.`) |
| `node --test scripts/` | `ℹ fail 0` (14 tests) |
| `node scripts/check-contracts.mjs` | `ok: skills/contracts/driver.md quotes templates/e2e/support/core/types.ts exactly.` |
| `claude plugin validate .` | `✔ Validation passed` |
| `npm run qa:toolshop -- doctor` | `VERDICT: PASS` |
| `run two-products-change-remove --dry`, `run wood-saw-raise-remove-other --dry` (examples) | `VERDICT: PASS`, `VERDICT: PASS` |
| export: `npm ci`, `test:unit`, `selftest`, `validate` | `added 16 packages`, `192 passed (4.6s)`, `VERDICT: PASS`, `✔ Validation passed` |
| `grep -c '<!--' README.md`, `docs/reference.md` | `0`, `0` |
| `wc -l README.md`, `docs/reference.md` | `240`, `449` |
| `git ls-files -i --exclude-standard -c` | (no output) |
| R15 `git grep` | no recorded value (stage 5) |
| `git status --short` after the last commit | (no output) |

## Measurements

| Stage | From (UTC) | To | Minutes |
| --- | --- | --- | --- |
| 0 workspace, baseline | 11:21:59 | 11:22:33 | 1 |
| 1 defects table and confirmation line (evals to 11:36) | 11:22:33 | 11:36:46 | 14 |
| 2 live runs and examples | 11:26:22 | 11:35:48 | 9 |
| 3 README, licence, manifests, install check | 11:30:35 | 11:39:30 | 9 |
| 4 reference | 11:31 | 11:39:30 | 8 |
| 5 release state | 11:39:44 | 11:42 | 2 |
| report | 11:42 | 11:45 | 3 |

Stages overlapped while nested sessions ran. Ended about `11:45 UTC`, minute 23 of the 110-minute box; no stage was
cut.

## Follow-up

`date -u`: `Wed Nov 25 11:50:16 UTC 2026` to `11:54`. Three changes, same rules; no push, no merge.

| # | Change | Commit | Check |
| --- | --- | --- | --- |
| 1 | `--yes` row in `README.md` and `docs/reference.md`: "Do not wait for the confirmation."; "on this branch" removed twice from `docs/reference.md` | `801a577` | `grep -c 'on this branch' docs/reference.md` → `0`; README 240 lines, reference 449 |
| 2 | defects-line check out of A4, A7, R1; new case R2 without `--yes`: the answer ends at "Confirm? (ok / correction)", the line before it is the first line `qa-harness defects check` printed, the scenario stays a draft. `evals/run.mjs` back to its state before order E | `f8e6e30` | one run, `docs/eval-log.md` rows 51–54 |
| 3 | `qa-harness example <slug>` with no rules file: `app/<app>.pricing.ts does not exist; write the app's rules file first (design 9.2).` `VERDICT: SPEC_INVALID` (was "The harness failed unexpectedly … `INFRA_FAIL`" with the absolute path). `need` and the other subcommands that load the scenario end the same way; `doctor` still reports it as `LINT_FAIL`. Reference rows of `need`, `run` and "Creating a driver" step 1, and the design 18 row "Conditions that are not harness bugs", name it | `684c284` | test first: `unit/conditions.spec.ts` "example with no rules file …", red `"verdict": "plain error"`, `"absolute": true`; then green; manifest regenerated |

Eval run (sonnet, once each): R2 `PASS` 3/3, R1 `PASS`, A7 `PASS`, A4 `FAIL` on two checks ("intent review current",
"the test comes from qa-harness compile"). The A4 session's own `qa-harness intent` and `qa-harness compile` ended
`VERDICT: PASS`. The transcript logs every tool call a second time after its result (A4: lines 112/113/115 for
`intent`, 122/123/125 for `compile`), and `evals/run.mjs` `transcript()` replaces the entry on the second
`tool_use`, losing the result. Regraded from the same transcript with a reader that keeps the first entry (a scratch
script, nothing committed): 6 of 6 ok. Not fixed, as it is outside the three changes. The fix is one condition in
`transcript()`: `if (part.type === 'tool_use' && !calls.has(part.id))`. Any check that reads a call's result can be
hit by it; rows 25–50 may be affected the same way.

Exit checks on `684c284` (plus the eval files of `f8e6e30`), last lines: `tsc` exit 0; `typecheck:toolshop` exit 0;
`test:unit` `193 passed (4.0s)`; `selftest` `VERDICT: PASS` (13/13); `node --test scripts/` `ℹ fail 0`;
`check-contracts` `ok: …`; `claude plugin validate .` `✔ Validation passed`; `qa:toolshop -- doctor` `VERDICT: PASS`;
both examples `run --dry` `VERDICT: PASS`; `grep -c '<!--'` README and reference `0`.

Of "Unverified and left to the owner": the `--yes` item is settled by change 1 and R2; the missing rules file is now
a condition with its own verdict.

Nested sessions: 4 (the eval run), $1.17. Live invocations: none.
