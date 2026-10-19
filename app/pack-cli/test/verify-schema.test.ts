import { Effect, FileSystem, Path, Result, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { BuiltExamPackSchema } from '../src/core/built-pack-schema.js';
import { verifyPack } from '../src/verify/verify.js';
import { validPack } from './pack-fixture.js';
import { makePack, run, writeJson } from './verify-helpers.js';

describe(verifyPack, () => {
  it('accepts a valid generic pack and a pack with one domain', async () => {
    await run(
      Effect.gen(function* testEffect() {
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
        expect((yield* verifyPack(singlePath)).pack.domains).toStrictEqual(
          singleDomainPack.domains,
        );
      }),
    );
  });

  it('reports malformed JSON and Effect Schema failures for required, excess, ID, source, and boundary fields', async () => {
    await run(
      Effect.gen(function* testEffect() {
        const { packPath } = yield* makePack;
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(packPath, '{');
        const malformedJson = yield* Effect.result(verifyPack(packPath));
        expect.assert(Result.isFailure(malformedJson));
        expect(malformedJson.failure.message).toContain('Unable to parse exam pack JSON');

        const cases = [
          { message: 'Exam pack schema validation failed', value: { schemaVersion: 1 } },
          {
            message: 'Exam pack schema validation failed',
            value: { ...validPack, unexpected: true },
          },
          {
            message: 'Exam pack schema validation failed',
            value: { ...validPack, exam: { ...validPack.exam, unexpected: true } },
          },
          {
            message: 'Exam pack schema validation failed',
            value: { ...validPack, pack: { ...validPack.pack, unexpected: true } },
          },
          {
            message: 'Exam pack schema validation failed',
            value: { ...validPack, questions: [{ ...validPack.questions[0], unexpected: true }] },
          },
          {
            message: 'Exam pack schema validation failed',
            value: {
              ...validPack,
              domains: [{ ...validPack.domains[0], id: 'bad id', weight: 100 }],
            },
          },
          {
            message: 'Exam pack schema validation failed',
            value: { ...validPack, domains: [{ ...validPack.domains[0], weight: 0 }] },
          },
          {
            message: 'Exam pack schema validation failed',
            value: { ...validPack, passingThreshold: 101 },
          },
          {
            message: 'Exam pack schema validation failed',
            value: {
              ...validPack,
              domains: [{ ...validPack.domains[0], weight: 100 }],
              passingThreshold: 100,
              questions: [
                {
                  ...validPack.questions[0],
                  sources: [{ label: 'Invalid', path: '../source.md' }],
                },
              ],
            },
          },
        ];

        const validBoundaryCases = [
          {
            ...validPack,
            domains: [{ ...validPack.domains[0], weight: 100 }],
            passingThreshold: 0,
            questions: [
              {
                ...validPack.questions[0],
                sources: [{ label: 'Boundary', path: 'assets/source.md' }],
              },
            ],
          },
          {
            ...validPack,
            questions: [
              {
                ...validPack.questions[0],
                sources: [
                  {
                    documentationUrls: ['http://docs.example.com/streaming'],
                    kind: 'legacy_note',
                    label: 'Streaming notes',
                    path: 'assets/source.md',
                  },
                ],
              },
            ],
          },
          { ...validPack, passingThreshold: 100 },
        ];

        // oxlint-disable-next-line unicorn/no-array-method-this-argument -- Effect.forEach's iterable is not a thisArg.
        yield* Effect.forEach(cases, (scenario) =>
          Effect.gen(function* verifyInvalidCase() {
            yield* writeJson(packPath, scenario.value);
            const result = yield* Effect.result(verifyPack(packPath));
            expect.assert(Result.isFailure(result));
            expect(result.failure.message).toContain(scenario.message);
          }),
        );
        // oxlint-disable-next-line unicorn/no-array-method-this-argument -- Effect.forEach's iterable is not a thisArg.
        yield* Effect.forEach(validBoundaryCases, (value) =>
          Effect.gen(function* verifyValidBoundaryCase() {
            yield* writeJson(packPath, value);
            const result = yield* Effect.result(verifyPack(packPath));
            expect.assert(Result.isSuccess(result));
          }),
        );
      }),
    );
  });

  it('verifies the migrated v1.2.1 artifact and retains citation metadata', async () => {
    await run(
      Effect.gen(function* testEffect() {
        const { packPath } = yield* makePack;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        const migratedArtifact = yield* path
          .fromFileUrl(
            new URL('../../../packs/incoming/databricks-dea-may-2026-v1.2.1.json', import.meta.url),
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
        const source = result.pack.questions[0]?.sources[0];
        expect(source?.kind).toBe('academy_note');
        expect(source?.section).toBeTypeOf('string');
        expect(Array.isArray(source?.documentationUrls)).toBeTruthy();
      }),
    );
  });
});
