import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { SQLOutputValue } from 'node:sqlite';

import { validateExamPack } from '@learning-platform/exam-pack';
import type { ExamPack, PackQuestion } from '@learning-platform/exam-pack';
import { error as httpError } from '@sveltejs/kit';

import { MAX_QUESTION_COUNT } from '#lib/quiz/constants.js';
import {
  getApprovedSourceRoot,
  getImportedPack,
  getImportedSourceAsset,
  openPackDatabase,
} from '#lib/server/db/packs.js';
import { getEffectivePack } from '#lib/server/feedback/service.js';
import { HTTP_BAD_REQUEST, HTTP_NOT_FOUND } from '#lib/server/http-status.js';
import { decodeJsonStringArray, decodeJsonText } from '#lib/server/json.js';
import { workspacePath } from '#lib/server/workspace-paths.js';

export interface QuizAnswer {
  questionId: string;
  answerIds: string[];
  correct: boolean;
  answerIdsCorrect: string[];
  explanation: string;
  sources: PackQuestion['sources'];
  answeredAt: string;
}

export type PracticeQuestion = Omit<PackQuestion, 'answerIds'>;

export interface PracticeSession {
  id: string;
  examId: string;
  packId: string;
  packVersion: string;
  domainIds: string[];
  questionIds: string[];
  status: 'in_progress' | 'completed';
  createdAt: string;
  updatedAt: string;
  answers: QuizAnswer[];
  questions: PracticeQuestion[];
}

export interface StartPracticeOptions {
  databasePath?: string;
  examId: string;
  packId: string;
  packVersion: string;
  domainIds?: string[];
  questionCount: number;
  questionIds?: string[];
  random?: () => number;
}

type DatabaseRow = Record<string, SQLOutputValue>;

const column = (row: DatabaseRow, name: string): SQLOutputValue | undefined => row[name];

const parseStringArray = (value: SQLOutputValue | undefined): string[] => {
  try {
    return decodeJsonStringArray(String(value));
  } catch {
    throw new Error('Stored practice session data is invalid.');
  }
};

const parsePracticeStatus = (value: SQLOutputValue | undefined): PracticeSession['status'] => {
  if (value === 'in_progress' || value === 'completed') {
    return value;
  }

  throw new Error('Stored practice session status is invalid.');
};

const parseQuestionSnapshot = (
  value: SQLOutputValue | undefined,
  basePack: ExamPack,
): PackQuestion[] => {
  const storedQuestions = decodeJsonText(String(value));

  const questions = {
    ...basePack,
    questions: storedQuestions,
  };

  const result = validateExamPack(questions);

  if (!result.valid) {
    throw new Error('Stored practice session questions are invalid.');
  }

  return result.pack.questions;
};

const containsInvalidAnswer = (submitted: string[], options: PackQuestion['options']): boolean =>
  submitted.some((id) => !options.some((option) => option.id === id));

const matchesAnswerSet = (submitted: string[], correct: string[]): boolean =>
  submitted.length === correct.length && correct.every((id) => submitted.includes(id));

const dbPath = (pathInput?: string) =>
  path.resolve(pathInput ?? workspacePath('.local/exam-packs.sqlite'));

