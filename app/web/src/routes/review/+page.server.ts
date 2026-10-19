import { resolve } from '$app/paths';
import { fail, redirect } from '@sveltejs/kit';

import {
  createCorrection,
  FeedbackValidationError,
  flagQuestion,
  readPackForReview,
  retireQuestion,
} from '#lib/server/feedback/service.js';
import { getFormString } from '#lib/server/form-data.js';
import { HTTP_BAD_REQUEST, HTTP_STATUS_REDIRECT } from '#lib/server/http-status.js';
import { decodeJsonText, isJsonObject } from '#lib/server/json.js';
import { getPackIndex } from '#lib/server/packs/importer.js';
import { workspacePath } from '#lib/server/workspace-paths.js';

import type { Actions, PageServerLoad } from './$types';

const databasePath = workspacePath('.local/exam-packs.sqlite');

export const load: PageServerLoad = ({ url }) => {
  const packs = getPackIndex(databasePath);

  const selected =
    packs.find(
      (pack) =>
        pack.examId === url.searchParams.get('examId') &&
        pack.packId === url.searchParams.get('packId') &&
        pack.packVersion === url.searchParams.get('packVersion'),
    ) ?? packs[0];

  if (!selected) {
    return { feedback: [], pack: undefined, packs };
  }

  const { pack, feedback } = readPackForReview(
    databasePath,
    selected.examId,
    selected.packId,
    selected.packVersion,
  );

  return { feedback, pack, packs };
};

const getReviewTarget = (formData: FormData) => ({
  examId: getFormString(formData, 'examId'),
  packId: getFormString(formData, 'packId'),
  packVersion: getFormString(formData, 'packVersion'),
  questionId: getFormString(formData, 'questionId'),
});

const selectedUrl = (reviewTarget: ReturnType<typeof getReviewTarget>) =>
  `${resolve('/review')}?examId=${encodeURIComponent(reviewTarget.examId)}&packId=${encodeURIComponent(reviewTarget.packId)}&packVersion=${encodeURIComponent(reviewTarget.packVersion)}`;

export const actions: Actions = {
  correct: async ({ request }) => {
    const formData = await request.formData();
    const reviewTarget = getReviewTarget(formData);
    let correction;

    try {
      correction = decodeJsonText(getFormString(formData, 'correction') || '{}');
    } catch {
      return fail(HTTP_BAD_REQUEST, { message: 'Correction must be valid JSON.' });
    }

    if (!isJsonObject(correction)) {
      return fail(HTTP_BAD_REQUEST, { message: 'Correction must be a JSON object.' });
    }

    try {
      createCorrection(databasePath, { ...reviewTarget, correction });
    } catch (error) {
      if (error instanceof FeedbackValidationError) {
        return fail(HTTP_BAD_REQUEST, { message: error.message });
      }

      throw error instanceof Error ? error : new Error('Could not save question correction.');
    }

    return redirect(HTTP_STATUS_REDIRECT, selectedUrl(reviewTarget));
  },
  flag: async ({ request }) => {
    const formData = await request.formData();
    const reviewTarget = getReviewTarget(formData);

    try {
      flagQuestion(databasePath, { ...reviewTarget, reason: getFormString(formData, 'reason') });
    } catch (error) {
      if (error instanceof FeedbackValidationError) {
        return fail(HTTP_BAD_REQUEST, { message: error.message });
      }

      throw error instanceof Error ? error : new Error('Could not save question flag.');
    }

    return redirect(HTTP_STATUS_REDIRECT, selectedUrl(reviewTarget));
  },
  retire: async ({ request }) => {
    const formData = await request.formData();
    const reviewTarget = getReviewTarget(formData);

    try {
      retireQuestion(databasePath, reviewTarget, formData.get('retired') === 'true');
    } catch (error) {
      if (error instanceof FeedbackValidationError) {
        return fail(HTTP_BAD_REQUEST, { message: error.message });
      }

      throw error instanceof Error ? error : new Error('Could not update question retirement.');
    }

    return redirect(HTTP_STATUS_REDIRECT, selectedUrl(reviewTarget));
  },
};
