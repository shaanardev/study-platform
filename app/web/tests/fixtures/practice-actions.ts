import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

import { articleForQuestion } from './index.js';
import type { LearnerScenario } from './workflow.js';

export type PracticePrompt = LearnerScenario['practice']['question'];

export const currentPracticePrompt = async (
  page: Page,
  learner: LearnerScenario,
): Promise<PracticePrompt> => {
  const singleChoiceHeading = page.getByRole('heading', { name: learner.practice.question });
  const multipleChoiceHeading = page.getByRole('heading', { name: learner.mock.question });

  await expect(singleChoiceHeading.or(multipleChoiceHeading)).toBeVisible();

  return (await singleChoiceHeading.isVisible())
    ? learner.practice.question
    : learner.mock.question;
};

export const otherPracticePrompt = (
  prompt: PracticePrompt,
  learner: LearnerScenario,
): PracticePrompt =>
  prompt === learner.practice.question ? learner.mock.question : learner.practice.question;

export const answerPracticeQuestion = async (
  page: Page,
  prompt: PracticePrompt,
  firstAnswer: string,
  secondAnswer?: string,
): Promise<void> => {
  const question = articleForQuestion(page, prompt);

  await question.getByLabel(firstAnswer).check();

  if (secondAnswer !== undefined) {
    await question.getByLabel(secondAnswer).check();
  }

  await question.getByRole('button', { name: 'Submit answer' }).click();
};

export const answerCorrectPracticeQuestion = async (
  page: Page,
  learner: LearnerScenario,
  prompt: PracticePrompt,
): Promise<void> => {
  await (prompt === learner.practice.question
    ? answerPracticeQuestion(page, prompt, learner.practice.correctAnswer)
    : answerPracticeQuestion(
        page,
        prompt,
        learner.mock.firstCorrectAnswer,
        learner.mock.secondCorrectAnswer,
      ));
};

export const answerMissedPracticeQuestion = async (
  page: Page,
  learner: LearnerScenario,
  prompt: PracticePrompt,
): Promise<void> => {
  const wrongAnswer =
    prompt === learner.practice.question ? learner.practice.wrongAnswer : learner.mock.wrongAnswer;

  await answerPracticeQuestion(page, prompt, wrongAnswer);
};

export const saveMockMissedAnswer = async (
  page: Page,
  learner: LearnerScenario,
  prompt: PracticePrompt,
): Promise<void> => {
  const wrongAnswer =
    prompt === learner.practice.question ? learner.practice.wrongAnswer : learner.mock.wrongAnswer;

  const question = articleForQuestion(page, prompt);

  await question.getByLabel(wrongAnswer).check();
  await question.getByRole('button', { name: 'Save answer' }).click();
};
