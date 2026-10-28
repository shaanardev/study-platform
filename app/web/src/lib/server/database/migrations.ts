import type { Migration, MigrationProvider } from 'kysely/migration';

import * as initialSchema from '#lib/server/database/migrations/001-initial-schema.js';
import * as queryIndexes from '#lib/server/database/migrations/002-query-indexes.js';

const migrationRegistry = {
  '001-initial-schema': initialSchema,
  '002-query-indexes': queryIndexes,
} satisfies Record<string, Migration>;

export const migrationProvider: MigrationProvider = {
  // oxlint-disable-next-line require-await -- Kysely requires a promise from this static provider.
  getMigrations: async () => migrationRegistry,
};
