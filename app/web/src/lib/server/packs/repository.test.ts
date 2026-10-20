import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ExamPack } from '@learning-platform/exam-pack';
import { afterEach, describe, expect, it } from 'vitest';

import { createDatabase } from '#lib/server/database/connection.js';
import {
  getImportedPack,
  listImportedPacks,
  saveImportedPack,
} from '#lib/server/packs/repository.js';

const temporaryDirectories: string[] = [];
const databases: Awaited<ReturnType<typeof createDatabase>>[] = [];

describe('pack persistence', () => {
  afterEach(async () => {
    await Promise.all(
      databases.splice(0).map(async (database) => {
        await database.destroy();
      }),
    );
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directory) => {
        await rm(directory, { force: true, recursive: true });
      }),
    );
  });

  it('round trips typed ExamPack JSON through the Kysely result plugin', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'exam-pack-db-'));
    temporaryDirectories.push(directory);
    const database = await createDatabase(path.join(directory, 'packs.sqlite'));
    databases.push(database);

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

    await saveImportedPack(database, pack);

    await expect(
      getImportedPack(pack.exam.id, pack.pack.id, pack.pack.version, database),
    ).resolves.toStrictEqual(pack);

    const stored = await database
      .selectFrom('imported_packs')
      .select('content as content')
      .executeTakeFirstOrThrow();

    expect(stored.content).toStrictEqual(pack);
    expect(stored.content).toBeTypeOf('object');
    await expect(listImportedPacks(database)).resolves.toStrictEqual([
      expect.objectContaining({
        domainCount: 1,
        domains: [{ id: 'fundamentals', questionCount: 1, title: 'Fundamentals', weight: 100 }],
        examTitle: 'Demo exam',
        packTitle: 'Demo pack',
        questionCount: 1,
        synthetic: true,
      }),
    ]);
  });
});
