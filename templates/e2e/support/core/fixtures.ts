// Playwright fixtures of a compiled test: the shopper on the live application or on the reference cart.
// Implements design 8.4 (injection, isolation, preconditions) and order N, 6.8. Project `dry` never starts a
// browser; `live` drives app/<app>.driver.ts in a fresh browser and context per test.
import { test as base, type Browser, type BrowserContext, type Page, type PlaywrightWorkerArgs, type TestInfo } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CheckpointRecord } from './checkpoint';
import { files, formatOf, loadConfig, type QaConfig } from './config';
import { stubCatalog, type ExampleFile } from './example';
import type { Defect } from './operators';
import type { PricingModule } from './pricing';
import { CONTROLS, installControl, type ControlName, type NetworkLog } from './live-controls';
import { ReferenceCart, type CatalogItem } from './reference-cart';
import { readScenarioFile, scenarioHash, type Precondition, type PriceSource, type Scenario } from './scenario';
import { Shopper, type FailureRecord } from './shopper';
import type { CartDriver, DriverFactory } from './types';
import { formatViolations, validateScenario } from './validator';
import { InfraError, PreconditionError, verdictOf } from './verdicts';

type Options = { preconditions: Precondition[]; priceSource: PriceSource; reserved: string[] };
type Fixtures = { shopper: Shopper };

/** What the harness hands a dry run: the catalog, the empty-cart variant and the defect switched on. */
export type DrySetup = { catalog?: CatalogItem[]; emptyTotal?: boolean; defect?: Defect };

/** The e2e root of a test file: QA_ROOT when the harness set it, else the directory above tests/. */
function rootOf(testInfo: TestInfo): string {
  return process.env.QA_ROOT ? path.resolve(process.env.QA_ROOT) : path.dirname(path.dirname(testInfo.file));
}

function loadModule<T>(file: string, what: string): T {
  if (!fs.existsSync(file)) throw new InfraError(`${what} ${file} does not exist; run qa-harness doctor to see what the root is missing.`);
  // A dynamic require: the app's files are found at run time, by the app name in qa.config.json.
  return require(file) as T;
}

function loadScenario(root: string, slug: string, pricing: PricingModule): { scenario: Scenario; sha: string } {
  const file = readScenarioFile(root, slug);
  const result = validateScenario(file.data, slug, pricing.constraints);
  if (!result.ok) throw new InfraError(`Scenario ${slug} is invalid; run qa-harness example ${slug}:\n${formatViolations(result.violations).join('\n')}`);
  return { scenario: result.scenario, sha: scenarioHash(file.data) };
}

function drySetup(root: string, slug: string, scenario: Scenario): DrySetup & { catalog: CatalogItem[] } {
  const setup: DrySetup = process.env.QA_DRY ? JSON.parse(fs.readFileSync(process.env.QA_DRY, 'utf8')) as DrySetup : {};
  if (setup.catalog) return { ...setup, catalog: setup.catalog };
  const exampleFile = files.example(root, slug);
  if (!fs.existsSync(exampleFile)) throw new InfraError(`${exampleFile} does not exist; run qa-harness example ${slug} first.`);
  return { ...setup, catalog: stubCatalog(scenario, JSON.parse(fs.readFileSync(exampleFile, 'utf8')) as ExampleFile) };
}

/** A fresh browser context per test: no stored state, no permissions, the configured locale. */
async function openLive(playwright: PlaywrightWorkerArgs['playwright'], config: QaConfig): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  playwright.selectors.setTestIdAttribute(config.testIdAttribute);
  let browser: Browser;
  try {
    browser = await playwright.chromium.launch({ headless: true });
  } catch (e) {
    throw new InfraError(`The browser did not start: ${(e as Error).message.split('\n')[0]}. Run npx playwright install chromium.`);
  }
  const context = await browser.newContext({ baseURL: config.baseURL, locale: config.locale, permissions: [] });
  context.setDefaultTimeout(config.timeouts.actionMs);
  await context.tracing.start({ screenshots: true, snapshots: true });
  return { browser, context, page: await context.newPage() };
}

