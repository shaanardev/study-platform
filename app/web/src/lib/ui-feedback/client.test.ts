import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadScreenshot, saveScreenshot } from './client';

describe('feedback screenshot cancellation', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not open IndexedDB when its signal is already aborted', async () => {
    const open = vi.spyOn(indexedDB, 'open');
    const controller = new AbortController();
    controller.abort(new DOMException('Stopped before opening storage.', 'AbortError'));

    await expect(loadScreenshot('pre-aborted-id', controller.signal)).rejects.toThrow(
      'Stopped before opening storage.',
    );
    expect(open).not.toHaveBeenCalled();
  });

  it('aborts a pending write when its signal is aborted', async () => {
    const key = 'aborted-write-id';
    const controller = new AbortController();
    const reason = new DOMException('Stopped the write.', 'AbortError');
    const openDatabase = indexedDB.open.bind(indexedDB);
    vi.spyOn(indexedDB, 'open').mockImplementation((name, version) => {
      const request = openDatabase(name, version);
      request.addEventListener(
        'success',
        () => {
          const database = request.result;
          const createTransaction = database.transaction.bind(database);
          vi.spyOn(database, 'transaction').mockImplementation((...args) => {
            const transaction = createTransaction(...args);
            queueMicrotask(() => {
              controller.abort(reason);
            });

            return transaction;
          });
        },
        { once: true },
      );

      return request;
    });

    const pending = saveScreenshot(
      key,
      'data:image/png;base64,c2NyZWVuc2hvdA==',
      controller.signal,
    );

    await expect(pending).rejects.toBe(reason);

    const database = await openDB('ui-feedback', 1);
    let stored: unknown;

    try {
      stored = await database.get('screenshots', key);
    } finally {
      database.close();
    }

    expect(stored).toBeUndefined();
  });

  it('closes a database that finishes opening after cancellation', async () => {
    const openDatabase = indexedDB.open.bind(indexedDB);
    let closeCalled = false;
    vi.spyOn(indexedDB, 'open').mockImplementation((name, version) => {
      const request = openDatabase(name, version);
      request.addEventListener(
        'success',
        () => {
          const closeDatabase = request.result.close.bind(request.result);
          vi.spyOn(request.result, 'close').mockImplementation(() => {
            closeDatabase();
            closeCalled = true;
          });
        },
        { once: true },
      );

      return request;
    });
    const controller = new AbortController();
    const pending = loadScreenshot('aborted-open-id', controller.signal);

    controller.abort(new DOMException('Stopped opening storage.', 'AbortError'));
    await expect(pending).rejects.toThrow('Stopped opening storage.');
    await vi.waitFor(() => {
      expect(closeCalled).toBeTruthy();
    });

    expect(closeCalled).toBeTruthy();
  });
});
