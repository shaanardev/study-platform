import { expect } from '@playwright/test';

import { fixture } from './fixtures/index.js';

fixture.describe('crimson Skeleton theme', () => {
  fixture('uses the theme primary color for the app brand', async ({ page }) => {
    await page.goto('/');

    const colors = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);

      return {
        brand: styles.getPropertyValue('--color-brand').trim(),
        primary: styles.getPropertyValue('--color-primary-500').trim(),
      };
    });

    expect(colors.primary).toBe('oklch(55.71% 0.21 19.55deg)');
    expect(colors.brand).toBe(colors.primary);
  });
});
