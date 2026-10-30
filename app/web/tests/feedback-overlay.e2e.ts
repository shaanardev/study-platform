import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { fixture } from './fixtures/index.js';

const selectionInsetPx = 2;

const openFeedbackOverlay = async (page: Page, shortcut = 'Control+Shift+f'): Promise<Locator> => {
  const overlay = page.getByRole('complementary', { name: 'Developer feedback' });

  await expect
    .poll(async () => {
      if (await overlay.isVisible()) {
        return true;
      }

      await page.keyboard.press(shortcut);

      return await overlay.isVisible();
    })
    .toBe(true);

  return overlay;
};

const visibleBoundingBox = async (locator: Locator) => {
  const bounds = await locator.boundingBox();

  if (!bounds) {
    throw new Error('The selected page element should be visible.');
  }

  return bounds;
};

fixture.describe('developer feedback overlay', () => {
  fixture('persists a custom keyboard shortcut across reloads', async ({ page }) => {
    await page.goto('/practice');
    const overlay = await openFeedbackOverlay(page);

    await overlay.getByRole('button', { name: 'Change' }).click();
    await page.keyboard.press('Alt+g');
    await expect(overlay.getByText('Alt+G')).toBeVisible();

    await page.reload();
    const reopenedOverlay = await openFeedbackOverlay(page, 'Alt+g');
    await expect(reopenedOverlay).toBeVisible();
  });

  fixture(
    'selects an area, ignores shortcuts while typing, and reuses its capture after reload',
    async ({ practiceSetupPage: page }) => {
      const note = 'Keep both parts of this heading visible.';

      await page.goto('/practice');
      const questionCount = page.getByLabel('Number of questions');

      await questionCount.focus();
      await page.keyboard.press('Control+Shift+f');
      const overlayLocator = page.getByRole('complementary', { name: 'Developer feedback' });

      await expect(overlayLocator).toHaveCount(0);
      await questionCount.press('Tab');
      const overlay = await openFeedbackOverlay(page);
      const heading = page.getByRole('heading', { name: 'Build your exam confidence' });

      await heading.scrollIntoViewIfNeeded();
      const bounds = await visibleBoundingBox(heading);

      await page.mouse.move(bounds.x + selectionInsetPx, bounds.y + selectionInsetPx);
      await page.mouse.down();
      await page.mouse.move(
        bounds.x + bounds.width - selectionInsetPx,
        bounds.y + bounds.height - selectionInsetPx,
      );
      await page.mouse.up();
      await expect(overlay).toContainText('rectangle');
      await expect(overlay).toContainText('DOM: h1');

      const noteField = page.getByLabel('What should we know?');

      await noteField.fill(note);
      await page.keyboard.press('Control+Shift+f');
      await expect(overlay).toBeVisible();
      await expect(noteField).toHaveValue(note);
      await page.getByRole('button', { name: 'Queue note' }).click();

      const queueItem = overlay
        .getByRole('region', { name: 'Feedback queue' })
        .getByRole('article')
        .filter({ hasText: note });

      await queueItem.getByRole('button', { name: 'Send' }).click();
      await expect(queueItem.getByLabel('Session')).toBeVisible();
      await expect(queueItem.getByRole('button', { name: 'Send to session' })).toBeDisabled();
      const [savedPaths = ''] = await queueItem.getByText(/Saved:/u).allInnerTexts();
      const feedbackId = /\/(?<id>[\da-f-]{36})\.json/u.exec(savedPaths)?.groups?.['id'] ?? '';

      expect(feedbackId).toMatch(/^[\da-f-]{36}$/iu);

      await page.reload();
      const restoredOverlay = await openFeedbackOverlay(page);

      const restoredItem = restoredOverlay
        .getByRole('region', { name: 'Feedback queue' })
        .getByRole('article')
        .filter({ hasText: note });

      await expect(restoredItem.getByLabel('Session')).toBeVisible();

      await restoredItem.getByLabel('Session').selectOption('e2e-second');
      await restoredItem.getByRole('button', { name: 'Send to session' }).click();
      await expect(restoredItem.getByText('delivered', { exact: true })).toBeVisible();
      await expect(restoredItem).toContainText(
        'The matching Codex agent acknowledged this feedback.',
      );
    },
  );

  fixture(
    'warns when the saved feedback queue is malformed and preserves the stored value',
    async ({ page }) => {
      const malformedQueue = '{invalid json';

      await page.addInitScript((serialized) => {
        localStorage.setItem('ui-feedback-queue:v2', serialized);
      }, malformedQueue);
      await page.goto('/practice');
      const overlay = await openFeedbackOverlay(page);

      await expect(overlay.getByRole('status')).toContainText(
        'Saved feedback could not be read. Its browser storage has been left untouched.',
      );
      await expect
        .poll(async () => await page.evaluate(() => localStorage.getItem('ui-feedback-queue:v2')))
        .toBe(malformedQueue);
    },
  );

  fixture(
    'requires reselection when the viewport changes after a note is queued',
    async ({ page }) => {
      const firstNote = 'Recheck this screenshot after resizing.';

      await page.setViewportSize({ height: 800, width: 1280 });
      await page.goto('/practice');
      const overlay = await openFeedbackOverlay(page);
      const heading = page.getByRole('heading', { name: 'Build your exam confidence' });

      await heading.click();
      await page.getByLabel('What should we know?').fill(firstNote);
      await page.getByRole('button', { name: 'Queue note' }).click();
      await page.setViewportSize({ height: 800, width: 1281 });
      const queueItem = overlay.getByRole('article').filter({ hasText: firstNote });

      await queueItem.getByRole('button', { name: 'Send' }).click();
      await expect(queueItem).toContainText('The route or viewport changed after selection.');
      await expect(queueItem.getByText('Select again')).toBeVisible();
    },
  );

  fixture('queues, edits, removes, and restores page notes', async ({ page }) => {
    const firstNote = 'Clarify the practice heading.';
    const secondNote = 'Keep the domain guidance visible.';
    const editedNote = 'Clarify the practice page heading.';

    await page.goto('/practice');
    await expect(page.getByRole('heading', { name: 'Build your exam confidence' })).toBeVisible();
    const overlay = await openFeedbackOverlay(page);
    const heading = page.getByRole('heading', { name: 'Build your exam confidence' });

    await heading.click();
    await expect(overlay).toContainText('DOM: h1');
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
