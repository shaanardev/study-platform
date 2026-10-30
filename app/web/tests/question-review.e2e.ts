import { expect } from '@playwright/test';

import { reviewActionPath, reviewPackSelectionPath } from '../src/lib/route-urls.js';
import { articleForQuestion, fixture } from './fixtures/index.js';

fixture.describe('question review', () => {
  fixture(
    'saves question flags and corrections and restores them after reload',
    async ({ learner, newerSamplePack, page, samplePack }) => {
      await page.goto(reviewPackSelectionPath(samplePack));
      await expect(
        page.getByRole('heading', { name: 'Improve your imported questions' }),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Synthetic study notes, section 1' }),
      ).toHaveAttribute('href', /\/practice\/source\?/u);

      const question = articleForQuestion(page, learner.practice.question);

      const flagForm = question.locator('form').filter({
        has: page.getByRole('button', { name: 'Save flag' }),
      });

      await flagForm.getByLabel('Flag this question').fill('Check the wording');
      await flagForm.getByRole('button', { name: 'Save flag' }).click();
      await expect(page.getByText('Question flag saved.', { exact: true })).toBeVisible();
      await expect(question.getByRole('list', { name: 'Existing flags' })).toContainText(
        'Flagged: Check the wording',
      );

      const correctionForm = articleForQuestion(page, learner.practice.question)
        .locator('form')
        .filter({ has: page.getByRole('button', { name: 'Save correction' }) });

      const correctionField = correctionForm.getByLabel('Correction JSON');

      await correctionField.fill('{invalid json');
      await correctionForm.getByRole('button', { name: 'Save correction' }).click();
      await expect(page.getByRole('alert')).toContainText('Correction must be valid JSON.');
      await correctionField.fill(JSON.stringify({ explanation: 'Saved synthetic correction.' }));
      await correctionForm.getByRole('button', { name: 'Save correction' }).click();
      await expect(page.getByText('Correction saved.', { exact: true })).toBeVisible();
      await page.reload();
      const savedQuestion = articleForQuestion(page, learner.practice.question);
      await expect(savedQuestion.getByLabel('Correction JSON')).toHaveValue(
        /Saved synthetic correction\./u,
      );
      await expect(savedQuestion.getByRole('list', { name: 'Existing flags' })).toContainText(
        'Flagged: Check the wording',
      );

      const otherQuestion = articleForQuestion(page, learner.mock.question);

      await expect(otherQuestion.getByLabel('Correction JSON')).not.toHaveValue(
        /Saved synthetic correction\./u,
      );
      await expect(otherQuestion.getByText('Flagged: Check the wording')).toHaveCount(0);

      await page.goto(reviewPackSelectionPath(newerSamplePack));
      const newerVersionQuestion = articleForQuestion(page, learner.practice.question);

      await expect(newerVersionQuestion.getByLabel('Correction JSON')).not.toHaveValue(
        /Saved synthetic correction\./u,
      );
      await expect(newerVersionQuestion.getByText('Flagged: Check the wording')).toHaveCount(0);
    },
  );

  fixture(
    'retirement blocks new practice while preserving an existing session',
    async ({ learner, practiceSetupPage: page, samplePack }) => {
      await page.getByLabel('Exam pack version').selectOption(samplePack.choice);
      await page.getByLabel('Delta Lake foundations').check();
      await page.getByLabel('Number of questions').fill('1');
      await page.getByRole('button', { name: 'Start quiz' }).click();
      await page.getByLabel(learner.practice.wrongAnswer).check();
      await page.getByRole('button', { name: 'Submit answer' }).click();
      await expect(page.getByRole('heading', { name: 'Quiz complete' })).toBeVisible();

      await page.goto('/practice');
      await expect(page.getByRole('main')).toHaveAttribute('data-client-ready', 'true');
      await page.getByLabel('Exam pack version').selectOption(samplePack.choice);
      await page.getByLabel('Delta Lake foundations').check();
      await page.getByLabel('Number of questions').fill('1');
      await page.getByRole('button', { name: 'Start quiz' }).click();
      await expect(page).toHaveURL(/\/practice\?session=[^&]+$/u);
      const sessionUrl = page.url();

      await page.goto(reviewPackSelectionPath(samplePack));
      const question = articleForQuestion(page, learner.practice.question);
      await question.getByRole('button', { name: 'Retire from new sessions' }).click();
      await expect(question.getByText('Retired for new sessions')).toBeVisible();

      await page.goto('/practice');
      await expect(page.getByRole('main')).toHaveAttribute('data-client-ready', 'true');
      await page.getByLabel('Exam pack version').selectOption(samplePack.choice);
      await page.getByLabel('Delta Lake foundations').check();
      await expect(page.getByText('0 eligible questions', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start quiz' })).toBeDisabled();

      await page.goto(sessionUrl);
      await expect(page.getByRole('main')).toHaveAttribute('data-client-ready', 'true');
      await page.getByLabel(learner.practice.wrongAnswer).check();
      await page.getByRole('button', { name: 'Submit answer' }).click();
      await expect(page.getByRole('heading', { name: 'Quiz complete' })).toBeVisible();
      await page.goto('/progress');
      await page.getByRole('button', { name: 'Practice this question again' }).click();
      await expect(page.getByRole('alert')).toContainText(
        'This question is no longer available in this pack version.',
      );
    },
  );

  fixture(
    'preserves filtered review actions without JavaScript',
    async ({ learner, noJavaScriptPage, reviewedQuestion, samplePack }) => {
      const filters = {
        domainId: 'delta-lake',
        flagged: true,
        retired: true,
        search: reviewedQuestion.questionId,
      };

      const restoredUrl = reviewActionPath(
        samplePack,
        filters,
        'restored',
        reviewedQuestion.questionId,
      );

      await noJavaScriptPage.goto(reviewPackSelectionPath(samplePack, filters));
      const question = articleForQuestion(noJavaScriptPage, learner.practice.question);
      const restoreButton = question.getByRole('button', { name: 'Restore question' });

      await expect(restoreButton).toBeVisible();
      await restoreButton.focus();
      await expect(restoreButton).toBeFocused();
      await noJavaScriptPage.keyboard.press('Enter');
      await expect(noJavaScriptPage).toHaveURL(restoredUrl);
      await expect(question.getByText('Question restored for new sessions.')).toBeVisible();
      await expect(
        noJavaScriptPage.getByText(
          'The question you just updated is also shown outside these filters.',
        ),
      ).toBeVisible();

      const flagForm = question.locator('form').filter({
        has: noJavaScriptPage.getByRole('button', { name: 'Save flag' }),
      });

      const reason = flagForm.getByLabel('Flag this question');

      await reason.fill('  ');
      await flagForm.getByRole('button', { name: 'Save flag' }).click();
      await expect(flagForm.getByRole('alert')).toContainText('A flag reason is required.');
      await expect(reason).toHaveValue('  ');
      const currentUrl = new URL(noJavaScriptPage.url());

      expect({
        hash: currentUrl.hash,
        pathname: currentUrl.pathname,
        query: {
          domain: currentUrl.searchParams.get('domain'),
          examId: currentUrl.searchParams.get('examId'),
          flagged: currentUrl.searchParams.get('flagged'),
          packId: currentUrl.searchParams.get('packId'),
          packVersion: currentUrl.searchParams.get('packVersion'),
          q: currentUrl.searchParams.get('q'),
          retired: currentUrl.searchParams.get('retired'),
          reviewAction: currentUrl.searchParams.get('reviewAction'),
        },
      }).toStrictEqual({
        hash: `#question-${reviewedQuestion.questionId}`,
        pathname: '/review',
        query: {
          domain: 'delta-lake',
          examId: samplePack.examId,
          flagged: '',
          packId: samplePack.packId,
          packVersion: samplePack.packVersion,
          q: reviewedQuestion.questionId,
          retired: '',
          reviewAction: 'restored',
        },
      });
      await expect(question).toBeVisible();
    },
  );

  fixture(
    'renders technical terms from pack version 1.2.2 as inline code',
    async ({ alternatePack, inlineCodePack, learner, page }) => {
      await page.goto(reviewPackSelectionPath(inlineCodePack, { search: 'schemaLocation' }));

      const schemaQuestion = page.getByRole('article').filter({
        has: page.getByRole('heading', { name: /cloudFiles\.schemaLocation/u }),
      });

      await expect(page.getByRole('status')).toContainText('pack v1.2.2');
      await expect(
        schemaQuestion.getByRole('heading').getByText('cloudFiles.schemaLocation', { exact: true }),
      ).toHaveJSProperty('tagName', 'CODE');
      await expect(
        schemaQuestion.getByText('checkpointLocation', { exact: true }),
      ).toHaveJSProperty('tagName', 'CODE');

      await page.goto(
        reviewPackSelectionPath(inlineCodePack, { search: 'dea26-ingestion-auto-rescue' }),
      );

      const optionQuestion = page.getByRole('article').filter({
        has: page.getByRole('heading', { name: /Unexpected JSON fields/u }),
      });

      await expect(
        optionQuestion.getByText('cloudFiles.schemaEvolutionMode="rescue"', { exact: true }),
      ).toHaveJSProperty('tagName', 'CODE');

      await page.goto(reviewPackSelectionPath(alternatePack));
      const literalExplanation = articleForQuestion(page, learner.practice.question);
      await expect(
        literalExplanation.getByText(
          `Set ${learner.inlineCode.token} and display ${learner.inlineCode.literalHtml} as literal text.`,
          { exact: true },
        ),
      ).toBeVisible();
      await expect(literalExplanation.getByRole('code')).toHaveText([
        learner.inlineCode.token,
        learner.inlineCode.literalHtml,
      ]);
    },
  );
});
