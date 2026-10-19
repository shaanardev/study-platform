import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import * as Schema from 'effect/Schema';
import { afterEach, describe, expect, it } from 'vitest';

import { openPackDatabase } from '#lib/server/db/packs.js';
import { decodeJsonText } from '#lib/server/json.js';
import { importPacksFromFolder } from '#lib/server/packs/importer.js';
import { validateExamPack } from '#lib/server/packs/validate.js';
import { workspacePath } from '#lib/server/workspace-paths.js';

const temporaryDirectories: string[] = [];
const { join } = path;

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

    const validation = validateExamPack(decodeJsonText(artifactText));
    expect.assert(validation.valid, 'Expected the migrated pack to contain citation sources.');
    const artifact = validation.pack;
    const notesRoot = join(directory, 'approved-notes');
    const notePath = join(notesRoot, 'reference.md');
    await mkdir(notesRoot, { recursive: true });
    await writeFile(notePath, 'Test-local citation content.\n');

    const fileSources = artifact.questions.flatMap(({ sources }) =>
      sources.filter(({ path: sourcePath }) => sourcePath.startsWith('file:')),
    );

    expect(fileSources.length).toBeGreaterThan(0);

    const noteUrl = pathToFileURL(notePath).href;

    const approvedArtifact = {
      ...artifact,
      questions: artifact.questions.map((question) => ({
        ...question,
        sources: question.sources.map((source) => ({
          ...source,
          path: source.path.replace(/^file:.*$/u, noteUrl),
        })),
      })),
    };

    await mkdir(incoming, { recursive: true });
    await writeFile(join(incoming, 'migrated-pack.json'), JSON.stringify(approvedArtifact));

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
      const row = Schema.decodeUnknownSync(Schema.Struct({ content_json: Schema.String }))(
        database
          .prepare('SELECT content_json FROM imported_packs WHERE pack_version = ?')
          .get('1.2.1'),
      );

      const storedValidation = validateExamPack(decodeJsonText(row.content_json));
      expect.assert(storedValidation.valid, 'Expected the migrated pack content to validate.');
      const [question] = storedValidation.pack.questions;
      expect.assert(question, 'Expected a stored question.');
      const [source] = question.sources;
      expect.assert(source, 'Expected stored citation metadata.');
      expect(Array.isArray(source.documentationUrls)).toBeTruthy();
      expect(source.kind).toBe('academy_note');
      expect(source.section).toBeTypeOf('string');
    } finally {
      database.close();
    }
  });
});
