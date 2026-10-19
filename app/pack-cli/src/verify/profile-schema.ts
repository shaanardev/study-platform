import { Schema } from 'effect';

import { MAX_PERCENTAGE, MIN_ANSWER_OPTIONS } from '../core/constants.js';

const NonEmptyText = Schema.String.check(Schema.isMinLength(1));
const NonNegativeInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));

const DomainExpectation = Schema.Struct({
  count: NonNegativeInteger,
  weight: Schema.Finite.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(MAX_PERCENTAGE)),
});

export const ProfileSchema = Schema.Struct({
  answerPositions: Schema.optionalKey(Schema.Record(Schema.String, NonNegativeInteger)),
  baselineAudit: Schema.optionalKey(
    Schema.Struct({
      excluded: NonNegativeInteger,
      idPrefix: Schema.optionalKey(Schema.String),
      included: NonNegativeInteger,
      path: NonEmptyText,
      total: NonNegativeInteger,
    }),
  ),
  domains: Schema.optionalKey(Schema.Record(Schema.String, DomainExpectation)),
  objectives: Schema.optionalKey(
    Schema.Struct({
      byDomain: Schema.Record(Schema.String, Schema.Array(NonEmptyText)),
      path: NonEmptyText,
    }),
  ),
  questionRules: Schema.optionalKey(
    Schema.Struct({
      explanationMinWords: Schema.optionalKey(NonNegativeInteger),
      optionCount: Schema.optionalKey(
        Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(MIN_ANSWER_OPTIONS)),
      ),
      requiredSourcePathFragment: Schema.optionalKey(NonEmptyText),
      type: Schema.optionalKey(Schema.Literals(['single_choice', 'multiple_choice'])),
    }),
  ),
  reportPath: Schema.optionalKey(NonEmptyText),
  sourceIntegrity: Schema.optionalKey(Schema.Struct({ provenancePath: NonEmptyText })),
});

export const CoverageSchema = Schema.Struct({
  objectives: Schema.Record(Schema.String, Schema.Unknown),
  questionObjectives: Schema.Record(Schema.String, Schema.Array(Schema.String)),
});

const IncludedBaselineEntrySchema = Schema.Struct({
  baselineId: NonEmptyText,
  domainId: NonEmptyText,
  number: NonNegativeInteger,
  objective: NonEmptyText,
  packQuestionId: NonEmptyText,
  status: Schema.Literals(['rewritten', 'retained-with-terminology-normalization']),
});

const ExcludedBaselineEntrySchema = Schema.Struct({
  baselineId: NonEmptyText,
  number: NonNegativeInteger,
  reason: NonEmptyText,
  status: Schema.Literal('excluded'),
});

export const BaselineEntrySchema = Schema.Union([
  IncludedBaselineEntrySchema,
  ExcludedBaselineEntrySchema,
]);

export const ProvenanceSchema = Schema.Struct({
  baselinePath: NonEmptyText,
  baselineSha256: NonEmptyText,
  materialInventory: Schema.Array(Schema.Struct({ path: NonEmptyText, sha256: NonEmptyText })),
});

export type BaselineEntry = typeof BaselineEntrySchema.Type;

export type IncludedBaselineEntry = typeof IncludedBaselineEntrySchema.Type;

export type ExcludedBaselineEntry = typeof ExcludedBaselineEntrySchema.Type;