const readSession = (databasePath: string, id: string): PracticeSession | undefined => {
  const database = openPackDatabase(databasePath);

  try {
    const row = database
      .prepare(
        `
      SELECT id, exam_id AS examId, pack_id AS packId, pack_version AS packVersion,
        domain_ids_json AS domainIds, question_ids_json AS questionIds, status,
        created_at AS createdAt, updated_at AS updatedAt, question_snapshot_json AS questionSnapshot
      FROM practice_sessions WHERE id = ?
    `,
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

    const questionSnapshot = column(row, 'questionSnapshot');

    const sessionQuestions =
      questionSnapshot !== undefined && questionSnapshot !== null
        ? parseQuestionSnapshot(questionSnapshot, pack)
        : pack.questions;

    const answers = database
      .prepare(
        `
      SELECT question_id AS questionId, answer_ids_json AS answerIds, correct,
        answered_at AS answeredAt
      FROM practice_answers WHERE session_id = ? ORDER BY answered_at, rowid
    `,
      )
      .all(id)
      .map((answer) => {
        const questionId = String(column(answer, 'questionId'));
        const question = sessionQuestions.find((item) => item.id === questionId);

        return {
          answerIds: parseStringArray(column(answer, 'answerIds')),
          answerIdsCorrect: question?.answerIds ?? [],
          answeredAt: String(column(answer, 'answeredAt')),
          correct: Boolean(column(answer, 'correct')),
          explanation: question?.explanation ?? '',
          questionId,
          sources: question?.sources ?? [],
        };
      });

    const session: Omit<PracticeSession, 'questions'> = {
      answers,
      createdAt: String(column(row, 'createdAt')),
      domainIds: parseStringArray(column(row, 'domainIds')),
      examId: String(column(row, 'examId')),
      id: String(column(row, 'id')),
      packId: String(column(row, 'packId')),
      packVersion: String(column(row, 'packVersion')),
      questionIds: parseStringArray(column(row, 'questionIds')),
      status: parsePracticeStatus(column(row, 'status')),
      updatedAt: String(column(row, 'updatedAt')),
    };

    return {
      ...session,
      questions: session.questionIds.flatMap((questionId) => {
        const question = sessionQuestions.find((item) => item.id === questionId);

        if (!question) {
          return [];
        }

        const safeQuestion: PracticeQuestion = {
          domainId: question.domainId,
          explanation: question.explanation,
          id: question.id,
          options: question.options,
          prompt: question.prompt,
          sources: question.sources,
          type: question.type,
        };

        return [safeQuestion];
      }),
    };
  } finally {
    database.close();
  }
};

export const createPracticeSession = (options: StartPracticeOptions): PracticeSession => {
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
  const domainIds = [...new Set(options.domainIds)];

  if (domainIds.some((id) => !pack.domains.some((domain) => domain.id === id))) {
    httpError(HTTP_BAD_REQUEST, 'Choose domains from this exam pack.');
  }

  if (
    !Number.isInteger(options.questionCount) ||
    options.questionCount < 1 ||
    options.questionCount > MAX_QUESTION_COUNT
  ) {
    httpError(HTTP_BAD_REQUEST, `Question count must be between 1 and ${MAX_QUESTION_COUNT}.`);
  }

  const selectedQuestionIds = options.questionIds ? [...new Set(options.questionIds)] : undefined;

  if (
    selectedQuestionIds?.some((id) => !pack.questions.some((question) => question.id === id)) ===
    true
  ) {
    httpError(HTTP_BAD_REQUEST, 'Choose questions from this exam pack version.');
  }

  const candidates = pack.questions.filter((question) =>
    selectedQuestionIds
      ? selectedQuestionIds.includes(question.id)
      : domainIds.length === 0 || domainIds.includes(question.domainId),
  );

  if (
    options.questionCount > candidates.length ||
    (selectedQuestionIds !== undefined && options.questionCount !== selectedQuestionIds.length)
  ) {
    httpError(HTTP_BAD_REQUEST, 'There are not that many questions in the selected domains.');
  }

  const database = openPackDatabase(databasePath);

  try {
    const history = database
      .prepare(
        `
      SELECT a.question_id AS questionId, MAX(CASE WHEN a.correct = 0 THEN 1 ELSE 0 END) AS missed,
        COUNT(a.question_id) AS seen
      FROM practice_answers a JOIN practice_sessions s ON s.id = a.session_id
      WHERE s.exam_id = ? AND s.pack_id = ? AND s.pack_version = ?
      GROUP BY a.question_id
    `,
      )
      .all(options.examId, options.packId, options.packVersion);

    const states = new Map(
      history.map((row) => [
        String(column(row, 'questionId')),
        { missed: Boolean(column(row, 'missed')), seen: Number(column(row, 'seen')) > 0 },
      ]),
    );

    const random = options.random ?? Math.random;

    const shuffle = (items: PackQuestion[]) => {
      const shuffled = [...items];

      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const other = Math.floor(random() * (index + 1));
        const current = shuffled[index];
        const alternative = shuffled[other];

        if (!current || !alternative) {
          continue;
        }

        shuffled[index] = alternative;
        shuffled[other] = current;
      }

      return shuffled;
    };

    const unseen = shuffle(candidates.filter((question) => states.get(question.id)?.seen !== true));

    const missed = shuffle(
      candidates.filter((question) => states.get(question.id)?.missed === true),
    );

    const otherSeen = shuffle(
      candidates.filter(
        (question) =>
          states.get(question.id)?.seen === true && states.get(question.id)?.missed !== true,
      ),
    );

    const questionIds = [...unseen, ...missed, ...otherSeen]
      .slice(0, options.questionCount)
      .map((question) => question.id);

    const id = randomUUID();
    database
      .prepare(
        `
      INSERT INTO practice_sessions (id, exam_id, pack_id, pack_version, domain_ids_json,
        question_ids_json, status, question_snapshot_json) VALUES (?, ?, ?, ?, ?, ?, 'in_progress', ?)
    `,
      )
      .run(
        id,
        options.examId,
        options.packId,
        options.packVersion,
        JSON.stringify(domainIds),
        JSON.stringify(questionIds),
        JSON.stringify(pack.questions),
      );
    const created = readSession(databasePath, id);

    if (!created) {
      throw new Error('Could not load the new practice session.');
    }

    return created;
  } finally {
    database.close();
  }
};

export const getPracticeSession = (databasePath: string, id: string): PracticeSession | undefined =>
  readSession(dbPath(databasePath), id);

