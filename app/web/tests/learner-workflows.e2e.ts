import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { validateExamPack } from '@learning-platform/exam-pack';
import type { Page } from '@playwright/test';
import Database from 'better-sqlite3';
import * as Schema from 'effect/Schema';

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

const inlineCodeExample = {
  literalHtml: '<img src=x onerror=alert(1)>',
  token: 'schemaLocation',
};

const pipelineQuestion = 'Which two practices can help make a data pipeline easier to operate?';

const pipelineFirstCorrectAnswer = 'Validate data quality expectations';
const pipelineSecondCorrectAnswer = 'Track pipeline failures and execution status';
const primaryNavigationLinkCount = 5;

const reviewUrl = `/review?${new URLSearchParams(samplePack).toString()}`;
const inlineCodePackPath = '../../packs/incoming/databricks-dea-may-2026-v1.2.2.json';

const getE2eBaseUrl = (): string => {
  const baseURL = process.env['E2E_BASE_URL'];

  if (baseURL === undefined || baseURL === '') {
    throw new Error('The Playwright global setup did not provide E2E_BASE_URL.');
  }

  return baseURL;
};

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
    alternatePack.pack.title = 'Z Alternative foundations sample';
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
    firstQuestion.explanation = `Set \`${inlineCodeExample.token}\` and display \`${inlineCodeExample.literalHtml}\` as literal text.`;
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

