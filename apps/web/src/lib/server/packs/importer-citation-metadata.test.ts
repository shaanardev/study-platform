import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { openPackDatabase } from '#lib/server/db/packs.js';
import { importPacksFromFolder } from '#lib/server/packs/importer.js';
import { workspacePath } from '#lib/server/workspace-paths.js';

const temporaryDirectories: string[] = [];
const { join } = path;
type Artifact = { questions: { sources: { path: string }[] }[] } & Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isUnknownArray = (value: unknown): value is unknown[] => Array.isArray(value);

const isArtifact = (value: unknown): value is Artifact =>
  isRecord(value) &&
  isUnknownArray(value['questions']) &&
  value['questions'].every(
    (question) =>
      isRecord(question) &&
      isUnknownArray(question['sources']) &&
      question['sources'].every(
        (source) => isRecord(source) && 'path' in source && typeof source['path'] === 'string',
      ),
  );

describe('importPacksFromFolder citation metadata', () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directory) => {
        await rm(directory, { force: true, recursive: true });
      }),
    );
  });

  it('imports the migrated v1.2.1 artifact and retains its citation metadata', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'exam-packs-metadata-'));
    temporaryDirectories.push(directory);
    const incoming = join(directory, 'incoming');
    const databasePath = join(directory, 'state', 'packs.sqlite');
    const artifactText = await readFile(
      workspacePath('packs/incoming/databricks-dea-may-2026-v1.2.1.json'),
      'utf-8',
    );
    const parsed: unknown = JSON.parse(artifactText) as unknown;
    if (!isArtifact(parsed)) {
      throw new Error('Expected the migrated pack to contain citation sources.');
    }
    const artifact = parsed;
    const notesRoot = join(directory, 'approved-notes');
    const notePath = join(notesRoot, 'reference.md');
    await mkdir(notesRoot, { recursive: true });
    await writeFile(notePath, 'Test-local citation content.\n');
    for (const question of artifact.questions) {
      for (const source of question.sources) {
        if (source.path.startsWith('file:')) {
          source.path = pathToFileURL(notePath).href;
        }
      }
    }
    await mkdir(incoming, { recursive: true });
    await writeFile(join(incoming, 'migrated-pack.json'), JSON.stringify(artifact));

    const result = await importPacksFromFolder({
      approvedSourceRoot: notesRoot,
      databasePath,
      folder: incoming,
    });

    expect(result).toStrictEqual({
      errors: [],
      imported: ['databricks-data-engineer-associate/databricks-dea-may-2026-reviewed@1.2.1'],
      refreshed: [],
    });
    const database = openPackDatabase(databasePath);
    try {
      const row: unknown = database
        .prepare('SELECT content_json FROM imported_packs WHERE pack_version = ?')
        .get('1.2.1');
      if (
        typeof row !== 'object' ||
        row === null ||
        !('content_json' in row) ||
        typeof row.content_json !== 'string'
      ) {
        throw new Error('Expected the migrated pack to be stored.');
      }
      const stored: unknown = JSON.parse(row.content_json) as unknown;
      if (!isRecord(stored) || !isUnknownArray(stored['questions'])) {
        throw new Error('Expected stored pack questions.');
      }
      const [question] = stored['questions'];
      if (!isRecord(question) || !isUnknownArray(question['sources'])) {
        throw new Error('Expected stored citation sources.');
      }
      const [source] = question['sources'];
      if (!isRecord(source)) {
        throw new Error('Expected stored citation metadata.');
      }
      expect(isUnknownArray(source['documentationUrls'])).toBeTruthy();
      expect('kind' in source ? source['kind'] : undefined).toBe('academy_note');
      expect('section' in source ? source['section'] : undefined).toBeTypeOf('string');
    } finally {
      database.close();
    }
  });
});
