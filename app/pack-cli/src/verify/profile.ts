import type { PackForVerification } from '@learning-platform/exam-pack';
import { Data, Effect, FileSystem, Option, Path, Result, Schema } from 'effect';
import { Digest } from 'effect/crypto';

import {
  JSON_INDENT_SPACES,
  LOWERCASE_ASCII_A_CODE_POINT,
  MAX_PERCENTAGE,
} from '../core/constants.js';
import {
  BaselineEntrySchema,
  CoverageSchema,
  ProfileSchema,
  ProvenanceSchema,
} from './profile-schema.js';
import type {
  BaselineEntry,
  ExcludedBaselineEntry,
  IncludedBaselineEntry,
} from './profile-schema.js';

export class ProfileError extends Data.TaggedError('ProfileError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const resolveWithin = Effect.fn(function* resolveWithin(
  directory: string,
  filename: string,
  label: string,
) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const actual = path.resolve(directory, filename);
  const fromDirectory = path.relative(directory, actual);

  if (
    fromDirectory === '..' ||
    fromDirectory.startsWith(`..${path.sep}`) ||
    path.isAbsolute(fromDirectory)
  ) {
    return yield* new ProfileError({ message: `${label} escapes pack folder (${filename})` });
  }

  const realDirectory = yield* fs.realPath(directory).pipe(
    Effect.mapError(
      (cause) =>
        new ProfileError({
          cause,
          message: `Unable to resolve pack folder for ${label}: ${String(cause)}`,
        }),
    ),
  );

  const realActual = yield* fs.realPath(actual).pipe(Effect.result);
  let resolved = Option.none<string>();

  if (Result.isSuccess(realActual)) {
    resolved = Option.some(realActual.success);
  } else {
    // A report file may not exist yet. Resolve its nearest existing ancestor so
    // symlinked directories are still checked before the write is attempted.
    let ancestor = actual;
    const suffix: string[] = [];

    while (Option.isNone(resolved)) {
      const realAncestor = yield* fs.realPath(ancestor).pipe(Effect.result);

      if (Result.isSuccess(realAncestor)) {
        resolved = Option.some(path.resolve(realAncestor.success, ...suffix.toReversed()));
        break;
      }

      const link = yield* fs.readLink(ancestor).pipe(Effect.result);

      if (Result.isSuccess(link)) {
        return yield* new ProfileError({
          message: `${label} escapes pack folder through symbolic link (${filename})`,
        });
      }

      const parent = path.dirname(ancestor);

      if (parent === ancestor) {
        return yield* new ProfileError({
          message: `${label} cannot be resolved within pack folder (${filename})`,
        });
      }

      suffix.push(path.basename(ancestor));
      ancestor = parent;
    }
  }

  const resolvedPath = yield* Effect.fromResult(
    Result.fromOption(
      resolved,
      () =>
        new ProfileError({
          message: `${label} cannot be resolved within pack folder (${filename})`,
        }),
    ),
  );

  const realRelative = path.relative(realDirectory, resolvedPath);

  if (
    realRelative === '..' ||
    realRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(realRelative)
  ) {
    return yield* new ProfileError({ message: `${label} escapes pack folder (${filename})` });
  }

  return resolvedPath;
});

const readText = Effect.fn(function* readText(filename: string, label: string) {
  const fs = yield* FileSystem.FileSystem;

  return yield* fs
    .readFileString(filename)
    .pipe(
      Effect.mapError(
        (error) => new ProfileError({ cause: error, message: `${label}: ${String(error)}` }),
      ),
    );
});

const readJson = Effect.fn(function* readJson<A>(
  filename: string,
  schema: Schema.Codec<A, unknown>,
  label: string,
) {
  const text = yield* readText(filename, `Unable to read ${label}`);

  return yield* Schema.decodeEffect(Schema.fromJsonString(schema), { onExcessProperty: 'error' })(
    text,
  ).pipe(
    Effect.mapError(
      (error) =>
        new ProfileError({
          cause: error,
          message: `${label} schema validation failed: ${String(error)}`,
        }),
    ),
  );
});

