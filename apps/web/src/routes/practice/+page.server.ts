import { resolve } from '$app/paths';
import { error as kitError, fail, redirect } from '@sveltejs/kit';

import { getPackIndex } from '#lib/server/packs/importer.js';
import {
  answerQuestion,
  createPracticeSession,
  getPracticeSession,
  getResumablePracticeSession,
} from '#lib/server/quiz/service.js';
import { workspacePath } from '#lib/server/workspace-paths.js';

import type { Actions, PageServerLoad } from './$types';

const formString = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
};

export const load: PageServerLoad = ({ url }) => {
  const packs = getPackIndex();
  const sessionId = url.searchParams.get('session');
  const session =
    sessionId === null
      ? getResumablePracticeSession(workspacePath('.local/exam-packs.sqlite'))
      : getPracticeSession(workspacePath('.local/exam-packs.sqlite'), sessionId);
  if (sessionId !== null && session === undefined) {
    kitError(404, 'Practice session not found.');
  }
  return { packs, session };
};

export const actions: Actions = {
  answer: async ({ request }) => {
    const form = await request.formData();
    const sessionId = formString(form, 'sessionId');
    const questionId = formString(form, 'questionId');
    const answerIds = form.getAll('answerIds').map(String);
    try {
      answerQuestion(workspacePath('.local/exam-packs.sqlite'), sessionId, questionId, answerIds);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        error.status === 400
      ) {
        return fail(400, { message: 'Select a valid answer before continuing.' });
      }
      throw error;
    }
    return redirect(303, `${resolve('/practice')}?session=${encodeURIComponent(sessionId)}`);
  },
  start: async ({ request }) => {
    const form = await request.formData();
    const examId = formString(form, 'examId');
    const packId = formString(form, 'packId');
    const packVersion = formString(form, 'packVersion');
    const questionCount = Number(form.get('questionCount'));
    const domainIds = form.getAll('domainIds').map(String);
    const session = createPracticeSession({
      domainIds,
      examId,
      packId,
      packVersion,
      questionCount,
    });
    return redirect(303, `${resolve('/practice')}?session=${encodeURIComponent(session.id)}`);
  },
};
