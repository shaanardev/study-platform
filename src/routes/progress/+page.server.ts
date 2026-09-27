import { resolve } from 'node:path';
import { redirect } from '@sveltejs/kit';
import { getProgress } from '../../lib/server/progress/queries';
import { createPracticeSession } from '../../lib/server/quiz/service';
import type { Actions, PageServerLoad } from './$types';

const databasePath = resolve('.local/exam-packs.sqlite');

export const load: PageServerLoad = () => getProgress(databasePath);

export const actions: Actions = {
  practiceMissed: async ({ request }) => {
    const form = await request.formData();
    const questionIds = form.getAll('questionIds').map(String);
    if (questionIds.length === 0) return { error: 'Select at least one missed question.' };
    const session = createPracticeSession({
      databasePath,
      examId: String(form.get('examId') ?? ''),
      packId: String(form.get('packId') ?? ''),
      packVersion: String(form.get('packVersion') ?? ''),
      questionIds,
      questionCount: questionIds.length,
    });
    redirect(303, `/practice?session=${encodeURIComponent(session.id)}`);
  },
};
