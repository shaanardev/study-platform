import { Effect, FileSystem, Path } from 'effect';
import { afterEach } from 'vitest';

import { makeTemporaryDirectoryTracker, run, writeJson } from './helpers.js';
import { validPack } from './pack-fixture.js';

export { run, writeJson } from './helpers.js';

const temporaryDirectories = makeTemporaryDirectoryTracker();

export const cloneWithMutableSources = () => ({
  ...validPack,
  questions: validPack.questions.map((question) => ({
    ...question,
    sources: question.sources.map((source) => ({ ...source })),
  })),
});

export const makePack = Effect.gen(function* makePack() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* temporaryDirectories.make('pack-cli-verify-test-');
  yield* fs.makeDirectory(path.join(directory, 'assets'));
  yield* fs.writeFileString(
    path.join(directory, 'assets', 'source.md'),
    'Generic source material.',
  );
  const packPath = path.join(directory, 'pack.json');
  yield* writeJson(packPath, validPack);
  return { directory, packPath };
});

afterEach(async () => {
  await run(temporaryDirectories.cleanup());
});
