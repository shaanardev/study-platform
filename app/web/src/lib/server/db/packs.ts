import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SQLOutputValue } from 'node:sqlite';

import * as Schema from 'effect/Schema';

import { decodeJsonText } from '#lib/server/json.js';
import { normalizeLegacyCitations } from '#lib/server/packs/legacy.js';
import { validateExamPack } from '#lib/server/packs/validate.js';
import { workspacePath } from '#lib/server/workspace-paths.js';
import type { ExamPack } from '#lib/types/exam-pack.js';

type DatabaseRow = Record<string, SQLOutputValue>;

const questionSnapshotColumnMigrations = [
  ['practice_sessions', 'question_snapshot_json'],
  ['mock_attempts', 'question_snapshot_json'],
] as const;

type QuestionSnapshotColumnMigration = (typeof questionSnapshotColumnMigrations)[number];

const readTextColumn = (row: DatabaseRow, column: string): string => {
  const value = row[column];

  if (!Schema.is(Schema.String)(value)) {
    throw new TypeError(`Database column "${column}" is not text.`);
  }

  return value;
};

const readOptionalTextColumn = (row: DatabaseRow, column: string): string | undefined => {
  const value = row[column];

  return Schema.is(Schema.String)(value) ? value : undefined;
};

const readNumberColumn = (row: DatabaseRow, column: string): number => {
  const value = row[column];

  if (!Schema.is(Schema.Finite)(value)) {
    throw new TypeError(`Database column "${column}" is not a finite number.`);
  }

  return value;
};

const parseStoredPack = (content: string): ExamPack => {
  const parsed = normalizeLegacyCitations(decodeJsonText(content));
  const result = validateExamPack(parsed);

  if (!result.valid) {
    throw new Error('Stored exam pack is invalid.');
  }

  return result.pack;
};

export interface PackIndexItem {
  examId: string;
  examTitle: string;
  examVersion: string;
  packId: string;
  packTitle: string;
  packVersion: string;
  synthetic: boolean;
  questionCount: number;
  domainCount: number;
  domains: { id: string; title: string; weight: number; questionCount: number }[];
  importedAt: string;
}

export interface ImportedSourceAsset {
  questionId: string;
  source: { path: string; label: string };
  excerpt: string;
}

export const openPackDatabase = (databasePath = workspacePath('.local/exam-packs.sqlite')) => {
  const resolvedPath = path.resolve(databasePath);
  mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const database = new DatabaseSync(resolvedPath);
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS app_state (
      state_key TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS imported_packs (
      exam_id TEXT NOT NULL,
      exam_title TEXT NOT NULL,
      exam_version TEXT NOT NULL,
      pack_id TEXT NOT NULL,
      pack_title TEXT NOT NULL,
      pack_version TEXT NOT NULL,
      synthetic INTEGER NOT NULL,
      question_count INTEGER NOT NULL,
      domain_count INTEGER NOT NULL,
      content_json TEXT NOT NULL,
      approved_source_root TEXT,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (exam_id, pack_id, pack_version)
    );
    CREATE TABLE IF NOT EXISTS practice_sessions (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      pack_id TEXT NOT NULL,
      pack_version TEXT NOT NULL,
      domain_ids_json TEXT NOT NULL,
      question_ids_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (exam_id, pack_id, pack_version)
        REFERENCES imported_packs (exam_id, pack_id, pack_version)
    );
    CREATE TABLE IF NOT EXISTS practice_answers (
      session_id TEXT NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL,
      answer_ids_json TEXT NOT NULL,
      correct INTEGER NOT NULL,
      answered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (session_id, question_id)
    );
    CREATE TABLE IF NOT EXISTS mock_attempts (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      pack_id TEXT NOT NULL,
      pack_version TEXT NOT NULL,
      question_ids_json TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      deadline INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('in_progress', 'submitted', 'expired')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (exam_id, pack_id, pack_version)
        REFERENCES imported_packs (exam_id, pack_id, pack_version)
    );
    CREATE TABLE IF NOT EXISTS mock_answers (
      attempt_id TEXT NOT NULL REFERENCES mock_attempts(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL,
      answer_ids_json TEXT NOT NULL,
      answered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (attempt_id, question_id)
    );
    CREATE TABLE IF NOT EXISTS saved_source_assets (
      exam_id TEXT NOT NULL,
      pack_id TEXT NOT NULL,
      pack_version TEXT NOT NULL,
      question_id TEXT NOT NULL,
      source_path TEXT NOT NULL,
      label TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      PRIMARY KEY (exam_id, pack_id, pack_version, question_id, source_path),
      FOREIGN KEY (exam_id, pack_id, pack_version)
        REFERENCES imported_packs (exam_id, pack_id, pack_version)
    );
    CREATE TABLE IF NOT EXISTS question_feedback (
      exam_id TEXT NOT NULL,
      pack_id TEXT NOT NULL,
      pack_version TEXT NOT NULL,
      question_id TEXT NOT NULL,
      flags_json TEXT NOT NULL DEFAULT '[]',
      correction_json TEXT,
      retired INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (exam_id, pack_id, pack_version, question_id)
    );
  `);

  const importedPackColumns = database
    .prepare('PRAGMA table_info(imported_packs)')
    .all()
    .map((row) => readTextColumn(row, 'name'));

  if (!importedPackColumns.includes('approved_source_root')) {
    database.exec('ALTER TABLE imported_packs ADD COLUMN approved_source_root TEXT');
  }

  questionSnapshotColumnMigrations.forEach(([table, column]: QuestionSnapshotColumnMigration) => {
    const columns = database
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((row) => readTextColumn(row, 'name'));

    if (!columns.includes(column)) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`);
    }
  });

  return database;
};

