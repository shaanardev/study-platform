import { describe, expect, it } from 'vitest';

import { filterReviewQuestions } from './review-filters';

const questions = [
  { domainId: 'network', id: 'network-1', prompt: 'Configure a network' },
  { domainId: 'storage', id: 'storage-1', prompt: 'Review storage access' },
  { domainId: 'network', id: 'network-2', prompt: 'Inspect subnet rules' },
];

const feedback = [
  { flags: [{ reason: 'Ambiguous wording' }], questionId: 'network-1', retired: false },
  { flags: [], questionId: 'storage-1', retired: true },
];

const noFilters = { domainId: '', flagged: false, retired: false, search: '' };

describe('review question filters', () => {
  it('searches prompt and question ID without regard to case', () => {
    expect(
      filterReviewQuestions(questions, feedback, { ...noFilters, search: 'NETWORK-2' }),
    ).toStrictEqual([questions[2]]);
    expect(
      filterReviewQuestions(questions, feedback, { ...noFilters, search: 'STORAGE ACCESS' }),
    ).toStrictEqual([questions[1]]);
  });

  it('combines domain, flagged, and retired filters', () => {
    expect(
      filterReviewQuestions(questions, feedback, {
        ...noFilters,
        domainId: 'network',
        flagged: true,
      }),
    ).toStrictEqual([questions[0]]);
    expect(
      filterReviewQuestions(questions, feedback, {
        ...noFilters,
        flagged: true,
        retired: true,
      }),
    ).toStrictEqual([]);
  });

  it('keeps unfiltered questions that have no feedback', () => {
    expect(filterReviewQuestions(questions, feedback, noFilters)).toStrictEqual(questions);
  });
});
