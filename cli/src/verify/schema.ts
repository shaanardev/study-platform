import { Schema } from 'effect';

const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const sourcePathPattern = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[\s\S]+$/;

const Id = Schema.String.check(Schema.isPattern(idPattern));
const Text = Schema.String.check(Schema.isMinLength(1));
const SourcePath = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isPattern(sourcePathPattern),
  Schema.makeFilter((value) =>
    value.includes('\0') ? 'Source paths cannot contain NUL characters' : undefined,
  ),
);

const Exam = Schema.Struct({
  id: Id,
  title: Text,
  version: Text,
});

const Pack = Schema.Struct({
  id: Id,
  title: Text,
  version: Text,
  synthetic: Schema.Boolean,
});

const Domain = Schema.Struct({
  id: Id,
  title: Text,
  weight: Schema.Finite.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(100)),
});

const Option = Schema.Struct({
  id: Id,
  text: Text,
});

const Source = Schema.Struct({
  path: SourcePath,
  label: Text,
});

const Question = Schema.Struct({
  id: Id,
  type: Schema.Literals(['single_choice', 'multiple_choice']),
  domainId: Id,
  prompt: Text,
  options: Schema.Array(Option).check(Schema.isMinLength(2)),
  answerIds: Schema.Array(Id).check(Schema.isMinLength(1)),
  explanation: Text,
  sources: Schema.Array(Source).check(Schema.isMinLength(1)),
});

export const BuiltExamPackSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  exam: Exam,
  pack: Pack,
  domains: Schema.Array(Domain).check(Schema.isMinLength(1)),
  passingThreshold: Schema.optionalKey(
    Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(100)),
  ),
  questions: Schema.Array(Question).check(Schema.isMinLength(1)),
});

export type PackForVerification = typeof BuiltExamPackSchema.Type;
