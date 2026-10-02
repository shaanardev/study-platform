import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ReviewPage from './+page.svelte';

describe('review page citations', () => {
  it('renders academy notes with their section and external Databricks links', () => {
    render(ReviewPage, {
      params: {},
      data: {
        packs: [
          {
            examId: 'exam-a',
            examTitle: 'Exam A',
            examVersion: '1',
            packId: 'pack-a',
            packTitle: 'Pack A',
            packVersion: '1.0',
            synthetic: true,
            questionCount: 1,
            domainCount: 1,
            domains: [{ id: 'storage', title: 'Storage', weight: 100, questionCount: 1 }],
            importedAt: 'now',
          },
        ],
        pack: {
          exam: { id: 'exam-a', title: 'Exam A', version: '1' },
          pack: { id: 'pack-a', title: 'Pack A', version: '1.0', synthetic: true },
          questions: [
            {
              id: 'question-a',
              type: 'single_choice',
              domainId: 'storage',
              prompt: 'What does a transaction log record?',
              options: [
                { id: 'a', text: 'Table changes' },
                { id: 'b', text: 'Passwords' },
              ],
              answerIds: ['a'],
              explanation: 'Correct.',
              sources: [
                { path: 'assets/notes.md', label: 'Bundled notes' },
                {
                  kind: 'academy_note',
                  path: 'streaming/checkpoints.md',
                  label: 'Streaming academy note',
                  section: 'Checkpointing',
                  documentationUrls: ['https://docs.databricks.com/streams/checkpoints.html'],
                },
              ],
            },
          ],
        },
        feedback: [],
      },
      form: null,
    } as never);

    expect(
      screen.getByRole('link', { name: /Streaming academy note/ }).getAttribute('href'),
    ).toContain(encodeURIComponent('streaming/checkpoints.md'));
    expect(
      screen.getByRole('link', { name: /Databricks documentation/ }).getAttribute('href'),
    ).toBe('https://docs.databricks.com/streams/checkpoints.html');
    expect(screen.getByRole('link', { name: /Bundled notes/ })).toBeTruthy();
  });
});
