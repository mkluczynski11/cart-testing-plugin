# new-test: the readback (design 11.2, 11.3)

One form for every run, in Markdown, filled only from command output and report files. The harness writes the form
at the top of `report.md`: the verdict, the test case, every step with expected and actual apart, what backs the
verdict, the gaps, the rules, the page driver, the files and the rerun lines. Never write an amount, a verdict, a
path or a step result that the harness did not print.

## The form

The readback is the part of `report.md` from its first line that starts with `## ` to the last line of the section
"### Run it again", copied verbatim, in Markdown (not in a code block). `qa-harness report` prints the path and the
heading in its "Readback:" line. Translate only the words of the headings and of the first column when the request
is not in English; amounts, quotes, paths, verdicts and commands stay as they are.

```text
## PASS · test verified
| | |
| --- | --- |
| Test | `e2e/tests/<slug>.spec.ts` |
| Objective | the tester's request, verbatim |
| Status | PASS, 3 of 3 repeats · verified |
| Environment | <baseURL> · Chromium · <locale> · <UTC date> · run `<runId>` |
| Preconditions | empty cart, guest, no geolocation |
| Test data | A = <name>, <price>, <attributes> · B = … (read from the product pages in this run) |

### Steps
| # | Shopper's action | Expected total | Actual (as displayed) | Status | Evidence |
### Verification of the test
| Check | Result |
### Not covered by this scenario
### Pricing rules
### Page driver
### Files
### Run it again
```

Statuses in the Steps table are `pass`, `fail`, and `not run` for the steps after a failure. On a red run the section
"### Failing step" stands directly under the verdict, before the table of the test case. After the form you may add at
most two sentences of your own, without a number: what the tester could do next (a follow-up scenario for a line of
"Not covered", the decision a red run asks for).

## Which `report.md`

| Ending | The file |
| --- | --- |
| Green and verified (`test-verifier` returned `VERIFIED`, `report <slug> --promote <runId>` ended `PASS`) | `e2e/reports/<slug>/report.md` |
| `--dry` (stopped after step 5) | `report.md` in the run directory that `qa-harness run <slug> --dry` printed after "Evidence:"; heading `## PASS · dry gates only, not run live` |
| A red live run (`ORACLE_MISMATCH`, `UNMODELED_ADJUSTMENT`, `INFRA_FAIL`, `PRECONDITION_FAIL`, `LOCATOR_FAIL`, `FLAKY`, `UNDETERMINED`) | `qa-harness report <slug>` writes it into the newest run directory and prints the "Readback:" line |
| A verdict of `test-verifier` other than `VERIFIED` | the same, for the run `qa-harness verify` created |

## What the endings add (design 11.3)

The form keeps its headings; each ending adds, after the form, only what `routing.md` asks of it:

| Ending | Verdicts | Added after the form |
| --- | --- | --- |
| Amounts differ | `ORACLE_MISMATCH` | "the controls on the live site were not run, because the run is red"; "to decide: an application bug or a missing rule" |
| Unknown adjustment | `UNMODELED_ADJUSTMENT` | one question: which rule produces the adjustment shown under "Failing step" (condition and amount, in one sentence) |
| Could not be executed | `INFRA_FAIL`, `PRECONDITION_FAIL` | a retry later, or a change to the scenario |
| No verified test | `LIMIT_REACHED`, `RETRY_REFUSED`, `UNDETERMINED`, `NO_TESTS_RUN`, a red dry gate on a compiled test | "could not deliver a verified test", the reason, the last verdict, the run directory |

A flow that stopped before any run (a refused repair, `LIMIT_REACHED` before the run) has no `report.md` of its own:
answer with the heading `## <verdict> · no verified test`, the lines the harness printed, and the run directory of the
last run when there is one.

A question instead of an ending: an ambiguous request, `NEEDS_TESTER`, `FILE_CONFLICT`. A refusal: an out-of-scope
request, before anything is written.
