import * as Schema from 'effect/Schema';

import {
  DOMAIN_WEIGHT_TOLERANCE,
  MIN_ANSWER_OPTIONS,
  PERCENTAGE_SCALE,
} from '#lib/quiz/constants.js';
import { isJsonArray, isJsonObject } from '#lib/server/json.js';
import type { JsonObject, JsonValue } from '#lib/server/json.js';
import type { ExamPack, PackOption, PackQuestion, PackSource } from '#lib/types/exam-pack.js';

export type PackValidation =
  | { valid: true; pack: ExamPack; errors: [] }
  | { valid: false; errors: string[] };

const isText = (value: JsonValue | undefined): value is string =>
  Schema.is(Schema.String)(value) && value.trim().length > 0;

const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u;
const citationSchemePattern = /^[a-zA-Z][a-zA-Z\d+.-]*:/u;

const isId = (value: JsonValue | undefined): value is string =>
  Schema.is(Schema.String)(value) && idPattern.test(value);

const isQuestionType = (value: JsonValue | undefined): value is PackQuestion['type'] =>
  value === 'single_choice' || value === 'multiple_choice';

const isCitationPath = (value: string): boolean => {
  if (value.startsWith('file:')) {
    try {
      const url = new URL(value);

      return (
        value.startsWith('file:///') &&
        url.protocol === 'file:' &&
        url.hostname === '' &&
        url.pathname.startsWith('/') &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }

  return (
    !citationSchemePattern.test(value) &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.includes('\0') &&
    value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
  );
};

const hasUniqueIds = (items: { id: string }[]) =>
  new Set(items.map((item) => item.id)).size === items.length;

const rejectUnknownKeys = (
  value: JsonObject,
  allowed: string[],
  location: string,
  errors: string[],
): void => {
  errors.push(
    ...Object.keys(value).flatMap((key) =>
      allowed.includes(key) ? [] : [`${location} contains unknown field "${key}".`],
    ),
  );
};

const validateDomain = (
  item: JsonValue,
  index: number,
  errors: string[],
): ExamPack['domains'][number] | undefined => {
  const domain = isJsonObject(item) ? item : undefined;

  if (domain !== undefined) {
    rejectUnknownKeys(domain, ['id', 'title', 'weight'], `domains[${index}]`, errors);
  }

  const id = domain?.['id'];
  const title = domain?.['title'];
  const weight = domain?.['weight'];

  if (
    !isId(id) ||
    !isText(title) ||
    !Schema.is(Schema.Finite)(weight) ||
    weight <= 0 ||
    weight > PERCENTAGE_SCALE
  ) {
    errors.push(
      `domains[${index}] requires an id, title, and weight greater than 0 and at most ${PERCENTAGE_SCALE}.`,
    );

    return undefined;
  }

  return { id, title, weight };
};

const validateDomains = (
  rawDomains: JsonValue | undefined,
  errors: string[],
): ExamPack['domains'] => {
  if (!isJsonArray(rawDomains) || rawDomains.length === 0) {
    errors.push('domains must contain at least one domain.');

    return [];
  }

  const domains = rawDomains.flatMap((item, index) => {
    const domain = validateDomain(item, index, errors);

    return domain ? [domain] : [];
  });

  if (!hasUniqueIds(domains)) {
    errors.push('Domain IDs must be unique.');
  }

  if (
    domains.length === rawDomains.length &&
    Math.abs(domains.reduce((sum, item) => sum + item.weight, 0) - PERCENTAGE_SCALE) >
      DOMAIN_WEIGHT_TOLERANCE
  ) {
    errors.push(`Domain weights must total ${PERCENTAGE_SCALE}.`);
  }

  return domains;
};

const supportedSourceKeys = new Set(['path', 'label', 'kind', 'section', 'documentationUrls']);

interface CitationMetadata {
  documentationUrls?: string[];
  kind?: string;
  label: string;
  path: string;
  section?: string;
}

const getValidCitationMetadata = (
  sourceKeys: string[],
  sourcePath: JsonValue | undefined,
  label: JsonValue | undefined,
  kind: JsonValue | undefined,
  section: JsonValue | undefined,
  documentationUrls: JsonValue | undefined,
): CitationMetadata | undefined => {
  if (
    !sourceKeys.every((key) => supportedSourceKeys.has(key)) ||
    !isText(sourcePath) ||
    !isText(label) ||
    (kind !== undefined && !isText(kind)) ||
    (section !== undefined && !isText(section)) ||
    (documentationUrls !== undefined &&
      (!isJsonArray(documentationUrls) || !documentationUrls.every(isText)))
  ) {
    return undefined;
  }

  const citation: CitationMetadata = {
    label,
    path: sourcePath,
  };

  if (kind !== undefined) {
    citation.kind = kind;
  }

  if (section !== undefined) {
    citation.section = section;
  }

  if (documentationUrls !== undefined) {
    citation.documentationUrls = documentationUrls.filter(isText);
  }

  return citation;
};

const validateCitation = (
  source: JsonValue,
  questionIndex: number,
  sourceIndex: number,
  errors: string[],
): PackSource | undefined => {
  const sourceObject = isJsonObject(source) ? source : undefined;
  const sourceKeys = sourceObject === undefined ? [] : Object.keys(sourceObject);
  const sourcePath = sourceObject?.['path'];
  const label = sourceObject?.['label'];
  const kind = sourceObject?.['kind'];
  const section = sourceObject?.['section'];
  const documentationUrls = sourceObject?.['documentationUrls'];

  const citation = getValidCitationMetadata(
    sourceKeys,
    sourcePath,
    label,
    kind,
    section,
    documentationUrls,
  );

  if (citation === undefined) {
    errors.push(`questions[${questionIndex}].sources[${sourceIndex}] is not a valid citation.`);

    return undefined;
  }

  if (!isCitationPath(citation.path)) {
    errors.push(
      `questions[${questionIndex}] source path "${citation.path}" must be a safe relative path or absolute file URL.`,
    );

    return undefined;
  }

  return citation;
};

const validateCitations = (
  rawSources: JsonValue | undefined,
  questionIndex: number,
  errors: string[],
): PackSource[] =>
  isJsonArray(rawSources)
    ? rawSources.flatMap((source, index) => {
        const citation = validateCitation(source, questionIndex, index, errors);

        return citation ? [citation] : [];
      })
    : [];

const validateOptions = (
  rawOptions: JsonValue | undefined,
  questionIndex: number,
  errors: string[],
): PackOption[] => {
  if (!isJsonArray(rawOptions)) {
    return [];
  }

  return rawOptions.flatMap((option, optionIndex) => {
    const optionObject = isJsonObject(option) ? option : undefined;

    if (optionObject !== undefined) {
      rejectUnknownKeys(
        optionObject,
        ['id', 'text'],
        `questions[${questionIndex}].options[${optionIndex}]`,
        errors,
      );
    }

    const id = optionObject?.['id'];
    const text = optionObject?.['text'];

    return isId(id) && isText(text) ? [{ id, text }] : [];
  });
};

interface ValidQuestionData {
  answerIds: string[];
  domainId: string;
  explanation: string;
  id: string;
  prompt: string;
  type: PackQuestion['type'];
}

const getValidQuestionData = (
  id: JsonValue | undefined,
  type: JsonValue | undefined,
  domainId: JsonValue | undefined,
  prompt: JsonValue | undefined,
  explanation: JsonValue | undefined,
  options: PackOption[],
  answerIds: readonly JsonValue[],
  sources: PackSource[],
): ValidQuestionData | undefined => {
  const validAnswerIds = answerIds.filter(isId);

  if (
    !isId(id) ||
    !isQuestionType(type) ||
    !isId(domainId) ||
    !isText(prompt) ||
    !isText(explanation) ||
    options.length < MIN_ANSWER_OPTIONS ||
    !hasUniqueIds(options) ||
    validAnswerIds.length === 0 ||
    validAnswerIds.length !== answerIds.length ||
    new Set(validAnswerIds).size !== validAnswerIds.length ||
    !validAnswerIds.every((answerId) => options.some((option) => option.id === answerId)) ||
    (type === 'single_choice' && validAnswerIds.length !== 1) ||
    sources.length === 0
  ) {
    return undefined;
  }

  return { answerIds: validAnswerIds, domainId, explanation, id, prompt, type };
};

const validateQuestion = (
  value: JsonValue,
  index: number,
  domains: ExamPack['domains'],
  errors: string[],
): PackQuestion | undefined => {
  if (!isJsonObject(value)) {
    errors.push(`questions[${index}] must be an object.`);

    return undefined;
  }

  rejectUnknownKeys(
    value,
    ['id', 'type', 'domainId', 'prompt', 'options', 'answerIds', 'explanation', 'sources'],
    `questions[${index}]`,
    errors,
  );
  const { id } = value;
  const { type } = value;
  const { domainId } = value;
  const { prompt } = value;
  const { explanation } = value;
  const options = validateOptions(value['options'], index, errors);
  const rawAnswerIds = value['answerIds'];
  const answerIds = isJsonArray(rawAnswerIds) ? rawAnswerIds : [];
  const sources = validateCitations(value['sources'], index, errors);

  const validData = getValidQuestionData(
    id,
    type,
    domainId,
    prompt,
    explanation,
    options,
    answerIds,
    sources,
  );

  if (validData === undefined) {
    errors.push(
      `questions[${index}] has missing or invalid question, answer, option, or source data.`,
    );

    return undefined;
  }

  if (!domains.some((domain) => domain.id === validData.domainId)) {
    errors.push(`questions[${index}] references unknown domain "${validData.domainId}".`);
  }

  return { ...validData, options, sources };
};

const validateQuestions = (
  rawQuestions: JsonValue | undefined,
  domains: ExamPack['domains'],
  errors: string[],
): PackQuestion[] => {
  if (!isJsonArray(rawQuestions) || rawQuestions.length === 0) {
    errors.push('questions must contain at least one question.');

    return [];
  }

  const questions = rawQuestions.flatMap((value, index) => {
    const question = validateQuestion(value, index, domains, errors);

    return question ? [question] : [];
  });

  if (!hasUniqueIds(questions)) {
    errors.push('Question IDs must be unique within a pack.');
  }

  return questions;
};

interface ExamMetadata {
  id: string;
  title: string;
  version: string;
}

interface PackMetadata {
  id: string;
  synthetic: boolean;
  title: string;
  version: string;
}

const validateExamMetadata = (
  value: JsonValue | undefined,
  errors: string[],
): ExamMetadata | undefined => {
  const exam = isJsonObject(value) ? value : undefined;

  if (exam !== undefined) {
    rejectUnknownKeys(exam, ['id', 'title', 'version'], 'exam', errors);
  }

  const id = exam?.['id'];
  const title = exam?.['title'];
  const version = exam?.['version'];

  if (!isId(id) || !isText(title) || !isText(version)) {
    errors.push('exam must include non-empty id, title, and version values.');

    return undefined;
  }

  return { id, title, version };
};

const validatePackMetadata = (
  value: JsonValue | undefined,
  errors: string[],
): PackMetadata | undefined => {
  const pack = isJsonObject(value) ? value : undefined;

  if (pack !== undefined) {
    rejectUnknownKeys(pack, ['id', 'title', 'version', 'synthetic'], 'pack', errors);
  }

  const id = pack?.['id'];
  const title = pack?.['title'];
  const version = pack?.['version'];
  const synthetic = pack?.['synthetic'];

  if (!isId(id) || !isText(title) || !isText(version) || !Schema.is(Schema.Boolean)(synthetic)) {
    errors.push('pack must include non-empty id, title, version, and a synthetic boolean.');

    return undefined;
  }

  return { id, synthetic, title, version };
};

// eslint-disable-next-line anti-slop/no-unknown-parameters -- This is the untrusted pack boundary; validation starts before values enter the domain model.
export const validateExamPack = (input: unknown): PackValidation => {
  const errors: string[] = [];

  if (!isJsonObject(input)) {
    return { errors: ['Pack must be a JSON object.'], valid: false };
  }

  rejectUnknownKeys(
    input,
    ['schemaVersion', 'exam', 'pack', 'domains', 'passingThreshold', 'questions'],
    'Pack',
    errors,
  );

  if (input['schemaVersion'] !== 1) {
    errors.push('schemaVersion must be 1.');
  }

  const exam = validateExamMetadata(input['exam'], errors);
  const pack = validatePackMetadata(input['pack'], errors);
  const domains = validateDomains(input['domains'], errors);
  const threshold = input['passingThreshold'];

  if (
    threshold !== undefined &&
    (!Schema.is(Schema.Finite)(threshold) || threshold < 0 || threshold > PERCENTAGE_SCALE)
  ) {
    errors.push(`passingThreshold must be between 0 and ${PERCENTAGE_SCALE}.`);
  }

  const questions = validateQuestions(input['questions'], domains, errors);

  if (errors.length > 0 || exam === undefined || pack === undefined) {
    return { errors, valid: false };
  }

  const result: ExamPack = {
    domains,
    exam,
    pack,
    questions,
    schemaVersion: 1,
  };

  if (Schema.is(Schema.Finite)(threshold)) {
    result.passingThreshold = threshold;
  }

  return { errors: [], pack: result, valid: true };
};
