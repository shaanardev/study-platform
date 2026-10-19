import { randomUUID } from 'node:crypto';
import pathModule from 'node:path';
import type { SQLOutputValue } from 'node:sqlite';

import { error as httpError } from '@sveltejs/kit';

import {
  MAX_MOCK_DURATION_MINUTES,
  MAX_QUESTION_COUNT,
  PERCENTAGE_SCALE,
} from '#lib/quiz/constants.js';
import { getImportedPack, openPackDatabase } from '#lib/server/db/packs.js';
import { getEffectivePack } from '#lib/server/feedback/service.js';
import { HTTP_BAD_REQUEST, HTTP_NOT_FOUND } from '#lib/server/http-status.js';
import { decodeJsonStringArray, decodeJsonText } from '#lib/server/json.js';
import { validateExamPack } from '#lib/server/packs/validate.js';
import { allocateWeightedQuestions, findCoverageGaps } from '#lib/server/quiz/mock-selection.js';
import { createDeadline, isExpired, remainingMilliseconds } from '#lib/server/quiz/timing.js';
import { workspacePath } from '#lib/server/workspace-paths.js';
import type { PackQuestion } from '#lib/types/exam-pack.js';

type SafeQuestion = Omit<PackQuestion, 'answerIds' | 'explanation'> & {
  explanation?: string;
  answerIds?: string[];
};

interface MockAnswer {
  questionId: string;
  answerIds: string[];
  correct?: boolean;
  explanation?: string;
}

export interface MockAttempt {
  id: string;
  examId: string;
  packId: string;
  packVersion: string;
  questionIds: string[];
  durationMinutes: number;
  deadline: number;
  remainingMilliseconds: number;
  status: 'in_progress' | 'submitted' | 'expired';
  answers: MockAnswer[];
  questions: SafeQuestion[];
  score?: {
    correct: number;
    total: number;
    percent: number;
    domains: { id: string; title: string; correct: number; total: number; percent: number }[];
    passingThreshold?: number;
    passed?: boolean;
  };
}

const dbPath = (path?: string) =>
  pathModule.resolve(path ?? workspacePath('.local/exam-packs.sqlite'));

type DatabaseRow = Record<string, SQLOutputValue>;

const column = (row: DatabaseRow, key: string): SQLOutputValue | undefined => row[key];

const parseStringArray = (value: SQLOutputValue | undefined): string[] => {
  try {
    return decodeJsonStringArray(String(value));
  } catch {
    throw new Error('Stored mock attempt data is invalid.');
  }
};

const parseQuestionSnapshot = (
  value: SQLOutputValue | undefined,
  basePack: NonNullable<ReturnType<typeof getImportedPack>>,
) => {
  const questions = decodeJsonText(String(value));
  const result = validateExamPack({ ...basePack, questions });

  if (!result.valid) {
    throw new Error('Stored mock attempt questions are invalid.');
  }

  return result.pack.questions;
};

export const getMockCoverage = (
  databasePath: string,
  examId: string,
  packId: string,
  packVersion: string,
  questionCount: number,
) => {
  const importedPack = getImportedPack(examId, packId, packVersion, dbPath(databasePath));

  if (!importedPack) {
    httpError(HTTP_NOT_FOUND, 'That imported exam pack version is not available.');
  }

  const pack = getEffectivePack(dbPath(databasePath), importedPack);

  if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > MAX_QUESTION_COUNT) {
    httpError(HTTP_BAD_REQUEST, `Mock question count must be between 1 and ${MAX_QUESTION_COUNT}.`);
  }

  const counts = Object.fromEntries(
    pack.domains.map((domain) => [
      domain.id,
      pack.questions.filter((question) => question.domainId === domain.id).length,
    ]),
  );

  return {
    allocations: allocateWeightedQuestions(pack.domains, questionCount),
    gaps: findCoverageGaps(pack.domains, counts, questionCount),
    questionCount,
  };
};

