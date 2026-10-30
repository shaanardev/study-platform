export const raceWithAbort = async <Result>(
  promise: Promise<Result>,
  signal?: AbortSignal,
): Promise<Result> => {
  signal?.throwIfAborted();

  if (!signal) {
    return await promise;
  }

  const { promise: aborted, reject } = Promise.withResolvers<never>();

  const rejectOnAbort = () => {
    reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
  };

  signal.addEventListener('abort', rejectOnAbort, { once: true });

  try {
    return await Promise.race([promise, aborted]);
  } finally {
    signal.removeEventListener('abort', rejectOnAbort);
  }
};
