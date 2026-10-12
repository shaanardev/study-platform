import { Result, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { BuiltExamPackSchema } from '../src/core/built-pack-schema.js';
import { validPack } from './verify-helpers.js';

describe(BuiltExamPackSchema, () => {
  it('preserves absolute file URL sources when encoding', () => {
    const localNoteSource = {
      label: 'Streaming local note',
      path: 'file:///notes/streaming.md',
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

    expect(Result.isSuccess(encoded)).toBeTruthy();
    expect(encoded).toMatchObject({
      success: { questions: [{ sources: [localNoteSource] }] },
    });
  });

  it('accepts and preserves migrated citation metadata when encoding', () => {
    const citation = {
      documentationUrls: ['https://example.com/streaming'],
      kind: 'academy_note',
      label: 'Streaming local note',
      path: 'file:///notes/streaming.md',
      section: 'Checkpointing',
    };
    const pack = {
      ...validPack,
      questions: [{ ...validPack.questions[0], sources: [citation] }],
    };

    const encoded = Schema.encodeResult(BuiltExamPackSchema)(pack);

    expect(Result.isSuccess(encoded)).toBeTruthy();
    expect(encoded).toMatchObject({ success: { questions: [{ sources: [citation] }] } });
  });
});
