import { resolve } from '$app/paths';
import { redirect } from '@sveltejs/kit';

import { getFormString } from '#lib/server/form-data.js';
import { HTTP_STATUS_REDIRECT } from '#lib/server/http-status.js';
import { getProgress } from '#lib/server/progress/queries.js';
import { createPracticeSession } from '#lib/server/quiz/service.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => await getProgress();

export const actions: Actions = {
  practiceMissed: async ({ request }) => {
    const formData = await request.formData();
    const questionIds = formData.getAll('questionIds').map(String);
    if (questionIds.length === 0) {
      return { error: 'Select at least one missed question.' };
    }
    const session = await createPracticeSession({
      examId: getFormString(formData, 'examId'),
      packId: getFormString(formData, 'packId'),
      packVersion: getFormString(formData, 'packVersion'),
      questionCount: questionIds.length,
      questionIds,
    });
    return redirect(
      HTTP_STATUS_REDIRECT,
      `${resolve('/practice')}?session=${encodeURIComponent(session.id)}`,
    );
  },
};
