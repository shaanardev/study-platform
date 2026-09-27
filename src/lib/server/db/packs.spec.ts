import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExamPack } from '../packs/validate';
import { getImportedPack, openPackDatabase, saveImportedPack } from './packs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('pack persistence', () => {
  it('rejects stored content that is not a valid exam pack', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ordewell-pack-db-'));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, 'packs.sqlite');
    const pack: ExamPack = {
      schemaVersion: 1,
      exam: { id: 'demo-exam', title: 'Demo exam', version: '1.0.0' },
      pack: { id: 'demo-pack', title: 'Demo pack', version: '1.0.0', synthetic: true },
      domains: [{ id: 'fundamentals', title: 'Fundamentals', weight: 100 }],
      questions: [
        {
          id: 'question-1',
          type: 'single_choice',
          domainId: 'fundamentals',
          prompt: 'Which option is correct?',
          options: [
            { id: 'a', text: 'First option' },
            { id: 'b', text: 'Second option' },
          ],
          answerIds: ['b'],
          explanation: 'The second option is correct.',
          sources: [],
        },
      ],
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
});
