import * as Schema from 'effect/Schema';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_QUESTION_COUNT,
  MAX_MOCK_DURATION_MINUTES,
  MAX_QUESTION_COUNT,
} from '#lib/quiz/constants.js';

import {
  MockPageQuerySchema,
  SaveMockAnswerSchema,
  StartMockSchema,
  SubmitMockSchema,
} from './mock.schemas.js';

describe('mock remote form schemas', () => {
  it('preserves URL-selected values, including an explicit empty attempt ID', () => {
    const query = {
      attemptId: '',
      count: '2',
      packChoice: 'exam-a|pack-a|1.0',
    };

    expect(Schema.decodeUnknownSync(MockPageQuerySchema)(query)).toStrictEqual(query);
  });

  it('parses valid numeric form fields and rejects values outside route limits', () => {
    const validInput = {
      durationMinutes: '5',
      examId: 'exam-a',
      packId: 'pack-a',
      packVersion: '1.0',
      questionCount: String(DEFAULT_QUESTION_COUNT),
    };

    expect(Schema.decodeUnknownSync(StartMockSchema)(validInput)).toStrictEqual({
      ...validInput,
      durationMinutes: 5,
      questionCount: DEFAULT_QUESTION_COUNT,
    });
    expect(() =>
      Schema.decodeUnknownSync(StartMockSchema)({
        ...validInput,
        durationMinutes: String(MAX_MOCK_DURATION_MINUTES + 1),
      }),
    ).toThrow(/Duration must be between/u);
    expect(() =>
      Schema.decodeUnknownSync(StartMockSchema)({
        ...validInput,
        questionCount: String(MAX_QUESTION_COUNT + 1),
      }),
    ).toThrow(/Mock question count must be between/u);
  });

  it('accepts one radio answer or multiple checkbox answers', () => {
    expect(
      Schema.decodeUnknownSync(SaveMockAnswerSchema)({
        answerId: 'option-a',
        attemptId: 'attempt-a',
        questionId: 'question-a',
      }),
    ).toStrictEqual({
      answerId: 'option-a',
      attemptId: 'attempt-a',
      questionId: 'question-a',
    });
    expect(
      Schema.decodeUnknownSync(SaveMockAnswerSchema)({
        answerIds: ['option-a', 'option-b'],
        attemptId: 'attempt-a',
        questionId: 'question-a',
      }),
    ).toStrictEqual({
      answerIds: ['option-a', 'option-b'],
      attemptId: 'attempt-a',
      questionId: 'question-a',
    });
    expect(Schema.decodeUnknownSync(SubmitMockSchema)({ attemptId: 'attempt-a' })).toStrictEqual({
      attemptId: 'attempt-a',
    });
    expect(() => Schema.decodeUnknownSync(SubmitMockSchema)({ attemptId: 1 })).toThrow(
      /Expected string/u,
    );
  });
});
