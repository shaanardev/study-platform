import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import * as v from 'valibot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SHORTCUT, QUEUE_STORAGE_KEY } from './client';
import type * as Client from './client';
import FeedbackOverlay from './feedback-overlay.svelte';
import type * as Remote from './feedback.remote';
import { CaptureStatus, DeliveryStatus } from './schema';
import type { DeliveryResult } from './schema';

const captureViewport = vi.fn<typeof Client.captureViewport>();
const loadScreenshot = vi.fn<typeof Client.loadScreenshot>();
const submitFeedback = vi.fn<typeof Remote.submitFeedback>();
const getMockCallCount = (mock: { mock: { calls: unknown[][] } }) => mock.mock.calls.length;

const delivered = (message = 'Receipt verified'): DeliveryResult => ({
  files: { feedbackPath: 'feedback/note.json', screenshotPath: 'feedback/screen.png' },
  message,
  status: DeliveryStatus.Delivered,
});

const toggle = async (target: Element | Document = document) =>
  await fireEvent.keyDown(target, {
    altKey: DEFAULT_SHORTCUT.alt,
    ctrlKey: DEFAULT_SHORTCUT.ctrl,
    key: DEFAULT_SHORTCUT.key,
    metaKey: DEFAULT_SHORTCUT.meta,
    shiftKey: DEFAULT_SHORTCUT.shift,
  });

const renderOverlay = () =>
  render(FeedbackOverlay, {
    props: { captureViewport, loadScreenshot, submitFeedback },
  });

const getFirstEditButton = () =>
  v.parse(v.instance(HTMLElement), screen.getAllByRole('button', { name: 'Edit' }).at(0));

const getStoredQueue = () => v.parse(v.string(), localStorage.getItem(QUEUE_STORAGE_KEY));

const selectAndQueue = async (note: string, drag = false) => {
  const target = document.createElement('button');
  target.textContent = 'App target';
  document.body.append(target);
  await fireEvent(
    target,
    new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 20, clientY: 30 }),
  );
  await fireEvent(
    target,
    new MouseEvent('pointerup', {
      bubbles: true,
      button: 0,
      clientX: drag ? 64 : 20,
      clientY: drag ? 78 : 30,
    }),
  );
  await fireEvent.click(target);
  target.remove();
  await fireEvent.input(screen.getByLabelText('What should we know?'), { target: { value: note } });
  await fireEvent.click(screen.getByRole('button', { name: 'Queue note' }));
};

