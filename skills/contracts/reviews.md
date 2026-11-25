# contracts: reviews, defects and run evidence

## Intent review: `specs/<slug>.intent.md` (written only by `test-verifier`, step 3a)

```markdown
---
scenario: <slug>
scenario_sha256: <the 64 hex characters `qa-harness intent <slug>` prints, copied exactly>
verdict: INTENT_OK            # INTENT_OK | REWORK | NEEDS_TESTER
---

# Intent review of <slug>

| # | Clause of the request (verbatim) | Covered by | Object | Finding |
| --- | --- | --- | --- | --- |
| 1 | "<words of the request>" | S1, S2 | A, B (`distinct_from: [A]`) | none |
| 2 | "<words of the request>" | S3 | A | none |

Excess: none                  # or: steps that no clause asks for and that change the meaning
Finding: none                 # REWORK: what to change in the scenario; NEEDS_TESTER: the one question
```

`qa-harness intent <slug>` reads the two front-matter lines: the review counts only when `scenario_sha256` equals the
confirmed hash and `verdict` is `INTENT_OK`.

## Run review: `reports/<slug>/runs/<runId>/review.md` (written only by `test-verifier`, step 8)

```markdown
---
scenario: <slug>
run: <runId>
verdict: VERIFIED             # VERIFIED | REWORK | NEEDS_TESTER | UNDETERMINED
---

# Review of run <runId>

| Gate | Result | Evidence |
| --- | --- | --- |
| Intent | current INTENT_OK | specs/<slug>.intent.md, scenario_sha256 <first 12 characters> |
| G0–G2 | <from verification.json `gates.dry`> | <defects: detected / late / missed / not applicable> |
| G3 | <`gates.G3`> | <passing repeats / repeats> |
| G4 | <`gates.G4`> | <controls caught / missed / not bound> |
| G5 | <your assessment> | <what the report shows at every checkpoint, what it lacks> |

Test origin: compiled | edited (from verification.json `testOrigin`)
Scenario gaps and the hint that closes each: ...
Finding: none                 # REWORK: addressee (app-mapper | scenario | tester) and the finding;
                              # NEEDS_TESTER: one question; UNDETERMINED: what is missing
```

`qa-harness report <slug> --promote <runId>` copies `review.md` together with the rest of the run into the repo.

## Additional defects: `specs/<slug>.defects.json`

A JSON array; never code. Admitted by `qa-harness defects check <slug>`; at most 8 entries.

```json
[
  { "id": "total-stale-after-decrease", "origin": "tester",
    "operator": "stale-value", "target": { "value": "total" },
    "when": { "afterStep": "setQty", "direction": "decrease" },
    "why": "the total does not refresh after a quantity decrease" }
]
```

Operators: `no-effect`, `wrong-target`, `stale-value`, `skew-value`, `ignore-factor`, `rule-never`, `rule-always`,
`rule-rate`, `rule-boundary`, `round-mode`. `origin` is `tester` (from `--risk`) or `generated` (`defect-designer`).
`target` is `{ "value": "total" | "subtotal" | "lineTotal" }`, `{ "adjustment": "<rule id of the rules file>" }` or
`{ "step": "add" | "setQty" | "remove" }` (a kind that occurs in the scenario); `when` is optional,
`{ "afterStep": "<kind>", "direction": "increase" | "decrease" }`; `why` is one sentence. `defects check` rejects an
unknown operator, a target the scenario or rules do not have, and an entry that behaves like another at every
checkpoint.
`qa-harness defects list <slug>` prints the default defects the harness derives by itself.

## Run evidence: `reports/<slug>/`

| Path | Written by | Content |
| --- | --- | --- |
| `runs/<runId>/run.json` | harness | `meta` (hashes, `testOrigin`, `baseURL`), `verdict`, `repeats[].checkpoints[]` with `action`, `expected` (composition), `displayed` (`rawText`, row `label`), `result`, `error` |
| `runs/<runId>/verification.json` | harness | `gates`, `defects[]` (`expected`, `firstRed`, `result`), `gaps[]`, `controls[]` with the four facts (`activated`, `target`, `shownAtRead`, `reactedAt`), `testOrigin`, hashes, `verdict` |
| `runs/<runId>/report.md` | harness | the readable report of the run |
| `runs/<runId>/review.md` | `test-verifier` | the run review above |
| `runs/<runId>/S1.png …`, `html/`, `artifacts/` | harness | screenshots, Playwright HTML report, traces of failed repeats |
| `report.md`, `run.json`, `verification.json`, `review.md`, `screens/` | `qa-harness report --promote` only | the promoted run, tracked in git |
| `attempts.json` | harness (`run --repair`) | repair attempts (R9), not tracked |

A run directory is evidence: nobody edits or deletes it.
