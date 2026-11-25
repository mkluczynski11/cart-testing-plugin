# new-test: the readback (design 11.2, 11.3)

Filled only from command output and report files, in the language of the request. Order fixed: verdict, products,
step table, evidence, scope, gaps, rules, rerun command. Never write an amount, a verdict or a step result that the
harness did not print.

## Green and verified

Only after `test-verifier` returned `VERIFIED` and `qa-harness report <slug> --promote <runId>` ended `PASS`.

```text
PASS <n>/<n> · test verified
Products: <from `verify` or `run`: "products: …" line>

Step  Shopper's action                    Expected  Displayed  Result
<one row per checkpoint, copied from the `report --promote` output>

Evidence: intent review <without remarks | its finding>; defects <detected>/<applicable> applicable, each in the right
place; live controls <caught>/<total>; report review <without remarks | its finding>.
Scope: <the scope sentence of e2e/reports/<slug>/report.md>
Scenario gap: <each not-applicable defect of the same G2 pass as the counts, with its hint> | none
Rules used: <rule id · source · live status, from report.md> | none
Rerun: <the "Rerun:" line of the `report --promote` output, verbatim>
Files: e2e/specs/<slug>.md, e2e/specs/<slug>.intent.md, e2e/tests/<slug>.spec.ts, e2e/reports/<slug>/
```

Counts and gaps (design 10.2: the readback's numbers come from the second G2 pass, on the products of the live run):
"defects" from `verification.json` `livePass.defects[]` (or `defects[]` when there is no `livePass`): applicable =
`result` other than `not-applicable`, detected = `result: detected`. "Scenario gap" lists the entries of that same array
with `result: not-applicable`, each with its `hint`; never the stub pass's gaps next to the live pass's counts. "live
controls" from `controls[]` (`result: caught`). The table rows and "Rerun" are copied, not retyped.

## Dry (`--dry`)

```text
DRY <verdict of `run --dry`> · stopped after the dry gates (--dry)
Scenario: e2e/specs/<slug>.md (confirmed) · intent review: <verdict> · test: e2e/tests/<slug>.spec.ts (compiled)
G0–G2: <the G0, G1, G2 lines of `run --dry`>
Scenario gap: <the gap lines> | none
Not run: driver check, live run, live controls, report review.
```

## The other endings (design 11.3)

| Ending | Verdicts | What the answer contains |
| --- | --- | --- |
| Amounts differ | `ORACLE_MISMATCH` | "MISMATCH at <step> · amounts differ", then the evidence that exists (intent review, dry gates, the label of the field read) and the mismatch lines `run` printed (expected with composition, displayed raw text and row, difference); "the controls on the live site were not run, because the run is red"; "to decide: an application bug or a missing rule"; the run directory |
| Unknown adjustment | `UNMODELED_ADJUSTMENT` | the adjustment's label and amount as displayed, and one question: which rule produces it (condition and amount, in one sentence) |
| Could not be executed | `INFRA_FAIL`, `PRECONDITION_FAIL` | the cause with the raw message as `run` printed it; a retry later or a change to the scenario |
| No verified test | `LIMIT_REACHED`, `RETRY_REFUSED`, `UNDETERMINED`, `NO_TESTS_RUN`, a red dry gate on a compiled test | "could not deliver a verified test", the reason, the last verdict, the run directory |

A question instead of an ending: an ambiguous request, `NEEDS_TESTER`, `FILE_CONFLICT`. A refusal: an out-of-scope
request, before anything is written.
