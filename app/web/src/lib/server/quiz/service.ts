import { randomUUID } from 'node:crypto';

import type { PackQuestion } from '@learning-platform/exam-pack';
import { error as httpError } from '@sveltejs/kit';

import { MAX_QUESTION_COUNT } from '#lib/quiz/constants.js';
import type { AppDatabase } from '#lib/server/database/connection.js';
import { getEffectivePack } from '#lib/server/feedback/service.js';
import { HTTP_BAD_REQUEST, HTTP_NOT_FOUND } from '#lib/server/http-status.js';
import {
  getApprovedSourceRoot,
  getImportedPack,
  getImportedSourceAsset,
} from '#lib/server/packs/repository.js';

import {
  createPracticeSessionRecord,
  getPracticeHistory,
  getPracticeSessionRecord,
  getResumablePracticeSessionId,
  savePracticeAnswer,
} from './repository.js';

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
  database?: AppDatabase;
  examId: string;
  packId: string;
  packVersion: string;
  domainIds?: string[];
  questionCount: number;
  questionIds?: string[];
  random?: () => number;
}

const containsInvalidAnswer = (submitted: string[], options: PackQuestion['options']): boolean =>
  submitted.some((id) => !options.some((option) => option.id === id));

const matchesAnswerSet = (submitted: string[], correct: string[]): boolean =>
  submitted.length === correct.length && correct.every((id) => submitted.includes(id));

const toPracticeSession = (
  stored: NonNullable<Awaited<ReturnType<typeof getPracticeSessionRecord>>>,
): PracticeSession => {
  const { session: row, answers: storedAnswers } = stored;
  const questions = row.question_snapshot;

  const answers = storedAnswers.map((answer) => {
    const question = questions.find((item) => item.id === answer.question_id);

    return {
      answerIds: answer.answer_ids,
      answerIdsCorrect: question?.answerIds ?? [],
      answeredAt: answer.answered_at,
      correct: Boolean(answer.correct),
      explanation: question?.explanation ?? '',
      questionId: answer.question_id,
      sources: question?.sources ?? [],
    };
  });

  return {
    answers,
    createdAt: row.created_at,
    domainIds: row.domain_ids,
    examId: row.exam_id,
    id: row.id,
    packId: row.pack_id,
    packVersion: row.pack_version,
    questionIds: row.question_ids,
    questions: row.question_ids.flatMap((questionId) => {
      const question = questions.find((item) => item.id === questionId);

      if (!question) {
        return [];
      }

      const safe: PracticeQuestion = {
        domainId: question.domainId,
        explanation: question.explanation,
        id: question.id,
        options: question.options,
        prompt: question.prompt,
        sources: question.sources,
        type: question.type,
      };

      return [safe];
    }),
    status: row.status,
    updatedAt: row.updated_at,
  };
};

const readSession = async (id: string, database?: AppDatabase) => {
  const stored = await getPracticeSessionRecord(id, database);

  return stored ? toPracticeSession(stored) : undefined;
};

