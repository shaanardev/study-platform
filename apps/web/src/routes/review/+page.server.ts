import { resolve } from '$app/paths';
import { fail, redirect } from '@sveltejs/kit';

import {
  createCorrection,
  FeedbackValidationError,
  flagQuestion,
  readPackForReview,
  retireQuestion,
} from '#lib/server/feedback/service.js';
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

const formString = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
};

const key = (form: FormData) => ({
  examId: formString(form, 'examId'),
  packId: formString(form, 'packId'),
  packVersion: formString(form, 'packVersion'),
  questionId: formString(form, 'questionId'),
});

const selectedUrl = (values: ReturnType<typeof key>) =>
  `${resolve('/review')}?examId=${encodeURIComponent(values.examId)}&packId=${encodeURIComponent(values.packId)}&packVersion=${encodeURIComponent(values.packVersion)}`;

export const actions: Actions = {
  correct: async ({ request }) => {
    const form = await request.formData();
    const values = key(form);
    let correction: unknown;
    try {
      correction = JSON.parse(formString(form, 'correction') || '{}');
    } catch {
      return fail(400, { message: 'Correction must be valid JSON.' });
    }
    if (typeof correction !== 'object' || correction === null || Array.isArray(correction)) {
      return fail(400, { message: 'Correction must be a JSON object.' });
    }
    try {
      createCorrection(databasePath, { ...values, correction });
    } catch (error) {
      if (error instanceof FeedbackValidationError) {
        return fail(400, { message: error.message });
      }
      throw error instanceof Error ? error : new Error('Could not save question correction.');
    }
    return redirect(303, selectedUrl(values));
  },
  flag: async ({ request }) => {
    const form = await request.formData();
    const values = key(form);
    try {
      flagQuestion(databasePath, { ...values, reason: formString(form, 'reason') });
    } catch (error) {
      if (error instanceof FeedbackValidationError) {
        return fail(400, { message: error.message });
      }
      throw error instanceof Error ? error : new Error('Could not save question flag.');
    }
    return redirect(303, selectedUrl(values));
  },
  retire: async ({ request }) => {
    const form = await request.formData();
    const values = key(form);
    try {
      retireQuestion(databasePath, values, form.get('retired') === 'true');
    } catch (error) {
      if (error instanceof FeedbackValidationError) {
        return fail(400, { message: error.message });
      }
      throw error instanceof Error ? error : new Error('Could not update question retirement.');
    }
    return redirect(303, selectedUrl(values));
  },
};