export const getResumablePracticeSession = (databasePath: string): PracticeSession | undefined => {
  const database = openPackDatabase(dbPath(databasePath));

  try {
    const row = database
      .prepare(
        `SELECT id FROM practice_sessions WHERE status = 'in_progress' ORDER BY updated_at DESC, rowid DESC LIMIT 1`,
      )
      .get();

    return row ? readSession(dbPath(databasePath), String(column(row, 'id'))) : undefined;
  } finally {
    database.close();
  }
};

export const answerQuestion = (
  databasePath: string,
  sessionId: string,
  questionId: string,
  answerIds: string[],
): QuizAnswer => {
  const session = getPracticeSession(databasePath, sessionId);

  if (session?.status !== 'in_progress') {
    httpError(HTTP_NOT_FOUND, 'This practice session is no longer in progress.');
  }

  const question = session.questions.find((item) => item.id === questionId);

  if (!question || session.answers.some((answer) => answer.questionId === questionId)) {
    httpError(HTTP_BAD_REQUEST, 'That question cannot be answered in this session.');
  }

  const importedPack = getImportedPack(
    session.examId,
    session.packId,
    session.packVersion,
    dbPath(databasePath),
  );

  const database = openPackDatabase(dbPath(databasePath));
  let questionSnapshot = importedPack?.questions ?? [];

  try {
    const row = database
      .prepare('SELECT question_snapshot_json AS snapshot FROM practice_sessions WHERE id = ?')
      .get(sessionId);

    const snapshot = row ? column(row, 'snapshot') : undefined;

    if (snapshot !== undefined && snapshot !== null && importedPack !== undefined) {
      questionSnapshot = parseQuestionSnapshot(snapshot, importedPack);
    }
  } finally {
    database.close();
  }

  const correctQuestion =
    questionSnapshot.find((item) => item.id === questionId) ??
    importedPack?.questions.find((item) => item.id === questionId);

  if (!correctQuestion) {
    httpError(HTTP_NOT_FOUND, 'Question not found in the imported pack version.');
  }

  const submitted = [...new Set(answerIds)];

  if (submitted.length === 0 || containsInvalidAnswer(submitted, question.options)) {
    httpError(HTTP_BAD_REQUEST, 'Select a valid answer before continuing.');
  }

  const correct = matchesAnswerSet(submitted, correctQuestion.answerIds);
  const answerDatabase = openPackDatabase(dbPath(databasePath));

  try {
    answerDatabase.exec('BEGIN');
    answerDatabase
      .prepare(
        `INSERT INTO practice_answers (session_id, question_id, answer_ids_json, correct) VALUES (?, ?, ?, ?) `,
      )
      .run(sessionId, questionId, JSON.stringify(submitted), Number(correct));

    const answerCountRow = answerDatabase
      .prepare('SELECT COUNT(*) AS count FROM practice_answers WHERE session_id = ?')
      .get(sessionId);

    const answerCount = Number(answerCountRow ? column(answerCountRow, 'count') : 0);
    answerDatabase
      .prepare(
        `UPDATE practice_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .run(answerCount >= session.questionIds.length ? 'completed' : 'in_progress', sessionId);
    answerDatabase.exec('COMMIT');
  } catch (error) {
    try {
      answerDatabase.exec('ROLLBACK');
    } catch {
      /* preserve the original error */
    }

    throw error;
  } finally {
    answerDatabase.close();
  }

  return {
    answerIds: submitted,
    answerIdsCorrect: correctQuestion.answerIds,
    answeredAt: new Date().toISOString(),
    correct,
    explanation: correctQuestion.explanation,
    questionId,
    sources: correctQuestion.sources,
  };
};

export const readQuestionSource = async (
  databasePath: string,
  examId: string,
  packId: string,
  packVersion: string,
  questionId: string,
  sourcePath: string,
) => {
  const pack = getImportedPack(examId, packId, packVersion, dbPath(databasePath));

  const source = pack?.questions
    .find((question) => question.id === questionId)
    ?.sources.find((item) => item.path === sourcePath);

  if (!source) {
    if (/^[a-zA-Z][a-zA-Z\d+.-]*:/u.test(sourcePath) && !sourcePath.startsWith('file:///')) {
      httpError(HTTP_BAD_REQUEST, 'Citation URL scheme is unsupported.');
    }

    httpError(HTTP_NOT_FOUND, 'Source excerpt not found.');
  }

  if (
    source.path.startsWith('file:') &&
    getApprovedSourceRoot(dbPath(databasePath), examId, packId, packVersion) === undefined
  ) {
    httpError(
      HTTP_NOT_FOUND,
      'Local citation is unavailable because no approved source root was recorded.',
    );
  }

  const asset = getImportedSourceAsset(
    dbPath(databasePath),
    examId,
    packId,
    packVersion,
    questionId,
    sourcePath,
  );

  if (!asset) {
    httpError(HTTP_NOT_FOUND, 'Saved source excerpt is unavailable.');
  }

  return await Promise.resolve({ label: asset.label, text: asset.excerpt });
};
