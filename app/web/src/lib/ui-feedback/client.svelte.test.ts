import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SHORTCUT,
  boundsFromPoints,
  loadScreenshot,
  makeElementSelection,
  makeRectangleSelection,
  readShortcut,
  shortcutMatches,
} from './client';

const readSavedShortcut = () =>
  JSON.stringify({ alt: false, ctrl: true, key: 'g', meta: false, shift: true });

describe('feedback selection helpers', () => {
  it('normalizes drag rectangles regardless of drag direction', () => {
    const bounds = boundsFromPoints(90, 80, 20, 10);
    expect(bounds).toStrictEqual({ height: 70, width: 70, x: 20, y: 10 });
    expect(makeRectangleSelection(bounds)).toMatchObject({
      bounds,
      dom: { kind: 'unavailable' },
      kind: 'rectangle',
      source: null,
    });
  });

  it('includes DOM and Svelte source details from the rectangle center', () => {
    const target = document.createElement('article');
    target.className = 'card';
    target.textContent = 'Center sample';
    Object.defineProperty(target, '__svelte_meta', {
      value: { loc: { column: 5, file: '/workspace/src/routes/+page.svelte', line: 42 } },
    });
    expect(makeRectangleSelection({ height: 12, width: 20, x: 2, y: 3 }, target)).toMatchObject({
      dom: {
        kind: 'rectangle-center',
        selector: 'article.card',
        tag: 'article',
        text: 'Center sample',
      },
      kind: 'rectangle',
      source: {
        ancestor: false,
        column: 5,
        file: '/workspace/src/routes/+page.svelte',
        line: 42,
        vendor: false,
      },
    });
  });

  it('uses valid Svelte source metadata on an ancestor and labels vendor metadata', () => {
    const wrapper = document.createElement('section');
    Object.defineProperty(wrapper, '__svelte_meta', {
      value: { loc: { column: 4, file: 'node_modules/example/Widget.svelte', line: 12 } },
    });
    const child = document.createElement('button');
    wrapper.append(child);
    expect(makeElementSelection(child)).toMatchObject({
      dom: { kind: 'element', selector: 'button', tag: 'button' },
      source: {
        ancestor: true,
        column: 4,
        file: 'node_modules/example/Widget.svelte',
        line: 12,
        vendor: true,
      },
    });
  });

  it('keeps malformed source metadata unavailable', () => {
    const target = document.createElement('button');
    Object.defineProperty(target, '__svelte_meta', { value: { loc: { file: 12 } } });
    expect(makeElementSelection(target).source).toBeNull();
  });
});

describe('feedback shortcut handling', () => {
  const shortcut = DEFAULT_SHORTCUT;

  const shortcutEvent = (overrides: KeyboardEventInit = {}) =>
    new KeyboardEvent('keydown', {
      altKey: shortcut.alt,
      ctrlKey: shortcut.ctrl,
      key: shortcut.key,
      metaKey: shortcut.meta,
      shiftKey: shortcut.shift,
      ...overrides,
    });

  it('matches the configured shortcut and requires exact modifiers', () => {
    expect(shortcutMatches(shortcutEvent(), shortcut)).toBeTruthy();
    expect(shortcutMatches(shortcutEvent({ altKey: true }), shortcut)).toBeFalsy();
    expect(shortcutMatches(shortcutEvent({ shiftKey: false }), shortcut)).toBeFalsy();
  });

  it('accepts saved shortcuts only when they match the shared schema', () => {
    expect(readShortcut(readSavedShortcut).key).toBe('g');
  });

  it('logs shortcut storage exceptions with context and falls back', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failure = new Error('storage denied');
    expect(
      readShortcut(() => {
        throw failure;
      }).key,
    ).toBe('f');
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('developer feedback shortcut'),
      failure,
    );
    warning.mockRestore();
  });
});

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
