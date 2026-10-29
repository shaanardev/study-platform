import { resolve } from '$app/paths';
import { describe, expect, it } from 'vitest';

import { practiceSourcePath, reviewActionPath, reviewPackSelectionPath } from './route-urls.js';

const packSelection = {
  examId: 'sample.exam_2026',
  packId: 'pack-foundations-v2',
  packVersion: '2026-05-04+notes/rc|1',
};

describe('route URL helpers', () => {
  it('resolves source paths and round-trips identifiers and special-character source paths', () => {
    const sourcePath = 'course notes/Section #2?topic=SQL & C%2B%2B.md';

    const sourceUrl = new URL(
      resolve(
        practiceSourcePath({ ...packSelection, path: sourcePath, questionId: 'question_2.1' }),
      ),
      'http://localhost',
    );

    expect({
      examId: sourceUrl.searchParams.get('examId'),
      packId: sourceUrl.searchParams.get('packId'),
      packVersion: sourceUrl.searchParams.get('packVersion'),
      path: sourceUrl.searchParams.get('path'),
      pathname: sourceUrl.pathname,
      questionId: sourceUrl.searchParams.get('questionId'),
    }).toStrictEqual({
      examId: packSelection.examId,
      packId: packSelection.packId,
      packVersion: packSelection.packVersion,
      path: sourcePath,
      pathname: resolve('/practice/source'),
      questionId: 'question_2.1',
    });
  });

  it('resolves Review pack-selection URLs with filters without losing the pack version', () => {
    const reviewUrl = new URL(
      resolve(
        reviewPackSelectionPath(packSelection, {
          domainId: 'platform-sql',
          flagged: true,
          retired: true,
          search: 'schema #2 + state',
        }),
      ),
      'http://localhost',
    );

    expect({
      domain: reviewUrl.searchParams.get('domain'),
      examId: reviewUrl.searchParams.get('examId'),
      flagged: reviewUrl.searchParams.get('flagged'),
      packId: reviewUrl.searchParams.get('packId'),
      packVersion: reviewUrl.searchParams.get('packVersion'),
      pathname: reviewUrl.pathname,
      q: reviewUrl.searchParams.get('q'),
      retired: reviewUrl.searchParams.get('retired'),
    }).toStrictEqual({
      domain: 'platform-sql',
      examId: packSelection.examId,
      flagged: '',
      packId: packSelection.packId,
      packVersion: packSelection.packVersion,
      pathname: resolve('/review'),
      q: 'schema #2 + state',
      retired: '',
    });
  });

  it('omits unselected Review flag filters from the URL', () => {
    const reviewUrl = new URL(
      resolve(reviewPackSelectionPath(packSelection, { flagged: false, retired: false })),
      'http://localhost',
    );

    expect({
      flagged: reviewUrl.searchParams.has('flagged'),
      retired: reviewUrl.searchParams.has('retired'),
    }).toStrictEqual({ flagged: false, retired: false });
  });

  it('encodes Review action identifiers in the query and fragment', () => {
    const questionId = 'question/with # special? characters';

    const reviewUrl = new URL(
      resolve(
        reviewActionPath(
          packSelection,
          { domainId: 'platform-sql', search: 'query + syntax' },
          'corrected',
          questionId,
        ),
      ),
      'http://localhost',
    );

    expect({
      examId: reviewUrl.searchParams.get('examId'),
      hash: reviewUrl.hash,
      packId: reviewUrl.searchParams.get('packId'),
      packVersion: reviewUrl.searchParams.get('packVersion'),
      pathname: reviewUrl.pathname,
      reviewAction: reviewUrl.searchParams.get('reviewAction'),
      reviewQuestion: reviewUrl.searchParams.get('reviewQuestion'),
    }).toStrictEqual({
      examId: packSelection.examId,
      hash: `#question-${encodeURIComponent(questionId)}`,
      packId: packSelection.packId,
      packVersion: packSelection.packVersion,
      pathname: resolve('/review'),
      reviewAction: 'corrected',
      reviewQuestion: questionId,
    });
  });
});
