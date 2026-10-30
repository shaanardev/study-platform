import { expect } from '@playwright/test';

import { fixture } from './fixtures/index.js';
import {
  answerMissedPracticeQuestion,
  currentPracticePrompt,
  otherPracticePrompt,
  saveMockMissedAnswer,
} from './fixtures/practice-actions.js';

fixture.describe('progress', () => {
  fixture(
    'recommends focused practice and restores selected missed-question navigation',
    async ({ learner, practiceSetupPage: page, samplePack }) => {
      await page.getByLabel('Exam pack version').selectOption(samplePack.choice);
      await page.getByLabel('Delta Lake foundations').check();
      await page.getByLabel('Number of questions').fill('1');
      await page.getByRole('button', { name: 'Start quiz' }).click();
      await page.getByLabel(learner.practice.wrongAnswer).check();
      await page.getByRole('button', { name: 'Submit answer' }).click();

      await page.goto('/progress');
      await expect(
        page.getByRole('heading', { name: 'Recent practice and mock results' }),
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Missed questions' })).toBeVisible();

      const recommendation = page.getByRole('region', { name: 'What to study next' });

      await expect(recommendation).toContainText('0%');
      await recommendation.getByRole('button', { name: 'Practice Delta Lake foundations' }).click();
      await expect(page).toHaveURL(/\/practice\?session=[^&]+$/u);
      await expect(page.getByRole('heading', { name: learner.practice.question })).toBeVisible();
      await expect(page.getByRole('main')).toContainText('synthetic-foundations v1.0.0');

      await page.goto('/progress');
      await page.getByLabel(learner.practice.question).check();
      await page.getByRole('button', { name: 'Practice selected missed questions' }).click();
      await expect(page).toHaveURL(/\/practice\?session=[^&]+$/u);
      const selectedSession = page.url();
      await page.reload();
      await expect(page.getByRole('heading', { name: learner.practice.question })).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(/\/progress$/u);
      await page.goForward();
      await expect(page).toHaveURL(selectedSession);
      await expect(page.getByRole('heading', { name: learner.practice.question })).toBeVisible();
    },
  );

  fixture(
    'keeps mixed results version-scoped and starts practice from multiple misses',
    async ({ learner, newerSamplePack, page, samplePack }) => {
      await page.goto('/practice');
      await expect(page.getByRole('main')).toHaveAttribute('data-client-ready', 'true');
      await page.getByLabel('Exam pack version').selectOption(samplePack.choice);
      await expect(page.getByLabel('Exam pack version')).toHaveValue(samplePack.choice);
      await page.getByLabel('Number of questions').fill('2');
      await page.getByRole('button', { name: 'Start quiz' }).click();

      const firstPracticePrompt = await currentPracticePrompt(page, learner);
      const secondPracticePrompt = otherPracticePrompt(firstPracticePrompt, learner);

      await answerMissedPracticeQuestion(page, learner, firstPracticePrompt);
      await expect(page.getByRole('heading', { name: secondPracticePrompt })).toBeVisible();
      await answerMissedPracticeQuestion(page, learner, secondPracticePrompt);

      await page.goto('/mock');
      await page.getByLabel('Exam pack version').selectOption(newerSamplePack.choice);
      await page.getByLabel('Requested question count').fill('2');
      await page.getByRole('button', { name: 'Check weighted coverage' }).click();
      await page.getByLabel('Time limit in minutes').fill('5');
      await page.getByRole('button', { name: 'Start timed mock' }).click();

      await saveMockMissedAnswer(page, learner, learner.practice.question);
      await saveMockMissedAnswer(page, learner, learner.mock.question);

      await page.getByRole('button', { name: 'Submit mock exam' }).click();
      await expect(page.getByRole('status')).toContainText('0 / 2 correct · 0%');
      await page.goto('/progress');

      const history = page.getByRole('region', { name: 'Recent practice and mock results' });

      await expect(
        history.getByRole('listitem').filter({ hasText: 'Practice quiz' }),
      ).toContainText('pack 1.0.0');
      await expect(
        history.getByRole('listitem').filter({ hasText: 'Timed mock exam' }),
      ).toContainText('pack 2.0.0');

      const originalVersionMisses = page.getByRole('group', { name: /pack 1\.0\.0/u });

      await originalVersionMisses.getByLabel(learner.practice.question).check();
      await originalVersionMisses.getByLabel(learner.mock.question).check();
      await page.getByRole('button', { name: 'Practice selected missed questions' }).click();
      await expect(page.getByRole('main')).toContainText('0 / 2 answered');

      const firstSelectedPrompt = await currentPracticePrompt(page, learner);
      const secondSelectedPrompt = otherPracticePrompt(firstSelectedPrompt, learner);

      await answerMissedPracticeQuestion(page, learner, firstSelectedPrompt);
      await expect(page.getByRole('heading', { name: secondSelectedPrompt })).toBeVisible();
    },
  );
});