export const saveImportedPack = (
  databasePath: string,
  pack: ExamPack,
  sourceAssets: ImportedSourceAsset[] = [],
  approvedSourceRoot?: string,
): void => {
  const database = openPackDatabase(databasePath);

  try {
    database.exec('BEGIN');
    database
      .prepare(
        `
      INSERT INTO imported_packs (
        exam_id, exam_title, exam_version, pack_id, pack_title, pack_version,
        synthetic, question_count, domain_count, content_json, approved_source_root
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        pack.exam.id,
        pack.exam.title,
        pack.exam.version,
        pack.pack.id,
        pack.pack.title,
        pack.pack.version,
        Number(pack.pack.synthetic),
        pack.questions.length,
        pack.domains.length,
        JSON.stringify(pack),
        approvedSourceRoot ?? null,
      );
    database
      .prepare(
        `
      INSERT INTO app_state (state_key, state_json, updated_at)
      VALUES ('last_pack_import', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(state_key) DO UPDATE SET state_json = excluded.state_json,
        updated_at = CURRENT_TIMESTAMP
    `,
      )
      .run(
        JSON.stringify({
          examId: pack.exam.id,
          packId: pack.pack.id,
          packVersion: pack.pack.version,
        }),
      );

    const insertSourceAsset = database.prepare(`
      INSERT OR IGNORE INTO saved_source_assets (
        exam_id, pack_id, pack_version, question_id, source_path, label, excerpt
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    sourceAssets.forEach(({ questionId, source, excerpt }) => {
      insertSourceAsset.run(
        pack.exam.id,
        pack.pack.id,
        pack.pack.version,
        questionId,
        source.path,
        source.label,
        excerpt,
      );
    });

    database.exec('COMMIT');
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // The original SQLite error is the useful one to report.
    }

    throw error;
  } finally {
    database.close();
  }
};

export const refreshApprovedLocalSources = (
  databasePath: string,
  pack: ExamPack,
  sourceAssets: ImportedSourceAsset[],
  approvedSourceRoot: string,
): boolean => {
  const localSourceAssets = sourceAssets.filter(({ source }) => source.path.startsWith('file:'));

  if (localSourceAssets.length === 0) {
    return false;
  }

  const database = openPackDatabase(databasePath);

  try {
    database.exec('BEGIN IMMEDIATE');

    const existing = database
      .prepare(
        `
      SELECT content_json AS contentJson FROM imported_packs
      WHERE exam_id = ? AND pack_id = ? AND pack_version = ?
    `,
      )
      .get(pack.exam.id, pack.pack.id, pack.pack.version);

    if (!existing || readTextColumn(existing, 'contentJson') !== JSON.stringify(pack)) {
      database.exec('ROLLBACK');

      return false;
    }

    database
      .prepare(
        `
      UPDATE imported_packs SET approved_source_root = ?
      WHERE exam_id = ? AND pack_id = ? AND pack_version = ?
    `,
      )
      .run(approvedSourceRoot, pack.exam.id, pack.pack.id, pack.pack.version);
    database
      .prepare(
        `
      DELETE FROM saved_source_assets
      WHERE exam_id = ? AND pack_id = ? AND pack_version = ?
        AND substr(source_path, 1, 5) = 'file:'
    `,
      )
      .run(pack.exam.id, pack.pack.id, pack.pack.version);

    const insertSourceAsset = database.prepare(`
      INSERT INTO saved_source_assets (
        exam_id, pack_id, pack_version, question_id, source_path, label, excerpt
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    localSourceAssets.forEach(({ questionId, source, excerpt }) => {
      insertSourceAsset.run(
        pack.exam.id,
        pack.pack.id,
        pack.pack.version,
        questionId,
        source.path,
        source.label,
        excerpt,
      );
    });

    database.exec('COMMIT');

    return true;
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // Preserve the original SQLite error.
    }

    throw error;
  } finally {
    database.close();
  }
};

export const getApprovedSourceRoot = (
  databasePath: string,
  examId: string,
  packId: string,
  packVersion: string,
): string | undefined => {
  const database = openPackDatabase(databasePath);

  try {
    const row = database
      .prepare(
        `
      SELECT approved_source_root AS approvedSourceRoot FROM imported_packs
      WHERE exam_id = ? AND pack_id = ? AND pack_version = ?
    `,
      )
      .get(examId, packId, packVersion);

    if (!row) {
      return undefined;
    }

    return readOptionalTextColumn(row, 'approvedSourceRoot');
  } finally {
    database.close();
  }
};

export const listImportedPacks = (
  databasePath = workspacePath('.local/exam-packs.sqlite'),
): PackIndexItem[] => {
  const resolvedPath = path.resolve(databasePath);
  const database = openPackDatabase(resolvedPath);

  try {
    return database
      .prepare(
        `
      SELECT exam_id AS examId, exam_title AS examTitle, exam_version AS examVersion,
        pack_id AS packId, pack_title AS packTitle, pack_version AS packVersion,
        synthetic, question_count AS questionCount, domain_count AS domainCount,
        content_json AS contentJson, imported_at AS importedAt
      FROM imported_packs
      ORDER BY exam_title, pack_title, pack_version DESC
      `,
      )
      .all()
      .map((row) => {
        const pack = parseStoredPack(readTextColumn(row, 'contentJson'));

        return {
          domainCount: readNumberColumn(row, 'domainCount'),
          domains: pack.domains.map((domain) => ({
            ...domain,
            questionCount: pack.questions.filter((question) => question.domainId === domain.id)
              .length,
          })),
          examId: readTextColumn(row, 'examId'),
          examTitle: readTextColumn(row, 'examTitle'),
          examVersion: readTextColumn(row, 'examVersion'),
          importedAt: readTextColumn(row, 'importedAt'),
          packId: readTextColumn(row, 'packId'),
          packTitle: readTextColumn(row, 'packTitle'),
          packVersion: readTextColumn(row, 'packVersion'),
          questionCount: readNumberColumn(row, 'questionCount'),
          synthetic: readNumberColumn(row, 'synthetic') === 1,
        };
      });
  } finally {
    database.close();
  }
};

export const getImportedPack = (
  examId: string,
  packId: string,
  packVersion: string,
  databasePath = workspacePath('.local/exam-packs.sqlite'),
): ExamPack | undefined => {
  const database = openPackDatabase(databasePath);

  try {
    const row = database
      .prepare(
        `
      SELECT content_json AS contentJson FROM imported_packs
      WHERE exam_id = ? AND pack_id = ? AND pack_version = ?
    `,
      )
      .get(examId, packId, packVersion);

    return row ? parseStoredPack(readTextColumn(row, 'contentJson')) : undefined;
  } finally {
    database.close();
  }
};

export const getImportedSourceAsset = (
  databasePath: string,
  examId: string,
  packId: string,
  packVersion: string,
  questionId: string,
  sourcePath: string,
): { label: string; excerpt: string } | undefined => {
  const database = openPackDatabase(databasePath);

  try {
    const row = database
      .prepare(
        `
      SELECT label, excerpt FROM saved_source_assets
      WHERE exam_id = ? AND pack_id = ? AND pack_version = ? AND question_id = ? AND source_path = ?
    `,
      )
      .get(examId, packId, packVersion, questionId, sourcePath);

    return row
      ? {
          excerpt: readTextColumn(row, 'excerpt'),
          label: readTextColumn(row, 'label'),
        }
      : undefined;
  } finally {
    database.close();
  }
};
