import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { error } from '@sveltejs/kit';
import { getImportedPack, openPackDatabase } from '../db/packs';
import type { PackQuestion } from '../packs/validate';
import { allocateWeightedQuestions, findCoverageGaps } from './mock-selection';
import { createDeadline, isExpired, remainingMilliseconds } from './timing';

type SafeQuestion = Omit<PackQuestion, 'answerIds' | 'explanation'> & { explanation?: string; answerIds?: string[] };
type MockAnswer = { questionId: string; answerIds: string[]; correct?: boolean; explanation?: string };
export type MockAttempt = {
  id: string; examId: string; packId: string; packVersion: string; questionIds: string[];
  durationMinutes: number; deadline: number; remainingMilliseconds: number;
  status: 'in_progress' | 'submitted' | 'expired'; answers: MockAnswer[]; questions: SafeQuestion[];
  score?: { correct: number; total: number; percent: number; domains: { id: string; title: string; correct: number; total: number; percent: number }[]; passingThreshold?: number; passed?: boolean };
};

const dbPath = (path?: string) => resolve(path ?? '.local/exam-packs.sqlite');

export function getMockCoverage(databasePath: string, examId: string, packId: string, packVersion: string, questionCount: number) {
  const pack = getImportedPack(examId, packId, packVersion, dbPath(databasePath));
  if (!pack) error(404, 'That imported exam pack version is not available.');
  if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 100) error(400, 'Mock question count must be between 1 and 100.');
  const counts = Object.fromEntries(pack.domains.map((domain) => [domain.id, pack.questions.filter((question) => question.domainId === domain.id).length]));
  return { questionCount, allocations: allocateWeightedQuestions(pack.domains, questionCount), gaps: findCoverageGaps(pack.domains, counts, questionCount) };
}

function readMockAttempt(databasePath: string, id: string, now = Date.now()): MockAttempt | undefined {
  const database = openPackDatabase(databasePath);
  try {
    const row = database.prepare(`SELECT id, exam_id AS examId, pack_id AS packId, pack_version AS packVersion,
      question_ids_json AS questionIds, duration_minutes AS durationMinutes, deadline, status
      FROM mock_attempts WHERE id = ?`).get(id);
    if (!row) return undefined;
    const pack = getImportedPack(String(row.examId), String(row.packId), String(row.packVersion), databasePath);
    if (!pack) return undefined;
    let status = String(row.status) as MockAttempt['status'];
    const deadline = Number(row.deadline);
    if (status === 'in_progress' && isExpired(deadline, now)) {
      status = 'expired';
      database.prepare("UPDATE mock_attempts SET status = 'expired' WHERE id = ?").run(id);
    }
    const questionIds = JSON.parse(String(row.questionIds)) as string[];
    const answers = database.prepare(`SELECT question_id AS questionId, answer_ids_json AS answerIds FROM mock_answers WHERE attempt_id = ? ORDER BY rowid`).all(id)
      .map((answer) => ({ questionId: String(answer.questionId), answerIds: JSON.parse(String(answer.answerIds)) as string[] }));
    const reveal = status !== 'in_progress';
    const questions: SafeQuestion[] = questionIds.flatMap((questionId) => {
      const question = pack.questions.find((item) => item.id === questionId);
      if (!question) return [];
      const safe: SafeQuestion = { id: question.id, type: question.type, domainId: question.domainId, prompt: question.prompt, options: question.options, sources: question.sources };
      if (reveal) { safe.answerIds = question.answerIds; safe.explanation = question.explanation; }
      return [safe];
    });
    const attempt: MockAttempt = {
      id: String(row.id), examId: String(row.examId), packId: String(row.packId), packVersion: String(row.packVersion),
      questionIds, durationMinutes: Number(row.durationMinutes), deadline, remainingMilliseconds: remainingMilliseconds(deadline, now), status, answers, questions,
    };
    if (reveal) {
      const domains = pack.domains.map((domain) => {
        const domainQuestions = questions.filter((question) => question.domainId === domain.id);
        const correct = domainQuestions.filter((question) => {
          const submitted = answers.find((answer) => answer.questionId === question.id)?.answerIds ?? [];
          const correctIds = question.answerIds ?? [];
          return correctIds.length === submitted.length && correctIds.every((id) => submitted.includes(id));
        }).length;
        const total = domainQuestions.length;
        return { id: domain.id, title: domain.title, correct, total, percent: total ? Math.round(correct * 100 / total) : 0 };
      });
      const correct = domains.reduce((sum, domain) => sum + domain.correct, 0);
      const total = questions.length;
      attempt.score = { correct, total, percent: total ? Math.round(correct * 100 / total) : 0, domains };
      if (pack.passingThreshold !== undefined) {
        attempt.score.passingThreshold = pack.passingThreshold;
        attempt.score.passed = attempt.score.percent >= pack.passingThreshold;
      }
      attempt.answers = answers.map((answer) => {
        const question = questions.find((item) => item.id === answer.questionId);
        const correctAnswer = question?.answerIds ?? [];
        return { ...answer, correct: correctAnswer.length === answer.answerIds.length && correctAnswer.every((id) => answer.answerIds.includes(id)), explanation: question?.explanation };
      });
    }
    return attempt;
  } finally { database.close(); }
}

