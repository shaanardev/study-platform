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

test('records the current library, quiz, progress, and review journeys', async ({ page }) => {
  await test.step('library read and pack import', async () => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/u);
    await expect(page.getByRole('heading', { name: 'Exam pack library' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No imported packs yet' })).toBeVisible();

    await page.getByRole('button', { name: 'Import or refresh local citations' }).click();
    await expect(page.getByRole('status')).toContainText(/Imported \d+ pack version\(s\)\./u);
    await expect(page.getByText('Synthetic foundations sample')).toBeVisible();

    await page.reload();
    await expect(page.getByText('Synthetic foundations sample')).toBeVisible();
    await expect(page.getByText('2 questions · 2 domains')).toBeVisible();
  });

  await test.step('practice read, start redirect, answer redirect, and saved result', async () => {
    await page.goto('/practice');
    await expect(page).toHaveURL(/\/practice$/u);
    await expect(page.getByRole('heading', { name: 'Start a practice quiz' })).toBeVisible();
    await page
      .getByLabel('Exam pack version')
      .selectOption(`${samplePack.examId}|${samplePack.packId}|${samplePack.packVersion}`);
    await page.getByLabel('Delta Lake foundations').check();
    await page.getByLabel('Number of questions').fill('1');
    await page.getByRole('button', { name: 'Start quiz' }).click();
    await expect(page).toHaveURL(/\/practice\?session=[^&]+$/u);
    await expect(page.getByRole('heading', { name: practiceQuestion })).toBeVisible();

    await page.getByLabel(practiceWrongAnswer).check();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page).toHaveURL(/\/practice\?session=[^&]+$/u);
    const answerFeedback = page.getByRole('status').filter({ hasText: 'Not quite' });
    await expect(answerFeedback).toContainText('Not quite');
    await expect(answerFeedback).toContainText(practiceCorrectAnswer);

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
        `/review\\?examId=${samplePack.examId}&packId=${samplePack.packId}&packVersion=${samplePack.packVersion}&/correct$`,
        'u',
      ),
    );

    await correctionField.fill(JSON.stringify(correction));
    await correctionForm.getByRole('button', { name: 'Save correction' }).click();
    await expect(page).toHaveURL(new RegExp(`/review\\?examId=${samplePack.examId}.*`, 'u'));
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
  });
});
