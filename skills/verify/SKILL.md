---
description: Repeats the independent verification of an existing cart test, after a manual edit, a driver repair or before a release.
argument-hint: "<slug>"
allowed-tools: Bash(qa-harness *), Read, Glob, Grep, Agent
---

# verify

Answer in the language of the tester. You read verdicts; `test-verifier` judges. You never edit the test, the
scenario, the driver or a report.

## When

After a manual edit of a test, after a driver repair, before a release. Without a model (CI): `cd e2e && npm run qa --
verify <slug>` runs gates G0–G4 alone.

## Input

`$ARGUMENTS`: one slug of `e2e/specs/<slug>.md`. Without a slug, list `e2e/specs/*.md` and ask which one.

## Steps

1. `qa-harness doctor`. `HARNESS_MODIFIED` or `SCENARIO_CHANGED` for this slug: react by the routing of `new-test`
   (`${CLAUDE_PLUGIN_ROOT}/skills/new-test/routing.md`) and stop. Note whether the test is compiled or edited by hand.
2. `qa-harness intent <slug>`. Unless it ends `PASS`, call the Agent tool with `subagent_type: "qa:test-verifier"` and
   `mode: intent` / `slug: <slug>` / `request (verbatim): <the request field of the scenario>` / `root: e2e`.
   Continue only on `INTENT_OK`; otherwise react by the routing table and stop.
3. Call `qa:test-verifier` with `mode: run` / `slug: <slug>` / `request (verbatim): <the request field>` / `root: e2e`.
4. `VERIFIED`: `qa-harness report <slug> --promote <runId>` with the run id it returned.

## Output

The readback of `new-test` (`${CLAUDE_PLUGIN_ROOT}/skills/new-test/readback.md`) for the verdict reached. For an
edited test and `REWORK`, the answer goes to the tester with the recommendation: recompile
(`/qa:new-test <slug>` after removing the edit) or repair the place the finding names.

## Stop

After the readback. One verification per invocation; no retry to change a verdict.
