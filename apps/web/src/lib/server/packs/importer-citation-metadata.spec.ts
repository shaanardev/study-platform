import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { openPackDatabase } from '#lib/server/db/packs.js';
import { importPacksFromFolder } from '#lib/server/packs/importer.js';
import { workspacePath } from '#lib/server/workspace-paths.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('importPacksFromFolder citation metadata', () => {
  it('imports the migrated v1.2.1 artifact and retains its citation metadata', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'exam-packs-metadata-'));
    temporaryDirectories.push(directory);
    const incoming = join(directory, 'incoming');
    const databasePath = join(directory, 'state', 'packs.sqlite');
    const artifactText = await readFile(
      workspacePath('packs/incoming/databricks-dea-may-2026-v1.2.1.json'),
      'utf8',
    );
    const artifact = JSON.parse(artifactText) as {
      questions: { sources: { path: string; [key: string]: unknown }[] }[];
    };
    const notesRoot = join(directory, 'approved-notes');
    const notePath = join(notesRoot, 'reference.md');
    await mkdir(notesRoot, { recursive: true });
    await writeFile(notePath, 'Test-local citation content.\n');
    for (const question of artifact.questions) {
      for (const source of question.sources) {
        if (source.path.startsWith('file:')) source.path = pathToFileURL(notePath).href;
      }
    }
    await mkdir(incoming, { recursive: true });
    await writeFile(join(incoming, 'migrated-pack.json'), JSON.stringify(artifact));

    const result = await importPacksFromFolder({
      folder: incoming,
      databasePath,
      approvedSourceRoot: notesRoot,
    });

    expect(result).toEqual({
      imported: ['databricks-data-engineer-associate/databricks-dea-may-2026-reviewed@1.2.1'],
      refreshed: [],
      errors: [],
    });
    const database = openPackDatabase(databasePath);
    try {
      const row = database
        .prepare('SELECT content_json FROM imported_packs WHERE pack_version = ?')
        .get('1.2.1') as { content_json: string } | undefined;
      if (!row) throw new Error('Expected the migrated pack to be stored.');
      const stored = JSON.parse(row.content_json) as {
        questions: { sources: Record<string, unknown>[] }[];
      };
      expect(stored.questions[0]?.sources[0]).toMatchObject({
        kind: 'academy_note',
        section: expect.any(String),
        documentationUrls: expect.any(Array),
      });
    } finally {
      database.close();
    }
  });
});
