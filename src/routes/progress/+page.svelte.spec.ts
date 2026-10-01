import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ProgressPage from './+page.svelte';
import type { PageData } from './$types';

const emptyData = { recentAttempts: [], domainScores: [], missedQuestions: [] } satisfies PageData;

describe('progress page', () => {
  it('explains the empty state to a new learner', async () => {
    render(ProgressPage, { params: {}, data: emptyData, form: null });

    expect(screen.getByRole('main').classList.contains('bg-[#f4f5f2]')).toBe(true);
    expect(screen.getByRole('heading', { name: 'No attempts yet' })).toBeTruthy();
    expect(screen.getByText('Domain scores will appear after you answer questions.')).toBeTruthy();
    expect(
      screen.getByText('No missed questions to review. Any incorrect answers will appear here.'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Start a practice quiz' }).getAttribute('href')).toBe(
      '/practice',
    );
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

    expect(screen.getByRole('heading', { name: 'Practice quiz' })).toBeTruthy();
    expect(screen.getByText('Cloud foundations · pack 1.0', { exact: true })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Compute' })).toBeTruthy();
    const missedQuestion = screen.getByLabelText(/What runs the workload/) as HTMLInputElement;
    await fireEvent.click(missedQuestion);
    expect(missedQuestion.checked).toBe(true);
    const form = screen
      .getByRole('button', { name: 'Practice selected missed questions' })
      .closest('form');
    expect(form).not.toBeNull();
    expect(form?.getAttribute('method')).toBe('POST');
    expect(form?.getAttribute('action')).toBe('/progress?/practiceMissed');
    expect(screen.getByRole('button', { name: 'Practice selected missed questions' })).toBeTruthy();
  });
});
