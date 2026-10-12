import { Console, Effect, FileSystem, Result, Schema } from 'effect';
import { Command } from 'effect/cli';
import { describe, expect, it } from 'vitest';

import { AuthoringFile } from '../src/build/authoring-schema.js';
import { buildPack } from '../src/build/build.js';
import { buildCommand } from '../src/build/command.js';
import { BuiltExamPackSchema } from '../src/core/built-pack-schema.js';
import { verifyPack } from '../src/verify/verify.js';
import { mutablePreview, outputDirectory, run, writeJson } from './build-helpers.js';

describe('build command', () => {
  it('accepts a per-pack local-note root option', async () => {
    await run(
      Effect.gen(function* test() {
        const fixture = yield* mutablePreview;
        const fs = yield* FileSystem.FileSystem;
        const localNoteRoot = `${fixture.root}/notes`;
        yield* fs.makeDirectory(localNoteRoot);
        const messages: unknown[] = [];
        const testConsole: Console.Console = new Proxy(console, {
          get(target, property, receiver) {
            return property === 'log'
              ? (...values: readonly unknown[]) => messages.push(...values)
              : (Reflect.get(target, property, receiver) as unknown);
          },
        });

        yield* Command.runWith(buildCommand, { version: '0.0.0' })([
          fixture.authoringPath,
          fixture.output,
          '--local-note-root',
          localNoteRoot,
        ]).pipe(Effect.provideService(Console.Console, testConsole));

        expect(messages).toStrictEqual([`Built pack in ${fixture.output}`]);
      }),
    );
  });

  it('copies declared audit and provenance assets without adding them as question sources', async () => {
    await run(
      Effect.gen(function* test() {
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
        expect(pack.questions.every(({ sources }) => sources.length === 1)).toBeTruthy();
      }),
    );
  });

  it('builds and verifies a modular one-domain preview', async () => {
    await run(
      Effect.gen(function* test() {
        const output = yield* outputDirectory;
        yield* buildPack('test/fixtures/modular-preview/authoring.json', output);
        const { pack } = yield* verifyPack(`${output}/preview-pack.json`);
        expect(pack.domains).toStrictEqual([{ id: 'core', title: 'Core', weight: 100 }]);
        expect(pack.questions.map(({ id }) => id).toSorted()).toStrictEqual(['core-q1', 'core-q2']);
        for (const question of pack.questions) {
          expect(question.sources).toStrictEqual([
            { label: 'Core notes', path: 'preview-assets/references/core.md' },
          ]);
          const answers = question.options
            .filter(({ id }) => question.answerIds.includes(id))
            .map(({ text }) => text)
            .toSorted();
          expect(answers).toStrictEqual(
            question.id === 'core-q1' ? ['Success'] : ['Tests', 'Type checking'],
          );
        }
        expect(
          yield* (yield* FileSystem.FileSystem).readFileString(
            `${output}/preview-assets/references/core.md`,
          ),
        ).toBe('Core preview source material.\n');
      }),
    );
  });

  it('builds local-note citations as absolute file URLs without copying notes into pack assets', async () => {
    await run(
      Effect.gen(function* test() {
        const fixture = yield* mutablePreview;
        const fs = yield* FileSystem.FileSystem;
        const localNoteRoot = `${fixture.root}/notes`;
        yield* fs.makeDirectory(`${localNoteRoot}/engineering`, { recursive: true });
        yield* fs.writeFileString(
          `${localNoteRoot}/engineering/streaming.md`,
          'Checkpointing notes.\n',
        );
        const [first] = fixture.questions;
        if (!first) {
          throw new Error('Missing preview question');
        }
        const citation = {
          kind: 'local_note',
          label: 'Streaming guide',
          path: 'engineering/streaming.md',
        };
        yield* writeJson(fixture.authoringPath, {
          ...fixture.input,
          questionFiles: [],
          questions: [{ ...first, sources: [first.sources[0], citation] }],
        });

        yield* buildPack(fixture.authoringPath, fixture.output, localNoteRoot);
        const { pack } = yield* verifyPack(`${fixture.output}/preview-pack.json`);

        expect(pack.questions[0]?.sources).toStrictEqual([
          { label: 'Core notes', path: 'preview-assets/references/core.md' },
          { label: 'Streaming guide', path: `file://${localNoteRoot}/engineering/streaming.md` },
        ]);
        expect(
          yield* fs.exists(`${fixture.output}/preview-assets/engineering/streaming.md`),
        ).toBeFalsy();
      }),
    );
  });

  it('rejects local-note citations without a configured local-note root', async () => {
    await run(
      Effect.gen(function* test() {
        const fixture = yield* mutablePreview;
        const [first] = fixture.questions;
        if (!first) {
          throw new Error('Missing preview question');
        }
        yield* writeJson(fixture.authoringPath, {
          ...fixture.input,
          questionFiles: [],
          questions: [
            {
              ...first,
              sources: [
                {
                  kind: 'local_note',
                  label: 'Streaming guide',
                  path: 'engineering/streaming.md',
                },
              ],
            },
          ],
        });

        const result = yield* Effect.result(buildPack(fixture.authoringPath, fixture.output));

        expect(Result.isFailure(result)).toBeTruthy();
        if (Result.isFailure(result)) {
          expect(result.failure.message).toContain('local-note root');
        }
      }),
    );
  });

  it('builds reproducible multi-domain output and copies local sources', async () => {
    await run(
      Effect.gen(function* test() {
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
        const parsedPack = yield* Schema.decodeUnknownEffect(BuiltExamPackSchema)(
          yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(firstPack),
        );
        expect(parsedPack).toMatchObject({
          domains: [
            { id: 'foundation', weight: 60 },
            { id: 'operations', weight: 40 },
          ],
          schemaVersion: 1,
        });
        const { questions } = parsedPack;
        expect(questions).toHaveLength(2);
        for (const question of questions) {
          const optionIds = new Set(question.options.map((option) => option.id));
          expect(question.answerIds.length).toBeGreaterThan(0);
          expect(question.answerIds.every((id) => optionIds.has(id))).toBeTruthy();
        }
        expect(
          yield* (yield* FileSystem.FileSystem).readFileString(
            `${first}/assets/references/foundation.md`,
          ),
        ).toBe('Foundation source material.\n');
      }),
    );
  });

  it('balances correct answers across four positions in a 200-question bank', async () => {
    await run(
      Effect.gen(function* test() {
        const output = yield* outputDirectory;
        const fs = yield* FileSystem.FileSystem;
        const authoringPath = `${output}/authoring.json`;
        const buildDirectory = `${output}/built`;
        yield* fs.writeFileString(`${output}/reference.md`, 'Reference material.\n');
        const questions = Array.from({ length: 200 }, (_, index) => ({
          correctOptionIds: ['correct'],
          domainId: 'core',
          explanation: 'Correct is the answer.',
          id: `question-${index + 1}`,
          options: [
            { id: 'correct', text: 'Correct' },
            { id: 'wrong-a', text: 'Wrong A' },
            { id: 'wrong-b', text: 'Wrong B' },
            { id: 'wrong-c', text: 'Wrong C' },
          ],
          prompt: `Question ${index + 1}?`,
          sources: [{ label: 'Reference', path: 'reference.md' }],
          type: 'single_choice' as const,
        }));
        const authoringJson = yield* Schema.encodeEffect(Schema.fromJsonString(AuthoringFile))({
          assetsDirectory: 'assets',
          metadata: {
            domains: [{ id: 'core', title: 'Core', weight: 100 }],
            exam: { id: 'exam', title: 'Exam', version: '1' },
            pack: { id: 'pack', synthetic: false, title: 'Pack', version: '1' },
            passingThreshold: 70,
            schemaVersion: 1,
          },
          outputFile: 'pack.json',
          questions,
          shuffle: { answerSeed: 123, orderSeed: 'questions' },
        });
        yield* fs.writeFileString(authoringPath, authoringJson);

        yield* buildPack(authoringPath, buildDirectory);
        const content = yield* fs.readFileString(`${buildDirectory}/pack.json`);
        const pack = yield* Schema.decodeUnknownEffect(BuiltExamPackSchema)(
          yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(content),
        );
        const positions = new Map([
          ['a', 0],
          ['b', 0],
          ['c', 0],
          ['d', 0],
        ]);
        for (const question of pack.questions) {
          expect(question.options).toHaveLength(4);
          expect(question.answerIds).toHaveLength(1);
          expect(
            question.options.some((option) => option.id === question.answerIds[0]),
          ).toBeTruthy();
          const [position] = question.answerIds;
          if (position === undefined) {
            throw new Error('Expected one correct answer ID');
          }
          positions.set(position, (positions.get(position) ?? 0) + 1);
        }
        expect([...positions.values()]).toStrictEqual([50, 50, 50, 50]);
      }),
    );
  });

  it('accepts a one-domain pack weighted at 100 percent', async () => {
    await run(
      Effect.gen(function* test() {
        const output = yield* outputDirectory;
        yield* buildPack('test/fixtures/single-domain/authoring.json', output);
        const content = yield* (yield* FileSystem.FileSystem).readFileString(
          `${output}/focused-pack.json`,
        );
        const pack = yield* Schema.decodeUnknownEffect(BuiltExamPackSchema)(
          yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(content),
        );
        expect(pack.domains).toStrictEqual([{ id: 'core', title: 'Core', weight: 100 }]);
        expect(pack.questions).toStrictEqual([
          expect.objectContaining({ answerIds: ['a'], domainId: 'core' }),
        ]);
      }),
    );
  });

  it('rejects invalid question drafts before writing output', async () => {
    await run(
      Effect.gen(function* test() {
        const output = yield* outputDirectory;
        const result = yield* Effect.result(
          buildPack('test/fixtures/multi-domain/invalid.json', output),
        );
        expect(Result.isFailure(result)).toBeTruthy();
        if (Result.isFailure(result)) {
          expect(result.failure.message).toMatch(/correct answer/iu);
        }
        expect(
          yield* (yield* FileSystem.FileSystem).exists(`${output}/sample-pack.json`),
        ).toBeFalsy();
      }),
    );
  });
});
