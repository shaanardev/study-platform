import { validateExamPack } from '@learning-platform/exam-pack';
import type { ExamPack, PackQuestion, PackSource } from '@learning-platform/exam-pack';
import { error as httpError } from '@sveltejs/kit';

import {
  listAllFeedbackRows,
  listFeedbackRows,
  updateFeedback,
} from '#lib/server/feedback/repository.js';
import type {
  FeedbackKey,
  QuestionCorrection,
  StoredFeedback,
} from '#lib/server/feedback/repository.js';
import { HTTP_NOT_FOUND } from '#lib/server/http-status.js';
import type { JsonObject } from '#lib/server/json.js';
import { getImportedPack } from '#lib/server/packs/repository.js';

export type { FeedbackKey, QuestionCorrection } from '#lib/server/feedback/repository.js';

export type FeedbackItem = FeedbackKey & {
  flags: { reason: string }[];
  correction?: QuestionCorrection;
  retired: boolean;
};

const citationKey = (value: PackSource): string =>
  JSON.stringify(Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right)));

export class FeedbackValidationError extends Error {
  readonly issues: string[];
  readonly kind: 'invalid-input' | 'missing-target';

  constructor(issues: string[], kind: 'invalid-input' | 'missing-target' = 'invalid-input') {
    super(issues.join(' '));
    this.issues = issues;
    this.kind = kind;
    this.name = 'FeedbackValidationError';
  }
}

const addCitationIssues = (
  original: PackQuestion,
  sources: PackSource[],
  issues: string[],
): void => {
  if (sources.length === 0 || sources.some(({ path, label }) => !path.trim() || !label.trim())) {
    issues.push('Correction must retain at least one complete citation.');
  }

  if (
    sources.some(
      (source) =>
        !original.sources.some((citation) => citationKey(citation) === citationKey(source)),
    )
  ) {
    issues.push('Correction sources must refer to citation files in this imported pack version.');
  }
};

const normalizeCorrection = (
  correction: JsonObject,
  validatedQuestion: PackQuestion,
): QuestionCorrection => {
  const normalized: QuestionCorrection = {};

  if (Object.hasOwn(correction, 'type')) {
    normalized.type = validatedQuestion.type;
  }

  if (Object.hasOwn(correction, 'domainId')) {
    normalized.domainId = validatedQuestion.domainId;
  }

  if (Object.hasOwn(correction, 'prompt')) {
    normalized.prompt = validatedQuestion.prompt;
  }

  if (Object.hasOwn(correction, 'options')) {
    normalized.options = validatedQuestion.options;
  }

  if (Object.hasOwn(correction, 'answerIds')) {
    normalized.answerIds = [...validatedQuestion.answerIds].toSorted();
  }

  if (Object.hasOwn(correction, 'explanation')) {
    normalized.explanation = validatedQuestion.explanation;
  }

  if (Object.hasOwn(correction, 'sources')) {
    normalized.sources = validatedQuestion.sources;
  }

  return normalized;
};

const validateCorrection = (
  pack: ExamPack,
  questionId: string,
  correction: JsonObject,
): QuestionCorrection => {
  const original = pack.questions.find((question) => question.id === questionId);

  if (!original) {
    throw new FeedbackValidationError(
      ['Question is not in this imported pack version.'],
      'missing-target',
    );
  }

  const allowed = new Set([
    'type',
    'domainId',
    'prompt',
    'options',
    'answerIds',
    'explanation',
    'sources',
  ]);

  const issues = Object.keys(correction)
    .filter((field) => !allowed.has(field))
    .map((field) => `Correction contains unsupported field "${field}".`);

  if (Object.keys(correction).length === 0) {
    issues.push('Correction must change at least one question field.');
  }

  const candidate = {
    ...pack,
    questions: pack.questions.map((question) =>
      question.id === questionId ? { ...question, ...correction } : question,
    ),
  };

  const validation = validateExamPack(candidate);

  if (!validation.valid) {
    issues.push(...validation.errors.map((issue) => `Correction is invalid: ${issue}`));
  }

  const validatedQuestion = validation.valid
    ? validation.pack.questions.find((question) => question.id === questionId)
    : undefined;

  if (validatedQuestion && Object.hasOwn(correction, 'sources')) {
    addCitationIssues(original, validatedQuestion.sources, issues);
  }

  if (issues.length) {
    throw new FeedbackValidationError([...new Set(issues)]);
  }

  if (!validatedQuestion) {
    throw new Error('Validated question correction was not returned.');
  }

  return normalizeCorrection(correction, validatedQuestion);
};

