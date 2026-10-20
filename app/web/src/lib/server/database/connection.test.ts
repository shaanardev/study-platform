import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ExamPack } from '@learning-platform/exam-pack';
import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeAppDatabase,
  getAppDatabase,
  initializeAppDatabase,
} from '#lib/server/database/app-database.js';
import { createDatabase } from '#lib/server/database/connection.js';
import { workspacePath } from '#lib/server/workspace-paths.js';

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
    temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'app-database-test-'));
  });

  afterEach(() => {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  });

  it('creates SQLite only when the database factory is called', async () => {
    const databaseFile = path.join(temporaryDirectory, 'not-opened.sqlite');
    expect(existsSync(databaseFile)).toBeFalsy();
    const database = await createDatabase(databaseFile);
    await database.destroy();
    expect(existsSync(databaseFile)).toBeTruthy();
  });

  it('applies the fresh schema and can query all seven tables', async () => {
    const databaseFile = path.join(temporaryDirectory, 'fresh', 'app.sqlite');
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
      await database.destroy();
    }

    expect(existsSync(databaseFile)).toBeTruthy();
  });

  it('parses only the explicit top-level JSON result aliases', async () => {
    const databaseFile = path.join(temporaryDirectory, 'json.sqlite');
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
      await database.destroy();
    }
  });

  it('applies migrations idempotently when reopening a fresh store', async () => {
    const databaseFile = path.join(temporaryDirectory, 'reopen.sqlite');
    const first = await createDatabase(databaseFile);
    await first.destroy();

    const second = await createDatabase(databaseFile);

    try {
      await expect(
        second.selectFrom('imported_packs').selectAll().execute(),
      ).resolves.toStrictEqual([]);
    } finally {
      await second.destroy();
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

    await expect(createDatabase(databaseFile)).rejects.toThrow(/unknown or newer migration/u);
  });

  it('rejects an explicit path to the active workspace database', async () => {
    const activeDatabasePath = workspacePath('.local/app.sqlite');

    await expect(createDatabase(activeDatabasePath)).rejects.toThrow(
      'createDatabase(path) must not point to a protected workspace database.',
    );
  });

  it('refuses to open the archived database through the factory', async () => {
    await expect(createDatabase(workspacePath('.local/exam-packs.sqlite'))).rejects.toThrow(
      'createDatabase(path) must not point to a protected workspace database.',
    );
  });

  it('initializes a single app database instance from the lifecycle module', async () => {
    await expect(Promise.resolve().then(getAppDatabase)).rejects.toThrow(
      'The app database has not been initialized',
    );
    const selectedPath = path.join(temporaryDirectory, 'app.sqlite');
    const first = await initializeAppDatabase(selectedPath);
    const second = await initializeAppDatabase(selectedPath);
    expect(second).toBe(first);
    expect(getAppDatabase()).toBe(first);
    await closeAppDatabase();
    await expect(Promise.resolve().then(getAppDatabase)).rejects.toThrow(
      'The app database has not been initialized',
    );
  });
});
