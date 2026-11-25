# Report D: the plugin layer (skills, agents, hooks, setup)

Order: `docs/orders/D.md`. Branch `d-plugin`, worktree `.worktrees/d-plugin`, started from `n-harness` at `157d027`.
Start: `Wed Nov 25 02:12:45 UTC 2026`. Time box 240 min (ends 06:12); stage 4 starts by 04:12 at the latest;
after 05:42 only the current stage is finished and the report closed.

## Plan

Contract: design sections 3, 4, 5, 6.3, 7, 11, 12.1, 14.1; the CLI as the hand-over of `docs/reports/N.md` describes
it. Nothing under `templates/e2e/` or `examples/` changes.

| Stage | What | Check |
| --- | --- | --- |
| 0 | commit the order, `.sandbox/` in `.gitignore`, `npm ci` in `templates/e2e` | branch is `d-plugin` |
| 1 | throwaway plugin `mech` in `.sandbox/mech-plugin/`; one headless session answers skill invocation with arguments, `bin/` on `PATH`, `agent_type` (main thread and plugin agent), `skills` naming in an agent, MCP start-up; `plugin validate`, `plugin eval` probe, JSON output fields | mechanics table |
| 2 | `.claude-plugin/{plugin,marketplace}.json`, `bin/qa-harness` (root lookup, `init`, `doctor` before setup), `scripts/init.mjs` (exclusion list, starter pack, config, `npm ci`, Chromium, `selftest`), skill `setup` | scratch install in `.sandbox/tester-1/` |
| 3 | skills `contracts` (+ `scripts/check-contracts.mjs`), `new-test` (+ templates and routing table in files next to it), `verify`, `triage`, `review-intent`, `run-verification`; agent `test-verifier`; hooks `guard-paths`, `guard-bash` with one data file (`hooks/matrix.json`) and `node --test` units; level A cases A1–A6, A8–A13 | `node --test scripts/`, eval table, two hook refusal transcripts |
| 4 | live flow in `.sandbox/flow-1/`: two `--yes` runs, one ambiguous request, rerun from a clone without the plugin; evidence to `docs/evidence/d-flow/` | four outcomes |
| 5 | agent `app-mapper`, skills `map-app-flow`, `repair-locator`; `.mcp.json`; three sessions on the control application (repair, build, unmodelled adjustment); A4 rerun with MCP | three outcomes |
| 6 | cases not yet run; then, with 30 min left, `defect-designer`, `design-defects`, `--risk`, A7 | as far as time allows |

