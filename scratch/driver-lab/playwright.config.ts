import { defineConfig, devices } from '@playwright/test';

// Live lab for the Toolshop driver. Be a polite client: one worker, Chromium only, no retries.
export default defineConfig({
  testDir: '.',
  testMatch: '*.live.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'https://practicesoftwaretesting.com',
    testIdAttribute: 'data-test',
    locale: 'en-US',
    permissions: [], // never grant geolocation: the cart has location-based discounts
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
