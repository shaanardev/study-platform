import { validateExamPack } from '@learning-platform/exam-pack';
import type { Page } from '@playwright/test';
import Database from 'better-sqlite3';

import { sampleLearningPackFixture } from '../src/lib/test-fixtures.js';
import { expect, test } from './fixtures.js';

const samplePack = {
  examId: 'sample-engineer-exam',
  packId: 'synthetic-foundations',
  packVersion: '1.0.0',
};

const practiceQuestion = 'What does a Delta Lake transaction log help a table provide?';
const practiceWrongAnswer = 'An automatic backup to a public website';
const practiceCorrectAnswer = 'A record of table changes and transaction state';
const pipelineQuestion = 'Which two practices can help make a data pipeline easier to operate?';

const pipelineFirstCorrectAnswer = 'Validate data quality expectations';
const pipelineSecondCorrectAnswer = 'Track pipeline failures and execution status';

const reviewUrl = `/review?${new URLSearchParams(samplePack).toString()}`;

const seedAlternatePackVersion = (): void => {
  const databasePath = process.env['DB_PATH'];

  if (databasePath === undefined || databasePath === '') {
    throw new Error('The Playwright global setup did not provide DB_PATH.');
  }

  const database = new Database(databasePath);

  try {
    const validation = validateExamPack(sampleLearningPackFixture());

    if (!validation.valid) {
      throw new Error(validation.errors.join('\n'));
    }

    const alternatePack = validation.pack;
    alternatePack.pack.id = 'synthetic-alternate';
    alternatePack.pack.title = 'Alternative foundations sample';
    alternatePack.pack.version = '2.0.0';
    const [firstDomain, secondDomain] = alternatePack.domains;
    const [firstQuestion, secondQuestion] = alternatePack.questions;

    if (
      firstDomain === undefined ||
      secondDomain === undefined ||
      firstQuestion === undefined ||
      secondQuestion === undefined
    ) {
      throw new Error('The sample pack fixture needs two domains and two questions.');
    }

    firstDomain.id = 'transactions';
    firstDomain.title = 'Transaction foundations';
    secondDomain.id = 'operations';
    secondDomain.title = 'Operations foundations';
    firstQuestion.domainId = 'transactions';
    secondQuestion.domainId = 'operations';

    database
      .prepare(
        'INSERT INTO imported_packs (exam_id, pack_id, pack_version, content, approved_source_root, imported_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        alternatePack.exam.id,
        alternatePack.pack.id,
        alternatePack.pack.version,
        JSON.stringify(alternatePack),
        null,
        new Date().toISOString(),
      );
  } finally {
    database.close();
  }
};

const expectEmptyStudyViews = async (page: Page): Promise<void> => {
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

  await page.goto(reviewUrl);
  await expect(page.getByRole('heading', { name: 'No imported packs' })).toBeVisible();
};

const expectPackSwitchUpdatesDomains = async (page: Page): Promise<void> => {
  await page.getByLabel('Delta Lake foundations').check();
  await expect(page.getByLabel('Number of questions')).toHaveAttribute('max', '1');
  await page
    .getByLabel('Exam pack version')
    .selectOption('sample-engineer-exam|synthetic-alternate|2.0.0');
  await expect(page.getByRole('group', { name: /Domains/u })).toContainText(
    'Transaction foundations',
  );
  await expect(page.getByRole('group', { name: /Domains/u })).not.toContainText(
    'Delta Lake foundations',
  );
  await page
    .getByLabel('Exam pack version')
    .selectOption(`${samplePack.examId}|${samplePack.packId}|${samplePack.packVersion}`);
  await expect(page.getByRole('group', { name: /Domains/u })).toContainText(
    'Delta Lake foundations',
  );
  await expect(page.getByLabel('Delta Lake foundations')).not.toBeChecked();
  await expect(page.getByLabel('Number of questions')).toHaveAttribute('max', '2');
};

const resumePracticeQuiz = async (page: Page): Promise<void> => {
  await page.goto('/practice');
  await page.getByRole('link', { name: 'Resume quiz' }).click();
  await expect(page).toHaveURL(/\/practice\?session=[^&]+$/u);
  await expect(page.getByRole('heading', { name: practiceQuestion })).toBeVisible();
};

const expectSourceCitation = async (page: Page): Promise<void> => {
  await expect(
    page.getByRole('link', { name: 'Synthetic study notes, section 1' }),
  ).toHaveAttribute('href', /\/practice\/source\?/u);
};

