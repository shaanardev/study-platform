import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeEach } from 'vitest';

import { closeAppDatabase, initializeAppDatabase } from '#lib/server/database/app-database.js';

/** Give each test a fresh application database and a directory for related files. */
export const useTestDatabase = (seed?: () => Promise<void>) => {
  let directory = '';

  beforeEach(async () => {
    const testDirectory = await mkdtemp(path.join(tmpdir(), 'learning-platform-test-'));
    directory = testDirectory;

    const cleanup = async () => {
      try {
        await closeAppDatabase();
      } finally {
        await rm(testDirectory, { force: true, recursive: true });
      }
    };

    try {
      await initializeAppDatabase(path.join(testDirectory, 'app.sqlite'));
      await seed?.();
    } catch (error) {
      await cleanup();
      throw error;
    }

    return cleanup;
  });

  return {
    get directory() {
      return directory;
    },
  };
};
