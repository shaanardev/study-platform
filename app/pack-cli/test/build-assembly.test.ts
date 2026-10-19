import { Effect, FileSystem, Result } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  AuthoringValidationError,
  safeRelativePath,
  validateAuthoring,
} from '../src/build/authoring-validation.js';
import { BuildError, buildPack } from '../src/build/build.js';
import { verifyPack } from '../src/verify/verify.js';
import { mutablePreview, run, writeJson } from './build-helpers.js';

describe('build command', () => {
  it('returns typed failures from pure authoring and path validation', async () => {
    await run(
      Effect.gen(function* test() {
        const fixture = yield* mutablePreview;
        const invalidAuthoring = validateAuthoring({ ...fixture.input, questions: [] });
        expect.assert(Result.isFailure(invalidAuthoring));
        expect(invalidAuthoring.failure).toBeInstanceOf(AuthoringValidationError);
        expect(invalidAuthoring.failure.message).toBe(
          'Authoring must contain at least one question',
        );

        const invalidPath = safeRelativePath('../outside', 'assetFiles path');
        expect.assert(Result.isFailure(invalidPath));
        expect(invalidPath.failure).toBeInstanceOf(AuthoringValidationError);
        expect(invalidPath.failure.message).toBe('assetFiles path must be a safe relative path');
      }),
    );
  });

  it('preserves pure validation failures as the BuildError cause', async () => {
    await run(
      Effect.gen(function* test() {
        const fixture = yield* mutablePreview;
        yield* writeJson(fixture.authoringPath, {
          ...fixture.input,
          questionFiles: [],
          questions: [],
        });
        const result = yield* Effect.result(buildPack(fixture.authoringPath, fixture.output));

        expect.assert(Result.isFailure(result));
        expect(result.failure).toBeInstanceOf(BuildError);
        expect(result.failure.message).toBe('Authoring must contain at least one question');
        expect.assert(result.failure.cause instanceof AuthoringValidationError);
        expect(result.failure.cause.message).toBe('Authoring must contain at least one question');
      }),
    );
  });

  it('rejects an empty assembled question bank', async () => {
    await run(
      Effect.gen(function* test() {
        const fixture = yield* mutablePreview;
        const fs = yield* FileSystem.FileSystem;
        yield* Effect.forEach(
          [
            { ...fixture.input, questionFiles: [], questions: [] },
            { ...fixture.input, questionFiles: ['questions/core.json'] },
          ],
          (input) =>
            Effect.gen(function* verifyEmptyAssembly() {
              yield* writeJson(fixture.authoringPath, input);
              yield* writeJson(`${fixture.root}/authoring/questions/core.json`, []);
              const result = yield* Effect.result(buildPack(fixture.authoringPath, fixture.output));
              expect.assert(Result.isFailure(result));
              expect(result.failure.message).toMatch(/at least one question/iu);
              expect(yield* fs.exists(fixture.output)).toBeFalsy();
            }),
        );
      }),
    );
  });

  it('validates IDs and answer references across the assembled bank', async () => {
    await run(
      Effect.gen(function* test() {
        const fixture = yield* mutablePreview;
        const fs = yield* FileSystem.FileSystem;
        const [first, second] = fixture.questions;
        expect.assert(first, 'Missing first preview question');
        expect.assert(second, 'Missing second preview question');

        const cases = [
          {
            error: /duplicate question ID/iu,
            input: { ...fixture.input, questions: [first] },
            questions: fixture.questions,
          },
          {
            error: /duplicate question ID/iu,
            input: {
              ...fixture.input,
              questionFiles: ['questions/core.json', 'questions/core.json'],
            },
            questions: fixture.questions,
          },
          {
            error: /unknown domain/iu,
            input: fixture.input,
            questions: [{ ...first, domainId: 'unknown' }],
          },
          {
            error: /duplicate domain ID/iu,
            input: {
              ...fixture.input,
              metadata: {
                ...fixture.input.metadata,
                domains: [
                  { id: 'core', title: 'Core', weight: 50 },
                  { id: 'core', title: 'Repeated', weight: 50 },
                ],
              },
            },
            questions: fixture.questions,
          },
          ...[
            { ...first, correctOptionIds: ['unknown'] },
            { ...first, correctOptionIds: ['success', 'success'] },
            {
              ...first,
              options: [
                { id: 'success', text: 'Success' },
                { id: 'success', text: 'Other' },
              ],
            },
            { ...first, correctOptionIds: ['success', 'failure'] },
            { ...second, correctOptionIds: ['tests'] },
            { ...second, correctOptionIds: ['tests', 'types', 'guess'] },
          ].map((question) => ({
            error: /invalid options or correct answer IDs/iu,
            input: fixture.input,
            questions: [question],
          })),
        ];

        // oxlint-disable-next-line unicorn/no-array-method-this-argument -- Effect.forEach's iterable is not a thisArg.
        yield* Effect.forEach(cases, (scenario) =>
          Effect.gen(function* verifyScenario() {
            yield* writeJson(fixture.authoringPath, scenario.input);
            yield* writeJson(`${fixture.root}/authoring/questions/core.json`, scenario.questions);
            const result = yield* Effect.result(buildPack(fixture.authoringPath, fixture.output));
            expect.assert(Result.isFailure(result));
            expect(result.failure.message).toMatch(scenario.error);
            expect(yield* fs.exists(fixture.output)).toBeFalsy();
          }),
        );
      }),
    );
  });

  it('assembles inline questions and multiple files reproducibly in declaration order', async () => {
    await run(
      Effect.gen(function* test() {
        const fixture = yield* mutablePreview;
        const fs = yield* FileSystem.FileSystem;
        const [first, second] = fixture.questions;
        expect.assert(first, 'Missing first preview question');
        expect.assert(second, 'Missing second preview question');
        const inline = { ...first, id: 'inline-q3', prompt: 'Which outcome means a check passed?' };
        yield* writeJson(`${fixture.root}/authoring/questions/core.json`, [first]);
        yield* writeJson(`${fixture.root}/authoring/questions/extra.json`, [second]);
        yield* writeJson(fixture.authoringPath, {
          ...fixture.input,
          questionFiles: ['questions/core.json', 'questions/extra.json'],
          questions: [inline],
        });
        yield* buildPack(fixture.authoringPath, fixture.output);
        const modular = yield* fs.readFileString(`${fixture.output}/preview-pack.json`);
        const { questionFiles: _references, ...inlineInput } = fixture.input;
        yield* writeJson(fixture.authoringPath, {
          ...inlineInput,
          questions: [inline, first, second],
        });
        yield* buildPack(fixture.authoringPath, `${fixture.root}/inline-built`);
        expect(yield* fs.readFileString(`${fixture.root}/inline-built/preview-pack.json`)).toBe(
          modular,
        );
        const { pack } = yield* verifyPack(`${fixture.output}/preview-pack.json`);
        expect(pack.questions.map(({ id }) => id).toSorted()).toStrictEqual([
          'core-q1',
          'core-q2',
          'inline-q3',
        ]);
      }),
    );
  });

  it('reports the modular filename for malformed JSON or invalid question schemas', async () => {
    await run(
      Effect.gen(function* test() {
        const fixture = yield* mutablePreview;
        const fs = yield* FileSystem.FileSystem;
        yield* Effect.forEach(
          ['{', '{ "questions": [] }', '[{ "id": "missing-fields" }]'],
          (content) =>
            Effect.gen(function* verifyMalformedQuestionFile() {
              yield* fs.writeFileString(`${fixture.root}/authoring/questions/core.json`, content);
              const result = yield* Effect.result(buildPack(fixture.authoringPath, fixture.output));
              expect.assert(Result.isFailure(result));
              expect(result.failure.message).toContain('questions/core.json');
              expect(result.failure.message).toMatch(/invalid question file/iu);
              expect(yield* fs.exists(fixture.output)).toBeFalsy();
            }),
        );
      }),
    );
  });
});
