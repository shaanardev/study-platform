const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeSource = (source: unknown): unknown => {
  if (!isRecord(source)) {
    return source;
  }
  const supportedKeys = new Set(['path', 'label', 'kind', 'section', 'documentationUrls']);
  if (
    typeof source['path'] !== 'string' ||
    typeof source['label'] !== 'string' ||
    Object.keys(source).every((key) => supportedKeys.has(key))
  ) {
    return source;
  }
  return { label: source['label'], path: source['path'] };
};

const normalizeQuestion = (question: unknown): unknown => {
  if (!isRecord(question) || !Array.isArray(question['sources'])) {
    return question;
  }
  return { ...question, sources: question['sources'].map(normalizeSource) };
};

export const normalizeLegacyCitations = (input: unknown): unknown => {
  if (!isRecord(input)) {
    return input;
  }
  if (!Array.isArray(input['questions'])) {
    return input;
  }
  return { ...input, questions: input['questions'].map(normalizeQuestion) };
};
