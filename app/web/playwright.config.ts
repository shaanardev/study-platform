import { defineConfig } from '@playwright/test';

export default defineConfig({
  expect: { timeout: 5000 },
  forbidOnly: true,
  fullyParallel: false,
  globalSetup: './tests/global-setup.ts',
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  reporter: 'list',
  retries: 0,
  testDir: './tests',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  use: { browserName: 'chromium', trace: 'retain-on-failure' },
  workers: 1,
});
