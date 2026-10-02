import { NodeServices } from '@effect/platform-node';
import { Console, Effect, FileSystem, Path, Result, Schema } from 'effect';
import { Command } from 'effect/cli';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyCommand } from '../src/verify/command.js';
import { verifyPack } from '../src/verify/verify.js';

const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(Effect.provide(effect, NodeServices.layer));

const temporaryDirectories: string[] = [];

const validPack = {
  schemaVersion: 1,
  exam: { id: 'generic-exam', title: 'Generic Exam', version: '1' },
  pack: { id: 'generic-pack', title: 'Generic Pack', version: '1', synthetic: true },
  domains: [
    { id: 'core', title: 'Core', weight: 60 },
    { id: 'operations', title: 'Operations', weight: 40 },
  ],
  questions: [
    {
      id: 'core-q1',
      type: 'single_choice',
      domainId: 'core',
      prompt: 'Choose the valid result.',
      options: [
        { id: 'yes', text: 'Yes' },
        { id: 'no', text: 'No' },
      ],
      answerIds: ['yes'],
      explanation: 'Yes is the valid result.',
      sources: [{ path: 'assets/source.md', label: 'Generic source' }],
    },
    {
      id: 'operations-q1',
      type: 'single_choice',
      domainId: 'operations',
      prompt: 'Choose the safe operation.',
      options: [
        { id: 'safe', text: 'Safe' },
        { id: 'unsafe', text: 'Unsafe' },
      ],
      answerIds: ['safe'],
      explanation: 'Safe is the correct operation.',
      sources: [{ path: 'assets/source.md', label: 'Generic source' }],
    },
  ],
} as const;

const cloneWithMutableSources = () => ({
  ...validPack,
  questions: validPack.questions.map((question) => ({
    ...question,
    sources: question.sources.map((source) => ({
      path: String(source.path),
      label: String(source.label),
    })),
  })),
});

const makePack = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* fs.makeTempDirectory({ prefix: 'pack-cli-verify-test-' });
  temporaryDirectories.push(directory);
  yield* fs.makeDirectory(path.join(directory, 'assets'));
  yield* fs.writeFileString(
    path.join(directory, 'assets', 'source.md'),
    'Generic source material.',
  );
  const packPath = path.join(directory, 'pack.json');
  yield* fs.writeFileString(
    packPath,
    yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(validPack),
  );
  return { directory, packPath };
});

const writeJson = (filename: string, value: unknown) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(
      filename,
      yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(value),
    );
  });

afterEach(() =>
  run(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* Effect.forEach(temporaryDirectories.splice(0), (directory) =>
        fs.remove(directory, { recursive: true, force: true }),
      );
    }),
  ),
);

