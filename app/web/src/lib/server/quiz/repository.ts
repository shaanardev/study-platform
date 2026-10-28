import { sql } from 'kysely';
import type { Selectable } from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/sqlite';

import { getAppDatabase } from '#lib/server/database/app-database.js';
import type { AppDatabaseSchema } from '#lib/server/database/types.js';

type PracticeSessionRow = Selectable<AppDatabaseSchema['practice_sessions']>;

type MockAttemptRow = Selectable<AppDatabaseSchema['mock_attempts']>;

export const getPracticeHistory = async (
  examId: string,
  packId: string,
  packVersion: string,
): Promise<Map<string, { missed: boolean; seen: boolean }>> => {
  const rows = await getAppDatabase()
    .selectFrom('practice_answers as a')
    .innerJoin('practice_sessions as s', 's.id', 'a.session_id')
    .select([
      'a.question_id as question_id',
      (eb) => eb.fn.max(eb.case().when('a.correct', '=', 0).then(1).else(0).end()).as('missed'),
    ])
    .where('s.exam_id', '=', examId)
    .where('s.pack_id', '=', packId)
    .where('s.pack_version', '=', packVersion)
    .groupBy('a.question_id')
    .execute();

  return new Map(rows.map((row) => [row.question_id, { missed: row.missed > 0, seen: true }]));
};

export const createPracticeSessionRecord = async (
  session: Omit<PracticeSessionRow, 'created_at' | 'updated_at'>,
): Promise<void> => {
  await getAppDatabase()
    .insertInto('practice_sessions')
    .values({
      ...session,
      created_at: new Date().toISOString(),
      domain_ids: JSON.stringify(session.domain_ids),
      question_ids: JSON.stringify(session.question_ids),
      question_snapshot: JSON.stringify(session.question_snapshot),
      updated_at: new Date().toISOString(),
    })
    .execute();
};

export const getPracticeSessionRecord = async (id: string | undefined) => {
  const row = await getAppDatabase()
    .selectFrom('practice_sessions')
    .selectAll()
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom('practice_answers')
          .select([
            'question_id',
            sql<string[]>`json(answer_ids)`.as('answer_ids'),
            'correct',
            'answered_at',
          ])
          .whereRef('practice_answers.session_id', '=', 'practice_sessions.id')
          .orderBy('answered_at')
          .orderBy(sql.ref('practice_answers.rowid')),
      ).as('answers'),
    ])
    .where((eb) =>
      id === undefined
        ? eb(
            'practice_sessions.id',
            '=',
            eb
              .selectFrom('practice_sessions as resumable')
              .select('resumable.id')
              .where('resumable.status', '=', 'in_progress')
              .orderBy('resumable.updated_at', 'desc')
              .orderBy(sql.ref('resumable.rowid'), 'desc')
              .limit(1),
          )
        : eb('practice_sessions.id', '=', id),
    )
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  const { answers, ...session } = row;

  return { answers, session };
};

export const savePracticeAnswer = async (input: {
  sessionId: string;
  questionId: string;
  answerIds: string[];
  correct: boolean;
  answeredAt: string;
}): Promise<void> => {
  await getAppDatabase()
    .transaction()
    .execute(async (trx) => {
      await trx
        .insertInto('practice_answers')
        .values({
          answer_ids: JSON.stringify(input.answerIds),
          answered_at: input.answeredAt,
          correct: input.correct ? 1 : 0,
          question_id: input.questionId,
          session_id: input.sessionId,
        })
        .execute();

      await trx
        .updateTable('practice_sessions')
        .set({
          status: sql<PracticeSessionRow['status']>`CASE
            WHEN (
              SELECT COUNT(*)
              FROM practice_answers
              WHERE practice_answers.session_id = practice_sessions.id
            ) >= json_array_length(practice_sessions.question_ids)
            THEN 'completed'
            ELSE 'in_progress'
          END`,
          updated_at: input.answeredAt,
        })
        .where('id', '=', input.sessionId)
        .execute();
    });
};

export const createMockAttemptRecord = async (
  attempt: Omit<MockAttemptRow, 'created_at'>,
): Promise<void> => {
  await getAppDatabase()
    .insertInto('mock_attempts')
    .values({
      ...attempt,
      created_at: new Date().toISOString(),
      question_ids: JSON.stringify(attempt.question_ids),
      question_snapshot: JSON.stringify(attempt.question_snapshot),
    })
    .execute();
};

export const getMockAttemptRecord = async (id: string | undefined) => {
  const row = await getAppDatabase()
    .selectFrom('mock_attempts')
    .selectAll()
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom('mock_answers')
          .select(['question_id', sql<string[]>`json(answer_ids)`.as('answer_ids'), 'answered_at'])
          .whereRef('mock_answers.attempt_id', '=', 'mock_attempts.id')
          .orderBy('answered_at')
          .orderBy(sql.ref('mock_answers.rowid')),
      ).as('answers'),
    ])
    .where((eb) =>
      id === undefined
        ? eb(
            'mock_attempts.id',
            '=',
            eb
              .selectFrom('mock_attempts as resumable')
              .select('resumable.id')
              .where('resumable.status', '=', 'in_progress')
              .orderBy('resumable.created_at', 'desc')
              .orderBy(sql.ref('resumable.rowid'), 'desc')
              .limit(1),
          )
        : eb('mock_attempts.id', '=', id),
    )
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  const { answers, ...attempt } = row;

  return { answers, attempt };
};

export const expireMockAttempt = async (id: string): Promise<void> => {
  await getAppDatabase()
    .updateTable('mock_attempts')
    .set({ status: 'expired' })
    .where('id', '=', id)
    .where('status', '=', 'in_progress')
    .execute();
};

export const saveMockAnswerRecord = async (
  attemptId: string,
  questionId: string,
  answerIds: string[],
  answeredAt: string,
): Promise<void> => {
  await getAppDatabase()
    .insertInto('mock_answers')
    .values({
      answer_ids: JSON.stringify(answerIds),
      answered_at: answeredAt,
      attempt_id: attemptId,
      question_id: questionId,
    })
    .onConflict((conflict) =>
      conflict.columns(['attempt_id', 'question_id']).doUpdateSet({
        answer_ids: JSON.stringify(answerIds),
        answered_at: answeredAt,
      }),
    )
    .execute();
};

export const setMockAttemptStatus = async (id: string, status: 'submitted'): Promise<void> => {
  await getAppDatabase()
    .updateTable('mock_attempts')
    .set({ status })
    .where('id', '=', id)
    .where('status', '=', 'in_progress')
    .execute();
};
