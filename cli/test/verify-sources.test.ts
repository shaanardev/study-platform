import { Cause, Effect, Exit, Result } from 'effect';
import { describe, expect, it } from 'vitest';
import { verifyPack } from '../src/verify/verify.js';
import { cloneWithMutableSources, makePack, run, writeJson } from './verify-helpers.js';

describe('verifyPack', () => {
  it('rejects missing sources and source paths that escape the pack folder', () =>
    run(
      Effect.gen(function* () {
        const { directory, packPath } = yield* makePack;
        const missing = cloneWithMutableSources();
        const missingSource = missing.questions[0]?.sources[0];
        if (!missingSource) throw new Error('Expected a source in the missing source fixture');
        missingSource.path = 'assets/missing.md';
        yield* writeJson(packPath, missing);
        const missingResult = yield* Effect.result(verifyPack(packPath));
        expect(Result.isFailure(missingResult)).toBe(true);
        if (Result.isFailure(missingResult))
          expect(missingResult.failure.message).toContain('missing source assets/missing.md');

        const escaped = cloneWithMutableSources();
        const escapedSource = escaped.questions[0]?.sources[0];
        if (!escapedSource) throw new Error('Expected a source in the escaped source fixture');
        escapedSource.path = '../outside.md';
        yield* writeJson(packPath, escaped);
        const escapedResult = yield* Effect.result(verifyPack(packPath));
        expect(Result.isFailure(escapedResult)).toBe(true);
        if (Result.isFailure(escapedResult))
          expect(escapedResult.failure.message).toContain('Exam pack schema validation failed');
        expect(directory).toBeDefined();
      }),
    ));

  it('preserves the filesystem cause when a source is missing', () =>
    run(
      Effect.gen(function* () {
        const { packPath } = yield* makePack;
        const missing = cloneWithMutableSources();
        const source = missing.questions[0]?.sources[0];
        if (!source) throw new Error('Expected a source in the missing source fixture');
        source.path = 'assets/missing.md';
        yield* writeJson(packPath, missing);

        const exit = yield* Effect.exit(verifyPack(packPath));
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          const failure = Cause.findError(exit.cause);
          expect(Result.isSuccess(failure)).toBe(true);
          if (Result.isSuccess(failure)) {
            expect(failure.success.message).toContain('missing source assets/missing.md');
            expect(failure.success.cause).toBeDefined();
            expect(failure.success.cause).not.toBe(failure.success);
          }
        }
      }),
    ));
});
