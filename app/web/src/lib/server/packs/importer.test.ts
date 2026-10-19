import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { validateExamPack } from '@learning-platform/exam-pack';
import type { ExamPack } from '@learning-platform/exam-pack';
import { afterEach, describe, expect, it } from 'vitest';

import { openPackDatabase } from '#lib/server/db/packs.js';
import { decodeJsonText } from '#lib/server/json.js';
import { getPackIndex, importPacksFromFolder } from '#lib/server/packs/importer.js';
import { createSamplePackFolder } from '#lib/server/packs/test-fixtures.js';

const temporaryDirectories: string[] = [];
const { join } = path;

const readPackDocument = async (filePath: string): Promise<ExamPack> => {
  const validation = validateExamPack(decodeJsonText(await readFile(filePath, 'utf-8')));
  expect.assert(validation.valid, 'Expected the sample pack to contain source references.');

  return validation.pack;
};

describe(importPacksFromFolder, () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directory) => {
        await rm(directory, { force: true, recursive: true });
      }),
    );
  });

  it('imports the tracked synthetic sample into SQLite and exposes it in the pack index', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'exam-packs-'));
    temporaryDirectories.push(directory);
    const incoming = join(directory, 'incoming');
    const databasePath = join(directory, 'state', 'packs.sqlite');
    await createSamplePackFolder(incoming);

    const result = await importPacksFromFolder({ databasePath, folder: incoming });

    expect(result).toStrictEqual({
      errors: [],
      imported: ['sample-engineer-exam/synthetic-foundations@1.0.0'],
      refreshed: [],
    });
    expect(getPackIndex(databasePath)).toStrictEqual([
      expect.objectContaining({
        examId: 'sample-engineer-exam',
        packId: 'synthetic-foundations',
        packVersion: '1.0.0',
        questionCount: 2,
        synthetic: true,
      }),
    ]);
  });

  it('rejects importing the same exam, pack, and version twice', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'exam-packs-'));
    temporaryDirectories.push(directory);
    const incoming = join(directory, 'incoming');
    const databasePath = join(directory, 'state', 'packs.sqlite');
    await createSamplePackFolder(incoming);

    await importPacksFromFolder({ databasePath, folder: incoming });
    const duplicate = await importPacksFromFolder({ databasePath, folder: incoming });

    expect(duplicate).toStrictEqual({
      errors: [
        'sample-learning-pack.json: this exam, pack, and pack version are already imported.',
      ],
      imported: [],
      refreshed: [],
    });
  });

  it('rejects source references that do not resolve to local files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'exam-packs-'));
    temporaryDirectories.push(directory);
    const incoming = join(directory, 'incoming');
    await createSamplePackFolder(incoming);
    const packFile = join(incoming, 'sample-learning-pack.json');
    const content = await readPackDocument(packFile);
    const source = content.questions[0]?.sources[0];
    expect.assert(source, 'Expected the sample pack to contain a source reference.');
    source.path = 'assets/not-present.md';
    await writeFile(packFile, JSON.stringify(content));

    const result = await importPacksFromFolder({
      databasePath: join(directory, 'state', 'packs.sqlite'),
      folder: incoming,
    });

    expect(result.imported).toStrictEqual([]);
    expect(result.errors).toContain(
      [
        'sample-learning-pack.json: source path "assets/not-present.md" ',
        'does not resolve to a local file.',
      ].join(''),
    );
  });

  it('snapshots absolute file citations from the explicitly approved root', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'exam-packs-'));
    temporaryDirectories.push(directory);
    const incoming = join(directory, 'incoming');
    await createSamplePackFolder(incoming);
    const packFile = join(incoming, 'sample-learning-pack.json');
    const content = await readPackDocument(packFile);
    const citation = content.questions[0]?.sources[0];
    expect.assert(citation, 'Expected the sample pack to contain a source reference.');
    citation.path = pathToFileURL(packFile).href;
    const databasePath = join(directory, 'state', 'packs.sqlite');
    await writeFile(packFile, JSON.stringify(content));

    const result = await importPacksFromFolder({
      approvedSourceRoot: incoming,
      databasePath,
      folder: incoming,
    });

    const database = openPackDatabase(databasePath);

    try {
      const assets: unknown = database
        .prepare('SELECT source_path, excerpt FROM saved_source_assets')
        .all();

      expect(result.errors).toStrictEqual([]);
      expect(result.imported).toHaveLength(1);
      expect(assets).toContainEqual({
        excerpt: await readFile(packFile, 'utf-8'),
        source_path: citation.path,
      });
    } finally {
      database.close();
    }
  });

  it('rejects absolute file citations without approval or outside the approved root', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'exam-packs-boundary-'));
    temporaryDirectories.push(directory);
    const incoming = join(directory, 'incoming');
    const outside = join(directory, 'outside.md');
    await createSamplePackFolder(incoming);
    await writeFile(outside, 'outside notes');
    const packFile = join(incoming, 'sample-learning-pack.json');
    const content = await readPackDocument(packFile);
    const citation = content.questions[0]?.sources[0];
    expect.assert(citation, 'Expected the sample pack to contain a source reference.');
    citation.path = pathToFileURL(outside).href;
    await writeFile(packFile, JSON.stringify(content));
    const databasePath = join(directory, 'state', 'packs.sqlite');

    const unapproved = await importPacksFromFolder({ databasePath, folder: incoming });

    const outsideRoot = await importPacksFromFolder({
      approvedSourceRoot: incoming,
      databasePath,
      folder: incoming,
    });

    expect(unapproved.imported).toStrictEqual([]);
    expect(unapproved.errors[0]).toContain('requires an explicitly approved local source root');
    expect(outsideRoot.imported).toStrictEqual([]);
    expect(outsideRoot.errors[0]).toContain('is outside the approved local source root');
  });

  it('rolls back the pack when saving one of its source assets fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'exam-packs-'));
    temporaryDirectories.push(directory);
    const incoming = join(directory, 'incoming');
    const databasePath = join(directory, 'state', 'packs.sqlite');
    await createSamplePackFolder(incoming);

    const database = openPackDatabase(databasePath);

    try {
      database.exec(`
        CREATE TRIGGER reject_source_asset
        BEFORE INSERT ON saved_source_assets
        BEGIN
          SELECT RAISE(ABORT, 'source asset write failed');
        END;
      `);
    } finally {
      database.close();
    }

    const result = await importPacksFromFolder({ databasePath, folder: incoming });

    expect(result.imported).toStrictEqual([]);
    expect(result.errors).toContain(
      'sample-learning-pack.json: could not store this pack (source asset write failed).',
    );
    expect(getPackIndex(databasePath)).toStrictEqual([]);
  });
});