test.describe('learner workflows', () => {
  // These linked flows share persisted state, so keep them in one ordered test.

  test('imports a pack, completes practice and a mock exam, tracks progress, and updates question feedback', async ({
    page,
  }) => {
    await test.step('library read and pack import', async () => {
      await page.goto('/');
      await expect(page).toHaveURL(/\/$/u);
      await expect(page.getByRole('heading', { name: 'Exam pack library' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'No imported packs yet' })).toBeVisible();

      await expectEmptyStudyViews(page);

      await page.goto('/');

      await page.getByRole('button', { name: 'Import or refresh local citations' }).click();
      await expect(page.getByRole('status')).toContainText(/Imported \d+ pack version\(s\)\./u);
      await expect(page.getByText('Synthetic foundations sample')).toBeVisible();

      await page.reload();
      await expect(page.getByText('Synthetic foundations sample')).toBeVisible();
      await expect(page.getByText('2 questions · 2 domains')).toBeVisible();

      seedAlternatePackVersion();
    });

    await test.step('practice read, start redirect, answer redirect, and saved result', async () => {
      await page.goto('/practice');
      await expect(page).toHaveURL(/\/practice$/u);
      await expect(page.getByRole('heading', { name: 'Start a practice quiz' })).toBeVisible();
      await page
        .getByLabel('Exam pack version')
        .selectOption(`${samplePack.examId}|${samplePack.packId}|${samplePack.packVersion}`);
      await expectPackSwitchUpdatesDomains(page);
      await page.getByLabel('Delta Lake foundations').check();
      await page.getByLabel('Number of questions').fill('1');
      await page.getByRole('button', { name: 'Start quiz' }).click();
      await expect(page).toHaveURL(/\/practice\?session=[^&]+$/u);
      await expect(page.getByRole('heading', { name: practiceQuestion })).toBeVisible();

      await resumePracticeQuiz(page);

      await page.getByLabel(practiceWrongAnswer).check();
      await page.getByRole('button', { name: 'Submit answer' }).click();
      await expect(page).toHaveURL(/\/practice\?session=[^&]+$/u);

      const answerFeedback = page.getByRole('status').filter({ hasText: 'Not quite' });
      await expect(answerFeedback).toContainText('Not quite');
      await expect(answerFeedback).toContainText(practiceCorrectAnswer);

      await expectSourceCitation(page);

      await page.reload();
      await expect(page.getByRole('heading', { name: 'Quiz complete' })).toBeVisible();
      await expect(page.getByText('You answered 0 of 1 correctly.')).toBeVisible();
    });

    await test.step('mock read, weighted preview, start, answer, and submit', async () => {
      await page.goto('/mock');
      await expect(page).toHaveURL(/\/mock$/u);
      await expect(page.getByRole('heading', { name: 'Choose a mock exam' })).toBeVisible();
      await page
        .getByLabel('Exam pack version')
        .selectOption(`${samplePack.examId}|${samplePack.packId}|${samplePack.packVersion}`);

      await page.getByLabel('Requested question count').fill('2');
      await page.getByRole('button', { name: 'Check weighted coverage' }).click();
      await expect(page).toHaveURL(/\/mock\?.*count=2/u);
      await expect(
        page.getByRole('heading', { name: 'Blueprint coverage for 2 questions' }),
      ).toBeVisible();
      await expect(
        page.getByRole('listitem').filter({ hasText: 'Delta Lake foundations' }),
      ).toContainText('1 available / 1 needed');

      await page.getByLabel('Time limit in minutes').fill('5');
      await page.getByRole('button', { name: 'Start timed mock' }).click();
      await expect(page).toHaveURL(/\/mock\?attempt=[^&]+$/u);
      await expect(page.getByRole('region', { name: 'Mock exam attempt' })).toBeVisible();
      await expect(page.getByText('0 of 2 answers saved')).toBeVisible();

      const deltaArticle = page.locator('article').filter({
        has: page.getByRole('heading', { name: practiceQuestion }),
      });

      await deltaArticle.getByLabel(practiceCorrectAnswer).check();
      await deltaArticle.getByRole('button', { name: 'Save answer' }).click();
      await expect(page).toHaveURL(/\/mock\?attempt=[^&]+$/u);
      await expect(page.getByText('1 of 2 answers saved')).toBeVisible();
      await page.reload();
      await expect(
        page
          .locator('article')
          .filter({ has: page.getByRole('heading', { name: practiceQuestion }) })
          .getByLabel(practiceCorrectAnswer),
      ).toBeChecked();

      const pipelineArticle = page.locator('article').filter({
        has: page.getByRole('heading', { name: pipelineQuestion }),
      });

      await pipelineArticle.getByLabel(pipelineFirstCorrectAnswer).check();
      await pipelineArticle.getByLabel(pipelineSecondCorrectAnswer).check();

      await pipelineArticle.getByRole('button', { name: 'Save answer' }).click();
      await expect(page.getByText('2 of 2 answers saved')).toBeVisible();

      await page.getByRole('button', { name: 'Submit mock exam' }).click();
      await expect(page).toHaveURL(/\/mock\?attempt=[^&]+$/u);
      await expect(page.getByRole('heading', { name: 'Mock exam results' })).toBeVisible();
      await expect(page.getByRole('status')).toContainText('2 / 2 correct · 100%');
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Mock exam results' })).toBeVisible();
      await expect(page.getByRole('status')).toContainText('2 / 2 correct · 100%');
    });

    await test.step('progress read and missed-question practice redirect', async () => {
      await page.goto('/progress');
      await expect(page).toHaveURL(/\/progress$/u);
      await expect(page.getByRole('heading', { name: 'Progress and mistakes' })).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Recent practice and mock results' }),
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Timed mock exam' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Missed questions' })).toBeVisible();
      await expect(page.getByText(practiceQuestion)).toBeVisible();

      await page.getByLabel(practiceQuestion).check();
      await page.getByRole('button', { name: 'Practice selected missed questions' }).click();
      await expect(page).toHaveURL(/\/practice\?session=[^&]+$/u);
      await expect(page.getByRole('heading', { name: practiceQuestion })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('heading', { name: practiceQuestion })).toBeVisible();
    });

    await test.step('review read, flag, correction validation and save, and retirement', async () => {
      await page.goto(reviewUrl);
      await expect(page).toHaveURL(new RegExp(`/review\\?examId=${samplePack.examId}.*`, 'u'));
      await expect(
        page.getByRole('heading', { name: 'Improve your imported questions' }),
      ).toBeVisible();
      await expectSourceCitation(page);

      const question = page.locator('article').filter({
        has: page.getByRole('heading', { name: practiceQuestion }),
      });

      const flagForm = question.locator('form').filter({
        has: page.getByRole('button', { name: 'Save flag' }),
      });

      await flagForm.getByLabel('Flag this question').fill('Check the wording');
      await flagForm.getByRole('button', { name: 'Save flag' }).click();
      await expect(page).toHaveURL(new RegExp(`/review\\?examId=${samplePack.examId}.*`, 'u'));
      await expect(question.getByRole('list', { name: 'Existing flags' })).toContainText(
        'Flagged: Check the wording',
      );
      await page.reload();
      await expect(
        page
          .locator('article')
          .filter({ has: page.getByRole('heading', { name: practiceQuestion }) })
          .getByText('Flagged: Check the wording'),
      ).toBeVisible();

      const refreshedQuestion = page.locator('article').filter({
        has: page.getByRole('heading', { name: practiceQuestion }),
      });

      const correctionForm = refreshedQuestion.locator('form').filter({
        has: page.getByRole('button', { name: 'Save correction' }),
      });

      const correctionField = correctionForm.getByLabel('Correction JSON');

      const correction = {
        explanation: 'Saved synthetic correction for the browser baseline.',
      };

      await correctionField.fill('{invalid json');
      await correctionForm.getByRole('button', { name: 'Save correction' }).click();
      await expect(page.getByRole('alert')).toContainText('Correction must be valid JSON.');
      await expect(page).toHaveURL(
        new RegExp(
          `/review\\?examId=${samplePack.examId}&packId=${samplePack.packId}&packVersion=${samplePack.packVersion}`,
          'u',
        ),
      );

      await correctionField.fill(JSON.stringify(correction));
      await correctionForm.getByRole('button', { name: 'Save correction' }).click();
      await expect(page).toHaveURL(new RegExp(`/review\\?examId=${samplePack.examId}.*`, 'u'));
      await expect(correctionField).toHaveValue(
        /Saved synthetic correction for the browser baseline\./u,
      );
      await page.reload();

      const savedCorrection = page
        .locator('article')
        .filter({ has: page.getByRole('heading', { name: practiceQuestion }) })
        .getByLabel('Correction JSON');

      await expect(savedCorrection).toHaveValue(
        /Saved synthetic correction for the browser baseline\./u,
      );

      const retireForm = page
        .locator('article')
        .filter({ has: page.getByRole('heading', { name: practiceQuestion }) })
        .locator('form')
        .filter({ has: page.getByRole('button', { name: 'Retire from new sessions' }) });

      await retireForm.getByRole('button', { name: 'Retire from new sessions' }).click();
      await expect(page.getByText('Retired for new sessions')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Restore question' })).toBeVisible();
      await page.reload();
      await expect(page.getByText('Retired for new sessions')).toBeVisible();

      const reviewFilters = page.locator('form').filter({
        has: page.getByRole('button', { name: 'Apply filters' }),
      });

      await reviewFilters.getByLabel('Prompt or question ID').fill('delta-transaction-basics');
      await reviewFilters.getByLabel('Domain').selectOption('delta-lake');
      await reviewFilters.getByLabel('Flagged questions').check();
      await reviewFilters.getByLabel('Retired questions').check();
      await reviewFilters.getByRole('button', { name: 'Apply filters' }).click();
      await expect(page).toHaveURL(
        /q=delta-transaction-basics.*domain=delta-lake.*flagged=1.*retired=1/u,
      );
      await expect(page.getByRole('status')).toContainText('Showing 1 of 2 questions');
      await expect(page.getByRole('status')).toContainText('pack v1.0.0');
      await expect(
        page.locator('article').filter({
          has: page.getByRole('heading', { name: practiceQuestion }),
        }),
      ).toBeVisible();

      await page.getByRole('link', { name: 'Clear filters' }).click();
      await expect(page.getByRole('status')).toContainText('Showing 2 of 2 questions');
    });
  });
});
