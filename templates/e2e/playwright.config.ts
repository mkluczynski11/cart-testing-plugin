// Playwright configuration of an e2e root: unit tests of the library, compiled tests dry and live.
// Implements design 8.6 (timeouts) and 10 (projects `dry` and `live`); QA_ROOT selects another root.
import { defineConfig } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadConfig } from './support/core/config';

const root = process.env.QA_ROOT ? path.resolve(process.env.QA_ROOT) : __dirname;
const qa = loadConfig(root);
const runDir = process.env.QA_RUN_DIR;
const live = { baseURL: qa.baseURL, testIdAttribute: qa.testIdAttribute, locale: qa.locale, permissions: [], headless: true };

export default defineConfig({
  // A harness run writes its JSON and HTML reports into the run directory; the HTML report never opens.
  reporter: runDir
    ? [['json', { outputFile: path.join(runDir, 'report.json') }], ['html', { open: 'never', outputFolder: path.join(runDir, 'html') }]]
    : [['list']],
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: qa.timeouts.testMs,
  globalTimeout: 15 * 60_000,
  outputDir: runDir ? path.join(runDir, 'artifacts') : path.join(root, 'test-results'),
  projects: [
    { name: 'unit', testDir: path.join(__dirname, 'unit'), testMatch: '**/*.spec.ts' },
    { name: 'dry', testDir: path.join(root, 'tests'), testMatch: '**/*.spec.ts' },
    { name: 'live', testDir: path.join(root, 'tests'), testMatch: '**/*.spec.ts', use: live },
    ...(fs.existsSync(path.join(root, 'lab'))
      ? [{ name: 'driver-live', testDir: path.join(root, 'lab'), testMatch: '**/*.live.spec.ts', timeout: 180_000, use: live }]
      : []),
  ],
});
