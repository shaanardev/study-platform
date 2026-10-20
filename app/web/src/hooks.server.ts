import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { ReadableStream } from 'node:stream/web';

import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import * as v from 'valibot';

import { initializeAppDatabase } from '#lib/server/database/app-database.js';
import { HTTP_BAD_REQUEST } from '#lib/server/http-status.js';
import { LIMITS } from '#lib/ui-feedback/schema.js';

const BODY_TIMEOUT_MS = 30_000;
const HTTP_PAYLOAD_TOO_LARGE = 413;

export type RequestBoundaryEvent = Pick<RequestEvent, 'isRemoteRequest' | 'request'>;

interface RequestBoundaryContext<TEvent extends RequestBoundaryEvent> {
  event: TEvent;
  resolve: (event: TEvent) => Response | Promise<Response>;
}

const readBody = async (request: Request): Promise<Uint8Array<ArrayBuffer>> => {
  const length = Number(request.headers.get('content-length') ?? 0);

  if (!Number.isSafeInteger(length) || length < 0) {
    error(HTTP_BAD_REQUEST, 'Invalid request length.');
  }

  if (length > LIMITS.requestBytes) {
    error(HTTP_PAYLOAD_TOO_LARGE, 'Feedback request is too large.');
  }

  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(BODY_TIMEOUT_MS)]);
  signal.throwIfAborted();

  if (!request.body) {
    return new Uint8Array();
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  const stream = Readable.fromWeb(v.parse(v.instance(ReadableStream), request.body), { signal });

  const iterator = stream[Symbol.asyncIterator]();

  try {
    while (true) {
      // Read sequentially so the request size is checked before buffering another chunk.
      // oxlint-disable-next-line no-await-in-loop
      const result = await iterator.next();

      if (result.done === true) {
        break;
      }

      const chunk: unknown = result.value;
      const value = v.parse(v.instance(Uint8Array), chunk);
      size += value.byteLength;

      if (size > LIMITS.requestBytes) {
        error(HTTP_PAYLOAD_TOO_LARGE, 'Feedback request is too large.');
      }

      chunks.push(value);
    }
  } finally {
    await iterator.return?.();
  }

  return Uint8Array.from(Buffer.concat(chunks, size));
};

export const handleRequestBoundary = async <TEvent extends RequestBoundaryEvent>({
  event,
  resolve,
}: RequestBoundaryContext<TEvent>): Promise<Response> => {
  if (!event.isRemoteRequest || event.request.method !== 'POST') {
    return await resolve(event);
  }

  const bytes = await readBody(event.request);

  return await resolve({
    ...event,
    request: new Request(event.request, { body: bytes, method: 'POST' }),
  });
};

export const handle: Handle = handleRequestBoundary;

export const init = async (): Promise<void> => {
  await initializeAppDatabase();
};
