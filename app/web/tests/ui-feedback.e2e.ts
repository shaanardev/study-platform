import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures.js';

const openFeedbackOverlay = async (page: Page): Promise<Locator> => {
  const overlay = page.getByRole('complementary', { name: 'Developer feedback' });

  await expect
    .poll(async () => {
      if (await overlay.isVisible()) {
        return true;
      }

      await page.keyboard.press('Control+Shift+f');

      return await overlay.isVisible();
    })
    .toBe(true);

  return overlay;
};

test.describe('developer feedback overlay', () => {
  test('queues, edits, removes, and restores page notes', async ({ page }) => {
    const firstNote = 'Clarify the practice heading.';
    const secondNote = 'Keep the domain guidance visible.';
    const editedNote = 'Clarify the practice page heading.';

    await page.goto('/practice');
    await expect(page.getByRole('heading', { name: 'Build your exam confidence' })).toBeVisible();
    const overlay = await openFeedbackOverlay(page);
    const heading = page.getByRole('heading', { name: 'Build your exam confidence' });

    await heading.click();
    await page.getByLabel('What should we know?').fill(firstNote);
    await page.getByRole('button', { name: 'Queue note' }).click();

    const queue = overlay.getByRole('region', { name: 'Feedback queue' });
    const firstItem = queue.getByRole('article').filter({ hasText: firstNote });

    await expect(queue).toContainText(firstNote);
    await expect(queue.getByText('queued', { exact: true })).toBeVisible();
    await heading.click();
    await page.getByLabel('What should we know?').fill(secondNote);
    await page.getByRole('button', { name: 'Queue note' }).click();
    await expect(queue).toContainText(secondNote);

    await firstItem.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('What should we know?').fill('Cancelled edit');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(overlay.getByText(/click an element, or drag to select an area/iu)).toBeVisible();
    await expect(queue).toContainText(firstNote);

    await queue
      .getByRole('article')
      .filter({ hasText: firstNote })
      .getByRole('button', { name: 'Edit' })
      .click();
    await page.getByLabel('What should we know?').fill(editedNote);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(queue).toContainText(editedNote);

    await queue
      .getByRole('article')
      .filter({ hasText: secondNote })
      .getByRole('button', { name: 'Remove' })
      .click();
    await expect(queue).not.toContainText(secondNote);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Build your exam confidence' })).toBeVisible();

    const restoredOverlay = await openFeedbackOverlay(page);
    const restoredQueue = restoredOverlay.getByRole('region', { name: 'Feedback queue' });

    await expect(restoredQueue).toContainText(editedNote);
    await expect(restoredQueue).not.toContainText(secondNote);
    await page.keyboard.press('Escape');
    await expect(restoredOverlay).toHaveCount(0);
  });
});
