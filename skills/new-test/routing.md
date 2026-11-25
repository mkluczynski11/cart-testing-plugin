# new-test: what follows each verdict (design 6.3, quoted)

This is the only routing table of the plugin; `verify` and `triage` use it too. A verdict names an observation, not a
cause: route to a repair only when the evidence points at the owner; otherwise the ending is `UNDETERMINED`.
"Compiled test" or "edited test": `run` and `verify` print it on the G0 line ("the untouched compilation" or not).

| Verdict | Who issues it | Meaning | Reaction |
| --- | --- | --- | --- |
| `SPEC_INVALID` | `example`, `compile`, `intent` | the scenario breaks the rules from 8.1; the result lists the violated rules | fix the scenario or ask the tester (step 2) |
| `INTENT_OK` | `test-verifier` | every clause of the request has a step or checkpoint with the right object; no excess | compilation |
| `FILE_CONFLICT` | `compile` | the existing test was edited by hand | stop; the tester chooses `--force` or keeping the edit |
| `LINT_FAIL` | gate G0, `need` | a forbidden pattern or mismatched types in the test or the driver; `need`: the driver lacks an action | compiled test: harness bug, stop; edited test: the tester fixes or recompiles; driver: `app-mapper` |
| `CONFORMANCE_FAIL` | gates G1 and G3 | the ledger trace differs from `cart_after`, or the totals differ from the approved example | compiled test: harness bug or changed rules (R6); edited test: the tester |
| `DEFECT_LATE` | gate G2 | a defect detected after the expected checkpoint | as above; typically a checkpoint removed by hand |
| `DEFECT_MISSED` | gate G2 | an applicable defect not detected | as above |
| `INFRA_FAIL` | `run`, `verify` | environment: browser, network, 5xx response, missing binaries | immediate stop; a report with the cause; never `app-mapper` |
| `PRECONDITION_FAIL` | `run`, `verify` | a precondition not met: no product, out of stock, a purchase constraint, a refusal by the application | stop; one message to the tester with the application's raw text |
| `NO_TESTS_RUN` | `run`, `verify` | zero executed tests or an incomplete set of checkpoints without another error | harness bug; never `PASS` |
| `LOCATOR_FAIL` | gate G3 | an action did not find its element or its acknowledgment, or a read is not an amount or has another label | `app-mapper`, skill `repair-locator` |
| `LOCATOR_FAIL` from `run` naming a driver method | gate G3 | Playwright's timeout on a locator inside the method, or the method did not return within 3 × `actionMs`; the line names the step and the method | `app-mapper`, skill `repair-locator`, with that method as the failing action |
| `FLAKY` | gate G3 | a different result across repeats | by the class of the failed repeats; table below |
| `ORACLE_MISMATCH` | gate G3 | expected differs from displayed | stop; the tester decides: application bug or missing rule |
| `UNMODELED_ADJUSTMENT` | gate G3 | an adjustment in the cart with no rule | one question to the tester about the rule |
| `CONTROL_MISSED` | gate G4 | a live control did not produce the expected red checkpoint | by the four facts about the control; table below |
| `PASS` | `run` and the other subcommands | the required gates are green; a complete set of tests and checkpoints | the next step |
| `HARNESS_MODIFIED` | `doctor` | the library was changed (R4) | stop; restore it with `/qa:setup` |
| `SCENARIO_CHANGED` | `doctor`, `run` | the scenario or the rules changed after confirmation (R5, R6) | a new confirmation (step 2) |
| `VERIFICATION_STALE` | `doctor` | the test or the driver changed after verification (R7) | `/qa:verify <slug>` |
| `RETRY_REFUSED` | `run --repair` | a repair retry without a change to the repaired file (R9) | stop; the agent changes the premise or hands the matter over |
| `LIMIT_REACHED` | `run --repair` | repair attempts exhausted (R9) | stop with the reason and the last verdict |
| `VERIFIED` | `test-verifier` | the intent review matches the scenario hash and all gates are green | `qa-harness report <slug> --promote <runId>`, then the readback |
| `REWORK` | `test-verifier` | a finding with an addressee: `app-mapper`, the scenario or the tester | driver: `app-mapper`, then `run --repair driver`; scenario: back to step 2 with a new confirmation; tester: recompile or repair the manual edit |
| `NEEDS_TESTER` | `test-verifier`, `app-mapper` | the decision belongs to a human | one question to the tester |
| `UNDETERMINED` | `run`, `verify`, `triage`, `test-verifier` | the evidence does not settle the cause | stop; escalate to the tester with the collected material |
| `UNDETERMINED` from `run` naming a driver method | gate G3 | the method threw an exception that is neither a locator timeout nor the environment (a possible driver bug) | stop; the answer quotes the step, the method and the message; never `app-mapper` without the tester |
| any verdict from `report --promote` | `report` | the run is not a live run verified through G4 (dry, no G4, red, or no `verification.json`); the tracked files are unchanged | promote only the run `test-verifier` named with `VERIFIED`; otherwise "could not deliver a verified test" with that verdict. `--as-evidence` is the tester's flag, never the plugin's |

A 5xx response to a request of a scenario action also gives `INFRA_FAIL`, but the output names the step and the
request: it may be an application bug rather than the environment.

Two verdicts have several possible owners; the recorded evidence decides.

| Verdict | Evidence (as `run`/`verify` print it) | Routing |
| --- | --- | --- |
| `CONTROL_MISSED` | not activated: target not found or request not intercepted | network controls: `app-mapper` fixes the bindings; `skew-total`: a question to the tester about the total's label |
| `CONTROL_MISSED` | active, the element showed the changed value at the read, the test stayed green | `app-mapper`: the driver reads a different field |
| `CONTROL_MISSED` | active, the element did not show the changed value at the read | `UNDETERMINED`: the control was ineffective, no charge against the driver |
| `FLAKY` | the failed repeats end with an unmet precondition | the application's data changed between repeats: one retry of `run`, then `UNDETERMINED` |
| `FLAKY` | the failed repeats end with an action failure | `app-mapper` fixes the action's completion signal (`repair-locator`) |
| `FLAKY` | the failed repeats end with an amount mismatch | the tester, with the distribution of results and the last read: an application bug or a `settleMs` too short |

## Calling app-mapper for a repair

Call the Agent tool with `subagent_type: "qa:app-mapper"` and the prompt `mode: repair` / `slug: <slug>` /
`action: <the failing action from the output>` / `run: <the run directory from the output>` / `root: e2e`. Its last line
is `PASS`, `NEEDS_TESTER` (ask its question, stop) or `UNDETERMINED` (stop). After `PASS` run
`qa-harness run <slug> --repair driver` (a live run; `--dry` is refused, because a dry run never calls the driver); the
harness counts the attempts, and a repair run that ends `PASS` closes the episode.

## Stopping rule (R9, design 3.3)

- Driver repairs: two failed attempts, or `RETRY_REFUSED`, or `LIMIT_REACHED` end the flow.
- Intent `REWORK`: two rounds. Run-verification `REWORK`: two correction rounds.
- A retry that does not change the premise is not made.
- When a loop ends without a promoted run, the answer starts "could not deliver a verified test", gives the reason,
  the last verdict and the run directory. A test file may exist then, but it is not handed over as ready.
