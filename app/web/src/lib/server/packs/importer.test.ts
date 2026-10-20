import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { sql } from 'kysely';
import { afterEach, describe, expect, it } from 'vitest';

import type { AppDatabase } from '#lib/server/database/connection.js';
import { createDatabase } from '#lib/server/database/connection.js';
import { getApprovedSourceRoot, getImportedSourceAsset } from '#lib/server/packs/repository.js';
import { getPackIndex, importPacksFromFolder } from '#lib/server/packs/importer.js';
import { createSamplePackFolder } from '#lib/server/packs/test-fixtures.js';

const temporaryDirectories: string[] = [];
const databases: AppDatabase[] = [];
const createTestDatabase = async (databasePath: string): Promise<AppDatabase> => {
  const database = await createDatabase(databasePath);
  databases.push(database);
  return database;
};
const { join } = path;
type PackDocument = {
  questions: { id: string; sources: { label: string; path: string }[] }[];
} & Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isUnknownArray = (value: unknown): value is unknown[] => Array.isArray(value);

const isPackDocument = (value: unknown): value is PackDocument =>
  isRecord(value) &&
  isUnknownArray(value['questions']) &&
  value['questions'].every(
    (question) =>
      isRecord(question) &&
      'id' in question &&
      typeof question['id'] === 'string' &&
      isUnknownArray(question['sources']) &&
      question['sources'].every(
        (source) =>
          isRecord(source) &&
          'label' in source &&
          typeof source['label'] === 'string' &&
          'path' in source &&
          typeof source['path'] === 'string',
      ),
  );

const readPackDocument = async (filePath: string): Promise<PackDocument> => {
  const parsed: unknown = JSON.parse(await readFile(filePath, 'utf-8')) as unknown;
  if (!isPackDocument(parsed)) {
    throw new Error('Expected the sample pack to contain source references.');
  }
  return parsed;
};

describe(importPacksFromFolder, () => {
  afterEach(async () => {
    await Promise.all(
      databases.splice(0).map(async (database) => {
        await database.close();
      }),
    );
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
    const database = await createTestDatabase(join(directory, 'state', 'packs.sqlite'));
    await createSamplePackFolder(incoming);

    const result = await importPacksFromFolder({ database, folder: incoming });

    expect(result).toStrictEqual({
      errors: [],
      imported: ['sample-engineer-exam/synthetic-foundations@1.0.0'],
      refreshed: [],
    });
    await expect(getPackIndex(database)).resolves.toStrictEqual([
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
    const database = await createTestDatabase(join(directory, 'state', 'packs.sqlite'));
    await createSamplePackFolder(incoming);

    await importPacksFromFolder({ database, folder: incoming });
    const duplicate = await importPacksFromFolder({ database, folder: incoming });

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
    if (!source) {
      throw new Error('Expected the sample pack to contain a source reference.');
    }
    source.path = 'assets/not-present.md';
    await writeFile(packFile, JSON.stringify(content));

    const database = await createTestDatabase(join(directory, 'state', 'packs.sqlite'));
    const result = await importPacksFromFolder({
      database,
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
    const [question] = content.questions;
    const citation = question?.sources[0];
    if (!question || !citation) {
      throw new Error('Expected the sample pack to contain a source reference.');
    }
    citation.path = pathToFileURL(packFile).href;
    const database = await createTestDatabase(join(directory, 'state', 'packs.sqlite'));
    await writeFile(packFile, JSON.stringify(content));

    const result = await importPacksFromFolder({
      approvedSourceRoot: incoming,
      database,
      folder: incoming,
    });
    const assets = await database.selectFrom('saved_source_assets').selectAll().execute();
    expect(result.errors).toStrictEqual([]);
    expect(result.imported).toHaveLength(1);
    expect(assets).toContainEqual(
      expect.objectContaining({
        excerpt: await readFile(packFile, 'utf-8'),
        source_path: citation.path,
      }),
    );
  });

  it('refreshes approved local excerpts without replacing the imported pack', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'exam-packs-refresh-'));
    temporaryDirectories.push(directory);
    const incoming = join(directory, 'incoming');
    const notePath = join(directory, 'approved-notes.md');
    const database = await createTestDatabase(join(directory, 'state', 'packs.sqlite'));
    await createSamplePackFolder(incoming);
    const packFile = join(incoming, 'sample-learning-pack.json');
    const content = await readPackDocument(packFile);
    const [question] = content.questions;
    const citation = question?.sources[0];
    if (!question || !citation) {
      throw new Error('Expected the sample pack to contain a source reference.');
    }
    citation.path = pathToFileURL(notePath).href;
    await writeFile(packFile, JSON.stringify(content));
    await writeFile(notePath, 'First approved excerpt.');

    const firstImport = await importPacksFromFolder({
      approvedSourceRoot: directory,
      database,
      folder: incoming,
    });
    await writeFile(notePath, 'Updated approved excerpt.');
    const refresh = await importPacksFromFolder({
      approvedSourceRoot: directory,
      database,
      folder: incoming,
    });

    expect(firstImport.imported).toHaveLength(1);
    expect(refresh).toStrictEqual({
      errors: [],
      imported: [],
      refreshed: ['sample-engineer-exam/synthetic-foundations@1.0.0'],
    });
    await expect(
      getApprovedSourceRoot(database, 'sample-engineer-exam', 'synthetic-foundations', '1.0.0'),
    ).resolves.toBe(directory);
    await expect(
      getImportedSourceAsset(
        database,
        'sample-engineer-exam',
        'synthetic-foundations',
        '1.0.0',
        question.id,
        citation.path,
      ),
    ).resolves.toStrictEqual({ excerpt: 'Updated approved excerpt.', label: citation.label });
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
    if (!citation) {
      throw new Error('Expected the sample pack to contain a source reference.');
    }
    citation.path = pathToFileURL(outside).href;
    await writeFile(packFile, JSON.stringify(content));
    const database = await createTestDatabase(join(directory, 'state', 'packs.sqlite'));

    const unapproved = await importPacksFromFolder({ database, folder: incoming });
    const outsideRoot = await importPacksFromFolder({
      approvedSourceRoot: incoming,
      database,
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
    const database = await createTestDatabase(join(directory, 'state', 'packs.sqlite'));
    await createSamplePackFolder(incoming);

    await sql`
        CREATE TRIGGER reject_source_asset
        BEFORE INSERT ON saved_source_assets
        BEGIN
          SELECT RAISE(ABORT, 'source asset write failed');
        END;
      `.execute(database);

    const result = await importPacksFromFolder({ database, folder: incoming });

    expect(result.imported).toStrictEqual([]);
    expect(result.errors).toContain(
      'sample-learning-pack.json: could not store this pack (source asset write failed).',
    );
    await expect(getPackIndex(database)).resolves.toStrictEqual([]);
  });
});