export const createPracticeSession = async (
  options: StartPracticeOptions,
): Promise<PracticeSession> => {
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

  const selectedQuestionIds =
    options.questionIds === undefined ? undefined : [...new Set(options.questionIds)];

  if (
    selectedQuestionIds !== undefined &&
    selectedQuestionIds.some((id) => !pack.questions.some((question) => question.id === id))
  ) {
    httpError(HTTP_BAD_REQUEST, 'Choose questions from this exam pack version.');
  }

  const candidates = pack.questions.filter((question) =>
    selectedQuestionIds === undefined
      ? domainIds.length === 0 || domainIds.includes(question.domainId)
      : selectedQuestionIds.includes(question.id),
  );

  if (
    options.questionCount > candidates.length ||
    (selectedQuestionIds !== undefined && options.questionCount !== selectedQuestionIds.length)
  ) {
    httpError(HTTP_BAD_REQUEST, 'There are not that many questions in the selected domains.');
  }

  const states = await getPracticeHistory(
    options.examId,
    options.packId,
    options.packVersion,
    options.database,
  );

  const random = options.random ?? Math.random;

  const shuffle = (items: PackQuestion[]) => {
    const shuffled = [...items];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      const current = shuffled[index];
      const target = shuffled[other];

      if (current !== undefined && target !== undefined) {
        shuffled[index] = target;
        shuffled[other] = current;
      }
    }

    return shuffled;
  };

  const unseen = shuffle(candidates.filter((q) => states.get(q.id)?.seen !== true));
  const missed = shuffle(candidates.filter((q) => states.get(q.id)?.missed === true));

  const otherSeen = shuffle(
    candidates.filter((q) => states.get(q.id)?.seen === true && states.get(q.id)?.missed !== true),
  );

  const questionIds = [...unseen, ...missed, ...otherSeen]
    .slice(0, options.questionCount)
    .map((q) => q.id);

  const id = randomUUID();
  await createPracticeSessionRecord(
    {
      domain_ids: domainIds,
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
  const created = await readSession(id, options.database);

  if (!created) {
    throw new Error('Could not load the new practice session.');
  }

  return created;
};

export const getPracticeSession = async (sessionId: string, database?: AppDatabase) =>
  await readSession(sessionId, database);

export const getResumablePracticeSession = async (database?: AppDatabase) => {
  const id = await getResumablePracticeSessionId(database);

  return id === undefined ? undefined : await readSession(id, database);
};

export const answerQuestion = async (
  sessionId: string,
  questionId: string,
  answerIds: string[],
  database?: AppDatabase,
): Promise<QuizAnswer> => {
  const stored = await getPracticeSessionRecord(sessionId, database);
  const session = stored ? toPracticeSession(stored) : undefined;

  if (session?.status !== 'in_progress') {
    httpError(HTTP_NOT_FOUND, 'This practice session is no longer in progress.');
  }

  const question = session.questions.find((item) => item.id === questionId);

  if (!question || session.answers.some((answer) => answer.questionId === questionId)) {
    httpError(HTTP_BAD_REQUEST, 'That question cannot be answered in this session.');
  }

  const correctQuestion = stored?.session.question_snapshot.find((item) => item.id === questionId);

  if (!correctQuestion) {
    httpError(HTTP_NOT_FOUND, 'Question not found in the imported pack version.');
  }

  const submitted = [...new Set(answerIds)];

  if (!submitted.length || containsInvalidAnswer(submitted, question.options)) {
    httpError(HTTP_BAD_REQUEST, 'Select a valid answer before continuing.');
  }

  const correct = matchesAnswerSet(submitted, correctQuestion.answerIds);
  const answeredAt = new Date().toISOString();
  await savePracticeAnswer(
    {
      answerIds: submitted,
      answeredAt,
      correct,
      questionId,
      sessionId,
    },
    database,
  );

  return {
    answerIds: submitted,
    answerIdsCorrect: correctQuestion.answerIds,
    answeredAt,
    correct,
    explanation: correctQuestion.explanation,
    questionId,
    sources: correctQuestion.sources,
  };
};

export const readQuestionSource = async (
  examId: string,
  packId: string,
  packVersion: string,
  questionId: string,
  sourcePath: string,
  database?: AppDatabase,
) => {
  const pack = await getImportedPack(examId, packId, packVersion, database);

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
    (await getApprovedSourceRoot(database, examId, packId, packVersion)) === undefined
  ) {
    httpError(
      HTTP_NOT_FOUND,
      'Local citation is unavailable because no approved source root was recorded.',
    );
  }

  const asset = await getImportedSourceAsset(
    database,
    examId,
    packId,
    packVersion,
    questionId,
    sourcePath,
  );

  if (!asset) {
    httpError(HTTP_NOT_FOUND, 'Saved source excerpt is unavailable.');
  }

  return { label: asset.label, text: asset.excerpt };
};
