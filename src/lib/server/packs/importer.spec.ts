import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getPackIndex, importPacksFromFolder } from '#lib/server/packs/importer.js';

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
    await cp(resolve('packs/incoming'), incoming, { recursive: true });

    const result = await importPacksFromFolder({ folder: incoming, databasePath });

    expect(result).toEqual({
      imported: ['databricks-data-engineer-associate/synthetic-foundations@1.0.0'],
      errors: [],
    });
    expect(getPackIndex(databasePath)).toEqual([
      expect.objectContaining({
        examId: 'databricks-data-engineer-associate',
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
    await cp(resolve('packs/incoming'), incoming, { recursive: true });

    await importPacksFromFolder({ folder: incoming, databasePath });
    const duplicate = await importPacksFromFolder({ folder: incoming, databasePath });

    expect(duplicate).toEqual({
      imported: [],
      errors: [
        'sample-databricks-associate.json: this exam, pack, and pack version are already imported.',
      ],
    });
  });

  it('rejects source references that do not resolve to local files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'exam-packs-'));
    temporaryDirectories.push(directory);
    const incoming = join(directory, 'incoming');
    await mkdir(incoming);
    const packFile = join(incoming, 'sample-databricks-associate.json');
    await cp(resolve('packs/incoming/sample-databricks-associate.json'), packFile);
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
        'sample-databricks-associate.json: source path "assets/not-present.md" ',
        'does not resolve to a local file.',
      ].join(''),
    );
  });
});
