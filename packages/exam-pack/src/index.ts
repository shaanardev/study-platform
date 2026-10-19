import { Result, Schema } from 'effect';

const MAX_PERCENTAGE = 100;
const MIN_ANSWER_OPTIONS = 2;
const DOMAIN_WEIGHT_TOLERANCE = 0.01;

const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u;

// Citations are either pack-relative paths or absolute local file URLs. Reject
// URL-like schemes, traversal segments, ambiguous empty segments, and URL
// delimiters that could change the referenced resource.
const sourcePathPattern =
  /^(?:file:\/\/\/[^?#\\]+|(?![a-zA-Z][a-zA-Z0-9+.-]*:)(?!\/)(?!.*\/\/)(?!.*(?:^|\/)(?:\.|\.\.)(?:\/|$))(?!.*[\\?#])[^?#]+)$/u;

type JsonValue = boolean | null | number | string | readonly JsonValue[] | JsonObject;

interface JsonObject {
  readonly [key: string]: JsonValue;
}

const JsonValueSchema: Schema.Codec<JsonValue, unknown> = Schema.suspend(() =>
  Schema.Union([
    Schema.Null,
    Schema.Boolean,
    Schema.Finite,
    Schema.String,
    Schema.Array(JsonValueSchema),
    Schema.Record(Schema.String, JsonValueSchema),
  ]),
);

const JsonObjectSchema = Schema.Record(Schema.String, JsonValueSchema);
const JsonArraySchema = Schema.Array(JsonValueSchema);
const isRecord: (value: JsonValue) => value is JsonObject = Schema.is(JsonObjectSchema);
const isJsonArray = Schema.is(JsonArraySchema);

const Id = Schema.String.check(Schema.isPattern(idPattern));
const Text = Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/u));

const SourcePath = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isPattern(sourcePathPattern),
  Schema.makeFilter((value) =>
    value.includes('\0') ? 'Source paths cannot contain NUL characters' : undefined,
  ),
);

const ExamSchema = Schema.Struct({
  id: Id,
  title: Text,
  version: Text,
});

const PackSchema = Schema.Struct({
  id: Id,
  synthetic: Schema.Boolean,
  title: Text,
  version: Text,
});

const DomainSchema = Schema.Struct({
  id: Id,
  title: Text,
  weight: Schema.Finite.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(MAX_PERCENTAGE)),
});

const OptionSchema = Schema.Struct({
  id: Id,
  text: Text,
});

const sourceFields = {
  documentationUrls: Schema.optionalKey(Schema.Array(Text)),
  kind: Schema.optionalKey(Text),
  label: Text,
  path: SourcePath,
  section: Schema.optionalKey(Text),
};

const SourceSchema = Schema.Struct(sourceFields);

export const BuiltExamQuestionSchema = Schema.Struct({
  answerIds: Schema.Array(Id).check(Schema.isMinLength(1)),
  domainId: Id,
  explanation: Text,
  id: Id,
  options: Schema.Array(OptionSchema).check(Schema.isMinLength(MIN_ANSWER_OPTIONS)),
  prompt: Text,
  sources: Schema.Array(SourceSchema).check(Schema.isMinLength(1)),
  type: Schema.Literals(['single_choice', 'multiple_choice']),
});

const questionKeys = new Set(Object.keys(BuiltExamQuestionSchema.fields));

export const BuiltExamPackSchema = Schema.Struct({
  domains: Schema.Array(DomainSchema).check(Schema.isMinLength(1)),
  exam: ExamSchema,
  pack: PackSchema,
  passingThreshold: Schema.optionalKey(
    Schema.Finite.check(
      Schema.isGreaterThanOrEqualTo(0),
      Schema.isLessThanOrEqualTo(MAX_PERCENTAGE),
    ),
  ),
  questions: Schema.Array(BuiltExamQuestionSchema).check(Schema.isMinLength(1)),
  schemaVersion: Schema.Literal(1),
});

export type PackForVerification = typeof BuiltExamPackSchema.Type;

export type BuiltExamQuestion = typeof BuiltExamQuestionSchema.Type;

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

export type ExamPack = Mutable<PackForVerification>;

export type PackQuestion = Mutable<BuiltExamQuestion>;

export type PackOption = Mutable<BuiltExamQuestion['options'][number]>;

export type PackSource = Mutable<BuiltExamQuestion['sources'][number]>;

export type PackValidation =
  | { readonly valid: true; readonly pack: ExamPack; readonly errors: readonly [] }
  | { readonly valid: false; readonly errors: string[] };

const duplicate = (values: readonly string[]): boolean => new Set(values).size !== values.length;

