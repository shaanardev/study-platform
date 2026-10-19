import { BuiltExamPackSchema } from '@learning-platform/exam-pack';
import { Effect, FileSystem, Result, Schema } from 'effect';
import { Command } from 'effect/cli';
import { TestConsole } from 'effect/testing';
import { describe, expect, it } from 'vitest';

import { AuthoringFile } from '../src/build/authoring-schema.js';
import { buildPack } from '../src/build/build.js';
import { buildCommand } from '../src/build/command.js';
import { verifyPack } from '../src/verify/verify.js';
import {
  mutablePreview,
  outputDirectory,
  relativeTestPath,
  run,
  testPath,
  writeJson,
} from './build-helpers.js';

describe('build command', () => {
  it('accepts a per-pack local-note root option', async () => {
    await run(
      Effect.gen(function* test() {
        const fixture = yield* mutablePreview;
        const fs = yield* FileSystem.FileSystem;
        const localNoteRoot = `${fixture.root}/notes`;
        yield* fs.makeDirectory(localNoteRoot);

        yield* Command.runWith(buildCommand, { version: '0.0.0' })([
          fixture.authoringPath,
          fixture.output,
          '--local-note-root',
          localNoteRoot,
        ]);

        expect(yield* TestConsole.logLines).toStrictEqual([`Built pack in ${fixture.output}`]);
      }).pipe(Effect.provide(TestConsole.layer)),
    );
  });

  it('copies declared audit and provenance assets without adding them as question sources', async () => {
    await run(
      Effect.gen(function* test() {
        const output = yield* outputDirectory;
        yield* buildPack(testPath('fixtures', 'modular-preview', 'authoring.json'), output);
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
        yield* buildPack(testPath('fixtures', 'modular-preview', 'authoring.json'), output);
        const { pack } = yield* verifyPack(`${output}/preview-pack.json`);
        expect(pack.domains).toStrictEqual([{ id: 'core', title: 'Core', weight: 100 }]);
        expect(pack.questions.map(({ id }) => id).toSorted()).toStrictEqual(['core-q1', 'core-q2']);

        const expectedAnswersByQuestion = new Map([
          ['core-q1', ['Success']],
          ['core-q2', ['Tests', 'Type checking']],
        ]);

        pack.questions.forEach((question) => {
          expect(question.sources).toStrictEqual([
            { label: 'Core notes', path: 'preview-assets/references/core.md' },
          ]);

          const answers = question.options
            .filter(({ id }) => question.answerIds.includes(id))
            .map(({ text }) => text)
            .toSorted();

          const expectedAnswers = expectedAnswersByQuestion.get(question.id);
          expect.assert(expectedAnswers, `Unexpected question ID: ${question.id}`);
          expect(answers).toStrictEqual(expectedAnswers);
        });
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
        expect.assert(first, 'Missing preview question');

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
        expect.assert(first, 'Missing preview question');
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

        expect.assert(Result.isFailure(result));
        expect(result.failure.message).toContain('local-note root');
      }),
    );
  });

  it('builds reproducible multi-domain output and copies local sources', async () => {
    await run(
      Effect.gen(function* test() {
        const first = yield* outputDirectory;
        const second = yield* outputDirectory;
        const authoringPath = relativeTestPath('fixtures', 'multi-domain', 'authoring.json');
        yield* buildPack(authoringPath, first);
        yield* buildPack(authoringPath, second);

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
        questions.forEach((question) => {
          const optionIds = new Set(question.options.map((option) => option.id));
          expect(question.answerIds.length).toBeGreaterThan(0);
          expect(question.answerIds.every((id) => optionIds.has(id))).toBeTruthy();
        });
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

        pack.questions.forEach((question) => {
          expect(question.options).toHaveLength(4);
          expect(question.answerIds).toHaveLength(1);
          expect(
            question.options.some((option) => option.id === question.answerIds[0]),
          ).toBeTruthy();
          const [position] = question.answerIds;
          expect.assert(position !== undefined, 'Expected one correct answer ID');
        });

        const positions = ['a', 'b', 'c', 'd'].map(
          (position) =>
            pack.questions.filter((question) => question.answerIds.includes(position)).length,
        );

        expect(positions).toStrictEqual([50, 50, 50, 50]);
      }),
    );
  });

  it('accepts a one-domain pack weighted at 100 percent', async () => {
    await run(
      Effect.gen(function* test() {
        const output = yield* outputDirectory;
        yield* buildPack(testPath('fixtures', 'single-domain', 'authoring.json'), output);

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
          buildPack(testPath('fixtures', 'multi-domain', 'invalid.json'), output),
        );

        expect.assert(Result.isFailure(result));
        expect(result.failure.message).toMatch(/correct answer/iu);
        expect(
          yield* (yield* FileSystem.FileSystem).exists(`${output}/sample-pack.json`),
        ).toBeFalsy();
      }),
    );
  });
});
