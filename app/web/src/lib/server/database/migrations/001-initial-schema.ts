import { sql } from 'kysely';
import type { Kysely } from 'kysely';

import type { AppDatabaseSchema } from '#lib/server/database/types.js';

export const up = async (db: Kysely<AppDatabaseSchema>): Promise<void> => {
  await db.schema
    .createTable('imported_packs')
    .addColumn('exam_id', 'text', (column) => column.notNull())
    .addColumn('pack_id', 'text', (column) => column.notNull())
    .addColumn('pack_version', 'text', (column) => column.notNull())
    .addColumn('content', 'text', (column) => column.notNull())
    .addColumn('approved_source_root', 'text')
    .addColumn('imported_at', 'text', (column) => column.notNull())
    .addPrimaryKeyConstraint('imported_packs_pk', ['exam_id', 'pack_id', 'pack_version'])
    .execute();

  await db.schema
    .createTable('saved_source_assets')
    .addColumn('exam_id', 'text', (column) => column.notNull())
    .addColumn('pack_id', 'text', (column) => column.notNull())
    .addColumn('pack_version', 'text', (column) => column.notNull())
    .addColumn('question_id', 'text', (column) => column.notNull())
    .addColumn('source_path', 'text', (column) => column.notNull())
    .addColumn('label', 'text', (column) => column.notNull())
    .addColumn('excerpt', 'text', (column) => column.notNull())
    .addPrimaryKeyConstraint('saved_source_assets_pk', [
      'exam_id',
      'pack_id',
      'pack_version',
      'question_id',
      'source_path',
    ])
    .addForeignKeyConstraint(
      'saved_source_assets_pack_fk',
      ['exam_id', 'pack_id', 'pack_version'],
      'imported_packs',
      ['exam_id', 'pack_id', 'pack_version'],
      (constraint) => constraint.onDelete('cascade'),
    )
    .execute();

  await db.schema
    .createTable('practice_sessions')
    .addColumn('id', 'text', (column) => column.primaryKey().notNull())
    .addColumn('exam_id', 'text', (column) => column.notNull())
    .addColumn('pack_id', 'text', (column) => column.notNull())
    .addColumn('pack_version', 'text', (column) => column.notNull())
    .addColumn('domain_ids', 'text', (column) => column.notNull())
    .addColumn('question_ids', 'text', (column) => column.notNull())
    .addColumn('question_snapshot', 'text', (column) => column.notNull())
    .addColumn('status', 'text', (column) => column.notNull())
    .addColumn('created_at', 'text', (column) => column.notNull())
    .addColumn('updated_at', 'text', (column) => column.notNull())
    .addCheckConstraint(
      'practice_sessions_status_check',
      sql`status in ('in_progress', 'completed')`,
    )
    .addForeignKeyConstraint(
      'practice_sessions_pack_fk',
      ['exam_id', 'pack_id', 'pack_version'],
      'imported_packs',
      ['exam_id', 'pack_id', 'pack_version'],
      (constraint) => constraint.onDelete('cascade'),
    )
    .execute();

  await db.schema
    .createTable('practice_answers')
    .addColumn('session_id', 'text', (column) => column.notNull())
    .addColumn('question_id', 'text', (column) => column.notNull())
    .addColumn('answer_ids', 'text', (column) => column.notNull())
    .addColumn('correct', 'integer', (column) => column.notNull())
    .addColumn('answered_at', 'text', (column) => column.notNull())
    .addCheckConstraint('practice_answers_correct_check', sql`correct in (0, 1)`)
    .addPrimaryKeyConstraint('practice_answers_pk', ['session_id', 'question_id'])
    .addForeignKeyConstraint(
      'practice_answers_session_fk',
      ['session_id'],
      'practice_sessions',
      ['id'],
      (constraint) => constraint.onDelete('cascade'),
    )
    .execute();

  await db.schema
    .createTable('mock_attempts')
    .addColumn('id', 'text', (column) => column.primaryKey().notNull())
    .addColumn('exam_id', 'text', (column) => column.notNull())
    .addColumn('pack_id', 'text', (column) => column.notNull())
    .addColumn('pack_version', 'text', (column) => column.notNull())
    .addColumn('question_ids', 'text', (column) => column.notNull())
    .addColumn('question_snapshot', 'text', (column) => column.notNull())
    .addColumn('duration_minutes', 'integer', (column) => column.notNull())
    .addColumn('deadline', 'integer', (column) => column.notNull())
    .addColumn('status', 'text', (column) => column.notNull())
    .addColumn('created_at', 'text', (column) => column.notNull())
    .addCheckConstraint(
      'mock_attempts_status_check',
      sql`status in ('in_progress', 'submitted', 'expired')`,
    )
    .addForeignKeyConstraint(
      'mock_attempts_pack_fk',
      ['exam_id', 'pack_id', 'pack_version'],
      'imported_packs',
      ['exam_id', 'pack_id', 'pack_version'],
      (constraint) => constraint.onDelete('cascade'),
    )
    .execute();

  await db.schema
    .createTable('mock_answers')
    .addColumn('attempt_id', 'text', (column) => column.notNull())
    .addColumn('question_id', 'text', (column) => column.notNull())
    .addColumn('answer_ids', 'text', (column) => column.notNull())
    .addColumn('answered_at', 'text', (column) => column.notNull())
    .addPrimaryKeyConstraint('mock_answers_pk', ['attempt_id', 'question_id'])
    .addForeignKeyConstraint(
      'mock_answers_attempt_fk',
      ['attempt_id'],
      'mock_attempts',
      ['id'],
      (constraint) => constraint.onDelete('cascade'),
    )
    .execute();

  await db.schema
    .createTable('question_feedback')
    .addColumn('exam_id', 'text', (column) => column.notNull())
    .addColumn('pack_id', 'text', (column) => column.notNull())
    .addColumn('pack_version', 'text', (column) => column.notNull())
    .addColumn('question_id', 'text', (column) => column.notNull())
    .addColumn('flags', 'text', (column) => column.notNull())
    .addColumn('correction', 'text')
    .addColumn('retired', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('updated_at', 'text', (column) => column.notNull())
    .addCheckConstraint('question_feedback_retired_check', sql`retired in (0, 1)`)
    .addPrimaryKeyConstraint('question_feedback_pk', [
      'exam_id',
      'pack_id',
      'pack_version',
      'question_id',
    ])
    .addForeignKeyConstraint(
      'question_feedback_pack_fk',
      ['exam_id', 'pack_id', 'pack_version'],
      'imported_packs',
      ['exam_id', 'pack_id', 'pack_version'],
      (constraint) => constraint.onDelete('cascade'),
    )
    .execute();
};

export const down = async (db: Kysely<AppDatabaseSchema>): Promise<void> => {
  await db.schema.dropTable('question_feedback').execute();
  await db.schema.dropTable('mock_answers').execute();
  await db.schema.dropTable('mock_attempts').execute();
  await db.schema.dropTable('practice_answers').execute();
  await db.schema.dropTable('practice_sessions').execute();
  await db.schema.dropTable('saved_source_assets').execute();
  await db.schema.dropTable('imported_packs').execute();
};
