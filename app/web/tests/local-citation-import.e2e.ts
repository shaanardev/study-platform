import { expect, test } from './fixtures.js';

test.describe('local citation import', () => {
  test('requires an approved source root before importing citations', async ({ page }) => {
    await page.goto('/');

    await page
      .getByLabel('I approve reading cited files beneath this folder during import.')
      .check();
    await page.getByLabel('Approved local source root for absolute file citations').fill('  ');
    await page.getByRole('button', { name: 'Import or refresh local citations' }).click();

    await expect(
      page.getByText('Enter the local source root you approve before importing.'),
    ).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
  });
});
