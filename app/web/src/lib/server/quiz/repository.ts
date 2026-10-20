import { getAppDatabase } from '#lib/server/database/app-database.js';
import type { AppDatabase } from '#lib/server/database/connection.js';
import type { PackQuestion } from '@learning-platform/exam-pack';

const dbOrApp = (database?: AppDatabase): AppDatabase => database ?? getAppDatabase();

export interface PracticeSessionRow {
  id: string;
  exam_id: string;
  pack_id: string;
  pack_version: string;
  domain_ids: string[];
  question_ids: string[];
  question_snapshot: PackQuestion[];
  status: 'in_progress' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface PracticeAnswerRow {
  question_id: string;
  answer_ids: string[];
  correct: 0 | 1;
  answered_at: string;
}

export interface MockAttemptRow {
  id: string;
  exam_id: string;
  pack_id: string;
  pack_version: string;
  question_ids: string[];
  question_snapshot: PackQuestion[];
  duration_minutes: number;
  deadline: number;
  status: 'in_progress' | 'submitted' | 'expired';
  created_at: string;
}

export interface MockAnswerRow {
  question_id: string;
  answer_ids: string[];
  answered_at: string;
}

export const getPracticeHistory = async (
  examId: string,
  packId: string,
  packVersion: string,
  database?: AppDatabase,
): Promise<Map<string, { missed: boolean; seen: boolean }>> => {
  const rows = await dbOrApp(database)
    .selectFrom('practice_answers as a')
    .innerJoin('practice_sessions as s', 's.id', 'a.session_id')
    .select([
      'a.question_id as question_id',
      (eb) => eb.fn.max(eb.case().when('a.correct', '=', 0).then(1).else(0).end()).as('missed'),
      (eb) => eb.fn.count('a.question_id').as('seen'),
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
  database?: AppDatabase,
): Promise<void> => {
  await dbOrApp(database)
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

export const getPracticeSessionRecord = async (id: string, database?: AppDatabase) => {
  const db = dbOrApp(database);
  const session = await db
    .selectFrom('practice_sessions')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  if (!session) {
    return null;
  }
  const answers = await db
    .selectFrom('practice_answers')
    .select(['question_id', 'answer_ids', 'correct', 'answered_at'])
    .where('session_id', '=', id)
    .orderBy('answered_at')
    .execute();
  return { answers, session };
};

export const getResumablePracticeSessionId = async (database?: AppDatabase) => {
  const row = await dbOrApp(database)
    .selectFrom('practice_sessions')
    .select('id')
    .where('status', '=', 'in_progress')
    .orderBy('updated_at', 'desc')
    .executeTakeFirst();
  return row?.id;
};

export const savePracticeAnswer = async (
  input: {
    sessionId: string;
    questionId: string;
    answerIds: string[];
    correct: boolean;
    answeredAt: string;
  },
  database?: AppDatabase,
): Promise<void> => {
  await dbOrApp(database)
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
      const session = await trx
        .selectFrom('practice_sessions')
        .select('question_ids')
        .where('id', '=', input.sessionId)
        .executeTakeFirstOrThrow();
      const { count } = await trx
        .selectFrom('practice_answers')
        .select((eb) => eb.fn.countAll().as('count'))
        .where('session_id', '=', input.sessionId)
        .executeTakeFirstOrThrow();
      await trx
        .updateTable('practice_sessions')
        .set({
          status: Number(count) >= session.question_ids.length ? 'completed' : 'in_progress',
          updated_at: input.answeredAt,
        })
        .where('id', '=', input.sessionId)
        .execute();
    });
};

export const createMockAttemptRecord = async (
  attempt: Omit<MockAttemptRow, 'created_at'>,
  database?: AppDatabase,
): Promise<void> => {
  await dbOrApp(database)
    .insertInto('mock_attempts')
    .values({
      ...attempt,
      created_at: new Date().toISOString(),
      question_ids: JSON.stringify(attempt.question_ids),
      question_snapshot: JSON.stringify(attempt.question_snapshot),
    })
    .execute();
};

export const getMockAttemptRecord = async (id: string, database?: AppDatabase) => {
  const db = dbOrApp(database);
  const attempt = await db
    .selectFrom('mock_attempts')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  if (!attempt) {
    return null;
  }
  const answers = await db
    .selectFrom('mock_answers')
    .select(['question_id', 'answer_ids', 'answered_at'])
    .where('attempt_id', '=', id)
    .orderBy('answered_at')
    .execute();
  return { answers, attempt };
};

export const getResumableMockAttemptId = async (database?: AppDatabase) => {
  const row = await dbOrApp(database)
    .selectFrom('mock_attempts')
    .select('id')
    .where('status', '=', 'in_progress')
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
  return row?.id;
};

export const expireMockAttempt = async (id: string, database?: AppDatabase): Promise<void> => {
  await dbOrApp(database)
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
  database?: AppDatabase,
): Promise<void> => {
  await dbOrApp(database)
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

export const setMockAttemptStatus = async (
  id: string,
  status: 'submitted',
  database?: AppDatabase,
): Promise<void> => {
  await dbOrApp(database)
    .updateTable('mock_attempts')
    .set({ status })
    .where('id', '=', id)
    .where('status', '=', 'in_progress')
    .execute();
};
