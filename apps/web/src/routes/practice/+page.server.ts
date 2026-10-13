import { resolve } from '$app/paths';
import { error as httpError, fail, redirect } from '@sveltejs/kit';

import { getFormString } from '#lib/server/form-data.js';
import { getPackIndex } from '#lib/server/packs/importer.js';
import {
  answerQuestion,
  createPracticeSession,
  getPracticeSession,
  getResumablePracticeSession,
} from '#lib/server/quiz/service.js';
import { workspacePath } from '#lib/server/workspace-paths.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  const packs = getPackIndex();
  const sessionId = url.searchParams.get('session');
  const session =
    sessionId === null
      ? getResumablePracticeSession(workspacePath('.local/exam-packs.sqlite'))
      : getPracticeSession(workspacePath('.local/exam-packs.sqlite'), sessionId);
  if (sessionId !== null && session === undefined) {
    httpError(404, 'Practice session not found.');
  }
  return { packs, session };
};

export const actions: Actions = {
  answer: async ({ request }) => {
    const formData = await request.formData();
    const sessionId = getFormString(formData, 'sessionId');
    const questionId = getFormString(formData, 'questionId');
    const answerIds = formData.getAll('answerIds').map(String);
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
    const formData = await request.formData();
    const examId = getFormString(formData, 'examId');
    const packId = getFormString(formData, 'packId');
    const packVersion = getFormString(formData, 'packVersion');
    const questionCount = Number(formData.get('questionCount'));
    const domainIds = formData.getAll('domainIds').map(String);
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
