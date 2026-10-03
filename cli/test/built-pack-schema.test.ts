import { Result, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { BuiltExamPackSchema } from '../src/core/built-pack-schema.js';
import { validPack } from './verify-helpers.js';

describe('BuiltExamPackSchema', () => {
  it('preserves the academy-note source discriminator and fields when encoding', () => {
    const academyNoteSource = {
      kind: 'academy_note' as const,
      path: 'notes/streaming.md',
      label: 'Streaming academy note',
      section: 'Backpressure',
      documentationUrls: ['https://example.test/docs/streaming'],
    };
    const pack = {
      ...validPack,
      questions: [
        {
          ...validPack.questions[0],
          sources: [academyNoteSource],
        },
      ],
    };

    const encoded = Schema.encodeResult(BuiltExamPackSchema)(pack);

    expect(Result.isSuccess(encoded)).toBe(true);
    if (Result.isSuccess(encoded)) {
      expect(encoded.success.questions[0]?.sources[0]).toEqual(academyNoteSource);
    }
  });
});
