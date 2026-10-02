import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Result, Schema } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthoringFile, QuestionFile } from '../src/build/authoring.js';
import { buildPack } from '../src/build/build.js';
import { verifyPack } from '../src/verify/verify.js';

const outputs: string[] = [];
const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(Effect.provide(effect, NodeServices.layer));

const outputDirectory = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* fs.makeTempDirectory({ prefix: 'pack-build-' });
  outputs.push(path);
  return path;
});

const mutablePreview = Effect.gen(function* () {
  const root = yield* outputDirectory;
  const fs = yield* FileSystem.FileSystem;
  yield* fs.copy('test/fixtures/modular-preview', `${root}/authoring`);
  const authoringPath = `${root}/authoring/authoring.json`;
  const input = yield* Schema.decodeEffect(Schema.fromJsonString(AuthoringFile))(
    yield* fs.readFileString(authoringPath),
  );
  const questions = yield* Schema.decodeEffect(Schema.fromJsonString(QuestionFile))(
    yield* fs.readFileString(`${root}/authoring/questions/core.json`),
  );
  return { root, authoringPath, input, questions, output: `${root}/built` };
});

const writeJson = (path: string, value: unknown) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(
      path,
      yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(value),
    );
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

  it('copies declared audit and provenance assets without adding them as question sources', () =>
    run(
      Effect.gen(function* () {
        const output = yield* outputDirectory;
        yield* buildPack('test/fixtures/modular-preview/authoring.json', output);
        const fs = yield* FileSystem.FileSystem;
        expect(yield* fs.readFileString(`${output}/preview-assets/audit/review.json`)).toBe(
          '{ "domainId": "core", "reviewedQuestionIds": ["core-q1", "core-q2"] }\n',
        );
        expect(yield* fs.readFileString(`${output}/preview-assets/provenance/manifest.json`)).toBe(
          '{ "source": "references/core.md", "kind": "synthetic-preview" }\n',
        );
        const { pack } = yield* verifyPack(`${output}/preview-pack.json`);
        expect(pack.questions.every(({ sources }) => sources.length === 1)).toBe(true);
      }),
    ));

  it('builds and verifies a modular one-domain preview', () =>
    run(
      Effect.gen(function* () {
        const output = yield* outputDirectory;
        yield* buildPack('test/fixtures/modular-preview/authoring.json', output);
        const { pack } = yield* verifyPack(`${output}/preview-pack.json`);
        expect(pack.domains).toEqual([{ id: 'core', title: 'Core', weight: 100 }]);
        expect(pack.questions.map(({ id }) => id).sort()).toEqual(['core-q1', 'core-q2']);
        for (const question of pack.questions) {
          expect(question.sources).toEqual([
            { path: 'preview-assets/references/core.md', label: 'Core notes' },
          ]);
          const answers = question.options
            .filter(({ id }) => question.answerIds.includes(id))
            .map(({ text }) => text)
            .sort();
          expect(answers).toEqual(
            question.id === 'core-q1' ? ['Success'] : ['Tests', 'Type checking'],
          );
        }
        expect(
          yield* (yield* FileSystem.FileSystem).readFileString(
            `${output}/preview-assets/references/core.md`,
          ),
        ).toBe('Core preview source material.\n');
      }),
    ));

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
        const questions = (
          parsedPack as { questions: { options: { id: string }[]; answerIds: string[] }[] }
        ).questions;
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
        yield* fs.writeFileString(authoringPath, authoringJson);

        yield* buildPack(authoringPath, buildDirectory);
        const content = yield* fs.readFileString(`${buildDirectory}/pack.json`);
        const pack = (yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(
          content,
        )) as { questions: { options: { id: string }[]; answerIds: string[] }[] };
        const positions = new Map([
          ['a', 0],
          ['b', 0],
          ['c', 0],
          ['d', 0],
        ]);
        for (const question of pack.questions) {
          expect(question.options).toHaveLength(4);
          expect(question.answerIds).toHaveLength(1);
          expect(question.options.some((option) => option.id === question.answerIds[0])).toBe(true);
          const position = question.answerIds[0];
          if (position === undefined) throw new Error('Expected one correct answer ID');
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