File list (all new): `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `bin/qa-harness`,
`scripts/{init,check-contracts,guard-paths,guard-bash,hook-common}.mjs` and `scripts/*.test.mjs`, `hooks/hooks.json`,
`hooks/matrix.json`, `skills/{setup,new-test,verify,triage,contracts,review-intent,run-verification,map-app-flow,repair-locator,design-defects}/SKILL.md`
(plus files next to them), `agents/{test-verifier,app-mapper,defect-designer}.md`, `.mcp.json` with a launcher
`scripts/mcp-browser.mjs`, `evals/` (cases and `evals/run.mjs` if `plugin eval` is not usable), `docs/eval-log.md`,
`docs/evidence/d-flow/`, this report.

Choices made up front (details under "Open questions" when they are guesses):

- `bin/qa-harness` is a Node script: it resolves the e2e root and runs `support/harness/cli.ts` of that root with the
  root's own `tsx`; `init` and the pre-setup `doctor` are handled by the plugin itself (`scripts/init.mjs`).
- The hooks read one matrix file, `hooks/matrix.json`: write rules by role and the subcommands each role may run.
- The Playwright MCP server is started through a small launcher that reads `e2e/qa.config.json` of the project, so the
  origin and the test-id attribute come from the tester's config, not from the plugin.

## Stage 0 — workspace

`date -u`: `Wed Nov 25 02:12:45 UTC 2026`. `git rev-parse --abbrev-ref HEAD` → `d-plugin`. Committed the order and
`.sandbox/` in `.gitignore` (`d0c2eff`); `npm ci` in `templates/e2e` → `found 0 vulnerabilities`. Node `v24.16.0`,
Claude Code `2.1.332`.

## Stage 1 — mechanics, settled by experiment

`date -u`: `Wed Nov 25 02:16:49 UTC 2026`.

Docs read (through a fetch agent, quoted where it matters): `plugins/components.md`, `plugins/overview.md`,
`plugins/manifest-reference.md`, `plugins/loading.md`, `plugin-marketplaces.md`, `skills.md`, `sub-agents.md`,
`hooks.md`, `plugin-evals.md`. What the docs say and this order relies on:

- Plugin agents ignore `permissionMode`, `hooks`, `mcpServers`, `initialPrompt`; `effort`, `maxTurns`, `skills`,
  `tools`, `disallowedTools`, `model` are supported. A preloaded skill's full content is injected.
- `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PROJECT_DIR}` are substituted in hook commands, MCP `command`/`args`/`env`
  and skill and agent bodies; Bash commands Claude runs do not get them in the environment.
- PreToolUse: exit 2 blocks and stderr is the reason given to the model; `agent_type` is present only inside a
  subagent (or with `--agent`). Matchers made of letters and `|` are exact tool-name lists.
- A marketplace entry may use `"source": "./"` (a plugin at the marketplace root). On install Claude Code copies the
  plugin directory into `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`; "files outside the plugin
  directory aren't copied". With the plugin at the repo root, `templates/` and `examples/` are inside the plugin
  directory and are copied with it (docs do not list the copied directories explicitly; not tested, per the order).
  `node_modules` are not in git, so an installed plugin has none.

Throwaway plugin `.sandbox/mech-plugin` (`mech`): skill `echo` (`disable-model-invocation: true`, `effort: low`),
hidden skill `hidden` (`user-invocable: false`, a marker text), agents `probe-a` (`skills: [hidden]`) and `probe-b`
(`skills: [mech:hidden]`), both `effort: low`, `bin/mech-bin`, a PreToolUse `*` hook logging its stdin, and an
`.mcp.json` whose server is a 20-line stdio stub logging its argv.

| Question | Command | Answer |
| --- | --- | --- |
| How a plugin skill is listed and invoked | `claude plugin validate .sandbox/mech-plugin` | listed as `skills: mech:echo`, `mech:hidden`; invoked as `/mech:echo` |
| Does `claude -p "/mech:echo hello world"` invoke a plugin skill headlessly with its arguments, also one the model may not choose | `claude -p "/mech:echo hello world" --plugin-dir ../mech-plugin --permission-mode auto --max-turns 12 --output-format json --model sonnet` (cwd `.sandbox/mech-repo`) | yes: the skill (with `disable-model-invocation: true`) ran, `$ARGUMENTS` = `hello world` |
| Is `bin/` on the Bash tool's `PATH` | same session, skill runs `mech-bin "$ARGUMENTS"` | yes: `mech-bin got: [hello world] PATH-has-plugin-bin` |
| `agent_type` a hook receives, main thread | hook log of the same session | absent (`agent_type: null`, `agent_id: null`) |
| `agent_type` for a plugin agent | hook log | `mech:probe-a`, `mech:probe-b`: the namespaced `<plugin>:<agent>` |
| How an agent's `skills` names a skill of the same plugin | `probe-a` with `skills: [hidden]`, `probe-b` with `skills: [mech:hidden]` | both work: each agent answered `marker=ZEBRA-731`. The plugin uses the namespaced form `qa:<skill>` (cannot collide with a project skill) |
| `effort` in skill and agent frontmatter | `claude plugin validate` and the session | accepted: no warning from `validate`, the session ran, the haiku agents reported thinking tokens |
| How a static `.mcp.json` starts a server; can origin and test-id attribute be passed | stub server logging argv | started with every session, before any skill (`mcp.log` written at start); `cwd` = project dir; `${CLAUDE_PROJECT_DIR}` and `${CLAUDE_PLUGIN_ROOT}` substituted in `args`; tools named `mcp__plugin_mech_browser__ping`. So a launcher script can read `e2e/qa.config.json` of the project and pass `--allowed-origins` and `--test-id-attribute` itself |
| Hook environment | hook log | `CLAUDE_PROJECT_DIR` = the scratch repo, `CLAUDE_PLUGIN_ROOT` = plugin dir, `cwd` = scratch repo; `permission_mode: "auto"` |
| What `claude plugin validate` checks | `claude plugin validate <dir> [--json]` | manifest types and paths, unknown fields, MCP entries, unquoted `${CLAUDE_PLUGIN_ROOT}` in hooks; lists what the plugin provides; separate "plugin directory" checks (README ≥ 40 words, LICENSE, icon) that "do not change the result"; `✔ Validation passed`, exit 0 |
| Does `claude plugin eval` exist on this account; what it bills | `claude plugin eval .sandbox/mech-plugin --runs 1 --ablation none --allow-tools Bash --trust-plugin --no-publish --model sonnet --json …` | exists; ran one case in 5 s, `costUsd 0.0734` ("list-price estimate"); docs: "count against your plan's usage limits or your API bill" (same credentials as normal sessions) |
| Can its sandbox run `qa-harness` | same, case running `mech-bin probe`, `node -e …`, `pwd; ls -la` (kept trace) | no: `command not found: mech-bin` (plugin `bin/` is not on `PATH` in the eval sandbox), cwd is an empty temp dir (`/private/tmp/e-…/home/cwd`), the plugin's MCP server is not started (no mock); `node` works. Graders are only `regex`, `tool_used`, `tool_order`, `file_exists`, `llm`, `baseline`: no command grader |
| What `--output-format json` reports | session above | `num_turns` (main-thread turns: 4 with two subagents), `duration_ms`, `total_cost_usd` (all models: 0.1185 = sonnet 0.1168 + haiku 0.0017), `modelUsage` per model with tokens and `costUSD`, `subagent_stats` (`spawned`, `by_type`), `permission_denials`, `terminal_reason`, `is_error` |
| Can a marketplace point at the repo root (docs only) | — | yes, `"source": "./"` |
| Which directories an installed plugin contains (docs only) | — | the whole plugin directory, i.e. the repo root, so `templates/` and `examples/` are there; untracked `node_modules` are not |

Consequences for the later stages:

- Level A cases run through `evals/run.mjs` (headless `claude -p` sessions in prepared scratch repos under
  `.sandbox/`), because the `plugin eval` sandbox cannot run `qa-harness`.
- The hooks read the namespaced `agent_type` (`qa:test-verifier`, `qa:app-mapper`, `qa:defect-designer`); no
  `agent_type` means the main thread.
- Nested sessions inherit the owner's global MCP servers (a user-level `mcp__playwright__*`, claude.ai connectors).
  Agents therefore list their tools explicitly; `app-mapper` gets only `mcp__plugin_qa_browser__*`.

Nested sessions of this stage: see the session table at the end (rows M1–M3).

