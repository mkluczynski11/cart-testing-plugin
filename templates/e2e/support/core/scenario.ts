// Scenario files specs/<slug>.md: YAML front matter, the parsed scenario, hashes and the freeze.
// Implements design 8.1 (grammar, freeze) and R5/R6 (scenario and rules hashes).
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { files } from './config';
import type { AttrFilter } from './pricing';

export type Alias = string;
export type StepKind = 'add' | 'setQty' | 'remove';
export type Precondition = 'empty-cart' | 'guest' | 'no-geolocation';
export type PriceSource = 'ui' | 'api';

export const PRECONDITIONS: readonly Precondition[] = ['empty-cart', 'guest', 'no-geolocation'];

export type ScenarioPick =
  | { pick: 'first-available'; where?: AttrFilter }
  | { pick: 'next-available'; distinctFrom: Alias[]; where?: AttrFilter }
  | { pick: 'by-name'; name: string };

export type Step = { id: string; do: StepKind; product: Alias; qty?: number; cartAfter: Record<Alias, number> };

export type CheckSpec = 'each-step' | 'last-step' | string[];

export type Scenario = {
  id: string;
  title: string;
  app: string;
  status: 'draft' | 'confirmed';
  request: string;
  products: Record<Alias, ScenarioPick>;
  aliases: Alias[];        // declaration order
  steps: Step[];
  check: CheckSpec;
  checkpoints: string[];   // step ids, in step order
  preconditions: Precondition[];
  priceSource: PriceSource;
};

export type ScenarioFile = { text: string; data: unknown };

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function parseScenarioText(text: string): ScenarioFile {
  const m = FRONT_MATTER.exec(text);
  if (!m) throw new Error('the file has no YAML front matter between --- lines');
  return { text, data: parseYaml(m[1]) };
}

export function readScenarioFile(root: string, slug: string): ScenarioFile {
  return parseScenarioText(fs.readFileSync(files.scenario(root, slug), 'utf8'));
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

export function sha256(text: string | Buffer): string {
  return createHash('sha256').update(text).digest('hex');
}

/** SHA-256 of the contract fields: the front matter in canonical form, without `status`. */
export function scenarioHash(data: unknown): string {
  const copy = { ...(data as Record<string, unknown>) };
  delete copy.status;
  return sha256(canonicalJson(copy));
}

/** SHA-256 of a rules file's bytes (R6). */
export function fileHash(file: string): string {
  return sha256(fs.readFileSync(file));
}

/** Change only the value on the `status:` line of the front matter. */
export function setStatusLine(text: string, status: 'draft' | 'confirmed'): string {
  return text.replace(/^(status:[ \t]*)("[^"]*"|'[^']*'|[^\s#]+)/m, `$1${status}`);
}

export type ConfirmedHashes = { scenarioSha256: string; rulesSha256: string };

export type FreezeState = 'frozen' | 'not-confirmed' | 'scenario-changed' | 'rules-changed';

/** Compare a scenario and its rules file with the hashes recorded at confirmation. */
export function freezeState(data: unknown, confirmed: ConfirmedHashes | undefined, rulesSha256: string): FreezeState {
  if ((data as { status?: unknown })?.status !== 'confirmed' || !confirmed) return 'not-confirmed';
  if (confirmed.scenarioSha256 !== scenarioHash(data)) return 'scenario-changed';
  if (confirmed.rulesSha256 !== rulesSha256) return 'rules-changed';
  return 'frozen';
}

export function freezeMessage(state: FreezeState, slug: string): string {
  switch (state) {
    case 'frozen': return `Scenario ${slug} is confirmed and unchanged.`;
    case 'not-confirmed': return `Scenario ${slug} is not confirmed; show the example to the tester and run \`qa-harness example ${slug} --confirm\` after the approval.`;
    case 'scenario-changed': return `Scenario ${slug} changed after its confirmation; show the new example and run \`qa-harness example ${slug} --confirm\` again.`;
    case 'rules-changed': return `The rules file changed after scenario ${slug} was confirmed; show the new example and run \`qa-harness example ${slug} --confirm\` again.`;
  }
}

export function describeStep(s: Pick<Step, 'do' | 'product' | 'qty'>): string {
  switch (s.do) {
    case 'add': return `add ${s.product} ${s.qty}`;
    case 'setQty': return `setQty ${s.product} ${s.qty}`;
    case 'remove': return `remove ${s.product}`;
  }
}

export function describeState(state: Record<string, number>): string {
  const entries = Object.entries(state);
  return entries.length ? entries.map(([k, q]) => `${k}×${q}`).join(', ') : '(empty)';
}
