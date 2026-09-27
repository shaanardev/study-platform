export function createDeadline(startedAt: number, durationMinutes: number): number {
  if (!Number.isFinite(startedAt) || !Number.isInteger(durationMinutes) || durationMinutes < 1) {
    throw new Error('A valid start time and duration are required.');
  }
  return startedAt + durationMinutes * 60_000;
}

export function remainingMilliseconds(deadline: number, now: number): number {
  return Math.max(0, deadline - now);
}

export function isExpired(deadline: number, now: number): boolean {
  return now >= deadline;
}
