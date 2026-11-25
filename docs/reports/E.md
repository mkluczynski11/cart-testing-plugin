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
