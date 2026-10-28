import { form, query } from '$app/server';
import { error as kitError, invalid } from '@sveltejs/kit';
import * as Schema from 'effect/Schema';

import {
  createCorrection,
  FeedbackValidationError,
  flagQuestion,
  readPackForReview,
  retireQuestion,
} from '#lib/server/feedback/service.js';
import { HTTP_NOT_FOUND } from '#lib/server/http-status.js';
import { decodeJsonText, isJsonObject } from '#lib/server/json.js';
import {
  restoreCorrectionSourcePaths,
  toClientSafeFeedbackItem,
  toClientSafeReviewPack,
} from '#lib/server/packs/client-safe.js';
import { listImportedPacks } from '#lib/server/packs/repository.js';

const ReviewSelectionSchema = Schema.Struct({
  examId: Schema.optional(Schema.String),
  packId: Schema.optional(Schema.String),
  packVersion: Schema.optional(Schema.String),
});

const ReviewTargetSchema = Schema.Struct({
  examId: Schema.String,
  packId: Schema.String,
  packVersion: Schema.String,
  questionId: Schema.String,
});

const FlagQuestionSchema = Schema.Struct({
  ...ReviewTargetSchema.fields,
  reason: Schema.String,
});

const CorrectQuestionSchema = Schema.Struct({
  ...ReviewTargetSchema.fields,
  correction: Schema.String,
});

const RetireQuestionSchema = Schema.Struct({
  ...ReviewTargetSchema.fields,
  retired: Schema.String,
});

export const getReviewData = query(
  Schema.toStandardSchemaV1(ReviewSelectionSchema),
  async ({ examId, packId, packVersion }) => {
    const packs = await listImportedPacks();

    const selected =
      packs.find(
        (pack) =>
          pack.examId === examId && pack.packId === packId && pack.packVersion === packVersion,
      ) ?? packs[0];

    if (!selected) {
      return { feedback: [], pack: undefined, packs };
    }

    const { feedback, pack } = await readPackForReview(
      selected.examId,
      selected.packId,
      selected.packVersion,
    );

    return {
      feedback: feedback.map(toClientSafeFeedbackItem),
      pack: toClientSafeReviewPack(pack),
      packs,
    };
  },
);

export type ReviewData = Awaited<ReturnType<typeof getReviewData>>;

export const flagReviewQuestion = form(
  Schema.toStandardSchemaV1(FlagQuestionSchema),
  async (input, issue) => {
    try {
      return toClientSafeFeedbackItem(await flagQuestion(input));
    } catch (error) {
      if (error instanceof FeedbackValidationError) {
        if (error.kind === 'missing-target') {
          kitError(HTTP_NOT_FOUND, error.message);
        }

        invalid(issue.reason(error.message));
      }

      throw error;
    }
  },
);

export const correctReviewQuestion = form(
  Schema.toStandardSchemaV1(CorrectQuestionSchema),
  async ({ correction: correctionText, ...target }, issue) => {
    let correction: unknown;

    try {
      correction = decodeJsonText(correctionText);
    } catch {
      invalid(issue.correction('Correction must be valid JSON.'));
    }

    if (!isJsonObject(correction)) {
      invalid(issue.correction('Correction must be a JSON object.'));
    }

    try {
      const { pack } = await readPackForReview(target.examId, target.packId, target.packVersion);

      const restoredCorrection = restoreCorrectionSourcePaths(correction, pack, target.questionId);

      return toClientSafeFeedbackItem(
        await createCorrection({ ...target, correction: restoredCorrection }),
      );
    } catch (error) {
      if (error instanceof FeedbackValidationError) {
        if (error.kind === 'missing-target') {
          kitError(HTTP_NOT_FOUND, error.message);
        }

        invalid(issue.correction(error.message));
      }

      throw error;
    }
  },
);

export const retireReviewQuestion = form(
  Schema.toStandardSchemaV1(RetireQuestionSchema),
  async ({ retired: retiredValue, ...target }, issue) => {
    if (retiredValue !== 'true' && retiredValue !== 'false') {
      invalid(issue.retired('Retirement state must be true or false.'));
    }

    try {
      return toClientSafeFeedbackItem(await retireQuestion(target, retiredValue === 'true'));
    } catch (error) {
      if (error instanceof FeedbackValidationError) {
        if (error.kind === 'missing-target') {
          kitError(HTTP_NOT_FOUND, error.message);
        }

        invalid(issue.retired(error.message));
      }

      throw error;
    }
  },
);
