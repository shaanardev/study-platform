import { Cause, Effect, Exit, FileSystem, Path, Result } from 'effect';
import { describe, expect, it } from 'vitest';
import { ProfileError } from '../src/verify/profile.js';
import { VerifyError, verifyPack } from '../src/verify/verify.js';
import { makePack, run, validPack, writeJson } from './verify-helpers.js';

describe('verifyPack', () => {
  it('preserves the profile and filesystem causes when the profile is missing', () =>
    run(
      Effect.gen(function* () {
        const { directory, packPath } = yield* makePack;
        const path = yield* Path.Path;
        const profilePath = path.join(directory, 'profile.json');

        const exit = yield* Effect.exit(verifyPack(packPath, profilePath));
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          const failure = Cause.findError(exit.cause);
          expect(Result.isSuccess(failure)).toBe(true);
          if (Result.isSuccess(failure)) {
            expect(failure.success).toBeInstanceOf(VerifyError);
            expect(failure.success.cause).toBeInstanceOf(ProfileError);
            const profileError = failure.success.cause as ProfileError;
            expect(profileError.cause).toBeDefined();
            expect(String(profileError.cause)).toContain(profilePath);
          }
        }
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

  it('rejects malformed profile data and validates compact baseline metadata', () =>
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
        yield* writeJson(path.join(directory, 'assets', 'objective-coverage.json'), {
          questionObjectives: { 'core-q1': ['C1'] },
          objectives: { C1: { title: 'Core objective' } },
        });
        yield* writeJson(profilePath, {
          objectives: {
            path: 'assets/objective-coverage.json',
            byDomain: { core: ['C1'] },
          },
          baselineAudit: {
            path: 'assets/baseline.json',
            total: 1,
            included: 1,
            excluded: 0,
            idPrefix: 'core-',
          },
        });
        yield* writeJson(path.join(directory, 'assets', 'baseline.json'), [
          {
            baselineId: 'baseline-q-001',
            number: 1,
            status: 'rewritten',
            packQuestionId: 'core-q1',
            domainId: 'core',
            objective: 'C1',
          },
        ]);
        const baseline = yield* verifyPack(baselinePackPath, profilePath);
        expect(baseline.profileReportPath).toBeDefined();

        const compactEntry = {
          baselineId: 'baseline-q-001',
          number: 1,
          status: 'rewritten',
          packQuestionId: 'core-q1',
          domainId: 'core',
          objective: 'C1',
        };
        const malformedAudits: Array<{
          audit: unknown;
          message: string;
          total?: number;
          included?: number;
          excluded?: number;
        }> = [
          {
            audit: [{ ...compactEntry, domainId: 'operations' }],
            message: 'baseline domain mismatch',
          },
          {
            audit: [{ ...compactEntry, objective: 'other' }],
            message: 'baseline objective mismatch',
          },
          {
            audit: [{ ...compactEntry, packQuestionId: 'missing-q' }],
            message: 'Missing baseline question missing-q',
          },
          {
            audit: [{ ...compactEntry, baselineId: 'baseline-q-002' }],
            message: 'Incomplete baseline audit',
          },
          {
            audit: [{ ...compactEntry, status: 'unknown' }],
            message: 'Baseline audit schema validation failed',
          },
          {
            audit: [{ ...compactEntry, reviewedAnswer: 'duplicated prose' }],
            message: 'Baseline audit schema validation failed',
          },
          {
            audit: [compactEntry, { ...compactEntry, baselineId: 'baseline-q-002', number: 2 }],
            message: 'Baseline audit mappings must be unique',
            total: 2,
          },
          {
            audit: [
              {
                baselineId: 'baseline-q-001',
                number: 1,
                status: 'excluded',
                reason: '   ',
              },
            ],
            message: 'Baseline exclusion without rationale',
            included: 0,
            excluded: 1,
          },
        ];
        for (const scenario of malformedAudits) {
          yield* writeJson(path.join(directory, 'assets', 'baseline.json'), scenario.audit);
          yield* writeJson(profilePath, {
            objectives: {
              path: 'assets/objective-coverage.json',
              byDomain: { core: ['C1'] },
            },
            baselineAudit: {
              path: 'assets/baseline.json',
              total: scenario.total ?? 1,
              included: scenario.included ?? scenario.total ?? 1,
              excluded: scenario.excluded ?? 0,
              idPrefix: 'core-',
            },
          });
          const invalidAudit = yield* Effect.result(verifyPack(baselinePackPath, profilePath));
          expect(Result.isFailure(invalidAudit)).toBe(true);
          if (Result.isFailure(invalidAudit))
            expect(invalidAudit.failure.message).toContain(scenario.message);
        }
      }),
    ));
});
