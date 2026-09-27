export type PackSource = { path: string; label: string };
export type PackOption = { id: string; text: string };
export type PackQuestion = {
  id: string;
  type: 'single_choice' | 'multiple_choice';
  domainId: string;
  prompt: string;
  options: PackOption[];
  answerIds: string[];
  explanation: string;
  sources: PackSource[];
};
export type ExamPack = {
  schemaVersion: 1;
  exam: { id: string; title: string; version: string };
  pack: { id: string; title: string; version: string; synthetic: boolean };
  domains: { id: string; title: string; weight: number }[];
  passingThreshold?: number;
  questions: PackQuestion[];
};

export type PackValidation =
  | { valid: true; pack: ExamPack; errors: [] }
  | { valid: false; errors: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const getProperty = (value: Record<string, unknown>, key: string): unknown => value[key];

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const isId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value);
const isQuestionType = (value: unknown): value is PackQuestion['type'] =>
  value === 'single_choice' || value === 'multiple_choice';
const hasUniqueIds = (items: { id: string }[]) =>
  new Set(items.map((item) => item.id)).size === items.length;

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: string[],
  location: string,
  errors: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${location} contains unknown field "${key}".`);
  }
}

export function validateExamPack(input: unknown): PackValidation {
  const errors: string[] = [];
  if (!isRecord(input)) return { valid: false, errors: ['Pack must be a JSON object.'] };
  rejectUnknownKeys(
    input,
    ['schemaVersion', 'exam', 'pack', 'domains', 'passingThreshold', 'questions'],
    'Pack',
    errors,
  );
  if (getProperty(input, 'schemaVersion') !== 1) errors.push('schemaVersion must be 1.');

  const exam = getProperty(input, 'exam');
  const examId = isRecord(exam) ? getProperty(exam, 'id') : undefined;
  const examTitle = isRecord(exam) ? getProperty(exam, 'title') : undefined;
  const examVersion = isRecord(exam) ? getProperty(exam, 'version') : undefined;
  if (isRecord(exam)) rejectUnknownKeys(exam, ['id', 'title', 'version'], 'exam', errors);
  if (!isId(examId) || !isText(examTitle) || !isText(examVersion)) {
    errors.push('exam must include non-empty id, title, and version values.');
  }
  const pack = getProperty(input, 'pack');
  const packId = isRecord(pack) ? getProperty(pack, 'id') : undefined;
  const packTitle = isRecord(pack) ? getProperty(pack, 'title') : undefined;
  const packVersion = isRecord(pack) ? getProperty(pack, 'version') : undefined;
  const synthetic = isRecord(pack) ? getProperty(pack, 'synthetic') : undefined;
  if (isRecord(pack)) {
    rejectUnknownKeys(pack, ['id', 'title', 'version', 'synthetic'], 'pack', errors);
  }
  if (
    !isId(packId) ||
    !isText(packTitle) ||
    !isText(packVersion) ||
    typeof synthetic !== 'boolean'
  ) {
    errors.push('pack must include non-empty id, title, version, and a synthetic boolean.');
  }

  const domains: ExamPack['domains'] = [];
  const rawDomains = getProperty(input, 'domains');
  if (!Array.isArray(rawDomains) || rawDomains.length === 0) {
    errors.push('domains must contain at least one domain.');
  } else {
    for (const [index, item] of rawDomains.entries()) {
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
        continue;
      }
      domains.push({ id, title, weight });
    }
    if (!hasUniqueIds(domains)) errors.push('Domain IDs must be unique.');
    if (
      domains.length === rawDomains.length &&
      Math.abs(domains.reduce((sum, item) => sum + item.weight, 0) - 100) > 0.01
    ) {
      errors.push('Domain weights must total 100.');
    }
  }

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

  const questions: PackQuestion[] = [];
  const rawQuestions = getProperty(input, 'questions');
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    errors.push('questions must contain at least one question.');
  } else {
    for (const [index, value] of rawQuestions.entries()) {
      if (!isRecord(value)) {
        errors.push(`questions[${index}] must be an object.`);
        continue;
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
      const options: PackOption[] = [];
      const rawOptions = getProperty(value, 'options');
      if (Array.isArray(rawOptions)) {
        for (const [optionIndex, option] of rawOptions.entries()) {
          if (isRecord(option)) {
            rejectUnknownKeys(
              option,
              ['id', 'text'],
              `questions[${index}].options[${optionIndex}]`,
              errors,
            );
          }
          const optionId = isRecord(option) ? getProperty(option, 'id') : undefined;
          const optionText = isRecord(option) ? getProperty(option, 'text') : undefined;
          if (isId(optionId) && isText(optionText)) {
            options.push({ id: optionId, text: optionText });
          }
        }
      }
      const rawAnswerIds = getProperty(value, 'answerIds');
      const answerIds: unknown[] = Array.isArray(rawAnswerIds) ? rawAnswerIds : [];
      const sources: PackSource[] = [];
      const rawSources = getProperty(value, 'sources');
      if (Array.isArray(rawSources)) {
        for (const [sourceIndex, source] of rawSources.entries()) {
          if (isRecord(source)) {
            rejectUnknownKeys(
              source,
              ['path', 'label'],
              `questions[${index}].sources[${sourceIndex}]`,
              errors,
            );
          }
          const path = isRecord(source) ? getProperty(source, 'path') : undefined;
          const label = isRecord(source) ? getProperty(source, 'label') : undefined;
          if (isText(path) && isText(label)) {
            sources.push({ path, label });
          }
        }
      }
      if (
        !isId(id) ||
        !isQuestionType(type) ||
        !isId(domainId) ||
        !isText(prompt) ||
        !isText(explanation) ||
        options.length < 2 ||
        !hasUniqueIds(options) ||
        answerIds.length === 0 ||
        !answerIds.every((id): id is string => isId(id)) ||
        new Set(answerIds).size !== answerIds.length ||
        !answerIds.every((id) => options.some((option) => option.id === id)) ||
        (type === 'single_choice' && answerIds.length !== 1) ||
        sources.length === 0
      ) {
        errors.push(
          `questions[${index}] has missing or invalid question, answer, option, or source data.`,
        );
        continue;
      }
      if (!domains.some((domain) => domain.id === domainId)) {
        errors.push(`questions[${index}] references unknown domain "${domainId}".`);
      }
      for (const source of sources) {
        if (
          source.path.startsWith('/') ||
          source.path.includes('\\') ||
          source.path.includes('\0') ||
          source.path.split('/').includes('..')
        ) {
          errors.push(
            `questions[${index}] source path "${source.path}" must be a safe relative path.`,
          );
        }
      }
      questions.push({
        id,
        type,
        domainId,
        prompt,
        options,
        answerIds,
        explanation,
        sources,
      });
    }
    if (!hasUniqueIds(questions)) errors.push('Question IDs must be unique within a pack.');
  }

  if (
    errors.length ||
    !isId(examId) ||
    !isText(examTitle) ||
    !isText(examVersion) ||
    !isId(packId) ||
    !isText(packTitle) ||
    !isText(packVersion) ||
    typeof synthetic !== 'boolean'
  ) {
    return { valid: false, errors };
  }
  const result: ExamPack = {
    schemaVersion: 1,
    exam: {
      id: examId,
      title: examTitle,
      version: examVersion,
    },
    pack: {
      id: packId,
      title: packTitle,
      version: packVersion,
      synthetic,
    },
    domains,
    questions,
  };
  if (typeof threshold === 'number') result.passingThreshold = threshold;
  return { valid: true, pack: result, errors: [] };
}