describe('verifyPack', () => {
  it('prints the CLI structural and source-check result', () =>
    run(
      Effect.gen(function* () {
        const { packPath } = yield* makePack;
        const messages: unknown[] = [];
        const testConsole: Console.Console = new Proxy(console, {
          get(target, property, receiver) {
            return property === 'log'
              ? (...values: ReadonlyArray<unknown>) => {
                  messages.push(...values);
                }
              : (Reflect.get(target, property, receiver) as unknown);
          },
        });
        yield* Command.runWith(verifyCommand, { version: '0.0.0' })([packPath]).pipe(
          Effect.provideService(Console.Console, testConsole),
        );
        expect(messages).toEqual([
          'PASS: 2 questions; structural checks and citation checks passed.',
        ]);
      }),
    ));

  it('prints profile-check and report output when the CLI receives a profile', () =>
    run(
      Effect.gen(function* () {
        const { directory, packPath } = yield* makePack;
        const path = yield* Path.Path;
        const profilePath = path.join(directory, 'profile.json');
        yield* writeJson(profilePath, {});
        const messages: unknown[] = [];
        const testConsole: Console.Console = new Proxy(console, {
          get(target, property, receiver) {
            return property === 'log'
              ? (...values: ReadonlyArray<unknown>) => {
                  messages.push(...values);
                }
              : (Reflect.get(target, property, receiver) as unknown);
          },
        });
        yield* Command.runWith(verifyCommand, { version: '0.0.0' })([
          packPath,
          '--profile',
          profilePath,
        ]).pipe(Effect.provideService(Console.Console, testConsole));
        expect(messages).toEqual([
          'PASS: 2 questions; structural checks and citation checks passed; profile checks passed.',
          `Verification report: ${path.join(directory, 'assets', 'verification-report.json')}`,
        ]);
      }),
    ));

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

  it('writes an optional profile report and rejects a domain count mismatch', () =>
    run(
      Effect.gen(function* () {
        const { directory, packPath } = yield* makePack;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const profilePath = path.join(directory, 'profile.json');
        yield* writeJson(profilePath, {
          domains: { core: { count: 1, weight: 60 }, operations: { count: 1, weight: 40 } },
        });
        const verified = yield* verifyPack(packPath, profilePath);
        const reportPath = verified.profileReportPath;
        expect(reportPath).toBe(path.join(directory, 'assets', 'verification-report.json'));
        if (!reportPath) throw new Error('Expected a verification report path');
        expect(yield* fs.readFileString(reportPath)).toContain('"status": "passed"');

        yield* writeJson(profilePath, {
          domains: { core: { count: 3, weight: 60 }, operations: { count: 1, weight: 40 } },
        });
        const mismatch = yield* Effect.result(verifyPack(packPath, profilePath));
        expect(Result.isFailure(mismatch)).toBe(true);
        if (Result.isFailure(mismatch))
          expect(mismatch.failure.message).toContain('expected 3 questions, got 1');
      }),
    ));

  it('rejects malformed profile data and validates the isolated legacy answer baseline', () =>
    run(
      Effect.gen(function* () {
        const { directory, packPath } = yield* makePack;
        const path = yield* Path.Path;
        const profilePath = path.join(directory, 'profile.json');
        yield* writeJson(profilePath, { domains: { core: { count: 'one', weight: 60 } } });
        const malformed = yield* Effect.result(verifyPack(packPath, profilePath));
        expect(Result.isFailure(malformed)).toBe(true);
        if (Result.isFailure(malformed))
          expect(malformed.failure.message).toContain('Profile schema validation failed');

        const baselinePack = {
          ...validPack,
          domains: [{ id: 'core', title: 'Core', weight: 100 }],
          questions: [
            {
              ...validPack.questions[0],
              options: [
                { id: 'pipeline', text: 'Lakeflow Spark Declarative Pipelines' },
                { id: 'other', text: 'Other' },
              ],
              answerIds: ['pipeline'],
            },
          ],
        };
        const baselinePackPath = path.join(directory, 'baseline.json');
        yield* writeJson(baselinePackPath, baselinePack);
        yield* writeJson(profilePath, {
          baselineAudit: {
            path: 'assets/baseline.json',
            total: 1,
            included: 1,
            excluded: 0,
            idPrefix: 'core-',
          },
        });
        yield* writeJson(path.join(directory, 'assets', 'baseline.json'), [
          { number: 1, status: 'included', packQuestionId: 'core-q1', reviewedAnswer: 'DLT' },
        ]);
        const baseline = yield* verifyPack(baselinePackPath, profilePath);
        expect(baseline.profileReportPath).toBeDefined();
      }),
    ));

  it('rejects missing sources and source paths that escape the pack folder', () =>
    run(
      Effect.gen(function* () {
        const { directory, packPath } = yield* makePack;
        const missing = cloneWithMutableSources();
        const missingSource = missing.questions[0]?.sources[0];
        if (!missingSource) throw new Error('Expected a source in the missing source fixture');
        missingSource.path = 'assets/missing.md';
        yield* writeJson(packPath, missing);
        const missingResult = yield* Effect.result(verifyPack(packPath));
        expect(Result.isFailure(missingResult)).toBe(true);
        if (Result.isFailure(missingResult))
          expect(missingResult.failure.message).toContain('missing source assets/missing.md');

        const escaped = cloneWithMutableSources();
        const escapedSource = escaped.questions[0]?.sources[0];
        if (!escapedSource) throw new Error('Expected a source in the escaped source fixture');
        escapedSource.path = '../outside.md';
        yield* writeJson(packPath, escaped);
        const escapedResult = yield* Effect.result(verifyPack(packPath));
        expect(Result.isFailure(escapedResult)).toBe(true);
        if (Result.isFailure(escapedResult))
          expect(escapedResult.failure.message).toContain('Exam pack schema validation failed');
        expect(directory).toBeDefined();
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
});
