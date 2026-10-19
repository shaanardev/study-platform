import sampleLearningPack from '../../../../packs/incoming/sample-learning-pack.json' with { type: 'json' };
import { DeliveryStatus } from './ui-feedback/schema.js';
import type { DeliveryResult, Feedback } from './ui-feedback/schema.js';

export const sampleLearningPackFixture = () => structuredClone(sampleLearningPack);

export const mockUiFeedback = (overrides: Partial<Feedback> = {}): Feedback =>
  structuredClone({
    createdAt: '2026-10-16T00:00:00.000Z',
    id: 'feedback-1',
    note: 'The button overlaps the label.',
    route: '/practice',
    selection: {
      bounds: { height: 1, width: 1, x: 0, y: 0 },
      dom: {
        kind: 'element' as const,
        selector: 'button.primary',
        tag: 'button',
        text: 'Continue',
      },
      kind: 'element' as const,
      source: null,
    },
    viewport: { devicePixelRatio: 1, height: 1, scrollX: 0, scrollY: 0, width: 1 },
    ...overrides,
  });

export const mockDeliveredUiFeedback = (message = 'Receipt verified'): DeliveryResult => ({
  files: { feedbackPath: 'feedback/note.json', screenshotPath: 'feedback/screen.png' },
  message,
  status: DeliveryStatus.Delivered,
});
