import path from 'node:path';

import { createServer } from 'vite';

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
    // Vite exposes SSR module exports as Record<string, any>; these exports are defined locally.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Vite SSR module exports have no generic type.
    const { databasePath } = pathsModule as unknown as { databasePath: string };
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Vite SSR module exports have no generic type.
    const { createDatabase } = connectionModule as unknown as {
      createDatabase: (databasePath: string) => Promise<{ close: () => Promise<void> }>;
    };
    const database = await createDatabase(databasePath);
    await database.close();
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
