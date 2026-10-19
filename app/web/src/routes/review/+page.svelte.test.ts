import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { validateExamPack } from '@learning-platform/exam-pack';
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { workspacePath } from '#lib/server/workspace-paths.js';

import ReviewPage from './+page.svelte';

const packValidation = validateExamPack(
  JSON.parse(readFileSync(workspacePath('packs/incoming/sample-learning-pack.json'), 'utf-8')),
);

assert.ok(packValidation.valid, packValidation.errors.join('\n'));

const currentPack = packValidation.pack;

describe('review page citations', () => {
  it('renders source-neutral pack citation labels', () => {
    render(ReviewPage, {
      data: {
        feedback: [],
        pack: {
          domains: [{ id: 'storage', title: 'Storage', weight: 100 }],
          exam: { id: 'exam-a', title: 'Exam A', version: '1' },
          pack: { id: 'pack-a', synthetic: true, title: 'Pack A', version: '1.0' },
          questions: [
            {
              answerIds: ['a'],
              domainId: 'storage',
              explanation: 'Correct.',
              id: 'question-a',
              options: [
                { id: 'a', text: 'Table changes' },
                { id: 'b', text: 'Passwords' },
              ],
              prompt: 'What does a transaction log record?',
              sources: [
                { label: 'Bundled notes', path: 'assets/notes.md' },
                {
                  label: 'Streaming reference',
                  path: 'file:///tmp/streaming-checkpoints.md',
                },
              ],
              type: 'single_choice',
            },
          ],
          schemaVersion: 1,
        },
        packs: [
          {
            domainCount: 1,
            domains: [{ id: 'storage', questionCount: 1, title: 'Storage', weight: 100 }],
            examId: 'exam-a',
            examTitle: 'Exam A',
            examVersion: '1',
            importedAt: 'now',
            packId: 'pack-a',
            packTitle: 'Pack A',
            packVersion: '1.0',
            questionCount: 1,
            synthetic: true,
          },
        ],
      },
      form: null,
      params: {},
    });

    expect(
      screen.getByRole('link', { name: /Streaming reference/u }).getAttribute('href'),
    ).toContain(encodeURIComponent('file:///tmp/streaming-checkpoints.md'));
    expect(screen.getByRole('link', { name: /Bundled notes/u })).toBeTruthy();
  });

  it('renders a current pack note and documentation link', () => {
    const question = currentPack.questions.find((item) => item.sources.length > 0);
    expect.assert(question, 'The current pack has no question with a citation.');
    const [citation] = question.sources;
    expect.assert(citation, 'The current pack has no citation.');

    const pack = { ...currentPack, questions: [question] };
    render(ReviewPage, {
      data: {
        feedback: [],
        pack,
        packs: [
          {
            domainCount: pack.domains.length,
            domains: pack.domains.map((domain) => ({
              ...domain,
              questionCount: currentPack.questions.filter((item) => item.domainId === domain.id)
                .length,
            })),
            examId: pack.exam.id,
            examTitle: pack.exam.title,
            examVersion: pack.exam.version,
            importedAt: 'now',
            packId: pack.pack.id,
            packTitle: pack.pack.title,
            packVersion: pack.pack.version,
            questionCount: currentPack.questions.length,
            synthetic: pack.pack.synthetic,
          },
        ],
      },
      form: null,
      params: {},
    });

    const citationLink = screen.getByRole('link', {
      name: (accessibleName) => accessibleName.includes(citation.label),
    });

    expect(citationLink.getAttribute('href')).toContain(encodeURIComponent(citation.path));
  });
});
