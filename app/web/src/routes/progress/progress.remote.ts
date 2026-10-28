import { resolve } from '$app/paths';
import { form, query } from '$app/server';
import { invalid, redirect } from '@sveltejs/kit';
import * as Schema from 'effect/Schema';

import { HTTP_STATUS_REDIRECT } from '#lib/server/http-status.js';
import { getProgress } from '#lib/server/progress/queries.js';
import { createPracticeSession } from '#lib/server/quiz/service.js';

const PracticeMissedSchema = Schema.Struct({
  examId: Schema.String.check(Schema.isMinLength(1)),
  packId: Schema.String.check(Schema.isMinLength(1)),
  packVersion: Schema.String.check(Schema.isMinLength(1)),
  questionIds: Schema.optional(
    Schema.mutable(Schema.Array(Schema.String.check(Schema.isMinLength(1)))),
  ),
});

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

    const session = await createPracticeSession({
      examId,
      packId,
      packVersion,
      questionCount: questionIds.length,
      questionIds,
    });

    redirect(
      HTTP_STATUS_REDIRECT,
      `${resolve('/practice')}?session=${encodeURIComponent(session.id)}`,
    );
  },
);
