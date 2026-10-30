import * as Schema from 'effect/Schema';
import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase as Database, IDBPObjectStore as ObjectStore } from 'idb';

import { raceWithAbort } from '#lib/async.js';

import { QueueItemSchema, ScreenshotSchema, SvelteMetadataSchema, ShortcutSchema } from './schema';
import type {
  Bounds,
  DomDetails,
  Feedback,
  FeedbackTarget,
  QueueItem,
  Selection,
  Shortcut,
} from './schema';

export type { QueueItem, Shortcut } from './schema';

export const DEFAULT_SHORTCUT: Shortcut = {
  alt: false,
  ctrl: true,
  key: 'f',
  meta: false,
  shift: true,
};

export const SHORTCUT_STORAGE_KEY = 'ui-feedback-shortcut';
export const QUEUE_STORAGE_KEY = 'ui-feedback-queue:v2';
const LEGACY_QUEUE_STORAGE_KEY = 'ui-feedback-queue';

const MODIFIERS = [
  { event: 'Control', key: 'ctrl', label: 'Ctrl' },
  { event: 'Shift', key: 'shift', label: 'Shift' },
  { event: 'Alt', key: 'alt', label: 'Alt' },
  { event: 'Meta', key: 'meta', label: 'Meta' },
] as const;

const WHITESPACE = /\s+/gu;
const SAVED_QUEUE_SCHEMA = Schema.Array(Schema.Unknown);
const DOM_TEXT_LIMIT = 240;
const SELECTOR_CLASS_LIMIT = 3;
const ID_SUFFIX_RADIX = 36;
const ID_SUFFIX_OFFSET = 2;

const INVALID_QUEUE =
  'Some saved feedback uses an older or invalid format. The original browser data is preserved.';

const VENDOR_PATH = /(?:^|[/\\])node_modules(?:[/\\]|$)/u;
const SCREENSHOT_CACHE = new Map<string, string>();

interface ScreenshotDatabase extends DBSchema {
  screenshots: { key: string; value: unknown };
}

type ScreenshotMode = 'readonly' | 'readwrite';

type StorageReader = (key: string) => string | null;

const readLocalStorageItem: StorageReader = (key) => localStorage.getItem(key);

export const shortcutFromEvent = (event: KeyboardEvent): Shortcut | null => {
  if (MODIFIERS.some(({ event: key }) => key === event.key)) {
    return null;
  }

  return {
    alt: event.altKey,
    ctrl: event.ctrlKey,
    key: event.key.toLowerCase(),
    meta: event.metaKey,
    shift: event.shiftKey,
  };
};

export const shortcutMatches = (event: KeyboardEvent, shortcut: Shortcut): boolean => {
  const pressed = shortcutFromEvent(event);

  return (
    pressed !== null &&
    pressed.key === shortcut.key.toLowerCase() &&
    MODIFIERS.every(({ key }) => pressed[key] === shortcut[key])
  );
};

export const formatShortcut = (shortcut: Shortcut): string =>
  [
    ...MODIFIERS.flatMap(({ key, label }) => (shortcut[key] ? [label] : [])),
    shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key,
  ].join('+');

export const readShortcut: (() => Shortcut) & ((readStorageItem: StorageReader) => Shortcut) = (
  readStorageItem: StorageReader = readLocalStorageItem,
): Shortcut => {
  if (readStorageItem === readLocalStorageItem && !('localStorage' in globalThis)) {
    return DEFAULT_SHORTCUT;
  }

  try {
    const stored = readStorageItem(SHORTCUT_STORAGE_KEY);

    if (stored !== null && stored.length > 0) {
      const parsed: unknown = JSON.parse(stored);
      const result = Schema.decodeUnknownResult(ShortcutSchema)(parsed);

      if (result._tag === 'Success') {
        return result.success;
      }
    }
  } catch (error) {
    console.warn(
      'Could not read the developer feedback shortcut from browser storage; using the default shortcut.',
      error,
    );
  }

  return DEFAULT_SHORTCUT;
};

