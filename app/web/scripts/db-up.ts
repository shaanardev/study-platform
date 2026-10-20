import path from 'node:path';

import { createServer } from 'vite';

import type { AppDatabase, DatabasePathGuard } from '../src/lib/server/database/connection.js';

const repositoryRoot = process.cwd();
const webRoot = path.join(repositoryRoot, 'app/web');

const run = async (): Promise<void> => {
  let server: Awaited<ReturnType<typeof createServer>> | undefined;

  try {
    server = await createServer({
      configFile: path.join(webRoot, 'vite.config.ts'),
      root: webRoot,
      server: { middlewareMode: true },
    });
    const pathsModule = await server.ssrLoadModule('/src/lib/server/database/path.ts');
    const connectionModule = await server.ssrLoadModule('/src/lib/server/database/connection.ts');

    // SAFETY: The locally loaded path module exports a string path and its matching guard.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Vite SSR module exports use a dynamic record.
    const { databasePath, assertSafeDatabasePath } = pathsModule as {
      databasePath: string;
      assertSafeDatabasePath: DatabasePathGuard;
    };

    // SAFETY: The locally loaded connection module exports this factory signature.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Vite SSR module exports use a dynamic record.
    const { createDatabase } = connectionModule as {
      createDatabase: (databasePath: string, guard: DatabasePathGuard) => Promise<AppDatabase>;
    };

    const database = await createDatabase(databasePath, assertSafeDatabasePath);
    await database.destroy();
    console.log(`Database is up: ${databasePath}`);
  } finally {
    await server?.close();
  }
};

try {
  await run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
