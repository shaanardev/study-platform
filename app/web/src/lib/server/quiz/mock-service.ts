import { randomUUID } from 'node:crypto';

import { error as httpError } from '@sveltejs/kit';

import {
  MAX_MOCK_DURATION_MINUTES,
  MAX_QUESTION_COUNT,
  PERCENTAGE_SCALE,
} from '#lib/quiz/constants.js';
import type { AppDatabase } from '#lib/server/database/connection.js';
import { getEffectivePack } from '#lib/server/feedback/service.js';
import { HTTP_BAD_REQUEST, HTTP_NOT_FOUND } from '#lib/server/http-status.js';
import { getImportedPack } from '#lib/server/packs/repository.js';
import { allocateWeightedQuestions, findCoverageGaps } from '#lib/server/quiz/mock-selection.js';
import { createDeadline, isExpired, remainingMilliseconds } from '#lib/server/quiz/timing.js';
import type { PackQuestion } from '@learning-platform/exam-pack';

import {
  createMockAttemptRecord,
  expireMockAttempt,
  getMockAttemptRecord,
  getResumableMockAttemptId,
  saveMockAnswerRecord,
  setMockAttemptStatus,
} from './repository.js';

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

export const getMockCoverage = async (
  examId: string,
  packId: string,
  packVersion: string,
  questionCount: number,
  database?: AppDatabase,
) => {
  const importedPack = await getImportedPack(examId, packId, packVersion, database);
  if (!importedPack) {
    httpError(HTTP_NOT_FOUND, 'That imported exam pack version is not available.');
  }
  const pack = await getEffectivePack(importedPack, database);
  if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > MAX_QUESTION_COUNT) {
    httpError(HTTP_BAD_REQUEST, `Mock question count must be between 1 and ${MAX_QUESTION_COUNT}.`);
  }
  const counts = Object.fromEntries(
    pack.domains.map((domain) => [
      domain.id,
      pack.questions.filter((q) => q.domainId === domain.id).length,
    ]),
  );
  return {
    allocations: allocateWeightedQuestions(pack.domains, questionCount),
    gaps: findCoverageGaps(pack.domains, counts, questionCount),
    questionCount,
  };
};