export const boundsFromPoints = (
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): Bounds => ({
  height: Math.abs(endY - startY),
  width: Math.abs(endX - startX),
  x: Math.min(startX, endX),
  y: Math.min(startY, endY),
});

const domDetails = (target: Element): DomDetails => {
  const tag = target.tagName.toLowerCase();
  const text = target.textContent.replaceAll(WHITESPACE, ' ').trim().slice(0, DOM_TEXT_LIMIT);
  const id = target.id ? `#${CSS.escape(target.id)}` : '';

  const classes = [...target.classList]
    .slice(0, SELECTOR_CLASS_LIMIT)
    .map((name) => `.${CSS.escape(name)}`)
    .join('');

  return { selector: `${tag}${id}${classes}`, tag, text };
};

const selectionSource = (target: Element): Selection['source'] => {
  for (
    let ancestor = false, current: Element | null = target;
    current;
    current = current.parentElement
  ) {
    const metadata = '__svelte_meta' in current ? current.__svelte_meta : undefined;
    const result = Schema.decodeUnknownResult(SvelteMetadataSchema)(metadata);

    if (result._tag === 'Success') {
      const { file, line, column } = result.success.loc;

      return {
        ancestor,
        column,
        file,
        line,
        vendor: VENDOR_PATH.test(file) || file.includes('/.pnpm/'),
      };
    }

    ancestor = true;
  }

  return null;
};

export const makeElementSelection = (target: Element): Selection => {
  const rect = target.getBoundingClientRect();

  return {
    bounds: { height: rect.height, width: rect.width, x: rect.x, y: rect.y },
    dom: { ...domDetails(target), kind: 'element' },
    kind: 'element',
    source: selectionSource(target),
  };
};

export const makeRectangleSelection = (bounds: Bounds, target?: Element): Selection => ({
  bounds,
  dom: target ? { ...domDetails(target), kind: 'rectangle-center' } : { kind: 'unavailable' },
  kind: 'rectangle',
  source: target ? selectionSource(target) : null,
});

export const snapshotFeedback = (selection: Selection, now = new Date()): FeedbackTarget => ({
  createdAt: now.toISOString(),
  id:
    ('randomUUID' in globalThis.crypto ? globalThis.crypto.randomUUID() : undefined) ??
    `${now.getTime()}-${Math.random().toString(ID_SUFFIX_RADIX).slice(ID_SUFFIX_OFFSET)}`,
  route: `${location.pathname}${location.search}${location.hash}`,
  selection,
  viewport: {
    devicePixelRatio: window.devicePixelRatio,
    height: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    width: window.innerWidth,
  },
});

export const viewportChanged = (feedback: Feedback): boolean =>
  feedback.route !== `${location.pathname}${location.search}${location.hash}` ||
  feedback.viewport.width !== window.innerWidth ||
  feedback.viewport.height !== window.innerHeight ||
  feedback.viewport.devicePixelRatio !== window.devicePixelRatio ||
  feedback.viewport.scrollX !== window.scrollX ||
  feedback.viewport.scrollY !== window.scrollY;

export const isAppElement = (node: HTMLElement): boolean =>
  node.closest('[data-ui-feedback], vite-error-overlay') === null;

