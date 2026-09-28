import { describe, expect, it } from 'vitest';
import { allocateWeightedQuestions, findCoverageGaps } from '#lib/server/quiz/mock-selection.js';

describe('weighted mock selection', () => {
  it('allocates requested questions by blueprint weights using largest remainders', () => {
    const blueprint = [
      { id: 'a', title: 'Alpha', weight: 50 },
      { id: 'b', title: 'Beta', weight: 30 },
      { id: 'c', title: 'Gamma', weight: 20 },
    ];

    expect(allocateWeightedQuestions(blueprint, 7)).toEqual({ a: 4, b: 2, c: 1 });
  });

  it('reports each domain with fewer questions than its weighted quota', () => {
    const blueprint = [
      { id: 'a', title: 'Alpha', weight: 60 },
      { id: 'b', title: 'Beta', weight: 40 },
    ];

    expect(findCoverageGaps(blueprint, { a: 2, b: 5 }, 5)).toEqual([
      { id: 'a', title: 'Alpha', required: 3, available: 2, missing: 1 },
    ]);
  });
});
