import { Effect, Result } from 'effect';
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
});
