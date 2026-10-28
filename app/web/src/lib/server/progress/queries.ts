import type { ExamPack, PackQuestion } from '@learning-platform/exam-pack';
import { sql } from 'kysely';

import { MAX_RECENT_ATTEMPTS, PERCENTAGE_SCALE } from '#lib/quiz/constants.js';
import { getAppDatabase } from '#lib/server/database/app-database.js';

export interface ProgressAttempt {
  id: string;
  kind: 'practice' | 'mock';
  examId: string;
  examTitle: string;
  examVersion: string;
  packId: string;
  packTitle: string;
  packVersion: string;
  status: string;
  correctCount: number;
  answeredCount: number;
  questionCount: number;
  completedAt: string;
}

export interface DomainScore {
  examId: string;
  examTitle: string;
  packId: string;
  packTitle: string;
  packVersion: string;
  domainId: string;
  domainTitle: string;
  correctCount: number;
  answeredCount: number;
  percent: number;
}

export interface MissedQuestion {
  examId: string;
  packId: string;
  packVersion: string;
  examTitle: string;
  packTitle: string;
  questionId: string;
  prompt: string;
  domainId: string;
  domainTitle: string;
  missCount: number;
}

export interface ProgressData {
  recentAttempts: ProgressAttempt[];
  domainScores: DomainScore[];
  missedQuestions: MissedQuestion[];
}

interface AggregatedAnswerRow {
  questionId: string;
  correct: 0 | 1 | null;
  answerIds: string[] | null;
  answeredAt: string;
  answerRowid: number;
}

type ProgressPackContent = Pick<ExamPack, 'domains' | 'exam' | 'pack'>;

const sameAnswerSet = (first: string[], second: string[]): boolean =>
  first.length === second.length && first.every((id) => second.includes(id));

const answerIsCorrect = (question: PackQuestion | undefined, answerIds: string[]): boolean =>
  question !== undefined && sameAnswerSet(question.answerIds, answerIds);

const versionKey = (examId: string, packId: string, packVersion: string): string =>
  [examId, packId, packVersion].join('\0');

const scoreKey = (examId: string, packId: string, packVersion: string, domainId: string): string =>
  [versionKey(examId, packId, packVersion), domainId].join('\0');

const missedKey = (
  examId: string,
  packId: string,
  packVersion: string,
  questionId: string,
): string => [versionKey(examId, packId, packVersion), questionId].join('\0');

const attemptKey = (kind: ProgressAttempt['kind'], id: string): string => `${kind}\0${id}`;

