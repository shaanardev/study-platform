import { resolve } from '$app/paths';
import { error as httpError, fail, isHttpError, redirect } from '@sveltejs/kit';

import {
  DEFAULT_QUESTION_COUNT,
  MAX_MOCK_DURATION_MINUTES,
  MAX_QUESTION_COUNT,
} from '#lib/quiz/constants.js';
import { getFormString } from '#lib/server/form-data.js';
import { HTTP_BAD_REQUEST, HTTP_NOT_FOUND, HTTP_STATUS_REDIRECT } from '#lib/server/http-status.js';
import {
  createMockAttempt,
  getMockAttempt,
  getMockCatalog,
  getMockCoverage,
  getResumableMockAttempt,
  saveMockAnswer,
  submitMockAttempt,
} from '#lib/server/quiz/mock-service.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const attemptId = url.searchParams.get('attempt');

  const attempt =
    attemptId === null ? await getResumableMockAttempt() : await getMockAttempt(attemptId);

  if (attemptId !== null && attempt === undefined) {
    httpError(HTTP_NOT_FOUND, 'Mock attempt not found.');
  }

  const questionCount = Number(url.searchParams.get('count') ?? String(DEFAULT_QUESTION_COUNT));
  const { coverages, packs } = await getMockCatalog(questionCount);

  return {
    attempt,
    coverages,
    packs,
    questionCount: Number.isInteger(questionCount) ? questionCount : DEFAULT_QUESTION_COUNT,
    selectedPackKey: url.searchParams.get('packChoice') ?? '',
  };
};

export const actions: Actions = {
  answer: async ({ request }) => {
    const formData = await request.formData();
    const attemptId = getFormString(formData, 'attemptId');

    try {
      await saveMockAnswer(
        attemptId,
        getFormString(formData, 'questionId'),
        formData.getAll('answerIds').map(String),
      );
    } catch (error) {
      if (isHttpError(error, HTTP_BAD_REQUEST)) {
        return fail(HTTP_BAD_REQUEST, {
          gaps: [],
          message: 'Select a valid answer before saving.',
        });
      }

      throw error;
    }

    return redirect(
      HTTP_STATUS_REDIRECT,
      `${resolve('/mock')}?attempt=${encodeURIComponent(attemptId)}`,
    );
  },
  start: async ({ request }) => {
    const formData = await request.formData();
    const examId = getFormString(formData, 'examId');
    const packId = getFormString(formData, 'packId');
    const packVersion = getFormString(formData, 'packVersion');
    const questionCount = Number(formData.get('questionCount'));
    const durationMinutes = Number(formData.get('durationMinutes'));

    if (
      !Number.isInteger(questionCount) ||
      questionCount < 1 ||
      questionCount > MAX_QUESTION_COUNT
    ) {
      return fail(HTTP_BAD_REQUEST, {
        gaps: [],
        message: `Mock question count must be between 1 and ${MAX_QUESTION_COUNT}.`,
      });
    }

    if (
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes > MAX_MOCK_DURATION_MINUTES
    ) {
      return fail(HTTP_BAD_REQUEST, {
        gaps: [],
        message: `Duration must be between 1 and ${MAX_MOCK_DURATION_MINUTES} minutes.`,
      });
    }

    try {
      const attempt = await createMockAttempt({
        durationMinutes,
        examId,
        packId,
        packVersion,
        questionCount,
      });

      return redirect(
        HTTP_STATUS_REDIRECT,
        `${resolve('/mock')}?attempt=${encodeURIComponent(attempt.id)}`,
      );
    } catch (error) {
      if (isHttpError(error, HTTP_BAD_REQUEST)) {
        const coverage = await getMockCoverage(examId, packId, packVersion, questionCount);

        return fail(HTTP_BAD_REQUEST, {
          gaps: coverage.gaps,
          message: 'This pack does not have enough questions for the requested weighted mock.',
        });
      }

      throw error;
    }
  },
  submit: async ({ request }) => {
    const formData = await request.formData();
    const attemptId = getFormString(formData, 'attemptId');
    await submitMockAttempt(attemptId);

    return redirect(
      HTTP_STATUS_REDIRECT,
      `${resolve('/mock')}?attempt=${encodeURIComponent(attemptId)}`,
    );
  },
};