async function checkPreconditions(preconditions: Precondition[], driver: CartDriver, context: BrowserContext | undefined): Promise<void> {
  if (preconditions.includes('guest') && context && (await context.cookies()).length > 0) {
    throw new PreconditionError('The browser context is not a guest session: it holds cookies before the first step.');
  }
  if (preconditions.includes('empty-cart')) {
    const view = await driver.readCart();
    if (!view.empty) {
      throw new PreconditionError(`The cart is not empty before the first step: it shows ${view.lines.map((l) => `${l.name} × ${l.qty}`).join(', ')}.`,
        view.lines.map((l) => l.name).join(', '));
    }
  }
}

export const test = base.extend<Options & Fixtures>({
  preconditions: [['empty-cart', 'guest', 'no-geolocation'], { option: true }],
  priceSource: ['ui', { option: true }],
  reserved: [[], { option: true }],
  shopper: async ({ playwright, preconditions, priceSource, reserved }, use, testInfo) => {
    const root = rootOf(testInfo);
    const slug = path.basename(testInfo.file).replace(/\.spec\.ts$/, '');
    const config = loadConfig(root);
    const fmt = formatOf(config);
    const rulesFile = files.pricing(root, config.app);
    const pricing = loadModule<PricingModule>(rulesFile, 'The rules file');
    const { scenario, sha } = loadScenario(root, slug, pricing);
    const dry = testInfo.project.name === 'dry';
    const setup = dry ? drySetup(root, slug, scenario) : undefined;
    let live: { browser: Browser; context: BrowserContext; page: Page } | undefined;
    let setupFailed = false;
    let controlLog: NetworkLog | undefined;
    const attachJson = (name: string, value: unknown) => testInfo.attach(name, { body: JSON.stringify(value, null, 2), contentType: 'application/json' });
    const fail = async (f: FailureRecord) => { await attachJson('qa-failure', { ...f, url: live?.page.url() ?? null }); };
    await attachJson('qa-meta', { slug, scenarioSha256: sha, mode: dry ? 'dry' : 'live', checkpoints: scenario.checkpoints, defect: setup?.defect?.id ?? null });

    try {
      let driver: CartDriver;
      if (setup) {
        driver = new ReferenceCart({ catalog: setup.catalog, pricing, fmt, defect: setup.defect, emptyTotal: setup.emptyTotal });
      } else {
        live = await openLive(playwright, config);
        const { createDriver } = loadModule<{ createDriver: DriverFactory }>(files.driver(root, config.app), 'The driver');
        driver = createDriver(live.page, { actionMs: config.timeouts.actionMs, baseURL: config.baseURL });
        const control = process.env.QA_CONTROL as ControlName | undefined;
        if (control) {
          if (!CONTROLS.includes(control)) throw new InfraError(`QA_CONTROL=${control} is not a live control; use ${CONTROLS.join(', ')}.`);
          controlLog = await installControl(live.page, control, { controls: driver.controls, totalLabel: pricing.summary.total.label, fmt });
        }
      }
      try {
        await checkPreconditions(preconditions, driver, live?.context);
      } catch (e) {
        setupFailed = true;
        await fail({ step: null, kind: verdictOf(e), message: (e as Error).message, rawText: e instanceof PreconditionError ? e.rawText : undefined });
        throw e;
      }
      const page = live?.page;
      const shopper = new Shopper({
        driver, pricing, fmt, reserved, priceSource,
        rulesFile: path.relative(root, rulesFile),
        pickLimit: config.pickLimit,
        settleMs: dry ? 0 : config.timeouts.settleMs,
        checkpoints: scenario.checkpoints,
        step: (title, body) => test.step(title, body),
        record: (r: CheckpointRecord) => attachJson('checkpoint', r),
        fail,
        afterRead: page ? async (stepId) => {
          const shot = testInfo.outputPath(`${stepId}.png`);
          await page.screenshot({ path: shot, fullPage: true });
          const control = await page.evaluate(() => (window as unknown as { __qaControl?: unknown }).__qaControl ?? null);
          return { screenshot: shot, ...(control ? { control } : {}) };
        } : undefined,
      });
      await use(shopper);
      await shopper.finish();
    } finally {
      if (controlLog) await attachJson('qa-control', controlLog);
      if (live) {
        const failed = setupFailed || testInfo.status !== testInfo.expectedStatus;
        await live.context.tracing.stop(failed ? { path: testInfo.outputPath('trace.zip') } : undefined).catch(() => undefined);
        await live.browser.close();
      }
    }
  },
});
