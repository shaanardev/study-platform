import { Effect, FileSystem, Schema } from 'effect';
import { afterEach } from 'vitest';

import { AuthoringFile, QuestionFile } from '../src/build/authoring-schema.js';
import previewAuthoring from './fixtures/modular-preview/authoring.json' with { type: 'json' };
import previewQuestions from './fixtures/modular-preview/questions/core.json' with { type: 'json' };
import { makeTemporaryDirectoryTracker, run, testPath } from './helpers.js';

export { relativeTestPath, run, testPath, writeJson } from './helpers.js';

const outputDirectories = makeTemporaryDirectoryTracker();
const previewAuthoringData: unknown = previewAuthoring;
const previewQuestionData: unknown = previewQuestions;
const previewInput = Schema.decodeUnknownSync(AuthoringFile)(previewAuthoringData);
const previewQuestionBank = Schema.decodeUnknownSync(QuestionFile)(previewQuestionData);

export const outputDirectory = outputDirectories.make('pack-build-');

export const mutablePreview = Effect.gen(function* mutablePreview() {
  const root = yield* outputDirectory;
  const fs = yield* FileSystem.FileSystem;
  yield* fs.copy(testPath('fixtures', 'modular-preview'), `${root}/authoring`);
  const authoringPath = `${root}/authoring/authoring.json`;

  return {
    authoringPath,
    input: previewInput,
    output: `${root}/built`,
    questions: previewQuestionBank,
    root,
  };
});

afterEach(async () => {
  await run(outputDirectories.cleanup());
});
