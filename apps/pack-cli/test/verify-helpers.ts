import { Data, Effect, FileSystem, Path } from 'effect';
import { afterEach } from 'vitest';

import { makeTemporaryDirectoryTracker, run, writeJson } from './test-helpers.js';

export { run, writeJson } from './test-helpers.js';

const temporaryDirectories = makeTemporaryDirectoryTracker();

class MakePackError extends Data.TaggedError('MakePackError')<{
  readonly cause: unknown;
}> {}

export const validPack = {
  domains: [
    { id: 'core', title: 'Core', weight: 60 },
    { id: 'operations', title: 'Operations', weight: 40 },
  ],
  exam: { id: 'generic-exam', title: 'Generic Exam', version: '1' },
  pack: { id: 'generic-pack', synthetic: true, title: 'Generic Pack', version: '1' },
  questions: [
    {
      answerIds: ['yes'],
      domainId: 'core',
      explanation: 'Yes is the valid result.',
      id: 'core-q1',
      options: [
        { id: 'yes', text: 'Yes' },
        { id: 'no', text: 'No' },
      ],
      prompt: 'Choose the valid result.',
      sources: [{ label: 'Generic source', path: 'assets/source.md' }],
      type: 'single_choice',
    },
    {
      answerIds: ['safe'],
      domainId: 'operations',
      explanation: 'Safe is the correct operation.',
      id: 'operations-q1',
      options: [
        { id: 'safe', text: 'Safe' },
        { id: 'unsafe', text: 'Unsafe' },
      ],
      prompt: 'Choose the safe operation.',
      sources: [{ label: 'Generic source', path: 'assets/source.md' }],
      type: 'single_choice',
    },
  ],
  schemaVersion: 1,
} as const;

export const cloneWithMutableSources = () => ({
  ...validPack,
  questions: validPack.questions.map((question) => ({
    ...question,
    sources: question.sources.map((source) => ({
      label: source.label as string,
      path: source.path as string,
    })),
  })),
});

export const makePack: Effect.Effect<
  { readonly directory: string; readonly packPath: string },
  MakePackError,
  FileSystem.FileSystem | Path.Path
> = Effect.gen(function* makePack() {
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
}).pipe(Effect.mapError((cause) => new MakePackError({ cause })));

afterEach(async () => {
  await run(temporaryDirectories.cleanup());
});
