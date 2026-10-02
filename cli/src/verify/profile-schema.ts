import { Schema } from 'effect';

const NonEmptyText = Schema.String.check(Schema.isMinLength(1));
const NonNegativeInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
const DomainExpectation = Schema.Struct({
  count: NonNegativeInteger,
  weight: Schema.Finite.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(100)),
});

export const ProfileSchema = Schema.Struct({
  domains: Schema.optionalKey(Schema.Record(Schema.String, DomainExpectation)),
  objectives: Schema.optionalKey(
    Schema.Struct({
      path: NonEmptyText,
      byDomain: Schema.Record(Schema.String, Schema.Array(NonEmptyText)),
    }),
  ),
  questionRules: Schema.optionalKey(
    Schema.Struct({
      type: Schema.optionalKey(Schema.Literals(['single_choice', 'multiple_choice'])),
      optionCount: Schema.optionalKey(
        Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(2)),
      ),
      explanationMinWords: Schema.optionalKey(NonNegativeInteger),
      requiredSourcePathFragment: Schema.optionalKey(NonEmptyText),
    }),
  ),
  answerPositions: Schema.optionalKey(Schema.Record(Schema.String, NonNegativeInteger)),
  baselineAudit: Schema.optionalKey(
    Schema.Struct({
      path: NonEmptyText,
      total: NonNegativeInteger,
      included: NonNegativeInteger,
      excluded: NonNegativeInteger,
      idPrefix: Schema.optionalKey(Schema.String),
    }),
  ),
  sourceIntegrity: Schema.optionalKey(Schema.Struct({ provenancePath: NonEmptyText })),
  reportPath: Schema.optionalKey(NonEmptyText),
});

export const CoverageSchema = Schema.Struct({
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

export const BaselineEntrySchema = Schema.Union([
  IncludedBaselineEntrySchema,
  ExcludedBaselineEntrySchema,
]);

export const ProvenanceSchema = Schema.Struct({
  materialInventory: Schema.Array(Schema.Struct({ path: NonEmptyText, sha256: NonEmptyText })),
  baselinePath: NonEmptyText,
  baselineSha256: NonEmptyText,
});

export type BaselineEntry = typeof BaselineEntrySchema.Type;
export type IncludedBaselineEntry = typeof IncludedBaselineEntrySchema.Type;
export type ExcludedBaselineEntry = typeof ExcludedBaselineEntrySchema.Type;
