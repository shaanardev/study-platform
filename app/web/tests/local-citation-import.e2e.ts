import { expect } from '@playwright/test';

import { fixture } from './fixtures/index.js';

fixture.describe('local citation import', () => {
  fixture(
    'keeps citation approval optional and validates it only for refresh',
    async ({ page }) => {
      await page.goto('/');

      await expect(page.getByRole('button', { name: 'Import packs' })).toBeVisible();
      await expect(page.getByLabel('Local folder for importing cited files')).toBeVisible();
      await expect(
        page.getByLabel('Local folder for refreshing existing pack citations'),
      ).toBeVisible();

      await page
        .getByLabel(
          'I approve reading cited files beneath this folder to import and save excerpts.',
        )
        .check();
      await page.getByLabel('Local folder for importing cited files').fill('  ');
      await page.getByRole('button', { name: 'Import with approved citations' }).click();

      await expect(
        page.getByText('Enter and approve a local source folder before importing these packs.'),
      ).toBeVisible();

      await page
        .getByLabel('I approve reading cited files beneath this folder to refresh saved excerpts.')
        .check();
      await page.getByLabel('Local folder for refreshing existing pack citations').fill('  ');
      await page.getByRole('button', { name: 'Refresh approved citations' }).click();

      await expect(
        page.getByText('Enter and approve a local source folder before refreshing citations.'),
      ).toBeVisible();
      await expect(page.getByRole('status')).toHaveCount(0);

      await page.setViewportSize({ height: 800, width: 320 });

      const fits = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      );

      expect(fits).toBe(true);
      await expect(
        page.getByText('Enter and approve a local source folder before refreshing citations.'),
      ).toBeVisible();
    },
  );
});
