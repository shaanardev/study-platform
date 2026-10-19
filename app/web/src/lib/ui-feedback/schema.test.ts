import * as Schema from 'effect/Schema';
import { describe, expect, it } from 'vitest';

import { mockUiFeedback } from '#lib/test-fixtures.js';

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

describe('feedback contracts', () => {
  it('requires DOM provenance to agree with the selection variant', () => {
    const feedback = mockUiFeedback({ note: 'Fix the overlap.' });
    const { selection } = feedback;
    expect([
      Schema.is(SelectionSchema)(selection),
      Schema.is(SelectionSchema)({
        ...selection,
        dom: { ...selection.dom, kind: 'rectangle-center' },
      }),
      Schema.is(SelectionSchema)({ ...selection, dom: { kind: 'unavailable' }, kind: 'rectangle' }),
      Schema.is(SelectionSchema)({
        ...selection,
        kind: 'rectangle',
        source: { ancestor: false, column: 1, file: 'page.svelte', line: 1, vendor: false },
      }),
    ]).toStrictEqual([true, false, true, false]);
  });

  it('rejects incomplete delivery variants and empty session choices', () => {
    const files = {
      feedbackPath: '/repo/.ui-feedback/feedback-1.json',
      screenshotPath: '/repo/.ui-feedback/feedback-1.png',
    };

    expect([
      Schema.is(DeliveryResultSchema)({
        files,
        message: 'Receipt verified.',
        status: DeliveryStatus.Delivered,
      }),
      Schema.is(DeliveryResultSchema)({
        message: 'Process started.',
        status: DeliveryStatus.Delivered,
      }),
      Schema.is(DeliveryResultSchema)({
        files,
        message: 'Choose a session.',
        sessions: [],
        status: DeliveryStatus.Choose,
      }),
      Schema.is(DeliveryResultSchema)({
        files: null,
        message: 'Unavailable.',
        retry: RetryAction.Send,
        status: DeliveryStatus.Failed,
      }),
      Schema.is(DeliveryResultSchema)({
        files: null,
        message: 'Unavailable.',
        status: DeliveryStatus.Failed,
      }),
    ]).toStrictEqual([true, false, false, true, false]);
  });

  it('uses the same validated feedback shape for submissions and saved queue items', () => {
    const feedback = mockUiFeedback();

    const queued = {
      capture: CaptureStatus.Pending,
      feedback,
      result: { status: QueueStatus.Queued },
    };

    expect(Schema.is(QueueItemSchema)(queued)).toBeTruthy();
    expect(
      Schema.is(QueueItemSchema)({
        ...queued,
        feedback: { ...feedback, viewport: { ...feedback.viewport, width: '1024' } },
      }),
    ).toBeFalsy();
    expect(
      Schema.is(SubmissionSchema)({ feedback, screenshot: 'data:image/jpeg;base64,invalid' }),
    ).toBeFalsy();
    expect(Schema.is(FeedbackSchema)({ ...feedback, id: '../outside', note: '   ' })).toBeFalsy();

    const decoded = Schema.decodeUnknownSync(FeedbackSchema)({
      ...feedback,
      note: '  Fix the overlap.  ',
    });

    expect(decoded.note).toBe('Fix the overlap.');
  });

  it('accepts real source coordinates and rejects non-finite metadata', () => {
    const loc = { column: 0, file: 'src/routes/+page.svelte', line: 23 };
    expect(Schema.decodeUnknownResult(SvelteMetadataSchema)({ loc })._tag).toBe('Success');
    expect(
      Schema.decodeUnknownResult(SvelteMetadataSchema)({
        loc: { ...loc, line: Number.NaN },
      })._tag,
    ).toBe('Failure');
  });
});
