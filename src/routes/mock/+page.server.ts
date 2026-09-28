import { error, fail, redirect } from '@sveltejs/kit';
import { getPackIndex } from '#lib/server/packs/importer.js';
import {
  createMockAttempt,
  getMockAttempt,
  getMockCoverage,
  getResumableMockAttempt,
  saveMockAnswer,
  submitMockAttempt,
} from '#lib/server/quiz/mock-service.js';
import { resolve } from '$app/paths';
import type { Actions, PageServerLoad } from './$types';

const databasePath = '.local/exam-packs.sqlite';

export const load: PageServerLoad = ({ url }) => {
  const packs = getPackIndex();
  const attemptId = url.searchParams.get('attempt');
  const attempt = attemptId
    ? getMockAttempt(databasePath, attemptId)
    : getResumableMockAttempt(databasePath);
  if (attemptId && !attempt) error(404, 'Mock attempt not found.');
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
    packs,
    attempt,
    questionCount: Number.isInteger(questionCount) ? questionCount : 10,
    selectedPackKey: url.searchParams.get('packChoice') ?? '',
    coverages,
  };
};

export const actions: Actions = {
  start: async ({ request }) => {
    const form = await request.formData();
    const examId = String(form.get('examId') ?? '');
    const packId = String(form.get('packId') ?? '');
    const packVersion = String(form.get('packVersion') ?? '');
    const questionCount = Number(form.get('questionCount'));
    const durationMinutes = Number(form.get('durationMinutes'));
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 100)
      return fail(400, { message: 'Mock question count must be between 1 and 100.', gaps: [] });
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 600)
      return fail(400, { message: 'Duration must be between 1 and 600 minutes.', gaps: [] });
    try {
      const attempt = createMockAttempt({
        databasePath,
        examId,
        packId,
        packVersion,
        questionCount,
        durationMinutes,
      });
      redirect(303, `${resolve('/mock')}?attempt=${encodeURIComponent(attempt.id)}`);
    } catch (cause) {
      if (
        typeof cause === 'object' &&
        cause !== null &&
        'status' in cause &&
        cause.status === 400
      ) {
        const coverage = getMockCoverage(databasePath, examId, packId, packVersion, questionCount);
        return fail(400, {
          message: 'This pack does not have enough questions for the requested weighted mock.',
          gaps: coverage.gaps,
        });
      }
      throw cause;
    }
  },
  answer: async ({ request }) => {
    const form = await request.formData();
    const attemptId = String(form.get('attemptId') ?? '');
    try {
      saveMockAnswer(
        databasePath,
        attemptId,
        String(form.get('questionId') ?? ''),
        form.getAll('answerIds').map(String),
      );
    } catch (cause) {
      if (typeof cause === 'object' && cause !== null && 'status' in cause && cause.status === 400)
        return fail(400, { message: 'Select a valid answer before saving.', gaps: [] });
      throw cause;
    }
    redirect(303, `${resolve('/mock')}?attempt=${encodeURIComponent(attemptId)}`);
  },
  submit: async ({ request }) => {
    const form = await request.formData();
    const attemptId = String(form.get('attemptId') ?? '');
    submitMockAttempt(databasePath, attemptId);
    redirect(303, `${resolve('/mock')}?attempt=${encodeURIComponent(attemptId)}`);
  },
};
