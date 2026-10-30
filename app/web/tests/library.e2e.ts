import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect } from '@playwright/test';
import * as Schema from 'effect/Schema';

import { reviewPackSelectionPath } from '../src/lib/route-urls.js';
import { fixture } from './fixtures/index.js';
import { createAbsoluteCitationPackFixture } from './fixtures/pack-catalog.js';
import { registerTestCases } from './fixtures/register-test-cases.js';

const SavedExcerptSchema = Schema.Struct({ excerpt: Schema.String });

const destinations = [
  ['Exam packs', '/'],
  ['Practice', '/practice'],
  ['Mock', '/mock'],
  ['Progress', '/progress'],
  ['Review', '/review'],
] as const;

fixture.describe('library navigation', () => {
  registerTestCases(destinations, ([label, route]) => {
    fixture(label, async ({ database: _database, learner, page }) => {
      await page.goto(route);
      const navigation = page.getByRole('navigation', { name: 'Primary navigation' });

      await expect(navigation.getByRole('link')).toHaveCount(learner.primaryNavigationLinkCount);
      await expect(navigation.getByRole('link', { name: label })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });
  });
});

fixture.describe('library', () => {
  fixture('shows the empty catalog and progress states', async ({ database, learner, page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Exam pack library' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No imported packs yet' })).toBeVisible();
    await expect(page.getByText('packs/incoming/sample-learning-pack.json')).toBeVisible();

    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: 'No attempts yet' })).toBeVisible();
    await expect(
      page.getByText('Domain scores will appear after you answer questions.'),
    ).toBeVisible();
    await expect(
      page.getByText('No missed questions to review. Any incorrect answers will appear here.'),
    ).toBeVisible();

    await page.goto('/practice');
    await expect(
      page.getByRole('heading', { name: 'No exam packs are available yet' }),
    ).toBeVisible();
    await page.goto(reviewPackSelectionPath(learner.samplePackSelection));
    await expect(page.getByRole('heading', { name: 'No imported packs' })).toBeVisible();
    await page.goto('/');
    await page.getByRole('link', { exact: true, name: 'Practice' }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/practice$/u);
    expect(database.prepare('SELECT COUNT(*) AS count FROM imported_packs').get()).toMatchObject({
      count: 0,
    });
  });

  fixture(
    'imports incoming packs once and keeps them in the library',
    async ({ page, database }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Import packs' }).click();
      await expect(page.getByRole('status')).toContainText(/Imported \d+ pack version\(s\)\./u);
      await expect(page.getByText('Synthetic foundations sample')).toBeVisible();

      await page.getByRole('button', { name: 'Import packs' }).click();
      await expect(page.getByRole('status')).toContainText(
        'No new pack versions were imported. The incoming versions are already in the catalog',
      );
      await page.reload();
      await expect(page.getByText('2 questions · 2 domains')).toBeVisible();
      expect(database.prepare('SELECT COUNT(*) AS count FROM imported_packs').get()).toMatchObject({
        count: 1,
      });
    },
  );

  fixture('imports absolute citations only after explicit approval', async ({ page, database }) => {
    const approvedRoot = await mkdtemp(path.join(tmpdir(), 'approved-pack-import-'));
    const incomingFolder = path.resolve(import.meta.dirname, '../../../packs/incoming');
    const packFile = path.join(incomingFolder, 'ui-absolute-citation-sample.json');
    const notePath = path.join(approvedRoot, 'approved-notes.md');
    const excerpt = 'First-import citation excerpt.';
    const packFixture = createAbsoluteCitationPackFixture(pathToFileURL(notePath).href);

    try {
      await writeFile(notePath, excerpt, 'utf-8');
      await writeFile(packFile, JSON.stringify(packFixture.content), 'utf-8');
      await page.goto('/');
      await page.getByRole('button', { name: 'Import packs' }).click();
      await expect(page.getByRole('status')).toContainText('Pack import failed.');
      await expect(page.getByText(packFixture.title)).toHaveCount(0);

      await page.getByLabel('Local folder for importing cited files').fill(approvedRoot);
      await page
        .getByLabel(
          'I approve reading cited files beneath this folder to import and save excerpts.',
        )
        .check();
      await page.getByRole('button', { name: 'Import with approved citations' }).click();
      await expect(page.getByRole('status')).toContainText(
        'Imported 1 pack version(s) with approved citation excerpts saved locally.',
      );
      await expect(page.getByText(packFixture.title)).toBeVisible();

      const savedAsset = database
        .prepare(
          'SELECT excerpt FROM saved_source_assets WHERE exam_id = ? AND pack_id = ? AND pack_version = ? AND question_id = ?',
        )
        .get(
          packFixture.examId,
          packFixture.packId,
          packFixture.packVersion,
          packFixture.questionId,
        );

      expect(Schema.decodeUnknownSync(SavedExcerptSchema)(savedAsset).excerpt).toBe(excerpt);
    } finally {
      await rm(packFile, { force: true });
      await rm(approvedRoot, { force: true, recursive: true });
    }

    await expect(page.getByText(packFixture.title)).toBeVisible();
  });
});
