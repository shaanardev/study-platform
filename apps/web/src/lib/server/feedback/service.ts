import type { SQLOutputValue } from 'node:sqlite';

import { error as httpError } from '@sveltejs/kit';

import { getImportedPack, openPackDatabase } from '#lib/server/db/packs.js';
import { normalizeLegacyCitations } from '#lib/server/packs/legacy.js';
import { validateExamPack } from '#lib/server/packs/validate.js';
import type { ExamPack, PackQuestion } from '#lib/types/exam-pack.js';

export interface FeedbackKey {
  examId: string;
  packId: string;
  packVersion: string;
  questionId: string;
}
export type QuestionCorrection = Partial<
  Pick<
    PackQuestion,
    'type' | 'domainId' | 'prompt' | 'options' | 'answerIds' | 'explanation' | 'sources'
  >
>;
export type FeedbackItem = FeedbackKey & {
  flags: { reason: string }[];
  correction?: QuestionCorrection;
  retired: boolean;
};

type FeedbackRow = Record<string, SQLOutputValue> & {
  flagsJson?: SQLOutputValue;
  correctionJson?: SQLOutputValue;
  retired?: SQLOutputValue;
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
  questions?: unknown;
};

const readText = (row: Record<string, SQLOutputValue>, field: string): string => {
  const value = row[field];
  if (typeof value !== 'string') {
    throw new TypeError(`Stored feedback field "${field}" is not text.`);
  }
  return value;
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const citationKey = (value: object): string =>
  JSON.stringify(Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right)));

const parseFlags = (value: string): FeedbackItem['flags'] => {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new TypeError('Stored question feedback flags are invalid.');
  }
  const flags: FeedbackItem['flags'] = [];
  for (const flag of parsed) {
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
          return Object.keys(source).every((key) => key === 'path' || key === 'label');
        })
      );
    }
    return false;
  });
};

const parseCorrection = (value: string): QuestionCorrection => {
  const parsed: unknown = JSON.parse(value);
  const normalized = normalizeLegacyCitations({
    questions: [{ sources: isRecord(parsed) ? parsed.sources : undefined }],
  });
  const questions = isRecord(normalized) ? normalized.questions : undefined;
  const sources: unknown = Array.isArray(questions) ? questions[0] : undefined;
  const correction = isRecord(parsed)
    ? {
        ...parsed,
        ...(isRecord(sources) && Array.isArray(sources.sources)
          ? { sources: sources.sources }
          : {}),
      }
    : parsed;
  if (!isQuestionCorrection(correction)) {
    throw new Error('Stored question correction is invalid.');
  }
  return correction;
};

const feedbackRow = (row: FeedbackRow) => {
  const { flagsJson } = row;
  const { correctionJson } = row;
  const { retired } = row;
  if (
    typeof flagsJson !== 'string' ||
    (correctionJson !== null && typeof correctionJson !== 'string')
  ) {
    throw new Error('Stored question feedback is invalid.');
  }
  return { correctionJson, flagsJson, retired: typeof retired === 'number' && retired !== 0 };
};

export class FeedbackValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join(' '));
    this.issues = issues;
    this.name = 'FeedbackValidationError';
  }
}

const currentFeedback = (databasePath: string, key: FeedbackKey) => {
  const database = openPackDatabase(databasePath);
  try {
    const row = database
      .prepare(
        `SELECT flags_json AS flagsJson, correction_json AS correctionJson, retired
      FROM question_feedback WHERE exam_id = ? AND pack_id = ? AND pack_version = ? AND question_id = ?`,
      )
      .get(key.examId, key.packId, key.packVersion, key.questionId);
    return row ? feedbackRow(row) : undefined;
  } finally {
    database.close();
  }
};

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

export const flagQuestion = (
  databasePath: string,
  input: FeedbackKey & { reason: string },
): FeedbackItem => {
  const reason = input.reason.trim();
  if (!reason) {
    throw new FeedbackValidationError(['A flag reason is required.']);
  }
  const pack = getImportedPack(input.examId, input.packId, input.packVersion, databasePath);
  if (pack?.questions.some((question) => question.id === input.questionId) !== true) {
    throw new FeedbackValidationError(['Question is not in this imported pack version.']);
  }
  const previous = currentFeedback(databasePath, input);
  const flags = previous ? parseFlags(previous.flagsJson) : [];
  if (!flags.some((flag) => flag.reason === reason)) {
    flags.push({ reason });
  }
  const sortedFlags = flags.toSorted((left, right) => left.reason.localeCompare(right.reason));
  const database = openPackDatabase(databasePath);
  try {
    database
      .prepare(
        `INSERT INTO question_feedback (exam_id, pack_id, pack_version, question_id, flags_json, correction_json, retired)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(exam_id, pack_id, pack_version, question_id) DO UPDATE SET flags_json = excluded.flags_json, updated_at = CURRENT_TIMESTAMP`,
      )
      .run(
        input.examId,
        input.packId,
        input.packVersion,
        input.questionId,
        JSON.stringify(sortedFlags),
        previous?.correctionJson ?? null,
        Number(previous?.retired ?? false),
      );
  } finally {
    database.close();
  }
  return {
    ...(previous?.correctionJson !== null &&
    previous?.correctionJson !== undefined &&
    previous.correctionJson.length > 0
      ? { correction: parseCorrection(previous.correctionJson) }
      : {}),
    examId: input.examId,
    flags: sortedFlags,
    packId: input.packId,
    packVersion: input.packVersion,
    questionId: input.questionId,
    retired: previous?.retired ?? false,
  };
};

