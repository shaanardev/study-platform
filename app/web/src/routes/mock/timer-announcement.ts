import {
  MOCK_TIMER_FIVE_MINUTES_MS,
  MOCK_TIMER_ONE_MINUTE_MS,
  MOCK_TIMER_TEN_MINUTES_MS,
  MOCK_TIMER_TEN_SECONDS_MS,
  MOCK_TIMER_THIRTY_SECONDS_MS,
} from '#lib/quiz/constants.js';

export const getTimerAnnouncement = (remainingMilliseconds: number | undefined): string => {
  if (remainingMilliseconds === undefined) {
    return '';
  }

  if (remainingMilliseconds <= 0) {
    return 'Time has expired. The server is finalizing this mock attempt.';
  }

  if (remainingMilliseconds <= MOCK_TIMER_TEN_SECONDS_MS) {
    return '10 seconds or less remain.';
  }

  if (remainingMilliseconds <= MOCK_TIMER_THIRTY_SECONDS_MS) {
    return '30 seconds or less remain.';
  }

  if (remainingMilliseconds <= MOCK_TIMER_ONE_MINUTE_MS) {
    return '1 minute or less remains.';
  }

  if (remainingMilliseconds <= MOCK_TIMER_FIVE_MINUTES_MS) {
    return '5 minutes or less remain.';
  }

  if (remainingMilliseconds <= MOCK_TIMER_TEN_MINUTES_MS) {
    return '10 minutes or less remain.';
  }

  return '';
};
