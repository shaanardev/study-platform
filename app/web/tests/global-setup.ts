import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import * as Schema from 'effect/Schema';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';

const webDirectory = path.resolve(import.meta.dirname, '..');
const addressSchema = Schema.Struct({ port: Schema.Number });

const serverPort = (server: ViteDevServer): number => {
  if (server.httpServer === null) {
    throw new Error('The Vite dev server did not create an HTTP server.');
  }

  return Schema.decodeUnknownSync(addressSchema)(server.httpServer.address()).port;
};

export default async function globalSetup(): Promise<() => Promise<void>> {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'learning-platform-e2e-'));
  const databasePath = path.join(temporaryDirectory, 'e2e.sqlite');
  const previousDatabasePath = process.env['DB_PATH'];
  const previousBaseURL = process.env['E2E_BASE_URL'];
  let server: ViteDevServer | undefined;

  process.env['DB_PATH'] = databasePath;

  const cleanup = async (): Promise<void> => {
    try {
      await server?.close();
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });

      if (previousDatabasePath === undefined) {
        delete process.env['DB_PATH'];
      } else {
        process.env['DB_PATH'] = previousDatabasePath;
      }

      if (previousBaseURL === undefined) {
        delete process.env['E2E_BASE_URL'];
      } else {
        process.env['E2E_BASE_URL'] = previousBaseURL;
      }
    }
  };

  try {
    server = await createServer({
      configFile: path.join(webDirectory, 'vite.config.ts'),
      mode: 'development',
      root: webDirectory,
      server: { host: '127.0.0.1', port: 0, strictPort: true },
    });
    await server.listen();
    process.env['E2E_BASE_URL'] = `http://127.0.0.1:${serverPort(server)}`;

    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