describe('developer feedback overlay', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    captureViewport.mockResolvedValue('data:image/png;base64,test');
    loadScreenshot.mockResolvedValue('data:image/png;base64,test');
    submitFeedback.mockResolvedValue(delivered());
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn<() => Element[]>(() => []),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('toggles outside typing controls and lets Escape exit', async () => {
    renderOverlay();
    const input = document.createElement('input');
    document.body.append(input);
    await toggle(input);
    expect(screen.queryByRole('complementary')).toBeNull();
    input.remove();
    await toggle();
    expect(screen.getByRole('complementary', { name: 'Developer feedback' })).toBeTruthy();
    expect(screen.getByText(/click an element, or drag to select an area/iu)).toBeTruthy();
    await fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('lets consecutive notes be selected without reopening selection mode', async () => {
    renderOverlay();
    await toggle();
    expect(screen.queryByRole('button', { name: 'Select page area' })).toBeNull();
    await selectAndQueue('First note');
    expect(screen.getByText(/click an element, or drag to select an area/iu)).toBeTruthy();
    await selectAndQueue('Second note', true);
    expect(screen.getByText('First note', { exact: true })).toBeTruthy();
    expect(screen.getByText('Second note', { exact: true })).toBeTruthy();
  });

  it('returns to page selection after Escape or Cancel while editing', async () => {
    renderOverlay();
    await toggle();
    await selectAndQueue('Editable note');
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByText(/click an element, or drag to select an area/iu)).toBeTruthy();

    await selectAndQueue('Another note');
    await fireEvent.click(getFirstEditButton());
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText(/click an element, or drag to select an area/iu)).toBeTruthy();
  });

  it('lets queued notes be edited or removed before capture', async () => {
    renderOverlay();
    await toggle();
    await selectAndQueue('Original note');
    expect([captureViewport.mock.calls, submitFeedback.mock.calls]).toStrictEqual([[], []]);
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await fireEvent.input(screen.getByLabelText('What should we know?'), {
      target: { value: 'Edited note' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByText('Edited note', { exact: true })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByRole('region', { name: 'Feedback queue' })).toBeNull();
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it('retains failed feedback and retries the same captured submission', async () => {
    vi.stubGlobal('indexedDB', null);
    submitFeedback
      .mockRejectedValueOnce(new Error('Herdr unavailable'))
      .mockResolvedValueOnce(delivered());
    renderOverlay();
    await toggle();
    await selectAndQueue('Keep this note');
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(screen.getByText('Herdr unavailable')).toBeTruthy();
    });
    expect([
      screen.getByText('Keep this note', { exact: true }),
      screen.getByText(/retry image could not be saved/iu),
    ]).toHaveLength(2);
    await fireEvent.click(screen.getByRole('button', { name: 'Check receipt' }));
    await waitFor(() => {
      expect(screen.getByText('Receipt verified')).toBeTruthy();
    });
    const submissions = submitFeedback.mock.calls;
    expect(submissions).toHaveLength(2);
    expect(submissions[1]?.[0]).toStrictEqual(submissions[0]?.[0]);
  });

  it('preserves the note and offers reselection after a capture failure', async () => {
    captureViewport.mockRejectedValueOnce(new Error('Canvas unavailable'));
    submitFeedback.mockResolvedValue(delivered());
    renderOverlay();
    await toggle();
    await selectAndQueue('Keep the capture failure');
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(screen.getByText('Canvas unavailable')).toBeTruthy();
    });
    expect(screen.getByText('Keep the capture failure', { exact: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reselect' })).toBeTruthy();
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it('logs a saved screenshot failure and preserves the note for reselection', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failure = new Error('IndexedDB unavailable');

    try {
      renderOverlay();
      await toggle();
      await selectAndQueue('Keep the retry note');
      const stored = getStoredQueue();
      expect(stored).not.toBe('');

      localStorage.setItem(
        QUEUE_STORAGE_KEY,
        stored.replace(
          `"capture":"${CaptureStatus.Pending}"`,
          `"capture":"${CaptureStatus.Captured}"`,
        ),
      );
      cleanup();
      loadScreenshot.mockRejectedValueOnce(failure);
      renderOverlay();
      await toggle();
      await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      await waitFor(() => {
        expect(screen.getByText(/saved retry image is unavailable/iu)).toBeTruthy();
      });
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining('saved feedback screenshot'),
        failure,
      );
      expect([
        screen.getByText('Keep the retry note', { exact: true }),
        screen.getByRole('button', { name: 'Reselect and retry' }),
      ]).toHaveLength(2);
      expect(submitFeedback).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });

  it('requires a selected session when the remote command requests one', async () => {
    const choose: DeliveryResult = {
      files: { feedbackPath: 'feedback/note.json', screenshotPath: 'feedback/screen.png' },
      message: 'Choose a matching session',
      sessions: [
        { id: 'agent-a', label: 'Agent A' },
        { id: 'agent-b', label: 'Agent B' },
      ],
      status: DeliveryStatus.Choose,
    };

    submitFeedback.mockResolvedValueOnce(choose).mockResolvedValueOnce(delivered());
    renderOverlay();
    await toggle();
    await selectAndQueue('Choose my agent');
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeTruthy();
    });
    expect(getMockCallCount(submitFeedback)).toBe(1);
    await fireEvent.change(screen.getByRole('combobox'), { target: { value: 'agent-b' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send to session' }));
    await waitFor(() => {
      expect(screen.getByText('Receipt verified')).toBeTruthy();
    });
    expect(submitFeedback.mock.calls.at(1)?.at(0)?.sessionId).toBe('agent-b');
  });

  it('ignores malformed saved queue entries without preventing feedback mode', async () => {
    localStorage.setItem('ui-feedback-queue', '[{"stale":true}]');
    renderOverlay();
    await toggle();
    expect(screen.getByRole('complementary', { name: 'Developer feedback' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Feedback queue' })).toBeNull();
  });

  it('gives an edited captured note a new identity before sending it', async () => {
    submitFeedback
      .mockResolvedValueOnce({
        files: {
          feedbackPath: '/feedback/original.json',
          screenshotPath: '/feedback/original.png',
        },
        message: 'Choose a session',
        sessions: [{ id: 'agent-a', label: 'Agent A' }],
        status: DeliveryStatus.Choose,
      })
      .mockResolvedValueOnce(delivered());
    renderOverlay();
    await toggle();
    await selectAndQueue('Original captured note');
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeTruthy();
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await fireEvent.input(screen.getByLabelText('What should we know?'), {
      target: { value: 'Edited captured note' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(screen.getByText('Receipt verified')).toBeTruthy();
    });
    const { calls } = submitFeedback.mock;
    expect(calls.at(1)?.[0].feedback.id).not.toBe(calls.at(0)?.[0].feedback.id);
    expect(calls.at(1)?.[0].feedback.note).toBe('Edited captured note');
  });

  it('preserves incompatible older queue data when saving a new note', async () => {
    const legacy = '[{"stale":true}]';
    localStorage.setItem('ui-feedback-queue', legacy);
    renderOverlay();
    await toggle();
    await selectAndQueue('A new note');
    expect(localStorage.getItem('ui-feedback-queue')).toBe(legacy);
    expect(localStorage.getItem(QUEUE_STORAGE_KEY)).toContain('A new note');
  });

  it('cancels capture and ignores a screenshot that resolves after cancellation', async () => {
    const pendingCapture = Promise.withResolvers<string>();
    captureViewport.mockReturnValue(pendingCapture.promise);
    renderOverlay();
    await toggle();
    await selectAndQueue('Cancel capture safely');
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel capture' })).toBeTruthy();
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel capture' }));
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
    pendingCapture.resolve('data:image/png;base64,stale');
    await waitFor(() => {
      expect(getMockCallCount(captureViewport)).toBe(1);
    });
    expect(submitFeedback).not.toHaveBeenCalled();
    expect(screen.getByText('queued', { exact: true })).toBeTruthy();
  });

  it('stops waiting for the remote command and ignores its late response', async () => {
    const pendingSubmission = Promise.withResolvers<DeliveryResult>();
    submitFeedback.mockReturnValue(
      Object.assign(pendingSubmission.promise, {
        updates: async () => await pendingSubmission.promise,
      }),
    );
    renderOverlay();
    await toggle();
    await selectAndQueue('Keep the in-flight note');
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(getMockCallCount(submitFeedback)).toBe(1);
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Stop waiting for response' }));
    expect([
      screen.getByText(/remote command may still finish/iu),
      screen.getByRole('button', { name: 'Check receipt' }),
    ]).toHaveLength(2);
    pendingSubmission.resolve(delivered('Late response'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Check receipt' })).toBeTruthy();
    });
    expect(screen.queryByText('Late response')).toBeNull();
    expect(screen.getByText('Keep the in-flight note', { exact: true })).toBeTruthy();
  });
});
