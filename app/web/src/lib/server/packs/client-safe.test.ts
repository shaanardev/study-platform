import { validateExamPack } from '@learning-platform/exam-pack';
import { describe, expect, it } from 'vitest';

import { sampleLearningPackFixture } from '#lib/test-fixtures.js';

import {
  restoreCorrectionSourcePaths,
  toClientSafeFeedbackItem,
  toClientSafeReviewPack,
} from './client-safe.js';

describe('client-safe pack projections', () => {
  it('replaces citation paths with opaque references and restores edited references on the server', () => {
    const result = validateExamPack(sampleLearningPackFixture());

    expect.assert(result.valid, result.errors.join('\n'));

    const { pack } = result;
    const [question] = pack.questions;
    const source = question?.sources[0];

    expect.assert(question, 'Fixture has no question.');
    expect.assert(source, 'Fixture question has no citation.');

    const safePack = toClientSafeReviewPack(pack);
    const safeSource = safePack.questions[0]?.sources[0];

    expect.assert(safeSource, 'Safe question has no citation.');
    expect(safeSource.path).not.toBe(source.path);
    expect(safeSource.label).toBe(source.label);
    expect(JSON.stringify(safePack)).not.toContain(source.path);
    expect(
      restoreCorrectionSourcePaths(
        { sources: [{ label: source.label, path: safeSource.path }] },
        pack,
        question.id,
      ),
    ).toStrictEqual({ sources: [source] });

    const safeFeedback = toClientSafeFeedbackItem({
      correction: { sources: [source] },
      examId: pack.exam.id,
      flags: [],
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionId: question.id,
      retired: false,
    });

    expect(JSON.stringify(safeFeedback)).not.toContain(source.path);
  });
});
