import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadScreenshot } from './client';

describe('feedback screenshot cancellation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not open IndexedDB when its signal is already aborted', async () => {
    const open = vi.fn<() => EventTarget>();
    vi.stubGlobal('indexedDB', { open });
    const controller = new AbortController();
    controller.abort(new DOMException('Stopped before opening storage.', 'AbortError'));

    await expect(loadScreenshot('pre-aborted-id', controller.signal)).rejects.toThrow(
      'Stopped before opening storage.',
    );
    expect(open).not.toHaveBeenCalled();
  });

  it('closes a database that finishes opening after cancellation', async () => {
    const request = new EventTarget();
    const close = vi.fn<() => void>();
    const database = { close };
    Object.defineProperty(request, 'result', { value: database });
    vi.stubGlobal('indexedDB', { open: vi.fn<() => EventTarget>(() => request) });
    const controller = new AbortController();
    const pending = loadScreenshot('aborted-open-id', controller.signal);

    controller.abort(new DOMException('Stopped opening storage.', 'AbortError'));
    await expect(pending).rejects.toThrow('Stopped opening storage.');
    request.dispatchEvent(new Event('success'));

    expect(close).toHaveBeenCalledExactlyOnceWith();
  });

  it('aborts an active transaction and closes its database', async () => {
    const openRequest = new EventTarget();
    const transaction = new EventTarget();
    const objectStore = { get: vi.fn<() => object>(() => ({})) };
    const abort = vi.fn<() => boolean>(() => transaction.dispatchEvent(new Event('abort')));
    Object.assign(transaction, { abort, objectStore: () => objectStore });
    const close = vi.fn<() => void>();

    const createTransaction = vi.fn<(storeName: string, mode: IDBTransactionMode) => EventTarget>(
      () => transaction,
    );

    const database = { close, transaction: createTransaction };
    Object.defineProperty(openRequest, 'result', { value: database });
    vi.stubGlobal('indexedDB', { open: vi.fn<() => EventTarget>(() => openRequest) });
    const controller = new AbortController();
    const pending = loadScreenshot('aborted-transaction-id', controller.signal);
    openRequest.dispatchEvent(new Event('success'));
    await vi.waitFor(() => {
      expect(createTransaction).toHaveBeenCalledExactlyOnceWith('screenshots', 'readonly');
    });

    controller.abort(new DOMException('Stopped transaction.', 'AbortError'));

    await expect(pending).rejects.toThrow('Stopped transaction.');
    expect(abort).toHaveBeenCalledExactlyOnceWith();
    expect(close).toHaveBeenCalledExactlyOnceWith();
  });
});
