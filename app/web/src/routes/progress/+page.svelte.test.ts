import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import type { PageData } from './$types';
import ProgressPage from './+page.svelte';

const emptyData = { domainScores: [], missedQuestions: [], recentAttempts: [] } satisfies PageData;

describe('progress page', () => {
  it('explains the empty state to a new learner', () => {
    render(ProgressPage, { data: emptyData, form: null, params: {} });

    expect(screen.getByRole('main').classList.contains('bg-app-canvas')).toBeTruthy();
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
      data: {
        domainScores: [
          {
            answeredCount: 1,
            correctCount: 0,
            domainId: 'compute',
            domainTitle: 'Compute',
            examId: 'exam-a',
            examTitle: 'Cloud exam',
            packId: 'pack-a',
            packTitle: 'Cloud foundations',
            packVersion: '1.0',
            percent: 0,
          },
        ],
        missedQuestions: [
          {
            domainId: 'compute',
            domainTitle: 'Compute',
            examId: 'exam-a',
            examTitle: 'Cloud exam',
            missCount: 2,
            packId: 'pack-a',
            packTitle: 'Cloud foundations',
            packVersion: '1.0',
            prompt: 'What runs the workload?',
            questionId: 'q-compute',
          },
        ],
        recentAttempts: [
          {
            answeredCount: 2,
            completedAt: '2026-09-27 09:00:00',
            correctCount: 1,
            examId: 'exam-a',
            examTitle: 'Cloud exam',
            examVersion: '2026',
            id: 'attempt-1',
            kind: 'practice',
            packId: 'pack-a',
            packTitle: 'Cloud foundations',
            packVersion: '1.0',
            questionCount: 2,
            status: 'completed',
          },
        ],
      },
      form: null,
      params: {},
    });

    expect({
      packLabel: screen.getByText('Cloud foundations · pack 1.0', { exact: true }).textContent,
      questionHeading: screen.getByRole('heading', { name: 'Practice quiz' }).textContent,
      scoreHeading: screen.getByRole('heading', { name: 'Compute' }).textContent,
    }).toStrictEqual({
      packLabel: 'Cloud foundations · pack 1.0',
      questionHeading: 'Practice quiz',
      scoreHeading: 'Compute',
    });
    const missedQuestion = screen.getByLabelText(/What runs the workload/u);
    await fireEvent.click(missedQuestion);
    expect(missedQuestion.matches(':checked')).toBeTruthy();

    const form = screen
      .getByRole('button', { name: 'Practice selected missed questions' })
      .closest('form');

    expect(form).not.toBeNull();
    expect({
      action: form?.getAttribute('action'),
      method: form?.getAttribute('method'),
    }).toStrictEqual({ action: '/progress?/practiceMissed', method: 'POST' });
  });
});