const sha256 = Effect.fn(function* sha256(bytes: Uint8Array) {
  const digest = yield* Digest.Digest;

  return yield* digest.digestHex(Digest.sha256, bytes).pipe(
    Effect.mapError(
      (error) =>
        new ProfileError({
          cause: error,
          message: `Unable to compute SHA-256: ${String(error)}`,
        }),
    ),
  );
});

interface ProfileReportDomain {
  readonly actualPercent: number;
  readonly differencePercentagePoints: number;
  readonly guidePercent: number;
  readonly id: string;
  readonly questionCount: number;
  readonly title: string;
}

interface ProfileReport {
  readonly status: 'passed';
  readonly packSha256: string;
  readonly questionCount: number;
  exactDomainWeights?: string;
  domains?: ProfileReportDomain[];
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

type Profile = typeof ProfileSchema.Type;

const verifyDomainWeights = Effect.fn('verifyDomainWeights')(function* verifyDomainWeights(
  pack: PackForVerification,
  expectedDomains: NonNullable<Profile['domains']>,
) {
  const actualIds = new Set(pack.domains.map(({ id }) => id));
  const expectedIds = Object.keys(expectedDomains);

  if (actualIds.size !== expectedIds.length || !expectedIds.every((id) => actualIds.has(id))) {
    return yield* new ProfileError({ message: 'Profile domain set does not match pack' });
  }

  const questionCounts = pack.questions.reduce((counts, { domainId }) => {
    counts.set(domainId, (counts.get(domainId) ?? 0) + 1);

    return counts;
  }, new Map<string, number>());

  const domains = yield* Effect.forEach(Object.entries(expectedDomains), ([id, expected]) =>
    Effect.gen(function* verifyDomain() {
      const domain = pack.domains.find((item) => item.id === id);

      if (domain === undefined) {
        return yield* new ProfileError({ message: `${id}: domain missing from pack` });
      }

      const actualCount = questionCounts.get(id) ?? 0;

      if (domain.weight !== expected.weight) {
        return yield* new ProfileError({
          message: `${id}: expected weight ${expected.weight}, got ${domain.weight}`,
        });
      }

      if (actualCount !== expected.count) {
        return yield* new ProfileError({
          message: `${id}: expected ${expected.count} questions, got ${actualCount}`,
        });
      }

      return {
        actualPercent: (actualCount * MAX_PERCENTAGE) / pack.questions.length,
        differencePercentagePoints:
          (actualCount * MAX_PERCENTAGE) / pack.questions.length - expected.weight,
        guidePercent: expected.weight,
        id,
        questionCount: actualCount,
        title: domain.title,
      };
    }),
  );

  return { domains, exactDomainWeights: 'passed' as const };
});

const verifyObjectives = Effect.fn('verifyObjectives')(function* verifyObjectives(
  base: string,
  pack: PackForVerification,
  objectives: NonNullable<Profile['objectives']>,
) {
  const coveragePath = yield* resolveWithin(base, objectives.path, 'Objective mapping');
  const coverage = yield* readJson(coveragePath, CoverageSchema, 'Objective mapping');
  const coverageQuestionObjectives = coverage.questionObjectives;

  if (
    Object.keys(coverageQuestionObjectives).length !== pack.questions.length ||
    !pack.questions.every(({ id }) => Object.hasOwn(coverageQuestionObjectives, id))
  ) {
    return yield* new ProfileError({
      message: 'Objective mapping does not exactly match questions',
    });
  }

  const expectedObjectives = new Set(Object.values(objectives.byDomain).flat());
  const coverageObjectiveIds = Object.keys(coverage.objectives);

  if (
    coverageObjectiveIds.length !== expectedObjectives.size ||
    !coverageObjectiveIds.every((id) => expectedObjectives.has(id))
  ) {
    return yield* new ProfileError({ message: 'Objective list does not match profile' });
  }

  const mappedObjectives = yield* Effect.forEach(pack.questions, (question) =>
    Effect.gen(function* verifyQuestionObjectives() {
      const mapped = coverageQuestionObjectives[question.id];
      const permitted = objectives.byDomain[question.domainId];

      if (
        mapped === undefined ||
        mapped.length === 0 ||
        new Set(mapped).size !== mapped.length ||
        !mapped.every((id) => permitted?.includes(id) === true)
      ) {
        return yield* new ProfileError({ message: `${question.id}: objective/domain mismatch` });
      }

      return mapped;
    }),
  );

  const observed = new Set(mappedObjectives.flat());

  if (
    observed.size !== expectedObjectives.size ||
    ![...expectedObjectives].every((id) => observed.has(id))
  ) {
    return yield* new ProfileError({ message: 'At least one profile objective has no question' });
  }

  const objectiveCounts = pack.questions
    .flatMap(({ id }) => coverageQuestionObjectives[id] ?? [])
    .reduce((counts, objective) => {
      counts.set(objective, (counts.get(objective) ?? 0) + 1);

      return counts;
    }, new Map<string, number>());

  return {
    coverageQuestions: coverageQuestionObjectives,
    objectiveCounts: Object.fromEntries(
      [...objectiveCounts].toSorted(([left], [right]) => left.localeCompare(right)),
    ),
    objectivesCovered: observed.size,
  };
});

const verifyQuestionRules = Effect.fn('verifyQuestionRules')(function* verifyQuestionRules(
  pack: PackForVerification,
  rules: NonNullable<Profile['questionRules']>,
) {
  const { requiredSourcePathFragment } = rules;
  yield* Effect.forEach(pack.questions, (question) =>
    Effect.gen(function* verifyQuestionRule() {
      if (rules.type !== undefined && question.type !== rules.type) {
        return yield* new ProfileError({ message: `${question.id}: expected ${rules.type}` });
      }

      if (rules.optionCount !== undefined && question.options.length !== rules.optionCount) {
        return yield* new ProfileError({
          message: `${question.id}: expected ${rules.optionCount} options`,
        });
      }

      if (
        rules.explanationMinWords !== undefined &&
        question.explanation.trim().split(/\s+/u).filter(Boolean).length < rules.explanationMinWords
      ) {
        return yield* new ProfileError({ message: `${question.id}: explanation too short` });
      }

      if (
        requiredSourcePathFragment !== undefined &&
        !question.sources.some(({ path: sourcePath }) =>
          sourcePath.includes(requiredSourcePathFragment),
        )
      ) {
        return yield* new ProfileError({ message: `${question.id}: missing required source` });
      }

      return yield* Effect.void;
    }),
  );

  return yield* Effect.void;
});

const verifyAnswerPositions = Effect.fn('verifyAnswerPositions')(function* verifyAnswerPositions(
  pack: PackForVerification,
  expectedPositions: NonNullable<Profile['answerPositions']>,
) {
  const questionPositions = yield* Effect.forEach(pack.questions, (question) =>
    Effect.gen(function* getQuestionPosition() {
      const [answer] = question.answerIds;

      if (question.answerIds.length !== 1 || answer === undefined) {
        return yield* new ProfileError({
          message: `${question.id}: answer position requires one correct answer`,
        });
      }

      const optionIndex = question.options.findIndex(({ id }) => id === answer);

      if (optionIndex === -1) {
        return yield* new ProfileError({
          message: `${question.id}: correct answer is not an option`,
        });
      }

      return String.fromCodePoint(LOWERCASE_ASCII_A_CODE_POINT + optionIndex);
    }),
  );

  const positions = questionPositions.reduce((counts, position) => {
    counts.set(position, (counts.get(position) ?? 0) + 1);

    return counts;
  }, new Map<string, number>());

  const positionMismatch = Object.entries(expectedPositions).find(
    ([position, expected]) => (positions.get(position) ?? 0) !== expected,
  );

  if (positionMismatch !== undefined) {
    const [position, expected] = positionMismatch;

    return yield* new ProfileError({
      message: `Answer position ${position}: expected ${expected}, got ${positions.get(position) ?? 0}`,
    });
  }

  if (positions.size !== Object.keys(expectedPositions).length) {
    return yield* new ProfileError({ message: 'Unexpected correct answer position' });
  }

  return Object.fromEntries(
    [...positions].toSorted(([left], [right]) => left.localeCompare(right)),
  );
});

const verifyBaselineAudit = Effect.fn('verifyBaselineAudit')(function* verifyBaselineAudit(
  base: string,
  pack: PackForVerification,
  audit: NonNullable<Profile['baselineAudit']>,
  coverageQuestions: Record<string, readonly string[]> | undefined,
) {
  if (audit.total !== audit.included + audit.excluded) {
    return yield* new ProfileError({ message: 'Profile baselineAudit totals must add up' });
  }

  const auditPath = yield* resolveWithin(base, audit.path, 'Baseline audit');

  const review: readonly BaselineEntry[] = yield* readJson(
    auditPath,
    Schema.Array(BaselineEntrySchema),
    'Baseline audit',
  );

  if (
    review.length !== audit.total ||
    new Set(review.map(({ number }) => number)).size !== review.length ||
    !review.every(
      (item, index) =>
        item.number === index + 1 &&
        Number(/(?<number>\d+)$/u.exec(item.baselineId)?.groups?.['number']) === item.number,
    ) ||
    new Set(review.map(({ baselineId }) => baselineId)).size !== review.length
  ) {
    return yield* new ProfileError({ message: 'Incomplete baseline audit' });
  }

  const included = review.filter(
    (item): item is IncludedBaselineEntry => item.status !== 'excluded',
  );

  const excluded = review.filter(
    (item): item is ExcludedBaselineEntry => item.status === 'excluded',
  );

  if (included.length !== audit.included || excluded.length !== audit.excluded) {
    return yield* new ProfileError({
      message: 'Baseline audit disposition totals do not match profile',
    });
  }

  if (!excluded.every(({ reason }) => reason.trim().length > 0)) {
    return yield* new ProfileError({ message: 'Baseline exclusion without rationale' });
  }

  const prefix = audit.idPrefix ?? '';

  const baselineIds = new Set(
    pack.questions.map(({ id }) => id).filter((id) => prefix.length === 0 || id.startsWith(prefix)),
  );

  if (new Set(included.map(({ packQuestionId }) => packQuestionId)).size !== included.length) {
    return yield* new ProfileError({ message: 'Baseline audit mappings must be unique' });
  }

  const byId = new Map(pack.questions.map((question) => [question.id, question]));
  yield* Effect.forEach(included, (item) =>
    Effect.gen(function* verifyBaselineQuestion() {
      const question = byId.get(item.packQuestionId);

      if (question === undefined) {
        return yield* new ProfileError({
          message: `Missing baseline question ${item.packQuestionId}`,
        });
      }

      if (question.domainId !== item.domainId) {
        return yield* new ProfileError({ message: `${question.id}: baseline domain mismatch` });
      }

      if (
        coverageQuestions !== undefined &&
        coverageQuestions[question.id]?.includes(item.objective) !== true
      ) {
        return yield* new ProfileError({
          message: `${question.id}: baseline objective mismatch`,
        });
      }

      return yield* Effect.void;
    }),
  );

  if (
    included.length !== baselineIds.size ||
    ![...baselineIds].every((id) => included.some((item) => item.packQuestionId === id))
  ) {
    return yield* new ProfileError({ message: 'Baseline audit and pack differ' });
  }

  return {
    baselineAdapted: included.length,
    baselineAuditCount: review.length,
    newlyAuthored: pack.questions.length - included.length,
  };
});

const verifySourceIntegrity = Effect.fn('verifySourceIntegrity')(function* verifySourceIntegrity(
  base: string,
  pack: PackForVerification,
  sourceIntegrity: NonNullable<Profile['sourceIntegrity']>,
) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;

  const provenancePath = yield* resolveWithin(
    base,
    sourceIntegrity.provenancePath,
    'Source provenance',
  );

  const provenance = yield* readJson(provenancePath, ProvenanceSchema, 'Source provenance');
  const materialsDirectory = path.resolve(path.dirname(provenancePath), 'materials');
  yield* Effect.forEach(provenance.materialInventory, (item) =>
    Effect.gen(function* verifyMaterial() {
      const materialPath = yield* resolveWithin(materialsDirectory, item.path, 'Material snapshot');

      const materialBytes = yield* fs.readFile(materialPath).pipe(
        Effect.mapError(
          (cause) =>
            new ProfileError({
              cause,
              message: `Unable to read material snapshot ${item.path}: ${String(cause)}`,
            }),
        ),
      );

      if ((yield* sha256(materialBytes)) !== item.sha256) {
        return yield* new ProfileError({ message: `Material snapshot changed: ${item.path}` });
      }

      return yield* Effect.void;
    }),
  );

  const baselinePath = yield* resolveWithin(
    materialsDirectory,
    provenance.baselinePath,
    'Baseline archive',
  );

  const baselineBytes = yield* fs.readFile(baselinePath).pipe(
    Effect.mapError(
      (cause) =>
        new ProfileError({
          cause,
          message: `Unable to read baseline archive: ${String(cause)}`,
        }),
    ),
  );

  if ((yield* sha256(baselineBytes)) !== provenance.baselineSha256) {
    return yield* new ProfileError({ message: 'Baseline archive hash mismatch' });
  }

  const sourceFilesResolved = new Set(
    pack.questions.flatMap(({ sources }) =>
      sources.map(
        (source) => `${source.path.startsWith('file:') ? 'local' : 'bundled'}:${source.path}`,
      ),
    ),
  ).size;

  return {
    materialFilesVerified: provenance.materialInventory.length + 1,
    sourceFilesResolved,
  };
});

