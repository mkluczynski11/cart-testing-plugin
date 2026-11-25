# Order E — final session: defects shown to the tester, README, reference, licence, release state

Project: `cart-testing-plugin` (Claude Code plugin `qa`). Branch `e-final` is `f-fix`: the harness, the
plugin, the fixes of order F and the examples from a real plugin run. This session makes the repository
ready to submit. Read `docs/reports/F.md` (hand-over, known limits) first. The contract is `docs/design.md`.

This order lives in the repo as `docs/orders/E.md`. After any context compaction, re-read this file and
`docs/reports/E.md` before doing anything else.

## Rules

- Unattended run. Never ask, never wait for approval: plan at the top of `docs/reports/E.md`, then start.
  Time box 110 minutes; `date -u` at the start of every stage; after 100 minutes write the report and stop.
- Stage 3 (README) is the one result this order must not miss: it starts no later than minute 45.
  Stage 4 (reference) starts no later than minute 70.
- Nothing you run may wait for input or run forever (`--ui`, `--debug`, `--headed`,
  `playwright show-report` are out; `git commit` with `-m`). A local server lives only for one check.
- Never: `git push`, `git reset --hard`, `git checkout -- .`, `git clean`, `git stash`, `sudo`, global
  installs, writes under `.git/` or `.claude/`, `claude plugin install`, `claude plugin marketplace add`.
  No `cd` together with `git`: use `git -C <dir>`. No environment-variable prefixes. A refused command is
  not retried in another form. Do not merge into `main`: the owner does that.
- Nested Claude Code sessions as in order F: headless, bounded, `--permission-mode auto --output-format
  json`, in scratch repos outside this worktree, never `--dangerously-skip-permissions`. Log each one. A
  usage-limit message ends the order: report and stop.
- Live site: at most 8 harness or Playwright invocations, headless, one at a time, only in stage 2.
- Test first for every change of behaviour, as in order F. Manifest regenerated with any change of
  `support/core`. After every stage the checks of order F ("after every stage") stay green.
- English in the repo. No new vocabulary; verdicts only from design 6.3. The plugin keeps the name `qa`.

## 0. Workspace

