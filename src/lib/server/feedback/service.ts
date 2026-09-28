import type { SQLOutputValue } from 'node:sqlite';
import { error } from '@sveltejs/kit';
import { getImportedPack, openPackDatabase } from '#lib/server/db/packs.js';
import { validateExamPack } from '#lib/server/packs/validate.js';
import type { ExamPack, PackQuestion } from '#lib/types/exam-pack.js';

export type FeedbackKey = {
  examId: string;
  packId: string;
  packVersion: string;
  questionId: string;
};
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
};

function readText(row: Record<string, SQLOutputValue>, field: string): string {
  const value = row[field];
  if (typeof value !== 'string') throw new Error(`Stored feedback field "${field}" is not text.`);
  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFlags(value: string): FeedbackItem['flags'] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error('Stored question feedback flags are invalid.');
  }
  const flags: FeedbackItem['flags'] = [];
  for (const flag of parsed) {
    if (!isRecord(flag) || typeof flag.reason !== 'string') {
      throw new Error('Stored question feedback flags are invalid.');
    }
    flags.push({ reason: flag.reason });
  }
  return flags;
}

function isQuestionCorrection(value: unknown): value is QuestionCorrection {
  if (!isRecord(value)) return false;
  const allowed = ['type', 'domainId', 'prompt', 'options', 'answerIds', 'explanation', 'sources'];
  if (Object.keys(value).some((field) => !allowed.includes(field))) return false;
  return Object.entries(value).every(([field, fieldValue]) => {
    if (field === 'type') return fieldValue === 'single_choice' || fieldValue === 'multiple_choice';
    if (field === 'domainId' || field === 'prompt' || field === 'explanation')
      return typeof fieldValue === 'string';
    if (field === 'answerIds')
      return Array.isArray(fieldValue) && fieldValue.every((id) => typeof id === 'string');
    if (field === 'options')
      return (
        Array.isArray(fieldValue) &&
        fieldValue.every(
          (option) =>
            isRecord(option) && typeof option.id === 'string' && typeof option.text === 'string',
        )
      );
    if (field === 'sources')
      return (
        Array.isArray(fieldValue) &&
        fieldValue.every(
          (source) =>
            isRecord(source) && typeof source.path === 'string' && typeof source.label === 'string',
        )
      );
    return false;
  });
}

function parseCorrection(value: string): QuestionCorrection {
  const parsed: unknown = JSON.parse(value);
  if (!isQuestionCorrection(parsed)) throw new Error('Stored question correction is invalid.');
  return parsed;
}

function feedbackRow(row: FeedbackRow) {
  const flagsJson = row.flagsJson;
  const correctionJson = row.correctionJson;
  const retired = row.retired;
  if (
    typeof flagsJson !== 'string' ||
    (correctionJson !== null && typeof correctionJson !== 'string')
  ) {
    throw new Error('Stored question feedback is invalid.');
  }
  return { flagsJson, correctionJson, retired: typeof retired === 'number' && retired !== 0 };
}

export class FeedbackValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join(' '));
    this.name = 'FeedbackValidationError';
  }
}

function currentFeedback(databasePath: string, key: FeedbackKey) {
  const database = openPackDatabase(databasePath);
  try {
    const row = database
      .prepare(`SELECT flags_json AS flagsJson, correction_json AS correctionJson, retired
      FROM question_feedback WHERE exam_id = ? AND pack_id = ? AND pack_version = ? AND question_id = ?`)
      .get(key.examId, key.packId, key.packVersion, key.questionId);
    return row ? feedbackRow(row) : undefined;
  } finally {
    database.close();
  }
}