export const createCorrection = (
  databasePath: string,
  input: FeedbackKey & { correction: unknown },
): FeedbackItem => {
  const pack = getImportedPack(input.examId, input.packId, input.packVersion, databasePath);
  if (!pack) {
    throw new FeedbackValidationError(['Imported pack version is unavailable.']);
  }
  const correction = validateCorrection(pack, input.questionId, input.correction);
  const previous = currentFeedback(databasePath, input);
  const database = openPackDatabase(databasePath);
  try {
    database
      .prepare(
        `INSERT INTO question_feedback (exam_id, pack_id, pack_version, question_id, flags_json, correction_json, retired)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(exam_id, pack_id, pack_version, question_id) DO UPDATE SET correction_json = excluded.correction_json, updated_at = CURRENT_TIMESTAMP`,
      )
      .run(
        input.examId,
        input.packId,
        input.packVersion,
        input.questionId,
        previous?.flagsJson ?? '[]',
        JSON.stringify(correction),
        Number(previous?.retired ?? false),
      );
  } finally {
    database.close();
  }
  return {
    correction,
    examId: input.examId,
    flags: previous ? parseFlags(previous.flagsJson) : [],
    packId: input.packId,
    packVersion: input.packVersion,
    questionId: input.questionId,
    retired: previous?.retired ?? false,
  };
};

export const retireQuestion = (
  databasePath: string,
  key: FeedbackKey,
  retired: boolean,
): FeedbackItem => {
  const pack = getImportedPack(key.examId, key.packId, key.packVersion, databasePath);
  if (pack?.questions.some((question) => question.id === key.questionId) !== true) {
    throw new FeedbackValidationError(['Question is not in this imported pack version.']);
  }
  const previous = currentFeedback(databasePath, key);
  const database = openPackDatabase(databasePath);
  try {
    database
      .prepare(
        `INSERT INTO question_feedback (exam_id, pack_id, pack_version, question_id, flags_json, correction_json, retired)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(exam_id, pack_id, pack_version, question_id) DO UPDATE SET retired = excluded.retired, updated_at = CURRENT_TIMESTAMP`,
      )
      .run(
        key.examId,
        key.packId,
        key.packVersion,
        key.questionId,
        previous?.flagsJson ?? '[]',
        previous?.correctionJson ?? null,
        Number(retired),
      );
  } finally {
    database.close();
  }
  return {
    ...key,
    flags: previous ? parseFlags(previous.flagsJson) : [],
    ...(previous?.correctionJson !== null &&
    previous?.correctionJson !== undefined &&
    previous.correctionJson.length > 0
      ? { correction: parseCorrection(previous.correctionJson) }
      : {}),
    retired,
  };
};

export const listFeedback = (
  databasePath: string,
  examId: string,
  packId: string,
  packVersion: string,
): FeedbackItem[] => {
  const database = openPackDatabase(databasePath);
  try {
    return database
      .prepare(
        `SELECT question_id AS questionId, flags_json AS flagsJson, correction_json AS correctionJson, retired
      FROM question_feedback WHERE exam_id = ? AND pack_id = ? AND pack_version = ? ORDER BY question_id`,
      )
      .all(examId, packId, packVersion)
      .map((row) => {
        const saved = feedbackRow(row);
        return {
          ...(saved.correctionJson !== null &&
          saved.correctionJson !== undefined &&
          saved.correctionJson.length > 0
            ? { correction: parseCorrection(saved.correctionJson) }
            : {}),
          examId,
          flags: parseFlags(saved.flagsJson),
          packId,
          packVersion,
          questionId: readText(row, 'questionId'),
          retired: saved.retired,
        };
      });
  } finally {
    database.close();
  }
};

export const exportFeedback = (databasePath: string): string => {
  const database = openPackDatabase(databasePath);
  try {
    const rows = database
      .prepare(
        `SELECT exam_id AS examId, pack_id AS packId, pack_version AS packVersion,
      question_id AS questionId, flags_json AS flagsJson, correction_json AS correctionJson, retired
      FROM question_feedback ORDER BY exam_id, pack_id, pack_version, question_id`,
      )
      .all();
    const items = rows.map((row) => {
      const saved = feedbackRow(row);
      return {
        ...(saved.correctionJson !== null &&
        saved.correctionJson !== undefined &&
        saved.correctionJson.length > 0
          ? { correction: parseCorrection(saved.correctionJson) }
          : {}),
        examId: readText(row, 'examId'),
        flags: parseFlags(saved.flagsJson),
        packId: readText(row, 'packId'),
        packVersion: readText(row, 'packVersion'),
        questionId: readText(row, 'questionId'),
        retired: saved.retired,
      };
    });
    return JSON.stringify({ format: 'question-feedback', items, version: 1 });
  } finally {
    database.close();
  }
};

export const getEffectivePack = (databasePath: string, pack: ExamPack) => {
  const feedback = listFeedback(databasePath, pack.exam.id, pack.pack.id, pack.pack.version);
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

export const readPackForReview = (
  databasePath: string,
  examId: string,
  packId: string,
  packVersion: string,
): { feedback: FeedbackItem[]; pack: ExamPack } => {
  const pack = getImportedPack(examId, packId, packVersion, databasePath);
  if (!pack) {
    httpError(404, 'That imported exam pack version is not available.');
  }
  return { feedback: listFeedback(databasePath, examId, packId, packVersion), pack };
};
