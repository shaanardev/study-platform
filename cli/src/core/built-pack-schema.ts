import { Schema } from 'effect';
import { DocumentationUrlsSchema } from './documentation-url-schema.js';

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
const AcademyNoteSource = Schema.Struct({
  kind: Schema.Literal('academy_note'),
  path: Text,
  label: Text,
  section: Schema.optionalKey(Text),
  documentationUrls: DocumentationUrlsSchema,
});

export const BuiltExamQuestionSchema = Schema.Struct({
  id: Id,
  type: Schema.Literals(['single_choice', 'multiple_choice']),
  domainId: Id,
  prompt: Text,
  options: Schema.Array(Option).check(Schema.isMinLength(2)),
  answerIds: Schema.Array(Id).check(Schema.isMinLength(1)),
  explanation: Text,
  sources: Schema.Array(Schema.Union([AcademyNoteSource, Source])).check(Schema.isMinLength(1)),
});

export const BuiltExamPackSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  exam: Exam,
  pack: Pack,
  domains: Schema.Array(Domain).check(Schema.isMinLength(1)),
  passingThreshold: Schema.optionalKey(
    Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(100)),
  ),
  questions: Schema.Array(BuiltExamQuestionSchema).check(Schema.isMinLength(1)),
});

export type PackForVerification = typeof BuiltExamPackSchema.Type;
export type BuiltExamQuestion = typeof BuiltExamQuestionSchema.Type;
