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
  it('returns typed failures from pure authoring and path validation', () =>
    run(
      Effect.gen(function* () {
        const fixture = yield* mutablePreview;
        const invalidAuthoring = validateAuthoring({ ...fixture.input, questions: [] });
        expect(Result.isFailure(invalidAuthoring)).toBe(true);
        if (Result.isFailure(invalidAuthoring)) {
          expect(invalidAuthoring.failure).toBeInstanceOf(AuthoringValidationError);
          expect(invalidAuthoring.failure.message).toBe(
            'Authoring must contain at least one question',
          );
        }

        const invalidPath = safeRelativePath('../outside', 'assetFiles path');
        expect(Result.isFailure(invalidPath)).toBe(true);
        if (Result.isFailure(invalidPath)) {
          expect(invalidPath.failure).toBeInstanceOf(AuthoringValidationError);
          expect(invalidPath.failure.message).toBe('assetFiles path must be a safe relative path');
        }
      }),
    ));

  it('preserves pure validation failures as the BuildError cause', () =>
    run(
      Effect.gen(function* () {
        const fixture = yield* mutablePreview;
        yield* writeJson(fixture.authoringPath, {
          ...fixture.input,
          questions: [],
          questionFiles: [],
        });
        const result = yield* Effect.result(buildPack(fixture.authoringPath, fixture.output));

        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result)) {
          expect(result.failure).toBeInstanceOf(BuildError);
          expect(result.failure.message).toBe('Authoring must contain at least one question');
          expect(result.failure.cause).toBeInstanceOf(AuthoringValidationError);
          expect((result.failure.cause as AuthoringValidationError).message).toBe(
            'Authoring must contain at least one question',
          );
        }
      }),
    ));

  it('rejects an empty assembled question bank', () =>
    run(
      Effect.gen(function* () {
        const fixture = yield* mutablePreview;
        const fs = yield* FileSystem.FileSystem;
        for (const input of [
          { ...fixture.input, questions: [], questionFiles: [] },
          { ...fixture.input, questionFiles: ['questions/core.json'] },
        ]) {
          yield* writeJson(fixture.authoringPath, input);
          yield* writeJson(`${fixture.root}/authoring/questions/core.json`, []);
          const result = yield* Effect.result(buildPack(fixture.authoringPath, fixture.output));
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result))
            expect(result.failure.message).toMatch(/at least one question/i);
          expect(yield* fs.exists(fixture.output)).toBe(false);
        }
      }),
    ));

  it('validates IDs and answer references across the assembled bank', () =>
    run(
      Effect.gen(function* () {
        const fixture = yield* mutablePreview;
        const fs = yield* FileSystem.FileSystem;
        const [first, second] = fixture.questions;
        if (!first || !second) throw new Error('Missing preview questions');
        const cases = [
          {
            input: { ...fixture.input, questions: [first] },
            questions: fixture.questions,
            error: /duplicate question ID/i,
          },
          {
            input: {
              ...fixture.input,
              questionFiles: ['questions/core.json', 'questions/core.json'],
            },
            questions: fixture.questions,
            error: /duplicate question ID/i,
          },
          {
            input: fixture.input,
            questions: [{ ...first, domainId: 'unknown' }],
            error: /unknown domain/i,
          },
          {
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
            error: /duplicate domain ID/i,
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
            input: fixture.input,
            questions: [question],
            error: /invalid options or correct answer IDs/i,
          })),
        ];
        for (const scenario of cases) {
          yield* writeJson(fixture.authoringPath, scenario.input);
          yield* writeJson(`${fixture.root}/authoring/questions/core.json`, scenario.questions);
          const result = yield* Effect.result(buildPack(fixture.authoringPath, fixture.output));
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result)) expect(result.failure.message).toMatch(scenario.error);
          expect(yield* fs.exists(fixture.output)).toBe(false);
        }
      }),
    ));

  it('assembles inline questions and multiple files reproducibly in declaration order', () =>
    run(
      Effect.gen(function* () {
        const fixture = yield* mutablePreview;
        const fs = yield* FileSystem.FileSystem;
        const [first, second] = fixture.questions;
        if (!first || !second) throw new Error('Missing preview questions');
        const inline = { ...first, id: 'inline-q3', prompt: 'Which outcome means a check passed?' };
        yield* writeJson(`${fixture.root}/authoring/questions/core.json`, [first]);
        yield* writeJson(`${fixture.root}/authoring/questions/extra.json`, [second]);
        yield* writeJson(fixture.authoringPath, {
          ...fixture.input,
          questions: [inline],
          questionFiles: ['questions/core.json', 'questions/extra.json'],
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
        expect(pack.questions.map(({ id }) => id).sort()).toEqual([
          'core-q1',
          'core-q2',
          'inline-q3',
        ]);
      }),
    ));

  it('reports the modular filename for malformed JSON or invalid question schemas', () =>
    run(
      Effect.gen(function* () {
        const fixture = yield* mutablePreview;
        const fs = yield* FileSystem.FileSystem;
        for (const content of ['{', '{ "questions": [] }', '[{ "id": "missing-fields" }]']) {
          yield* fs.writeFileString(`${fixture.root}/authoring/questions/core.json`, content);
          const result = yield* Effect.result(buildPack(fixture.authoringPath, fixture.output));
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result)) {
            expect(result.failure.message).toContain('questions/core.json');
            expect(result.failure.message).toMatch(/invalid question file/i);
          }
          expect(yield* fs.exists(fixture.output)).toBe(false);
        }
      }),
    ));
});
