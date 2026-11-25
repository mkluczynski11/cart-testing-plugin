# Order G — what the tester reads: confirmation and readback

Project: `cart-testing-plugin` (Claude Code plugin `qa`). Branch `g-polish` starts at `main`, the released
state. The owner ran the plugin as a tester from a fresh clone and wants the two texts the tester reads to
be clearer. Nothing else changes. Read `docs/reports/E.md` (end) and `skills/new-test/` first.

This order lives in the repo as `docs/orders/G.md`. After any context compaction, re-read this file and
`docs/reports/G.md` before doing anything else.

## Rules

- Unattended run. Never ask, never wait for approval: plan at the top of `docs/reports/G.md`, then start.
  Time box 70 minutes; `date -u` at the start of every stage; stage 4 (live run and examples) starts no
  later than minute 40; after 60 minutes write the report and stop.
- Nothing you run may wait for input or run forever. A local server lives only for one check.
- Never: `git push`, `git reset --hard`, `git checkout -- .`, `git clean`, `git stash`, `sudo`, global
  installs, writes under `.git/` or `.claude/`, `claude plugin install`, `claude plugin marketplace add`.
  No `cd` together with `git`: use `git -C <dir>`. No environment-variable prefixes. A refused command is
  not retried in another form. Do not merge into `main`.
- Nested Claude Code sessions as in orders F and E: headless, bounded, `--permission-mode auto
  --output-format json`, in scratch repos outside this worktree, never `--dangerously-skip-permissions`.
  A usage-limit message ends the order: report and stop.
- Live site: at most 8 harness or Playwright invocations, headless, one at a time, only in stage 4.
- Test first for every change of harness behaviour. Manifest regenerated with any change of
  `support/core`. After every stage the checks of order F ("after every stage") stay green.
- English in the repo. Verdicts only from design 6.3. Every number and path in a text shown to the tester
  comes from command output or a file, never from the model.

## 0. Workspace

Started inside `.worktrees/g-polish` on branch `g-polish`. Check the branch; `git add docs/orders/G.md`,
commit; `npm ci` in `templates/e2e`; baseline checks.

## 1. Stage 1 — the confirmation (design 11.1)

What the owner saw, and what it should be:

| Now | Wanted |
| --- | --- |
| With a pricing rule in the shop, the request "check that the cart shows the correct total" got a question: before or after the discount? | "Total" means the row the rules file labels as the total. No question. The confirmation says so under "Plugin's choice". A question is asked only when the request names something else (subtotal, price before discount) or contradicts itself. |
| `A = Product A $10.00 {"co2_rating":"A"}` | `A = Product A, $10.00, co2_rating A` |
| `5% of the running value off when more than 0.5 of the units have co2_rating A or B` | `5% off when more than half of the units have co2_rating A or B` (a share is worded as a fraction in words when it is one half, one third, one quarter; otherwise as a percentage) |
| `Source of each rule: eco-discount: observed (docs/toolshop-facts.md#h1; cart.component.ts @ae7caec), confirmed live.` | `Source: observed on the live site, confirmed.` The reference to a file stays in the rules file; the tester's repo does not have that file. |

The wording of products and rules comes from `qa-harness example`, so change it there; the calibration pair
and the template are in `skills/new-test/intake.md`. Update the level A cases that the new default touches.

## 2. Stage 2 — the readback (design 11.2)

One form for every run, in Markdown, filled only from command output and report files. Today the two
example readbacks differ in form; after this order they do not. The form follows what testers expect of
a test execution record: the verdict first, then the test case (objective, preconditions, environment),
then every step with expected and actual kept apart and a status and evidence per step, then what backs
the verdict, then where the files are and how to run it again. On a red run the failing step and its
evidence come directly under the verdict, before everything else.