const toFeedbackItem = (row: StoredFeedback): FeedbackItem => {
  const item: FeedbackItem = {
    examId: row.examId,
    flags: row.flags,
    packId: row.packId,
    packVersion: row.packVersion,
    questionId: row.questionId,
    retired: row.retired === 1,
  };

  if (row.correction !== null) {
    item.correction = row.correction;
  }

  return item;
};

export const flagQuestion = async (
  input: FeedbackKey & { reason: string },
): Promise<FeedbackItem> => {
  const reason = input.reason.trim();

  if (!reason) {
    throw new FeedbackValidationError(['A flag reason is required.']);
  }

  const pack = await getImportedPack(input.examId, input.packId, input.packVersion);

  if (pack?.questions.some((question) => question.id === input.questionId) !== true) {
    throw new FeedbackValidationError(
      ['Question is not in this imported pack version.'],
      'missing-target',
    );
  }

  const row = await updateFeedback(input, (previous) => {
    const flags = previous ? [...previous.flags] : [];

    if (!flags.some((flag) => flag.reason === reason)) {
      flags.push({ reason });
    }

    return {
      correction: previous?.correction ?? null,
      flags: flags.toSorted((left, right) => left.reason.localeCompare(right.reason)),
      retired: previous?.retired ?? 0,
    };
  });

  return toFeedbackItem(row);
};

export const createCorrection = async (
  input: FeedbackKey & { correction: JsonObject },
): Promise<FeedbackItem> => {
  const pack = await getImportedPack(input.examId, input.packId, input.packVersion);

  if (!pack) {
    throw new FeedbackValidationError(['Imported pack version is unavailable.'], 'missing-target');
  }

  const correction = validateCorrection(pack, input.questionId, input.correction);

  const row = await updateFeedback(input, (previous) => ({
    correction,
    flags: previous ? [...previous.flags] : [],
    retired: previous?.retired ?? 0,
  }));

  return toFeedbackItem(row);
};

export const retireQuestion = async (key: FeedbackKey, retired: boolean): Promise<FeedbackItem> => {
  const pack = await getImportedPack(key.examId, key.packId, key.packVersion);

  if (pack?.questions.some((question) => question.id === key.questionId) !== true) {
    throw new FeedbackValidationError(
      ['Question is not in this imported pack version.'],
      'missing-target',
    );
  }

  const row = await updateFeedback(key, (previous) => ({
    correction: previous?.correction ?? null,
    flags: previous ? [...previous.flags] : [],
    retired: retired ? 1 : 0,
  }));

  return toFeedbackItem(row);
};

export const listFeedback = async (
  examId: string,
  packId: string,
  packVersion: string,
): Promise<FeedbackItem[]> => {
  const rows = await listFeedbackRows(examId, packId, packVersion);

  return rows.map(toFeedbackItem);
};

/** Apply a preloaded feedback set to its imported pack. */
export const applyFeedbackToPack = (
  pack: ExamPack,
  feedback: readonly StoredFeedback[],
): ExamPack => {
  const byId = new Map(feedback.map((item) => [item.questionId, item]));

  const questions = pack.questions.flatMap((question) => {
    const item = byId.get(question.id);

    if (item?.retired === 1) {
      return [];
    }

    return [{ ...question, ...item?.correction }];
  });

  return { ...pack, questions };
};

export const exportFeedback = async (): Promise<string> => {
  const rows = await listAllFeedbackRows();
  const items = rows.map(toFeedbackItem);

  return JSON.stringify({ format: 'question-feedback', items, version: 1 });
};

export const getEffectivePack = async (pack: ExamPack): Promise<ExamPack> => {
  const feedback = await listFeedbackRows(pack.exam.id, pack.pack.id, pack.pack.version);

  return applyFeedbackToPack(pack, feedback);
};

export const readPackForReview = async (
  examId: string,
  packId: string,
  packVersion: string,
): Promise<{ feedback: FeedbackItem[]; pack: ExamPack }> => {
  const pack = await getImportedPack(examId, packId, packVersion);

  if (!pack) {
    httpError(HTTP_NOT_FOUND, 'That imported exam pack version is not available.');
  }

  return { feedback: await listFeedback(examId, packId, packVersion), pack };
};
