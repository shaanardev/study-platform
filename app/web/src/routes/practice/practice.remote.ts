import { resolve } from '$app/paths';
import { form, query } from '$app/server';
import { error as httpError, invalid, isHttpError, redirect } from '@sveltejs/kit';
import * as Schema from 'effect/Schema';

import { getEffectivePack } from '#lib/server/feedback/service.js';
import { HTTP_BAD_REQUEST, HTTP_NOT_FOUND, HTTP_STATUS_REDIRECT } from '#lib/server/http-status.js';
import { toClientSafePracticeSession } from '#lib/server/packs/client-safe.js';
import { getImportedPack, listImportedPacks } from '#lib/server/packs/repository.js';
import {
  answerQuestion,
  createPracticeSession,
  getPracticeSession,
  getResumablePracticeSession,
} from '#lib/server/quiz/service.js';

const PracticeQuerySchema = Schema.toStandardSchemaV1(
  Schema.Struct({ sessionId: Schema.optional(Schema.String) }),
);

const StartPracticeSchema = Schema.toStandardSchemaV1(
  Schema.Struct({
    domainIds: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
    examId: Schema.String,
    packId: Schema.String,
    packVersion: Schema.String,
    questionCount: Schema.Number,
  }),
);

const AnswerPracticeSchema = Schema.toStandardSchemaV1(
  Schema.Struct({
    answerId: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
    answerIds: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
    questionId: Schema.String,
    sessionId: Schema.String,
  }),
);

export const getPracticePage = query(PracticeQuerySchema, async ({ sessionId }) => {
  if (sessionId !== undefined && sessionId.trim().length === 0) {
    httpError(HTTP_BAD_REQUEST, 'Practice session ID cannot be empty.');
  }

  const importedPacks = await listImportedPacks();

  const packs = await Promise.all(
    importedPacks.map(async (pack) => {
      const importedPack = await getImportedPack(pack.examId, pack.packId, pack.packVersion);

      if (!importedPack) {
        return {
          ...pack,
          domains: pack.domains.map((domain) => ({ ...domain, questionCount: 0 })),
          questionCount: 0,
        };
      }

      const effectivePack = await getEffectivePack(importedPack);

      return {
        ...pack,
        domains: pack.domains.map((domain) => ({
          ...domain,
          questionCount: effectivePack.questions.filter(
            (question) => question.domainId === domain.id,
          ).length,
        })),
        questionCount: effectivePack.questions.length,
      };
    }),
  );

  const session =
    sessionId === undefined
      ? await getResumablePracticeSession()
      : await getPracticeSession(sessionId);

  if (sessionId !== undefined && session === undefined) {
    httpError(HTTP_NOT_FOUND, 'Practice session not found.');
  }

  return { packs, session: session ? toClientSafePracticeSession(session) : undefined };
});

export type PracticePageData = Awaited<ReturnType<typeof getPracticePage>>;

export const startPractice = form(StartPracticeSchema, async (input, issue) => {
  const domainIds = input.domainIds ?? [];

  if (!input.examId.trim() || !input.packId.trim() || !input.packVersion.trim()) {
    invalid(issue.examId('Choose an available exam pack version.'));
  }

  if (!Number.isInteger(input.questionCount) || input.questionCount < 1) {
    invalid(issue.questionCount('Enter a whole number of at least 1 question.'));
  }

  try {
    const session = await createPracticeSession({ ...input, domainIds });

    redirect(
      HTTP_STATUS_REDIRECT,
      `${resolve('/practice')}?session=${encodeURIComponent(session.id)}`,
    );
  } catch (error) {
    if (isHttpError(error, HTTP_BAD_REQUEST)) {
      invalid(issue.questionCount(error.body.message));
    }

    throw error;
  }
});

export const answerPractice = form(AnswerPracticeSchema, async (input, issue) => {
  const answerIds = input.answerId === undefined ? (input.answerIds ?? []) : [input.answerId];

  try {
    await answerQuestion(input.sessionId, input.questionId, answerIds);
  } catch (error) {
    if (isHttpError(error, HTTP_BAD_REQUEST)) {
      const message = 'Select a valid answer before continuing.';

      if (input.answerId === undefined) {
        invalid(issue.answerIds(message));
      }

      invalid(issue.answerId(message));
    }

    throw error;
  }

  return { saved: true };
});
