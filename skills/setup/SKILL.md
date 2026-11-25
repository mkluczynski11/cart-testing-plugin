---
description: Prepares this repo for the qa plugin by installing the e2e/ harness for one application.
disable-model-invocation: true
argument-hint: "<app> <base-url> [--defects default|extended] [--test-id-attribute <a>] [--locale <l>] [--currency <c>]"
allowed-tools: Bash(qa-harness doctor), Bash(qa-harness init *)
---

# setup

Answer in the language of the tester's request. Everything you report comes from the output of `qa-harness`.

## When

Once per repo, before the first `/qa:new-test`, or again to update the harness library. Only the tester starts it:
it installs dependencies.

## Input

`$ARGUMENTS`: `<app> <base-url>` and optional flags.

- `<app>`: a lowercase name such as `my-shop`. It names the driver and the rules file (`e2e/app/<app>.*`).
- `<base-url>`: the address of the application, such as `https://shop.example.com`.
- `--defects default|extended`, `--test-id-attribute <a>`, `--locale <l>`, `--currency <c>`: passed through unchanged.

If `<app>` or `<base-url>` is missing, ask for exactly the missing value in one question and stop. Never invent a
name or an address. Ask nothing else: the other values have defaults.

## Steps

1. Run `qa-harness doctor`. Before setup it checks Node, git and the network and says setup has not run; that is
   expected. If it ends `VERDICT: INFRA_FAIL`, report the failing line and stop.
2. Run `qa-harness init --app <app> --base-url <base-url>` plus the optional flags exactly as given. It copies the
   `e2e/` template (never overwriting drivers, scenarios, tests or reports), adds a starter pack when the plugin has
   one for `<app>`, writes `e2e/qa.config.json`, installs the dependencies and Chromium, and runs `selftest`. It takes
   about two minutes; run it once and wait for the `VERDICT:` line.
3. Read only the `VERDICT:` line and the lines above it.

## Output

Report in at most 8 lines:

- the verdict of `init`;
- what was created or kept, the application and its address, as `init` printed them;
- whether a starter pack was installed or the driver will be built from the page on the first scenario;
- the next command: `/qa:new-test "<what the shopper does and what to check>"`;
- that `e2e/` should be committed and works without the plugin: `cd e2e && npm run qa -- <subcommand>`.

## Stop

- `VERDICT: PASS`: done.
- `VERDICT: SPEC_INVALID`: an argument was wrong; quote the sentence `init` printed and ask for the corrected value.
- `VERDICT: INFRA_FAIL`: quote the failing line. Do not retry, do not install anything by other means, do not edit
  files under `e2e/` by hand.
