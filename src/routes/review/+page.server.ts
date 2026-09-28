import { fail, redirect } from '@sveltejs/kit';
import {
  createCorrection,
  FeedbackValidationError,
  flagQuestion,
  readPackForReview,
  retireQuestion,
} from '#lib/server/feedback/service.js';
import { getPackIndex } from '#lib/server/packs/importer.js';
import { resolve } from '$app/paths';
import type { Actions, PageServerLoad } from './$types';

const databasePath = '.local/exam-packs.sqlite';

export const load: PageServerLoad = ({ url }) => {
  const packs = getPackIndex(databasePath);
  const selected =
    packs.find(
      (pack) =>
        pack.examId === url.searchParams.get('examId') &&
        pack.packId === url.searchParams.get('packId') &&
        pack.packVersion === url.searchParams.get('packVersion'),
    ) ?? packs[0];
  if (!selected) return { packs, pack: undefined, feedback: [] };
  const { pack, feedback } = readPackForReview(
    databasePath,
    selected.examId,
    selected.packId,
    selected.packVersion,
  );
  return { packs, pack, feedback };
};

function key(form: FormData) {
  return {
    examId: String(form.get('examId') ?? ''),
    packId: String(form.get('packId') ?? ''),
    packVersion: String(form.get('packVersion') ?? ''),
    questionId: String(form.get('questionId') ?? ''),
  };
}

function selectedUrl(values: ReturnType<typeof key>) {
  return `${resolve('/review')}?examId=${encodeURIComponent(values.examId)}&packId=${encodeURIComponent(values.packId)}&packVersion=${encodeURIComponent(values.packVersion)}`;
}

export const actions: Actions = {
  flag: async ({ request }) => {
    const form = await request.formData();
    const values = key(form);
    try {
      flagQuestion(databasePath, { ...values, reason: String(form.get('reason') ?? '') });
    } catch (cause) {
      if (cause instanceof FeedbackValidationError) return fail(400, { message: cause.message });
      throw cause instanceof Error ? cause : new Error('Could not save question flag.');
    }
    redirect(303, selectedUrl(values));
  },
  correct: async ({ request }) => {
    const form = await request.formData();
    const values = key(form);
    let correction: unknown;
    try {
      correction = JSON.parse(String(form.get('correction') ?? '{}'));
    } catch {
      return fail(400, { message: 'Correction must be valid JSON.' });
    }
    if (!correction || typeof correction !== 'object' || Array.isArray(correction))
      return fail(400, { message: 'Correction must be a JSON object.' });
    try {
      createCorrection(databasePath, { ...values, correction });
    } catch (cause) {
      if (cause instanceof FeedbackValidationError) return fail(400, { message: cause.message });
      throw cause instanceof Error ? cause : new Error('Could not save question correction.');
    }
    redirect(303, selectedUrl(values));
  },
  retire: async ({ request }) => {
    const form = await request.formData();
    const values = key(form);
    try {
      retireQuestion(databasePath, values, form.get('retired') === 'true');
    } catch (cause) {
      if (cause instanceof FeedbackValidationError) return fail(400, { message: cause.message });
      throw cause instanceof Error ? cause : new Error('Could not update question retirement.');
    }
    redirect(303, selectedUrl(values));
  },
};
