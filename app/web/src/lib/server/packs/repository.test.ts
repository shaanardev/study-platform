import type { ExamPack } from '@learning-platform/exam-pack';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '#lib/server/database/test-fixtures.js';
import { getImportedPack, listImportedPacks } from '#lib/server/packs/repository.js';
import { seedSamplePack } from '#lib/server/packs/test-fixtures.js';

describe('pack persistence', () => {
  let pack: ExamPack;

  useTestDatabase(async () => {
    pack = await seedSamplePack();
  });

  it('round trips the complete imported pack', async () => {
    await expect(
      getImportedPack(pack.exam.id, pack.pack.id, pack.pack.version),
    ).resolves.toStrictEqual(pack);
  });

  it('lists pack metadata with question counts for each domain', async () => {
    await expect(listImportedPacks()).resolves.toMatchObject([
      {
        domainCount: 2,
        domains: [
          { id: 'delta-lake', questionCount: 1 },
          { id: 'pipelines', questionCount: 1 },
        ],
        examId: pack.exam.id,
        packId: pack.pack.id,
        packVersion: pack.pack.version,
        questionCount: 2,
        synthetic: true,
      },
    ]);
  });
});
