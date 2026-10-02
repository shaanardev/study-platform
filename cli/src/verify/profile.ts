import { Crypto, Data, Effect, FileSystem, Path, Schema } from 'effect';
import { Hex } from 'effect/encoding';
import type { PackForVerification } from './verify.js';

const NonEmptyText = Schema.String.check(Schema.isMinLength(1));
const NonNegativeInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
const DomainExpectation = Schema.Struct({
  count: NonNegativeInteger,
  weight: Schema.Finite.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(100)),
});
const ProfileSchema = Schema.Struct({
  domains: Schema.optionalKey(Schema.Record(Schema.String, DomainExpectation)),
  objectives: Schema.optionalKey(Schema.Struct({
    path: NonEmptyText,
    byDomain: Schema.Record(Schema.String, Schema.Array(NonEmptyText)),
  })),
  questionRules: Schema.optionalKey(Schema.Struct({
    type: Schema.optionalKey(Schema.Literals(['single_choice', 'multiple_choice'])),
    optionCount: Schema.optionalKey(Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(2))),
    explanationMinWords: Schema.optionalKey(NonNegativeInteger),
    requiredSourcePathFragment: Schema.optionalKey(NonEmptyText),
  })),
  answerPositions: Schema.optionalKey(Schema.Record(Schema.String, NonNegativeInteger)),
  baselineAudit: Schema.optionalKey(Schema.Struct({
    path: NonEmptyText,
    total: NonNegativeInteger,
    included: NonNegativeInteger,
    excluded: NonNegativeInteger,
    idPrefix: Schema.optionalKey(Schema.String),
  })),
  sourceIntegrity: Schema.optionalKey(Schema.Struct({ provenancePath: NonEmptyText })),
  reportPath: Schema.optionalKey(NonEmptyText),
});
const CoverageSchema = Schema.Struct({
  questionObjectives: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  objectives: Schema.Record(Schema.String, Schema.Unknown),
});
const IncludedBaselineEntrySchema = Schema.Struct({
  baselineId: NonEmptyText,
  number: NonNegativeInteger,
  status: Schema.Literals(['rewritten', 'retained-with-terminology-normalization']),
  packQuestionId: NonEmptyText,
  domainId: NonEmptyText,
  objective: NonEmptyText,
});
const ExcludedBaselineEntrySchema = Schema.Struct({
  baselineId: NonEmptyText,
  number: NonNegativeInteger,
  status: Schema.Literal('excluded'),
  reason: NonEmptyText,
});
const BaselineEntrySchema = Schema.Union([
  IncludedBaselineEntrySchema,
  ExcludedBaselineEntrySchema,
]);
const ProvenanceSchema = Schema.Struct({
  materialInventory: Schema.Array(Schema.Struct({ path: NonEmptyText, sha256: NonEmptyText })),
  baselinePath: NonEmptyText,
  baselineSha256: NonEmptyText,
});

type BaselineEntry = typeof BaselineEntrySchema.Type;
type IncludedBaselineEntry = typeof IncludedBaselineEntrySchema.Type;
type ExcludedBaselineEntry = typeof ExcludedBaselineEntrySchema.Type;

export class ProfileError extends Data.TaggedError('ProfileError')<{ readonly message: string }> {}

const fail = (message: string) => Effect.fail(new ProfileError({ message }));
const ensure = (condition: unknown, message: string) => (condition ? Effect.void : fail(message));
const countBy = (values: string[]): Map<string, number> =>
  values.reduce(
    (map, value) => map.set(value, (map.get(value) ?? 0) + 1),
    new Map<string, number>(),
  );
const sortedObject = (values: Map<string, number>): Record<string, number> =>
  Object.fromEntries([...values].sort(([left], [right]) => left.localeCompare(right)));

const resolveWithin = Effect.fn(function* (directory: string, filename: string, label: string) {
  const path = yield* Path.Path;
  const actual = path.resolve(directory, filename);
  const fromDirectory = path.relative(directory, actual);
  if (
    fromDirectory === '..' ||
    fromDirectory.startsWith(`..${path.sep}`) ||
    path.isAbsolute(fromDirectory)
  )
    return yield* fail(`${label} escapes pack folder (${filename})`);
  return actual;
});

const readText = Effect.fn(function* (filename: string, label: string) {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs
    .readFileString(filename)
    .pipe(Effect.mapError((error) => new ProfileError({ message: `${label}: ${String(error)}` })));
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
        new ProfileError({ message: `${label} schema validation failed: ${String(error)}` }),
    ),
  );
});

