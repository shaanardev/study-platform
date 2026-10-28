import { sql } from 'kysely';
import type { Kysely } from 'kysely';

import type { AppDatabaseSchema } from '#lib/server/database/types.js';

/** Index the parent filters; answer primary keys already cover parent lookups. */
export const up = async (db: Kysely<AppDatabaseSchema>): Promise<void> => {
  await db.schema
    .createIndex('practice_sessions_pack')
    .on('practice_sessions')
    .columns(['exam_id', 'pack_id', 'pack_version'])
    .execute();
  await db.schema
    .createIndex('mock_attempts_pack')
    .on('mock_attempts')
    .columns(['exam_id', 'pack_id', 'pack_version'])
    .execute();
  await db.schema
    .createIndex('practice_sessions_resumable')
    .on('practice_sessions')
    .column('updated_at')
    .where(sql<boolean>`status = 'in_progress'`)
    .execute();
  await db.schema
    .createIndex('mock_attempts_resumable')
    .on('mock_attempts')
    .column('created_at')
    .where(sql<boolean>`status = 'in_progress'`)
    .execute();
};

export const down = async (db: Kysely<AppDatabaseSchema>): Promise<void> => {
  await db.schema.dropIndex('mock_attempts_resumable').execute();
  await db.schema.dropIndex('practice_sessions_resumable').execute();
  await db.schema.dropIndex('mock_attempts_pack').execute();
  await db.schema.dropIndex('practice_sessions_pack').execute();
};
