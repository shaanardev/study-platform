import { error, fail, redirect } from '@sveltejs/kit';
import { getPackIndex } from '#lib/server/packs/importer.js';
import {
  answerQuestion,
  createPracticeSession,
  getPracticeSession,
  getResumablePracticeSession,
} from '#lib/server/quiz/service.js';
import { resolve } from '$app/paths';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  const packs = getPackIndex();
  const sessionId = url.searchParams.get('session');
  const session = sessionId
    ? getPracticeSession('.local/exam-packs.sqlite', sessionId)
    : getResumablePracticeSession('.local/exam-packs.sqlite');
  if (sessionId && !session) error(404, 'Practice session not found.');
  return { packs, session };
};

export const actions: Actions = {
  start: async ({ request }) => {
    const form = await request.formData();
    const examId = String(form.get('examId') ?? '');
    const packId = String(form.get('packId') ?? '');
    const packVersion = String(form.get('packVersion') ?? '');
    const questionCount = Number(form.get('questionCount'));
    const domainIds = form.getAll('domainIds').map(String);
    const session = createPracticeSession({
      examId,
      packId,
      packVersion,
      questionCount,
      domainIds,
    });
    redirect(303, `${resolve('/practice')}?session=${encodeURIComponent(session.id)}`);
  },
  answer: async ({ request }) => {
    const form = await request.formData();
    const sessionId = String(form.get('sessionId') ?? '');
    const questionId = String(form.get('questionId') ?? '');
    const answerIds = form.getAll('answerIds').map(String);
    try {
      answerQuestion('.local/exam-packs.sqlite', sessionId, questionId, answerIds);
    } catch (cause) {
      if (
        typeof cause === 'object' &&
        cause !== null &&
        'status' in cause &&
        cause.status === 400
      ) {
        return fail(400, { message: 'Select a valid answer before continuing.' });
      }
      throw cause;
    }
    redirect(303, `${resolve('/practice')}?session=${encodeURIComponent(sessionId)}`);
  },
};