const sha256 = Effect.fn(function* (bytes: Uint8Array) {
  const crypto = yield* Crypto.Crypto;
  const digest = yield* crypto
    .digest('SHA-256', bytes)
    .pipe(
      Effect.mapError(
        (error) => new ProfileError({ message: `Unable to compute SHA-256: ${String(error)}` }),
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

export const verifyProfile = (packPath: string, pack: PackForVerification, profilePath: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const absolutePackPath = path.resolve(packPath);
    const base = path.dirname(absolutePackPath);
    const profile = yield* readJson(path.resolve(profilePath), ProfileSchema, 'Profile');
    const packBytes = yield* fs
      .readFile(absolutePackPath)
      .pipe(
        Effect.mapError(
          (error) =>
            new ProfileError({ message: `Unable to read exam pack for profile: ${String(error)}` }),
        ),
      );
    const report: ProfileReport = {
      status: 'passed',
      packSha256: yield* sha256(packBytes),
      questionCount: pack.questions.length,
    };

    if (profile.domains) {
      const actualIds = new Set(pack.domains.map(({ id }) => id));
      yield* ensure(
        actualIds.size === Object.keys(profile.domains).length &&
          Object.keys(profile.domains).every((id) => actualIds.has(id)),
        'Profile domain set does not match pack',
      );
      const questionCounts = countBy(pack.questions.map(({ domainId }) => domainId));
      const domains = [];
      for (const [id, expected] of Object.entries(profile.domains)) {
        const domain = pack.domains.find((item) => item.id === id);
        if (!domain) return yield* fail(`${id}: domain missing from pack`);
        const actualCount = questionCounts.get(id) ?? 0;
        yield* ensure(
          domain.weight === expected.weight,
          `${id}: expected weight ${expected.weight}, got ${domain.weight}`,
        );
        yield* ensure(
          actualCount === expected.count,
          `${id}: expected ${expected.count} questions, got ${actualCount}`,
        );
        domains.push({
          id,
          title: domain.title,
          guidePercent: expected.weight,
          questionCount: actualCount,
          actualPercent: (actualCount * 100) / pack.questions.length,
          differencePercentagePoints: (actualCount * 100) / pack.questions.length - expected.weight,
        });
      }
      report.exactDomainWeights = 'passed';
      report.domains = domains;
    }

    let coverageQuestions: Record<string, ReadonlyArray<string>> | undefined;
    if (profile.objectives) {
      const coveragePath = yield* resolveWithin(base, profile.objectives.path, 'Objective mapping');
      const coverage = yield* readJson(coveragePath, CoverageSchema, 'Objective mapping');
      const coverageQuestionObjectives = coverage.questionObjectives;
      yield* ensure(
        Object.keys(coverageQuestionObjectives).length === pack.questions.length &&
          pack.questions.every(({ id }) => Object.hasOwn(coverageQuestionObjectives, id)),
        'Objective mapping does not exactly match questions',
      );
      const expectedObjectives = new Set(Object.values(profile.objectives.byDomain).flat());
      yield* ensure(
        Object.keys(coverage.objectives).length === expectedObjectives.size &&
          Object.keys(coverage.objectives).every((id) => expectedObjectives.has(id)),
        'Objective list does not match profile',
      );
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
          return yield* fail(`${question.id}: objective/domain mismatch`);
        mapped.forEach((id) => {
          observed.add(id);
        });
      }
      yield* ensure(
        observed.size === expectedObjectives.size &&
          [...expectedObjectives].every((id) => observed.has(id)),
        'At least one profile objective has no question',
      );
      report.objectivesCovered = observed.size;
      report.objectiveCounts = sortedObject(
        countBy(pack.questions.flatMap(({ id }) => coverageQuestionObjectives[id] ?? [])),
      );
      coverageQuestions = coverageQuestionObjectives;
    }

    if (profile.questionRules) {
      const rules = profile.questionRules;
      for (const question of pack.questions) {
        if (rules.type)
          yield* ensure(question.type === rules.type, `${question.id}: expected ${rules.type}`);
        if (rules.optionCount !== undefined)
          yield* ensure(
            question.options.length === rules.optionCount,
            `${question.id}: expected ${rules.optionCount} options`,
          );
        if (rules.explanationMinWords !== undefined)
          yield* ensure(
            question.explanation.trim().split(/\s+/).filter(Boolean).length >=
              rules.explanationMinWords,
            `${question.id}: explanation too short`,
          );
        if (rules.requiredSourcePathFragment) {
          const requiredSourcePathFragment = rules.requiredSourcePathFragment;
          yield* ensure(
            question.sources.some(({ path: sourcePath }) =>
              sourcePath.includes(requiredSourcePathFragment),
            ),
            `${question.id}: missing required source`,
          );
        }
        yield* ensure(
          new Set(
            question.options.map(({ text }) => text.toLowerCase().replace(/\s+/g, ' ').trim()),
          ).size === question.options.length,
          `${question.id}: duplicate option text`,
        );
      }
      report.questionRules = 'passed';
    }

    if (profile.answerPositions) {
      const answerLetters: string[] = [];
      for (const question of pack.questions) {
        const answer = question.answerIds[0];
        yield* ensure(
          question.answerIds.length === 1 && answer,
          `${question.id}: answer position requires one correct answer`,
        );
        const optionIndex = question.options.findIndex(({ id }) => id === answer);
        yield* ensure(optionIndex >= 0, `${question.id}: correct answer is not an option`);
        answerLetters.push(String.fromCharCode(97 + optionIndex));
      }
      const positions = countBy(answerLetters);
      for (const [position, expected] of Object.entries(profile.answerPositions))
        yield* ensure(
          (positions.get(position) ?? 0) === expected,
          `Answer position ${position}: expected ${expected}, got ${positions.get(position) ?? 0}`,
        );
      yield* ensure(
        positions.size === Object.keys(profile.answerPositions).length,
        'Unexpected correct answer position',
      );
      report.answerPositions = sortedObject(positions);
    }

    if (profile.baselineAudit) {
      const audit = profile.baselineAudit;
      yield* ensure(
        audit.total === audit.included + audit.excluded,
        'Profile baselineAudit totals must add up',
      );
      const auditPath = yield* resolveWithin(base, audit.path, 'Baseline audit');
      const review: readonly BaselineEntry[] = yield* readJson(
        auditPath,
        Schema.Array(BaselineEntrySchema),
        'Baseline audit',
      );
      yield* ensure(
        review.length === audit.total &&
          new Set(review.map(({ number }) => number)).size === review.length &&
          review.every(
            (item, index) =>
              item.number === index + 1 &&
              Number(item.baselineId.match(/(\d+)$/)?.[1]) === item.number,
          ) &&
          new Set(review.map(({ baselineId }) => baselineId)).size === review.length,
        'Incomplete baseline audit',
      );
      const included = review.filter(
        (item): item is IncludedBaselineEntry => item.status !== 'excluded',
      );
      const excluded = review.filter(
        (item): item is ExcludedBaselineEntry => item.status === 'excluded',
      );
      yield* ensure(
        included.length === audit.included && excluded.length === audit.excluded,
        'Baseline audit disposition totals do not match profile',
      );
      yield* ensure(
        excluded.every(({ reason }) => reason.trim().length > 0),
        'Baseline exclusion without rationale',
      );
      const prefix = audit.idPrefix ?? '';
      const baselineIds = new Set(
        pack.questions
          .map(({ id }) => id)
          .filter((id) => prefix.length === 0 || id.startsWith(prefix)),
      );
      yield* ensure(
        new Set(included.map(({ packQuestionId }) => packQuestionId)).size === included.length,
        'Baseline audit mappings must be unique',
      );
      const byId = new Map(pack.questions.map((question) => [question.id, question]));
      for (const item of included) {
        const question = byId.get(item.packQuestionId);
        if (!question) return yield* fail(`Missing baseline question ${item.packQuestionId}`);
        yield* ensure(
          question.domainId === item.domainId,
          `${question.id}: baseline domain mismatch`,
        );
        if (coverageQuestions)
          yield* ensure(
            coverageQuestions[question.id]?.includes(item.objective) === true,
            `${question.id}: baseline objective mismatch`,
          );
      }
      yield* ensure(
        included.length === baselineIds.size &&
          [...baselineIds].every((id) => included.some((item) => item.packQuestionId === id)),
        'Baseline audit and pack differ',
      );
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
              }),
          ),
        );
        yield* ensure(
          (yield* sha256(materialBytes)) === item.sha256,
          `Material snapshot changed: ${item.path}`,
        );
      }
      const baselinePath = yield* resolveWithin(
        materialsDirectory,
        provenance.baselinePath,
        'Baseline archive',
      );
      const baselineBytes = yield* fs
        .readFile(baselinePath)
        .pipe(
          Effect.mapError(
            (error) =>
              new ProfileError({ message: `Unable to read baseline archive: ${String(error)}` }),
          ),
        );
      yield* ensure(
        (yield* sha256(baselineBytes)) === provenance.baselineSha256,
        'Baseline archive hash mismatch',
      );
      report.sourceFilesResolved = new Set(
        pack.questions.flatMap(({ sources }) => sources.map(({ path: sourcePath }) => sourcePath)),
      ).size;
      report.materialFilesVerified = provenance.materialInventory.length + 1;
    }

    const reportPath = yield* resolveWithin(
      base,
      profile.reportPath ?? 'assets/verification-report.json',
      'Verification report',
    );
    const reportJson = yield* Schema.encodeEffect(
      Schema.fromJsonString(Schema.Unknown, { space: 2 }),
    )(report).pipe(
      Effect.mapError(
        (error) =>
          new ProfileError({ message: `Unable to encode verification report: ${String(error)}` }),
      ),
    );
    yield* fs
      .writeFileString(reportPath, `${reportJson}\n`)
      .pipe(
        Effect.mapError(
          (error) =>
            new ProfileError({ message: `Unable to write verification report: ${String(error)}` }),
        ),
      );
    return { report, reportPath };
  });
