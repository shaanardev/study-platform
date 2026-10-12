import { Crypto, Data, Effect, FileSystem, Path, Result, Schema } from 'effect';
import { Hex } from 'effect/encoding';

import type { PackForVerification } from '../core/built-pack-schema.js';
import {
  type BaselineEntry,
  BaselineEntrySchema,
  CoverageSchema,
  type ExcludedBaselineEntry,
  type IncludedBaselineEntry,
  ProfileSchema,
  ProvenanceSchema,
} from './profile-schema.js';

export class ProfileError extends Data.TaggedError('ProfileError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const resolveWithin = Effect.fn(function* (directory: string, filename: string, label: string) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const actual = path.resolve(directory, filename);
  const fromDirectory = path.relative(directory, actual);
  if (
    fromDirectory === '..' ||
    fromDirectory.startsWith(`..${path.sep}`) ||
    path.isAbsolute(fromDirectory)
  )
    return yield* new ProfileError({ message: `${label} escapes pack folder (${filename})` });

  const realDirectory = yield* fs.realPath(directory).pipe(
    Effect.mapError(
      (cause) =>
        new ProfileError({
          message: `Unable to resolve pack folder for ${label}: ${String(cause)}`,
          cause,
        }),
    ),
  );
  const realActual = yield* fs.realPath(actual).pipe(Effect.result);
  let resolved: string | undefined;
  if (Result.isSuccess(realActual)) {
    resolved = realActual.success;
  } else {
    // A report file may not exist yet. Resolve its nearest existing ancestor so
    // symlinked directories are still checked before the write is attempted.
    let ancestor = actual;
    const suffix: string[] = [];
    while (resolved === undefined) {
      const realAncestor = yield* fs.realPath(ancestor).pipe(Effect.result);
      if (Result.isSuccess(realAncestor)) {
        resolved = path.resolve(realAncestor.success, ...suffix.reverse());
        break;
      }
      const link = yield* fs.readLink(ancestor).pipe(Effect.result);
      if (Result.isSuccess(link))
        return yield* new ProfileError({
          message: `${label} escapes pack folder through symbolic link (${filename})`,
        });
      const parent = path.dirname(ancestor);
      if (parent === ancestor)
        return yield* new ProfileError({
          message: `${label} cannot be resolved within pack folder (${filename})`,
        });
      suffix.push(path.basename(ancestor));
      ancestor = parent;
    }
  }

  const realRelative = path.relative(realDirectory, resolved);
  if (
    realRelative === '..' ||
    realRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(realRelative)
  )
    return yield* new ProfileError({ message: `${label} escapes pack folder (${filename})` });
  return resolved;
});

const readText = Effect.fn(function* (filename: string, label: string) {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs
    .readFileString(filename)
    .pipe(
      Effect.mapError(
        (error) => new ProfileError({ message: `${label}: ${String(error)}`, cause: error }),
      ),
    );
});

const readJson = Effect.fn(function* <A>(
  filename: string,
  schema: Schema.Codec<A, unknown, never, never>,
  label: string,
) {
  const text = yield* readText(filename, `Unable to read ${label}`);
  return yield* Schema.decodeEffect(Schema.fromJsonString(schema), { onExcessProperty: 'error' })(
    text,
  ).pipe(
    Effect.mapError(
      (error) =>
        new ProfileError({
          message: `${label} schema validation failed: ${String(error)}`,
          cause: error,
        }),
    ),
  );
});

const sha256 = Effect.fn(function* (bytes: Uint8Array) {
  const crypto = yield* Crypto.Crypto;
  const digest = yield* crypto.digest('SHA-256', bytes).pipe(
    Effect.mapError(
      (error) =>
        new ProfileError({
          message: `Unable to compute SHA-256: ${String(error)}`,
          cause: error,
        }),
    ),
  );
  return Hex.encode(digest);
});

interface ProfileReport extends Record<string, unknown> {
  readonly status: 'passed';
  readonly packSha256: string;
  readonly questionCount: number;
  exactDomainWeights?: string;
  domains?: Array<Record<string, unknown>>;
  objectivesCovered?: number;
  objectiveCounts?: Record<string, number>;
  questionRules?: string;
  answerPositions?: Record<string, number>;
  baselineAuditCount?: number;
  baselineAdapted?: number;
  newlyAuthored?: number;
  sourceFilesResolved?: number;
  materialFilesVerified?: number;
}

