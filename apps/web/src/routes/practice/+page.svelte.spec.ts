import { readFileSync } from 'node:fs';

import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { workspacePath } from '#lib/server/workspace-paths.js';
import type { ExamPack } from '#lib/types/exam-pack.js';

import PracticePage from './+page.svelte';

const currentPack = JSON.parse(
  readFileSync(workspacePath('packs/incoming/sample-learning-pack.json'), 'utf8'),
) as ExamPack;

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

  it('shows each citation label after an answer', () => {
    const { container } = render(PracticePage, {
      params: {},
      data: {
        packs: [],
        session: {
          id: 'completed-session',
          examId: 'exam-a',
          packId: 'pack-a',
          packVersion: '1.0',
          domainIds: [],
          questionIds: ['question-a', 'question-b'],
          status: 'in_progress',
          createdAt: 'now',
          updatedAt: 'now',
          answers: [
            {
              questionId: 'question-a',
              answerIds: ['a'],
              correct: true,
              answerIdsCorrect: ['a'],
              explanation: 'Correct.',
              answeredAt: 'now',
              sources: [
                { path: 'assets/notes.md', label: 'Bundled notes' },
                {
                  path: 'file:///tmp/streaming-checkpoints.md',
                  label: 'Streaming reference',
                },
              ],
            },
          ],
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
              explanation: 'Correct.',
              sources: [],
            },
            {
              id: 'question-b',
              type: 'single_choice',
              domainId: 'storage',
              prompt: 'What is a table?',
              options: [
                { id: 'a', text: 'Data' },
                { id: 'b', text: 'Code' },
              ],
              explanation: 'A table holds data.',
              sources: [],
            },
          ],
        },
      },
      form: null,
    });
    const links = [...container.querySelectorAll('a')];
    const noteLink = links.find((link) => link.textContent?.includes('Streaming reference'));
    expect(noteLink?.getAttribute('href')).toContain(
      encodeURIComponent('file:///tmp/streaming-checkpoints.md'),
    );
    expect(links.some((link) => link.textContent?.includes('Streaming reference'))).toBe(true);
    expect(links.some((link) => link.textContent?.includes('Bundled notes'))).toBe(true);
  });

  it('renders a current pack note and documentation link after a practice answer', () => {
    const question = currentPack.questions.find((item) => item.sources.length > 0);
    const citation = question?.sources[0];
    if (!question || !citation) throw new Error('The current pack has no citation');

    const { container } = render(PracticePage, {
      params: {},
      data: {
        packs: [],
        session: {
          id: 'dea26-session',
          examId: currentPack.exam.id,
          packId: currentPack.pack.id,
          packVersion: currentPack.pack.version,
          domainIds: [],
          questionIds: [question.id],
          status: 'completed',
          createdAt: 'now',
          updatedAt: 'now',
          answers: [
            {
              questionId: question.id,
              answerIds: question.answerIds,
              correct: true,
              answerIdsCorrect: question.answerIds,
              explanation: question.explanation,
              answeredAt: 'now',
              sources: question.sources,
            },
          ],
          questions: [
            {
              id: question.id,
              type: question.type,
              domainId: question.domainId,
              prompt: question.prompt,
              options: question.options,
              explanation: question.explanation,
              sources: question.sources,
            },
          ],
        },
      },
      form: null,
    });

    const links = [...container.querySelectorAll('a')];
    expect(
      links.some(
        (link) =>
          link.textContent?.includes(citation.label) &&
          link.getAttribute('href')?.includes(encodeURIComponent(citation.path)),
      ),
    ).toBe(true);
    expect(links.some((link) => link.getAttribute('href')?.includes('/practice/source?'))).toBe(
      true,
    );
  });
});
