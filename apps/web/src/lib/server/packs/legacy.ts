type CitationRecord = Record<string, unknown> & {
  path?: unknown;
  label?: unknown;
};
type QuestionRecord = Record<string, unknown> & { sources?: unknown };
type PackRecord = Record<string, unknown> & { questions?: unknown };

export function normalizeLegacyCitations(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const record = input as PackRecord;
  if (!Array.isArray(record.questions)) return input;
  return {
    ...record,
    questions: record.questions.map((question) => {
      if (!question || typeof question !== 'object' || Array.isArray(question)) return question;
      const questionRecord = question as QuestionRecord;
      if (!Array.isArray(questionRecord.sources)) return question;
      return {
        ...questionRecord,
        sources: questionRecord.sources.map((source) => {
          const citation = source as CitationRecord;
          if (!source || typeof source !== 'object' || Array.isArray(source)) {
            return source;
          }
          const supportedKeys = ['path', 'label', 'kind', 'section', 'documentationUrls'];
          if (
            typeof citation.path !== 'string' ||
            typeof citation.label !== 'string' ||
            Object.keys(citation).every((key) => supportedKeys.includes(key))
          ) {
            return source;
          }
          return { path: citation.path, label: citation.label };
        }),
      };
    }),
  };
}
