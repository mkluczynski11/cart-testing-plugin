// Shared pieces of the qa-harness subcommands: the result type and loading a scenario with its rules.
// Implements the output contract of design 6.1 (at most 15 lines, then the verdict).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { files, formatOf, loadConfig, type QaConfig } from '../core/config';
import type { ExampleFile } from '../core/example';
import type { AmountFormat } from '../core/money';
import { rulesProblems, type PricingModule } from '../core/pricing';
import { fileHash, freezeState, readScenarioFile, scenarioHash, type FreezeState, type Scenario } from '../core/scenario';
import { formatViolations, validateScenario } from '../core/validator';
import { ConditionError, type Verdict } from '../core/verdicts';

export type CommandResult = { verdict: Verdict; lines: string[]; data?: Record<string, unknown> };

export const MAX_LINES = 15;

export const rel = (root: string, p: string) => path.relative(root, p) || '.';

/** Load app/<app>.pricing.ts of a root. The harness runs under tsx, so a .ts file can be required. */
export function loadPricing(root: string, app: string): PricingModule {
  const file = files.pricing(root, app);
  if (!fs.existsSync(file)) throw new ConditionError(`${path.relative(root, file)} does not exist; write the app's rules file first (design 9.2).`, 'SPEC_INVALID');
  // A dynamic require: the rules file is found by the app name in qa.config.json.
  return checkedRules(require(file) as unknown, path.relative(root, file));
}

/** A loaded rules file inside the vocabulary of design 9.2, or LINT_FAIL naming the rule and the key. */
export function checkedRules(module: unknown, file: string): PricingModule {
  const problems = rulesProblems(module);
  if (problems.length) {
    throw new ConditionError(`The rules file ${file} is outside the vocabulary of design 9.2: ${problems[0]}${problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''}. Correct the rules file; tsc --noEmit names the same place.`, 'LINT_FAIL');
  }
  return module as PricingModule;
}

export type Loaded = {
  root: string;
  slug: string;
  config: QaConfig;
  fmt: AmountFormat;
  pricing: PricingModule;
  rulesFile: string;
  rulesSha256: string;
  scenario: Scenario;
  data: unknown;
  text: string;
  scenarioSha256: string;
  example?: ExampleFile;
  freeze: FreezeState;
};

/** Read, parse and validate a scenario. Returns the loaded state or a SPEC_INVALID result. */
export function loadScenario(root: string, slug: string): { ok: true; loaded: Loaded } | { ok: false; result: CommandResult } {
  const config = loadConfig(root);
  const file = files.scenario(root, slug);
  if (!fs.existsSync(file)) return { ok: false, result: { verdict: 'SPEC_INVALID', lines: [`V1: ${rel(root, file)} does not exist; write the scenario there first.`] } };
  let parsed;
  try {
    parsed = readScenarioFile(root, slug);
  } catch (e) {
    return { ok: false, result: { verdict: 'SPEC_INVALID', lines: [`V1: ${rel(root, file)} cannot be read (${(e as Error).message}); fix the YAML front matter.`] } };
  }
  const rulesFile = files.pricing(root, config.app);
  const pricing = loadPricing(root, config.app);
  const r = validateScenario(parsed.data, slug, pricing.constraints);
  if (!r.ok) {
    const lines = formatViolations(r.violations);
    return { ok: false, result: { verdict: 'SPEC_INVALID', lines: [`Scenario ${slug} breaks ${lines.length} rule(s); fix them and run example again:`, ...lines], data: { violations: r.violations } } };
  }
  if (r.scenario.app !== config.app) {
    return { ok: false, result: { verdict: 'SPEC_INVALID', lines: [`V1: scenario ${slug} is for app "${r.scenario.app}", but qa.config.json tests "${config.app}"; correct the app field.`] } };
  }
  const exampleFile = files.example(root, slug);
  const example = fs.existsSync(exampleFile) ? JSON.parse(fs.readFileSync(exampleFile, 'utf8')) as ExampleFile : undefined;
  const rulesSha256 = fileHash(rulesFile);
  return {
    ok: true,
    loaded: {
      root, slug, config, fmt: formatOf(config), pricing, rulesFile, rulesSha256,
      scenario: r.scenario, data: parsed.data, text: parsed.text, scenarioSha256: scenarioHash(parsed.data),
      example, freeze: freezeState(parsed.data, example?.confirmed, rulesSha256),
    },
  };
}

/** Keep a subcommand's output within the line budget; the evidence stays on disk. */
export function capLines(lines: string[], more: string): string[] {
  if (lines.length <= MAX_LINES) return lines;
  return [...lines.slice(0, MAX_LINES - 1), `… ${lines.length - MAX_LINES + 1} more line(s): ${more}`];
}
