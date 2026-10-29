import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { validateExamPack } from '@learning-platform/exam-pack';
import type { ExamPack, PackQuestion, PackSource } from '@learning-platform/exam-pack';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';

import { getAppDatabase } from '#lib/server/database/app-database.js';
import { useTestDatabase } from '#lib/server/database/test-fixtures.js';
import { importPacksFromFolder } from '#lib/server/packs/importer.js';
import {
  getApprovedSourceRoot,
  getImportedSourceAsset,
  listImportedPacks,
} from '#lib/server/packs/repository.js';
import { mockSamplePackFolder } from '#lib/server/packs/test-fixtures.js';
import { sampleLearningPackFixture } from '#lib/test-fixtures.js';

describe('pack imports', () => {
  let pack: ExamPack;
  let question: PackQuestion;
  let citation: PackSource;
  let incoming: string;
  let packFile: string;

  const fixture = useTestDatabase(async () => {
    const validation = validateExamPack(sampleLearningPackFixture());

    if (!validation.valid) {
      throw new Error(validation.errors.join(' '));
    }

    ({ pack } = validation);

    const [firstQuestion] = pack.questions;
    const firstSource = firstQuestion?.sources[0];

    if (firstQuestion === undefined || firstSource === undefined) {
      throw new Error('The import fixture needs a question with a citation.');
    }

    question = firstQuestion;
    citation = firstSource;
    incoming = path.join(fixture.directory, 'incoming');
    packFile = path.join(incoming, 'sample-learning-pack.json');
    await mockSamplePackFolder(incoming);
  });

  it('imports a pack and exposes its metadata in the pack index', async () => {
    const result = await importPacksFromFolder({ folder: incoming });

    expect(result).toStrictEqual({
      errors: [],
      imported: [`${pack.exam.id}/${pack.pack.id}@${pack.pack.version}`],
      refreshed: [],
      unchanged: [],
    });
    await expect(listImportedPacks()).resolves.toMatchObject([
      {
        examId: pack.exam.id,
        packId: pack.pack.id,
        packVersion: pack.pack.version,
        questionCount: 2,
      },
    ]);
  });

  it('reports an already imported exam, pack, and version as unchanged', async () => {
    await importPacksFromFolder({ folder: incoming });
    const duplicate = await importPacksFromFolder({ folder: incoming });

    expect(duplicate.imported).toStrictEqual([]);
    expect(duplicate.refreshed).toStrictEqual([]);
    expect(duplicate.unchanged).toStrictEqual([
      `${pack.exam.id}/${pack.pack.id}@${pack.pack.version}`,
    ]);
    expect(duplicate.errors).toStrictEqual([]);
  });

  it('rejects a citation whose local file is missing', async () => {
    citation.path = 'assets/not-present.md';
    await writeFile(packFile, JSON.stringify(pack));

    const result = await importPacksFromFolder({ folder: incoming });

    expect(result.imported).toStrictEqual([]);
    expect(result.errors[0]).toContain('does not resolve to a local file');
  });

  it('snapshots an absolute file citation from the approved root', async () => {
    const notePath = path.join(fixture.directory, 'notes.md');
    citation.path = pathToFileURL(notePath).href;
    await writeFile(notePath, 'Approved source content.');
    await writeFile(packFile, JSON.stringify(pack));

    const result = await importPacksFromFolder({
      approvedSourceRoot: fixture.directory,
      folder: incoming,
    });

    expect(result.errors).toStrictEqual([]);
    expect(result.imported).toHaveLength(1);
    await expect(
      getImportedSourceAsset(
        pack.exam.id,
        pack.pack.id,
        pack.pack.version,
        question.id,
        citation.path,
      ),
    ).resolves.toStrictEqual({ excerpt: 'Approved source content.', label: citation.label });
  });

  it('refreshes approved excerpts for an unchanged imported pack', async () => {
    const notePath = path.join(fixture.directory, 'notes.md');
    citation.path = pathToFileURL(notePath).href;
    await writeFile(notePath, 'Original excerpt.');
    await writeFile(packFile, JSON.stringify(pack));
    await importPacksFromFolder({ approvedSourceRoot: fixture.directory, folder: incoming });

    await writeFile(notePath, 'Updated excerpt.');

    const refresh = await importPacksFromFolder({
      approvedSourceRoot: fixture.directory,
      folder: incoming,
    });

    expect(refresh).toStrictEqual({
      errors: [],
      imported: [],
      refreshed: [`${pack.exam.id}/${pack.pack.id}@${pack.pack.version}`],
      unchanged: [],
    });
    await expect(
      getApprovedSourceRoot(pack.exam.id, pack.pack.id, pack.pack.version),
    ).resolves.toBe(fixture.directory);
    await expect(
      getImportedSourceAsset(
        pack.exam.id,
        pack.pack.id,
        pack.pack.version,
        question.id,
        citation.path,
      ),
    ).resolves.toStrictEqual({ excerpt: 'Updated excerpt.', label: citation.label });
  });

  it('does not import new packs during an approved citation-only refresh', async () => {
    const result = await importPacksFromFolder({
      approvedSourceRoot: fixture.directory,
      folder: incoming,
      refreshOnly: true,
    });

    expect(result).toStrictEqual({
      errors: [],
      imported: [],
      refreshed: [],
      unchanged: [`${pack.exam.id}/${pack.pack.id}@${pack.pack.version}`],
    });
    await expect(listImportedPacks()).resolves.toStrictEqual([]);
  });

  it.each([
    {
      message: 'requires an explicitly approved local source root',
      options: (folder: string) => ({ folder }),
      reason: 'without approval',
    },
    {
      message: 'is outside the approved local source root',
      options: (folder: string) => ({ approvedSourceRoot: folder, folder }),
      reason: 'outside the approved root',
    },
  ])('rejects an absolute citation $reason', async ({ options, message }) => {
    const notePath = path.join(fixture.directory, 'outside.md');
    citation.path = pathToFileURL(notePath).href;
    await writeFile(notePath, 'Outside notes.');
    await writeFile(packFile, JSON.stringify(pack));

    const result = await importPacksFromFolder(options(incoming));

    expect(result.imported).toStrictEqual([]);
    expect(result.errors[0]).toContain(message);
  });

  it('rolls back the pack when saving a source asset fails', async () => {
    await sql`
      CREATE TRIGGER reject_source_asset
      BEFORE INSERT ON saved_source_assets
      BEGIN
        SELECT RAISE(ABORT, 'source asset write failed');
      END;
    `.execute(getAppDatabase());

    const result = await importPacksFromFolder({ folder: incoming });

    expect(result.imported).toStrictEqual([]);
    expect(result.errors[0]).toContain('source asset write failed');
    await expect(listImportedPacks()).resolves.toStrictEqual([]);
  });
});
