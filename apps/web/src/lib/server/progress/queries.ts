import type { SQLOutputValue } from 'node:sqlite';

import { openPackDatabase } from '#lib/server/db/packs.js';
import { validateExamPack } from '#lib/server/packs/validate.js';
import { workspacePath } from '#lib/server/workspace-paths.js';

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

type DatabaseRow = Record<string, SQLOutputValue>;

function textColumn(row: DatabaseRow, column: string): string {
  const value = row[column];
  if (typeof value !== 'string') throw new Error(`Database column "${column}" is not text.`);
  return value;
}

function numberColumn(row: DatabaseRow, column: string): number {
  const value = row[column];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Database column "${column}" is not a finite number.`);
  }
  return value;
}

function nullableTextColumn(row: DatabaseRow, column: string): string | null {
  const value = row[column];
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`Database column "${column}" is not text.`);
  return value;
}

function stringArray(json: string): string[] {
  const value: unknown = JSON.parse(json);
  if (!Array.isArray(value) || !value.every((item: unknown) => typeof item === 'string')) {
    throw new Error('Stored question identifiers are invalid.');
  }
  return value;
}

function parsePack(json: string) {
  const parsed: unknown = JSON.parse(json);
  const result = validateExamPack(parsed);
  if (!result.valid) throw new Error('Stored exam pack is invalid.');
  return result.pack;
}

function sameAnswerSet(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every((id) => second.includes(id));
}

export function getProgress(
  databasePath = workspacePath('.local/exam-packs.sqlite'),
): ProgressData {
  const database = openPackDatabase(databasePath);
  try {
    const sessionRows = database
      .prepare(`
      SELECT s.id, s.exam_id AS examId, p.exam_title AS examTitle, p.exam_version AS examVersion,
        s.pack_id AS packId, p.pack_title AS packTitle, s.pack_version AS packVersion,
        s.status, s.updated_at AS updatedAt, s.question_ids_json AS questionIds,
        COUNT(a.question_id) AS answeredCount,
        COALESCE(SUM(a.correct), 0) AS correctCount
      FROM practice_sessions s
      JOIN imported_packs p ON p.exam_id = s.exam_id AND p.pack_id = s.pack_id AND p.pack_version = s.pack_version
      LEFT JOIN practice_answers a ON a.session_id = s.id
      GROUP BY s.id
      ORDER BY s.updated_at DESC, s.rowid DESC
    `)
      .all();
    const recentAttempts: ProgressAttempt[] = sessionRows.map((row) => ({
      id: textColumn(row, 'id'),
      kind: 'practice',
      examId: textColumn(row, 'examId'),
      examTitle: textColumn(row, 'examTitle'),
      examVersion: textColumn(row, 'examVersion'),
      packId: textColumn(row, 'packId'),
      packTitle: textColumn(row, 'packTitle'),
      packVersion: textColumn(row, 'packVersion'),
      status: textColumn(row, 'status'),
      correctCount: numberColumn(row, 'correctCount'),
      answeredCount: numberColumn(row, 'answeredCount'),
      questionCount: stringArray(textColumn(row, 'questionIds')).length,
      completedAt: textColumn(row, 'updatedAt'),
    }));

    const mockAttempts = new Map<string, ProgressAttempt>();
    const packs = new Map<string, ReturnType<typeof parsePack>>();
    const mockRows = database
      .prepare(`
      SELECT m.id, m.exam_id AS examId, p.exam_title AS examTitle, p.exam_version AS examVersion,
        m.pack_id AS packId, p.pack_title AS packTitle, m.pack_version AS packVersion,
        m.status, m.created_at AS createdAt, m.question_ids_json AS questionIds,
        p.content_json AS contentJson, a.question_id AS questionId, a.answer_ids_json AS answerIds
      FROM mock_attempts m
      JOIN imported_packs p ON p.exam_id = m.exam_id AND p.pack_id = m.pack_id AND p.pack_version = m.pack_version
      LEFT JOIN mock_answers a ON a.attempt_id = m.id
      ORDER BY m.created_at DESC, m.rowid DESC, a.rowid
    `)
      .all();

    for (const row of mockRows) {
      const id = textColumn(row, 'id');
      let attempt = mockAttempts.get(id);
      if (!attempt) {
        const versionKey = [
          textColumn(row, 'examId'),
          textColumn(row, 'packId'),
          textColumn(row, 'packVersion'),
        ].join('\0');
        let pack = packs.get(versionKey);
        if (!pack) {
          pack = parsePack(textColumn(row, 'contentJson'));
          packs.set(versionKey, pack);
        }
        attempt = {
          id,
          kind: 'mock',
          examId: textColumn(row, 'examId'),
          examTitle: textColumn(row, 'examTitle'),
          examVersion: textColumn(row, 'examVersion'),
          packId: textColumn(row, 'packId'),
          packTitle: textColumn(row, 'packTitle'),
          packVersion: textColumn(row, 'packVersion'),
          status: textColumn(row, 'status'),
          correctCount: 0,
          answeredCount: 0,
          questionCount: stringArray(textColumn(row, 'questionIds')).length,
          completedAt: textColumn(row, 'createdAt'),
        };
        mockAttempts.set(id, attempt);
      }

      const questionId = nullableTextColumn(row, 'questionId');
      const answerIds = nullableTextColumn(row, 'answerIds');
      if (questionId === null || answerIds === null) continue;
      attempt.answeredCount += 1;

      const versionKey = [attempt.examId, attempt.packId, attempt.packVersion].join('\0');
      const question = packs.get(versionKey)?.questions.find((item) => item.id === questionId);
      if (!question) continue;
      const submitted = stringArray(answerIds);
      if (sameAnswerSet(question.answerIds, submitted)) attempt.correctCount += 1;
    }
    recentAttempts.push(...mockAttempts.values());
    recentAttempts.sort((a, b) => b.completedAt.localeCompare(a.completedAt));

    const answerRows = database
      .prepare(`
      SELECT a.session_id AS sessionId, s.exam_id AS examId, p.exam_title AS examTitle,
        s.pack_id AS packId, p.pack_title AS packTitle, s.pack_version AS packVersion,
        p.content_json AS contentJson, a.question_id AS questionId, a.correct
      FROM practice_answers a
      JOIN practice_sessions s ON s.id = a.session_id
      JOIN imported_packs p ON p.exam_id = s.exam_id AND p.pack_id = s.pack_id AND p.pack_version = s.pack_version
      ORDER BY a.answered_at, a.rowid
    `)
      .all();

    const domainTotals = new Map<string, DomainScore>();
    const missedTotals = new Map<string, MissedQuestion>();
    for (const row of answerRows) {
      const pack = parsePack(textColumn(row, 'contentJson'));
      const questionId = textColumn(row, 'questionId');
      const question = pack.questions.find((item) => item.id === questionId);
      const domain = question && pack.domains.find((item) => item.id === question.domainId);
      if (!question || !domain) continue;
      const examId = textColumn(row, 'examId');
      const packId = textColumn(row, 'packId');
      const packVersion = textColumn(row, 'packVersion');
      const versionKey = [examId, packId, packVersion].join('\0');
      const scoreKey = [versionKey, domain.id].join('\0');
      const score = domainTotals.get(scoreKey) ?? {
        examId,
        examTitle: textColumn(row, 'examTitle'),
        packId,
        packTitle: textColumn(row, 'packTitle'),
        packVersion,
        domainId: domain.id,
        domainTitle: domain.title,
        correctCount: 0,
        answeredCount: 0,
        percent: 0,
      };
      score.answeredCount += 1;
      score.correctCount += numberColumn(row, 'correct');
      score.percent = Math.round((score.correctCount / score.answeredCount) * 100);
      domainTotals.set(scoreKey, score);

      if (numberColumn(row, 'correct') === 0) {
        const missKey = [versionKey, question.id].join('\0');
        const missed = missedTotals.get(missKey) ?? {
          examId,
          packId,
          packVersion,
          examTitle: textColumn(row, 'examTitle'),
          packTitle: textColumn(row, 'packTitle'),
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
