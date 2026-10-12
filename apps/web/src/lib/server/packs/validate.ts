import type { ExamPack, PackOption, PackQuestion, PackSource } from '#lib/types/exam-pack.js';

export type PackValidation =
  | { valid: true; pack: ExamPack; errors: [] }
  | { valid: false; errors: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const getProperty = (value: Record<string, unknown>, key: string): unknown => value[key];

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const isId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(value);
const isQuestionType = (value: unknown): value is PackQuestion['type'] =>
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
    !/^[a-zA-Z][a-zA-Z\d+.-]*:/u.test(value) &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.includes('\0') &&
    value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
  );
};
const hasUniqueIds = (items: { id: string }[]) =>
  new Set(items.map((item) => item.id)).size === items.length;

const rejectUnknownKeys = (
  value: Record<string, unknown>,
  allowed: string[],
  location: string,
  errors: string[],
): void => {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      errors.push(`${location} contains unknown field "${key}".`);
    }
  }
};

const validateDomain = (
  item: unknown,
  index: number,
  errors: string[],
): ExamPack['domains'][number] | undefined => {
  if (isRecord(item)) {
    rejectUnknownKeys(item, ['id', 'title', 'weight'], `domains[${index}]`, errors);
  }
  const id = isRecord(item) ? getProperty(item, 'id') : undefined;
  const title = isRecord(item) ? getProperty(item, 'title') : undefined;
  const weight = isRecord(item) ? getProperty(item, 'weight') : undefined;
  if (
    !isId(id) ||
    !isText(title) ||
    typeof weight !== 'number' ||
    !Number.isFinite(weight) ||
    weight <= 0 ||
    weight > 100
  ) {
    errors.push(
      `domains[${index}] requires an id, title, and weight greater than 0 and at most 100.`,
    );
    return undefined;
  }
  return { id, title, weight };
};