Started inside `.worktrees/e-final` on branch `e-final`. Check the branch and that `README.md` in the
worktree root starts with `# cart-testing-plugin` and has a section `## Page driver` (the owner's draft);
otherwise stop and report. `git add docs/orders/E.md`, commit (leave `README.md` uncommitted until stage
3). `npm ci` in `templates/e2e`, baseline checks.

## 1. Stage 1 — the defects are shown to the tester (design 10.2–10.5, 11.1, 11.4)

The tester must see which defects verify the test, not only how many.

- `report.md` gets a table of every defect of the run: id, origin (`default`, `tester`, `generated`), what
  it plants in one sentence (the `why` of the defect), the result (`detected`, `detected-late`, `missed`,
  `not-applicable`) and the step of the first red checkpoint, for the pass on stub prices and for the
  pass on the prices of the live run. Data comes from `verification.json`; nothing is computed anew.
- The confirmation of `new-test` (design 11.1) gets one line before "Confirm?": the number of defects the
  test will be checked against, by origin, and where the full list will be (`e2e/reports/<slug>/report.md`).
  With `--defects extended` or `--risk` the added defects are named in that line. The numbers come from
  command output (`qa-harness defects list` or the dry gates), never from the model.
- The readback keeps its form.
- Check: a unit test for the table (all four results, both passes, a tester and a generated defect);
  level A cases A4, A7 and the `--risk` case once each.

## 2. Stage 2 — the examples in the new format

In one fresh scratch repo outside the worktree, on the default model: `/qa:setup toolshop
https://practicesoftwaretesting.com`, then the two requests of order F, stage 6 (steps 2 and 3), each
`--yes` → `VERIFIED`. An `INFRA_FAIL` is resumed once with `/qa:new-test <slug> --yes`. Then, in a clone
without Claude Code, in `e2e/`: `npx playwright test tests/<slug>.spec.ts` for one slug, to learn whether
the plain Playwright command works on its own; record exactly what it prints.
Rebuild `examples/toolshop/` (`specs/`, `tests/`, `reports/<slug>/` with `readback.txt`) from that repo as
order F did. If the live site cannot be used, keep F's examples and regenerate only their `report.md`
from their own `run.json` and `verification.json`, and say so.
Check: R15 search over `examples/`; `npm run qa:toolshop -- doctor` `PASS`; both examples `run --dry` `PASS`.

## 3. Stage 3 — README (starts by minute 45)

`README.md` in the worktree root is the owner's draft. Its structure, section names, order and dry style
are decided: do not restructure it, do not add sections, do not add adjectives. Your work:

1. **Verify every sentence** against the code and `docs/design.md`. For each sentence that states what the
   plugin does, find the place that makes it true (file, design section, or a command output of this
   session). Correct a sentence that is not true as written; do not soften a true one. Put the table
   sentence · source · kept or corrected into the report.
2. **Install.** The README installs by `git clone` and `claude --plugin-dir <path>`, the way every session
   of this project loaded the plugin. Do not mention the marketplace: that path was never run. Confirm the
   two lines by doing exactly that: `git clone` of this worktree into a scratch directory, then one
   headless session started with `--plugin-dir` on that clone that runs `/qa:setup` in a fresh repo.
3. Replace the result block with the shortened answer of the reference run of stage 2, and take every
   number in "Design note" from files in this repo (`docs/reports/V.md`, `docs/eval-log.md`,
   `examples/toolshop/reports/`); name the file next to each number in the report, not in the README.
4. Mention in "Result" that `report.md` lists every defect with its outcome, once stage 1 makes it true.
   In "Running tests", state whether plain `npx playwright test tests/<slug>.spec.ts` works, from stage 2.
   In "Page driver", check each of the five steps against `scripts/init.mjs`, `skills/new-test/SKILL.md`,
   `skills/map-app-flow/SKILL.md` and `doctor`; say who creates `<app>.pricing.ts` for a new shop.
5. Slugs, file names, commands and verdicts in the README are the ones the code prints today.
6. Length: at most 240 lines. One term per thing, the design's.
7. No HTML comment and no note to an editor in `README.md`: `grep -c '<!--' README.md` is 0.

Then `LICENSE`: MIT, `Copyright (c) 2026 mkluczynski11`. `.claude-plugin/plugin.json` `author.name` and
`.claude-plugin/marketplace.json` `owner.name`: `mkluczynski11`; add `"license": "MIT"` and the repository
URL `https://github.com/mkluczynski11/cart-testing-plugin` where the manifest schema has a field for it.

## 4. Stage 4 — `docs/reference.md` (starts by minute 70)

One document for the reader who wants every detail the README leaves out. Same language rules as the
README: short declarative sentences, sentence-case headings of one to three words, tables and numbered
steps, no adjectives, no history of how it was built, one term per thing. Every statement comes from the
code as it is on this branch, not from `docs/design.md` where the two differ. At most 450 lines.

1. Commands. Every `/qa:` command with every argument and option, its default and its effect. Take them
   from the `argument-hint` and the body of each `SKILL.md`.
2. Harness. Every `qa-harness` subcommand with every option, who may run it, what it prints, its verdicts.
   Take them from `support/harness/cli.ts` and `hooks/matrix.json`.
3. Workflow. The steps of `/qa:new-test` in the order they run: who performs each, input, output, when it
   stops. Then `/qa:verify`, `/qa:triage`, resuming, `--dry`.
4. Agents. One table per agent: purpose, model, turn limit, tools, skills, files it may write, harness
   subcommands it may run, verdicts it ends with.
5. Skills. One row per skill: kind (command, shared, procedure), who uses it, what it does.
6. Guardrails. The two hooks and the write matrix as `hooks/matrix.json` has it.
7. Page driver. The files in `e2e/app/`; the `CartDriver` interface quoted from
   `support/core/types.ts`; what each operation must do and must not do; the request bindings of the live
   controls; the map file; how the driver is created (the README's five steps, in full) and repaired.
8. Pricing rules. The rules file: labels, rule vocabulary, provenance, who may change it.
9. Verification. Gates G0–G5, the defect operators, the defects file, the live controls with the four
   recorded facts, the pass criterion, scenario gaps.
10. Verdicts. Every verdict the code can print: who issues it, meaning, reaction.
11. Files. Everything a scenario leaves in `e2e/`, who writes it, whether it is tracked.
12. Configuration. Every field of `qa.config.json` with its default.

Check: every option named in sections 1 and 2 is accepted by the code (show the line that parses it); every
verdict of section 10 exists in `support/core/verdicts.ts`; `grep -c '<!--' docs/reference.md` is 0;
`node scripts/check-contracts.mjs` still passes. List in the report what the document could not state
because the code does not settle it.

## 5. Stage 5 — release state

- `.gitignore`: each line once. No tracked file that should be ignored (`git ls-files -i --exclude-standard`).
- `docs/design.md` section 18 names what stage 1 changed.
- Clean export: `git archive HEAD` into a scratch directory outside the worktree; there `npm ci`,
  `npm run test:unit`, `npm run qa -- selftest` in `templates/e2e`, and `claude plugin validate .` in its
  root. Record the directory checks of `validate` (README, LICENSE) as well.
- R15 over the whole tree: no `/Users/`, home folder name, cookie, authorization header or token in a
  tracked file, except as a search pattern quoted in a report.
- `git status --short` clean after the last commit.

## 6. Report: `docs/reports/E.md`

Plan; one section per stage; the README table of stage 3; what is unverified and left to the owner (a run
against a local instance, the marketplace install); nested sessions and live invocations; and the
last line of every exit check. Commit on `e-final`, at least one commit per stage. Do not merge, do not push.
