import { test as playwrightTest } from '@playwright/test';

export { expect } from '@playwright/test';

export const test = playwrightTest.extend({
  baseURL: async ({ browserName: _browserName }, use) => {
    const baseURL = process.env['E2E_BASE_URL'];

    if (baseURL === undefined || baseURL === '') {
      throw new Error('The Playwright global setup did not provide E2E_BASE_URL.');
    }

    await use(baseURL);
  },
});