const readMockAttempt = async (
  id: string,
  database?: AppDatabase,
  now = Date.now(),
): Promise<MockAttempt | undefined> => {
  const stored = await getMockAttemptRecord(id, database);
  if (!stored) {
    return undefined;
  }
  const { attempt: row, answers: answerRows } = stored;
  const pack = await getImportedPack(row.exam_id, row.pack_id, row.pack_version, database);
  if (!pack) {
    return undefined;
  }
  let status: MockAttempt['status'] = row.status;
  if (status === 'in_progress' && isExpired(row.deadline, now)) {
    status = 'expired';
    await expireMockAttempt(id, database);
  }
  const attemptQuestions = row.question_snapshot;
  const answers = answerRows.map((answer) => ({
    answerIds: answer.answer_ids,
    questionId: answer.question_id,
  }));
  const reveal = status !== 'in_progress';
  const questions: SafeQuestion[] = row.question_ids.flatMap((questionId) => {
    const q = attemptQuestions.find((item) => item.id === questionId);
    if (!q) {
      return [];
    }
    const safe: SafeQuestion = {
      domainId: q.domainId,
      id: q.id,
      options: q.options,
      prompt: q.prompt,
      sources: q.sources,
      type: q.type,
    };
    if (reveal) {
      safe.answerIds = q.answerIds;
      safe.explanation = q.explanation;
    }
    return [safe];
  });
  const result: MockAttempt = {
    answers,
    deadline: row.deadline,
    durationMinutes: row.duration_minutes,
    examId: row.exam_id,
    id: row.id,
    packId: row.pack_id,
    packVersion: row.pack_version,
    questionIds: row.question_ids,
    questions,
    remainingMilliseconds: remainingMilliseconds(row.deadline, now),
    status,
  };
  if (reveal) {
    const domains = pack.domains.map((domain) => {
      const domainQuestions = questions.filter((q) => q.domainId === domain.id);
      const correct = domainQuestions.filter((q) => {
        const submitted = answers.find((a) => a.questionId === q.id)?.answerIds ?? [];
        const correctIds = q.answerIds ?? [];
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
    const correct = domains.reduce((sum, d) => sum + d.correct, 0);
    const total = questions.length;
    result.score = {
      correct,
      domains,
      percent: total ? Math.round((correct * PERCENTAGE_SCALE) / total) : 0,
      total,
    };
    if (pack.passingThreshold !== undefined) {
      result.score.passingThreshold = pack.passingThreshold;
      result.score.passed = result.score.percent >= pack.passingThreshold;
    }
    result.answers = answers.map((answer) => {
      const q = questions.find((item) => item.id === answer.questionId);
      const correctIds = q?.answerIds ?? [];
      return {
        ...answer,
        correct:
          correctIds.length === answer.answerIds.length &&
          correctIds.every((answerId) => answer.answerIds.includes(answerId)),
        ...(q ? { explanation: q.explanation } : {}),
      };
    });
  }
  return result;
};

export const createMockAttempt = async (options: {
  database?: AppDatabase;
  examId: string;
  packId: string;
  packVersion: string;
  questionCount: number;
  durationMinutes: number;
  random?: () => number;
  now?: number;
}): Promise<MockAttempt> => {
  const importedPack = await getImportedPack(
    options.examId,
    options.packId,
    options.packVersion,
    options.database,
  );
  if (!importedPack) {
    httpError(HTTP_NOT_FOUND, 'That imported exam pack version is not available.');
  }
  const pack = await getEffectivePack(importedPack, options.database);
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
  const coverage = await getMockCoverage(
    options.examId,
    options.packId,
    options.packVersion,
    options.questionCount,
    options.database,
  );
  if (coverage.gaps.length) {
    httpError(
      400,
      `Insufficient weighted mock coverage: ${coverage.gaps.map((gap) => `${gap.title} requires ${gap.required}, has ${gap.available}`).join('; ')}.`,
    );
  }
  const random = options.random ?? Math.random;
  const questionIds = pack.domains.flatMap((domain) => {
    const count = coverage.allocations[domain.id] ?? 0;
    const questions = pack.questions.filter((q) => q.domainId === domain.id);
    for (let i = questions.length - 1; i > 0; i -= 1) {
      const target = Math.floor(random() * (i + 1));
      const current = questions[i];
      const selected = questions[target];
      if (current !== undefined && selected !== undefined) {
        questions[i] = selected;
        questions[target] = current;
      }
    }
    return questions.slice(0, count).map((q) => q.id);
  });
  const now = options.now ?? Date.now();
  const id = randomUUID();
  await createMockAttemptRecord(
    {
      deadline: createDeadline(now, options.durationMinutes),
      duration_minutes: options.durationMinutes,
      exam_id: options.examId,
      id,
      pack_id: options.packId,
      pack_version: options.packVersion,
      question_ids: questionIds,
      question_snapshot: pack.questions,
      status: 'in_progress',
    },
    options.database,
  );
  const attempt = await readMockAttempt(id, options.database, now);
  if (!attempt) {
    throw new Error('Could not load the new mock attempt.');
  }
  return attempt;
};

export const getMockAttempt = async (id: string, database?: AppDatabase, now = Date.now()) =>
  await readMockAttempt(id, database, now);
export const getResumableMockAttempt = async (database?: AppDatabase, now = Date.now()) => {
  const id = await getResumableMockAttemptId(database);
  return id === undefined ? undefined : await readMockAttempt(id, database, now);
};
export const saveMockAnswer = async (
  attemptId: string,
  questionId: string,
  answerIds: string[],
  database?: AppDatabase,
  now = Date.now(),
): Promise<MockAttempt> => {
  const attempt = await readMockAttempt(attemptId, database, now);
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
    selected.some((id) => !question.options.some((option) => option.id === id))
  ) {
    httpError(HTTP_BAD_REQUEST, 'Select a valid answer.');
  }
  await saveMockAnswerRecord(
    attemptId,
    questionId,
    selected,
    new Date(now).toISOString(),
    database,
  );
  const saved = await readMockAttempt(attemptId, database, now);
  if (!saved) {
    httpError(HTTP_NOT_FOUND, 'Mock attempt not found.');
  }
  return saved;
};
export const submitMockAttempt = async (
  attemptId: string,
  database?: AppDatabase,
  now = Date.now(),
): Promise<MockAttempt> => {
  const current = await readMockAttempt(attemptId, database, now);
  if (!current) {
    httpError(HTTP_NOT_FOUND, 'Mock attempt not found.');
  }
  if (current.status === 'in_progress') {
    await setMockAttemptStatus(attemptId, 'submitted', database);
  }
  const submitted = await readMockAttempt(attemptId, database, now);
  if (!submitted) {
    httpError(HTTP_NOT_FOUND, 'Mock attempt not found.');
  }
  return submitted;
};
