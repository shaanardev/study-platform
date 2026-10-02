import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { ExamPack } from '#lib/types/exam-pack.js';
import ReviewPage from './+page.svelte';

const currentPack = JSON.parse(
  readFileSync(resolve('packs/incoming/databricks-dea-may-2026-v1.2.0.json'), 'utf8'),
) as ExamPack;

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

  it('renders a current pack note and documentation link', () => {
    const question = currentPack.questions.find((item) =>
      item.sources.some((source) => 'kind' in source),
    );
    const citation = question?.sources.find((source) => 'kind' in source);
    if (!question || !citation || !('kind' in citation)) {
      throw new Error('The current pack has no academy-note citation');
    }
    const documentationUrl = citation.documentationUrls[0];
    if (!documentationUrl) throw new Error('The current citation has no documentation URL');

    const pack = { ...currentPack, questions: [question] };
    render(ReviewPage, {
      params: {},
      data: {
        packs: [
          {
            examId: pack.exam.id,
            examTitle: pack.exam.title,
            examVersion: pack.exam.version,
            packId: pack.pack.id,
            packTitle: pack.pack.title,
            packVersion: pack.pack.version,
            synthetic: pack.pack.synthetic,
            questionCount: currentPack.questions.length,
            domainCount: pack.domains.length,
            domains: pack.domains.map((domain) => ({
              ...domain,
              questionCount: currentPack.questions.filter((item) => item.domainId === domain.id)
                .length,
            })),
            importedAt: 'now',
          },
        ],
        pack,
        feedback: [],
      },
      form: null,
    } as never);

    expect(
      screen
        .getAllByRole('link')
        .some(
          (link) =>
            link.textContent?.includes(citation.label) &&
            link.getAttribute('href')?.includes(encodeURIComponent(citation.path)),
        ),
    ).toBe(true);
    expect(
      screen.getAllByRole('link').some((link) => link.getAttribute('href') === documentationUrl),
    ).toBe(true);
  });
});
