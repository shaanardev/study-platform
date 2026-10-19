import assert from 'node:assert/strict';

import { validateExamPack } from '@learning-platform/exam-pack';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { sampleLearningPackFixture } from '#lib/test-fixtures.js';

import PracticePage from './+page.svelte';

const packValidation = validateExamPack(sampleLearningPackFixture());

assert.ok(packValidation.valid, packValidation.errors.join('\n'));

const currentPack = packValidation.pack;

describe('practice page', () => {
  it('updates the available domain choices when a learner switches exam pack versions', async () => {
    render(PracticePage, {
      data: {
        packs: [
          {
            domainCount: 1,
            domains: [{ id: 'storage', questionCount: 2, title: 'Storage', weight: 100 }],
            examId: 'exam-a',
            examTitle: 'Exam A',
            examVersion: '1',
            importedAt: 'now',
            packId: 'pack-a',
            packTitle: 'Foundations',
            packVersion: '1.0',
            questionCount: 3,
            synthetic: true,
          },
          {
            domainCount: 1,
            domains: [{ id: 'jobs', questionCount: 5, title: 'Jobs', weight: 100 }],
            examId: 'exam-b',
            examTitle: 'Exam B',
            examVersion: '2',
            importedAt: 'now',
            packId: 'pack-b',
            packTitle: 'Pipelines',
            packVersion: '2.0',
            questionCount: 5,
            synthetic: false,
          },
        ],
        session: undefined,
      },
      form: null,
      params: {},
    });

    expect(
      within(screen.getByRole('group', { name: /Domains/u })).getByText('Storage'),
    ).toBeTruthy();
    await fireEvent.click(screen.getByRole('checkbox', { name: /Storage/u }));
    expect(screen.getByLabelText('Number of questions').getAttribute('max')).toBe('2');
    await fireEvent.change(screen.getByLabelText('Exam pack version'), {
      target: { value: 'exam-b|pack-b|2.0' },
    });
    expect(screen.getByText('Jobs')).toBeTruthy();
    expect(screen.queryByText('Storage')).toBeNull();
    expect(screen.getByLabelText('Number of questions').getAttribute('max')).toBe('5');
  });

  it('offers a saved session again after the practice page is loaded', () => {
    render(PracticePage, {
      data: {
        packs: [],
        session: {
          answers: [],
          createdAt: '2026-09-27 10:00:00',
          domainIds: [],
          examId: 'exam-a',
          id: 'saved-session',
          packId: 'pack-a',
          packVersion: '1.0',
          questionIds: ['question-a'],
          questions: [
            {
              domainId: 'storage',
              explanation: 'It records changes.',
              id: 'question-a',
              options: [
                { id: 'a', text: 'Table changes' },
                { id: 'b', text: 'User passwords' },
              ],
              prompt: 'What does a transaction log record?',
              sources: [{ label: 'Study notes', path: 'notes.md' }],
              type: 'single_choice',
            },
          ],
          status: 'in_progress',
          updatedAt: '2026-09-27 10:00:00',
        },
      },
      form: null,
      params: {},
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
      data: {
        packs: [],
        session: {
          answers: [
            {
              answerIds: ['a'],
              answerIdsCorrect: ['a'],
              answeredAt: 'now',
              correct: true,
              explanation: 'Correct.',
              questionId: 'question-a',
              sources: [
                { label: 'Bundled notes', path: 'assets/notes.md' },
                {
                  label: 'Streaming reference',
                  path: 'file:///tmp/streaming-checkpoints.md',
                },
              ],
            },
          ],
          createdAt: 'now',
          domainIds: [],
          examId: 'exam-a',
          id: 'completed-session',
          packId: 'pack-a',
          packVersion: '1.0',
          questionIds: ['question-a', 'question-b'],
          questions: [
            {
              domainId: 'storage',
              explanation: 'Correct.',
              id: 'question-a',
              options: [
                { id: 'a', text: 'Table changes' },
                { id: 'b', text: 'Passwords' },
              ],
              prompt: 'What does a transaction log record?',
              sources: [],
              type: 'single_choice',
            },
            {
              domainId: 'storage',
              explanation: 'A table holds data.',
              id: 'question-b',
              options: [
                { id: 'a', text: 'Data' },
                { id: 'b', text: 'Code' },
              ],
              prompt: 'What is a table?',
              sources: [],
              type: 'single_choice',
            },
          ],
          status: 'in_progress',
          updatedAt: 'now',
        },
      },
      form: null,
      params: {},
    });

    const links = [...container.querySelectorAll('a')];
    const noteLink = links.find((link) => link.textContent.includes('Streaming reference'));
    expect(noteLink?.getAttribute('href')).toContain(
      encodeURIComponent('file:///tmp/streaming-checkpoints.md'),
    );
    expect(links.some((link) => link.textContent.includes('Streaming reference'))).toBeTruthy();
    expect(links.some((link) => link.textContent.includes('Bundled notes'))).toBeTruthy();
  });

  it('renders a current pack note and documentation link after a practice answer', () => {
    const question = currentPack.questions.find((item) => item.sources.length > 0);
    expect.assert(question, 'The current pack has no question with a citation.');
    const [citation] = question.sources;
    expect.assert(citation, 'The current pack has no citation.');

    render(PracticePage, {
      data: {
        packs: [],
        session: {
          answers: [
            {
              answerIds: question.answerIds,
              answerIdsCorrect: question.answerIds,
              answeredAt: 'now',
              correct: true,
              explanation: question.explanation,
              questionId: question.id,
              sources: question.sources,
            },
          ],
          createdAt: 'now',
          domainIds: [],
          examId: currentPack.exam.id,
          id: 'dea26-session',
          packId: currentPack.pack.id,
          packVersion: currentPack.pack.version,
          questionIds: [question.id],
          questions: [
            {
              domainId: question.domainId,
              explanation: question.explanation,
              id: question.id,
              options: question.options,
              prompt: question.prompt,
              sources: question.sources,
              type: question.type,
            },
          ],
          status: 'completed',
          updatedAt: 'now',
        },
      },
      form: null,
      params: {},
    });

    const citationLink = screen.getByRole('link', {
      name: (accessibleName) => accessibleName.includes(citation.label),
    });

    expect(citationLink.getAttribute('href')).toContain(encodeURIComponent(citation.path));
    expect(citationLink.getAttribute('href')).toContain('/practice/source?');
  });
});