export const captureViewport = async (signal?: AbortSignal): Promise<string> => {
  signal?.throwIfAborted();
  const { toPng } = await import('html-to-image');
  signal?.throwIfAborted();
  const width = window.innerWidth;
  const height = window.innerHeight;
  const root = document.documentElement;

  const screenshot = await toPng(root, {
    canvasHeight: height,
    canvasWidth: width,
    filter: (node) => !(node instanceof HTMLElement) || isAppElement(node),
    height,
    pixelRatio: window.devicePixelRatio,
    style: {
      height: `${Math.max(root.scrollHeight, height)}px`,
      overflow: 'visible',
      transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)`,
      transformOrigin: 'top left',
      width: `${Math.max(root.scrollWidth, width)}px`,
    },
    width,
  });

  // html-to-image has no cancellation API; discard its result if cancellation happened while it ran.
  signal?.throwIfAborted();

  return screenshot;
};

// Screenshots stay in an in-memory cache and IndexedDB; localStorage holds only metadata.
const openScreenshotDatabase = async (
  signal?: AbortSignal,
): Promise<Database<ScreenshotDatabase>> => {
  signal?.throwIfAborted();

  const databasePromise = openDB<ScreenshotDatabase>('ui-feedback', 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('screenshots')) {
        database.createObjectStore('screenshots');
      }
    },
  }).then((database) => {
    if (signal?.aborted === true) {
      database.close();
    }

    return database;
  });

  return await raceWithAbort(databasePromise, signal);
};

const screenshotRequest = async <Mode extends ScreenshotMode, Result>(
  mode: Mode,
  operation: (
    store: ObjectStore<ScreenshotDatabase, ['screenshots'], 'screenshots', Mode>,
  ) => Promise<Result> | Result,
  signal?: AbortSignal,
): Promise<Awaited<Result>> => {
  const database = await openScreenshotDatabase(signal);

  try {
    signal?.throwIfAborted();
    const transaction = database.transaction('screenshots', mode);

    const abortTransaction = () => {
      try {
        transaction.abort();
      } catch (error) {
        console.debug(
          'Could not abort the feedback screenshot transaction after it completed.',
          error,
        );
      }
    };

    signal?.addEventListener('abort', abortTransaction, { once: true });

    try {
      const resultPromise = Promise.resolve(operation(transaction.store));

      const [result] = await raceWithAbort(Promise.all([resultPromise, transaction.done]), signal);

      return result;
    } finally {
      signal?.removeEventListener('abort', abortTransaction);
    }
  } finally {
    database.close();
  }
};

export const saveScreenshot = async (
  id: string,
  screenshot: string,
  signal?: AbortSignal,
): Promise<void> => {
  signal?.throwIfAborted();
  SCREENSHOT_CACHE.set(id, screenshot);
  await screenshotRequest('readwrite', async (store) => await store.put(screenshot, id), signal);
};

export const loadScreenshot = async (
  id: string,
  signal?: AbortSignal,
): Promise<string | undefined> => {
  signal?.throwIfAborted();
  const cached = SCREENSHOT_CACHE.get(id);

  if (cached !== undefined) {
    return cached;
  }

  const screenshot: unknown = await screenshotRequest(
    'readonly',
    async (store) => await store.get(id),
    signal,
  );

  const result = Schema.decodeUnknownResult(ScreenshotSchema)(screenshot);

  if (result._tag === 'Success') {
    SCREENSHOT_CACHE.set(id, result.success);
  }

  return result._tag === 'Success' ? result.success : undefined;
};

export const removeScreenshot = async (id: string, signal?: AbortSignal): Promise<void> => {
  SCREENSHOT_CACHE.delete(id);
  await screenshotRequest(
    'readwrite',
    async (store) => {
      await store.delete(id);
    },
    signal,
  );
};

interface RestoredQueue {
  items: QueueItem[];
  warning: string;
}

export const restoreQueue: (() => RestoredQueue) &
  ((readStorageItem: StorageReader) => RestoredQueue) = (
  readStorageItem: StorageReader = readLocalStorageItem,
): RestoredQueue => {
  try {
    const serialized =
      readStorageItem(QUEUE_STORAGE_KEY) ?? readStorageItem(LEGACY_QUEUE_STORAGE_KEY);

    if (serialized === null || serialized.length === 0) {
      return { items: [], warning: '' };
    }

    const parsed: unknown = JSON.parse(serialized);
    const entries = Schema.decodeUnknownResult(SAVED_QUEUE_SCHEMA)(parsed);

    if (entries._tag === 'Failure') {
      return { items: [], warning: INVALID_QUEUE };
    }

    const decoded = entries.success.map((item) =>
      Schema.decodeUnknownResult(QueueItemSchema)(item),
    );

    return {
      items: decoded.flatMap((entry) => (entry._tag === 'Success' ? [entry.success] : [])),
      warning: decoded.some((entry) => entry._tag === 'Failure') ? INVALID_QUEUE : '',
    };
  } catch {
    return {
      items: [],
      warning: 'Saved feedback could not be read. Its browser storage has been left untouched.',
    };
  }
};
