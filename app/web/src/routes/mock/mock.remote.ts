import { resolve } from '$app/paths';
import { form, query } from '$app/server';
import { error as httpError, invalid, isHttpError, redirect } from '@sveltejs/kit';
import * as Schema from 'effect/Schema';

import { DEFAULT_QUESTION_COUNT } from '#lib/quiz/constants.js';
import { HTTP_BAD_REQUEST, HTTP_NOT_FOUND, HTTP_STATUS_REDIRECT } from '#lib/server/http-status.js';
import { toClientSafeMockAttempt } from '#lib/server/packs/client-safe.js';
import { listImportedPacks } from '#lib/server/packs/repository.js';
import {
  createMockAttempt,
  getMockAttempt,
  getMockCoverage,
  getResumableMockAttempt,
  saveMockAnswer as saveMockAnswerService,
  submitMockAttempt,
} from '#lib/server/quiz/mock-service.js';

import {
  MockPageQuerySchema,
  SaveMockAnswerSchema,
  StartMockSchema,
  SubmitMockSchema,
} from './mock.schemas.js';

export const getMockPage = query(
  Schema.toStandardSchemaV1(MockPageQuerySchema),
  async ({ attemptId, count, packChoice }) => {
    const packs = await listImportedPacks();

    const attempt =
      attemptId === undefined ? await getResumableMockAttempt() : await getMockAttempt(attemptId);

    if (attemptId !== undefined && attempt === undefined) {
      httpError(HTTP_NOT_FOUND, 'Mock attempt not found.');
    }

    const requestedQuestionCount = Number(count ?? String(DEFAULT_QUESTION_COUNT));

    const questionCount = Number.isInteger(requestedQuestionCount)
      ? requestedQuestionCount
      : DEFAULT_QUESTION_COUNT;

    const coverageEntries = await Promise.all(
      packs.map(async (pack) => {
        const key = `${pack.examId}|${pack.packId}|${pack.packVersion}`;

        try {
          return [
            key,
            await getMockCoverage(pack.examId, pack.packId, pack.packVersion, questionCount),
          ] as const;
        } catch (error) {
          if (isHttpError(error, HTTP_BAD_REQUEST) || isHttpError(error, HTTP_NOT_FOUND)) {
            return [key, undefined] as const;
          }

          throw error;
        }
      }),
    );

    return {
      attempt: attempt ? toClientSafeMockAttempt(attempt) : undefined,
      coverages: Object.fromEntries(coverageEntries),
      packs,
      questionCount,
      selectedPackKey: packChoice ?? '',
    };
  },
);

export const startMock = form(
  Schema.toStandardSchemaV1(StartMockSchema),
  async ({ durationMinutes, examId, packId, packVersion, questionCount }, issue) => {
    try {
      const attempt = await createMockAttempt({
        durationMinutes,
        examId,
        packId,
        packVersion,
        questionCount,
      });

      redirect(
        HTTP_STATUS_REDIRECT,
        `${resolve('/mock')}?attempt=${encodeURIComponent(attempt.id)}`,
      );
    } catch (error) {
      if (isHttpError(error, HTTP_BAD_REQUEST)) {
        invalid(
          issue.questionCount(
            'This pack does not have enough questions for the requested weighted mock.',
          ),
        );
      }

      throw error;
    }
  },
);

export const saveMockAnswer = form(
  Schema.toStandardSchemaV1(SaveMockAnswerSchema),
  async ({ answerId, answerIds, attemptId, questionId }, issue) => {
    const selectedAnswerIds = answerId === undefined ? (answerIds ?? []) : [answerId];

    try {
      await saveMockAnswerService(attemptId, questionId, selectedAnswerIds);
    } catch (error) {
      if (isHttpError(error, HTTP_BAD_REQUEST)) {
        invalid(issue.answerIds('Select a valid answer before saving.'));
      }

      throw error;
    }

    redirect(HTTP_STATUS_REDIRECT, `${resolve('/mock')}?attempt=${encodeURIComponent(attemptId)}`);
  },
);

export const submitMock = form(
  Schema.toStandardSchemaV1(SubmitMockSchema),
  async ({ attemptId }) => {
    await submitMockAttempt(attemptId);
    redirect(HTTP_STATUS_REDIRECT, `${resolve('/mock')}?attempt=${encodeURIComponent(attemptId)}`);
  },
);
