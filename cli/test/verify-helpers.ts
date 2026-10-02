import { Effect, FileSystem, Path } from 'effect';
import { afterEach } from 'vitest';
import { makeTemporaryDirectoryTracker, run, writeJson } from './test-helpers.js';

export { run, writeJson };

const temporaryDirectories = makeTemporaryDirectoryTracker();

export const validPack = {
  schemaVersion: 1,
  exam: { id: 'generic-exam', title: 'Generic Exam', version: '1' },
  pack: { id: 'generic-pack', title: 'Generic Pack', version: '1', synthetic: true },
  domains: [
    { id: 'core', title: 'Core', weight: 60 },
    { id: 'operations', title: 'Operations', weight: 40 },
  ],
  questions: [
    {
      id: 'core-q1',
      type: 'single_choice',
      domainId: 'core',
      prompt: 'Choose the valid result.',
      options: [
        { id: 'yes', text: 'Yes' },
        { id: 'no', text: 'No' },
      ],
      answerIds: ['yes'],
      explanation: 'Yes is the valid result.',
      sources: [{ path: 'assets/source.md', label: 'Generic source' }],
    },
    {
      id: 'operations-q1',
      type: 'single_choice',
      domainId: 'operations',
      prompt: 'Choose the safe operation.',
      options: [
        { id: 'safe', text: 'Safe' },
        { id: 'unsafe', text: 'Unsafe' },
      ],
      answerIds: ['safe'],
      explanation: 'Safe is the correct operation.',
      sources: [{ path: 'assets/source.md', label: 'Generic source' }],
    },
  ],
} as const;

export const cloneWithMutableSources = () => ({
  ...validPack,
  questions: validPack.questions.map((question) => ({
    ...question,
    sources: question.sources.map((source) => ({
      path: String(source.path),
      label: String(source.label),
    })),
  })),
});

export const makePack = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* temporaryDirectories.make('pack-cli-verify-test-');
  yield* fs.makeDirectory(path.join(directory, 'assets'));
  yield* fs.writeFileString(
    path.join(directory, 'assets', 'source.md'),
    'Generic source material.',
  );
  const packPath = path.join(directory, 'pack.json');
  yield* fs.writeFileString(packPath, JSON.stringify(validPack));
  return { directory, packPath };
});

afterEach(() => run(temporaryDirectories.cleanup()));