export function createMockAttempt(options: {
  databasePath?: string;
  examId: string;
  packId: string;
  packVersion: string;
  questionCount: number;
  durationMinutes: number;
  random?: () => number;
  now?: number;
}): MockAttempt {
  const databasePath = dbPath(options.databasePath);
  const pack = getImportedPack(options.examId, options.packId, options.packVersion, databasePath);
  if (!pack) error(404, 'That imported exam pack version is not available.');
  if (!Number.isInteger(options.durationMinutes) || options.durationMinutes < 1 || options.durationMinutes > 600) error(400, 'Duration must be between 1 and 600 minutes.');
  const coverage = getMockCoverage(databasePath, options.examId, options.packId, options.packVersion, options.questionCount);
  if (coverage.gaps.length) error(400, `Insufficient weighted mock coverage: ${coverage.gaps.map((gap) => `${gap.title} requires ${gap.required}, has ${gap.available}`).join('; ')}.`);
  const random = options.random ?? Math.random;
  const questionIds = pack.domains.flatMap((domain) => {
    const count = coverage.allocations[domain.id] ?? 0;
    const questions = pack.questions.filter((question) => question.domainId === domain.id);
    for (let index = questions.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [questions[index], questions[target]] = [questions[target]!, questions[index]!];
    }
    return questions.slice(0, count).map((question) => question.id);
  });
  const now = options.now ?? Date.now();
  const deadline = createDeadline(now, options.durationMinutes);
  const id = randomUUID();
  const database = openPackDatabase(databasePath);
  try {
    database.prepare(`INSERT INTO mock_attempts (
      id, exam_id, pack_id, pack_version, question_ids_json, duration_minutes, deadline, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'in_progress')`).run(
      id,
      options.examId,
      options.packId,
      options.packVersion,
      JSON.stringify(questionIds),
      options.durationMinutes,
      deadline,
    );
  } finally { database.close(); }
  const attempt = readMockAttempt(databasePath, id, now);
  if (!attempt) throw new Error('Could not load the new mock attempt.');
  return attempt;
}

export function getMockAttempt(databasePath: string, id: string, now = Date.now()) {
  return readMockAttempt(dbPath(databasePath), id, now);
}

export function saveMockAnswer(databasePath: string, attemptId: string, questionId: string, answerIds: string[], now = Date.now()): MockAttempt {
  const path = dbPath(databasePath);
  const attempt = readMockAttempt(path, attemptId, now);
  if (!attempt) error(404, 'Mock attempt not found.');
  if (attempt.status !== 'in_progress') error(400, 'This mock attempt is closed.');
  const question = attempt.questions.find((item) => item.id === questionId);
  if (!question) error(400, 'That question is not part of this mock.');
  const selected = [...new Set(answerIds)];
  if (
    !selected.length ||
    selected.some((answerId) => !question.options.some((option) => option.id === answerId))
  ) {
    error(400, 'Select a valid answer.');
  }
  const database = openPackDatabase(path);
  try {
    database.prepare(`
      INSERT INTO mock_answers (attempt_id, question_id, answer_ids_json) VALUES (?, ?, ?)
      ON CONFLICT(attempt_id, question_id) DO UPDATE SET
        answer_ids_json = excluded.answer_ids_json, answered_at = CURRENT_TIMESTAMP
    `).run(attemptId, questionId, JSON.stringify(selected));
  } finally {
    database.close();
  }
  return readMockAttempt(path, attemptId, now)!;
}

export function submitMockAttempt(databasePath: string, attemptId: string, now = Date.now()): MockAttempt {
  const path = dbPath(databasePath);
  const current = readMockAttempt(path, attemptId, now);
  if (!current) error(404, 'Mock attempt not found.');
  if (current.status === 'in_progress') {
    const database = openPackDatabase(path);
    try {
      database.prepare("UPDATE mock_attempts SET status = 'submitted' WHERE id = ? AND status = 'in_progress'").run(attemptId);
    } finally {
      database.close();
    }
  }
  return readMockAttempt(path, attemptId, now)!;
}

export function getResumableMockAttempt(databasePath: string, now = Date.now()): MockAttempt | undefined {
  const path = dbPath(databasePath);
  const database = openPackDatabase(path);
  try {
    const row = database.prepare(`
      SELECT id FROM mock_attempts WHERE status = 'in_progress'
      ORDER BY created_at DESC, rowid DESC LIMIT 1
    `).get();
    return row ? readMockAttempt(path, String(row.id), now) : undefined;
  } finally { database.close(); }
}
