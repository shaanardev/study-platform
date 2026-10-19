import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { getImportedPack, openPackDatabase, saveImportedPack } from '#lib/server/db/packs.js';
import type { ExamPack } from '#lib/types/exam-pack.js';

const temporaryDirectories: string[] = [];

describe('pack persistence', () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directory) => {
        await rm(directory, { force: true, recursive: true });
      }),
    );
  });

  it('rejects stored content that is not a valid exam pack', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'exam-pack-db-'));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, 'packs.sqlite');

    const pack: ExamPack = {
      domains: [{ id: 'fundamentals', title: 'Fundamentals', weight: 100 }],
      exam: { id: 'demo-exam', title: 'Demo exam', version: '1.0.0' },
      pack: { id: 'demo-pack', synthetic: true, title: 'Demo pack', version: '1.0.0' },
      questions: [
        {
          answerIds: ['b'],
          domainId: 'fundamentals',
          explanation: 'The second option is correct.',
          id: 'question-1',
          options: [
            { id: 'a', text: 'First option' },
            { id: 'b', text: 'Second option' },
          ],
          prompt: 'Which option is correct?',
          sources: [],
          type: 'single_choice',
        },
      ],
      schemaVersion: 1,
    };

    saveImportedPack(databasePath, pack);

    const database = openPackDatabase(databasePath);

    try {
      database
        .prepare('UPDATE imported_packs SET content_json = ? WHERE exam_id = ? AND pack_id = ?')
        .run('{}', pack.exam.id, pack.pack.id);
    } finally {
      database.close();
    }

    expect(() =>
      getImportedPack(pack.exam.id, pack.pack.id, pack.pack.version, databasePath),
    ).toThrow('Stored exam pack is invalid.');
  });

  it('keeps a legacy citation readable as a generic stored citation', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'exam-pack-db-'));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, 'packs.sqlite');

    const pack: ExamPack = {
      domains: [{ id: 'fundamentals', title: 'Fundamentals', weight: 100 }],
      exam: { id: 'demo-exam', title: 'Demo exam', version: '1.0.0' },
      pack: { id: 'demo-pack', synthetic: true, title: 'Demo pack', version: '1.0.0' },
      questions: [
        {
          answerIds: ['b'],
          domainId: 'fundamentals',
          explanation: 'The second option is correct.',
          id: 'question-1',
          options: [
            { id: 'a', text: 'First option' },
            { id: 'b', text: 'Second option' },
          ],
          prompt: 'Which option is correct?',
          sources: [{ label: 'Legacy notes', path: 'notes.md' }],
          type: 'single_choice',
        },
      ],
      schemaVersion: 1,
    };

    saveImportedPack(databasePath, pack);
    const database = openPackDatabase(databasePath);

    try {
      database
        .prepare('UPDATE imported_packs SET content_json = ? WHERE exam_id = ? AND pack_id = ?')
        .run(
          JSON.stringify({
            ...pack,
            questions: pack.questions.map((question) => ({
              ...question,
              sources: [
                {
                  documentationUrls: ['https://example.com/docs'],
                  kind: 'legacy_reference',
                  label: 'Legacy notes',
                  path: 'notes.md',
                  section: 'Old section',
                },
              ],
            })),
          }),
          pack.exam.id,
          pack.pack.id,
        );
    } finally {
      database.close();
    }

    expect(
      getImportedPack(pack.exam.id, pack.pack.id, pack.pack.version, databasePath)?.questions[0]
        ?.sources,
    ).toStrictEqual([
      {
        documentationUrls: ['https://example.com/docs'],
        kind: 'legacy_reference',
        label: 'Legacy notes',
        path: 'notes.md',
        section: 'Old section',
      },
    ]);
  });
});