function validateCorrection(
  pack: ExamPack,
  questionId: string,
  input: unknown,
): QuestionCorrection {
  const original = pack.questions.find((question) => question.id === questionId);
  if (!original)
    throw new FeedbackValidationError(['Question is not in this imported pack version.']);
  if (!isRecord(input)) throw new FeedbackValidationError(['Correction must be a JSON object.']);
  const correction = input;
  const allowed = ['type', 'domainId', 'prompt', 'options', 'answerIds', 'explanation', 'sources'];
  const issues = Object.keys(correction)
    .filter((field) => !allowed.includes(field))
    .map((field) => `Correction contains unsupported field "${field}".`);
  if (Object.keys(correction).length === 0)
    issues.push('Correction must change at least one question field.');
  const updated: JsonRecord = { ...original, ...correction };
  const sources = updated.sources;
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
        !original.sources.some((citation) => citation.path === source.path),
    )
  ) {
    issues.push('Correction sources must refer to citation files in this imported pack version.');
  }
  const rawOptions = updated.options;
  const options = Array.isArray(rawOptions) ? rawOptions : [];
  const answerIds = updated.answerIds;
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
  const candidate: unknown = {
    ...pack,
    questions: pack.questions.map((question) => (question.id === questionId ? updated : question)),
  };
  const validation = validateExamPack(candidate);
  if (!validation.valid)
    issues.push(...validation.errors.map((issue) => `Correction is invalid: ${issue}`));
  if (issues.length) throw new FeedbackValidationError([...new Set(issues)]);
  const validatedQuestion = validation.valid
    ? validation.pack.questions.find((question) => question.id === questionId)
    : undefined;
  if (!validatedQuestion) throw new Error('Validated question correction was not returned.');
  const normalized: QuestionCorrection = {};
  for (const field of allowed) {
    if (!Object.hasOwn(correction, field)) continue;
    if (field === 'options') normalized.options = validatedQuestion.options;
    else if (field === 'sources') normalized.sources = validatedQuestion.sources;
    else if (field === 'answerIds') normalized.answerIds = [...validatedQuestion.answerIds].sort();
    else if (field === 'type') normalized.type = validatedQuestion.type;
    else if (field === 'domainId') normalized.domainId = validatedQuestion.domainId;
    else if (field === 'prompt') normalized.prompt = validatedQuestion.prompt;
    else if (field === 'explanation') normalized.explanation = validatedQuestion.explanation;
  }
  return normalized;
}

export function flagQuestion(
  databasePath: string,
  input: FeedbackKey & { reason: string },
): FeedbackItem {
  const reason = input.reason.trim();
  if (!reason) throw new FeedbackValidationError(['A flag reason is required.']);
  const pack = getImportedPack(input.examId, input.packId, input.packVersion, databasePath);
  if (!pack?.questions.some((question) => question.id === input.questionId))
    throw new FeedbackValidationError(['Question is not in this imported pack version.']);
  const previous = currentFeedback(databasePath, input);
  const flags = previous ? parseFlags(previous.flagsJson) : [];
  if (!flags.some((flag) => flag.reason === reason)) flags.push({ reason });
  flags.sort((left, right) => left.reason.localeCompare(right.reason));
  const database = openPackDatabase(databasePath);
  try {
    database
      .prepare(`INSERT INTO question_feedback (exam_id, pack_id, pack_version, question_id, flags_json, correction_json, retired)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(exam_id, pack_id, pack_version, question_id) DO UPDATE SET flags_json = excluded.flags_json, updated_at = CURRENT_TIMESTAMP`)
      .run(
        input.examId,
        input.packId,
        input.packVersion,
        input.questionId,
        JSON.stringify(flags),
        previous?.correctionJson ?? null,
        Number(previous?.retired ?? false),
      );
  } finally {
    database.close();
  }
  return {
    examId: input.examId,
    packId: input.packId,
    packVersion: input.packVersion,
    questionId: input.questionId,
    flags,
    ...(previous?.correctionJson ? { correction: parseCorrection(previous.correctionJson) } : {}),
    retired: previous?.retired ?? false,
  };
}

export function createCorrection(
  databasePath: string,
  input: FeedbackKey & { correction: unknown },
): FeedbackItem {
  const pack = getImportedPack(input.examId, input.packId, input.packVersion, databasePath);
  if (!pack) throw new FeedbackValidationError(['Imported pack version is unavailable.']);
  const correction = validateCorrection(pack, input.questionId, input.correction);
  const previous = currentFeedback(databasePath, input);
  const database = openPackDatabase(databasePath);
  try {
    database
      .prepare(`INSERT INTO question_feedback (exam_id, pack_id, pack_version, question_id, flags_json, correction_json, retired)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(exam_id, pack_id, pack_version, question_id) DO UPDATE SET correction_json = excluded.correction_json, updated_at = CURRENT_TIMESTAMP`)
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
    examId: input.examId,
    packId: input.packId,
    packVersion: input.packVersion,
    questionId: input.questionId,
    flags: previous ? parseFlags(previous.flagsJson) : [],
    correction,
    retired: previous?.retired ?? false,
  };
}

