import type { SQLOutputValue } from 'node:sqlite';

import { validateExamPack } from '@learning-platform/exam-pack';
import type { ExamPack, PackQuestion, PackSource } from '@learning-platform/exam-pack';
import { error as httpError } from '@sveltejs/kit';
import * as Schema from 'effect/Schema';

import { getImportedPack, openPackDatabase } from '#lib/server/db/packs.js';
import { HTTP_NOT_FOUND } from '#lib/server/http-status.js';
import { decodeJsonText, isJsonArray, isJsonObject, JsonValueSchema } from '#lib/server/json.js';
import type { JsonObject, JsonValue } from '#lib/server/json.js';

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

export interface PackForReview {
  feedback: FeedbackItem[];
  pack: ExamPack;
}

type FeedbackRow = Record<string, SQLOutputValue> & {
  flagsJson?: SQLOutputValue;
  correctionJson?: SQLOutputValue;
  retired?: SQLOutputValue;
};

const readText = (row: Record<string, SQLOutputValue>, field: string): string => {
  const value = row[field];

  if (!Schema.is(Schema.String)(value)) {
    throw new TypeError(`Stored feedback field "${field}" is not text.`);
  }

  return value;
};

const citationKey = (value: PackSource): string =>
  JSON.stringify(Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right)));

const hasCorrectionJson = (value: SQLOutputValue | null | undefined): value is string =>
  Schema.is(Schema.String)(value) && value.length > 0;

const packSourceKeys = new Set(['path', 'label', 'kind', 'section', 'documentationUrls']);

const questionCorrectionFields = [
  'type',
  'domainId',
  'prompt',
  'options',
  'answerIds',
  'explanation',
  'sources',
] as const;

const questionCorrectionFieldSet = new Set<string>(questionCorrectionFields);

const readPackSource = (value: JsonValue): PackSource | undefined => {
  if (
    !isJsonObject(value) ||
    !Schema.is(Schema.String)(value['path']) ||
    !Schema.is(Schema.String)(value['label'])
  ) {
    return undefined;
  }

  if (
    !Object.keys(value).every((key) => packSourceKeys.has(key)) ||
    (value['kind'] !== undefined && !Schema.is(Schema.String)(value['kind'])) ||
    (value['section'] !== undefined && !Schema.is(Schema.String)(value['section']))
  ) {
    return undefined;
  }

  const source: PackSource = { label: value['label'], path: value['path'] };

  if (Schema.is(Schema.String)(value['kind'])) {
    source.kind = value['kind'];
  }

  if (Schema.is(Schema.String)(value['section'])) {
    source.section = value['section'];
  }

  if (value['documentationUrls'] !== undefined) {
    if (!isJsonArray(value['documentationUrls'])) {
      return undefined;
    }

    const documentationUrls = value['documentationUrls'].flatMap((url) =>
      Schema.is(Schema.String)(url) ? [url] : [],
    );

    if (documentationUrls.length !== value['documentationUrls'].length) {
      return undefined;
    }

    source.documentationUrls = documentationUrls;
  }

  return source;
};

const parseFlags = (value: string): FeedbackItem['flags'] => {
  const parsed = decodeJsonText(value);

  if (!isJsonArray(parsed)) {
    throw new TypeError('Stored question feedback flags are invalid.');
  }

  return parsed.map((flag) => {
    if (!isJsonObject(flag) || !Schema.is(Schema.String)(flag['reason'])) {
      throw new Error('Stored question feedback flags are invalid.');
    }

    return { reason: flag['reason'] };
  });
};

