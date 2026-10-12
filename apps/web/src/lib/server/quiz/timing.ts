export const createDeadline = (startedAt: number, durationMinutes: number): number => {
  if (!Number.isFinite(startedAt) || !Number.isInteger(durationMinutes) || durationMinutes < 1) {
    throw new Error('A valid start time and duration are required.');
  }
  const deadline = startedAt + durationMinutes * 60_000;
  if (!Number.isFinite(deadline)) {
    throw new TypeError('A valid start time and duration are required.');
  }
  return deadline;
};

export const remainingMilliseconds = (deadline: number, now: number): number =>
  Math.max(0, deadline - now);

export const isExpired = (deadline: number, now: number): boolean => now >= deadline;
