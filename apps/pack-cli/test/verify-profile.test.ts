import { Cause, Effect, Exit, FileSystem, Path, Result } from 'effect';
import { describe, expect, it } from 'vitest';

import { ProfileError } from '../src/verify/profile.js';
import { VerifyError, verifyPack } from '../src/verify/verify.js';
import { makePack, run, validPack, writeJson } from './verify-helpers.js';

describe(verifyPack, () => {
  it('preserves the profile and filesystem causes when the profile is missing', async () => {
    await run(
      Effect.gen(function* testEffect() {
        const { directory, packPath } = yield* makePack;
        const path = yield* Path.Path;
        const profilePath = path.join(directory, 'profile.json');

        const exit = yield* Effect.exit(verifyPack(packPath, profilePath));
        expect(Exit.isFailure(exit)).toBeTruthy();
        if (Exit.isFailure(exit)) {
          const failure = Cause.findError(exit.cause);
          expect(Result.isSuccess(failure)).toBeTruthy();
          if (Result.isSuccess(failure)) {
            expect(failure.success).toBeInstanceOf(VerifyError);
            const profileError = failure.success.cause;
            expect(profileError instanceof ProfileError).toBeTruthy();
            if (!(profileError instanceof ProfileError)) {
              throw new Error('Expected a profile error');
            }
            expect(profileError.cause).toBeDefined();
            expect(String(profileError.cause)).toContain(profilePath);
          }
        }
      }),
    );
  });

  it('writes an optional profile report and rejects a domain count mismatch', async () => {
    await run(
      Effect.gen(function* testEffect() {
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
        if (reportPath === undefined || reportPath.length === 0) {
          throw new Error('Expected a verification report path');
        }
        expect(yield* fs.readFileString(reportPath)).toContain('"status": "passed"');

        yield* writeJson(profilePath, {
          domains: { core: { count: 3, weight: 60 }, operations: { count: 1, weight: 40 } },
        });
        const mismatch = yield* Effect.result(verifyPack(packPath, profilePath));
        expect(Result.isFailure(mismatch)).toBeTruthy();
        if (Result.isFailure(mismatch)) {
          expect(mismatch.failure.message).toContain('expected 3 questions, got 1');
        }
      }),
    );
  });

  it('rejects profile report and objective mapping symlinks that escape the pack folder', async () => {
    await run(
      Effect.gen(function* testEffect() {
        const { directory, packPath } = yield* makePack;
        const outside = yield* makePack;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const profilePath = path.join(directory, 'profile.json');
        const externalReportPath = path.join(outside.directory, 'report.json');
        const reportPath = path.join(directory, 'assets', 'verification-report.json');
        yield* fs.writeFileString(externalReportPath, 'leave this file unchanged');
        yield* fs.symlink(externalReportPath, reportPath);
        yield* writeJson(profilePath, {});

        const reportResult = yield* Effect.result(verifyPack(packPath, profilePath));
        expect(Result.isFailure(reportResult)).toBeTruthy();
        if (Result.isFailure(reportResult)) {
          expect(reportResult.failure.message).toContain('Verification report escapes pack folder');
        }
        expect(yield* fs.readFileString(externalReportPath)).toBe('leave this file unchanged');

        const externalCoveragePath = path.join(outside.directory, 'coverage.json');
        const coveragePath = path.join(directory, 'assets', 'objective-coverage.json');
        yield* writeJson(externalCoveragePath, {
          objectives: { C1: { title: 'Core' }, O1: { title: 'Operations' } },
          questionObjectives: { 'core-q1': ['C1'], 'operations-q1': ['O1'] },
        });
        yield* fs.remove(reportPath);
        yield* fs.symlink(externalCoveragePath, coveragePath);
        yield* writeJson(profilePath, {
          objectives: {
            byDomain: { core: ['C1'], operations: ['O1'] },
            path: 'assets/objective-coverage.json',
          },
        });

        const readResult = yield* Effect.result(verifyPack(packPath, profilePath));
        expect(Result.isFailure(readResult)).toBeTruthy();
        if (Result.isFailure(readResult)) {
          expect(readResult.failure.message).toContain('Objective mapping escapes pack folder');
        }
      }),
    );
  });

  it('allows report paths through symlinked directories that remain inside the pack folder', async () => {
    await run(
      Effect.gen(function* testEffect() {
        const { directory, packPath } = yield* makePack;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const profilePath = path.join(directory, 'profile.json');
        const reportsDirectory = path.join(directory, 'assets', 'reports');
        const reportLink = path.join(directory, 'assets', 'report-link');
        yield* fs.makeDirectory(reportsDirectory);
        yield* fs.symlink(reportsDirectory, reportLink);
        yield* writeJson(profilePath, {
          reportPath: 'assets/report-link/verification-report.json',
        });

        const verified = yield* verifyPack(packPath, profilePath);
        expect(verified.profileReportPath).toBe(
          path.join(reportsDirectory, 'verification-report.json'),
        );
        expect(
          yield* fs.exists(path.join(reportsDirectory, 'verification-report.json')),
        ).toBeTruthy();
      }),
    );
  });

  it('rejects malformed profile data and validates compact baseline metadata', async () => {
    await run(
      Effect.gen(function* testEffect() {
        const { directory, packPath } = yield* makePack;
        const path = yield* Path.Path;
        const profilePath = path.join(directory, 'profile.json');
        yield* writeJson(profilePath, { domains: { core: { count: 'one', weight: 60 } } });
        const malformed = yield* Effect.result(verifyPack(packPath, profilePath));
        expect(Result.isFailure(malformed)).toBeTruthy();
        if (Result.isFailure(malformed)) {
          expect(malformed.failure.message).toContain('Profile schema validation failed');
        }

        const baselinePack = {
          ...validPack,
          domains: [{ id: 'core', title: 'Core', weight: 100 }],
          questions: [
            {
              ...validPack.questions[0],
              answerIds: ['pipeline'],
              options: [
                { id: 'pipeline', text: 'Lakeflow Spark Declarative Pipelines' },
                { id: 'other', text: 'Other' },
              ],
            },
          ],
        };
        const baselinePackPath = path.join(directory, 'baseline.json');
        yield* writeJson(baselinePackPath, baselinePack);
        yield* writeJson(path.join(directory, 'assets', 'objective-coverage.json'), {
          objectives: { C1: { title: 'Core objective' } },
          questionObjectives: { 'core-q1': ['C1'] },
        });
        yield* writeJson(profilePath, {
          baselineAudit: {
            excluded: 0,
            idPrefix: 'core-',
            included: 1,
            path: 'assets/baseline.json',
            total: 1,
          },
          objectives: {
            byDomain: { core: ['C1'] },
            path: 'assets/objective-coverage.json',
          },
        });
        yield* writeJson(path.join(directory, 'assets', 'baseline.json'), [
          {
            baselineId: 'baseline-q-001',
            domainId: 'core',
            number: 1,
            objective: 'C1',
            packQuestionId: 'core-q1',
            status: 'rewritten',
          },
        ]);
        const baseline = yield* verifyPack(baselinePackPath, profilePath);
        expect(baseline.profileReportPath).toBeDefined();

        const compactEntry = {
          baselineId: 'baseline-q-001',
          domainId: 'core',
          number: 1,
          objective: 'C1',
          packQuestionId: 'core-q1',
          status: 'rewritten',
        };
        const malformedAudits: {
          audit: unknown;
          message: string;
          total?: number;
          included?: number;
          excluded?: number;
        }[] = [
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
                reason: '   ',
                status: 'excluded',
              },
            ],
            excluded: 1,
            included: 0,
            message: 'Baseline exclusion without rationale',
          },
        ];
        for (const scenario of malformedAudits) {
          yield* writeJson(path.join(directory, 'assets', 'baseline.json'), scenario.audit);
          yield* writeJson(profilePath, {
            baselineAudit: {
              excluded: scenario.excluded ?? 0,
              idPrefix: 'core-',
              included: scenario.included ?? scenario.total ?? 1,
              path: 'assets/baseline.json',
              total: scenario.total ?? 1,
            },
            objectives: {
              byDomain: { core: ['C1'] },
              path: 'assets/objective-coverage.json',
            },
          });
          const invalidAudit = yield* Effect.result(verifyPack(baselinePackPath, profilePath));
          expect(Result.isFailure(invalidAudit)).toBeTruthy();
          if (Result.isFailure(invalidAudit)) {
            expect(invalidAudit.failure.message).toContain(scenario.message);
          }
        }
      }),
    );
  });
});