/** Returns semantic errors for a structurally valid built exam pack. */
export const validatePackSemantics = (pack: PackForVerification): string[] => {
  const domainIds = new Set(pack.domains.map(({ id }) => id));

  const domainErrors = [
    ...(duplicate(pack.domains.map(({ id }) => id)) ? ['Domain IDs must be unique'] : []),
    ...(Math.abs(pack.domains.reduce((sum, domain) => sum + domain.weight, 0) - MAX_PERCENTAGE) >
    DOMAIN_WEIGHT_TOLERANCE
      ? [`Domain weights must total ${MAX_PERCENTAGE}.`]
      : []),
  ];

  const questionIds = new Set<string>();

  const questionErrors = pack.questions.flatMap((question) => {
    const isDuplicateQuestion = questionIds.has(question.id);
    questionIds.add(question.id);
    const optionIds = question.options.map(({ id }) => id);

    const invalidAnswers =
      duplicate(question.answerIds) || !question.answerIds.every((id) => optionIds.includes(id));

    return [
      ...(isDuplicateQuestion ? ['Question IDs must be unique within a pack.'] : []),
      ...(domainIds.has(question.domainId)
        ? []
        : [`${question.id}: unknown domain ${question.domainId}`]),
      ...(duplicate(optionIds) ? [`${question.id}: duplicate option IDs`] : []),
      ...(invalidAnswers ? [`${question.id}: answer IDs must refer to unique options`] : []),
      ...(question.type === 'single_choice' && question.answerIds.length !== 1
        ? [`${question.id}: single_choice questions must have exactly one answer`]
        : []),
    ];
  });

  return [...domainErrors, ...questionErrors];
};

const getDomainWeightErrors = (input: JsonValue): string[] => {
  if (!isRecord(input) || !isJsonArray(input['domains']) || input['domains'].length === 0) {
    return [];
  }

  const weights = input['domains'].map((domain) =>
    isRecord(domain) ? domain['weight'] : undefined,
  );

  if (!weights.every((weight): weight is number => Schema.is(Schema.Finite)(weight))) {
    return [];
  }

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  return Math.abs(totalWeight - MAX_PERCENTAGE) > DOMAIN_WEIGHT_TOLERANCE
    ? [`Domain weights must total ${MAX_PERCENTAGE}.`]
    : [];
};

const getQuestionValidationDetails = (input: JsonValue): string[] => {
  if (!isRecord(input) || !isJsonArray(input['questions'])) {
    return [];
  }

  return input['questions'].flatMap((question, index) => {
    if (!isRecord(question)) {
      return [];
    }

    const unknownFieldErrors = Object.keys(question).flatMap((key) =>
      questionKeys.has(key) ? [] : [`questions[${index}] contains unknown field "${key}".`],
    );

    const pathErrors = isJsonArray(question['sources'])
      ? question['sources'].flatMap((source) => {
          if (!isRecord(source)) {
            return [];
          }

          const sourcePath = source['path'];

          return Schema.is(Schema.String)(sourcePath) && !sourcePathPattern.test(sourcePath)
            ? [
                `questions[${index}] source path "${sourcePath}" must be a safe relative path or absolute file URL.`,
              ]
            : [];
        })
      : [];

    return [...unknownFieldErrors, ...pathErrors];
  });
};

const toMutablePackSource = (source: BuiltExamQuestion['sources'][number]): PackSource => {
  const mutable: PackSource = { label: source.label, path: source.path };

  if (source.documentationUrls !== undefined) {
    mutable.documentationUrls = [...source.documentationUrls];
  }

  if (source.kind !== undefined) {
    mutable.kind = source.kind;
  }

  if (source.section !== undefined) {
    mutable.section = source.section;
  }

  return mutable;
};

const toMutableExamPack = (pack: PackForVerification): ExamPack => {
  const mutable: ExamPack = {
    domains: pack.domains.map(({ id, title, weight }) => ({ id, title, weight })),
    exam: { id: pack.exam.id, title: pack.exam.title, version: pack.exam.version },
    pack: {
      id: pack.pack.id,
      synthetic: pack.pack.synthetic,
      title: pack.pack.title,
      version: pack.pack.version,
    },
    questions: pack.questions.map((question) => ({
      answerIds: [...question.answerIds],
      domainId: question.domainId,
      explanation: question.explanation,
      id: question.id,
      options: question.options.map(({ id, text }) => ({ id, text })),
      prompt: question.prompt,
      sources: question.sources.map(toMutablePackSource),
      type: question.type,
    })),
    schemaVersion: pack.schemaVersion,
  };

  if (pack.passingThreshold !== undefined) {
    mutable.passingThreshold = pack.passingThreshold;
  }

  return mutable;
};

/** Decodes a built pack and reports structural and semantic errors together. */
// eslint-disable-next-line anti-slop/no-unknown-parameters -- This shared pack boundary decodes untrusted values through JsonValueSchema before validation.
export const validateExamPack = (input: unknown): PackValidation => {
  const parsedJson = Schema.decodeUnknownResult(JsonValueSchema)(input);

  if (Result.isFailure(parsedJson)) {
    return { errors: ['Pack must be a JSON value.'], valid: false };
  }

  const packInput = parsedJson.success;

  const decoded = Schema.decodeUnknownResult(BuiltExamPackSchema, {
    onExcessProperty: 'error',
  })(packInput);

  if (Result.isFailure(decoded)) {
    const errors = [
      String(decoded.failure),
      ...getDomainWeightErrors(packInput),
      ...getQuestionValidationDetails(packInput),
    ];

    return { errors: [...new Set(errors)], valid: false };
  }

  const errors = validatePackSemantics(decoded.success);

  if (errors.length > 0) {
    return { errors, valid: false };
  }

  return { errors: [], pack: toMutableExamPack(decoded.success), valid: true };
};

export const examPackSchemaMetadata = {
  $id: 'https://learning-platform.local/schemas/exam-pack.schema.json',
  description: 'Exam and question data with bundled citations and absolute local file citations.',
  title: 'Exam blueprint and question pack',
} as const;