const isQuestionCorrection = (value: unknown): value is QuestionCorrection => {
  if (!isJsonObject(value)) {
    return false;
  }

  if (Object.keys(value).some((field) => !questionCorrectionFieldSet.has(field))) {
    return false;
  }

  return Object.entries(value).every(([field, fieldValue]) => {
    if (field === 'type') {
      return fieldValue === 'single_choice' || fieldValue === 'multiple_choice';
    }

    if (field === 'domainId' || field === 'prompt' || field === 'explanation') {
      return Schema.is(Schema.String)(fieldValue);
    }

    if (field === 'answerIds') {
      return isJsonArray(fieldValue) && fieldValue.every(Schema.is(Schema.String));
    }

    if (field === 'options') {
      return (
        isJsonArray(fieldValue) &&
        fieldValue.every(
          (option) =>
            isJsonObject(option) &&
            Schema.is(Schema.String)(option['id']) &&
            Schema.is(Schema.String)(option['text']) &&
            Object.keys(option).every((key) => key === 'id' || key === 'text'),
        )
      );
    }

    if (field === 'sources') {
      return (
        Array.isArray(fieldValue) &&
        fieldValue.every((source) => {
          if (
            !isJsonObject(source) ||
            !Schema.is(Schema.String)(source['path']) ||
            !Schema.is(Schema.String)(source['label'])
          ) {
            return false;
          }

          return Object.entries(source).every(([key, sourceValue]) => {
            if (key === 'path' || key === 'label' || key === 'kind' || key === 'section') {
              return Schema.is(Schema.String)(sourceValue);
            }

            if (key === 'documentationUrls') {
              return isJsonArray(sourceValue) && sourceValue.every(Schema.is(Schema.String));
            }

            return false;
          });
        })
      );
    }

    return false;
  });
};

const parseCorrection = (value: string): QuestionCorrection => {
  const parsed = decodeJsonText(value);

  if (!isQuestionCorrection(parsed)) {
    throw new Error('Stored question correction is invalid.');
  }

  return parsed;
};