export const verifyProfile = Effect.fn('verifyProfile')(
  (packPath: string, pack: PackForVerification, profilePath: string) =>
    Effect.gen(function* verifyProfileProgram() {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;
      const absolutePackPath = path.resolve(packPath);
      const base = path.dirname(absolutePackPath);
      const profile = yield* readJson(path.resolve(profilePath), ProfileSchema, 'Profile');

      const packBytes = yield* fs.readFile(absolutePackPath).pipe(
        Effect.mapError(
          (cause) =>
            new ProfileError({
              cause,
              message: `Unable to read exam pack for profile: ${String(cause)}`,
            }),
        ),
      );

      const report: ProfileReport = {
        packSha256: yield* sha256(packBytes),
        questionCount: pack.questions.length,
        status: 'passed',
      };

      if (profile.domains !== undefined) {
        Object.assign(report, yield* verifyDomainWeights(pack, profile.domains));
      }

      let coverageQuestions: Record<string, readonly string[]> | undefined;

      if (profile.objectives !== undefined) {
        const { coverageQuestions: questionObjectives, ...objectiveReport } =
          yield* verifyObjectives(base, pack, profile.objectives);

        coverageQuestions = questionObjectives;
        Object.assign(report, objectiveReport);
      }

      if (profile.questionRules !== undefined) {
        yield* verifyQuestionRules(pack, profile.questionRules);
        report.questionRules = 'passed';
      }

      if (profile.answerPositions !== undefined) {
        report.answerPositions = yield* verifyAnswerPositions(pack, profile.answerPositions);
      }

      if (profile.baselineAudit !== undefined) {
        Object.assign(
          report,
          yield* verifyBaselineAudit(base, pack, profile.baselineAudit, coverageQuestions),
        );
      }

      if (profile.sourceIntegrity !== undefined) {
        Object.assign(report, yield* verifySourceIntegrity(base, pack, profile.sourceIntegrity));
      }

      const reportPath = yield* resolveWithin(
        base,
        profile.reportPath ?? 'assets/verification-report.json',
        'Verification report',
      );

      const serializedReport = yield* Effect.fromResult(
        Result.try({
          catch: (cause) =>
            new ProfileError({
              cause,
              message: `Unable to serialize verification report: ${String(cause)}`,
            }),
          try: () => `${JSON.stringify(report, null, JSON_INDENT_SPACES)}\n`,
        }),
      );

      yield* fs.writeFileString(reportPath, serializedReport).pipe(
        Effect.mapError(
          (cause) =>
            new ProfileError({
              cause,
              message: `Unable to write verification report: ${String(cause)}`,
            }),
        ),
      );

      return { report, reportPath };
    }),
);
