import { pathToFileURL } from 'node:url';

import { Effect, Result } from 'effect';
import { describe, expect, it } from 'vitest';

import { verifyPack } from '../src/verify/verify.js';
import { cloneWithMutableSources, makePack, run, writeJson } from './verify-helpers.js';

describe(verifyPack, () => {
  it('rejects missing sources and source paths that escape the pack folder', async () => {
    await run(
      Effect.gen(function* testEffect() {
        const { packPath } = yield* makePack;
        const missing = cloneWithMutableSources();
        const missingSource = missing.questions[0]?.sources[0];
        expect.assert(missingSource, 'Expected a source in the missing source fixture');
        missingSource.path = 'assets/missing.md';
        yield* writeJson(packPath, missing);
        const missingResult = yield* Effect.result(verifyPack(packPath));
        expect.assert(Result.isFailure(missingResult));
        expect(missingResult.failure.message).toContain('missing source assets/missing.md');
        expect(missingResult.failure.cause).toBeDefined();
        expect(missingResult.failure.cause).not.toBe(missingResult.failure);

        const escaped = cloneWithMutableSources();
        const escapedSource = escaped.questions[0]?.sources[0];
        expect.assert(escapedSource, 'Expected a source in the escaped source fixture');
        escapedSource.path = '../outside.md';
        yield* writeJson(packPath, escaped);
        const escapedResult = yield* Effect.result(verifyPack(packPath));
        expect.assert(Result.isFailure(escapedResult));
        expect(escapedResult.failure.message).toContain('Exam pack schema validation failed');
      }),
    );
  });

  it('validates absolute file URL sources as existing regular files', async () => {
    await run(
      Effect.gen(function* testEffect() {
        const { directory, packPath } = yield* makePack;
        const pack = cloneWithMutableSources();
        const source = pack.questions[0]?.sources[0];
        expect.assert(source, 'Expected a source in the file URL fixture');
        source.path = pathToFileURL(directory).href;
        yield* writeJson(packPath, pack);

        const result = yield* Effect.result(verifyPack(packPath));

        expect.assert(Result.isFailure(result));
        expect(result.failure.message).toContain('local source is not a file');
      }),
    );
  });
});