```text
## PASS · test verified
| | |
| --- | --- |
| Test | `e2e/tests/<slug>.spec.ts` |
| Objective | the tester's request, verbatim |
| Status | PASS, 3 of 3 repeats · verified |
| Environment | <baseURL> · Chromium · <locale> · <UTC date> · run `<runId>` |
| Preconditions | guest, empty cart, no geolocation |
| Test data | A = <name>, <price>, <attributes> · B = … (read from the product pages in this run) |

### Steps
| # | Shopper's action | Expected total | Actual (as displayed) | Status | Evidence |
| S1 | add <name>, 1 unit | $14.15 | "$14.15" | pass | `e2e/reports/<slug>/screens/S1.png` |
(one row per checkpoint; Actual is the raw text of the page in quotes; where a rule is in force the
Expected cell shows how it is made up, e.g. "$11.57 = $12.18 − eco-discount $0.61")

### Verification of the test
| Check | Result |
| Intent review | … |
| Defects on stub prices | <d> of <n> detected at the right step, <k> not applicable |
| Defects on the prices of this run | … |
| Live run | 3 of 3 repeats passed |
| Live controls | 4 of 4 caught |
| Report review | … |

### Not covered by this scenario
(one line per scenario gap of the live pass, with the step that would close it; "nothing" when none)

### Pricing rules
(one line per rule: wording as in the confirmation, and at which steps of this run it was in force)

### Page driver
`e2e/app/<app>.driver.ts`: where it came from (the plugin's starter pack, built in this flow, repaired in
this flow) and whether this flow changed it; the driver operations this scenario used; the row the total
was read from. One sentence on what the driver is, for a reader who has not met it.

### Files
| File | Content |
| `e2e/tests/<slug>.spec.ts` | the test |
| `e2e/specs/<slug>.md` | the confirmed scenario |
| `e2e/specs/<slug>.intent.md` | the intent review |
| `e2e/reports/<slug>/report.md` | the full report, every defect and control |
| `e2e/reports/<slug>/screens/` | one screenshot per step |
| `e2e/app/<app>.driver.ts`, `.pricing.ts`, `.map.md` | page driver, pricing rules, locator evidence |

### Run it again
`cd e2e && npm run qa -- run <slug>` (three repeats, with the report)
`cd e2e && npx playwright test tests/<slug>.spec.ts` (plain Playwright)
```

Statuses in the Steps table are `pass`, `fail`, and `not run` for the steps after a failure. The readbacks
for a mismatch, for `--dry` and for a stopped flow keep their content and take the same headings where they
apply. Where the harness does not yet print a fact a section needs (the driver's origin, the operations
used, the browser), make `qa-harness report` print it or record it in `run.json`; the model does not work
it out. `report.md` takes the same header table, "Page driver" and "Files" sections.

## 3. Stage 3 — two leftovers

- `templates/e2e/unit/defects-table.spec.ts` uses names of the example shop. The template holds no
  application name (C2): use neutral names, and add the directory `unit/` to the neutrality check.
- `evals/run.mjs`, `transcript()`: record a tool call only the first time it appears (report E, second
  follow-up). A test in `scripts/` with a recorded transcript that has the duplicate.
Then all level A cases once; every case passes or is explained in `docs/eval-log.md`.

## 4. Stage 4 — live run, examples, documents (starts by minute 40)

In one fresh scratch repo outside the worktree, default model: `/qa:setup toolshop
https://practicesoftwaretesting.com`; then the reference request of the README **without `--yes`** in a
first session (it must end at "Confirm?" with no question about the discount), resumed with
`/qa:new-test <slug> --yes`; then the Wood Saw request of the README with `--yes`. Both `VERIFIED`. An
`INFRA_FAIL` is resumed once.
Rebuild `examples/toolshop/` from that repo as before, with `readback.txt` in the new form. Update the
"Result" block of `README.md` to the new form, shortened; keep the README's structure and dry style, at most
250 lines, no HTML comment. Update `docs/reference.md` (readback, confirmation) and design section 18.
Paste the confirmation and both readbacks into the report in full.

## 5. Exit criteria and report

The exit checks of order F, the R15 search, `claude plugin validate .`, `git status --short` clean.
`docs/reports/G.md`: plan; one section per stage; before and after of the confirmation and the readback;
nested sessions and live invocations; what was not done. Commit on `g-polish`, one commit per stage. Do
not merge, do not push.
