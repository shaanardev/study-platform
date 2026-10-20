import { error as httpError } from '@sveltejs/kit';

import type { AppDatabase } from '#lib/server/database/connection.js';
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
import { getImportedPack } from '#lib/server/packs/repository.js';
import { validateExamPack } from '@learning-platform/exam-pack';
import type { ExamPack, PackQuestion } from '@learning-platform/exam-pack';

export type { FeedbackKey, QuestionCorrection } from '#lib/server/feedback/repository.js';
export type FeedbackItem = FeedbackKey & {
  flags: { reason: string }[];
  correction?: QuestionCorrection;
  retired: boolean;
};

type JsonRecord = Record<string, unknown> & {
  reason?: unknown;
  id?: unknown;
  text?: unknown;
  path?: unknown;
  label?: unknown;
  type?: unknown;
  domainId?: unknown;
  prompt?: unknown;
  options?: unknown;
  answerIds?: unknown;
  explanation?: unknown;
  sources?: unknown;
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const citationKey = (value: object): string =>
  JSON.stringify(Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right)));

const validateStoredFlags = (value: unknown): FeedbackItem['flags'] => {
  if (!Array.isArray(value)) {
    throw new TypeError('Stored question feedback flags are invalid.');
  }
  const flags: FeedbackItem['flags'] = [];
  for (const flag of value) {
    if (!isRecord(flag) || typeof flag.reason !== 'string') {
      throw new Error('Stored question feedback flags are invalid.');
    }
    flags.push({ reason: flag.reason });
  }
  return flags;
};

const isQuestionCorrection = (value: unknown): value is QuestionCorrection => {
  if (!isRecord(value)) {
    return false;
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
  if (Object.keys(value).some((field) => !allowed.has(field))) {
    return false;
  }
  return Object.entries(value).every(([field, fieldValue]) => {
    if (field === 'type') {
      return fieldValue === 'single_choice' || fieldValue === 'multiple_choice';
    }
    if (field === 'domainId' || field === 'prompt' || field === 'explanation') {
      return typeof fieldValue === 'string';
    }
    if (field === 'answerIds') {
      return Array.isArray(fieldValue) && fieldValue.every((id) => typeof id === 'string');
    }
    if (field === 'options') {
      return (
        Array.isArray(fieldValue) &&
        fieldValue.every(
          (option) =>
            isRecord(option) && typeof option.id === 'string' && typeof option.text === 'string',
        )
      );
    }
    if (field === 'sources') {
      return (
        Array.isArray(fieldValue) &&
        fieldValue.every((source) => {
          if (
            !isRecord(source) ||
            typeof source.path !== 'string' ||
            typeof source.label !== 'string'
          ) {
            return false;
          }
          return (
            Object.keys(source).every((key) =>
              ['path', 'label', 'kind', 'section', 'documentationUrls'].includes(key),
            ) &&
            (source.kind === undefined || typeof source.kind === 'string') &&
            (source.section === undefined || typeof source.section === 'string') &&
            (source.documentationUrls === undefined ||
              (Array.isArray(source.documentationUrls) &&
                source.documentationUrls.every((url) => typeof url === 'string')))
          );
        })
      );
    }
    return false;
  });
};

const validateStoredCorrection = (correction: unknown): QuestionCorrection | undefined => {
  if (correction === null) {
    return undefined;
  }
  if (!isQuestionCorrection(correction)) {
    throw new Error('Stored question correction is invalid.');
  }
  return correction;
};

export class FeedbackValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join(' '));
    this.issues = issues;
    this.name = 'FeedbackValidationError';
  }
}

const addCitationIssues = (original: PackQuestion, sources: unknown, issues: string[]) => {
  if (
    !Array.isArray(sources) ||
    sources.length === 0 ||
    sources.some(
      (source) =>
        !isRecord(source) ||
        typeof source.path !== 'string' ||
        !source.path.trim() ||
        typeof source.label !== 'string' ||
        !source.label.trim(),
    )
  ) {
    issues.push('Correction must retain at least one complete citation.');
  }
  if (
    Array.isArray(sources) &&
    sources.some(
      (source) =>
        isRecord(source) &&
        typeof source.path === 'string' &&
        !original.sources.some((citation) => citationKey(citation) === citationKey(source)),
    )
  ) {
    issues.push('Correction sources must refer to citation files in this imported pack version.');
  }
};

const addAnswerIssues = (updated: JsonRecord, issues: string[]) => {
  const rawOptions = updated.options;
  const options = Array.isArray(rawOptions) ? rawOptions : [];
  const { answerIds } = updated;
  if (
    !Array.isArray(answerIds) ||
    answerIds.length === 0 ||
    answerIds.some(
      (id) =>
        typeof id !== 'string' || !options.some((option) => isRecord(option) && option.id === id),
    ) ||
    new Set(answerIds).size !== answerIds.length ||
    (updated.type === 'single_choice' && answerIds.length !== 1)
  ) {
    issues.push('Correct answers must refer to available options and match the question type.');
  }
};

const normalizeCorrection = (
  correction: JsonRecord,
  validatedQuestion: PackQuestion,
): QuestionCorrection => {
  const allowed = ['type', 'domainId', 'prompt', 'options', 'answerIds', 'explanation', 'sources'];
  const normalized: QuestionCorrection = {};
  for (const field of allowed) {
    if (!Object.hasOwn(correction, field)) {
      continue;
    }
    if (field === 'options') {
      normalized.options = validatedQuestion.options;
    } else if (field === 'sources') {
      normalized.sources = validatedQuestion.sources;
    } else if (field === 'answerIds') {
      normalized.answerIds = [...validatedQuestion.answerIds].toSorted();
    } else if (field === 'type') {
      normalized.type = validatedQuestion.type;
    } else if (field === 'domainId') {
      normalized.domainId = validatedQuestion.domainId;
    } else if (field === 'prompt') {
      normalized.prompt = validatedQuestion.prompt;
    } else if (field === 'explanation') {
      normalized.explanation = validatedQuestion.explanation;
    }
  }
  return normalized;
};