const validateDomains = (rawDomains: unknown, errors: string[]): ExamPack['domains'] => {
  if (!Array.isArray(rawDomains) || rawDomains.length === 0) {
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
    Math.abs(domains.reduce((sum, item) => sum + item.weight, 0) - 100) > 0.01
  ) {
    errors.push('Domain weights must total 100.');
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
  sourcePath: unknown,
  label: unknown,
  kind: unknown,
  section: unknown,
  documentationUrls: unknown,
): CitationMetadata | undefined => {
  if (
    !sourceKeys.every((key) => supportedSourceKeys.has(key)) ||
    !isText(sourcePath) ||
    !isText(label) ||
    (kind !== undefined && !isText(kind)) ||
    (section !== undefined && !isText(section)) ||
    (documentationUrls !== undefined &&
      (!Array.isArray(documentationUrls) || !documentationUrls.every(isText)))
  ) {
    return undefined;
  }
  return {
    label,
    path: sourcePath,
    ...(kind === undefined ? {} : { kind }),
    ...(section === undefined ? {} : { section }),
    ...(documentationUrls === undefined ? {} : { documentationUrls }),
  };
};

const validateCitation = (
  source: unknown,
  questionIndex: number,
  sourceIndex: number,
  errors: string[],
): PackSource | undefined => {
  const sourceKeys = isRecord(source) ? Object.keys(source) : [];
  const sourcePath = isRecord(source) ? getProperty(source, 'path') : undefined;
  const label = isRecord(source) ? getProperty(source, 'label') : undefined;
  const kind = isRecord(source) ? getProperty(source, 'kind') : undefined;
  const section = isRecord(source) ? getProperty(source, 'section') : undefined;
  const documentationUrls = isRecord(source) ? getProperty(source, 'documentationUrls') : undefined;
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
  rawSources: unknown,
  questionIndex: number,
  errors: string[],
): PackSource[] =>
  Array.isArray(rawSources)
    ? rawSources.flatMap((source, index) => {
        const citation = validateCitation(source, questionIndex, index, errors);
        return citation ? [citation] : [];
      })
    : [];

const validateOptions = (
  rawOptions: unknown,
  questionIndex: number,
  errors: string[],
): PackOption[] => {
  if (!Array.isArray(rawOptions)) {
    return [];
  }
  return rawOptions.flatMap((option, optionIndex) => {
    if (isRecord(option)) {
      rejectUnknownKeys(
        option,
        ['id', 'text'],
        `questions[${questionIndex}].options[${optionIndex}]`,
        errors,
      );
    }
    const id = isRecord(option) ? getProperty(option, 'id') : undefined;
    const text = isRecord(option) ? getProperty(option, 'text') : undefined;
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
  id: unknown,
  type: unknown,
  domainId: unknown,
  prompt: unknown,
  explanation: unknown,
  options: PackOption[],
  answerIds: unknown[],
  sources: PackSource[],
): ValidQuestionData | undefined => {
  if (
    !isId(id) ||
    !isQuestionType(type) ||
    !isId(domainId) ||
    !isText(prompt) ||
    !isText(explanation) ||
    options.length < 2 ||
    !hasUniqueIds(options) ||
    answerIds.length === 0 ||
    !answerIds.every((answerId): answerId is string => isId(answerId)) ||
    new Set(answerIds).size !== answerIds.length ||
    !answerIds.every((answerId) => options.some((option) => option.id === answerId)) ||
    (type === 'single_choice' && answerIds.length !== 1) ||
    sources.length === 0
  ) {
    return undefined;
  }
  return { answerIds, domainId, explanation, id, prompt, type };
};

const validateQuestion = (
  value: unknown,
  index: number,
  domains: ExamPack['domains'],
  errors: string[],
): PackQuestion | undefined => {
  if (!isRecord(value)) {
    errors.push(`questions[${index}] must be an object.`);
    return undefined;
  }
  rejectUnknownKeys(
    value,
    ['id', 'type', 'domainId', 'prompt', 'options', 'answerIds', 'explanation', 'sources'],
    `questions[${index}]`,
    errors,
  );
  const id = getProperty(value, 'id');
  const type = getProperty(value, 'type');
  const domainId = getProperty(value, 'domainId');
  const prompt = getProperty(value, 'prompt');
  const explanation = getProperty(value, 'explanation');
  const options = validateOptions(getProperty(value, 'options'), index, errors);
  const rawAnswerIds = getProperty(value, 'answerIds');
  const answerIds: unknown[] = Array.isArray(rawAnswerIds) ? rawAnswerIds : [];
  const sources = validateCitations(getProperty(value, 'sources'), index, errors);
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
  rawQuestions: unknown,
  domains: ExamPack['domains'],
  errors: string[],
): PackQuestion[] => {
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
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

const validateExamMetadata = (value: unknown, errors: string[]): ExamMetadata | undefined => {
  if (isRecord(value)) {
    rejectUnknownKeys(value, ['id', 'title', 'version'], 'exam', errors);
  }
  const id = isRecord(value) ? getProperty(value, 'id') : undefined;
  const title = isRecord(value) ? getProperty(value, 'title') : undefined;
  const version = isRecord(value) ? getProperty(value, 'version') : undefined;
  if (!isId(id) || !isText(title) || !isText(version)) {
    errors.push('exam must include non-empty id, title, and version values.');
    return undefined;
  }
  return { id, title, version };
};

const validatePackMetadata = (value: unknown, errors: string[]): PackMetadata | undefined => {
  if (isRecord(value)) {
    rejectUnknownKeys(value, ['id', 'title', 'version', 'synthetic'], 'pack', errors);
  }
  const id = isRecord(value) ? getProperty(value, 'id') : undefined;
  const title = isRecord(value) ? getProperty(value, 'title') : undefined;
  const version = isRecord(value) ? getProperty(value, 'version') : undefined;
  const synthetic = isRecord(value) ? getProperty(value, 'synthetic') : undefined;
  if (!isId(id) || !isText(title) || !isText(version) || typeof synthetic !== 'boolean') {
    errors.push('pack must include non-empty id, title, version, and a synthetic boolean.');
    return undefined;
  }
  return { id, synthetic, title, version };
};

export const validateExamPack = (input: unknown): PackValidation => {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { errors: ['Pack must be a JSON object.'], valid: false };
  }
  rejectUnknownKeys(
    input,
    ['schemaVersion', 'exam', 'pack', 'domains', 'passingThreshold', 'questions'],
    'Pack',
    errors,
  );
  if (getProperty(input, 'schemaVersion') !== 1) {
    errors.push('schemaVersion must be 1.');
  }
  const exam = validateExamMetadata(getProperty(input, 'exam'), errors);
  const pack = validatePackMetadata(getProperty(input, 'pack'), errors);
  const domains = validateDomains(getProperty(input, 'domains'), errors);
  const threshold = getProperty(input, 'passingThreshold');
  if (
    threshold !== undefined &&
    (typeof threshold !== 'number' ||
      !Number.isFinite(threshold) ||
      threshold < 0 ||
      threshold > 100)
  ) {
    errors.push('passingThreshold must be between 0 and 100.');
  }
  const questions = validateQuestions(getProperty(input, 'questions'), domains, errors);
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
  if (typeof threshold === 'number') {
    result.passingThreshold = threshold;
  }
  return { errors: [], pack: result, valid: true };
};
