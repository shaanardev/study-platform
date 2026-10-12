import { Schema } from 'effect';

const Id = Schema.String.pipe(Schema.check(Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u)));
const Text = Schema.String.pipe(Schema.check(Schema.isPattern(/\S/u)));
const Seed = Schema.Union([
  Schema.String,
  Schema.Number.pipe(
    Schema.check(Schema.isInt()),
    Schema.check(Schema.isGreaterThanOrEqualTo(0)),
    Schema.check(Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER)),
  ),
]);

const Exam = Schema.Struct({ id: Id, title: Text, version: Text });
const Pack = Schema.Struct({ id: Id, synthetic: Schema.Boolean, title: Text, version: Text });
const Domain = Schema.Struct({
  id: Id,
  title: Text,
  weight: Schema.Number.pipe(
    Schema.check(Schema.isGreaterThan(0)),
    Schema.check(Schema.isLessThanOrEqualTo(100)),
  ),
});
const Metadata = Schema.Struct({
  domains: Schema.Array(Domain).pipe(Schema.check(Schema.isMinLength(1))),
  exam: Exam,
  pack: Pack,
  passingThreshold: Schema.optional(
    Schema.Number.pipe(Schema.check(Schema.isBetween({ maximum: 100, minimum: 0 }))),
  ),
  schemaVersion: Schema.Literal(1),
});
const Option = Schema.Struct({ id: Id, text: Text });
const BundledSource = Schema.Struct({ label: Text, path: Text });
const LocalNoteSource = Schema.Struct({
  kind: Schema.Literal('local_note'),
  label: Text,
  path: Text,
});
const Source = Schema.Union([BundledSource, LocalNoteSource]);
const Question = Schema.Struct({
  correctOptionIds: Schema.Array(Id).pipe(Schema.check(Schema.isMinLength(1))),
  domainId: Id,
  explanation: Text,
  id: Id,
  options: Schema.Array(Option).pipe(
    Schema.check(Schema.isMinLength(2)),
    Schema.check(Schema.isMaxLength(26)),
  ),
  prompt: Text,
  sources: Schema.Array(Source).pipe(Schema.check(Schema.isMinLength(1))),
  type: Schema.Literals(['single_choice', 'multiple_choice']),
});

/** A modular question file is a JSON array using the same draft schema as inline questions. */
export const QuestionFile = Schema.Array(Question);

export const AuthoringFile = Schema.Struct({
  assetFiles: Schema.optional(Schema.Array(Text)),
  assetsDirectory: Text,
  metadata: Metadata,
  outputFile: Text,
  // Paths are resolved under the main authoring file's directory and checked before use.
  questionFiles: Schema.optional(Schema.Array(Text)),
  questions: Schema.optional(QuestionFile),
  shuffle: Schema.Struct({ answerSeed: Seed, orderSeed: Seed }),
});

export type AuthoringFileInput = Schema.Schema.Type<typeof AuthoringFile>;
