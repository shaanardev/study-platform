import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Result, Schema } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPack } from '../src/build/build.js';

const outputs: string[] = [];
const run = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
  Effect.runPromise(Effect.provide(effect, NodeServices.layer));

const outputDirectory = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* fs.makeTempDirectory({ directory: '/tmp', prefix: 'pack-build-' });
  outputs.push(path);
  return path;
});

afterEach(() =>
  run(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* Effect.forEach(outputs.splice(0), (path) =>
        fs.remove(path, { recursive: true, force: true }),
      );
    }),
  ),
);

describe('build command', () => {
  it('builds reproducible multi-domain output and copies local sources', () =>
    run(
      Effect.gen(function* () {
        const first = yield* outputDirectory;
        const second = yield* outputDirectory;
        yield* buildPack('test/fixtures/multi-domain/authoring.json', first);
        yield* buildPack('test/fixtures/multi-domain/authoring.json', second);

        const firstPack = yield* (yield* FileSystem.FileSystem).readFileString(
          `${first}/sample-pack.json`,
        );
        const secondPack = yield* (yield* FileSystem.FileSystem).readFileString(
          `${second}/sample-pack.json`,
        );
        expect(firstPack).toBe(secondPack);
        const parsedPack = yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(
          firstPack,
        );
        expect(parsedPack).toMatchObject({
          schemaVersion: 1,
          domains: [
            { id: 'foundation', weight: 60 },
            { id: 'operations', weight: 40 },
          ],
          questions: expect.arrayContaining([
            expect.objectContaining({ id: 'foundation-q1', answerIds: ['a'] }),
            expect.objectContaining({ id: 'operations-q1', answerIds: ['a', 'b'] }),
          ]),
        });
        expect(
          yield* (yield* FileSystem.FileSystem).readFileString(
            `${first}/assets/references/foundation.md`,
          ),
        ).toBe('Foundation source material.\n');
      }),
    ));

  it('accepts a one-domain pack weighted at 100 percent', () =>
    run(
      Effect.gen(function* () {
        const output = yield* outputDirectory;
        yield* buildPack('test/fixtures/single-domain/authoring.json', output);
        const content = yield* (yield* FileSystem.FileSystem).readFileString(
          `${output}/focused-pack.json`,
        );
        const pack = (yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(
          content,
        )) as {
          domains: { id: string; title: string; weight: number }[];
          questions: { domainId: string; answerIds: string[] }[];
        };
        expect(pack.domains).toEqual([{ id: 'core', title: 'Core', weight: 100 }]);
        expect(pack.questions).toEqual([
          expect.objectContaining({ domainId: 'core', answerIds: ['a'] }),
        ]);
      }),
    ));

  it('rejects invalid question drafts before writing output', () =>
    run(
      Effect.gen(function* () {
        const output = yield* outputDirectory;
        const result = yield* Effect.result(
          buildPack('test/fixtures/multi-domain/invalid.json', output),
        );
        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result)) expect(result.failure.message).toMatch(/correct answer/i);
        expect(yield* (yield* FileSystem.FileSystem).exists(`${output}/sample-pack.json`)).toBe(
          false,
        );
      }),
    ));
});
