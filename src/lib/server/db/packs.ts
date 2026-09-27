import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ExamPack } from '../packs/validate';

export type PackIndexItem = {
  examId: string;
  examTitle: string;
  examVersion: string;
  packId: string;
  packTitle: string;
  packVersion: string;
  synthetic: boolean;
  questionCount: number;
  domainCount: number;
  domains: { id: string; title: string; weight: number }[];
  importedAt: string;
};

export function openPackDatabase(databasePath = resolve('.local/exam-packs.sqlite')) {
  const path = resolve(databasePath);
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
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
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (exam_id, pack_id, pack_version)
    );
  `);
  return database;
}

export function saveImportedPack(databasePath: string, pack: ExamPack): void {
  const database = openPackDatabase(databasePath);
  try {
    database.exec('BEGIN');
    database.prepare(`
      INSERT INTO imported_packs (
        exam_id, exam_title, exam_version, pack_id, pack_title, pack_version,
        synthetic, question_count, domain_count, content_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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
    );
    database.prepare(`
      INSERT INTO app_state (state_key, state_json, updated_at)
      VALUES ('last_pack_import', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(state_key) DO UPDATE SET state_json = excluded.state_json,
        updated_at = CURRENT_TIMESTAMP
    `).run(JSON.stringify({
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
    }));
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
}

export function listImportedPacks(
  databasePath = resolve('.local/exam-packs.sqlite'),
): PackIndexItem[] {
  const path = resolve(databasePath);
  const database = openPackDatabase(path);
  try {
    return database.prepare(`
      SELECT exam_id AS examId, exam_title AS examTitle, exam_version AS examVersion,
        pack_id AS packId, pack_title AS packTitle, pack_version AS packVersion,
        synthetic, question_count AS questionCount, domain_count AS domainCount,
        content_json AS contentJson, imported_at AS importedAt
      FROM imported_packs
      ORDER BY exam_title, pack_title, pack_version DESC
    `).all().map((row) => ({
      examId: String(row.examId),
      examTitle: String(row.examTitle),
      examVersion: String(row.examVersion),
      packId: String(row.packId),
      packTitle: String(row.packTitle),
      packVersion: String(row.packVersion),
      synthetic: Boolean(row.synthetic),
      questionCount: Number(row.questionCount),
      domainCount: Number(row.domainCount),
      domains: (JSON.parse(String(row.contentJson)) as ExamPack).domains,
      importedAt: String(row.importedAt),
    }));
  } finally {
    database.close();
  }
}

export function getImportedPack(
  examId: string,
  packId: string,
  packVersion: string,
  databasePath = resolve('.local/exam-packs.sqlite'),
): ExamPack | undefined {
  const database = openPackDatabase(databasePath);
  try {
    const row = database.prepare(`
      SELECT content_json AS contentJson FROM imported_packs
      WHERE exam_id = ? AND pack_id = ? AND pack_version = ?
    `).get(examId, packId, packVersion);
    return row ? JSON.parse(String(row.contentJson)) as ExamPack : undefined;
  } finally {
    database.close();
  }
}
