import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import ProgressPage from './+page.svelte';
import type { PageData } from './$types';

const emptyData = { recentAttempts: [], domainScores: [], missedQuestions: [] } satisfies PageData;

describe('progress page', () => {
  it('explains the empty state to a new learner', async () => {
    render(ProgressPage, { params: {}, data: emptyData, form: null });

    await expect.element(page.getByRole('main')).toHaveClass('bg-[#f4f5f2]');
    await expect
      .element(page.getByRole('heading', { name: 'No attempts yet' }))
      .toBeInTheDocument();
    await expect
      .element(page.getByText('Domain scores will appear after you answer questions.'))
      .toBeInTheDocument();
    await expect
      .element(
        page.getByText('No missed questions to review. Any incorrect answers will appear here.'),
      )
      .toBeInTheDocument();
    await expect
      .element(page.getByRole('link', { name: 'Start a practice quiz' }))
      .toHaveAttribute('href', '/practice');
  });

  it('shows attempt and domain scores with the pack version and selectable missed questions', async () => {
    render(ProgressPage, {
      params: {},
      data: {
        recentAttempts: [
          {
            id: 'attempt-1',
            kind: 'practice',
            examId: 'exam-a',
            examTitle: 'Cloud exam',
            examVersion: '2026',
            packId: 'pack-a',
            packTitle: 'Cloud foundations',
            packVersion: '1.0',
            status: 'completed',
            correctCount: 1,
            answeredCount: 2,
            questionCount: 2,
            completedAt: '2026-09-27 09:00:00',
          },
        ],
        domainScores: [
          {
            examId: 'exam-a',
            examTitle: 'Cloud exam',
            packId: 'pack-a',
            packTitle: 'Cloud foundations',
            packVersion: '1.0',
            domainId: 'compute',
            domainTitle: 'Compute',
            correctCount: 0,
            answeredCount: 1,
            percent: 0,
          },
        ],
        missedQuestions: [
          {
            examId: 'exam-a',
            packId: 'pack-a',
            packVersion: '1.0',
            examTitle: 'Cloud exam',
            packTitle: 'Cloud foundations',
            questionId: 'q-compute',
            prompt: 'What runs the workload?',
            domainId: 'compute',
            domainTitle: 'Compute',
            missCount: 2,
          },
        ],
      },
      form: null,
    });

    await expect.element(page.getByRole('heading', { name: 'Practice quiz' })).toBeInTheDocument();
    await expect
      .element(page.getByText('Cloud foundations · pack 1.0', { exact: true }))
      .toBeInTheDocument();
    await expect.element(page.getByRole('heading', { name: 'Compute' })).toBeInTheDocument();
    const missedQuestion = page.getByLabelText(/What runs the workload/);
    await expect.element(missedQuestion).toBeInTheDocument();
    await missedQuestion.click();
    await expect.element(missedQuestion).toBeChecked();
    const form = page
      .getByRole('button', { name: 'Practice selected missed questions' })
      .element()
      .closest('form');
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute('method', 'POST');
    expect(form).toHaveAttribute('action', '?/practiceMissed');
    await expect
      .element(page.getByRole('button', { name: 'Practice selected missed questions' }))
      .toBeInTheDocument();
  });
});
