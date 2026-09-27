import { resolve } from 'node:path';
import { openPackDatabase } from '../db/packs';
import type { ExamPack } from '../packs/validate';

export type ProgressAttempt = {
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
};

export type DomainScore = {
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
};

export type MissedQuestion = {
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
};

export type ProgressData = {
  recentAttempts: ProgressAttempt[];
  domainScores: DomainScore[];
  missedQuestions: MissedQuestion[];
};

type AnswerRow = {
  sessionId: string;
  examId: string;
  examTitle: string;
  packId: string;
  packTitle: string;
  packVersion: string;
  contentJson: string;
  questionId: string;
  correct: number;
};

type SessionRow = {
  id: string;
  examId: string;
  examTitle: string;
  examVersion: string;
  packId: string;
  packTitle: string;
  packVersion: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  questionIds: string;
  answeredCount: number;
  correctCount: number;
};

export function getProgress(databasePath = resolve('.local/exam-packs.sqlite')): ProgressData {
  const database = openPackDatabase(databasePath);
  try {
    const sessions = database
      .prepare(`
      SELECT s.id, s.exam_id AS examId, p.exam_title AS examTitle, p.exam_version AS examVersion,
        s.pack_id AS packId, p.pack_title AS packTitle, s.pack_version AS packVersion,
        s.status, s.created_at AS createdAt, s.updated_at AS updatedAt,
        s.question_ids_json AS questionIds,
        COUNT(a.question_id) AS answeredCount,
        COALESCE(SUM(a.correct), 0) AS correctCount
      FROM practice_sessions s
      JOIN imported_packs p ON p.exam_id = s.exam_id AND p.pack_id = s.pack_id AND p.pack_version = s.pack_version
      LEFT JOIN practice_answers a ON a.session_id = s.id
      GROUP BY s.id
      ORDER BY s.updated_at DESC, s.rowid DESC
    `)
      .all() as unknown as SessionRow[];

    const answers = database
      .prepare(`
      SELECT a.session_id AS sessionId, s.exam_id AS examId, p.exam_title AS examTitle,
        s.pack_id AS packId, p.pack_title AS packTitle, s.pack_version AS packVersion,
        p.content_json AS contentJson, a.question_id AS questionId, a.correct
      FROM practice_answers a
      JOIN practice_sessions s ON s.id = a.session_id
      JOIN imported_packs p ON p.exam_id = s.exam_id AND p.pack_id = s.pack_id AND p.pack_version = s.pack_version
      ORDER BY a.answered_at, a.rowid
    `)
      .all() as unknown as AnswerRow[];

    const recentAttempts: ProgressAttempt[] = sessions.map((row) => ({
      id: String(row.id),
      kind: 'practice',
      examId: String(row.examId),
      examTitle: String(row.examTitle),
      examVersion: String(row.examVersion),
      packId: String(row.packId),
      packTitle: String(row.packTitle),
      packVersion: String(row.packVersion),
      status: String(row.status),
      correctCount: Number(row.correctCount),
      answeredCount: Number(row.answeredCount),
      questionCount: (JSON.parse(String(row.questionIds)) as string[]).length,
      completedAt: String(row.updatedAt),
    }));

    const domainTotals = new Map<string, DomainScore>();
    const missedTotals = new Map<string, MissedQuestion>();
    for (const answer of answers) {
      const pack = JSON.parse(String(answer.contentJson)) as ExamPack;
      const question = pack.questions.find((item) => item.id === String(answer.questionId));
      const domain = question && pack.domains.find((item) => item.id === question.domainId);
      if (!question || !domain) continue;
      const versionKey = [answer.examId, answer.packId, answer.packVersion].join('\0');
      const scoreKey = [versionKey, domain.id].join('\0');
      const score = domainTotals.get(scoreKey) ?? {
        examId: String(answer.examId),
        examTitle: String(answer.examTitle),
        packId: String(answer.packId),
        packTitle: String(answer.packTitle),
        packVersion: String(answer.packVersion),
        domainId: domain.id,
        domainTitle: domain.title,
        correctCount: 0,
        answeredCount: 0,
        percent: 0,
      };
      score.answeredCount += 1;
      score.correctCount += Number(answer.correct);
      score.percent = Math.round((score.correctCount / score.answeredCount) * 100);
      domainTotals.set(scoreKey, score);

      if (!Number(answer.correct)) {
        const missKey = [versionKey, question.id].join('\0');
        const missed = missedTotals.get(missKey) ?? {
          examId: String(answer.examId),
          packId: String(answer.packId),
          packVersion: String(answer.packVersion),
          examTitle: String(answer.examTitle),
          packTitle: String(answer.packTitle),
          questionId: question.id,
          prompt: question.prompt,
          domainId: domain.id,
          domainTitle: domain.title,
          missCount: 0,
        };
        missed.missCount += 1;
        missedTotals.set(missKey, missed);
      }
    }

    return {
      recentAttempts: recentAttempts.slice(0, 20),
      domainScores: [...domainTotals.values()].sort(
        (a, b) =>
          a.examTitle.localeCompare(b.examTitle) ||
          a.packTitle.localeCompare(b.packTitle) ||
          a.packVersion.localeCompare(b.packVersion) ||
          a.domainTitle.localeCompare(b.domainTitle),
      ),
      missedQuestions: [...missedTotals.values()].sort(
        (a, b) =>
          b.missCount - a.missCount ||
          a.examTitle.localeCompare(b.examTitle) ||
          a.questionId.localeCompare(b.questionId),
      ),
    };
  } finally {
    database.close();
  }
}
