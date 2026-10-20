import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { Kysely, ParseJSONResultsPlugin, SqliteDialect } from 'kysely';
import { Migrator } from 'kysely/migration';

import { migrationProvider } from '#lib/server/database/migrations.js';
import { assertPathNotProtected } from '#lib/server/database/path.js';
import type { AppDatabaseSchema } from '#lib/server/database/types.js';
import { workspacePath } from '#lib/server/workspace-paths.js';

const migrationTableName = 'kysely_migration';

const jsonResultAliases = new Set([
  'content',
  'domain_ids',
  'question_ids',
  'question_snapshot',
  'answer_ids',
  'flags',
  'correction',
]);

export type AppDatabase = Kysely<AppDatabaseSchema>;

export type DatabasePathGuard = (input: string) => string;

const assertSafeFactoryPath: DatabasePathGuard = (input) =>
  assertPathNotProtected(input, workspacePath());

const hasMigrationTable = (sqlite: BetterSqlite3.Database): boolean =>
  sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(migrationTableName) !== undefined;

const rejectUnknownMigrations = async (sqlite: BetterSqlite3.Database): Promise<void> => {
  if (!hasMigrationTable(sqlite)) {
    return;
  }

  const registered = new Set(Object.keys(await migrationProvider.getMigrations()));

  const applied = sqlite
    .prepare(`SELECT name FROM ${migrationTableName}`)
    .pluck()
    .all()
    .map(String);

  const unknown = applied.filter((name) => !registered.has(name));

  if (unknown.length > 0) {
    throw new Error(
      `Database migration history contains unknown or newer migration${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}. Update the application before opening this database.`,
    );
  }
};

const migrateToLatest = async (db: Kysely<AppDatabaseSchema>): Promise<void> => {
  const migrator = new Migrator({ db, provider: migrationProvider });
  const result = await migrator.migrateToLatest();

  if (result.error !== undefined) {
    throw new Error('Could not apply pending database migrations.', { cause: result.error });
  }
};

/** Open a fresh Kysely store and apply its registered migrations. */
export const createDatabase = async (
  databasePath: string,
  assertSafePath: DatabasePathGuard = assertSafeFactoryPath,
): Promise<AppDatabase> => {
  if (!path.isAbsolute(databasePath)) {
    throw new Error('createDatabase(path) requires an absolute SQLite path.');
  }

  const safeDatabasePath = assertSafePath(databasePath);
  await mkdir(path.dirname(safeDatabasePath), { recursive: true });

  const sqlite = new BetterSqlite3(safeDatabasePath);
  sqlite.pragma('foreign_keys = ON');

  const db = new Kysely<AppDatabaseSchema>({
    dialect: new SqliteDialect({ database: sqlite }),
    plugins: [
      new ParseJSONResultsPlugin({
        shouldParse: (_value, jsonPath) => {
          const match = /^\$\[\d+\]\."(?<alias>[^"]+)"$/u.exec(jsonPath);

          return match !== null && jsonResultAliases.has(match.groups?.['alias'] ?? '');
        },
      }),
    ],
  });

  try {
    await rejectUnknownMigrations(sqlite);
    await migrateToLatest(db);
  } catch (error) {
    await db.destroy();
    throw error;
  }

  return db;
};
