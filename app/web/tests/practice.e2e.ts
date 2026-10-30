import { expect } from '@playwright/test';

import { fixture } from './fixtures/index.js';
import {
  answerCorrectPracticeQuestion,
  currentPracticePrompt,
  otherPracticePrompt,
} from './fixtures/practice-actions.js';

fixture.describe('practice', () => {
  fixture(
    'updates practice domains and limits when the selected pack changes',
    async ({ alternatePack, practiceSetupPage: page, samplePack }) => {
      await page.getByLabel('Exam pack version').selectOption(samplePack.choice);
      await expect(page.getByRole('group', { name: /Domains/u })).toContainText(
        'Delta Lake foundations',
      );

      await page.getByLabel('Number of questions').fill('2');
      await page.getByLabel('Delta Lake foundations').check();
      await expect(page.getByLabel('Number of questions')).toHaveAttribute('max', '1');
      await expect(page.getByLabel('Number of questions')).toHaveValue('1');

      await page.getByLabel('Exam pack version').selectOption(alternatePack.choice);
      await expect(page.getByRole('group', { name: /Domains/u })).toContainText(
        'Transaction foundations',
      );
      await expect(page.getByRole('group', { name: /Domains/u })).not.toContainText(
        'Delta Lake foundations',
      );

      await page.getByLabel('Exam pack version').selectOption(samplePack.choice);
      await expect(page.getByLabel('Delta Lake foundations')).not.toBeChecked();
      await expect(page.getByLabel('Number of questions')).toHaveAttribute('max', '2');
    },
  );

  fixture(
    'resumes a practice quiz and saves answer feedback without a full-page reload',
    async ({ learner, practiceSetupPage: page, samplePack }) => {
      await page.getByLabel('Exam pack version').selectOption(samplePack.choice);
      await page.getByLabel('Delta Lake foundations').check();
      await page.getByLabel('Number of questions').fill('1');
      await page.getByRole('button', { name: 'Start quiz' }).click();
      await expect(page).toHaveURL(/\/practice\?session=[^&]+$/u);
      await expect(page.getByRole('heading', { name: learner.practice.question })).toBeVisible();

      await page.goto('/practice');
      await expect(page.getByRole('main')).toHaveAttribute('data-client-ready', 'true');
      await page.getByRole('link', { name: 'Resume quiz' }).click();
      await expect(page.getByRole('main')).toHaveAttribute('data-client-ready', 'true');
      await page.getByLabel(learner.practice.wrongAnswer).check();
      const documentTime = await page.evaluate(() => performance.timeOrigin);
      await page.getByRole('button', { name: 'Submit answer' }).click();

      const feedback = page.getByRole('status').filter({ hasText: 'Not quite' });

      await expect(feedback).toContainText('Not quite');
      await expect(feedback).toContainText(learner.practice.correctAnswer);
      await expect(feedback).toBeFocused();
      await expect
        .poll(async () => await page.evaluate(() => performance.timeOrigin))
        .toBe(documentTime);
      await expect(
        page.getByRole('link', { name: 'Synthetic study notes, section 1' }),
      ).toHaveAttribute('href', /\/practice\/source\?/u);

      await page.reload();
      await expect(page.getByRole('heading', { name: 'Quiz complete' })).toBeVisible();
      await expect(page.getByText('You answered 0 of 1 correctly.')).toBeVisible();
    },
  );

  fixture(
    'moves from a single-choice answer to a scored multiple-choice question',
    async ({ learner, practiceSetupPage: page, samplePack }) => {
      await page.getByLabel('Exam pack version').selectOption(samplePack.choice);
      await page.getByLabel('Number of questions').fill('2');
      await page.getByRole('button', { name: 'Start quiz' }).click();
      await expect(page).toHaveURL(/\/practice\?session=/u);
      await expect(page.getByRole('main')).toHaveAttribute('data-client-ready', 'true');

      const firstPrompt = await currentPracticePrompt(page, learner);
      const secondPrompt = otherPracticePrompt(firstPrompt, learner);

      await answerCorrectPracticeQuestion(page, learner, firstPrompt);
      await expect(page.getByRole('heading', { name: secondPrompt })).toBeVisible();
      await answerCorrectPracticeQuestion(page, learner, secondPrompt);

      await expect(page.getByRole('heading', { name: 'Quiz complete' })).toBeVisible();
      await expect(
        page
          .getByRole('status')
          .filter({ has: page.getByRole('heading', { name: 'Quiz complete' }) }),
      ).toContainText('You answered 2 of 2 correctly.');
    },
  );

  fixture(
    'opens the saved excerpt for a citation path containing special characters',
    async ({ citationPack, learner, page }) => {
      await page.goto('/practice');
      await expect(page.getByRole('main')).toHaveAttribute('data-client-ready', 'true');
      await page.getByLabel('Exam pack version').selectOption(citationPack.choice);
      await page.getByLabel('Delta Lake foundations').check();
      await page.getByLabel('Number of questions').fill('1');
      await page.getByRole('button', { name: 'Start quiz' }).click();
      await expect(page).toHaveURL(/\/practice\?session=/u);
      await expect(page.getByRole('main')).toHaveAttribute('data-client-ready', 'true');
      await expect(page.getByRole('heading', { name: learner.practice.question })).toBeVisible();
      await page.getByLabel(learner.practice.wrongAnswer).check();
      await page.getByRole('button', { name: 'Submit answer' }).click();

      const [sourcePage] = await Promise.all([
        page.waitForEvent('popup'),
        page.getByRole('link', { name: learner.citation.label }).click(),
      ]);

      await expect(
        sourcePage.getByText(`${learner.citation.label}\n\n${learner.citation.excerpt}`, {
          exact: true,
        }),
      ).toBeVisible();
    },
  );

  fixture(
    'supports keyboard answer submission with JavaScript disabled',
    async ({ learner, noJavaScriptPage, samplePack }) => {
      await noJavaScriptPage.goto('/practice');
      await noJavaScriptPage.getByLabel('Exam pack version').selectOption(samplePack.choice);
      await noJavaScriptPage.getByLabel('Delta Lake foundations').check();
      await noJavaScriptPage.getByLabel('Number of questions').fill('1');
      await noJavaScriptPage.getByRole('button', { name: 'Start quiz' }).click();
      await expect(noJavaScriptPage).toHaveURL(/\/practice\?session=[^&]+$/u);
      const sessionUrl = noJavaScriptPage.url();

      await noJavaScriptPage.getByLabel(learner.practice.wrongAnswer).focus();
      await noJavaScriptPage.keyboard.press('Space');
      await expect(noJavaScriptPage.getByLabel(learner.practice.wrongAnswer)).toBeChecked();
      const submitAnswer = noJavaScriptPage.getByRole('button', { name: 'Submit answer' });
      await submitAnswer.focus();
      await noJavaScriptPage.keyboard.press('Enter');
      await expect(noJavaScriptPage.getByText('1 / 1 answered')).toBeVisible();
      await expect(noJavaScriptPage.getByRole('heading', { name: 'Quiz complete' })).toBeVisible();
      await noJavaScriptPage.goto(sessionUrl);
      await expect(noJavaScriptPage.getByRole('heading', { name: 'Quiz complete' })).toBeVisible();
    },
  );
});
