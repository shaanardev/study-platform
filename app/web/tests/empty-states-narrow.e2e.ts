import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { fixture } from './fixtures/index.js';

const narrowWidth = 320;
const narrowHeight = 800;

const expectNoHorizontalOverflow = async (page: Page): Promise<void> => {
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );

  expect(fits).toBe(true);
};

fixture.describe('narrow empty states', () => {
  fixture('keeps each primary route readable without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ height: narrowHeight, width: narrowWidth });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'No imported packs yet' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto('/practice');
    await expect(
      page.getByRole('heading', { name: 'No exam packs are available yet' }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto('/mock');
    await expect(
      page.getByRole('heading', { name: 'No exam packs are available yet' }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: 'No attempts yet' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto('/review');
    await expect(page.getByRole('heading', { name: 'No imported packs' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await expect(page).toHaveURL(/\/review$/u);
  });
});
