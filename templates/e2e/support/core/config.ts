// The e2e root and its configuration file qa.config.json.
// Implements design 8.6 (fields and defaults) and the root lookup of 6.1 (`--root`, QA_ROOT).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { amountFormat, type AmountFormat } from './money';
import type { CurrencyCode } from './types';

export type QaConfig = {
  app: string;
  baseURL: string;
  testIdAttribute: string;
  locale: string;
  currency: CurrencyCode;
  browserDriver: 'mcp' | 'cli';
  priceSource: 'ui' | 'api';
  defects: 'default' | 'extended';
  repeat: number;
  pickLimit: number;
  timeouts: { probeMs: number; actionMs: number; settleMs: number; testMs: number };
};

const CURRENCIES: CurrencyCode[] = ['USD', 'EUR'];

/** The installed package: the directory above support/. It holds the Playwright config and node_modules. */
export function packageRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

/** The e2e root a command works on: QA_ROOT when set, else the package itself. */
export function qaRoot(): string {
  return process.env.QA_ROOT ? path.resolve(process.env.QA_ROOT) : packageRoot();
}

export function configPath(root: string): string {
  return path.join(root, 'qa.config.json');
}

/** Read qa.config.json of a root, filling the defaults of design 8.6. */
export function loadConfig(root: string = qaRoot()): QaConfig {
  const file = configPath(root);
  if (!fs.existsSync(file)) throw new Error(`${file} does not exist; every e2e root needs a qa.config.json.`);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<QaConfig>;
  const currency = raw.currency ?? 'USD';
  if (!CURRENCIES.includes(currency)) throw new Error(`${file}: currency ${String(currency)} is not supported; use ${CURRENCIES.join(' or ')}.`);
  if (!raw.app) throw new Error(`${file}: field "app" is required; name the application, e.g. "my-shop".`);
  return {
    app: raw.app,
    baseURL: raw.baseURL ?? '',
    testIdAttribute: raw.testIdAttribute ?? 'data-testid',
    locale: raw.locale ?? 'en-US',
    currency,
    browserDriver: raw.browserDriver ?? 'mcp',
    priceSource: raw.priceSource ?? 'ui',
    defects: raw.defects ?? 'default',
    repeat: raw.repeat ?? 3,
    pickLimit: raw.pickLimit ?? 30,
    timeouts: { probeMs: 5000, actionMs: 10000, settleMs: 3000, testMs: 90000, ...(raw.timeouts ?? {}) },
  };
}

export function formatOf(config: QaConfig): AmountFormat {
  return amountFormat(config.locale, config.currency);
}

/** Files of an e2e root, by design 8 and 12.2. */
export const files = {
  scenario: (root: string, slug: string) => path.join(root, 'specs', `${slug}.md`),
  example: (root: string, slug: string) => path.join(root, 'specs', `${slug}.example.json`),
  defects: (root: string, slug: string) => path.join(root, 'specs', `${slug}.defects.json`),
  test: (root: string, slug: string) => path.join(root, 'tests', `${slug}.spec.ts`),
  driver: (root: string, app: string) => path.join(root, 'app', `${app}.driver.ts`),
  pricing: (root: string, app: string) => path.join(root, 'app', `${app}.pricing.ts`),
  reports: (root: string, slug: string) => path.join(root, 'reports', slug),
  runs: (root: string, slug: string) => path.join(root, 'reports', slug, 'runs'),
};