const validateCorrection = (
  pack: ExamPack,
  questionId: string,
  input: unknown,
): QuestionCorrection => {
  const original = pack.questions.find((question) => question.id === questionId);
  if (!original) {
    throw new FeedbackValidationError(['Question is not in this imported pack version.']);
  }
  if (!isRecord(input)) {
    throw new FeedbackValidationError(['Correction must be a JSON object.']);
  }
  const correction = input;
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
  const updated: JsonRecord = { ...original, ...correction };
  addCitationIssues(original, updated.sources, issues);
  addAnswerIssues(updated, issues);
  const candidate: unknown = {
    ...pack,
    questions: pack.questions.map((question) => (question.id === questionId ? updated : question)),
  };
  const validation = validateExamPack(candidate);
  if (!validation.valid) {
    issues.push(...validation.errors.map((issue) => `Correction is invalid: ${issue}`));
  }
  if (issues.length) {
    throw new FeedbackValidationError([...new Set(issues)]);
  }
  const validatedQuestion = validation.valid
    ? validation.pack.questions.find((question) => question.id === questionId)
    : undefined;
  if (!validatedQuestion) {
    throw new Error('Validated question correction was not returned.');
  }
  return normalizeCorrection(correction, validatedQuestion);
};

const toFeedbackItem = (row: StoredFeedback): FeedbackItem => {
  const correction = validateStoredCorrection(row.correction);
  if (row.retired !== 0 && row.retired !== 1) {
    throw new Error('Stored question retirement value is invalid.');
  }
  return {
    ...(correction ? { correction } : {}),
    examId: row.examId,
    flags: validateStoredFlags(row.flags),
    packId: row.packId,
    packVersion: row.packVersion,
    questionId: row.questionId,
    retired: row.retired === 1,
  };
};

export const flagQuestion = async (
  input: FeedbackKey & { reason: string },
  database?: AppDatabase,
): Promise<FeedbackItem> => {
  const reason = input.reason.trim();
  if (!reason) {
    throw new FeedbackValidationError(['A flag reason is required.']);
  }
  const pack = await getImportedPack(input.examId, input.packId, input.packVersion, database);
  if (pack?.questions.some((question) => question.id === input.questionId) !== true) {
    throw new FeedbackValidationError(['Question is not in this imported pack version.']);
  }
  const row = await updateFeedback(input, database, (previous) => {
    const flags = previous ? validateStoredFlags(previous.flags) : [];
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
  input: FeedbackKey & { correction: unknown },
  database?: AppDatabase,
): Promise<FeedbackItem> => {
  const pack = await getImportedPack(input.examId, input.packId, input.packVersion, database);
  if (!pack) {
    throw new FeedbackValidationError(['Imported pack version is unavailable.']);
  }
  const correction = validateCorrection(pack, input.questionId, input.correction);
  const row = await updateFeedback(input, database, (previous) => ({
    correction,
    flags: previous ? validateStoredFlags(previous.flags) : [],
    retired: previous?.retired ?? 0,
  }));
  return toFeedbackItem(row);
};

export const retireQuestion = async (
  key: FeedbackKey,
  retired: boolean,
  database?: AppDatabase,
): Promise<FeedbackItem> => {
  const pack = await getImportedPack(key.examId, key.packId, key.packVersion, database);
  if (pack?.questions.some((question) => question.id === key.questionId) !== true) {
    throw new FeedbackValidationError(['Question is not in this imported pack version.']);
  }
  const row = await updateFeedback(key, database, (previous) => ({
    correction: previous?.correction ?? null,
    flags: previous ? validateStoredFlags(previous.flags) : [],
    retired: retired ? 1 : 0,
  }));
  return toFeedbackItem(row);
};

export const listFeedback = async (
  examId: string,
  packId: string,
  packVersion: string,
  database?: AppDatabase,
): Promise<FeedbackItem[]> => {
  const rows = await listFeedbackRows(examId, packId, packVersion, database);
  return rows.map(toFeedbackItem);
};

export const exportFeedback = async (database?: AppDatabase): Promise<string> => {
  const rows = await listAllFeedbackRows(database);
  const items = rows.map(toFeedbackItem);
  return JSON.stringify({ format: 'question-feedback', items, version: 1 });
};

export const getEffectivePack = async (
  pack: ExamPack,
  database?: AppDatabase,
): Promise<ExamPack> => {
  const feedback = await listFeedback(pack.exam.id, pack.pack.id, pack.pack.version, database);
  const byId = new Map(feedback.map((item) => [item.questionId, item]));
  const questions = pack.questions.flatMap((question) => {
    const item = byId.get(question.id);
    if (item?.retired === true) {
      return [];
    }
    return [{ ...question, ...item?.correction }];
  });
  return { ...pack, questions };
};

export const readPackForReview = async (
  examId: string,
  packId: string,
  packVersion: string,
  database?: AppDatabase,
): Promise<{ feedback: FeedbackItem[]; pack: ExamPack }> => {
  const pack = await getImportedPack(examId, packId, packVersion, database);
  if (!pack) {
    httpError(HTTP_NOT_FOUND, 'That imported exam pack version is not available.');
  }
  return { feedback: await listFeedback(examId, packId, packVersion, database), pack };
};
