import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import PracticePage from './+page.svelte';

describe('practice page', () => {
  it('updates the available domain choices when a learner switches exam pack versions', async () => {
    render(PracticePage, {
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

    await expect
      .element(page.getByRole('group', { name: /Domains/ }).getByText('Storage'))
      .toBeInTheDocument();
    await page.getByRole('checkbox', { name: /Storage/ }).check();
    await expect.element(page.getByLabelText('Number of questions')).toHaveAttribute('max', '2');
    await page.getByLabelText('Exam pack version').selectOptions('exam-b|pack-b|2.0');
    await expect.element(page.getByText('Jobs')).toBeInTheDocument();
    await expect.element(page.getByText('Storage')).not.toBeInTheDocument();
    await expect.element(page.getByLabelText('Number of questions')).toHaveAttribute('max', '5');
  });

  it('offers a saved session again after the practice page is loaded', async () => {
    render(PracticePage, {
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

    await expect
      .element(page.getByRole('link', { name: 'Resume quiz' }))
      .toHaveAttribute('href', '/practice?session=saved-session');
    await expect
      .element(page.getByRole('heading', { name: 'What does a transaction log record?' }))
      .toBeInTheDocument();
  });
});
