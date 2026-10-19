import * as v from 'valibot';

export const LIMITS = {
  base64BytesPerChunk: 3,
  base64CharactersPerChunk: 4,
  coordinate: 1_000_000,
  dimension: 20_000,
  domSelector: 2000,
  domTag: 100,
  domText: 1000,
  feedbackText: 4096,
  id: 80,
  key: 100,
  note: 4000,
  pngBytes: 8_388_608,
  requestBytes: 12_582_912,
  route: 2048,
  viewportPixelRatioMaximum: 10,
  viewportPixelRatioMinimum: 0.1,
} as const;

const ID_PATTERN = /^[A-Za-z0-9_-]+$/u;
export const PNG_PREFIX = 'data:image/png;base64,';
export const PNG_PATTERN = /^data:image\/png;base64,(?<png>[A-Za-z0-9+/]+={0,2})$/u;

const text = v.pipe(v.string(), v.minLength(1), v.maxLength(LIMITS.feedbackText));
const id = v.pipe(v.string(), v.minLength(1), v.maxLength(LIMITS.id), v.regex(ID_PATTERN));
const size = v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(LIMITS.dimension));

const coordinate = v.pipe(
  v.number(),
  v.finite(),
  v.minValue(-LIMITS.coordinate),
  v.maxValue(LIMITS.coordinate),
);

export const ShortcutSchema = v.object({
  alt: v.boolean(),
  ctrl: v.boolean(),
  key: v.pipe(v.string(), v.minLength(1), v.maxLength(LIMITS.key)),
  meta: v.boolean(),
  shift: v.boolean(),
});

export const BoundsSchema = v.object({ height: size, width: size, x: coordinate, y: coordinate });

export const SvelteLocationSchema = v.object({
  column: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
  file: text,
  line: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
});

export const SvelteMetadataSchema = v.object({ loc: SvelteLocationSchema });

export const SourceSchema = v.object({
  ...SvelteLocationSchema.entries,
  ancestor: v.boolean(),
  vendor: v.boolean(),
});

export const DomDetailsSchema = v.object({
  selector: v.pipe(v.string(), v.minLength(1), v.maxLength(LIMITS.domSelector)),
  tag: v.pipe(v.string(), v.minLength(1), v.maxLength(LIMITS.domTag)),
  text: v.pipe(v.string(), v.maxLength(LIMITS.domText)),
});

export const SelectionSchema = v.variant('kind', [
  v.object({
    bounds: BoundsSchema,
    dom: v.object({ ...DomDetailsSchema.entries, kind: v.literal('element') }),
    kind: v.literal('element'),
    source: v.nullable(SourceSchema),
  }),
  v.object({
    bounds: BoundsSchema,
    dom: v.variant('kind', [
      v.object({ ...DomDetailsSchema.entries, kind: v.literal('rectangle-center') }),
      v.object({ kind: v.literal('unavailable') }),
    ]),
    kind: v.literal('rectangle'),
    source: v.nullable(SourceSchema),
  }),
]);

export const FeedbackSchema = v.object({
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  id,
  note: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(LIMITS.note)),
  route: v.pipe(v.string(), v.startsWith('/'), v.maxLength(LIMITS.route)),
  selection: SelectionSchema,
  viewport: v.object({
    devicePixelRatio: v.pipe(
      v.number(),
      v.finite(),
      v.minValue(LIMITS.viewportPixelRatioMinimum),
      v.maxValue(LIMITS.viewportPixelRatioMaximum),
    ),
    height: v.pipe(size, v.minValue(1)),
    scrollX: coordinate,
    scrollY: coordinate,
    width: v.pipe(size, v.minValue(1)),
  }),
});

export const SessionIdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(LIMITS.id));

export const SubmissionSchema = v.object({
  feedback: FeedbackSchema,
  screenshot: v.pipe(
    v.string(),
    v.maxLength(
      Math.ceil(LIMITS.pngBytes / LIMITS.base64BytesPerChunk) * LIMITS.base64CharactersPerChunk +
        PNG_PREFIX.length,
    ),
    v.regex(PNG_PATTERN),
  ),
  sessionId: v.optional(SessionIdSchema),
});

export const FilesSchema = v.object({ feedbackPath: text, screenshotPath: text });
export const SessionChoiceSchema = v.object({ id: SessionIdSchema, label: text });

export enum DeliveryStatus {
  Delivered = 'delivered',
  Choose = 'choose',
  Failed = 'failed',
}

export enum QueueStatus {
  Queued = 'queued',
  NeedsReselection = 'needs-reselection',
}

export enum CaptureStatus {
  Pending = 'pending',
  Captured = 'captured',
}

export enum RetryAction {
  Send = 'send',
  Check = 'check',
}

export enum DeliveryPhase {
  Capture = 'capture',
  Submit = 'submit',
}

export const DeliveredSchema = v.object({
  files: FilesSchema,
  message: text,
  status: v.literal(DeliveryStatus.Delivered),
});

export const ChoiceSchema = v.object({
  files: FilesSchema,
  message: text,
  sessions: v.pipe(v.array(SessionChoiceSchema), v.minLength(1)),
  status: v.literal(DeliveryStatus.Choose),
});

export const FailedSchema = v.object({
  files: v.nullable(FilesSchema),
  message: text,
  retry: v.picklist([RetryAction.Send, RetryAction.Check]),
  status: v.literal(DeliveryStatus.Failed),
});

export const DeliveryResultSchema = v.variant('status', [
  DeliveredSchema,
  ChoiceSchema,
  FailedSchema,
]);

export const QueueItemSchema = v.object({
  capture: v.picklist([CaptureStatus.Pending, CaptureStatus.Captured]),
  feedback: FeedbackSchema,
  result: v.variant('status', [
    v.object({ status: v.literal(QueueStatus.Queued) }),
    v.object({ message: text, status: v.literal(QueueStatus.NeedsReselection) }),
    DeliveredSchema,
    ChoiceSchema,
    FailedSchema,
  ]),
});

export type Bounds = v.InferOutput<typeof BoundsSchema>;

export type Shortcut = v.InferOutput<typeof ShortcutSchema>;

export type Selection = v.InferOutput<typeof SelectionSchema>;

export type FeedbackTarget = Omit<Feedback, 'note'>;

export type DomDetails = v.InferOutput<typeof DomDetailsSchema>;

export type Feedback = v.InferOutput<typeof FeedbackSchema>;

export type Submission = v.InferOutput<typeof SubmissionSchema>;

export type Files = v.InferOutput<typeof FilesSchema>;

export type SessionChoice = v.InferOutput<typeof SessionChoiceSchema>;

export type DeliveryResult = v.InferOutput<typeof DeliveryResultSchema>;

export type QueueItem = v.InferOutput<typeof QueueItemSchema>;
