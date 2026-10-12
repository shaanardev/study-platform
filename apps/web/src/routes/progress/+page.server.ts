import { resolve } from '$app/paths';
import { redirect } from '@sveltejs/kit';

import { getProgress } from '#lib/server/progress/queries.js';
import { createPracticeSession } from '#lib/server/quiz/service.js';
import { workspacePath } from '#lib/server/workspace-paths.js';

import type { Actions, PageServerLoad } from './$types';

const databasePath = workspacePath('.local/exam-packs.sqlite');

const formString = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
};

export const load: PageServerLoad = () => getProgress(databasePath);

export const actions: Actions = {
  practiceMissed: async ({ request }) => {
    const form = await request.formData();
    const questionIds = form.getAll('questionIds').map(String);
    if (questionIds.length === 0) {
      return { error: 'Select at least one missed question.' };
    }
    const session = createPracticeSession({
      databasePath,
      examId: formString(form, 'examId'),
      packId: formString(form, 'packId'),
      packVersion: formString(form, 'packVersion'),
      questionCount: questionIds.length,
      questionIds,
    });
    return redirect(303, `${resolve('/practice')}?session=${encodeURIComponent(session.id)}`);
  },
};
