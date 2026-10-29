import * as Schema from 'effect/Schema';

import { MAX_MOCK_DURATION_MINUTES, MAX_QUESTION_COUNT } from '#lib/quiz/constants.js';

export const MockPageQuerySchema = Schema.Struct({
  attemptId: Schema.optional(Schema.String),
  count: Schema.optional(Schema.String),
  packChoice: Schema.optional(Schema.String),
});

const QuestionCountSchema = Schema.NumberFromString.check(
  Schema.makeFilter(
    (value) =>
      Number.isInteger(value) &&
      value >= 1 &&
      (value <= MAX_QUESTION_COUNT ||
        `Mock question count must be between 1 and ${MAX_QUESTION_COUNT}.`),
  ),
);

const DurationSchema = Schema.NumberFromString.check(
  Schema.makeFilter(
    (value) =>
      Number.isInteger(value) &&
      value >= 1 &&
      (value <= MAX_MOCK_DURATION_MINUTES ||
        `Duration must be between 1 and ${MAX_MOCK_DURATION_MINUTES} minutes.`),
  ),
);

export const StartMockSchema = Schema.Struct({
  durationMinutes: DurationSchema,
  examId: Schema.String,
  packId: Schema.String,
  packVersion: Schema.String,
  questionCount: QuestionCountSchema,
});

export const SaveMockAnswerSchema = Schema.Struct({
  answerId: Schema.optional(Schema.String),
  answerIds: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  attemptId: Schema.String,
  questionId: Schema.String,
});

export const SubmitMockSchema = Schema.Struct({
  attemptId: Schema.String,
  confirmUnanswered: Schema.optional(Schema.Literal('yes')),
});
