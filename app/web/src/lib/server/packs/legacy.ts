import * as Schema from 'effect/Schema';

import { isJsonArray, isJsonObject } from '#lib/server/json.js';
import type { JsonValue } from '#lib/server/json.js';

const supportedSourceKeys = new Set(['path', 'label', 'kind', 'section', 'documentationUrls']);

const normalizeSource = (source: JsonValue): JsonValue => {
  if (!isJsonObject(source)) {
    return source;
  }

  if (
    !Schema.is(Schema.String)(source['path']) ||
    !Schema.is(Schema.String)(source['label']) ||
    Object.keys(source).every((key) => supportedSourceKeys.has(key))
  ) {
    return source;
  }

  return { label: source['label'], path: source['path'] };
};

const normalizeQuestion = (question: JsonValue): JsonValue => {
  if (!isJsonObject(question) || !isJsonArray(question['sources'])) {
    return question;
  }

  return { ...question, sources: question['sources'].map(normalizeSource) };
};

// eslint-disable-next-line anti-slop/no-unknown-parameters -- This migration boundary accepts untrusted pack data and parses it into JSON values first.
export const normalizeLegacyCitations = (input: unknown): JsonValue | undefined => {
  if (!isJsonObject(input)) {
    return undefined;
  }

  const pack = input;

  if (!isJsonArray(pack['questions'])) {
    return pack;
  }

  return { ...pack, questions: pack['questions'].map(normalizeQuestion) };
};