const readMockAttempt = (
  databasePath: string,
  id: string,
  now = Date.now(),
): MockAttempt | undefined => {
  const database = openPackDatabase(databasePath);

  try {
    const row = database
      .prepare(
        `SELECT id, exam_id AS examId, pack_id AS packId, pack_version AS packVersion,
      question_ids_json AS questionIds, duration_minutes AS durationMinutes, deadline, status,
      question_snapshot_json AS questionSnapshot
      FROM mock_attempts WHERE id = ?`,
      )
      .get(id);

    if (!row) {
      return undefined;
    }

    const pack = getImportedPack(
      String(column(row, 'examId')),
      String(column(row, 'packId')),
      String(column(row, 'packVersion')),
      databasePath,
    );

    if (!pack) {
      return undefined;
    }

    const rawStatus = String(column(row, 'status'));

    if (rawStatus !== 'in_progress' && rawStatus !== 'submitted' && rawStatus !== 'expired') {
      return undefined;
    }

    let status: MockAttempt['status'] = rawStatus;
    const deadline = Number(column(row, 'deadline'));

    if (status === 'in_progress' && isExpired(deadline, now)) {
      status = 'expired';
      database.prepare("UPDATE mock_attempts SET status = 'expired' WHERE id = ?").run(id);
    }

    const questionIds = parseStringArray(column(row, 'questionIds'));
    const questionSnapshot = column(row, 'questionSnapshot');

    const attemptQuestions =
      questionSnapshot !== undefined && questionSnapshot !== null
        ? parseQuestionSnapshot(questionSnapshot, pack)
        : pack.questions;

    const answers = database
      .prepare(
        `SELECT question_id AS questionId, answer_ids_json AS answerIds FROM mock_answers WHERE attempt_id = ? ORDER BY rowid`,
      )
      .all(id)
      .map((answer) => ({
        answerIds: parseStringArray(column(answer, 'answerIds')),
        questionId: String(column(answer, 'questionId')),
      }));

    const reveal = status !== 'in_progress';

    const questions: SafeQuestion[] = questionIds.flatMap((questionId) => {
      const question = attemptQuestions.find((item) => item.id === questionId);

      if (!question) {
        return [];
      }

      const safe: SafeQuestion = {
        domainId: question.domainId,
        id: question.id,
        options: question.options,
        prompt: question.prompt,
        sources: question.sources,
        type: question.type,
      };

      if (reveal) {
        safe.answerIds = question.answerIds;
        safe.explanation = question.explanation;
      }

      return [safe];
    });

    const attempt: MockAttempt = {
      answers,
      deadline,
      durationMinutes: Number(column(row, 'durationMinutes')),
      examId: String(column(row, 'examId')),
      id: String(column(row, 'id')),
      packId: String(column(row, 'packId')),
      packVersion: String(column(row, 'packVersion')),
      questionIds,
      questions,
      remainingMilliseconds: remainingMilliseconds(deadline, now),
      status,
    };

    if (reveal) {
      const domains = pack.domains.map((domain) => {
        const domainQuestions = questions.filter((question) => question.domainId === domain.id);

        const correct = domainQuestions.filter((question) => {
          const submitted =
            answers.find((answer) => answer.questionId === question.id)?.answerIds ?? [];

          const correctIds = question.answerIds ?? [];

          return (
            correctIds.length === submitted.length &&
            correctIds.every((answerId) => submitted.includes(answerId))
          );
        }).length;

        const total = domainQuestions.length;

        return {
          correct,
          id: domain.id,
          percent: total ? Math.round((correct * PERCENTAGE_SCALE) / total) : 0,
          title: domain.title,
          total,
        };
      });

      const correct = domains.reduce((sum, domain) => sum + domain.correct, 0);
      const total = questions.length;
      attempt.score = {
        correct,
        domains,
        percent: total ? Math.round((correct * PERCENTAGE_SCALE) / total) : 0,
        total,
      };

      if (pack.passingThreshold !== undefined) {
        attempt.score.passingThreshold = pack.passingThreshold;
        attempt.score.passed = attempt.score.percent >= pack.passingThreshold;
      }

      attempt.answers = answers.map((answer) => {
        const question = questions.find((item) => item.id === answer.questionId);
        const correctAnswer = question?.answerIds ?? [];

        const mockAnswer: MockAnswer = {
          ...answer,
          correct:
            correctAnswer.length === answer.answerIds.length &&
            correctAnswer.every((answerId) => answer.answerIds.includes(answerId)),
        };

        if (question?.explanation !== undefined) {
          mockAnswer.explanation = question.explanation;
        }

        return mockAnswer;
      });
    }

    return attempt;
  } finally {
    database.close();
  }
};

