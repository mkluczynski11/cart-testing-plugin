// Scenario files: specs/<slug>.md with YAML front matter. Parsing, canonical hashing, freeze.
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';

export type Alias = string;
export type StepKind = 'add' | 'setQty' | 'remove';

export type ScenarioPick =
  | { pick: 'first-available' }
  | { pick: 'next-available'; distinctFrom: Alias[] }
  | { pick: 'by-name'; name: string };

export type Step = {
  id: string;
  do: StepKind;
  product: Alias;
  qty?: number;
  cartAfter: Record<Alias, number>;
};

export type CheckSpec = 'each-step' | 'last-step' | string[];

export type Scenario = {
  id: string;
  title: string;
  app: string;
  status: 'draft' | 'confirmed';
  request: string;
  products: Record<Alias, ScenarioPick>;
  aliases: Alias[]; // declaration order
  steps: Step[];
  check: CheckSpec;
  checkpoints: string[]; // step ids, in step order
};

export type ScenarioFile = { text: string; data: unknown; body: string };

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/;

export function splitFrontMatter(text: string): { yaml: string; body: string } | null {
  const m = FRONT_MATTER.exec(text);
  return m ? { yaml: m[1], body: m[2] } : null;
}

export function parseScenarioText(text: string): ScenarioFile {
  const parts = splitFrontMatter(text);
  if (!parts) throw new Error('the file has no YAML front matter between --- lines');
  return { text, data: parseYaml(parts.yaml), body: parts.body };
}

// ---- paths -------------------------------------------------------------------------------------

export const paths = {
  scenario: (root: string, slug: string) => path.join(root, 'specs', `${slug}.md`),
  example: (root: string, slug: string) => path.join(root, 'specs', `${slug}.example.json`),
  lock: (root: string, slug: string) => path.join(root, 'specs', `${slug}.lock.json`),
  test: (root: string, slug: string) => path.join(root, 'tests', `${slug}.spec.ts`),
};

export function readScenarioFile(root: string, slug: string): ScenarioFile {
  return parseScenarioText(fs.readFileSync(paths.scenario(root, slug), 'utf8'));
}

// ---- canonical hash ----------------------------------------------------------------------------

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** SHA-256 over the front-matter data in canonical form, without the `status` field. */
export function scenarioHash(data: unknown): string {
  const copy = { ...(data as Record<string, unknown>) };
  delete copy.status;
  return sha256(canonicalJson(copy));
}

// ---- freeze ------------------------------------------------------------------------------------

/** Change only the value on the `status:` line of the front matter. */
export function setStatusLine(text: string, status: 'draft' | 'confirmed'): string {
  const parts = splitFrontMatter(text);
  if (!parts) throw new Error('the file has no YAML front matter');
  const start = text.indexOf(parts.yaml);
  const lines = parts.yaml.split('\n');
  const idx = lines.findIndex((l) => /^status:/.test(l));
  if (idx < 0) throw new Error('the front matter has no status line');
  lines[idx] = lines[idx].replace(/^status:(\s*)("[^"]*"|'[^']*'|[^\s#]+)/, `status:$1${status}`);
  return text.slice(0, start) + lines.join('\n') + text.slice(start + parts.yaml.length);
}

export type Lock = { scenario: string; sha256: string };

export type FreezeState = 'frozen' | 'not-confirmed' | 'no-lock' | 'changed';

export function freezeState(root: string, slug: string, data: unknown): FreezeState {
  const status = (data as { status?: unknown })?.status;
  if (status !== 'confirmed') return 'not-confirmed';
  const lockFile = paths.lock(root, slug);
  if (!fs.existsSync(lockFile)) return 'no-lock';
  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8')) as Lock;
  return lock.sha256 === scenarioHash(data) ? 'frozen' : 'changed';
}

export function freezeMessage(state: FreezeState): string {
  switch (state) {
    case 'frozen': return 'scenario is confirmed and unchanged';
    case 'not-confirmed': return 'scenario is not confirmed; run `qa-harness confirm <slug>` after the tester approved the example';
    case 'no-lock': return 'scenario says confirmed but has no lock file; re-confirm it with `qa-harness confirm <slug>`';
    case 'changed': return 'scenario changed after it was confirmed; re-confirm it with `qa-harness confirm <slug>`';
  }
}

// ---- project root and config -------------------------------------------------------------------

export type QaConfig = {
  app: string;
  baseURL: string;
  testIdAttribute: string;
  locale: string;
  currency: 'USD';
  repeat: number;
  pickLimit: number;
  timeouts: { actionMs: number; settleMs: number; testMs: number };
};

/** The e2e project directory: QA_ROOT when set (selftest workspaces), else the directory above support/. */
export function qaRoot(): string {
  return process.env.QA_ROOT ? path.resolve(process.env.QA_ROOT) : path.resolve(__dirname, '..', '..');
}

/** The directory that holds qa.config.json and the package (never a selftest workspace). */
export function packageRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

export function loadConfig(root: string = qaRoot()): QaConfig {
  const file = fs.existsSync(path.join(root, 'qa.config.json'))
    ? path.join(root, 'qa.config.json')
    : path.join(packageRoot(), 'qa.config.json');
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<QaConfig>;
  return {
    app: cfg.app ?? 'toolshop',
    baseURL: cfg.baseURL ?? '',
    testIdAttribute: cfg.testIdAttribute ?? 'data-test',
    locale: cfg.locale ?? 'en-US',
    currency: 'USD',
    repeat: cfg.repeat ?? 3,
    pickLimit: cfg.pickLimit ?? 30,
    timeouts: { actionMs: 10000, settleMs: 3000, testMs: 90000, ...(cfg.timeouts ?? {}) },
  };
}
