import { resolve } from '$app/paths';
import { error as kitError, fail, redirect } from '@sveltejs/kit';

import { getPackIndex } from '#lib/server/packs/importer.js';
import {
  createMockAttempt,
  getMockAttempt,
  getMockCoverage,
  getResumableMockAttempt,
  saveMockAnswer,
  submitMockAttempt,
} from '#lib/server/quiz/mock-service.js';
import { workspacePath } from '#lib/server/workspace-paths.js';

import type { Actions, PageServerLoad } from './$types';

const databasePath = workspacePath('.local/exam-packs.sqlite');

const formString = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
};

export const load: PageServerLoad = ({ url }) => {
  const packs = getPackIndex();
  const attemptId = url.searchParams.get('attempt');
  const attempt =
    attemptId === null
      ? getResumableMockAttempt(databasePath)
      : getMockAttempt(databasePath, attemptId);
  if (attemptId !== null && attempt === undefined) {
    kitError(404, 'Mock attempt not found.');
  }
  const questionCount = Number(url.searchParams.get('count') ?? '10');
  const coverages: Record<string, ReturnType<typeof getMockCoverage> | undefined> = {};
  for (const pack of packs) {
    const key = `${pack.examId}|${pack.packId}|${pack.packVersion}`;
    try {
      coverages[key] = getMockCoverage(
        databasePath,
        pack.examId,
        pack.packId,
        pack.packVersion,
        questionCount,
      );
    } catch {
      coverages[key] = undefined;
    }
  }
  return {
    attempt,
    coverages,
    packs,
    questionCount: Number.isInteger(questionCount) ? questionCount : 10,
    selectedPackKey: url.searchParams.get('packChoice') ?? '',
  };
};

export const actions: Actions = {
  answer: async ({ request }) => {
    const form = await request.formData();
    const attemptId = formString(form, 'attemptId');
    try {
      saveMockAnswer(
        databasePath,
        attemptId,
        formString(form, 'questionId'),
        form.getAll('answerIds').map(String),
      );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        error.status === 400
      ) {
        return fail(400, { gaps: [], message: 'Select a valid answer before saving.' });
      }
      throw error;
    }
    return redirect(303, `${resolve('/mock')}?attempt=${encodeURIComponent(attemptId)}`);
  },
  start: async ({ request }) => {
    const form = await request.formData();
    const examId = formString(form, 'examId');
    const packId = formString(form, 'packId');
    const packVersion = formString(form, 'packVersion');
    const questionCount = Number(form.get('questionCount'));
    const durationMinutes = Number(form.get('durationMinutes'));
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 100) {
      return fail(400, { gaps: [], message: 'Mock question count must be between 1 and 100.' });
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 600) {
      return fail(400, { gaps: [], message: 'Duration must be between 1 and 600 minutes.' });
    }
    try {
      const attempt = createMockAttempt({
        databasePath,
        durationMinutes,
        examId,
        packId,
        packVersion,
        questionCount,
      });
      return redirect(303, `${resolve('/mock')}?attempt=${encodeURIComponent(attempt.id)}`);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        error.status === 400
      ) {
        const coverage = getMockCoverage(databasePath, examId, packId, packVersion, questionCount);
        return fail(400, {
          gaps: coverage.gaps,
          message: 'This pack does not have enough questions for the requested weighted mock.',
        });
      }
      throw error;
    }
  },
  submit: async ({ request }) => {
    const form = await request.formData();
    const attemptId = formString(form, 'attemptId');
    submitMockAttempt(databasePath, attemptId);
    return redirect(303, `${resolve('/mock')}?attempt=${encodeURIComponent(attemptId)}`);
  },
};