export const createMockAttempt = (options: {
  databasePath?: string;
  examId: string;
  packId: string;
  packVersion: string;
  questionCount: number;
  durationMinutes: number;
  random?: () => number;
  now?: number;
}): MockAttempt => {
  const databasePath = dbPath(options.databasePath);

  const importedPack = getImportedPack(
    options.examId,
    options.packId,
    options.packVersion,
    databasePath,
  );

  if (!importedPack) {
    httpError(HTTP_NOT_FOUND, 'That imported exam pack version is not available.');
  }

  const pack = getEffectivePack(databasePath, importedPack);

  if (
    !Number.isInteger(options.durationMinutes) ||
    options.durationMinutes < 1 ||
    options.durationMinutes > MAX_MOCK_DURATION_MINUTES
  ) {
    httpError(
      HTTP_BAD_REQUEST,
      `Duration must be between 1 and ${MAX_MOCK_DURATION_MINUTES} minutes.`,
    );
  }

  const coverage = getMockCoverage(
    databasePath,
    options.examId,
    options.packId,
    options.packVersion,
    options.questionCount,
  );

  if (coverage.gaps.length) {
    httpError(
      HTTP_BAD_REQUEST,
      `Insufficient weighted mock coverage: ${coverage.gaps.map((gap) => `${gap.title} requires ${gap.required}, has ${gap.available}`).join('; ')}.`,
    );
  }

  const random = options.random ?? Math.random;

  const questionIds = pack.domains.flatMap((domain) => {
    const count = coverage.allocations[domain.id] ?? 0;
    const questions = pack.questions.filter((question) => question.domainId === domain.id);

    for (let index = questions.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      const current = questions[index];
      const selected = questions[target];

      if (!current || !selected) {
        continue;
      }

      questions[index] = selected;
      questions[target] = current;
    }

    return questions.slice(0, count).map((question) => question.id);
  });

  const now = options.now ?? Date.now();
  const deadline = createDeadline(now, options.durationMinutes);
  const id = randomUUID();
  const database = openPackDatabase(databasePath);

  try {
    database
      .prepare(
        `INSERT INTO mock_attempts (
      id, exam_id, pack_id, pack_version, question_ids_json, duration_minutes, deadline, status, question_snapshot_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'in_progress', ?)`,
      )
      .run(
        id,
        options.examId,
        options.packId,
        options.packVersion,
        JSON.stringify(questionIds),
        options.durationMinutes,
        deadline,
        JSON.stringify(pack.questions),
      );
  } finally {
    database.close();
  }

  const attempt = readMockAttempt(databasePath, id, now);

  if (!attempt) {
    throw new Error('Could not load the new mock attempt.');
  }

  return attempt;
};

export const getMockAttempt = (databasePath: string, id: string, now = Date.now()) =>
  readMockAttempt(dbPath(databasePath), id, now);

export const saveMockAnswer = (
  databasePath: string,
  attemptId: string,
  questionId: string,
  answerIds: string[],
  now = Date.now(),
): MockAttempt => {
  const path = dbPath(databasePath);
  const attempt = readMockAttempt(path, attemptId, now);

  if (!attempt) {
    httpError(HTTP_NOT_FOUND, 'Mock attempt not found.');
  }

  if (attempt.status !== 'in_progress') {
    httpError(HTTP_BAD_REQUEST, 'This mock attempt is closed.');
  }

  const question = attempt.questions.find((item) => item.id === questionId);

  if (!question) {
    httpError(HTTP_BAD_REQUEST, 'That question is not part of this mock.');
  }

  const selected = [...new Set(answerIds)];

  if (
    !selected.length ||
    selected.some((answerId) => !question.options.some((option) => option.id === answerId))
  ) {
    httpError(HTTP_BAD_REQUEST, 'Select a valid answer.');
  }

  const database = openPackDatabase(path);

  try {
    database
      .prepare(
        `
      INSERT INTO mock_answers (attempt_id, question_id, answer_ids_json) VALUES (?, ?, ?)
      ON CONFLICT(attempt_id, question_id) DO UPDATE SET
        answer_ids_json = excluded.answer_ids_json, answered_at = CURRENT_TIMESTAMP
    `,
      )
      .run(attemptId, questionId, JSON.stringify(selected));
  } finally {
    database.close();
  }

  const saved = readMockAttempt(path, attemptId, now);

  if (!saved) {
    httpError(HTTP_NOT_FOUND, 'Mock attempt not found.');
  }

  return saved;
};

export const submitMockAttempt = (
  databasePath: string,
  attemptId: string,
  now = Date.now(),
): MockAttempt => {
  const path = dbPath(databasePath);
  const current = readMockAttempt(path, attemptId, now);

  if (!current) {
    httpError(HTTP_NOT_FOUND, 'Mock attempt not found.');
  }

  if (current.status === 'in_progress') {
    const database = openPackDatabase(path);

    try {
      database
        .prepare(
          "UPDATE mock_attempts SET status = 'submitted' WHERE id = ? AND status = 'in_progress'",
        )
        .run(attemptId);
    } finally {
      database.close();
    }
  }

  const submitted = readMockAttempt(path, attemptId, now);

  if (!submitted) {
    httpError(HTTP_NOT_FOUND, 'Mock attempt not found.');
  }

  return submitted;
};

export const getResumableMockAttempt = (
  databasePath: string,
  now = Date.now(),
): MockAttempt | undefined => {
  const path = dbPath(databasePath);
  const database = openPackDatabase(path);

  try {
    const row = database
      .prepare(
        `
      SELECT id FROM mock_attempts WHERE status = 'in_progress'
      ORDER BY created_at DESC, rowid DESC LIMIT 1
    `,
      )
      .get();

    return row ? readMockAttempt(path, String(column(row, 'id')), now) : undefined;
  } finally {
    database.close();
  }
};
