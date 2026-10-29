import { resolve } from '$app/paths';
import { form, query } from '$app/server';
import { invalid, isHttpError, redirect } from '@sveltejs/kit';
import * as Schema from 'effect/Schema';

import { HTTP_BAD_REQUEST, HTTP_NOT_FOUND, HTTP_STATUS_REDIRECT } from '#lib/server/http-status.js';
import { getProgress } from '#lib/server/progress/queries.js';
import type { NextStudyAction } from '#lib/server/progress/queries.js';
import { createPracticeSession } from '#lib/server/quiz/service.js';

const PracticeMissedSchema = Schema.Struct({
  examId: Schema.String.check(Schema.isMinLength(1)),
  packId: Schema.String.check(Schema.isMinLength(1)),
  packVersion: Schema.String.check(Schema.isMinLength(1)),
  questionIds: Schema.optional(
    Schema.mutable(Schema.Array(Schema.String.check(Schema.isMinLength(1)))),
  ),
});

const PracticeDomainSchema = Schema.Struct({
  domainId: Schema.String.check(Schema.isMinLength(1)),
  examId: Schema.String.check(Schema.isMinLength(1)),
  packId: Schema.String.check(Schema.isMinLength(1)),
  packVersion: Schema.String.check(Schema.isMinLength(1)),
});

const PracticeQuestionSchema = Schema.Struct({
  examId: Schema.String.check(Schema.isMinLength(1)),
  packId: Schema.String.check(Schema.isMinLength(1)),
  packVersion: Schema.String.check(Schema.isMinLength(1)),
  questionId: Schema.String.check(Schema.isMinLength(1)),
});

type DomainRecommendation = Extract<NextStudyAction, { kind: 'domain' }>;

type MissedQuestionRecommendation = Extract<NextStudyAction, { kind: 'missed_question' }>;

const matchesDomainRecommendation = (
  recommendation: NextStudyAction,
  target: typeof PracticeDomainSchema.Type,
): recommendation is DomainRecommendation =>
  recommendation.kind === 'domain' &&
  recommendation.domainId === target.domainId &&
  recommendation.examId === target.examId &&
  recommendation.packId === target.packId &&
  recommendation.packVersion === target.packVersion;

const matchesQuestionRecommendation = (
  recommendation: NextStudyAction,
  target: typeof PracticeQuestionSchema.Type,
): recommendation is MissedQuestionRecommendation =>
  recommendation.kind === 'missed_question' &&
  recommendation.questionId === target.questionId &&
  recommendation.examId === target.examId &&
  recommendation.packId === target.packId &&
  recommendation.packVersion === target.packVersion;

export const getProgressData = query(getProgress);

export type ProgressData = Awaited<ReturnType<typeof getProgressData>>;

export const practiceMissed = form(
  Schema.toStandardSchemaV1(PracticeMissedSchema),
  async ({ examId, packId, packVersion, questionIds: submittedQuestionIds }, issue) => {
    const questionIds = submittedQuestionIds ?? [];

    if (questionIds.length === 0) {
      invalid(issue.questionIds('Select at least one missed question.'));
    }

    if (new Set(questionIds).size !== questionIds.length) {
      invalid(issue.questionIds('Select each missed question only once.'));
    }

    let session: Awaited<ReturnType<typeof createPracticeSession>>;

    try {
      session = await createPracticeSession({
        examId,
        packId,
        packVersion,
        questionCount: questionIds.length,
        questionIds,
      });
    } catch (error) {
      if (isHttpError(error, HTTP_BAD_REQUEST) || isHttpError(error, HTTP_NOT_FOUND)) {
        invalid(
          issue.questionIds(
            'The selected question is no longer available in this pack version. Reload Progress and choose available work.',
          ),
        );
      }

      throw error;
    }

    redirect(
      HTTP_STATUS_REDIRECT,
      `${resolve('/practice')}?session=${encodeURIComponent(session.id)}`,
    );
  },
);

export const practiceRecommendedDomain = form(
  Schema.toStandardSchemaV1(PracticeDomainSchema),
  async ({ domainId, examId, packId, packVersion }, issue) => {
    const progress = await getProgress();
    const recommendation = progress.nextStudyAction;

    if (!matchesDomainRecommendation(recommendation, { domainId, examId, packId, packVersion })) {
      invalid(issue.domainId('This recommendation has changed. Reload Progress and try again.'));
    }

    let session: Awaited<ReturnType<typeof createPracticeSession>>;

    try {
      session = await createPracticeSession({
        domainIds: [domainId],
        examId,
        packId,
        packVersion,
        questionCount: 1,
      });
    } catch (error) {
      if (isHttpError(error, HTTP_BAD_REQUEST)) {
        invalid(
          issue.domainId(
            'No questions are available in this domain for this pack version. Restore an eligible question or choose another recommendation.',
          ),
        );
      }

      if (isHttpError(error, HTTP_NOT_FOUND)) {
        invalid(
          issue.domainId(
            'This pack version is no longer available. Reload Progress and try again.',
          ),
        );
      }

      throw error;
    }

    redirect(
      HTTP_STATUS_REDIRECT,
      `${resolve('/practice')}?session=${encodeURIComponent(session.id)}`,
    );
  },
);

export const practiceRecommendedQuestion = form(
  Schema.toStandardSchemaV1(PracticeQuestionSchema),
  async ({ examId, packId, packVersion, questionId }, issue) => {
    const progress = await getProgress();
    const recommendation = progress.nextStudyAction;

    if (
      !matchesQuestionRecommendation(recommendation, { examId, packId, packVersion, questionId })
    ) {
      invalid(issue.questionId('This recommendation has changed. Reload Progress and try again.'));
    }

    let session: Awaited<ReturnType<typeof createPracticeSession>>;

    try {
      session = await createPracticeSession({
        examId,
        packId,
        packVersion,
        questionCount: 1,
        questionIds: [questionId],
      });
    } catch (error) {
      if (isHttpError(error, HTTP_BAD_REQUEST) || isHttpError(error, HTTP_NOT_FOUND)) {
        invalid(
          issue.questionId(
            'This question is no longer available in this pack version. Reload Progress and choose available work.',
          ),
        );
      }

      throw error;
    }

    redirect(
      HTTP_STATUS_REDIRECT,
      `${resolve('/practice')}?session=${encodeURIComponent(session.id)}`,
    );
  },
);
