import { Effect, FileSystem, Result } from 'effect';
import { describe, expect, it } from 'vitest';

import { buildPack } from '../src/build/build.js';
import { mutablePreview, outputDirectory, run, writeJson } from './build-helpers.js';

describe('build command', () => {
  it('requires question references and copied assets to be existing regular files before writing', async () => {
    await run(
      Effect.gen(function* test() {
        const fixture = yield* mutablePreview;
        const fs = yield* FileSystem.FileSystem;
        const { input: previewInput } = fixture;
        const [first] = fixture.questions;
        if (!first) {
          throw new Error('Missing preview question');
        }
        for (const path of ['audit', 'missing.json']) {
          for (const kind of ['asset', 'source', 'question']) {
            let input = previewInput;
            if (kind === 'question') {
              input = { ...fixture.input, questionFiles: [path] };
            } else if (kind === 'asset') {
              input = { ...fixture.input, assetFiles: [path] };
            } else {
              input = {
                ...fixture.input,
                questionFiles: [],
                questions: [{ ...first, sources: [{ label: 'Invalid source', path }] }],
              };
            }
            yield* writeJson(fixture.authoringPath, input);
            const result = yield* Effect.result(buildPack(fixture.authoringPath, fixture.output));
            expect(Result.isFailure(result), `${kind}: ${path}`).toBeTruthy();
            if (Result.isFailure(result) && path === 'audit') {
              expect(result.failure.message).toMatch(/not a regular file/iu);
            }
            expect(yield* fs.exists(fixture.output)).toBeFalsy();
          }
        }
      }),
    );
  });

  it('rejects unsafe paths for question references and both kinds of asset before writing output', async () => {
    await run(
      Effect.gen(function* test() {
        const fixture = yield* mutablePreview;
        const fs = yield* FileSystem.FileSystem;
        const { input: previewInput } = fixture;
        const [first] = fixture.questions;
        if (!first) {
          throw new Error('Missing preview question');
        }
        for (const path of [
          '../outside.json',
          '/outside.json',
          'nested/../../outside.json',
          './questions/core.json',
          'questions//core.json',
          'questions\\core.json',
          'questions/core.json\0',
          'C:/outside.json',
          'C:outside.json',
        ]) {
          for (const kind of ['question', 'asset', 'source']) {
            let input = previewInput;
            if (kind === 'question') {
              input = { ...fixture.input, questionFiles: [path] };
            } else if (kind === 'asset') {
              input = { ...fixture.input, assetFiles: [path] };
            } else {
              input = {
                ...fixture.input,
                questionFiles: [],
                questions: [{ ...first, sources: [{ label: 'Unsafe source', path }] }],
              };
            }
            yield* writeJson(fixture.authoringPath, input);
            const result = yield* Effect.result(buildPack(fixture.authoringPath, fixture.output));
            expect(Result.isFailure(result), `${kind}: ${path}`).toBeTruthy();
            if (Result.isFailure(result)) {
              expect(result.failure.message).toMatch(/safe relative path/iu);
            }
            expect(yield* fs.exists(fixture.output)).toBeFalsy();
          }
        }
      }),
    );
  });

  it('rejects symbolic links in question files, source assets, declared assets, and their parents', async () => {
    await run(
      Effect.gen(function* test() {
        const fs = yield* FileSystem.FileSystem;
        for (const relativePath of [
          'questions/core.json',
          'questions',
          'references/core.md',
          'references',
          'audit/review.json',
          'audit',
          'authoring.json',
        ]) {
          const fixture = yield* mutablePreview;
          const original = `${fixture.root}/authoring/${relativePath}`;
          const target = `${original}-target`;
          yield* fs.rename(original, target);
          yield* fs.symlink(target, original);
          const result = yield* Effect.result(buildPack(fixture.authoringPath, fixture.output));
          expect(Result.isFailure(result)).toBeTruthy();
          if (Result.isFailure(result)) {
            expect(result.failure.message).toMatch(/symbolic link/iu);
          }
          expect(yield* fs.exists(fixture.output)).toBeFalsy();
        }
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
          buildPack('test/fixtures/multi-domain/authoring.json', output),
        );
        expect(Result.isFailure(result)).toBeTruthy();
        if (Result.isFailure(result)) {
          expect(result.failure.message).toMatch(/symbolic link/iu);
        }
        expect(yield* fs.exists(`${output}/sample-pack.json`)).toBeFalsy();
        expect(yield* fs.exists(`${outside}/references/foundation.md`)).toBeFalsy();
      }),
    );
  });
});
