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

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const isId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value);
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
  if (input.schemaVersion !== 1) errors.push('schemaVersion must be 1.');

  const exam = input.exam;
  if (isRecord(exam)) rejectUnknownKeys(exam, ['id', 'title', 'version'], 'exam', errors);
  if (!isRecord(exam) || !isId(exam.id) || !isText(exam.title) || !isText(exam.version)) {
    errors.push('exam must include non-empty id, title, and version values.');
  }
  const pack = input.pack;
  if (isRecord(pack)) {
    rejectUnknownKeys(pack, ['id', 'title', 'version', 'synthetic'], 'pack', errors);
  }
  if (
    !isRecord(pack) ||
    !isId(pack.id) ||
    !isText(pack.title) ||
    !isText(pack.version) ||
    typeof pack.synthetic !== 'boolean'
  ) {
    errors.push('pack must include non-empty id, title, version, and a synthetic boolean.');
  }

  const domains: ExamPack['domains'] = [];
  if (!Array.isArray(input.domains) || input.domains.length === 0) {
    errors.push('domains must contain at least one domain.');
  } else {
    for (const [index, item] of input.domains.entries()) {
      if (isRecord(item)) {
        rejectUnknownKeys(item, ['id', 'title', 'weight'], `domains[${index}]`, errors);
      }
      if (
        !isRecord(item) ||
        !isId(item.id) ||
        !isText(item.title) ||
        typeof item.weight !== 'number' ||
        !Number.isFinite(item.weight) ||
        item.weight <= 0 ||
        item.weight > 100
      ) {
        errors.push(
          `domains[${index}] requires an id, title, and weight greater than 0 and at most 100.`,
        );
        continue;
      }
      domains.push({
        id: item.id as string,
        title: item.title as string,
        weight: item.weight as number,
      });
    }
    if (!hasUniqueIds(domains)) errors.push('Domain IDs must be unique.');
    if (
      domains.length === input.domains.length &&
      Math.abs(domains.reduce((sum, item) => sum + item.weight, 0) - 100) > 0.01
    ) {
      errors.push('Domain weights must total 100.');
    }
  }

  const threshold = input.passingThreshold;
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
  if (!Array.isArray(input.questions) || input.questions.length === 0) {
    errors.push('questions must contain at least one question.');
  } else {
    for (const [index, value] of input.questions.entries()) {
      if (!isRecord(value)) {
        errors.push(`questions[${index}] must be an object.`);
        continue;
      }
      const options: PackOption[] = [];
      if (Array.isArray(value.options)) {
        for (const [optionIndex, option] of value.options.entries()) {
          if (isRecord(option)) {
            rejectUnknownKeys(
              option,
              ['id', 'text'],
              `questions[${index}].options[${optionIndex}]`,
              errors,
            );
          }
          if (isRecord(option) && isId(option.id) && isText(option.text)) {
            options.push({ id: option.id, text: option.text });
          }
        }
      }
      const answerIds = Array.isArray(value.answerIds) ? value.answerIds : [];
      const sources: PackSource[] = [];
      if (Array.isArray(value.sources)) {
        for (const [sourceIndex, source] of value.sources.entries()) {
          if (isRecord(source)) {
            rejectUnknownKeys(
              source,
              ['path', 'label'],
              `questions[${index}].sources[${sourceIndex}]`,
              errors,
            );
          }
          if (isRecord(source) && isText(source.path) && isText(source.label)) {
            sources.push({ path: source.path, label: source.label });
          }
        }
      }
      if (
        !isId(value.id) ||
        !['single_choice', 'multiple_choice'].includes(String(value.type)) ||
        !isId(value.domainId) ||
        !isText(value.prompt) ||
        !isText(value.explanation) ||
        options.length < 2 ||
        !hasUniqueIds(options) ||
        answerIds.length === 0 ||
        !answerIds.every((id): id is string => isId(id)) ||
        new Set(answerIds).size !== answerIds.length ||
        !answerIds.every((id) => options.some((option) => option.id === id)) ||
        (value.type === 'single_choice' && answerIds.length !== 1) ||
        sources.length === 0
      ) {
        errors.push(
          `questions[${index}] has missing or invalid question, answer, option, or source data.`,
        );
        continue;
      }
      if (!domains.some((domain) => domain.id === value.domainId)) {
        errors.push(`questions[${index}] references unknown domain "${value.domainId}".`);
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
        id: value.id as string,
        type: value.type as PackQuestion['type'],
        domainId: value.domainId as string,
        prompt: value.prompt as string,
        options,
        answerIds: answerIds as string[],
        explanation: value.explanation as string,
        sources,
      });
    }
    if (!hasUniqueIds(questions)) errors.push('Question IDs must be unique within a pack.');
  }

  if (errors.length || !isRecord(exam) || !isRecord(pack)) return { valid: false, errors };
  const result: ExamPack = {
    schemaVersion: 1,
    exam: { id: exam.id as string, title: exam.title as string, version: exam.version as string },
    pack: {
      id: pack.id as string,
      title: pack.title as string,
      version: pack.version as string,
      synthetic: pack.synthetic as boolean,
    },
    domains,
    questions,
  };
  if (threshold !== undefined) result.passingThreshold = threshold as number;
  return { valid: true, pack: result, errors: [] };
}
