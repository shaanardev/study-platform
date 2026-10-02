import { Effect, FileSystem, Result } from 'effect';
import { describe, expect, it } from 'vitest';
import { buildPack } from '../src/build/build.js';
import { mutablePreview, outputDirectory, run, writeJson } from './build-helpers.js';

describe('build command', () => {
  it('requires question references and copied assets to be existing regular files before writing', () =>
    run(
      Effect.gen(function* () {
        const fixture = yield* mutablePreview;
        const fs = yield* FileSystem.FileSystem;
        for (const path of ['audit', 'missing.json']) {
          for (const kind of ['asset', 'source', 'question']) {
            const first = fixture.questions[0];
            if (!first) throw new Error('Missing preview question');
            const input =
              kind === 'question'
                ? { ...fixture.input, questionFiles: [path] }
                : kind === 'asset'
                  ? { ...fixture.input, assetFiles: [path] }
                  : {
                      ...fixture.input,
                      questionFiles: [],
                      questions: [{ ...first, sources: [{ path, label: 'Invalid source' }] }],
                    };
            yield* writeJson(fixture.authoringPath, input);
            const result = yield* Effect.result(buildPack(fixture.authoringPath, fixture.output));
            expect(Result.isFailure(result), `${kind}: ${path}`).toBe(true);
            if (Result.isFailure(result) && path === 'audit')
              expect(result.failure.message).toMatch(/not a regular file/i);
            expect(yield* fs.exists(fixture.output)).toBe(false);
          }
        }
      }),
    ));

  it('rejects unsafe paths for question references and both kinds of asset before writing output', () =>
    run(
      Effect.gen(function* () {
        const fixture = yield* mutablePreview;
        const fs = yield* FileSystem.FileSystem;
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
            const first = fixture.questions[0];
            if (!first) throw new Error('Missing preview question');
            const input =
              kind === 'question'
                ? { ...fixture.input, questionFiles: [path] }
                : kind === 'asset'
                  ? { ...fixture.input, assetFiles: [path] }
                  : {
                      ...fixture.input,
                      questionFiles: [],
                      questions: [{ ...first, sources: [{ path, label: 'Unsafe source' }] }],
                    };
            yield* writeJson(fixture.authoringPath, input);
            const result = yield* Effect.result(buildPack(fixture.authoringPath, fixture.output));
            expect(Result.isFailure(result), `${kind}: ${path}`).toBe(true);
            if (Result.isFailure(result))
              expect(result.failure.message).toMatch(/safe relative path/i);
            expect(yield* fs.exists(fixture.output)).toBe(false);
          }
        }
      }),
    ));

  it('rejects symbolic links in question files, source assets, declared assets, and their parents', () =>
    run(
      Effect.gen(function* () {
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
          expect(Result.isFailure(result), relativePath).toBe(true);
          if (Result.isFailure(result)) expect(result.failure.message).toMatch(/symbolic link/i);
          expect(yield* fs.exists(fixture.output)).toBe(false);
        }
      }),
    ));

  it('rejects output asset links before writing the pack', () =>
    run(
      Effect.gen(function* () {
        const output = yield* outputDirectory;
        const outside = yield* outputDirectory;
        const fs = yield* FileSystem.FileSystem;
        yield* fs.symlink(outside, `${output}/assets`);
        const result = yield* Effect.result(
          buildPack('test/fixtures/multi-domain/authoring.json', output),
        );
        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result)) {
          expect(result.failure.message).toMatch(/symbolic link/i);
        }
        expect(yield* fs.exists(`${output}/sample-pack.json`)).toBe(false);
        expect(yield* fs.exists(`${outside}/references/foundation.md`)).toBe(false);
      }),
    ));
});
