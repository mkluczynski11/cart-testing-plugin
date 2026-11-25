import { defineConfig } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const qa = JSON.parse(fs.readFileSync(path.join(__dirname, 'qa.config.json'), 'utf8'));
// Selftest workspaces point QA_ROOT at a directory with their own specs/ and tests/.
const root = process.env.QA_ROOT ? path.resolve(process.env.QA_ROOT) : __dirname;

export default defineConfig({
  reporter: 'list',
  workers: 1,
  retries: 0,
  projects: [
    {
      // Unit tests of the library: no browser, no page.
      name: 'unit',
      testDir: path.join(__dirname, 'unit'),
      testMatch: '**/*.spec.ts',
    },
    {
      // Compiled scenario tests. QA_DRIVER=reference runs them on the in-memory cart.
      name: 'scenarios',
      testDir: path.join(root, 'tests'),
      testMatch: '**/*.spec.ts',
      timeout: qa.timeouts.testMs,
      use: {
        baseURL: qa.baseURL,
        testIdAttribute: qa.testIdAttribute,
        locale: qa.locale,
        actionTimeout: qa.timeouts.actionMs,
      },
    },
  ],
});
