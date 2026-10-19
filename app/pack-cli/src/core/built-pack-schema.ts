import { Schema } from 'effect';

import { MAX_PERCENTAGE, MIN_ANSWER_OPTIONS } from './constants.js';

const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u;

const sourcePathPattern =
  /^(?:file:\/\/\/[\s\S]+|(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[\s\S]+)$/u;

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
  synthetic: Schema.Boolean,
  title: Text,
  version: Text,
});

const Domain = Schema.Struct({
  id: Id,
  title: Text,
  weight: Schema.Finite.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(MAX_PERCENTAGE)),
});

const Option = Schema.Struct({
  id: Id,
  text: Text,
});

const Source = Schema.Struct({
  documentationUrls: Schema.optionalKey(Schema.Array(Text)),
  kind: Schema.optionalKey(Text),
  label: Text,
  path: SourcePath,
  section: Schema.optionalKey(Text),
});

export const BuiltExamQuestionSchema = Schema.Struct({
  answerIds: Schema.Array(Id).check(Schema.isMinLength(1)),
  domainId: Id,
  explanation: Text,
  id: Id,
  options: Schema.Array(Option).check(Schema.isMinLength(MIN_ANSWER_OPTIONS)),
  prompt: Text,
  sources: Schema.Array(Source).check(Schema.isMinLength(1)),
  type: Schema.Literals(['single_choice', 'multiple_choice']),
});

export const BuiltExamPackSchema = Schema.Struct({
  domains: Schema.Array(Domain).check(Schema.isMinLength(1)),
  exam: Exam,
  pack: Pack,
  passingThreshold: Schema.optionalKey(
    Schema.Finite.check(
      Schema.isGreaterThanOrEqualTo(0),
      Schema.isLessThanOrEqualTo(MAX_PERCENTAGE),
    ),
  ),
  questions: Schema.Array(BuiltExamQuestionSchema).check(Schema.isMinLength(1)),
  schemaVersion: Schema.Literal(1),
});

export type PackForVerification = typeof BuiltExamPackSchema.Type;

export type BuiltExamQuestion = typeof BuiltExamQuestionSchema.Type;
