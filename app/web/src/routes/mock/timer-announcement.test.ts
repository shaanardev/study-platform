import { describe, expect, it } from 'vitest';

import { MILLISECONDS_PER_MINUTE, MILLISECONDS_PER_SECOND } from '#lib/quiz/constants.js';

import { getTimerAnnouncement } from './timer-announcement.js';

describe('mock timer announcements', () => {
  it.each([
    { expected: '', remaining: undefined },
    { expected: '', remaining: 10 * MILLISECONDS_PER_MINUTE + MILLISECONDS_PER_SECOND },
    { expected: '10 minutes or less remain.', remaining: 10 * MILLISECONDS_PER_MINUTE },
    { expected: '10 minutes or less remain.', remaining: 9 * MILLISECONDS_PER_MINUTE },
    { expected: '5 minutes or less remain.', remaining: 5 * MILLISECONDS_PER_MINUTE },
    {
      expected: '5 minutes or less remain.',
      remaining: MILLISECONDS_PER_MINUTE + MILLISECONDS_PER_SECOND,
    },
    { expected: '1 minute or less remains.', remaining: MILLISECONDS_PER_MINUTE },
    { expected: '1 minute or less remains.', remaining: 30 * MILLISECONDS_PER_SECOND + 1 },
    { expected: '30 seconds or less remain.', remaining: 30 * MILLISECONDS_PER_SECOND },
    { expected: '30 seconds or less remain.', remaining: 10 * MILLISECONDS_PER_SECOND + 1 },
    { expected: '10 seconds or less remain.', remaining: 10 * MILLISECONDS_PER_SECOND },
    { expected: 'Time has expired. The server is finalizing this mock attempt.', remaining: 0 },
    { expected: 'Time has expired. The server is finalizing this mock attempt.', remaining: -1 },
  ])('announces "$expected" when $remaining ms remain', ({ expected, remaining }) => {
    expect(getTimerAnnouncement(remaining)).toBe(expected);
  });
});
