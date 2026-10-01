import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Result, Schema } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthoringFile } from '../src/build/authoring.js';
import { buildPack } from '../src/build/build.js';

const outputs: string[] = [];
const run = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
  Effect.runPromise(Effect.provide(effect, NodeServices.layer));

const outputDirectory = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* fs.makeTempDirectory({ prefix: 'pack-build-' });
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
        });
        const questions = (parsedPack as { questions: { options: { id: string }[]; answerIds: string[] }[] }).questions;
        expect(questions).toHaveLength(2);
        for (const question of questions) {
          const optionIds = question.options.map((option) => option.id);
          expect(question.answerIds.length).toBeGreaterThan(0);
          expect(question.answerIds.every((id) => optionIds.includes(id))).toBe(true);
        }
        expect(
          yield* (yield* FileSystem.FileSystem).readFileString(
            `${first}/assets/references/foundation.md`,
          ),
        ).toBe('Foundation source material.\n');
      }),
    ));

  it('balances correct answers across four positions in a 200-question bank', () =>
    run(
      Effect.gen(function* () {
        const output = yield* outputDirectory;
        const fs = yield* FileSystem.FileSystem;
        const authoringPath = `${output}/authoring.json`;
        const buildDirectory = `${output}/built`;
        yield* fs.writeFileString(`${output}/reference.md`, 'Reference material.\n');
        const questions = Array.from({ length: 200 }, (_, index) => ({
          id: `question-${index + 1}`,
          type: 'single_choice' as const,
          domainId: 'core',
          prompt: `Question ${index + 1}?`,
          options: [
            { id: 'correct', text: 'Correct' },
            { id: 'wrong-a', text: 'Wrong A' },
            { id: 'wrong-b', text: 'Wrong B' },
            { id: 'wrong-c', text: 'Wrong C' },
          ],
          correctOptionIds: ['correct'],
          explanation: 'Correct is the answer.',
          sources: [{ path: 'reference.md', label: 'Reference' }],
        }));
        const authoringJson = yield* Schema.encodeEffect(Schema.fromJsonString(AuthoringFile))({
          metadata: {
            schemaVersion: 1,
            exam: { id: 'exam', title: 'Exam', version: '1' },
            pack: { id: 'pack', title: 'Pack', version: '1', synthetic: false },
            domains: [{ id: 'core', title: 'Core', weight: 100 }],
            passingThreshold: 70,
          },
          outputFile: 'pack.json',
          assetsDirectory: 'assets',
          shuffle: { answerSeed: 123, orderSeed: 'questions' },
          questions,
        });
        yield* fs.writeFileString(
          authoringPath,
          authoringJson,
        );

        yield* buildPack(authoringPath, buildDirectory);
        const content = yield* fs.readFileString(`${buildDirectory}/pack.json`);
        const pack = (yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(
          content,
        )) as { questions: { options: { id: string }[]; answerIds: string[] }[] };
        const positions = new Map([['a', 0], ['b', 0], ['c', 0], ['d', 0]]);
        for (const question of pack.questions) {
          expect(question.options).toHaveLength(4);
          expect(question.answerIds).toHaveLength(1);
          expect(question.options.some((option) => option.id === question.answerIds[0])).toBe(true);
          const position = question.answerIds[0];
          positions.set(position, (positions.get(position) ?? 0) + 1);
        }
        expect([...positions.values()]).toEqual([50, 50, 50, 50]);
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
