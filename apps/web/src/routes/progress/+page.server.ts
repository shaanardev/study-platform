import { resolve } from '$app/paths';
import { redirect } from '@sveltejs/kit';

import { getFormString } from '#lib/server/form-data.js';
import { getProgress } from '#lib/server/progress/queries.js';
import { createPracticeSession } from '#lib/server/quiz/service.js';
import { workspacePath } from '#lib/server/workspace-paths.js';

import type { Actions, PageServerLoad } from './$types';

const databasePath = workspacePath('.local/exam-packs.sqlite');

export const load: PageServerLoad = () => getProgress(databasePath);

export const actions: Actions = {
  practiceMissed: async ({ request }) => {
    const formData = await request.formData();
    const questionIds = formData.getAll('questionIds').map(String);
    if (questionIds.length === 0) {
      return { error: 'Select at least one missed question.' };
    }
    const session = createPracticeSession({
      databasePath,
      examId: getFormString(formData, 'examId'),
      packId: getFormString(formData, 'packId'),
      packVersion: getFormString(formData, 'packVersion'),
      questionCount: questionIds.length,
      questionIds,
    });
    return redirect(303, `${resolve('/practice')}?session=${encodeURIComponent(session.id)}`);
  },
};
