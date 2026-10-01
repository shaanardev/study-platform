import { Schema } from 'effect';

const Id = Schema.String.pipe(Schema.check(Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)));
const Text = Schema.String.pipe(Schema.check(Schema.isPattern(/\S/)));
const Seed = Schema.Union([
  Schema.String,
  Schema.Number.pipe(
    Schema.check(Schema.isInt()),
    Schema.check(Schema.isGreaterThanOrEqualTo(0)),
    Schema.check(Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER)),
  ),
]);

const Exam = Schema.Struct({ id: Id, title: Text, version: Text });
const Pack = Schema.Struct({ id: Id, title: Text, version: Text, synthetic: Schema.Boolean });
const Domain = Schema.Struct({
  id: Id,
  title: Text,
  weight: Schema.Number.pipe(
    Schema.check(Schema.isGreaterThan(0)),
    Schema.check(Schema.isLessThanOrEqualTo(100)),
  ),
});
const Metadata = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  exam: Exam,
  pack: Pack,
  domains: Schema.Array(Domain).pipe(Schema.check(Schema.isMinLength(1))),
  passingThreshold: Schema.optional(
    Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 100 }))),
  ),
});
const Option = Schema.Struct({ id: Id, text: Text });
const Source = Schema.Struct({ path: Text, label: Text });
const Question = Schema.Struct({
  id: Id,
  type: Schema.Literals(['single_choice', 'multiple_choice']),
  domainId: Id,
  prompt: Text,
  options: Schema.Array(Option).pipe(
    Schema.check(Schema.isMinLength(2)),
    Schema.check(Schema.isMaxLength(26)),
  ),
  correctOptionIds: Schema.Array(Id).pipe(Schema.check(Schema.isMinLength(1))),
  explanation: Text,
  sources: Schema.Array(Source).pipe(Schema.check(Schema.isMinLength(1))),
});

/** A modular question file is a JSON array using the same draft schema as inline questions. */
export const QuestionFile = Schema.Array(Question);

export const AuthoringFile = Schema.Struct({
  metadata: Metadata,
  outputFile: Text,
  assetsDirectory: Text,
  shuffle: Schema.Struct({ answerSeed: Seed, orderSeed: Seed }),
  questions: Schema.optional(QuestionFile),
  // Paths are resolved under the main authoring file's directory and checked before use.
  questionFiles: Schema.optional(Schema.Array(Text)),
  assetFiles: Schema.optional(Schema.Array(Text)),
});

export type AuthoringFile = Schema.Schema.Type<typeof AuthoringFile>;
