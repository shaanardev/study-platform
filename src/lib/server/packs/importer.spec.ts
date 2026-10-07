import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { openPackDatabase } from '#lib/server/db/packs.js';
import { getPackIndex, importPacksFromFolder } from '#lib/server/packs/importer.js';
import { createSamplePackFolder } from '#lib/server/packs/test-fixtures.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('importPacksFromFolder', () => {
  it('imports the tracked synthetic sample into SQLite and exposes it in the pack index', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'exam-packs-'));
    temporaryDirectories.push(directory);
    const incoming = join(directory, 'incoming');
    const databasePath = join(directory, 'state', 'packs.sqlite');
    await createSamplePackFolder(incoming);

    const result = await importPacksFromFolder({ folder: incoming, databasePath });

    expect(result).toEqual({
      imported: ['sample-engineer-exam/synthetic-foundations@1.0.0'],
      refreshed: [],
      errors: [],
    });
    expect(getPackIndex(databasePath)).toEqual([
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

    await importPacksFromFolder({ folder: incoming, databasePath });
    const duplicate = await importPacksFromFolder({ folder: incoming, databasePath });

    expect(duplicate).toEqual({
      imported: [],
      refreshed: [],
      errors: [
        'sample-learning-pack.json: this exam, pack, and pack version are already imported.',
      ],
    });
  });

  it('rejects source references that do not resolve to local files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'exam-packs-'));
    temporaryDirectories.push(directory);
    const incoming = join(directory, 'incoming');
    await createSamplePackFolder(incoming);
    const packFile = join(incoming, 'sample-learning-pack.json');
    const content = JSON.parse(await readFile(packFile, 'utf8')) as {
      questions: { sources: { path: string }[] }[];
    };
    const source = content.questions[0]?.sources[0];
    if (!source) throw new Error('Expected the sample pack to contain a source reference.');
    source.path = 'assets/not-present.md';
    await writeFile(packFile, JSON.stringify(content));

    const result = await importPacksFromFolder({
      folder: incoming,
      databasePath: join(directory, 'state', 'packs.sqlite'),
    });

    expect(result.imported).toEqual([]);
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
    const content = JSON.parse(await readFile(packFile, 'utf8')) as {
      questions: { id: string; sources: { path: string; label: string }[] }[];
    };
    const citation = content.questions[0]?.sources[0];
    if (!citation) throw new Error('Expected the sample pack to contain a source reference.');
    citation.path = pathToFileURL(packFile).href;
    const databasePath = join(directory, 'state', 'packs.sqlite');
    await writeFile(packFile, JSON.stringify(content));

    const result = await importPacksFromFolder({
      folder: incoming,
      databasePath,
      approvedSourceRoot: incoming,
    });
    const database = openPackDatabase(databasePath);
    try {
      const assets = database
        .prepare('SELECT source_path, excerpt FROM saved_source_assets')
        .all() as { source_path: string; excerpt: string }[];
      expect(result.errors).toEqual([]);
      expect(result.imported).toHaveLength(1);
      expect(assets).toContainEqual({
        source_path: citation.path,
        excerpt: await readFile(packFile, 'utf8'),
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
    const content = JSON.parse(await readFile(packFile, 'utf8')) as {
      questions: { sources: { path: string; label: string }[] }[];
    };
    const citation = content.questions[0]?.sources[0];
    if (!citation) throw new Error('Expected the sample pack to contain a source reference.');
    citation.path = pathToFileURL(outside).href;
    await writeFile(packFile, JSON.stringify(content));
    const databasePath = join(directory, 'state', 'packs.sqlite');

    const unapproved = await importPacksFromFolder({ folder: incoming, databasePath });
    const outsideRoot = await importPacksFromFolder({
      folder: incoming,
      databasePath,
      approvedSourceRoot: incoming,
    });

    expect(unapproved.imported).toEqual([]);
    expect(unapproved.errors[0]).toContain('requires an explicitly approved local source root');
    expect(outsideRoot.imported).toEqual([]);
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

    const result = await importPacksFromFolder({ folder: incoming, databasePath });

    expect(result.imported).toEqual([]);
    expect(result.errors).toContain(
      'sample-learning-pack.json: could not store this pack (source asset write failed).',
    );
    expect(getPackIndex(databasePath)).toEqual([]);
  });
});
