import { Result, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { BuiltExamPackSchema } from '../src/core/built-pack-schema.js';
import { validPack } from './pack-fixture.js';

describe(BuiltExamPackSchema, () => {
  it('preserves absolute file URL sources when encoding', () => {
    const [question] = validPack.questions;
    expect.assert(question, 'Expected a question in the valid pack fixture');

    const localNoteSource = {
      label: 'Streaming local note',
      path: 'file:///notes/streaming.md',
    };

    const pack = {
      ...validPack,
      questions: [
        {
          ...question,
          sources: [localNoteSource],
        },
      ],
    };

    const encoded = Schema.encodeUnknownResult(BuiltExamPackSchema)(pack);

    expect(Result.isSuccess(encoded)).toBeTruthy();
    expect(encoded).toMatchObject({
      success: { questions: [{ sources: [localNoteSource] }] },
    });
  });

  it('accepts and preserves migrated citation metadata when encoding', () => {
    const [question] = validPack.questions;
    expect.assert(question, 'Expected a question in the valid pack fixture');

    const citation = {
      documentationUrls: ['https://example.com/streaming'],
      kind: 'academy_note',
      label: 'Streaming local note',
      path: 'file:///notes/streaming.md',
      section: 'Checkpointing',
    };

    const pack = {
      ...validPack,
      questions: [{ ...question, sources: [citation] }],
    };

    const encoded = Schema.encodeUnknownResult(BuiltExamPackSchema)(pack);

    expect(Result.isSuccess(encoded)).toBeTruthy();
    expect(encoded).toMatchObject({ success: { questions: [{ sources: [citation] }] } });
  });
});
