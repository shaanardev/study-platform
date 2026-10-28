import type { PackQuestion } from '@learning-platform/exam-pack';

import { getAppDatabase } from '#lib/server/database/app-database.js';

export type QuestionCorrection = Partial<
  Pick<
    PackQuestion,
    'type' | 'domainId' | 'prompt' | 'options' | 'answerIds' | 'explanation' | 'sources'
  >
>;

export interface FeedbackKey {
  examId: string;
  packId: string;
  packVersion: string;
  questionId: string;
}

export interface StoredFeedback extends FeedbackKey {
  flags: { reason: string }[];
  correction: QuestionCorrection | null;
  retired: 0 | 1;
}

const toStoredFeedback = (row: {
  exam_id: string;
  pack_id: string;
  pack_version: string;
  question_id: string;
  flags: { reason: string }[];
  correction: QuestionCorrection | null;
  retired: 0 | 1;
}): StoredFeedback => ({
  correction: row.correction,
  examId: row.exam_id,
  flags: row.flags,
  packId: row.pack_id,
  packVersion: row.pack_version,
  questionId: row.question_id,
  retired: row.retired,
});

/** Atomically merge and save one feedback row. */
export const updateFeedback = async (
  key: FeedbackKey,
  update: (current: StoredFeedback | undefined) => Omit<StoredFeedback, keyof FeedbackKey>,
): Promise<StoredFeedback> =>
  await getAppDatabase()
    .transaction()
    .execute(async (trx) => {
      const currentRow = await trx
        .selectFrom('question_feedback')
        .select([
          'exam_id',
          'pack_id',
          'pack_version',
          'question_id',
          'flags',
          'correction',
          'retired',
        ])
        .where('exam_id', '=', key.examId)
        .where('pack_id', '=', key.packId)
        .where('pack_version', '=', key.packVersion)
        .where('question_id', '=', key.questionId)
        .executeTakeFirst();

      const current = currentRow ? toStoredFeedback(currentRow) : undefined;
      const next = { ...key, ...update(current) };
      await trx
        .insertInto('question_feedback')
        .values({
          correction: next.correction === null ? null : JSON.stringify(next.correction),
          exam_id: key.examId,
          flags: JSON.stringify(next.flags),
          pack_id: key.packId,
          pack_version: key.packVersion,
          question_id: key.questionId,
          retired: next.retired,
          updated_at: new Date().toISOString(),
        })
        .onConflict((conflict) =>
          conflict.columns(['exam_id', 'pack_id', 'pack_version', 'question_id']).doUpdateSet({
            correction: next.correction === null ? null : JSON.stringify(next.correction),
            flags: JSON.stringify(next.flags),
            retired: next.retired,
            updated_at: new Date().toISOString(),
          }),
        )
        .execute();

      return { ...next, correction: next.correction, flags: next.flags };
    });

/** List feedback for a pack version, ordered by question ID. */
export const listFeedbackRows = async (
  examId: string,
  packId: string,
  packVersion: string,
): Promise<StoredFeedback[]> => {
  const rows = await getAppDatabase()
    .selectFrom('question_feedback')
    .select(['exam_id', 'pack_id', 'pack_version', 'question_id', 'flags', 'correction', 'retired'])
    .where('exam_id', '=', examId)
    .where('pack_id', '=', packId)
    .where('pack_version', '=', packVersion)
    .orderBy('question_id')
    .execute();

  return rows.map(toStoredFeedback);
};

/** Read all feedback rows in the stable export order. */
export const listAllFeedbackRows = async (): Promise<StoredFeedback[]> => {
  const rows = await getAppDatabase()
    .selectFrom('question_feedback')
    .select(['exam_id', 'pack_id', 'pack_version', 'question_id', 'flags', 'correction', 'retired'])
    .orderBy('exam_id')
    .orderBy('pack_id')
    .orderBy('pack_version')
    .orderBy('question_id')
    .execute();

  return rows.map(toStoredFeedback);
};
