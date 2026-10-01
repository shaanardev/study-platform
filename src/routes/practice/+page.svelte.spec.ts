import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import PracticePage from './+page.svelte';

describe('practice page', () => {
  it('updates the available domain choices when a learner switches exam pack versions', async () => {
    render(PracticePage, {
      params: {},
      data: {
        packs: [
          {
            examId: 'exam-a',
            examTitle: 'Exam A',
            examVersion: '1',
            packId: 'pack-a',
            packTitle: 'Foundations',
            packVersion: '1.0',
            synthetic: true,
            questionCount: 3,
            domainCount: 1,
            domains: [{ id: 'storage', title: 'Storage', weight: 100, questionCount: 2 }],
            importedAt: 'now',
          },
          {
            examId: 'exam-b',
            examTitle: 'Exam B',
            examVersion: '2',
            packId: 'pack-b',
            packTitle: 'Pipelines',
            packVersion: '2.0',
            synthetic: false,
            questionCount: 5,
            domainCount: 1,
            domains: [{ id: 'jobs', title: 'Jobs', weight: 100, questionCount: 5 }],
            importedAt: 'now',
          },
        ],
        session: undefined,
      },
      form: null,
    });

    expect(
      within(screen.getByRole('group', { name: /Domains/ })).getByText('Storage'),
    ).toBeTruthy();
    await fireEvent.click(screen.getByRole('checkbox', { name: /Storage/ }));
    expect(screen.getByLabelText('Number of questions').getAttribute('max')).toBe('2');
    await fireEvent.change(screen.getByLabelText('Exam pack version'), {
      target: { value: 'exam-b|pack-b|2.0' },
    });
    expect(screen.getByText('Jobs')).toBeTruthy();
    expect(screen.queryByText('Storage')).toBeNull();
    expect(screen.getByLabelText('Number of questions').getAttribute('max')).toBe('5');
  });

  it('offers a saved session again after the practice page is loaded', async () => {
    render(PracticePage, {
      params: {},
      data: {
        packs: [],
        session: {
          id: 'saved-session',
          examId: 'exam-a',
          packId: 'pack-a',
          packVersion: '1.0',
          domainIds: [],
          questionIds: ['question-a'],
          status: 'in_progress',
          createdAt: '2026-09-27 10:00:00',
          updatedAt: '2026-09-27 10:00:00',
          answers: [],
          questions: [
            {
              id: 'question-a',
              type: 'single_choice',
              domainId: 'storage',
              prompt: 'What does a transaction log record?',
              options: [
                { id: 'a', text: 'Table changes' },
                { id: 'b', text: 'User passwords' },
              ],
              explanation: 'It records changes.',
              sources: [{ path: 'notes.md', label: 'Study notes' }],
            },
          ],
        },
      },
      form: null,
    });

    expect(screen.getByRole('link', { name: 'Resume quiz' }).getAttribute('href')).toBe(
      '/practice?session=saved-session',
    );
    expect(
      screen.getByRole('heading', { name: 'What does a transaction log record?' }),
    ).toBeTruthy();
  });
});
