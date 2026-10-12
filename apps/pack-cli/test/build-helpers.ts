import { Effect, FileSystem, Schema } from 'effect';
import { afterEach } from 'vitest';

import { AuthoringFile, QuestionFile } from '../src/build/authoring-schema.js';
import { makeTemporaryDirectoryTracker, run } from './test-helpers.js';

export { run, writeJson } from './test-helpers.js';

const outputDirectories = makeTemporaryDirectoryTracker();

export const outputDirectory = outputDirectories.make('pack-build-');

export const mutablePreview = Effect.gen(function* mutablePreview() {
  const root = yield* outputDirectory;
  const fs = yield* FileSystem.FileSystem;
  yield* fs.copy('test/fixtures/modular-preview', `${root}/authoring`);
  const authoringPath = `${root}/authoring/authoring.json`;
  const input = yield* Schema.decodeEffect(Schema.fromJsonString(AuthoringFile))(
    yield* fs.readFileString(authoringPath),
  );
  const questions = yield* Schema.decodeEffect(Schema.fromJsonString(QuestionFile))(
    yield* fs.readFileString(`${root}/authoring/questions/core.json`),
  );
  return { authoringPath, input, output: `${root}/built`, questions, root };
});

afterEach(async () => {
  await run(outputDirectories.cleanup());
});