const feedbackRow = (row: FeedbackRow) => {
  const { flagsJson } = row;
  const { correctionJson } = row;
  const { retired } = row;

  if (
    !Schema.is(Schema.String)(flagsJson) ||
    (correctionJson !== null && !Schema.is(Schema.String)(correctionJson))
  ) {
    throw new Error('Stored question feedback is invalid.');
  }

  return {
    correctionJson,
    flagsJson,
    retired: Schema.is(Schema.Finite)(retired) && retired !== 0,
  };
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

const addCitationIssues = (
  original: PackQuestion,
  sources: JsonValue | undefined,
  issues: string[],
) => {
  if (
    !isJsonArray(sources) ||
    sources.length === 0 ||
    sources.some((value) => {
      const source = readPackSource(value);

      return source === undefined || !source.path.trim() || !source.label.trim();
    })
  ) {
    issues.push('Correction must retain at least one complete citation.');
  }

  if (
    isJsonArray(sources) &&
    sources.some((value) => {
      const source = readPackSource(value);

      return (
        source !== undefined &&
        !original.sources.some((citation) => citationKey(citation) === citationKey(source))
      );
    })
  ) {
    issues.push('Correction sources must refer to citation files in this imported pack version.');
  }
};

const addAnswerIssues = (updated: JsonObject, issues: string[]) => {
  const rawOptions = updated['options'];
  const options = isJsonArray(rawOptions) ? rawOptions : [];
  const { answerIds } = updated;

  if (
    !isJsonArray(answerIds) ||
    answerIds.length === 0 ||
    answerIds.some(
      (id) =>
        !Schema.is(Schema.String)(id) ||
        !options.some((option) => isJsonObject(option) && option['id'] === id),
    ) ||
    new Set(answerIds).size !== answerIds.length ||
    (updated['type'] === 'single_choice' && answerIds.length !== 1)
  ) {
    issues.push('Correct answers must refer to available options and match the question type.');
  }
};

const normalizeCorrection = (
  correction: JsonObject,
  validatedQuestion: PackQuestion,
): QuestionCorrection =>
  questionCorrectionFields.reduce<QuestionCorrection>((normalized, field) => {
    if (!Object.hasOwn(correction, field)) {
      return normalized;
    }

    switch (field) {
      case 'options': {
        normalized.options = validatedQuestion.options;
        break;
      }

      case 'sources': {
        normalized.sources = validatedQuestion.sources;
        break;
      }

      case 'answerIds': {
        normalized.answerIds = [...validatedQuestion.answerIds].toSorted();
        break;
      }

      case 'type': {
        normalized.type = validatedQuestion.type;
        break;
      }

      case 'domainId': {
        normalized.domainId = validatedQuestion.domainId;
        break;
      }

      case 'prompt': {
        normalized.prompt = validatedQuestion.prompt;
        break;
      }

      case 'explanation': {
        normalized.explanation = validatedQuestion.explanation;
        break;
      }

      default: {
        const exhaustiveField: never = field;
        throw new Error(`Unexpected question correction field: ${String(exhaustiveField)}`);
      }
    }

    return normalized;
  }, {});

const validateCorrection = (
  pack: ExamPack,
  questionId: string,
  input: JsonValue,
): QuestionCorrection => {
  const original = pack.questions.find((question) => question.id === questionId);

  if (!original) {
    throw new FeedbackValidationError(['Question is not in this imported pack version.']);
  }

  if (!isJsonObject(input)) {
    throw new FeedbackValidationError(['Correction must be a JSON object.']);
  }

  const correction = input;

  const issues = Object.keys(correction)
    .filter((field) => !questionCorrectionFieldSet.has(field))
    .map((field) => `Correction contains unsupported field "${field}".`);

  if (Object.keys(correction).length === 0) {
    issues.push('Correction must change at least one question field.');
  }

  const updated = Schema.decodeUnknownSync(JsonValueSchema)({ ...original, ...correction });

  if (!isJsonObject(updated)) {
    throw new FeedbackValidationError(['Correction must be a JSON object.']);
  }

  addCitationIssues(original, updated['sources'], issues);
  addAnswerIssues(updated, issues);

  const candidate = {
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

  const feedbackItem: FeedbackItem = {
    examId: input.examId,
    flags: sortedFlags,
    packId: input.packId,
    packVersion: input.packVersion,
    questionId: input.questionId,
    retired: previous?.retired ?? false,
  };

  if (hasCorrectionJson(previous?.correctionJson)) {
    feedbackItem.correction = parseCorrection(previous.correctionJson);
  }

  return feedbackItem;
};

export const createCorrection = (
  databasePath: string,
  input: FeedbackKey & { correction: JsonValue },
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

  const feedbackItem: FeedbackItem = {
    ...key,
    flags: previous ? parseFlags(previous.flagsJson) : [],
    retired,
  };

  if (hasCorrectionJson(previous?.correctionJson)) {
    feedbackItem.correction = parseCorrection(previous.correctionJson);
  }

  return feedbackItem;
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

        const feedbackItem: FeedbackItem = {
          examId,
          flags: parseFlags(saved.flagsJson),
          packId,
          packVersion,
          questionId: readText(row, 'questionId'),
          retired: saved.retired,
        };

        if (hasCorrectionJson(saved.correctionJson)) {
          feedbackItem.correction = parseCorrection(saved.correctionJson);
        }

        return feedbackItem;
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

      const feedbackItem: FeedbackItem = {
        examId: readText(row, 'examId'),
        flags: parseFlags(saved.flagsJson),
        packId: readText(row, 'packId'),
        packVersion: readText(row, 'packVersion'),
        questionId: readText(row, 'questionId'),
        retired: saved.retired,
      };

      if (hasCorrectionJson(saved.correctionJson)) {
        feedbackItem.correction = parseCorrection(saved.correctionJson);
      }

      return feedbackItem;
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
): PackForReview => {
  const pack = getImportedPack(examId, packId, packVersion, databasePath);

  if (!pack) {
    httpError(HTTP_NOT_FOUND, 'That imported exam pack version is not available.');
  }

  return { feedback: listFeedback(databasePath, examId, packId, packVersion), pack };
};
