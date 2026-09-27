import { error } from '@sveltejs/kit';
import { getImportedPack, openPackDatabase } from '../db/packs';
import type { ExamPack, PackQuestion } from '../packs/validate';
import { validateExamPack } from '../packs/validate';

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

export class FeedbackValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join(' '));
    this.name = 'FeedbackValidationError';
  }
}

function currentFeedback(databasePath: string, key: FeedbackKey) {
  const database = openPackDatabase(databasePath);
  try {
    return database
      .prepare(`SELECT flags_json AS flagsJson, correction_json AS correctionJson, retired
      FROM question_feedback WHERE exam_id = ? AND pack_id = ? AND pack_version = ? AND question_id = ?`)
      .get(key.examId, key.packId, key.packVersion, key.questionId);
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
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new FeedbackValidationError(['Correction must be a JSON object.']);
  const correction = input as Record<string, unknown>;
  const allowed = ['type', 'domainId', 'prompt', 'options', 'answerIds', 'explanation', 'sources'];
  const issues = Object.keys(correction)
    .filter((field) => !allowed.includes(field))
    .map((field) => `Correction contains unsupported field "${field}".`);
  if (Object.keys(correction).length === 0)
    issues.push('Correction must change at least one question field.');
  const updated = { ...original, ...correction } as PackQuestion;
  if (
    !Array.isArray(updated.sources) ||
    updated.sources.length === 0 ||
    updated.sources.some(
      (source) =>
        !source ||
        typeof source !== 'object' ||
        typeof source.path !== 'string' ||
        !source.path.trim() ||
        typeof source.label !== 'string' ||
        !source.label.trim(),
    )
  ) {
    issues.push('Correction must retain at least one complete citation.');
  }
  if (
    Array.isArray(updated.sources) &&
    updated.sources.some(
      (source) =>
        source &&
        typeof source === 'object' &&
        typeof source.path === 'string' &&
        !original.sources.some((citation) => citation.path === source.path),
    )
  ) {
    issues.push('Correction sources must refer to citation files in this imported pack version.');
  }
  const options = Array.isArray(updated.options) ? updated.options : [];
  if (
    !Array.isArray(updated.answerIds) ||
    updated.answerIds.length === 0 ||
    updated.answerIds.some(
      (id) =>
        typeof id !== 'string' ||
        !options.some((option) => option && typeof option === 'object' && option.id === id),
    ) ||
    new Set(updated.answerIds).size !== updated.answerIds.length ||
    (updated.type === 'single_choice' && updated.answerIds.length !== 1)
  ) {
    issues.push('Correct answers must refer to available options and match the question type.');
  }
  const candidate: ExamPack = {
    ...pack,
    questions: pack.questions.map((question) => (question.id === questionId ? updated : question)),
  };
  const validation = validateExamPack(candidate);
  if (!validation.valid)
    issues.push(...validation.errors.map((issue) => `Correction is invalid: ${issue}`));
  if (issues.length) throw new FeedbackValidationError([...new Set(issues)]);
  const normalized: QuestionCorrection = {};
  for (const field of allowed) {
    if (!Object.hasOwn(correction, field)) continue;
    const value = correction[field];
    if (field === 'options' && Array.isArray(value)) {
      normalized.options = value.map((option) => ({ id: option.id, text: option.text }));
    } else if (field === 'sources' && Array.isArray(value)) {
      normalized.sources = value.map((source) => ({ path: source.path, label: source.label }));
    } else if (field === 'answerIds' && Array.isArray(value)) {
      normalized.answerIds = [...value].sort();
    } else if (field === 'type' || field === 'domainId' || field === 'prompt' || field === 'explanation') {
      Object.assign(normalized, { [field]: value });
    }
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
  const flags = previous ? (JSON.parse(String(previous['flagsJson'])) as { reason: string }[]) : [];
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
        previous?.['correctionJson'] ?? null,
        previous?.['retired'] ?? 0,
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
    ...(previous?.['correctionJson']
      ? { correction: JSON.parse(String(previous['correctionJson'])) as QuestionCorrection }
      : {}),
    retired: Boolean(previous?.['retired']),
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
        previous?.['flagsJson'] ?? '[]',
        JSON.stringify(correction),
        previous?.['retired'] ?? 0,
      );
  } finally {
    database.close();
  }
  return {
    examId: input.examId,
    packId: input.packId,
    packVersion: input.packVersion,
    questionId: input.questionId,
    flags: previous ? (JSON.parse(String(previous['flagsJson'])) as { reason: string }[]) : [],
    correction,
    retired: Boolean(previous?.['retired']),
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
        previous?.['flagsJson'] ?? '[]',
        previous?.['correctionJson'] ?? null,
        Number(retired),
      );
  } finally {
    database.close();
  }
  return {
    ...key,
    flags: previous ? (JSON.parse(String(previous['flagsJson'])) as { reason: string }[]) : [],
    ...(previous?.['correctionJson']
      ? { correction: JSON.parse(String(previous['correctionJson'])) as QuestionCorrection }
      : {}),
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
      .map((row) => ({
        examId,
        packId,
        packVersion,
        questionId: String(row['questionId']),
        flags: JSON.parse(String(row['flagsJson'])) as { reason: string }[],
        ...(row['correctionJson']
          ? { correction: JSON.parse(String(row['correctionJson'])) as QuestionCorrection }
          : {}),
        retired: Boolean(row['retired']),
      }));
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
    const items = rows.map((row) => ({
      examId: String(row['examId']),
      packId: String(row['packId']),
      packVersion: String(row['packVersion']),
      questionId: String(row['questionId']),
      flags: JSON.parse(String(row['flagsJson'])) as { reason: string }[],
      ...(row['correctionJson']
        ? { correction: JSON.parse(String(row['correctionJson'])) as QuestionCorrection }
        : {}),
      retired: Boolean(row['retired']),
    }));
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
