import { createHash } from 'node:crypto';

import type { ExamPack, PackSource } from '@learning-platform/exam-pack';
import * as Schema from 'effect/Schema';

import type { FeedbackItem } from '#lib/server/feedback/service.js';
import { isJsonArray } from '#lib/server/json.js';
import type { JsonObject } from '#lib/server/json.js';
import type { MockAttempt } from '#lib/server/quiz/mock-service.js';
import type { PracticeSession } from '#lib/server/quiz/service.js';

const SOURCE_REFERENCE_PREFIX = 'source-ref-';
const CorrectionSourceSchema = Schema.Struct({ label: Schema.String, path: Schema.String });

export const toSourceReference = (path: string): string =>
  `${SOURCE_REFERENCE_PREFIX}${createHash('sha256').update(path).digest('hex')}`;

const toClientSources = (sources: PackSource[]) =>
  sources.map(({ label, path }) => ({ label, path: toSourceReference(path) }));

export const toClientSafePracticeSession = (session: PracticeSession) => ({
  ...session,
  answers: session.answers.map((answer) => ({
    ...answer,
    sources: toClientSources(answer.sources),
  })),
  questions: session.questions.map((question) => ({
    ...question,
    sources: toClientSources(question.sources),
  })),
});

export const toClientSafeMockAttempt = (attempt: MockAttempt) => ({
  ...attempt,
  questions: attempt.questions.map((question) => ({
    ...question,
    sources: toClientSources(question.sources),
  })),
});

export const toClientSafeReviewPack = (pack: ExamPack) => ({
  ...pack,
  questions: pack.questions.map((question) => ({
    ...question,
    sources: toClientSources(question.sources),
  })),
});

export const toClientSafeFeedbackItem = (item: FeedbackItem) => {
  if (!item.correction?.sources) {
    return item;
  }

  return {
    ...item,
    correction: {
      ...item.correction,
      sources: item.correction.sources.map((source) => ({
        ...source,
        path: toSourceReference(source.path),
      })),
    },
  };
};

export const restoreCorrectionSourcePaths = (
  correction: JsonObject,
  pack: ExamPack,
  questionId: string,
): JsonObject => {
  const { sources } = correction;
  const question = pack.questions.find((entry) => entry.id === questionId);

  if (!isJsonArray(sources) || !question) {
    return correction;
  }

  return {
    ...correction,
    sources: sources.map((source) => {
      if (!Schema.is(CorrectionSourceSchema)(source)) {
        return source;
      }

      const original = question.sources.find(
        (citation) => toSourceReference(citation.path) === source.path,
      );

      if (!original || source.label !== original.label) {
        return source;
      }

      return { label: original.label, path: original.path };
    }),
  };
};