const seedInlineCodePack = (): void => {
  const databasePath = process.env['DB_PATH'];

  if (databasePath === undefined || databasePath === '') {
    throw new Error('The Playwright global setup did not provide DB_PATH.');
  }

  const validation = validateExamPack(JSON.parse(readFileSync(inlineCodePackPath, 'utf-8')));

  if (!validation.valid) {
    throw new Error(validation.errors.join('\n'));
  }

  const database = new Database(databasePath);

  try {
    const { pack } = validation;

    database
      .prepare(
        'INSERT INTO imported_packs (exam_id, pack_id, pack_version, content, approved_source_root, imported_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        pack.exam.id,
        pack.pack.id,
        pack.pack.version,
        JSON.stringify(pack),
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

const resumePracticeQuiz = async (page: Page): Promise<void> => {
  await page.goto('/practice');
  await page.getByRole('link', { name: 'Resume quiz' }).click();
  await expect(page).toHaveURL(/\/practice\?session=[^&]+$/u);
  await expect(page.getByRole('heading', { name: practiceQuestion })).toBeVisible();
};

const expectPackSwitchUpdatesDomains = async (page: Page): Promise<void> => {
  await expect(page.getByRole('main')).toHaveAttribute('data-client-ready', 'true');
  await page
    .getByLabel('Exam pack version')
    .selectOption(`${samplePack.examId}|${samplePack.packId}|${samplePack.packVersion}`);
  await expect(page.getByRole('group', { name: /Domains/u })).toContainText(
    'Delta Lake foundations',
  );
  await page.getByLabel('Number of questions').fill('2');
  await page.getByLabel('Delta Lake foundations').check();
  await expect(page.getByLabel('Number of questions')).toHaveAttribute('max', '1');
  await expect(page.getByLabel('Number of questions')).toHaveValue('1');
  await expect(page.getByText('1 eligible question', { exact: true })).toBeVisible();
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
  await expect(page.getByLabel('Number of questions')).toHaveValue('1');
};

const expectPracticeAnswerContinuity = async (page: Page, documentTime: number): Promise<void> => {
  await expect(page.getByText('1 / 1 answered')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quiz complete' })).toBeVisible();

  const answerFeedback = page.getByRole('status').filter({ hasText: 'Not quite' });

  await expect(answerFeedback).toContainText('Not quite');
  await expect(answerFeedback).toContainText(practiceCorrectAnswer);
  await expect(answerFeedback).toBeFocused();
  await expect
    .poll(async () => await page.evaluate(() => performance.timeOrigin))
    .toBe(documentTime);
};

const expectRecommendedDomainStartsFocusedPractice = async (page: Page): Promise<void> => {
  const recommendation = page.getByRole('region', { name: 'What to study next' });

  await expect(recommendation).toContainText('0%');
  await recommendation.getByRole('button', { name: 'Practice Delta Lake foundations' }).click();
  await expect(page).toHaveURL(/\/practice\?session=[^&]+$/u);
  await expect(page.getByRole('heading', { name: practiceQuestion })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('synthetic-foundations v1.0.0');
  await page.goto('/progress');
};

const expectRetiredDomainDisablesPracticeSetup = async (page: Page): Promise<void> => {
  await page.goto('/practice');
  await expect(page.getByRole('main')).toHaveAttribute('data-client-ready', 'true');
  await page
    .getByLabel('Exam pack version')
    .selectOption(`${samplePack.examId}|${samplePack.packId}|${samplePack.packVersion}`);
  await page.getByLabel('Delta Lake foundations').check();
  await expect(page.getByText('0 eligible questions', { exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText(
    'No questions are eligible for this pack and domain selection.',
  );
  await expect(page.getByRole('button', { name: 'Start quiz' })).toBeDisabled();
};

const expectMissedQuestionNavigation = async (page: Page, sessionUrl: string): Promise<void> => {
  await page.reload();
  await expect(page.getByRole('heading', { name: practiceQuestion })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/progress$/u);
  await page.goForward();
  await expect(page).toHaveURL(sessionUrl);
  await expect(page.getByRole('heading', { name: practiceQuestion })).toBeVisible();
};

const expectRetiredQuestionCannotBePracticedAgain = async (
  page: Page,
  sessionUrl: string,
): Promise<void> => {
  await page.goto('/progress');
  await page.getByRole('button', { name: 'Practice Delta Lake foundations' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'No questions are available in this domain for this pack version.',
  );
  await page.goto(sessionUrl);
  await page.getByLabel(practiceWrongAnswer).check();
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.getByRole('heading', { name: 'Quiz complete' })).toBeVisible();
  await page.goto('/progress');
  await page.getByRole('button', { name: 'Practice this question again' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'This question is no longer available in this pack version.',
  );
};

const expectSourceCitation = async (page: Page): Promise<void> => {
  await expect(
    page.getByRole('link', { name: 'Synthetic study notes, section 1' }),
  ).toHaveAttribute('href', /\/practice\/source\?/u);
};

const expectReviewFiltersPreserveContext = async (page: Page): Promise<void> => {
  const reviewFilters = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Apply filters' }),
  });

  await reviewFilters.getByLabel('Prompt or question ID').fill('delta-transaction-basics');
  await reviewFilters.getByLabel('Domain').selectOption('delta-lake');
  await reviewFilters.getByLabel('Flagged questions').check();
  await reviewFilters.getByLabel('Retired questions').check();
  await reviewFilters.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/q=delta-transaction-basics.*domain=delta-lake.*flagged=&retired=/u);
  await expect(page.getByRole('status')).toContainText('Showing 1 of 2 questions');
  await expect(page.getByRole('status')).toContainText('pack v1.0.0');
  await expect(
    page.getByRole('article').filter({
      has: page.getByRole('heading', { name: practiceQuestion }),
    }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Clear filters' }).click();
  await expect(page.getByRole('status')).toContainText('Showing 2 of 2 questions');
};

const expectPrimaryNavigation = async (page: Page): Promise<void> => {
  const expectDestination = async (label: string, routePath: string): Promise<void> => {
    await page.goto(routePath);
    const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
    const currentLink = navigation.getByRole('link', { name: label });

    await expect(navigation).toHaveCount(1);
    await expect(navigation.getByRole('link')).toHaveCount(primaryNavigationLinkCount);
    await expect(currentLink).toHaveAttribute('aria-current', 'page');
  };

  await expectDestination('Exam packs', '/');
  await expectDestination('Practice', '/practice');
  await expectDestination('Mock', '/mock');
  await expectDestination('Progress', '/progress');
  await expectDestination('Review', '/review');

  await page.goto('/');
  await page.getByRole('link', { exact: true, name: 'Practice' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/practice$/u);
};

const expectNoHorizontalOverflow = async (page: Page): Promise<void> => {
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );

  expect(fits).toBe(true);
};

const absoluteCitationFixtureParts = () => {
  const pack = sampleLearningPackFixture();
  const [question] = pack.questions;
  const [source] = question?.sources ?? [];

  if (question === undefined || source === undefined) {
    throw new Error('The sample fixture needs a question with a citation.');
  }

  return { pack, question, source };
};

const requiredE2eDatabasePath = (): string => {
  const databasePath = process.env['DB_PATH'];

  if (databasePath === undefined || databasePath === '') {
    throw new Error('The Playwright global setup did not provide DB_PATH.');
  }

  return databasePath;
};

const SavedExcerptSchema = Schema.Struct({ excerpt: Schema.String });

const reviewAndSubmitMockWithUnansweredQuestions = async (page: Page): Promise<void> => {
  await expect(page.getByText('1 of 2 answers saved · 1 unanswered')).toBeVisible();
  await page.reload();
  await expect(page.getByText('1 of 2 answers saved · 1 unanswered')).toBeVisible();

  const pipelineArticle = page.locator('article').filter({
    has: page.getByRole('heading', { name: pipelineQuestion }),
  });

  const firstAnswerSaved = await pipelineArticle.getByLabel(pipelineFirstCorrectAnswer).isChecked();

  const secondAnswerSaved = await pipelineArticle
    .getByLabel(pipelineSecondCorrectAnswer)
    .isChecked();

  expect([firstAnswerSaved, secondAnswerSaved]).toStrictEqual([true, true]);

  await page.getByRole('button', { name: 'Submit mock exam' }).click();
  await expect(page.getByRole('heading', { name: 'Review unanswered questions' })).toBeVisible();
  await expect(page.getByText(/1 question\(s\) have no saved answer/u)).toBeVisible();
  await expect(page.getByRole('status', { name: 'Review unanswered questions' })).toContainText(
    /seconds\s+remaining/u,
  );
  await expect(page.getByRole('link', { name: 'Review question 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Submit with unanswered questions' }).click();
  await expect(page).toHaveURL(/\/mock\?attempt=[^&]+$/u);
  await expect(page.getByRole('heading', { name: 'Mock exam results' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('1 / 2 correct · 50%');
  await expect(page.getByRole('status')).toContainText(/1 of 2 questions answered/u);
  await expect(page.getByRole('status')).toContainText(/1 unanswered/u);
  await expect(page.getByRole('status')).toContainText(/Submitted before the 5-minute deadline/u);
};

test.describe('learner workflows', () => {
  // These linked flows share persisted state, so keep them in one ordered test.

  test('imports a pack, completes practice and a mock exam, tracks progress, and updates question feedback', async ({
    page,
  }) => {
    let selectedMissedSessionUrl = '';

    await test.step('library read and pack import', async () => {
      await page.goto('/');
      await expect(page).toHaveURL(/\/$/u);
      await expect(page.getByRole('heading', { name: 'Exam pack library' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'No imported packs yet' })).toBeVisible();
      await expect(page.getByText('packs/incoming/sample-learning-pack.json')).toBeVisible();
      await expectEmptyStudyViews(page);
      await expectPrimaryNavigation(page);

      await page.goto('/');

      await page.getByRole('button', { name: 'Import packs' }).click();
      await expect(page.getByRole('status')).toContainText(/Imported \d+ pack version\(s\)\./u);
      await expect(page.getByText('Synthetic foundations sample')).toBeVisible();

      await page.getByRole('button', { name: 'Import packs' }).click();
      await expect(page.getByRole('status')).toContainText(
        'No new pack versions were imported. The incoming versions are already in the catalog',
      );
      await expect(page.getByRole('status')).toContainText('choose Practice to use one');

      await page.reload();
      await expect(page.getByText('Synthetic foundations sample')).toBeVisible();
      await expect(page.getByText('2 questions · 2 domains')).toBeVisible();

      seedAlternatePackVersion();
    });

    await test.step('practice read, start redirect, answer redirect, and saved result', async () => {
      await page.goto('/practice');
      await expect(page).toHaveURL(/\/practice$/u);
      await expect(page.getByRole('heading', { name: 'Start a practice quiz' })).toBeVisible();
      await expectPackSwitchUpdatesDomains(page);
      await page.getByLabel('Delta Lake foundations').check();
      await page.getByLabel('Number of questions').fill('1');
      await page.getByRole('button', { name: 'Start quiz' }).click();
      await expect(page).toHaveURL(/\/practice\?session=[^&]+$/u);
      await expect(page.getByRole('heading', { name: practiceQuestion })).toBeVisible();

      await resumePracticeQuiz(page);

      await page.getByLabel(practiceWrongAnswer).check();
      const documentTime = await page.evaluate(() => performance.timeOrigin);
      await page.getByRole('button', { name: 'Submit answer' }).click();
      await expect(page).toHaveURL(/\/practice\?session=[^&]+$/u);
      await expectPracticeAnswerContinuity(page, documentTime);

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
      await expect(page.getByText('0 of 2 answers saved · 2 unanswered')).toBeVisible();
      const questionIndexLink = page.getByRole('link', { name: 'Question 2, unanswered' });
      await questionIndexLink.focus();
      await questionIndexLink.press('Enter');
      await expect(page).toHaveURL(/#mock-question-/u);
      await page.getByRole('button', { name: 'Submit mock exam' }).click();
      await expect(
        page.getByRole('heading', { name: 'Review unanswered questions' }),
      ).toBeVisible();
      await expect(page.getByText(/2 question\(s\) have no saved answer/u)).toBeVisible();
      await expect(page.getByRole('status', { name: 'Review unanswered questions' })).toContainText(
        /seconds\s+remaining/u,
      );
      await page.getByRole('link', { name: 'Review question 2' }).click();

      const pipelineArticle = page.locator('article').filter({
        has: page.getByRole('heading', { name: pipelineQuestion }),
      });

      await pipelineArticle.getByLabel(pipelineFirstCorrectAnswer).check();
      await pipelineArticle.getByLabel(pipelineSecondCorrectAnswer).check();

      await pipelineArticle.getByRole('button', { name: 'Save answer' }).click();
      await expect(page.getByText('1 of 2 answers saved · 1 unanswered')).toBeVisible();
      await reviewAndSubmitMockWithUnansweredQuestions(page);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Mock exam results' })).toBeVisible();
      await expect(page.getByRole('status')).toContainText('1 / 2 correct · 50%');
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
      await expectRecommendedDomainStartsFocusedPractice(page);

      await page.getByLabel(practiceQuestion).check();
      await page.getByRole('button', { name: 'Practice selected missed questions' }).click();
      await expect(page).toHaveURL(/\/practice\?session=[^&]+$/u);
      await expect(page.getByRole('heading', { name: practiceQuestion })).toBeVisible();
      selectedMissedSessionUrl = page.url();
      await expectMissedQuestionNavigation(page, selectedMissedSessionUrl);
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
      await expect(page).toHaveURL(
        /\/review\?examId=sample-engineer-exam&packId=synthetic-foundations&packVersion=1\.0\.0&reviewAction=flagged.*#question-delta-transaction-basics$/u,
      );
      await expect(page.getByText('Question flag saved.', { exact: true })).toBeVisible();
      await expect(question.getByRole('list', { name: 'Existing flags' })).toContainText(
        'Flagged: Check the wording',
      );

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
        /\/review\?examId=sample-engineer-exam&packId=synthetic-foundations&packVersion=1\.0\.0&reviewAction=flagged.*#question-/u,
      );

      await correctionField.fill(JSON.stringify(correction));
      await correctionForm.getByRole('button', { name: 'Save correction' }).click();
      await expect(page).toHaveURL(
        /\/review\?examId=sample-engineer-exam&packId=synthetic-foundations&packVersion=1\.0\.0&reviewAction=corrected.*#question-/u,
      );
      await expect(page.getByText('Correction saved.', { exact: true })).toBeVisible();
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
      await expectRetiredDomainDisablesPracticeSetup(page);
      await expectRetiredQuestionCannotBePracticedAgain(page, selectedMissedSessionUrl);

      await expectReviewFiltersPreserveContext(page);
    });

    await expect(page.getByRole('status')).toContainText('Showing 2 of 2 questions');
  });

  test('practice answer submission works without JavaScript', async ({ browser }) => {
    const noJavaScriptContext = await browser.newContext({ javaScriptEnabled: false });
    const noJavaScriptPage = await noJavaScriptContext.newPage();

    try {
      await noJavaScriptPage.goto('/practice');
      await noJavaScriptPage.getByLabel('Number of questions').fill('1');
      await noJavaScriptPage.getByRole('button', { name: 'Start quiz' }).click();
      await expect(noJavaScriptPage).toHaveURL(/\/practice\?session=[^&]+$/u);

      const submitAnswer = noJavaScriptPage.getByRole('button', { name: 'Submit answer' });

      await submitAnswer.focus();
      await noJavaScriptPage.keyboard.press('Shift+Tab');
      await noJavaScriptPage.keyboard.press('Space');
      await submitAnswer.click();
      await expect(noJavaScriptPage.getByText('1 / 1 answered')).toBeVisible();
      await expect(noJavaScriptPage.getByRole('heading', { name: 'Quiz complete' })).toBeVisible();
      await expect(
        noJavaScriptPage.getByRole('heading', { name: /Correct|Not quite/u }),
      ).toBeVisible();

      await noJavaScriptPage.reload();
      await expect(noJavaScriptPage.getByRole('heading', { name: 'Quiz complete' })).toBeVisible();
    } finally {
      await noJavaScriptContext.close();
    }

    expect(noJavaScriptContext.pages()).toHaveLength(0);
  });

  test('applies the shared Skeleton controls and theme on populated routes', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Import packs' }).click();
    await expect(page.getByText('Synthetic foundations sample')).toBeVisible();
    await expect(page.getByLabel('Local folder for importing cited files')).toHaveClass(
      /\binput\b/u,
    );
    await expect(
      page.getByLabel(
        'I approve reading cited files beneath this folder to import and save excerpts.',
      ),
    ).toHaveClass(/\bcheckbox\b/u);

    await page.goto('/practice');
    await expect(page.getByRole('main')).toHaveAttribute('data-client-ready', 'true');
    await page
      .getByLabel('Exam pack version')
      .selectOption(`${samplePack.examId}|${samplePack.packId}|${samplePack.packVersion}`);
    await expect(page.getByLabel('Exam pack version')).toHaveValue(
      `${samplePack.examId}|${samplePack.packId}|${samplePack.packVersion}`,
    );
    await expect(page.getByLabel('Exam pack version')).toHaveClass(/\bselect\b/u);
    await expect(page.getByLabel('Number of questions')).toHaveClass(/\binput\b/u);
    await expect(page.getByLabel('Delta Lake foundations')).toHaveClass(/\bcheckbox\b/u);
    await page.getByLabel('Delta Lake foundations').check();
    await page.getByLabel('Number of questions').fill('1');
    await page.getByRole('button', { name: 'Start quiz' }).click();
    await expect(page.getByRole('heading', { name: practiceQuestion })).toBeVisible();
    await page.getByLabel(practiceWrongAnswer).check();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    const answerFeedback = page.getByRole('status').filter({ hasText: 'Not quite' });
    await expect(answerFeedback).toContainText('Not quite');

    const alternatePackChoice = `${samplePack.examId}|synthetic-alternate|2.0.0`;

    await page.goto(
      `/mock?${new URLSearchParams({ count: '2', packChoice: alternatePackChoice }).toString()}`,
    );
    await expect(page.getByLabel('Exam pack version')).toHaveClass(/\bselect\b/u);
    await expect(page.getByLabel('Requested question count')).toHaveClass(/\binput\b/u);
    await page.getByLabel('Time limit in minutes').fill('5');
    await page.getByRole('button', { name: 'Start timed mock' }).click();

    const deltaArticle = page.getByRole('article').filter({
      has: page.getByRole('heading', { name: practiceQuestion }),
    });

    const pipelineArticle = page.getByRole('article').filter({
      has: page.getByRole('heading', { name: pipelineQuestion }),
    });

    await expect(deltaArticle.getByLabel(practiceCorrectAnswer)).toHaveClass(/\bradio\b/u);
    await expect(pipelineArticle.getByLabel(pipelineFirstCorrectAnswer)).toHaveClass(
      /\bcheckbox\b/u,
    );

    await page.goto('/progress');
    await expect(page.getByLabel(practiceQuestion)).toHaveClass(/\bcheckbox\b/u);

    await page.goto(reviewUrl);
    await expect(page.getByLabel('Exam pack version')).toHaveClass(/\bselect\b/u);

    const reviewedQuestion = page.getByRole('article').filter({
      has: page.getByRole('heading', { name: practiceQuestion }),
    });

    await expect(reviewedQuestion.getByLabel('Flag this question')).toHaveClass(/\binput\b/u);
    await expect(reviewedQuestion.getByLabel('Correction JSON')).toHaveClass(/\btextarea\b/u);

    const alternateReviewUrl = `/review?${new URLSearchParams({
      ...samplePack,
      packId: 'synthetic-alternate',
      packVersion: '2.0.0',
    }).toString()}`;

    await page.goto(alternateReviewUrl);

    const inlineCodeQuestion = page.getByRole('article').filter({
      has: page.getByRole('heading', { name: practiceQuestion }),
    });

    await expect(
      inlineCodeQuestion.getByText(
        `Set ${inlineCodeExample.token} and display ${inlineCodeExample.literalHtml} as literal text.`,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(inlineCodeQuestion.getByRole('code')).toHaveText([
      inlineCodeExample.token,
      inlineCodeExample.literalHtml,
    ]);

    await page.setViewportSize({ height: 800, width: 320 });
    await page.goto('/');
    await expectNoHorizontalOverflow(page);
    await page.goto('/practice');
    await expectNoHorizontalOverflow(page);
    await page.goto('/mock');
    await expectNoHorizontalOverflow(page);
    await page.goto('/progress');
    await expectNoHorizontalOverflow(page);
    await page.goto(reviewUrl);
    await expectNoHorizontalOverflow(page);
    await expect(page).toHaveURL(new RegExp(`/review\\?examId=${samplePack.examId}`, 'u'));
  });

  test('imports a new absolute-citation pack only through explicit approval', async ({ page }) => {
    const approvedRoot = await mkdtemp(path.join(tmpdir(), 'approved-pack-import-'));
    const incomingFolder = path.resolve(import.meta.dirname, '../../../packs/incoming');
    const fileName = 'ui-absolute-citation-sample.json';
    const packFile = path.join(incomingFolder, fileName);
    const notePath = path.join(approvedRoot, 'approved-notes.md');
    const excerpt = 'First-import citation excerpt.';
    const { pack, question, source } = absoluteCitationFixtureParts();

    pack.pack.id = 'ui-absolute-citation-sample';
    pack.pack.title = 'Absolute citation UI sample';
    pack.pack.version = '1.0.0';
    source.path = pathToFileURL(notePath).href;

    try {
      await writeFile(notePath, excerpt, 'utf-8');
      await writeFile(packFile, JSON.stringify(pack), 'utf-8');

      await page.goto('/');
      await page.getByRole('button', { name: 'Import packs' }).click();
      await expect(page.getByRole('status')).toContainText('Pack import failed.');
      await expect(page.getByText(pack.pack.title)).toHaveCount(0);

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
      await expect(page.getByText(pack.pack.title)).toBeVisible();

      const database = new Database(requiredE2eDatabasePath());

      try {
        const savedAsset = database
          .prepare(
            'SELECT excerpt FROM saved_source_assets WHERE exam_id = ? AND pack_id = ? AND pack_version = ? AND question_id = ?',
          )
          .get(pack.exam.id, pack.pack.id, pack.pack.version, question.id);

        expect(Schema.decodeUnknownSync(SavedExcerptSchema)(savedAsset).excerpt).toBe(excerpt);
      } finally {
        database.close();
      }
    } finally {
      await rm(packFile, { force: true });
      await rm(approvedRoot, { force: true, recursive: true });
    }

    await expect(page.getByText(pack.pack.title)).toBeVisible();
  });

  test('review actions preserve filtered question state without JavaScript', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: getE2eBaseUrl(),
      javaScriptEnabled: false,
    });

    const page = await context.newPage();

    const query = new URLSearchParams({
      ...samplePack,
      domain: 'delta-lake',
      flagged: '1',
      q: 'delta-transaction-basics',
      retired: '1',
    });

    const question = page.getByRole('article').filter({
      has: page.getByRole('heading', { name: practiceQuestion }),
    });

    await page.goto(`/review?${query.toString()}`);
    await expect(question.getByRole('button', { name: 'Restore question' })).toBeVisible();

    const retirementForm = question.locator('form').filter({
      has: page.getByRole('button', { name: 'Restore question' }),
    });

    const restoreButton = retirementForm.getByRole('button', { name: 'Restore question' });

    await restoreButton.focus();
    await expect(restoreButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(
      /\/review\?examId=sample-engineer-exam&packId=synthetic-foundations&packVersion=1\.0\.0&q=delta-transaction-basics&domain=delta-lake&flagged=&retired=&reviewAction=restored.*#question-delta-transaction-basics$/u,
    );
    await expect(question.getByText('Question restored for new sessions.')).toBeVisible();
    await expect(
      page.getByText('The question you just updated is also shown outside these filters.'),
    ).toBeVisible();

    const flagForm = question.locator('form').filter({
      has: page.getByRole('button', { name: 'Save flag' }),
    });

    const reasonField = flagForm.getByLabel('Flag this question');

    await reasonField.fill('  ');
    await flagForm.getByRole('button', { name: 'Save flag' }).click();
    await expect(flagForm.getByRole('alert')).toContainText('A flag reason is required.');
    await expect(reasonField).toHaveValue('  ');
    await expect(page).toHaveURL(
      /\/review\?.*retired=&reviewAction=restored.*#question-delta-transaction-basics$/u,
    );
    await expect(question).toBeVisible();

    await context.close();
    expect(page.isClosed()).toBe(true);
  });

  test('review renders technical terms from pack version 1.2.2 as inline code', async ({
    page,
  }) => {
    seedInlineCodePack();

    const packChoice = 'databricks-data-engineer-associate|databricks-dea-may-2026-reviewed|1.2.2';

    await page.goto(
      `/review?${new URLSearchParams({ packChoice, q: 'schemaLocation' }).toString()}`,
    );

    const schemaQuestion = page.getByRole('article').filter({
      has: page.getByRole('heading', { name: /cloudFiles\.schemaLocation/u }),
    });

    await expect(page.getByRole('status')).toContainText('pack v1.2.2');
    await expect(
      schemaQuestion.getByRole('heading').getByText('cloudFiles.schemaLocation', { exact: true }),
    ).toHaveJSProperty('tagName', 'CODE');
    await expect(schemaQuestion.getByText('checkpointLocation', { exact: true })).toHaveJSProperty(
      'tagName',
      'CODE',
    );

    await page.goto(
      `/review?${new URLSearchParams({ packChoice, q: 'dea26-ingestion-auto-rescue' }).toString()}`,
    );

    const optionQuestion = page.getByRole('article').filter({
      has: page.getByRole('heading', { name: /Unexpected JSON fields/u }),
    });

    await expect(
      optionQuestion.getByText('cloudFiles.schemaEvolutionMode="rescue"', { exact: true }),
    ).toHaveJSProperty('tagName', 'CODE');
  });
});
