import { describe, expect, it } from 'vitest';
import { createDeadline, isExpired, remainingMilliseconds } from './timing';

describe('mock exam timing', () => {
  it('keeps a fixed deadline and never reports negative time after resume', () => {
    const deadline = createDeadline(1_000, 2);
    expect(deadline).toBe(121_000);
    expect(remainingMilliseconds(deadline, 31_000)).toBe(90_000);
    expect(isExpired(deadline, 121_000)).toBe(true);
    expect(remainingMilliseconds(deadline, 130_000)).toBe(0);
  });
});
