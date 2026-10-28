import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { createDatabase } from '#lib/server/database/connection.js';

describe('query indexes', () => {
  it('migrates existing stores and uses indexes for pack and resumable lookups', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'query-indexes-'));
    const filename = path.join(directory, 'app.sqlite');

    try {
      const database = await createDatabase(filename);
      await database.destroy();
      const sqlite = new BetterSqlite3(filename);

      try {
        // Simulate an existing database that predates the additive index migration.
        [
          'practice_sessions_pack',
          'mock_attempts_pack',
          'practice_sessions_resumable',
          'mock_attempts_resumable',
        ].forEach((index) => {
          sqlite.exec(`DROP INDEX ${index}`);
        });

        sqlite.prepare('DELETE FROM kysely_migration WHERE name = ?').run('002-query-indexes');
      } finally {
        sqlite.close();
      }

      const reopened = await createDatabase(filename);
      await reopened.destroy();
      const migrated = new BetterSqlite3(filename);

      try {
        (
          [
            ['practice_sessions', 'updated_at'],
            ['mock_attempts', 'created_at'],
          ] as const
        ).forEach(([table, timestamp]) => {
          const packPlan = migrated
            .prepare(
              `EXPLAIN QUERY PLAN SELECT id FROM ${table} WHERE exam_id = ? AND pack_id = ? AND pack_version = ?`,
            )
            .all('exam', 'pack', '1');

          expect(JSON.stringify(packPlan)).toContain(`${table}_pack`);

          const resumePlan = migrated
            .prepare(
              `EXPLAIN QUERY PLAN SELECT id FROM ${table} WHERE status = 'in_progress' ORDER BY ${timestamp} DESC, rowid DESC LIMIT 1`,
            )
            .all();

          expect(JSON.stringify(resumePlan)).toContain(`${table}_resumable`);
          expect(JSON.stringify(resumePlan)).not.toContain('TEMP B-TREE');
        });
      } finally {
        migrated.close();
      }
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
