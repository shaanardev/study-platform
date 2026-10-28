import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { Kysely, sql, SqliteDialect } from 'kysely';
import { Migrator } from 'kysely/migration';
import { describe, expect, it } from 'vitest';

import { createDatabase } from '#lib/server/database/connection.js';
import { migrationProvider } from '#lib/server/database/migrations.js';
import type { AppDatabaseSchema } from '#lib/server/database/types.js';
import { sampleLearningPackFixture } from '#lib/test-fixtures.js';

describe('query index migration', () => {
  it('upgrades a populated original-schema database without losing saved learning history', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'query-indexes-'));
    const filename = path.join(directory, 'app.sqlite');
    const pack = sampleLearningPackFixture();
    const recordedAt = new Date().toISOString();
    const [question] = pack.questions;

    expect.assert(question !== undefined, 'The sample pack must contain a question.');

    try {
      const legacy = new Kysely<AppDatabaseSchema>({
        dialect: new SqliteDialect({ database: new BetterSqlite3(filename) }),
      });

      try {
        const migration = await new Migrator({ db: legacy, provider: migrationProvider }).migrateTo(
          '001-initial-schema',
        );

        expect(migration.error).toBeUndefined();

        await legacy
          .insertInto('imported_packs')
          .values({
            approved_source_root: null,
            content: JSON.stringify(pack),
            exam_id: pack.exam.id,
            imported_at: recordedAt,
            pack_id: pack.pack.id,
            pack_version: pack.pack.version,
          })
          .execute();
        await legacy
          .insertInto('practice_sessions')
          .values({
            created_at: recordedAt,
            domain_ids: JSON.stringify([question.domainId]),
            exam_id: pack.exam.id,
            id: 'saved-session',
            pack_id: pack.pack.id,
            pack_version: pack.pack.version,
            question_ids: JSON.stringify([question.id]),
            question_snapshot: JSON.stringify(pack.questions),
            status: 'completed',
            updated_at: recordedAt,
          })
          .execute();
        await legacy
          .insertInto('practice_answers')
          .values({
            answer_ids: JSON.stringify(question.answerIds),
            answered_at: recordedAt,
            correct: 1,
            question_id: question.id,
            session_id: 'saved-session',
          })
          .execute();
      } finally {
        await legacy.destroy();
      }

      const upgraded = await createDatabase(filename);

      try {
        const savedPack = await upgraded
          .selectFrom('imported_packs')
          .select(['content', 'imported_at'])
          .executeTakeFirstOrThrow();

        const session = await upgraded
          .selectFrom('practice_sessions')
          .select(['id', 'question_snapshot', 'status', 'updated_at'])
          .executeTakeFirstOrThrow();

        const answer = await upgraded
          .selectFrom('practice_answers')
          .select(['answer_ids', 'answered_at', 'correct', 'session_id'])
          .executeTakeFirstOrThrow();

        expect({ answer, pack: savedPack, session }).toStrictEqual({
          answer: {
            answer_ids: question.answerIds,
            answered_at: recordedAt,
            correct: 1,
            session_id: 'saved-session',
          },
          pack: { content: pack, imported_at: recordedAt },
          session: {
            id: 'saved-session',
            question_snapshot: pack.questions,
            status: 'completed',
            updated_at: recordedAt,
          },
        });

        // Check the installed schema rather than a planner choice on empty tables.
        const indexes = await sql<{ index_name: string; column_name: string; partial: number }>`
          WITH indexes AS (
            SELECT name, partial FROM pragma_index_list('practice_sessions')
            UNION ALL
            SELECT name, partial FROM pragma_index_list('mock_attempts')
          )
          SELECT indexes.name AS index_name, columns.name AS column_name, indexes.partial
          FROM indexes JOIN pragma_index_info(indexes.name) AS columns
          WHERE indexes.name IN (
            'practice_sessions_pack', 'practice_sessions_resumable',
            'mock_attempts_pack', 'mock_attempts_resumable'
          )
          ORDER BY indexes.name, columns.seqno
        `.execute(upgraded);

        expect(
          indexes.rows.map((row) => [row.index_name, row.column_name, row.partial]),
        ).toStrictEqual([
          ['mock_attempts_pack', 'exam_id', 0],
          ['mock_attempts_pack', 'pack_id', 0],
          ['mock_attempts_pack', 'pack_version', 0],
          ['mock_attempts_resumable', 'created_at', 1],
          ['practice_sessions_pack', 'exam_id', 0],
          ['practice_sessions_pack', 'pack_id', 0],
          ['practice_sessions_pack', 'pack_version', 0],
          ['practice_sessions_resumable', 'updated_at', 1],
        ]);
      } finally {
        await upgraded.destroy();
      }
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
