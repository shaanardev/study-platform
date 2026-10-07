import { Effect, FileSystem, Path, Result, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { BuiltExamPackSchema } from '../src/core/built-pack-schema.js';
import { verifyPack } from '../src/verify/verify.js';
import { makePack, run, validPack, writeJson } from './verify-helpers.js';

describe('verifyPack', () => {
  it('accepts a valid generic pack and a pack with one domain', () =>
    run(
      Effect.gen(function* () {
        const { directory, packPath } = yield* makePack;
        const result = yield* verifyPack(packPath);
        expect(result.pack.questions).toHaveLength(2);

        const singleDomainPack = {
          ...validPack,
          domains: [{ id: 'core', title: 'Core', weight: 100 }],
          questions: validPack.questions.map((question) => ({ ...question, domainId: 'core' })),
        };
        const singlePath = `${directory}/single-domain.json`;
        yield* writeJson(singlePath, singleDomainPack);
        expect((yield* verifyPack(singlePath)).pack.domains).toEqual(singleDomainPack.domains);
      }),
    ));

  it('reports malformed JSON and Effect Schema failures for required, excess, ID, source, and boundary fields', () =>
    run(
      Effect.gen(function* () {
        const { packPath } = yield* makePack;
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(packPath, '{');
        const malformedJson = yield* Effect.result(verifyPack(packPath));
        expect(Result.isFailure(malformedJson)).toBe(true);
        if (Result.isFailure(malformedJson))
          expect(malformedJson.failure.message).toContain('Unable to parse exam pack JSON');

        const cases: Array<{ value: unknown; message: string }> = [
          { value: { schemaVersion: 1 }, message: 'Exam pack schema validation failed' },
          {
            value: { ...validPack, unexpected: true },
            message: 'Exam pack schema validation failed',
          },
          {
            value: { ...validPack, exam: { ...validPack.exam, unexpected: true } },
            message: 'Exam pack schema validation failed',
          },
          {
            value: { ...validPack, pack: { ...validPack.pack, unexpected: true } },
            message: 'Exam pack schema validation failed',
          },
          {
            value: { ...validPack, questions: [{ ...validPack.questions[0], unexpected: true }] },
            message: 'Exam pack schema validation failed',
          },
          {
            value: {
              ...validPack,
              domains: [{ ...validPack.domains[0], id: 'bad id', weight: 100 }],
            },
            message: 'Exam pack schema validation failed',
          },
          {
            value: { ...validPack, domains: [{ ...validPack.domains[0], weight: 0 }] },
            message: 'Exam pack schema validation failed',
          },
          {
            value: { ...validPack, passingThreshold: 101 },
            message: 'Exam pack schema validation failed',
          },
          {
            value: {
              ...validPack,
              passingThreshold: 100,
              domains: [{ ...validPack.domains[0], weight: 100 }],
              questions: [
                {
                  ...validPack.questions[0],
                  sources: [{ path: '../source.md', label: 'Invalid' }],
                },
              ],
            },
            message: 'Exam pack schema validation failed',
          },
          {
            value: {
              ...validPack,
              passingThreshold: 0,
              domains: [{ ...validPack.domains[0], weight: 100 }],
              questions: [
                {
                  ...validPack.questions[0],
                  sources: [{ path: 'assets/source.md', label: 'Boundary' }],
                },
              ],
            },
            message: '',
          },
          {
            value: {
              ...validPack,
              questions: [
                {
                  ...validPack.questions[0],
                  sources: [
                    {
                      kind: 'legacy_note',
                      path: 'assets/source.md',
                      label: 'Streaming notes',
                      documentationUrls: ['http://docs.example.com/streaming'],
                    },
                  ],
                },
              ],
            },
            message: '',
          },
          { value: { ...validPack, passingThreshold: 100 }, message: '' },
        ];
        for (const scenario of cases) {
          yield* writeJson(packPath, scenario.value);
          const result = yield* Effect.result(verifyPack(packPath));
          expect(Result.isFailure(result)).toBe(scenario.message.length > 0);
          if (Result.isFailure(result) && scenario.message)
            expect(result.failure.message).toContain(scenario.message);
        }
      }),
    ));

  it('verifies the migrated v1.2.1 artifact and retains citation metadata', () =>
    run(
      Effect.gen(function* () {
        const { packPath } = yield* makePack;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const migratedArtifact = yield* path
          .fromFileUrl(
            new URL('../../packs/incoming/databricks-dea-may-2026-v1.2.1.json', import.meta.url),
          )
          .pipe(Effect.flatMap((artifactPath) => fs.readFileString(artifactPath)));
        const input = yield* Schema.decodeEffect(Schema.fromJsonString(BuiltExamPackSchema))(
          migratedArtifact,
        );
        const portablePack = {
          ...input,
          questions: input.questions.map((question) => ({
            ...question,
            sources: question.sources.map((source) => ({ ...source, path: 'assets/source.md' })),
          })),
        };
        yield* writeJson(packPath, portablePack);

        const result = yield* verifyPack(packPath);

        expect(result.pack.questions).toHaveLength(200);
        expect(result.pack.questions[0]?.sources[0]).toMatchObject({
          kind: 'academy_note',
          section: expect.any(String),
          documentationUrls: expect.any(Array),
        });
      }),
    ));
});