export const verifyProfile = Effect.fn('verifyProfile')(
  (packPath: string, pack: PackForVerification, profilePath: string) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;
      const absolutePackPath = path.resolve(packPath);
      const base = path.dirname(absolutePackPath);
      const profile = yield* readJson(path.resolve(profilePath), ProfileSchema, 'Profile');
      const packBytes = yield* fs.readFile(absolutePackPath).pipe(
        Effect.mapError(
          (error) =>
            new ProfileError({
              message: `Unable to read exam pack for profile: ${String(error)}`,
              cause: error,
            }),
        ),
      );
      const report: ProfileReport = {
        status: 'passed',
        packSha256: yield* sha256(packBytes),
        questionCount: pack.questions.length,
      };

      if (profile.domains) {
        const actualIds = new Set(pack.domains.map(({ id }) => id));
        if (
          !(
            actualIds.size === Object.keys(profile.domains).length &&
            Object.keys(profile.domains).every((id) => actualIds.has(id))
          )
        )
          return yield* new ProfileError({ message: 'Profile domain set does not match pack' });
        const questionCounts = pack.questions.reduce((counts, { domainId }) => {
          counts.set(domainId, (counts.get(domainId) ?? 0) + 1);
          return counts;
        }, new Map<string, number>());
        const domains = [];
        for (const [id, expected] of Object.entries(profile.domains)) {
          const domain = pack.domains.find((item) => item.id === id);
          if (!domain)
            return yield* new ProfileError({ message: `${id}: domain missing from pack` });
          const actualCount = questionCounts.get(id) ?? 0;
          if (!(domain.weight === expected.weight))
            return yield* new ProfileError({
              message: `${id}: expected weight ${expected.weight}, got ${domain.weight}`,
            });
          if (!(actualCount === expected.count))
            return yield* new ProfileError({
              message: `${id}: expected ${expected.count} questions, got ${actualCount}`,
            });
          domains.push({
            id,
            title: domain.title,
            guidePercent: expected.weight,
            questionCount: actualCount,
            actualPercent: (actualCount * 100) / pack.questions.length,
            differencePercentagePoints:
              (actualCount * 100) / pack.questions.length - expected.weight,
          });
        }
        report.exactDomainWeights = 'passed';
        report.domains = domains;
      }

      let coverageQuestions: Record<string, ReadonlyArray<string>> | undefined;
      if (profile.objectives) {
        const coveragePath = yield* resolveWithin(
          base,
          profile.objectives.path,
          'Objective mapping',
        );
        const coverage = yield* readJson(coveragePath, CoverageSchema, 'Objective mapping');
        const coverageQuestionObjectives = coverage.questionObjectives;
        if (
          !(
            Object.keys(coverageQuestionObjectives).length === pack.questions.length &&
            pack.questions.every(({ id }) => Object.hasOwn(coverageQuestionObjectives, id))
          )
        )
          return yield* new ProfileError({
            message: 'Objective mapping does not exactly match questions',
          });
        const expectedObjectives = new Set(Object.values(profile.objectives.byDomain).flat());
        if (
          !(
            Object.keys(coverage.objectives).length === expectedObjectives.size &&
            Object.keys(coverage.objectives).every((id) => expectedObjectives.has(id))
          )
        )
          return yield* new ProfileError({ message: 'Objective list does not match profile' });
        const observed = new Set<string>();
        for (const question of pack.questions) {
          const mapped = coverageQuestionObjectives[question.id];
          const permitted = profile.objectives.byDomain[question.domainId];
          if (
            !mapped ||
            mapped.length === 0 ||
            new Set(mapped).size !== mapped.length ||
            !mapped.every((id) => permitted?.includes(id))
          )
            return yield* new ProfileError({
              message: `${question.id}: objective/domain mismatch`,
            });
          mapped.forEach((id) => {
            observed.add(id);
          });
        }
        if (
          !(
            observed.size === expectedObjectives.size &&
            [...expectedObjectives].every((id) => observed.has(id))
          )
        )
          return yield* new ProfileError({
            message: 'At least one profile objective has no question',
          });
        report.objectivesCovered = observed.size;
        const objectiveCounts = pack.questions
          .flatMap(({ id }) => coverageQuestionObjectives[id] ?? [])
          .reduce((counts, objective) => {
            counts.set(objective, (counts.get(objective) ?? 0) + 1);
            return counts;
          }, new Map<string, number>());
        report.objectiveCounts = Object.fromEntries(
          [...objectiveCounts].sort(([left], [right]) => left.localeCompare(right)),
        );
        coverageQuestions = coverageQuestionObjectives;
      }

      if (profile.questionRules) {
        const rules = profile.questionRules;
        for (const question of pack.questions) {
          if (rules.type)
            if (!(question.type === rules.type))
              return yield* new ProfileError({ message: `${question.id}: expected ${rules.type}` });
          if (rules.optionCount !== undefined)
            if (!(question.options.length === rules.optionCount))
              return yield* new ProfileError({
                message: `${question.id}: expected ${rules.optionCount} options`,
              });
          if (rules.explanationMinWords !== undefined)
            if (
              !(
                question.explanation.trim().split(/\s+/).filter(Boolean).length >=
                rules.explanationMinWords
              )
            )
              return yield* new ProfileError({ message: `${question.id}: explanation too short` });
          if (rules.requiredSourcePathFragment) {
            const requiredSourcePathFragment = rules.requiredSourcePathFragment;
            if (
              !question.sources.some(({ path: sourcePath }) =>
                sourcePath.includes(requiredSourcePathFragment),
              )
            )
              return yield* new ProfileError({
                message: `${question.id}: missing required source`,
              });
          }
        }
        report.questionRules = 'passed';
      }

      if (profile.answerPositions) {
        const answerLetters: string[] = [];
        for (const question of pack.questions) {
          const answer = question.answerIds[0];
          if (!(question.answerIds.length === 1 && answer))
            return yield* new ProfileError({
              message: `${question.id}: answer position requires one correct answer`,
            });
          const optionIndex = question.options.findIndex(({ id }) => id === answer);
          if (!(optionIndex >= 0))
            return yield* new ProfileError({
              message: `${question.id}: correct answer is not an option`,
            });
          answerLetters.push(String.fromCharCode(97 + optionIndex));
        }
        const positions = answerLetters.reduce((counts, position) => {
          counts.set(position, (counts.get(position) ?? 0) + 1);
          return counts;
        }, new Map<string, number>());
        for (const [position, expected] of Object.entries(profile.answerPositions))
          if (!((positions.get(position) ?? 0) === expected))
            return yield* new ProfileError({
              message: `Answer position ${position}: expected ${expected}, got ${positions.get(position) ?? 0}`,
            });
        if (!(positions.size === Object.keys(profile.answerPositions).length))
          return yield* new ProfileError({ message: 'Unexpected correct answer position' });
        report.answerPositions = Object.fromEntries(
          [...positions].sort(([left], [right]) => left.localeCompare(right)),
        );
      }

      if (profile.baselineAudit) {
        const audit = profile.baselineAudit;
        if (!(audit.total === audit.included + audit.excluded))
          return yield* new ProfileError({ message: 'Profile baselineAudit totals must add up' });
        const auditPath = yield* resolveWithin(base, audit.path, 'Baseline audit');
        const review: readonly BaselineEntry[] = yield* readJson(
          auditPath,
          Schema.Array(BaselineEntrySchema),
          'Baseline audit',
        );
        if (
          !(
            review.length === audit.total &&
            new Set(review.map(({ number }) => number)).size === review.length &&
            review.every(
              (item, index) =>
                item.number === index + 1 &&
                Number(item.baselineId.match(/(\d+)$/)?.[1]) === item.number,
            ) &&
            new Set(review.map(({ baselineId }) => baselineId)).size === review.length
          )
        )
          return yield* new ProfileError({ message: 'Incomplete baseline audit' });
        const included = review.filter(
          (item): item is IncludedBaselineEntry => item.status !== 'excluded',
        );
        const excluded = review.filter(
          (item): item is ExcludedBaselineEntry => item.status === 'excluded',
        );
        if (!(included.length === audit.included && excluded.length === audit.excluded))
          return yield* new ProfileError({
            message: 'Baseline audit disposition totals do not match profile',
          });
        if (!excluded.every(({ reason }) => reason.trim().length > 0))
          return yield* new ProfileError({ message: 'Baseline exclusion without rationale' });
        const prefix = audit.idPrefix ?? '';
        const baselineIds = new Set(
          pack.questions
            .map(({ id }) => id)
            .filter((id) => prefix.length === 0 || id.startsWith(prefix)),
        );
        if (
          !(new Set(included.map(({ packQuestionId }) => packQuestionId)).size === included.length)
        )
          return yield* new ProfileError({ message: 'Baseline audit mappings must be unique' });
        const byId = new Map(pack.questions.map((question) => [question.id, question]));
        for (const item of included) {
          const question = byId.get(item.packQuestionId);
          if (!question)
            return yield* new ProfileError({
              message: `Missing baseline question ${item.packQuestionId}`,
            });
          if (!(question.domainId === item.domainId))
            return yield* new ProfileError({ message: `${question.id}: baseline domain mismatch` });
          if (coverageQuestions)
            if (!(coverageQuestions[question.id]?.includes(item.objective) === true))
              return yield* new ProfileError({
                message: `${question.id}: baseline objective mismatch`,
              });
        }
        if (
          !(
            included.length === baselineIds.size &&
            [...baselineIds].every((id) => included.some((item) => item.packQuestionId === id))
          )
        )
          return yield* new ProfileError({ message: 'Baseline audit and pack differ' });
        report.baselineAuditCount = review.length;
        report.baselineAdapted = included.length;
        report.newlyAuthored = pack.questions.length - included.length;
      }

      if (profile.sourceIntegrity) {
        const provenancePath = yield* resolveWithin(
          base,
          profile.sourceIntegrity.provenancePath,
          'Source provenance',
        );
        const provenance = yield* readJson(provenancePath, ProvenanceSchema, 'Source provenance');
        const provenanceDirectory = path.dirname(provenancePath);
        const materialsDirectory = path.resolve(provenanceDirectory, 'materials');
        for (const item of provenance.materialInventory) {
          const materialPath = yield* resolveWithin(
            materialsDirectory,
            item.path,
            'Material snapshot',
          );
          const materialBytes = yield* fs.readFile(materialPath).pipe(
            Effect.mapError(
              (error) =>
                new ProfileError({
                  message: `Unable to read material snapshot ${item.path}: ${String(error)}`,
                  cause: error,
                }),
            ),
          );
          if (!((yield* sha256(materialBytes)) === item.sha256))
            return yield* new ProfileError({ message: `Material snapshot changed: ${item.path}` });
        }
        const baselinePath = yield* resolveWithin(
          materialsDirectory,
          provenance.baselinePath,
          'Baseline archive',
        );
        const baselineBytes = yield* fs.readFile(baselinePath).pipe(
          Effect.mapError(
            (error) =>
              new ProfileError({
                message: `Unable to read baseline archive: ${String(error)}`,
                cause: error,
              }),
          ),
        );
        if (!((yield* sha256(baselineBytes)) === provenance.baselineSha256))
          return yield* new ProfileError({ message: 'Baseline archive hash mismatch' });
        report.sourceFilesResolved = new Set(
          pack.questions.flatMap(({ sources }) =>
            sources.map(
              (source) => `${source.path.startsWith('file:') ? 'local' : 'bundled'}:${source.path}`,
            ),
          ),
        ).size;
        report.materialFilesVerified = provenance.materialInventory.length + 1;
      }

      const reportPath = yield* resolveWithin(
        base,
        profile.reportPath ?? 'assets/verification-report.json',
        'Verification report',
      );
      const serializedReport = yield* Effect.fromResult(
        Result.try({
          try: () => `${JSON.stringify(report, null, 2)}\n`,
          catch: (cause) =>
            new ProfileError({
              message: `Unable to serialize verification report: ${String(cause)}`,
              cause,
            }),
        }),
      );
      yield* fs.writeFileString(reportPath, serializedReport).pipe(
        Effect.mapError(
          (error) =>
            new ProfileError({
              message: `Unable to write verification report: ${String(error)}`,
              cause: error,
            }),
        ),
      );
      return { report, reportPath };
    }),
);
