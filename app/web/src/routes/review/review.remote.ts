import { resolve } from '$app/paths';
import { form, query } from '$app/server';
import { error as kitError, invalid, redirect } from '@sveltejs/kit';
import * as Schema from 'effect/Schema';

import { reviewActionPath } from '#lib/route-urls.js';
import type { ReviewSelectionFilters } from '#lib/route-urls.js';
import {
  createCorrection,
  FeedbackValidationError,
  flagQuestion,
  readPackForReview,
  retireQuestion,
} from '#lib/server/feedback/service.js';
import { HTTP_NOT_FOUND, HTTP_STATUS_REDIRECT } from '#lib/server/http-status.js';
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

const ReviewActionSchema = Schema.Struct({
  ...ReviewTargetSchema.fields,
  returnQuery: Schema.String,
});

const FlagQuestionSchema = Schema.Struct({
  ...ReviewActionSchema.fields,
  reason: Schema.String,
});

const CorrectQuestionSchema = Schema.Struct({
  ...ReviewActionSchema.fields,
  correction: Schema.String,
});

const RetireQuestionSchema = Schema.Struct({
  ...ReviewActionSchema.fields,
  retired: Schema.String,
});

type ReviewAction = 'flagged' | 'corrected' | 'retired' | 'restored';

interface ReviewActionTarget {
  examId: string;
  packId: string;
  packVersion: string;
  questionId: string;
  returnQuery: string;
}

const reviewActionLocation = (target: ReviewActionTarget, action: ReviewAction): string => {
  const currentQuery = new URLSearchParams(target.returnQuery);
  const domainId = currentQuery.get('domain');
  const search = currentQuery.get('q');

  const filters: ReviewSelectionFilters = {
    flagged: currentQuery.has('flagged'),
    retired: currentQuery.has('retired'),
  };

  if (domainId !== null) {
    filters.domainId = domainId;
  }

  if (search !== null) {
    filters.search = search;
  }

  return resolve(reviewActionPath(target, filters, action, target.questionId));
};

const isReviewReturnQueryValid = (returnQuery: string): boolean => {
  const params = new URLSearchParams(returnQuery);

  return ['flagged', 'retired'].every((key) =>
    params.getAll(key).every((value) => value === '' || value === '1' || value === 'true'),
  );
};

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
    const { reason, returnQuery, ...target } = input;

    if (!isReviewReturnQueryValid(returnQuery)) {
      invalid(issue.returnQuery('Review filters must be valid before saving feedback.'));
    }

    try {
      await flagQuestion({ ...target, reason });
    } catch (error) {
      if (error instanceof FeedbackValidationError) {
        if (error.kind === 'missing-target') {
          kitError(HTTP_NOT_FOUND, error.message);
        }

        invalid(issue.reason(error.message));
      }

      throw error;
    }

    redirect(HTTP_STATUS_REDIRECT, reviewActionLocation({ ...target, returnQuery }, 'flagged'));
  },
);

export const correctReviewQuestion = form(
  Schema.toStandardSchemaV1(CorrectQuestionSchema),
  async ({ correction: correctionText, returnQuery, ...target }, issue) => {
    let correction: unknown;

    try {
      correction = decodeJsonText(correctionText);
    } catch {
      invalid(issue.correction('Correction must be valid JSON.'));
    }

    if (!isJsonObject(correction)) {
      invalid(issue.correction('Correction must be a JSON object.'));
    }

    if (!isReviewReturnQueryValid(returnQuery)) {
      invalid(issue.returnQuery('Review filters must be valid before saving feedback.'));
    }

    try {
      const { pack } = await readPackForReview(target.examId, target.packId, target.packVersion);

      const restoredCorrection = restoreCorrectionSourcePaths(correction, pack, target.questionId);

      await createCorrection({ ...target, correction: restoredCorrection });
    } catch (error) {
      if (error instanceof FeedbackValidationError) {
        if (error.kind === 'missing-target') {
          kitError(HTTP_NOT_FOUND, error.message);
        }

        invalid(issue.correction(error.message));
      }

      throw error;
    }

    redirect(HTTP_STATUS_REDIRECT, reviewActionLocation({ ...target, returnQuery }, 'corrected'));
  },
);

export const retireReviewQuestion = form(
  Schema.toStandardSchemaV1(RetireQuestionSchema),
  async ({ retired: retiredValue, returnQuery, ...target }, issue) => {
    if (retiredValue !== 'true' && retiredValue !== 'false') {
      invalid(issue.retired('Retirement state must be true or false.'));
    }

    if (!isReviewReturnQueryValid(returnQuery)) {
      invalid(issue.returnQuery('Review filters must be valid before saving feedback.'));
    }

    try {
      await retireQuestion(target, retiredValue === 'true');
    } catch (error) {
      if (error instanceof FeedbackValidationError) {
        if (error.kind === 'missing-target') {
          kitError(HTTP_NOT_FOUND, error.message);
        }

        invalid(issue.retired(error.message));
      }

      throw error;
    }

    redirect(
      HTTP_STATUS_REDIRECT,
      reviewActionLocation(
        { ...target, returnQuery },
        retiredValue === 'true' ? 'retired' : 'restored',
      ),
    );
  },
);
