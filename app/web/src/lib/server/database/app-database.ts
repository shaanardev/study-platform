import { createDatabase } from '#lib/server/database/connection.js';
import type { AppDatabase } from '#lib/server/database/connection.js';
import { databasePath } from '#lib/server/database/path.js';

let appDatabase: AppDatabase | undefined;

/** Called once from SvelteKit's server init hook before requests are served. */
export const initializeAppDatabase = async (): Promise<AppDatabase> => {
  appDatabase ??= await createDatabase(databasePath);
  return appDatabase;
};

/** Return the initialized process-local app store. */
export const getAppDatabase = (): AppDatabase => {
  if (appDatabase === undefined) {
    throw new Error('The app database has not been initialized by the server init hook.');
  }
  return appDatabase;
};

/** Close and clear the process-local app store, primarily for isolated lifecycle tests. */
export const closeAppDatabase = async (): Promise<void> => {
  const database = appDatabase;
  appDatabase = undefined;
  await database?.close();
};
