import { resolve } from '$app/paths';
import { error as httpError, fail, isHttpError, redirect } from '@sveltejs/kit';

import { getFormString } from '#lib/server/form-data.js';
import { HTTP_BAD_REQUEST, HTTP_NOT_FOUND, HTTP_STATUS_REDIRECT } from '#lib/server/http-status.js';
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
    httpError(HTTP_NOT_FOUND, 'Practice session not found.');
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
      if (isHttpError(error, HTTP_BAD_REQUEST)) {
        return fail(HTTP_BAD_REQUEST, {
          message: 'Select a valid answer before continuing.',
        });
      }

      throw error;
    }

    return redirect(
      HTTP_STATUS_REDIRECT,
      `${resolve('/practice')}?session=${encodeURIComponent(sessionId)}`,
    );
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

    return redirect(
      HTTP_STATUS_REDIRECT,
      `${resolve('/practice')}?session=${encodeURIComponent(session.id)}`,
    );
  },
};
