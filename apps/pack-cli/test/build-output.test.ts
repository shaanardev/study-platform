import { Console, Effect, FileSystem, Result, Schema } from 'effect';
import { Command } from 'effect/cli';
import { describe, expect, it } from 'vitest';

import { AuthoringFile } from '../src/build/authoring-schema.js';
import { buildPack } from '../src/build/build.js';
import { buildCommand } from '../src/build/command.js';
import { verifyPack } from '../src/verify/verify.js';
import { mutablePreview, outputDirectory, run, writeJson } from './build-helpers.js';

describe('build command', () => {
  it('accepts a per-pack local-note root option', () =>
    run(
      Effect.gen(function* () {
        const fixture = yield* mutablePreview;
        const fs = yield* FileSystem.FileSystem;
        const localNoteRoot = `${fixture.root}/notes`;
        yield* fs.makeDirectory(localNoteRoot);
        const messages: unknown[] = [];
        const testConsole: Console.Console = new Proxy(console, {
          get(target, property, receiver) {
            return property === 'log'
              ? (...values: ReadonlyArray<unknown>) => messages.push(...values)
              : (Reflect.get(target, property, receiver) as unknown);
          },
        });

        yield* Command.runWith(buildCommand, { version: '0.0.0' })([
          fixture.authoringPath,
          fixture.output,
          '--local-note-root',
          localNoteRoot,
        ]).pipe(Effect.provideService(Console.Console, testConsole));

        expect(messages).toEqual([`Built pack in ${fixture.output}`]);
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

  it('builds local-note citations as absolute file URLs without copying notes into pack assets', () =>
    run(
      Effect.gen(function* () {
        const fixture = yield* mutablePreview;
        const fs = yield* FileSystem.FileSystem;
        const localNoteRoot = `${fixture.root}/notes`;
        yield* fs.makeDirectory(`${localNoteRoot}/engineering`, { recursive: true });
        yield* fs.writeFileString(
          `${localNoteRoot}/engineering/streaming.md`,
          'Checkpointing notes.\n',
        );
        const first = fixture.questions[0];
        if (!first) throw new Error('Missing preview question');
        const citation = {
          kind: 'local_note',
          path: 'engineering/streaming.md',
          label: 'Streaming guide',
        };
        yield* writeJson(fixture.authoringPath, {
          ...fixture.input,
          questions: [{ ...first, sources: [first.sources[0], citation] }],
          questionFiles: [],
        });

        yield* buildPack(fixture.authoringPath, fixture.output, localNoteRoot);
        const { pack } = yield* verifyPack(`${fixture.output}/preview-pack.json`);

        expect(pack.questions[0]?.sources).toEqual([
          { path: 'preview-assets/references/core.md', label: 'Core notes' },
          { path: `file://${localNoteRoot}/engineering/streaming.md`, label: 'Streaming guide' },
        ]);
        expect(yield* fs.exists(`${fixture.output}/preview-assets/engineering/streaming.md`)).toBe(
          false,
        );
      }),
    ));

  it('rejects local-note citations without a configured local-note root', () =>
    run(
      Effect.gen(function* () {
        const fixture = yield* mutablePreview;
        const first = fixture.questions[0];
        if (!first) throw new Error('Missing preview question');
        yield* writeJson(fixture.authoringPath, {
          ...fixture.input,
          questionFiles: [],
          questions: [
            {
              ...first,
              sources: [
                {
                  kind: 'local_note',
                  path: 'engineering/streaming.md',
                  label: 'Streaming guide',
                },
              ],
            },
          ],
        });

        const result = yield* Effect.result(buildPack(fixture.authoringPath, fixture.output));

        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result)) expect(result.failure.message).toContain('local-note root');
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
});
