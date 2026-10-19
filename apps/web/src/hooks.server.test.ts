import { describe, expect, it, vi } from 'vitest';

import { handleRequestBoundary } from './hooks.server';
import type { RequestBoundaryEvent } from './hooks.server';
import { LIMITS } from './lib/ui-feedback/schema';

const ORIGIN = 'http://127.0.0.1:5173';
const REQUEST_HEADERS = { origin: ORIGIN };

const eventFor = (request: Request, isRemoteRequest = true): RequestBoundaryEvent => ({
  isRemoteRequest,
  request,
});

const requestFor = (body: BodyInit = '{}', headers: HeadersInit = REQUEST_HEADERS) =>
  new Request(`${ORIGIN}/_app/remote/test/submitFeedback`, { body, headers, method: 'POST' });

type BoundaryResolver = (event: RequestBoundaryEvent) => Response | Promise<Response>;

const resolver = (resolve: BoundaryResolver) => vi.fn<BoundaryResolver>(resolve);

describe('remote request body boundary', () => {
  it('passes a readable replacement body to SvelteKit after enforcing the limit', async () => {
    const resolve = resolver(async (event) => Response.json(await event.request.json()));
    const event = eventFor(requestFor('{"note":"kept"}'));

    const response = await handleRequestBoundary({
      event,
      resolve,
    });

    await expect(response.json()).resolves.toStrictEqual({ note: 'kept' });
    const resolveCalls = resolve.mock.calls;
    expect(resolveCalls).toHaveLength(1);
    expect(resolveCalls.at(0)?.at(0)?.isRemoteRequest).toBeTruthy();
    expect(resolveCalls.at(0)?.at(0)?.request).toBeInstanceOf(Request);
    expect(resolveCalls.at(0)?.at(0)?.request).not.toBe(event.request);
  });

  it('does not restrict remote requests by origin', async () => {
    const resolve = resolver(async (event) => Response.json(await event.request.json()));
    const event = eventFor(requestFor('{"note":"kept"}', { origin: 'http://attacker.invalid' }));

    const response = await handleRequestBoundary({
      event,
      resolve,
    });

    await expect(response.json()).resolves.toStrictEqual({ note: 'kept' });
    const resolveCalls = resolve.mock.calls;
    expect(resolveCalls).toHaveLength(1);
    expect(resolveCalls.at(0)?.at(0)?.isRemoteRequest).toBeTruthy();
    expect(resolveCalls.at(0)?.at(0)?.request).toBeInstanceOf(Request);
    expect(resolveCalls.at(0)?.at(0)?.request).not.toBe(event.request);
  });

  it('leaves ordinary app requests untouched', async () => {
    const request = requestFor();
    const resolve = resolver(() => new Response('ok'));
    await handleRequestBoundary({ event: eventFor(request, false), resolve });
    expect(resolve.mock.calls[0]?.[0].request).toBe(request);
    expect(request.bodyUsed).toBeFalsy();
  });

  it('rejects oversized declared bodies before resolution', async () => {
    const resolve = resolver(() => new Response('ok'));
    await expect(
      handleRequestBoundary({
        event: eventFor(
          requestFor('{}', { 'content-length': String(LIMITS.requestBytes + 1), origin: ORIGIN }),
        ),
        resolve,
      }),
    ).rejects.toMatchObject({ status: 413 });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('cancels oversized streams without relying on Content-Length', async () => {
    const cancel = vi.fn<(reason?: Error) => void>();

    const stream = new ReadableStream<Uint8Array>({
      cancel,
      start(controller) {
        controller.enqueue(new Uint8Array(LIMITS.requestBytes + 1));
      },
    });

    // Node's streaming Request constructor requires duplex; browser requests do not use this fixture.
    const init = {
      body: stream,
      duplex: 'half',
      headers: { origin: ORIGIN },
      method: 'POST',
    };

    const request = new Request(`${ORIGIN}/_app/remote/test/submitFeedback`, init);
    const resolve = resolver(() => new Response('ok'));
    await expect(
      handleRequestBoundary({ event: eventFor(request), resolve }),
    ).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: 'AbortError' }));
    expect(resolve).not.toHaveBeenCalled();
  });

  it('rejects an aborted request before reading or resolving it', async () => {
    const controller = new AbortController();
    controller.abort();

    const request = new Request(`${ORIGIN}/_app/remote/test/submitFeedback`, {
      body: '{}',
      headers: REQUEST_HEADERS,
      method: 'POST',
      signal: controller.signal,
    });

    const resolve = resolver(() => new Response('ok'));
    await expect(
      handleRequestBoundary({ event: eventFor(request), resolve }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('cancels an unfinished body when its request is aborted', async () => {
    const controller = new AbortController();
    const cancel = vi.fn<(reason?: Error) => void>();
    const pulling = Promise.withResolvers<null>();

    const stream = new ReadableStream<Uint8Array>({
      cancel,
      pull() {
        pulling.resolve(null);
      },
    });

    const init = {
      body: stream,
      duplex: 'half',
      headers: REQUEST_HEADERS,
      method: 'POST',
      signal: controller.signal,
    };

    const request = new Request(`${ORIGIN}/_app/remote/test/submitFeedback`, init);
    const resolve = resolver(() => new Response('ok'));
    const result = handleRequestBoundary({ event: eventFor(request), resolve });
    await pulling.promise;
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancel).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: 'AbortError' }));
    expect(resolve).not.toHaveBeenCalled();
  });

  it('bounds the time spent reading an unfinished body', async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);

    try {
      const cancel = vi.fn<(reason?: Error) => void>();
      const stream = new ReadableStream<Uint8Array>({ cancel });
      const init = { body: stream, duplex: 'half', headers: REQUEST_HEADERS, method: 'POST' };
      const request = new Request(`${ORIGIN}/_app/remote/test/submitFeedback`, init);
      const resolve = resolver(() => new Response('ok'));
      const result = handleRequestBoundary({ event: eventFor(request), resolve });
      expect(timeout).toHaveBeenCalledWith(30_000);
      controller.abort();
      await expect(result).rejects.toMatchObject({ name: 'AbortError' });
      expect(cancel).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: 'AbortError' }),
      );
      expect(resolve).not.toHaveBeenCalled();
    } finally {
      timeout.mockRestore();
    }
  });
});
