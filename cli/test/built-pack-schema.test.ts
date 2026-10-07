import { Result, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { BuiltExamPackSchema } from '../src/core/built-pack-schema.js';
import { validPack } from './verify-helpers.js';

describe('BuiltExamPackSchema', () => {
  it('preserves absolute file URL sources when encoding', () => {
    const localNoteSource = {
      path: 'file:///notes/streaming.md',
      label: 'Streaming local note',
    };
    const pack = {
      ...validPack,
      questions: [
        {
          ...validPack.questions[0],
          sources: [localNoteSource],
        },
      ],
    };

    const encoded = Schema.encodeResult(BuiltExamPackSchema)(pack);

    expect(Result.isSuccess(encoded)).toBe(true);
    if (Result.isSuccess(encoded)) {
      expect(encoded.success.questions[0]?.sources[0]).toEqual(localNoteSource);
    }
  });

  it('accepts and preserves migrated citation metadata when encoding', () => {
    const citation = {
      kind: 'academy_note',
      path: 'file:///notes/streaming.md',
      label: 'Streaming local note',
      section: 'Checkpointing',
      documentationUrls: ['https://example.com/streaming'],
    };
    const pack = {
      ...validPack,
      questions: [{ ...validPack.questions[0], sources: [citation] }],
    };

    const encoded = Schema.encodeResult(BuiltExamPackSchema)(pack);

    expect(Result.isSuccess(encoded)).toBe(true);
    if (Result.isSuccess(encoded)) {
      expect(encoded.success.questions[0]?.sources[0]).toEqual(citation);
    }
  });
});
