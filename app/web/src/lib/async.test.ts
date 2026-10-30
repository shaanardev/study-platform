import { describe, expect, it } from 'vitest';

import { raceWithAbort } from './async';

describe(raceWithAbort, () => {
  it('returns the promise result when no signal is provided', async () => {
    await expect(raceWithAbort(Promise.resolve('stored'))).resolves.toBe('stored');
  });

  it('rejects with the signal reason when aborted', async () => {
    const operation = Promise.withResolvers<string>();
    const controller = new AbortController();
    const pending = raceWithAbort(operation.promise, controller.signal);
    const reason = new DOMException('Stop waiting.', 'AbortError');

    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
  });

  it('rejects immediately for an already-aborted signal', async () => {
    const controller = new AbortController();
    const reason = new DOMException('Already stopped.', 'AbortError');
    controller.abort(reason);

    await expect(raceWithAbort(Promise.resolve('ignored'), controller.signal)).rejects.toBe(reason);
  });
});