export const getProgress = async (): Promise<ProgressData> => {
  const database = getAppDatabase();

  const practiceRows = database
    .selectFrom('practice_sessions as s')
    .innerJoin('imported_packs as p', (join) =>
      join
        .onRef('p.exam_id', '=', 's.exam_id')
        .onRef('p.pack_id', '=', 's.pack_id')
        .onRef('p.pack_version', '=', 's.pack_version'),
    )
    .select([
      sql<ProgressAttempt['kind']>`'practice'`.as('kind'),
      's.id as id',
      's.exam_id as examId',
      's.pack_id as packId',
      's.pack_version as packVersion',
      sql<ProgressPackContent>`json_object(
        'exam', json(json_extract(p.content, '$.exam')),
        'pack', json(json_extract(p.content, '$.pack')),
        'domains', json(json_extract(p.content, '$.domains'))
      )`.as('content'),
      sql<string>`s.status`.as('status'),
      's.updated_at as attemptedAt',
      's.question_ids as question_ids',
      's.question_snapshot as question_snapshot',
      sql<AggregatedAnswerRow[]>`(
        SELECT json_group_array(json_object(
          'questionId', answer.question_id,
          'correct', answer.correct,
          'answerIds', NULL,
          'answeredAt', answer.answered_at,
          'answerRowid', answer.rowid
        ))
        FROM (
          SELECT question_id, correct, answered_at, rowid
          FROM practice_answers
          WHERE session_id = s.id
          ORDER BY answered_at, rowid
        ) AS answer
      )`.as('answers'),
      sql<number>`s.rowid`.as('attemptRowid'),
      sql<number>`0`.as('kindOrder'),
    ]);

  const mockRows = database
    .selectFrom('mock_attempts as m')
    .innerJoin('imported_packs as p', (join) =>
      join
        .onRef('p.exam_id', '=', 'm.exam_id')
        .onRef('p.pack_id', '=', 'm.pack_id')
        .onRef('p.pack_version', '=', 'm.pack_version'),
    )
    .select([
      sql<ProgressAttempt['kind']>`'mock'`.as('kind'),
      'm.id as id',
      'm.exam_id as examId',
      'm.pack_id as packId',
      'm.pack_version as packVersion',
      sql<ProgressPackContent>`json_object(
        'exam', json(json_extract(p.content, '$.exam')),
        'pack', json(json_extract(p.content, '$.pack')),
        'domains', json(json_extract(p.content, '$.domains'))
      )`.as('content'),
      sql<string>`m.status`.as('status'),
      'm.created_at as attemptedAt',
      'm.question_ids as question_ids',
      'm.question_snapshot as question_snapshot',
      sql<AggregatedAnswerRow[]>`(
        SELECT json_group_array(json_object(
          'questionId', answer.question_id,
          'correct', NULL,
          'answerIds', json(answer.answer_ids),
          'answeredAt', answer.answered_at,
          'answerRowid', answer.rowid
        ))
        FROM (
          SELECT question_id, answer_ids, answered_at, rowid
          FROM mock_answers
          WHERE attempt_id = m.id
          ORDER BY rowid
        ) AS answer
      )`.as('answers'),
      sql<number>`m.rowid`.as('attemptRowid'),
      sql<number>`1`.as('kindOrder'),
    ]);

  const rows = await practiceRows
    .unionAll(mockRows)
    .orderBy('attemptedAt', 'desc')
    .orderBy('kindOrder')
    .orderBy('attemptRowid', 'desc')
    .execute();

  const attempts = new Map<string, ProgressAttempt>();

  rows.forEach((row) => {
    const baseAttempt = {
      answeredCount: 0,
      completedAt: row.attemptedAt,
      correctCount: 0,
      examId: row.examId,
      examTitle: row.content.exam.title,
      examVersion: row.content.exam.version,
      id: row.id,
      kind: row.kind,
      packId: row.packId,
      packTitle: row.content.pack.title,
      packVersion: row.packVersion,
      questionCount: row.question_ids.length,
      status: row.status,
    } satisfies ProgressAttempt;

    const answerRows = row.answers;
    const attempt = { ...baseAttempt, answeredCount: answerRows.length };

    attempt.correctCount =
      row.kind === 'practice'
        ? answerRows.reduce((total, answer) => total + (answer.correct ?? 0), 0)
        : answerRows.reduce((total, answer) => {
            const question = row.question_snapshot.find((item) => item.id === answer.questionId);

            return total + (answerIsCorrect(question, answer.answerIds ?? []) ? 1 : 0);
          }, 0);

    attempts.set(attemptKey(row.kind, row.id), attempt);
  });

  const orderedAttempts = [...attempts.values()].toSorted((a, b) =>
    b.completedAt.localeCompare(a.completedAt),
  );

  const domainTotals = new Map<string, DomainScore>();
  const missedTotals = new Map<string, MissedQuestion>();

  const orderedPracticeAnswers = rows
    .flatMap((row) =>
      row.kind === 'practice' ? row.answers.map((answer) => ({ answer, row })) : [],
    )
    .toSorted(
      (first, second) =>
        first.answer.answeredAt.localeCompare(second.answer.answeredAt) ||
        first.answer.answerRowid - second.answer.answerRowid,
    );

  orderedPracticeAnswers.forEach(({ answer: answerRow, row }) => {
    const snapshot = row.question_snapshot;
    const question = snapshot.find((item) => item.id === answerRow.questionId);
    const domain = question && row.content.domains.find((item) => item.id === question.domainId);

    if (!question || !domain) {
      return;
    }

    const scoreId = scoreKey(row.examId, row.packId, row.packVersion, domain.id);

    const score = domainTotals.get(scoreId) ?? {
      answeredCount: 0,
      correctCount: 0,
      domainId: domain.id,
      domainTitle: domain.title,
      examId: row.examId,
      examTitle: row.content.exam.title,
      packId: row.packId,
      packTitle: row.content.pack.title,
      packVersion: row.packVersion,
      percent: 0,
    };

    score.answeredCount += 1;
    score.correctCount += answerRow.correct ?? 0;
    score.percent = Math.round((score.correctCount / score.answeredCount) * PERCENTAGE_SCALE);
    domainTotals.set(scoreId, score);

    if (answerRow.correct === 0) {
      const missedId = missedKey(row.examId, row.packId, row.packVersion, question.id);

      const missed = missedTotals.get(missedId) ?? {
        domainId: domain.id,
        domainTitle: domain.title,
        examId: row.examId,
        examTitle: row.content.exam.title,
        missCount: 0,
        packId: row.packId,
        packTitle: row.content.pack.title,
        packVersion: row.packVersion,
        prompt: question.prompt,
        questionId: question.id,
      };

      missed.missCount += 1;
      missedTotals.set(missedId, missed);
    }
  });

  return {
    domainScores: [...domainTotals.values()].toSorted(
      (a, b) =>
        a.examTitle.localeCompare(b.examTitle) ||
        a.packTitle.localeCompare(b.packTitle) ||
        a.packVersion.localeCompare(b.packVersion) ||
        a.domainTitle.localeCompare(b.domainTitle),
    ),
    missedQuestions: [...missedTotals.values()].toSorted(
      (a, b) =>
        b.missCount - a.missCount ||
        a.examTitle.localeCompare(b.examTitle) ||
        a.questionId.localeCompare(b.questionId),
    ),
    recentAttempts: orderedAttempts.slice(0, MAX_RECENT_ATTEMPTS),
  };
};
