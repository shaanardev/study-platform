import * as Schema from 'effect/Schema';

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

const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:[12]\d|0[1-9]|3[01])[T ](?:0\d|1\d|2[0-3])(?::[0-5]\d){2}(?:\.\d{1,9})?(?:Z| ?[+-](?:0\d|1\d|2[0-3])(?::?[0-5]\d)?)$/u;

export const PNG_PREFIX = 'data:image/png;base64,';
export const PNG_PATTERN = /^data:image\/png;base64,(?<png>[A-Za-z0-9+/]+={0,2})$/u;

const text = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(LIMITS.feedbackText));

const id = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(LIMITS.id),
  Schema.isPattern(ID_PATTERN),
);

const size = Schema.Finite.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(LIMITS.dimension),
);

const coordinate = Schema.Finite.check(
  Schema.isGreaterThanOrEqualTo(-LIMITS.coordinate),
  Schema.isLessThanOrEqualTo(LIMITS.coordinate),
);

const safeInteger = Schema.Number.check(Schema.makeFilter((value) => Number.isSafeInteger(value)));

const note = Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(LIMITS.note));

export const ShortcutSchema = Schema.Struct({
  alt: Schema.Boolean,
  ctrl: Schema.Boolean,
  key: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(LIMITS.key)),
  meta: Schema.Boolean,
  shift: Schema.Boolean,
});

export const BoundsSchema = Schema.Struct({
  height: size,
  width: size,
  x: coordinate,
  y: coordinate,
});

export const SvelteLocationSchema = Schema.Struct({
  column: safeInteger.check(Schema.isGreaterThanOrEqualTo(0)),
  file: text,
  line: safeInteger.check(Schema.isGreaterThanOrEqualTo(1)),
});

export const SvelteMetadataSchema = Schema.Struct({ loc: SvelteLocationSchema });

export const SourceSchema = Schema.Struct({
  ...SvelteLocationSchema.fields,
  ancestor: Schema.Boolean,
  vendor: Schema.Boolean,
});

export const DomDetailsSchema = Schema.Struct({
  selector: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(LIMITS.domSelector)),
  tag: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(LIMITS.domTag)),
  text: Schema.String.check(Schema.isMaxLength(LIMITS.domText)),
});

const ElementSelectionSchema = Schema.Struct({
  bounds: BoundsSchema,
  dom: Schema.Struct({ ...DomDetailsSchema.fields, kind: Schema.Literal('element') }),
  kind: Schema.Literal('element'),
  source: Schema.NullOr(SourceSchema),
});

const RectangleSelectionSchema = Schema.Struct({
  bounds: BoundsSchema,
  dom: Schema.Union([
    Schema.Struct({ ...DomDetailsSchema.fields, kind: Schema.Literal('rectangle-center') }),
    Schema.Struct({ kind: Schema.Literal('unavailable') }),
  ]),
  kind: Schema.Literal('rectangle'),
  source: Schema.NullOr(SourceSchema),
});

export const SelectionSchema = Schema.Union([ElementSelectionSchema, RectangleSelectionSchema]);

export const FeedbackSchema = Schema.Struct({
  createdAt: Schema.String.check(Schema.isPattern(ISO_TIMESTAMP_PATTERN)),
  id,
  note,
  route: Schema.String.check(Schema.isPattern(/^\//u), Schema.isMaxLength(LIMITS.route)),
  selection: SelectionSchema,
  viewport: Schema.Struct({
    devicePixelRatio: Schema.Finite.check(
      Schema.isGreaterThanOrEqualTo(LIMITS.viewportPixelRatioMinimum),
      Schema.isLessThanOrEqualTo(LIMITS.viewportPixelRatioMaximum),
    ),
    height: size.check(Schema.isGreaterThanOrEqualTo(1)),
    scrollX: coordinate,
    scrollY: coordinate,
    width: size.check(Schema.isGreaterThanOrEqualTo(1)),
  }),
});

export const SessionIdSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(LIMITS.id),
);

export const ScreenshotSchema = Schema.String.check(
  Schema.isMaxLength(
    Math.ceil(LIMITS.pngBytes / LIMITS.base64BytesPerChunk) * LIMITS.base64CharactersPerChunk +
      PNG_PREFIX.length,
  ),
  Schema.isPattern(PNG_PATTERN),
);

export const SubmissionSchema = Schema.Struct({
  feedback: FeedbackSchema,
  screenshot: ScreenshotSchema,
  sessionId: Schema.optional(SessionIdSchema),
});

export const FilesSchema = Schema.Struct({ feedbackPath: text, screenshotPath: text });
export const SessionChoiceSchema = Schema.Struct({ id: SessionIdSchema, label: text });

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

export const DeliveredSchema = Schema.Struct({
  files: FilesSchema,
  message: text,
  status: Schema.Literal(DeliveryStatus.Delivered),
});

export const ChoiceSchema = Schema.Struct({
  files: FilesSchema,
  message: text,
  sessions: Schema.Array(SessionChoiceSchema).check(Schema.isMinLength(1)),
  status: Schema.Literal(DeliveryStatus.Choose),
});

export const FailedSchema = Schema.Struct({
  files: Schema.NullOr(FilesSchema),
  message: text,
  retry: Schema.Literals([RetryAction.Send, RetryAction.Check]),
  status: Schema.Literal(DeliveryStatus.Failed),
});

export const DeliveryResultSchema = Schema.Union([DeliveredSchema, ChoiceSchema, FailedSchema]);

const QueuedResultSchema = Schema.Struct({ status: Schema.Literal(QueueStatus.Queued) });

const NeedsReselectionResultSchema = Schema.Struct({
  message: text,
  status: Schema.Literal(QueueStatus.NeedsReselection),
});

export const QueueItemSchema = Schema.Struct({
  capture: Schema.Literals([CaptureStatus.Pending, CaptureStatus.Captured]),
  feedback: FeedbackSchema,
  result: Schema.Union([
    QueuedResultSchema,
    NeedsReselectionResultSchema,
    DeliveredSchema,
    ChoiceSchema,
    FailedSchema,
  ]),
});

export type Bounds = typeof BoundsSchema.Type;

export type Shortcut = typeof ShortcutSchema.Type;

export type Selection = typeof SelectionSchema.Type;

export type FeedbackTarget = Omit<Feedback, 'note'>;

export type DomDetails = typeof DomDetailsSchema.Type;

export type Feedback = Omit<typeof FeedbackSchema.Type, 'note'> & { readonly note: string };

export type Submission = Omit<typeof SubmissionSchema.Type, 'feedback'> & {
  readonly feedback: Feedback;
};

export type Files = typeof FilesSchema.Type;

export type SessionChoice = typeof SessionChoiceSchema.Type;

export type DeliveryResult = typeof DeliveryResultSchema.Type;

export type QueueItem = Omit<typeof QueueItemSchema.Type, 'feedback'> & {
  readonly feedback: Feedback;
};
