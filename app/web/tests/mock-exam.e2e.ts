import { expect } from '@playwright/test';

import { articleForQuestion, fixture } from './fixtures/index.js';

fixture.describe('mock exams', () => {
  fixture(
    'saves mock answers and restores scored results',
    async ({ learner, page, samplePack }) => {
      await page.goto('/mock');
      await page.getByLabel('Exam pack version').selectOption(samplePack.choice);
      await page.getByLabel('Requested question count').fill('2');
      await page.getByRole('button', { name: 'Check weighted coverage' }).click();
      await expect(
        page.getByRole('heading', { name: 'Blueprint coverage for 2 questions' }),
      ).toBeVisible();
      await expect(
        page.getByRole('listitem').filter({ hasText: 'Delta Lake foundations' }),
      ).toContainText('1 available / 1 needed');

      await page.getByLabel('Time limit in minutes').fill('5');
      await page.getByRole('button', { name: 'Start timed mock' }).click();
      await expect(page.getByRole('region', { name: 'Mock exam attempt' })).toBeVisible();

      const deltaArticle = articleForQuestion(page, learner.practice.question);
      const pipelineArticle = articleForQuestion(page, learner.mock.question);

      await deltaArticle.getByLabel(learner.practice.correctAnswer).check();
      await deltaArticle.getByRole('button', { name: 'Save answer' }).click();
      await page.reload();
      await expect(deltaArticle.getByLabel(learner.practice.correctAnswer)).toBeChecked();
      await pipelineArticle.getByLabel(learner.mock.firstCorrectAnswer).check();
      await pipelineArticle.getByLabel(learner.mock.secondCorrectAnswer).check();
      await pipelineArticle.getByRole('button', { name: 'Save answer' }).click();
      await expect(page.getByText('2 of 2 answers saved · 0 unanswered')).toBeVisible();

      await page.reload();
      await expect(deltaArticle.getByLabel(learner.practice.correctAnswer)).toBeChecked();
      await page.getByRole('button', { name: 'Submit mock exam' }).click();
      await expect(page.getByRole('heading', { name: 'Mock exam results' })).toBeVisible();
      await expect(page.getByRole('status')).toContainText('2 / 2 correct · 100%');
      await page.reload();
      await expect(page.getByRole('status')).toContainText('2 / 2 correct · 100%');
    },
  );

  fixture(
    'lets learners review unanswered mock questions before final submission',
    async ({ learner, page, samplePack }) => {
      await page.goto('/mock');
      await page.getByLabel('Exam pack version').selectOption(samplePack.choice);
      await page.getByLabel('Requested question count').fill('2');
      await page.getByRole('button', { name: 'Check weighted coverage' }).click();
      await expect(
        page.getByRole('heading', { name: 'Blueprint coverage for 2 questions' }),
      ).toBeVisible();
      await page.getByLabel('Time limit in minutes').fill('5');
      await page.getByRole('button', { name: 'Start timed mock' }).click();
      await expect(page.getByText('0 of 2 answers saved · 2 unanswered')).toBeVisible();

      await page.getByRole('button', { name: 'Submit mock exam' }).click();
      await expect(
        page.getByRole('heading', { name: 'Review unanswered questions' }),
      ).toBeVisible();
      await expect(page.getByText(/2 question\(s\) have no saved answer/u)).toBeVisible();
      await expect(page.getByRole('status', { name: 'Review unanswered questions' })).toContainText(
        /seconds\s+remaining/u,
      );
      const questionLink = page.getByRole('link', { name: 'Review question 2' });
      await questionLink.focus();
      await questionLink.press('Enter');
      await expect(page).toHaveURL(/#mock-question-/u);
      await page.reload();

      const pipelineArticle = articleForQuestion(page, learner.mock.question);

      await pipelineArticle.getByLabel(learner.mock.firstCorrectAnswer).check();
      await pipelineArticle.getByLabel(learner.mock.secondCorrectAnswer).check();
      await pipelineArticle.getByRole('button', { name: 'Save answer' }).click();
      await expect(page.getByText('1 of 2 answers saved · 1 unanswered')).toBeVisible();
      await page.reload();
      await expect(page.getByText('1 of 2 answers saved · 1 unanswered')).toBeVisible();
      await expect(pipelineArticle.getByLabel(learner.mock.firstCorrectAnswer)).toBeChecked();
      await expect(pipelineArticle.getByLabel(learner.mock.secondCorrectAnswer)).toBeChecked();

      await page.getByRole('button', { name: 'Submit mock exam' }).click();
      await expect(
        page.getByRole('heading', { name: 'Review unanswered questions' }),
      ).toBeVisible();
      await expect(page.getByText(/1 question\(s\) have no saved answer/u)).toBeVisible();
      await page.getByRole('button', { name: 'Submit with unanswered questions' }).click();
      await expect(page.getByRole('heading', { name: 'Mock exam results' })).toBeVisible();
      await expect(page.getByRole('status')).toContainText('1 / 2 correct · 50%');
      await expect(page.getByRole('status')).toContainText(/1 unanswered/u);
    },
  );
});
