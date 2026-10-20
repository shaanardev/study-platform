import { existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { workspacePath } from '#lib/server/workspace-paths.js';
import type { ExamPack } from '@learning-platform/exam-pack';

import { databasePathVariable } from '../../../env.js';

vi.mock(import('$app/env/private'), () => ({
  get DB_PATH(): string | undefined {
    return process.env[databasePathVariable];
  },
}));

const originalValue = process.env[databasePathVariable];
let temporaryDirectory: string;

const pack: ExamPack = {
  domains: [{ id: 'domain', title: 'Domain', weight: 1 }],
  exam: { id: 'exam', title: 'Exam', version: '1' },
  pack: { id: 'pack', synthetic: false, title: 'Pack', version: '1' },
  questions: [],
  schemaVersion: 1,
};

describe('Kysely database foundation', () => {
  beforeEach(() => {
    Reflect.deleteProperty(process.env, databasePathVariable);
    vi.resetModules();
    temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'app-database-test-'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalValue === undefined) {
      Reflect.deleteProperty(process.env, databasePathVariable);
    } else {
      process.env[databasePathVariable] = originalValue;
    }
    rmSync(temporaryDirectory, { force: true, recursive: true });
  });

  it('does not open SQLite when a server module is imported', async () => {
    const databaseFile = path.join(temporaryDirectory, 'not-opened.sqlite');
    vi.stubEnv(databasePathVariable, databaseFile);

    const { databasePath } = await import('#lib/server/database/path.js');
    await import('#lib/server/database/connection.js');

    expect(databasePath).toBe(databaseFile);
    expect(existsSync(databaseFile)).toBeFalsy();
  });

  it('applies the fresh schema and can query all seven tables', async () => {
    const databaseFile = path.join(temporaryDirectory, 'fresh', 'app.sqlite');
    const { createDatabase } = await import('#lib/server/database/connection.js');
    const database = await createDatabase(databaseFile);

    try {
      const emptyTables = await Promise.all([
        database.selectFrom('imported_packs').selectAll().execute(),
        database.selectFrom('saved_source_assets').selectAll().execute(),
        database.selectFrom('practice_sessions').selectAll().execute(),
        database.selectFrom('practice_answers').selectAll().execute(),
        database.selectFrom('mock_attempts').selectAll().execute(),
        database.selectFrom('mock_answers').selectAll().execute(),
        database.selectFrom('question_feedback').selectAll().execute(),
      ]);
      expect(emptyTables).toStrictEqual([[], [], [], [], [], [], []]);
    } finally {
      await database.close();
    }
    expect(existsSync(databaseFile)).toBeTruthy();
  });

  it('parses only the explicit top-level JSON result aliases', async () => {
    const databaseFile = path.join(temporaryDirectory, 'json.sqlite');
    const { createDatabase } = await import('#lib/server/database/connection.js');
    const database = await createDatabase(databaseFile);

    try {
      await database
        .insertInto('imported_packs')
        .values({
          approved_source_root: null,
          content: JSON.stringify(pack),
          exam_id: pack.exam.id,
          imported_at: '2026-10-20T00:00:00.000Z',
          pack_id: pack.pack.id,
          pack_version: pack.pack.version,
        })
        .execute();

      const [row] = await database
        .selectFrom('imported_packs')
        .select(['content', 'content as unparsed_content'])
        .execute();
      expect(row?.content).toStrictEqual(pack);
      expect(row?.unparsed_content).toBe(JSON.stringify(pack));
    } finally {
      await database.close();
    }
  });

  it('applies migrations idempotently when reopening a fresh store', async () => {
    const databaseFile = path.join(temporaryDirectory, 'reopen.sqlite');
    const { createDatabase } = await import('#lib/server/database/connection.js');
    const first = await createDatabase(databaseFile);
    await first.close();

    const second = await createDatabase(databaseFile);
    try {
      await expect(
        second.selectFrom('imported_packs').selectAll().execute(),
      ).resolves.toStrictEqual([]);
    } finally {
      await second.close();
    }
  });

  it('fails clearly when migration state is unknown or newer', async () => {
    const databaseFile = path.join(temporaryDirectory, 'newer.sqlite');
    const rawDatabase = new BetterSqlite3(databaseFile);
    rawDatabase.exec(
      'CREATE TABLE kysely_migration (name TEXT PRIMARY KEY NOT NULL, timestamp TEXT NOT NULL)',
    );
    rawDatabase
      .prepare('INSERT INTO kysely_migration (name, timestamp) VALUES (?, ?)')
      .run('999-future-schema', '2026-10-20T00:00:00.000Z');
    rawDatabase.close();

    const { createDatabase } = await import('#lib/server/database/connection.js');
    await expect(createDatabase(databaseFile)).rejects.toThrow(/unknown or newer migration/u);
  });

  it('rejects explicit active database paths and symlink aliases', async () => {
    const activeDatabasePath = workspacePath('.local/app.sqlite');
    const aliasPath = path.join(temporaryDirectory, 'active-alias.sqlite');
    symlinkSync(activeDatabasePath, aliasPath);

    vi.stubEnv(databasePathVariable, activeDatabasePath);
    await expect(import('#lib/server/database/path.js')).rejects.toThrow(
      `${databasePathVariable} must not point to a protected workspace database.`,
    );

    vi.stubEnv(databasePathVariable, aliasPath);
    vi.resetModules();
    await expect(import('#lib/server/database/path.js')).rejects.toThrow(
      `${databasePathVariable} must not point to a protected workspace database.`,
    );
  });

  it('refuses to open the archived database through the factory', async () => {
    const { createDatabase } = await import('#lib/server/database/connection.js');
    await expect(createDatabase(workspacePath('.local/exam-packs.sqlite'))).rejects.toThrow(
      'createDatabase(path) must not point to a protected workspace database.',
    );
  });

  it('initializes a single app database instance from the lifecycle module', async () => {
    vi.stubEnv(databasePathVariable, path.join(temporaryDirectory, 'app.sqlite'));
    const { closeAppDatabase, getAppDatabase, initializeAppDatabase } =
      await import('#lib/server/database/app-database.js');

    await expect(Promise.resolve().then(getAppDatabase)).rejects.toThrow(
      'The app database has not been initialized',
    );
    const first = await initializeAppDatabase();
    const second = await initializeAppDatabase();
    expect(second).toBe(first);
    expect(getAppDatabase()).toBe(first);
    await closeAppDatabase();
    await expect(Promise.resolve().then(getAppDatabase)).rejects.toThrow(
      'The app database has not been initialized',
    );
  });
});