export function retireQuestion(
  databasePath: string,
  key: FeedbackKey,
  retired: boolean,
): FeedbackItem {
  const pack = getImportedPack(key.examId, key.packId, key.packVersion, databasePath);
  if (!pack?.questions.some((question) => question.id === key.questionId))
    throw new FeedbackValidationError(['Question is not in this imported pack version.']);
  const previous = currentFeedback(databasePath, key);
  const database = openPackDatabase(databasePath);
  try {
    database
      .prepare(`INSERT INTO question_feedback (exam_id, pack_id, pack_version, question_id, flags_json, correction_json, retired)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(exam_id, pack_id, pack_version, question_id) DO UPDATE SET retired = excluded.retired, updated_at = CURRENT_TIMESTAMP`)
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
    ...(previous?.correctionJson ? { correction: parseCorrection(previous.correctionJson) } : {}),
    retired,
  };
}

export function listFeedback(
  databasePath: string,
  examId: string,
  packId: string,
  packVersion: string,
): FeedbackItem[] {
  const database = openPackDatabase(databasePath);
  try {
    return database
      .prepare(`SELECT question_id AS questionId, flags_json AS flagsJson, correction_json AS correctionJson, retired
      FROM question_feedback WHERE exam_id = ? AND pack_id = ? AND pack_version = ? ORDER BY question_id`)
      .all(examId, packId, packVersion)
      .map((row) => {
        const saved = feedbackRow(row);
        return {
          examId,
          packId,
          packVersion,
          questionId: readText(row, 'questionId'),
          flags: parseFlags(saved.flagsJson),
          ...(saved.correctionJson ? { correction: parseCorrection(saved.correctionJson) } : {}),
          retired: saved.retired,
        };
      });
  } finally {
    database.close();
  }
}

export function exportFeedback(databasePath: string): string {
  const database = openPackDatabase(databasePath);
  try {
    const rows = database
      .prepare(`SELECT exam_id AS examId, pack_id AS packId, pack_version AS packVersion,
      question_id AS questionId, flags_json AS flagsJson, correction_json AS correctionJson, retired
      FROM question_feedback ORDER BY exam_id, pack_id, pack_version, question_id`)
      .all();
    const items = rows.map((row) => {
      const saved = feedbackRow(row);
      return {
        examId: readText(row, 'examId'),
        packId: readText(row, 'packId'),
        packVersion: readText(row, 'packVersion'),
        questionId: readText(row, 'questionId'),
        flags: parseFlags(saved.flagsJson),
        ...(saved.correctionJson ? { correction: parseCorrection(saved.correctionJson) } : {}),
        retired: saved.retired,
      };
    });
    return JSON.stringify({ format: 'ordewell-question-feedback', version: 1, items });
  } finally {
    database.close();
  }
}

export function getEffectivePack(databasePath: string, pack: ExamPack) {
  const feedback = listFeedback(databasePath, pack.exam.id, pack.pack.id, pack.pack.version);
  const byId = new Map(feedback.map((item) => [item.questionId, item]));
  const questions = pack.questions.flatMap((question) => {
    const item = byId.get(question.id);
    if (item?.retired) return [];
    return [{ ...question, ...(item?.correction ?? {}) }];
  });
  return { ...pack, questions };
}

export function readPackForReview(
  databasePath: string,
  examId: string,
  packId: string,
  packVersion: string,
) {
  const pack = getImportedPack(examId, packId, packVersion, databasePath);
  if (!pack) error(404, 'That imported exam pack version is not available.');
  return { pack, feedback: listFeedback(databasePath, examId, packId, packVersion) };
}
