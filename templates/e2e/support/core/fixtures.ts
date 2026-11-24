// Playwright fixtures for compiled scenario tests.
//
// QA_DRIVER=reference  -> the in-memory reference cart; never refers to `page`, so no browser starts.
//                         Catalog and rules come from the reference cart and app/reference.pricing.ts,
//                         whatever the scenario's `app` field says.
// QA_DEFECT=<id>       -> switches a defect on in the reference cart.
// otherwise            -> the live driver (STUB until a later session installs it).
import { test as base, type TestInfo } from '@playwright/test';
import * as referencePricing from '../../app/reference.pricing';
import { evidenceReplacer, type CheckpointRecord } from './checkpoint';
import { defectFromEnv } from './defects';
import type { PricingModule } from './pricing';
import { ReferenceCart } from './reference-cart';
import { loadConfig, qaRoot, readScenarioFile, type Scenario } from './scenario';
import { Shopper } from './shopper';
import { formatViolations, validateScenario } from './validator';
import { InfraError } from './verdicts';

type Options = { scenario: string; reserved: string[] };
type Fixtures = { shopper: Shopper };

function loadScenario(slug: string): Scenario {
  const file = readScenarioFile(qaRoot(), slug);
  const result = validateScenario(file.data, slug);
  if (!result.ok) throw new InfraError(`scenario ${slug} is invalid:\n${formatViolations(result.violations).join('\n')}`);
  return result.scenario;
}

function attachTo(testInfo: TestInfo) {
  return async (record: CheckpointRecord) => {
    await testInfo.attach('checkpoint', { body: JSON.stringify(record, evidenceReplacer, 2), contentType: 'application/json' });
  };
}

function buildReferenceTest() {
  return base.extend<Options & Fixtures>({
    scenario: ['', { option: true }],
    reserved: [[], { option: true }],
    shopper: async ({ scenario, reserved }, use, testInfo) => {
      const config = loadConfig();
      const pricing: PricingModule = referencePricing;
      const driver = new ReferenceCart({ pricing, defect: defectFromEnv(process.env.QA_DEFECT) });
      await use(new Shopper({
        driver,
        pricing,
        scenario: loadScenario(scenario),
        reserved,
        pickLimit: config.pickLimit,
        settleMs: 0,
        attach: attachTo(testInfo),
      }));
    },
  });
}

// ---------------------------------------------------------------------------------------------
// LIVE DRIVER STUB. A later session replaces this body with the application driver built on
// `page` (app/<app>.driver.ts), app/<app>.pricing.ts and config.timeouts.settleMs.
// ---------------------------------------------------------------------------------------------
function buildLiveTest() {
  return base.extend<Options & Fixtures>({
    scenario: ['', { option: true }],
    reserved: [[], { option: true }],
    shopper: async ({}, _use) => {
      throw new InfraError('live driver not installed');
    },
  });
}

export const test = process.env.QA_DRIVER === 'reference' ? buildReferenceTest() : buildLiveTest();
export { expect } from '@playwright/test';
