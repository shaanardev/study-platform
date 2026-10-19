import type { Schema } from 'effect';
import { Effect, FileSystem, Result } from 'effect';
import { describe, expect, it } from 'vitest';

import type { AuthoringFileInput, QuestionFile } from '../src/build/authoring-schema.js';
import { buildPack } from '../src/build/build.js';
import { mutablePreview, outputDirectory, run, testPath, writeJson } from './build-helpers.js';

type Question = Schema.Schema.Type<typeof QuestionFile>[number];

const pathInputCases = (
  input: AuthoringFileInput,
  first: Question,
  path: string,
  sourceLabel: string,
) => [
  { input: { ...input, questionFiles: [path] }, kind: 'question' },
  { input: { ...input, assetFiles: [path] }, kind: 'asset' },
  {
    input: {
      ...input,
      questionFiles: [],
      questions: [{ ...first, sources: [{ label: sourceLabel, path }] }],
    },
    kind: 'source',
  },
];

describe('build command', () => {
  it('rejects directory references for questions, sources, and assets before writing', async () => {
    await run(
      Effect.gen(function* test() {
        const fixture = yield* mutablePreview;
        const fs = yield* FileSystem.FileSystem;
        const [first] = fixture.questions;
        expect.assert(first, 'Missing preview question');

        yield* Effect.forEach(
          pathInputCases(fixture.input, first, 'audit', 'Invalid source'),
          ({ kind, input }) =>
            Effect.gen(function* verifyDirectoryReference() {
              yield* writeJson(fixture.authoringPath, input);
              const result = yield* Effect.result(buildPack(fixture.authoringPath, fixture.output));
              expect.assert(Result.isFailure(result), `${kind}: audit`);
              expect(result.failure.message).toMatch(/not a regular file/iu);
              expect(yield* fs.exists(fixture.output)).toBeFalsy();
            }),
        );
      }),
    );
  });

  it('rejects missing question, source, and asset files before writing', async () => {
    await run(
      Effect.gen(function* test() {
        const fixture = yield* mutablePreview;
        const fs = yield* FileSystem.FileSystem;
        const [first] = fixture.questions;
        expect.assert(first, 'Missing preview question');

        yield* Effect.forEach(
          pathInputCases(fixture.input, first, 'missing.json', 'Missing source'),
          ({ kind, input }) =>
            Effect.gen(function* verifyMissingReference() {
              yield* writeJson(fixture.authoringPath, input);
              const result = yield* Effect.result(buildPack(fixture.authoringPath, fixture.output));
              expect.assert(Result.isFailure(result), `${kind}: missing.json`);
              expect(yield* fs.exists(fixture.output)).toBeFalsy();
            }),
        );
      }),
    );
  });

  it('rejects unsafe paths for question references and both kinds of asset before writing output', async () => {
    await run(
      Effect.gen(function* test() {
        const fixture = yield* mutablePreview;
        const fs = yield* FileSystem.FileSystem;
        const [first] = fixture.questions;
        expect.assert(first, 'Missing preview question');

        yield* Effect.forEach(
          [
            '../outside.json',
            '/outside.json',
            'nested/../../outside.json',
            './questions/core.json',
            'questions//core.json',
            'questions\\core.json',
            'questions/core.json\0',
            'C:/outside.json',
            'C:outside.json',
          ],
          (path) =>
            Effect.forEach(
              pathInputCases(fixture.input, first, path, 'Unsafe source'),
              ({ kind, input }) =>
                Effect.gen(function* verifyUnsafeReference() {
                  yield* writeJson(fixture.authoringPath, input);

                  const result = yield* Effect.result(
                    buildPack(fixture.authoringPath, fixture.output),
                  );

                  expect.assert(Result.isFailure(result), `${kind}: ${path}`);
                  expect(result.failure.message).toMatch(/safe relative path/iu);
                  expect(yield* fs.exists(fixture.output)).toBeFalsy();
                }),
            ),
        );
      }),
    );
  });

  it('rejects symbolic links in question files, source assets, declared assets, and their parents', async () => {
    await run(
      Effect.gen(function* test() {
        const fs = yield* FileSystem.FileSystem;
        yield* Effect.forEach(
          [
            'questions/core.json',
            'questions',
            'references/core.md',
            'references',
            'audit/review.json',
            'audit',
            'authoring.json',
          ],
          (relativePath) =>
            Effect.gen(function* verifySymbolicLink() {
              const fixture = yield* mutablePreview;
              const original = `${fixture.root}/authoring/${relativePath}`;
              const target = `${original}-target`;
              yield* fs.rename(original, target);
              yield* fs.symlink(target, original);
              const result = yield* Effect.result(buildPack(fixture.authoringPath, fixture.output));
              expect.assert(Result.isFailure(result));
              expect(result.failure.message).toMatch(/symbolic link/iu);
              expect(yield* fs.exists(fixture.output)).toBeFalsy();
            }),
        );
      }),
    );
  });

  it('rejects output asset links before writing the pack', async () => {
    await run(
      Effect.gen(function* test() {
        const output = yield* outputDirectory;
        const outside = yield* outputDirectory;
        const fs = yield* FileSystem.FileSystem;
        yield* fs.symlink(outside, `${output}/assets`);

        const result = yield* Effect.result(
          buildPack(testPath('fixtures', 'multi-domain', 'authoring.json'), output),
        );

        expect.assert(Result.isFailure(result));
        expect(result.failure.message).toMatch(/symbolic link/iu);
        expect(yield* fs.exists(`${output}/sample-pack.json`)).toBeFalsy();
        expect(yield* fs.exists(`${outside}/references/foundation.md`)).toBeFalsy();
      }),
    );
  });
});
