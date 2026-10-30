import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import * as Schema from 'effect/Schema';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';

const webDirectory = path.resolve(import.meta.dirname, '..');
const privateFileMode = 0o700;
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
  const previousHerdrEnvironment = process.env['HERDR_ENV'];
  const previousPath = process.env['PATH'];
  let server: ViteDevServer | undefined;

  process.env['DB_PATH'] = databasePath;

  const herdrDirectory = path.join(temporaryDirectory, 'bin');
  const herdrPath = path.join(herdrDirectory, 'herdr');

  const herdrStub = [
    '#!/usr/bin/env node',
    "import { writeFile } from 'node:fs/promises';",
    'const [group, command, , prompt] = process.argv.slice(2);',
    "if (group === 'agent' && command === 'list') {",
    "  const agents = ['first', 'second'].map((name) => ({",
    "    agent: 'codex',",
    "    agent_status: 'idle',",
    '    cwd: process.cwd(),',
    '    interactive_ready: true,',
    '    name: "e2e-" + name,',
    '    pane_id: "e2e-pane-" + name,',
    '    terminal_title: "E2E " + name + " session",',
    '  }));',
    '  process.stdout.write(JSON.stringify({ result: { agents } }));',
    "} else if (group === 'agent' && command === 'prompt') {",
    "  const feedbackId = /^Feedback ID: (.+)$/mu.exec(prompt ?? '')?.[1];",
    "  const receipt = /^Receipt file to create: (.+)$/mu.exec(prompt ?? '')?.[1];",
    '  if (feedbackId === undefined || receipt === undefined) process.exitCode = 1;',
    '  else await writeFile(receipt, feedbackId);',
    '} else {',
    '  process.stdout.write(JSON.stringify({ result: {} }));',
    '}',
    '',
  ].join('\n');

  await mkdir(herdrDirectory, { recursive: true });
  await writeFile(herdrPath, herdrStub, { mode: privateFileMode });
  process.env['PATH'] = `${herdrDirectory}${path.delimiter}${previousPath ?? ''}`;
  process.env['HERDR_ENV'] = '1';

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

      if (previousHerdrEnvironment === undefined) {
        delete process.env['HERDR_ENV'];
      } else {
        process.env['HERDR_ENV'] = previousHerdrEnvironment;
      }

      if (previousPath === undefined) {
        delete process.env['PATH'];
      } else {
        process.env['PATH'] = previousPath;
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
