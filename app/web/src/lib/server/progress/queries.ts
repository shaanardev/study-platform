import { MAX_RECENT_ATTEMPTS, PERCENTAGE_SCALE } from '#lib/quiz/constants.js';

import { getAppDatabase } from '#lib/server/database/app-database.js';
import type { AppDatabase } from '#lib/server/database/connection.js';
import type { PackQuestion } from '@learning-platform/exam-pack';

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

export const getProgress = async (
  database: AppDatabase = getAppDatabase(),
): Promise<ProgressData> => {
  const [practiceRows, mockRows, answerRows] = await Promise.all([
    database
      .selectFrom('practice_sessions as s')
      .innerJoin('imported_packs as p', (join) =>
        join
          .onRef('p.exam_id', '=', 's.exam_id')
          .onRef('p.pack_id', '=', 's.pack_id')
          .onRef('p.pack_version', '=', 's.pack_version'),
      )
      .leftJoin('practice_answers as a', 'a.session_id', 's.id')
      .select([
        's.id as id',
        's.exam_id as examId',
        'p.content as content',
        'p.pack_id as packId',
        'p.pack_version as packVersion',
        's.status as status',
        's.updated_at as updatedAt',
        's.question_ids as question_ids',
        's.question_snapshot as question_snapshot',
        'a.question_id as questionId',
        'a.correct as correct',
      ])
      .orderBy('s.updated_at', 'desc')
      .execute(),
    database
      .selectFrom('mock_attempts as m')
      .innerJoin('imported_packs as p', (join) =>
        join
          .onRef('p.exam_id', '=', 'm.exam_id')
          .onRef('p.pack_id', '=', 'm.pack_id')
          .onRef('p.pack_version', '=', 'm.pack_version'),
      )
      .leftJoin('mock_answers as a', 'a.attempt_id', 'm.id')
      .select([
        'm.id as id',
        'm.exam_id as examId',
        'm.pack_id as packId',
        'm.pack_version as packVersion',
        'p.content as content',
        'm.status as status',
        'm.created_at as createdAt',
        'm.question_ids as question_ids',
        'm.question_snapshot as question_snapshot',
        'a.question_id as questionId',
        'a.answer_ids as answer_ids',
      ])
      .orderBy('m.created_at', 'desc')
      .execute(),
    database
      .selectFrom('practice_answers as a')
      .innerJoin('practice_sessions as s', 's.id', 'a.session_id')
      .innerJoin('imported_packs as p', (join) =>
        join
          .onRef('p.exam_id', '=', 's.exam_id')
          .onRef('p.pack_id', '=', 's.pack_id')
          .onRef('p.pack_version', '=', 's.pack_version'),
      )
      .select([
        's.exam_id as examId',
        's.pack_id as packId',
        's.pack_version as packVersion',
        'p.content as content',
        's.question_snapshot as question_snapshot',
        'a.question_id as questionId',
        'a.correct as correct',
      ])
      .orderBy('a.answered_at')
      .execute(),
  ]);

  const attempts = new Map<string, ProgressAttempt>();
  for (const row of practiceRows) {
    const attempt = attempts.get(attemptKey('practice', row.id)) ?? {
      answeredCount: 0,
      completedAt: row.updatedAt,
      correctCount: 0,
      examId: row.examId,
      examTitle: row.content.exam.title,
      examVersion: row.content.exam.version,
      id: row.id,
      kind: 'practice' as const,
      packId: row.packId,
      packTitle: row.content.pack.title,
      packVersion: row.packVersion,
      questionCount: row.question_ids.length,
      status: row.status,
    };
    if (row.questionId !== null) {
      attempt.answeredCount += 1;
      attempt.correctCount += row.correct ?? 0;
    }
    attempts.set(attemptKey('practice', row.id), attempt);
  }

  for (const row of mockRows) {
    const attempt = attempts.get(attemptKey('mock', row.id)) ?? {
      answeredCount: 0,
      completedAt: row.createdAt,
      correctCount: 0,
      examId: row.examId,
      examTitle: row.content.exam.title,
      examVersion: row.content.exam.version,
      id: row.id,
      kind: 'mock' as const,
      packId: row.packId,
      packTitle: row.content.pack.title,
      packVersion: row.packVersion,
      questionCount: row.question_ids.length,
      status: row.status,
    };
    if (row.questionId !== null && row.answer_ids !== null) {
      attempt.answeredCount += 1;
      const question = row.question_snapshot.find((item) => item.id === row.questionId);
      if (answerIsCorrect(question, row.answer_ids)) {
        attempt.correctCount += 1;
      }
    }
    attempts.set(attemptKey('mock', row.id), attempt);
  }

  const orderedAttempts = [...attempts.values()].toSorted((a, b) =>
    b.completedAt.localeCompare(a.completedAt),
  );
  const domainTotals = new Map<string, DomainScore>();
  const missedTotals = new Map<string, MissedQuestion>();

  for (const row of answerRows) {
    const snapshot = row.question_snapshot;
    const question = snapshot.find((item) => item.id === row.questionId);
    const domain = question && row.content.domains.find((item) => item.id === question.domainId);
    if (!question || !domain) {
      continue;
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
    score.correctCount += row.correct;
    score.percent = Math.round((score.correctCount / score.answeredCount) * PERCENTAGE_SCALE);
    domainTotals.set(scoreId, score);

    if (row.correct === 0) {
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
  }

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
