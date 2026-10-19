import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import {
  CaptureStatus,
  DeliveryStatus,
  DeliveryResultSchema,
  FeedbackSchema,
  QueueItemSchema,
  QueueStatus,
  RetryAction,
  SelectionSchema,
  SubmissionSchema,
  SvelteMetadataSchema,
} from './schema';

const feedback = {
  createdAt: '2026-10-16T00:00:00.000Z',
  id: 'feedback-1',
  note: 'Fix the overlap.',
  route: '/practice',
  selection: {
    bounds: { height: 30, width: 100, x: 10, y: 20 },
    dom: { kind: 'element', selector: 'button', tag: 'button', text: 'Continue' },
    kind: 'element',
    source: null,
  },
  viewport: { devicePixelRatio: 1, height: 768, scrollX: 0, scrollY: 0, width: 1024 },
};

const files = {
  feedbackPath: '/repo/.ui-feedback/feedback-1.json',
  screenshotPath: '/repo/.ui-feedback/feedback-1.png',
};

describe('feedback contracts', () => {
  it('requires DOM provenance to agree with the selection variant', () => {
    const { selection } = feedback;
    expect([
      v.is(SelectionSchema, selection),
      v.is(SelectionSchema, { ...selection, dom: { ...selection.dom, kind: 'rectangle-center' } }),
      v.is(SelectionSchema, { ...selection, dom: { kind: 'unavailable' }, kind: 'rectangle' }),
      v.is(SelectionSchema, {
        ...selection,
        kind: 'rectangle',
        source: { ancestor: false, column: 1, file: 'page.svelte', line: 1, vendor: false },
      }),
    ]).toStrictEqual([true, false, true, false]);
  });

  it('rejects incomplete delivery variants and empty session choices', () => {
    expect([
      v.is(DeliveryResultSchema, {
        files,
        message: 'Receipt verified.',
        status: DeliveryStatus.Delivered,
      }),
      v.is(DeliveryResultSchema, {
        message: 'Process started.',
        status: DeliveryStatus.Delivered,
      }),
      v.is(DeliveryResultSchema, {
        files,
        message: 'Choose a session.',
        sessions: [],
        status: DeliveryStatus.Choose,
      }),
      v.is(DeliveryResultSchema, {
        files: null,
        message: 'Unavailable.',
        retry: RetryAction.Send,
        status: DeliveryStatus.Failed,
      }),
      v.is(DeliveryResultSchema, {
        files: null,
        message: 'Unavailable.',
        status: DeliveryStatus.Failed,
      }),
    ]).toStrictEqual([true, false, false, true, false]);
  });

  it('uses the same validated feedback shape for submissions and saved queue items', () => {
    const queued = {
      capture: CaptureStatus.Pending,
      feedback,
      result: { status: QueueStatus.Queued },
    };

    expect(v.is(QueueItemSchema, queued)).toBeTruthy();
    expect(
      v.is(QueueItemSchema, {
        ...queued,
        feedback: { ...feedback, viewport: { ...feedback.viewport, width: '1024' } },
      }),
    ).toBeFalsy();
    expect(
      v.is(SubmissionSchema, { feedback, screenshot: 'data:image/jpeg;base64,invalid' }),
    ).toBeFalsy();
    expect(v.is(FeedbackSchema, { ...feedback, id: '../outside', note: '   ' })).toBeFalsy();
  });

  it('accepts real source coordinates and rejects non-finite metadata', () => {
    const loc = { column: 0, file: 'src/routes/+page.svelte', line: 23 };
    expect(v.safeParse(SvelteMetadataSchema, { loc }).success).toBeTruthy();
    expect(
      v.safeParse(SvelteMetadataSchema, { loc: { ...loc, line: Number.NaN } }).success,
    ).toBeFalsy();
  });
});
